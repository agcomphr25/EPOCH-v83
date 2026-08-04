import crypto from 'crypto';

import { Router, type Request } from 'express';
import { z } from 'zod';

import { pool } from '../../db';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import {
  calculateReadiness,
  canTransition,
  checksum,
  deriveExecutionResult,
  hasMeaningfulNotes,
  packageReadinessBlockers,
  productionIdentifierStatus,
  type PackageReadinessItem,
  type ReadinessCounts,
  type ValidationStatus,
} from '../services/epochSoftwareValidation';
import {
  responsibilityDecisionIdentityError,
  responsibilityDecisionSchema,
} from '../services/epochValidationResponsibilityDecision';

const router = Router();
router.use(authenticateToken);
const uuid = z.string().uuid();
type Query = (sql: string, params?: unknown[]) => Promise<any[]>;
const query: Query = async (sql, params = []) =>
  (await pool.query(sql, params as any[])).rows;
async function tx<T>(work: (q: Query) => Promise<T>) {
  const client = await pool.connect();
  const q: Query = async (sql, params = []) =>
    (await client.query(sql, params as any[])).rows;
  try {
    await client.query('BEGIN');
    const value = await work(q);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
const actor = (req: Request) => {
  const u = req.user as any;
  return {
    id: Number(u.id),
    employeeId: u.employeeId ? Number(u.employeeId) : null,
    name: String(u.displayName || u.name || u.username),
    role: String(u.role),
  };
};
const isLocked = (p: any) =>
  Boolean(p.locked_at) ||
  [
    'APPROVED_FOR_INTENDED_USE',
    'APPROVED_WITH_LIMITATIONS',
    'SUPERSEDED',
    'VOID_DUPLICATE',
  ].includes(p.status);
const getPackage = async (id: string, q: Query = query) =>
  (await q('SELECT * FROM qms_epoch_validation_packages WHERE id=$1', [id]))[0];
async function logEvent(
  req: Request,
  p: any,
  entityType: string,
  action: string,
  options: {
    entityId?: string;
    previous?: unknown;
    next?: unknown;
    reason?: string;
  } = {},
  q: Query = query
) {
  const a = actor(req);
  await q(
    `INSERT INTO qms_epoch_validation_events
    (package_id,entity_type,entity_id,action,actor_user_id,actor_display_name,actor_role,
     previous_value,new_value,reason,package_revision)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)`,
    [
      p.id,
      entityType,
      options.entityId || null,
      action,
      a.id,
      a.name,
      a.role,
      options.previous ? JSON.stringify(options.previous) : null,
      options.next ? JSON.stringify(options.next) : null,
      options.reason || null,
      p.revision,
    ]
  );
}
async function invalidateApprovals(
  packageId: string,
  reason: string,
  q: Query = query
) {
  await q(
    `UPDATE qms_epoch_validation_approvals SET status='INVALIDATED',invalidated_at=now(),invalidation_reason=$2
    WHERE package_id=$1 AND status='VALID'`,
    [packageId, reason]
  );
}
async function editable(req: Request, res: any) {
  const p = await getPackage(uuid.parse(req.params.id || req.params.packageId));
  if (!p) {
    res.status(404).json({ error: 'VALIDATION_PACKAGE_NOT_FOUND' });
    return null;
  }
  if (isLocked(p)) {
    res.status(409).json({
      error: 'VALIDATION_PACKAGE_LOCKED',
      message: 'Approved packages are immutable. Use controlled reopening.',
    });
    return null;
  }
  return p;
}

const optionalCreateDate = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().date().optional()
);
const optionalCreateUuid = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().uuid().optional()
);

const createSchema = z.object({
  title: z.string().min(3).max(240),
  systemName: z.string().min(1).default('EPOCH'),
  validationType: z.enum([
    'INITIAL_INTENDED_USE',
    'MAJOR_RELEASE',
    'CRITICAL_CHANGE',
    'DATABASE_MIGRATION',
    'SECURITY_ACCESS_CONTROL',
    'BACKUP_RECOVERY',
    'PERIODIC_REVIEW',
    'PRE_AUDIT_REVALIDATION',
    'CORRECTIVE_REVALIDATION',
  ]),
  productionVersion: z.string().min(1),
  commitOrReleaseIdentifier: z.string().max(240).optional(),
  productionDeploymentDate: optionalCreateDate,
  validationEnvironment: z.string().min(1),
  productionEnvironmentReference: z.string().min(1),
  databaseProvider: z.string().min(1),
  hostingProvider: z.string().min(1),
  softwareOwnerEmployeeId: z.number().int().positive().optional(),
  qualityOwnerEmployeeId: z.number().int().positive().optional(),
  validationLeadEmployeeId: z.number().int().positive().optional(),
  plannedStartDate: z.string().date(),
  plannedCompletionDate: z.string().date(),
  reasonForValidation: z.string().min(3),
  previousApprovedPackageId: optionalCreateUuid,
  auditReadinessAssessmentId: optionalCreateUuid,
  notes: z.string().max(20000).optional(),
});
router.get(
  '/',
  requirePermission('EPOCH_VALIDATION_VIEW'),
  async (_req, res) => {
    res.json(
      await query(`SELECT p.*,
    (SELECT count(*)::int FROM qms_epoch_validation_requirements r WHERE r.package_id=p.id) requirement_count,
    (SELECT count(*)::int FROM qms_epoch_validation_executions e WHERE e.package_id=p.id) execution_count,
    (SELECT count(*)::int FROM qms_epoch_validation_defects d WHERE d.package_id=p.id AND d.status NOT IN ('CLOSED','CANCELLED')) open_defect_count
    FROM qms_epoch_validation_packages p ORDER BY p.created_at DESC`)
    );
  }
);
router.post(
  '/',
  requirePermission('EPOCH_VALIDATION_CREATE'),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    const key = z.string().uuid().safeParse(req.header('Idempotency-Key'));
    if (!key.success)
      return res.status(400).json({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A unique Idempotency-Key is required for package creation.',
      });
    const v = parsed.data,
      a = actor(req),
      requestHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(v))
        .digest('hex');
    const result = await tx(async (q) => {
      const claimed = await q(
        `INSERT INTO qms_epoch_validation_create_requests
      (operation,actor_user_id,idempotency_key,request_hash)
      VALUES('CREATE_PACKAGE',$1,$2,$3) ON CONFLICT (operation,actor_user_id,idempotency_key) DO NOTHING RETURNING id`,
        [a.id, key.data, requestHash]
      );
      const request = (
        await q(
          `SELECT * FROM qms_epoch_validation_create_requests
      WHERE operation='CREATE_PACKAGE' AND actor_user_id=$1 AND idempotency_key=$2 FOR UPDATE`,
          [a.id, key.data]
        )
      )[0];
      if (request.request_hash !== requestHash)
        return { conflict: true as const };
      if (!claimed.length) {
        const existing = (
          await q(
            `SELECT p.* FROM qms_epoch_validation_packages p
        JOIN qms_epoch_validation_create_requests r ON r.package_id=p.id WHERE r.id=$1`,
            [request.id]
          )
        )[0];
        if (existing)
          return { package: existing, replay: true, conflict: false as const };
      }
      const seq = (
        await q(
          `SELECT nextval('qms_epoch_validation_package_number_seq') value`
        )
      )[0].value;
      const number = `ESV-${new Date().getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
      const p = (
        await q(
          `INSERT INTO qms_epoch_validation_packages
      (package_number,title,system_name,validation_type,production_version,commit_or_release_identifier,
       production_deployment_date,validation_environment,production_environment_reference,database_provider,
       hosting_provider,software_owner_employee_id,quality_owner_employee_id,validation_lead_employee_id,
       planned_start_date,planned_completion_date,reason_for_validation,previous_approved_package_id,
       audit_readiness_assessment_id,notes,created_by_user_id,created_by_display_name,updated_by_user_id,updated_by_display_name)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$21,$22) RETURNING *`,
          [
            number,
            v.title,
            v.systemName,
            v.validationType,
            v.productionVersion,
            v.commitOrReleaseIdentifier || null,
            v.productionDeploymentDate || null,
            v.validationEnvironment,
            v.productionEnvironmentReference,
            v.databaseProvider,
            v.hostingProvider,
            v.softwareOwnerEmployeeId || null,
            v.qualityOwnerEmployeeId || null,
            v.validationLeadEmployeeId || null,
            v.plannedStartDate,
            v.plannedCompletionDate,
            v.reasonForValidation,
            v.previousApprovedPackageId || null,
            v.auditReadinessAssessmentId || null,
            v.notes || null,
            a.id,
            a.name,
          ]
        )
      )[0];
      await logEvent(
        req,
        p,
        'PACKAGE',
        'PACKAGE_CREATED',
        {
          next: {
            packageNumber: number,
            productionVersion: v.productionVersion,
          },
        },
        q
      );
      await q(
        `UPDATE qms_epoch_validation_create_requests SET package_id=$1,completed_at=now() WHERE id=$2`,
        [p.id, request.id]
      );
      return { package: p, replay: false, conflict: false as const };
    });
    if (result.conflict)
      return res.status(409).json({
        error: 'IDEMPOTENCY_KEY_REUSE_CONFLICT',
        message:
          'This idempotency key was already used with a different package payload.',
      });
    res.status(result.replay ? 200 : 201).json(result.package);
  }
);

router.post(
  '/:id/void-duplicate',
  requirePermission('EPOCH_VALIDATION_ADMIN'),
  async (req, res) => {
    const p = await getPackage(uuid.parse(req.params.id));
    if (!p)
      return res.status(404).json({ error: 'VALIDATION_PACKAGE_NOT_FOUND' });
    if (p.status !== 'DRAFT')
      return res.status(409).json({ error: 'DUPLICATE_VOID_DRAFT_ONLY' });
    const body = z
        .object({ reason: z.string().trim().min(10).max(2000) })
        .parse(req.body),
      a = actor(req);
    const updated = await tx(async (q) => {
      const locked = (
        await q(
          `SELECT * FROM qms_epoch_validation_packages WHERE id=$1 FOR UPDATE`,
          [p.id]
        )
      )[0];
      if (locked.status !== 'DRAFT') return null;
      const next = (
        await q(
          `UPDATE qms_epoch_validation_packages SET status='VOID_DUPLICATE',locked_at=now(),
      row_version=row_version+1,revision=revision+1,updated_by_user_id=$2,updated_by_display_name=$3,updated_at=now()
      WHERE id=$1 RETURNING *`,
          [p.id, a.id, a.name]
        )
      )[0];
      await logEvent(
        req,
        next,
        'PACKAGE',
        'PACKAGE_VOIDED_DUPLICATE',
        { previous: p.status, next: 'VOID_DUPLICATE', reason: body.reason },
        q
      );
      return next;
    });
    if (!updated)
      return res.status(409).json({ error: 'DUPLICATE_VOID_DRAFT_ONLY' });
    res.json(updated);
  }
);

async function packageReadiness(p: any): Promise<{
  items: PackageReadinessItem[];
  executionReady: boolean;
  blockers: any[];
}> {
  const identifier = productionIdentifierStatus(p.commit_or_release_identifier);
  const facts = (
    await query(
      `SELECT
    EXISTS(SELECT 1 FROM qms_epoch_validation_intended_use_revisions u WHERE u.package_id=$1
      AND nullif(trim(u.intended_use_statement),'') IS NOT NULL) intended_use,
    EXISTS(SELECT 1 FROM qms_epoch_validation_risks r WHERE r.package_id=$1) risk_exists,
    EXISTS(SELECT 1 FROM qms_epoch_validation_protocols x WHERE x.package_id=$1) protocols_exist,
    NOT EXISTS(SELECT 1 FROM qms_epoch_validation_protocols x WHERE x.package_id=$1 AND
      (nullif(trim(x.overall_acceptance_criteria),'') IS NULL OR
       NOT EXISTS(SELECT 1 FROM qms_epoch_validation_protocol_steps s WHERE s.protocol_id=x.id) OR
       EXISTS(SELECT 1 FROM qms_epoch_validation_protocol_steps s WHERE s.protocol_id=x.id
         AND nullif(trim(s.expected_result),'') IS NULL))) protocols_complete,
    EXISTS(SELECT 1 FROM qms_audit_readiness_assessments a WHERE a.id=$2) assessment_exists`,
      [p.id, p.audit_readiness_assessment_id || null]
    )
  )[0];
  const item = (
    key: string,
    label: string,
    state: PackageReadinessItem['state'],
    field: string,
    message?: string
  ): PackageReadinessItem => ({ key, label, state, field, message });
  const items = [
    item(
      'PRODUCTION_IDENTIFIER',
      'Exact production identifier',
      identifier.valid ? 'COMPLETE' : 'MISSING',
      'commitOrReleaseIdentifier',
      identifier.code === 'PRODUCTION_IDENTIFIER_AMBIGUOUS'
        ? 'A pull-request number alone does not uniquely identify the deployed build.'
        : 'Enter a full commit SHA, controlled release tag, or documented deployment ID.'
    ),
    item(
      'DEPLOYMENT_CONFIRMATION',
      'Deployment-date confirmation',
      p.deployment_date_confirmed ? 'COMPLETE' : 'REQUIRES_CONFIRMATION',
      'deploymentDateConfirmed'
    ),
    item(
      'SOFTWARE_OWNER',
      'Software owner',
      p.software_owner_employee_id ? 'COMPLETE' : 'MISSING',
      'softwareOwnerEmployeeId',
      'Assign an active Software owner.'
    ),
    item(
      'QUALITY_OWNER',
      'Quality owner',
      p.quality_owner_employee_id ? 'COMPLETE' : 'MISSING',
      'qualityOwnerEmployeeId',
      'Assign an active Quality owner.'
    ),
    item(
      'VALIDATION_LEAD',
      'Validation lead',
      p.validation_lead_employee_id ? 'COMPLETE' : 'MISSING',
      'validationLeadEmployeeId',
      'Assign an active Validation lead.'
    ),
    item(
      'INTENDED_USE',
      'Intended-use statement',
      facts.intended_use ? 'COMPLETE' : 'MISSING',
      'intendedUse'
    ),
    item(
      'VALIDATION_REASON',
      'Reason for validation',
      String(p.reason_for_validation || '').trim().length >= 3
        ? 'COMPLETE'
        : 'MISSING',
      'reasonForValidation'
    ),
    item(
      'VALIDATION_ENVIRONMENT',
      'Validation-environment reference',
      String(p.validation_environment || '').trim() ? 'COMPLETE' : 'MISSING',
      'validationEnvironment'
    ),
    item(
      'PRODUCTION_ENVIRONMENT',
      'Production-environment reference',
      String(p.production_environment_reference || '').trim()
        ? 'COMPLETE'
        : 'MISSING',
      'productionEnvironmentReference'
    ),
    item(
      'ENVIRONMENT_CONFIRMATION',
      'Environment-separation confirmation',
      p.environment_separation_confirmed ? 'COMPLETE' : 'REQUIRES_CONFIRMATION',
      'environmentSeparationConfirmed'
    ),
    item(
      'ENVIRONMENT_DIFFERENCES',
      'Environment-differences statement',
      String(p.environment_differences || '').trim().length >= 10
        ? 'COMPLETE'
        : 'MISSING',
      'environmentDifferences'
    ),
    item(
      'NOTES',
      'Meaningful notes',
      hasMeaningfulNotes(p.notes) ? 'COMPLETE' : 'MISSING',
      'notes'
    ),
    item(
      'AUDIT_READINESS',
      'Audit-readiness assessment or justified N/A',
      facts.assessment_exists
        ? 'COMPLETE'
        : p.audit_readiness_not_applicable && p.audit_readiness_na_approved_at
          ? 'NOT_APPLICABLE'
          : 'MISSING',
      'auditReadinessAssessmentId'
    ),
    item(
      'RISK_ASSESSMENT',
      'Risk assessment',
      facts.risk_exists ? 'COMPLETE' : 'MISSING',
      'riskAssessment'
    ),
    item(
      'VALIDATION_PROTOCOLS',
      'Validation protocols',
      facts.protocols_exist ? 'COMPLETE' : 'MISSING',
      'protocols'
    ),
    item(
      'EXPECTED_RESULTS',
      'Expected results',
      facts.protocols_exist && facts.protocols_complete
        ? 'COMPLETE'
        : 'MISSING',
      'protocols'
    ),
    item(
      'ACCEPTANCE_CRITERIA',
      'Acceptance criteria',
      facts.protocols_exist && facts.protocols_complete
        ? 'COMPLETE'
        : 'MISSING',
      'protocols'
    ),
  ];
  const blockers = packageReadinessBlockers(items);
  return { items, executionReady: blockers.length === 0, blockers };
}

const packageUpdateSchema = z.object({
  rowVersion: z.number().int().positive(),
  commitOrReleaseIdentifier: z.string().max(240).nullable().optional(),
  productionDeploymentDate: z.string().date().nullable().optional(),
  validationEnvironment: z.string().min(1).optional(),
  productionEnvironmentReference: z.string().min(1).optional(),
  environmentDifferences: z.string().max(10000).nullable().optional(),
  softwareOwnerEmployeeId: z.number().int().positive().nullable().optional(),
  qualityOwnerEmployeeId: z.number().int().positive().nullable().optional(),
  validationLeadEmployeeId: z.number().int().positive().nullable().optional(),
  auditReadinessAssessmentId: z.string().uuid().nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
});
router.patch(
  '/:id',
  requirePermission('EPOCH_VALIDATION_EDIT'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const v = packageUpdateSchema.parse(req.body),
      a = actor(req);
    const ownerIds = [
      v.softwareOwnerEmployeeId,
      v.qualityOwnerEmployeeId,
      v.validationLeadEmployeeId,
    ].filter((x): x is number => Boolean(x));
    if (ownerIds.length) {
      const active = await query(
        `SELECT id FROM employees WHERE id=ANY($1::int[]) AND is_active=true`,
        [ownerIds]
      );
      const activeIds = new Set(active.map((x) => Number(x.id))),
        invalid = ownerIds.filter((x) => !activeIds.has(x));
      if (invalid.length)
        return res
          .status(409)
          .json({ error: 'INACTIVE_EMPLOYEE_ASSIGNMENT', fields: invalid });
    }
    if (
      v.auditReadinessAssessmentId &&
      !(
        await query(
          `SELECT 1 FROM qms_audit_readiness_assessments WHERE id=$1`,
          [v.auditReadinessAssessmentId]
        )
      ).length
    )
      return res.status(409).json({
        error: 'AUDIT_READINESS_ASSESSMENT_NOT_FOUND',
        field: 'auditReadinessAssessmentId',
      });
    const identifierChanged =
      v.commitOrReleaseIdentifier !== undefined &&
      v.commitOrReleaseIdentifier !== p.commit_or_release_identifier;
    const dateChanged =
      v.productionDeploymentDate !== undefined &&
      v.productionDeploymentDate !== p.production_deployment_date;
    const updated = (
      await query(
        `UPDATE qms_epoch_validation_packages SET
    commit_or_release_identifier=CASE WHEN $1 THEN $2 ELSE commit_or_release_identifier END,
    production_deployment_date=CASE WHEN $3 THEN $4::date ELSE production_deployment_date END,
    validation_environment=COALESCE($5,validation_environment),production_environment_reference=COALESCE($6,production_environment_reference),
    environment_differences=CASE WHEN $7 THEN $8 ELSE environment_differences END,
    software_owner_employee_id=CASE WHEN $9 THEN $10 ELSE software_owner_employee_id END,
    quality_owner_employee_id=CASE WHEN $11 THEN $12 ELSE quality_owner_employee_id END,
    validation_lead_employee_id=CASE WHEN $13 THEN $14 ELSE validation_lead_employee_id END,
    audit_readiness_assessment_id=CASE WHEN $15 THEN $16::uuid ELSE audit_readiness_assessment_id END,
    audit_readiness_not_applicable=CASE WHEN $15 AND $16::uuid IS NOT NULL THEN false ELSE audit_readiness_not_applicable END,
    notes=CASE WHEN $17 THEN $18 ELSE notes END,
    deployment_date_confirmed=CASE WHEN $19 THEN false ELSE deployment_date_confirmed END,
    deployment_date_confirmed_by_user_id=CASE WHEN $19 THEN NULL ELSE deployment_date_confirmed_by_user_id END,
    deployment_date_confirmed_by_display_name=CASE WHEN $19 THEN NULL ELSE deployment_date_confirmed_by_display_name END,
    deployment_date_confirmed_at=CASE WHEN $19 THEN NULL ELSE deployment_date_confirmed_at END,
    row_version=row_version+1,revision=revision+1,updated_by_user_id=$20,updated_by_display_name=$21,updated_at=now()
    WHERE id=$22 AND row_version=$23 RETURNING *`,
        [
          v.commitOrReleaseIdentifier !== undefined,
          v.commitOrReleaseIdentifier ?? null,
          v.productionDeploymentDate !== undefined,
          v.productionDeploymentDate ?? null,
          v.validationEnvironment,
          v.productionEnvironmentReference,
          v.environmentDifferences !== undefined,
          v.environmentDifferences ?? null,
          v.softwareOwnerEmployeeId !== undefined,
          v.softwareOwnerEmployeeId ?? null,
          v.qualityOwnerEmployeeId !== undefined,
          v.qualityOwnerEmployeeId ?? null,
          v.validationLeadEmployeeId !== undefined,
          v.validationLeadEmployeeId ?? null,
          v.auditReadinessAssessmentId !== undefined,
          v.auditReadinessAssessmentId ?? null,
          v.notes !== undefined,
          v.notes ?? null,
          identifierChanged || dateChanged,
          a.id,
          a.name,
          p.id,
          v.rowVersion,
        ]
      )
    )[0];
    if (!updated) return res.status(409).json({ error: 'STALE_RECORD' });
    await invalidateApprovals(p.id, 'Validation package fields changed');
    await logEvent(req, updated, 'PACKAGE', 'PACKAGE_FIELDS_UPDATED', {
      previous: p,
      next: updated,
    });
    res.json({ package: updated, readiness: await packageReadiness(updated) });
  }
);
router.post(
  '/:id/confirm-deployment-date',
  requirePermission('EPOCH_VALIDATION_EDIT'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const a = actor(req);
    if (
      !productionIdentifierStatus(p.commit_or_release_identifier).valid ||
      !p.production_deployment_date
    )
      return res.status(409).json({
        error: 'DEPLOYMENT_CONFIRMATION_BLOCKED',
        fields: ['commitOrReleaseIdentifier', 'productionDeploymentDate'],
      });
    const updated = (
      await query(
        `UPDATE qms_epoch_validation_packages SET deployment_date_confirmed=true,
    deployment_date_confirmed_by_user_id=$1,deployment_date_confirmed_by_display_name=$2,deployment_date_confirmed_at=now(),
    row_version=row_version+1,updated_by_user_id=$1,updated_by_display_name=$2,updated_at=now() WHERE id=$3 RETURNING *`,
        [a.id, a.name, p.id]
      )
    )[0];
    await logEvent(req, updated, 'PACKAGE', 'DEPLOYMENT_DATE_CONFIRMED', {
      next: { confirmed: true },
    });
    res.json(updated);
  }
);
router.post(
  '/:id/confirm-environment-separation',
  requirePermission('EPOCH_VALIDATION_EDIT'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const a = actor(req);
    if (String(p.environment_differences || '').trim().length < 10)
      return res.status(409).json({
        error: 'ENVIRONMENT_DIFFERENCES_REQUIRED',
        field: 'environmentDifferences',
      });
    const updated = (
      await query(
        `UPDATE qms_epoch_validation_packages SET environment_separation_confirmed=true,
    environment_separation_confirmed_by_user_id=$1,environment_separation_confirmed_by_display_name=$2,environment_separation_confirmed_at=now(),
    row_version=row_version+1,updated_by_user_id=$1,updated_by_display_name=$2,updated_at=now() WHERE id=$3 RETURNING *`,
        [a.id, a.name, p.id]
      )
    )[0];
    await logEvent(
      req,
      updated,
      'PACKAGE',
      'ENVIRONMENT_SEPARATION_CONFIRMED',
      { next: { confirmed: true } }
    );
    res.json(updated);
  }
);
router.post(
  '/:id/audit-readiness-na',
  requirePermission('EPOCH_VALIDATION_FINAL_APPROVE'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const body = z
        .object({ justification: z.string().min(20) })
        .parse(req.body),
      a = actor(req);
    if (p.audit_readiness_assessment_id)
      return res.status(409).json({ error: 'ASSESSMENT_ALREADY_LINKED' });
    const updated = (
      await query(
        `UPDATE qms_epoch_validation_packages SET audit_readiness_not_applicable=true,
    audit_readiness_na_justification=$1,audit_readiness_na_approved_by_user_id=$2,audit_readiness_na_approved_by_display_name=$3,
    audit_readiness_na_approved_at=now(),row_version=row_version+1,updated_by_user_id=$2,updated_by_display_name=$3,updated_at=now()
    WHERE id=$4 RETURNING *`,
        [body.justification, a.id, a.name, p.id]
      )
    )[0];
    await logEvent(
      req,
      updated,
      'PACKAGE',
      'AUDIT_READINESS_NOT_APPLICABLE_APPROVED',
      { reason: body.justification }
    );
    res.json(updated);
  }
);

async function counts(packageId: string): Promise<ReadinessCounts> {
  const r = (
    await query(
      `SELECT
    EXISTS(SELECT 1 FROM qms_epoch_validation_intended_use_revisions u WHERE u.package_id=$1 AND u.approval_status='APPROVED') intended_use,
    EXISTS(SELECT 1 FROM qms_epoch_validation_requirements x WHERE x.package_id=$1) AND
      NOT EXISTS(SELECT 1 FROM qms_epoch_validation_requirements x WHERE x.package_id=$1 AND x.status<>'APPROVED') requirements_approved,
    EXISTS(SELECT 1 FROM qms_epoch_validation_risks x WHERE x.package_id=$1) AND
      NOT EXISTS(SELECT 1 FROM qms_epoch_validation_risks x WHERE x.package_id=$1 AND
        (x.status<>'APPROVED' OR (x.residual_risk_level IN ('CRITICAL','HIGH') AND NOT x.risk_accepted))) risks_approved,
    EXISTS(SELECT 1 FROM qms_epoch_validation_plans x WHERE x.package_id=$1 AND x.status='APPROVED') plan_approved,
    (SELECT count(*)::int FROM qms_epoch_validation_requirements x WHERE x.package_id=$1 AND x.criticality='CRITICAL') critical_requirements,
    (SELECT count(DISTINCT pr.requirement_id)::int FROM qms_epoch_validation_protocol_requirements pr
      JOIN qms_epoch_validation_protocols p ON p.id=pr.protocol_id
      JOIN qms_epoch_validation_requirements x ON x.id=pr.requirement_id
      JOIN qms_epoch_validation_executions e ON e.protocol_id=p.id
      WHERE x.package_id=$1 AND x.criticality='CRITICAL' AND e.overall_result IN ('PASSED','PASSED_WITH_APPROVED_DEVIATION')) critical_requirements_tested,
    (SELECT count(*)::int FROM qms_epoch_validation_protocols x WHERE x.package_id=$1 AND x.criticality='CRITICAL' AND x.status='APPROVED') critical_tests,
    (SELECT count(DISTINCT e.protocol_id)::int FROM qms_epoch_validation_executions e JOIN qms_epoch_validation_protocols p ON p.id=e.protocol_id
      WHERE e.package_id=$1 AND p.criticality='CRITICAL' AND e.overall_result IN ('PASSED','PASSED_WITH_APPROVED_DEVIATION') AND e.review_decision='APPROVED') critical_tests_passed,
    (SELECT count(*)::int FROM qms_epoch_validation_defects x WHERE x.package_id=$1 AND x.severity='CRITICAL' AND x.status NOT IN ('CLOSED','CANCELLED')) open_critical,
    (SELECT count(*)::int FROM qms_epoch_validation_defects x WHERE x.package_id=$1 AND x.severity='HIGH' AND x.status NOT IN ('CLOSED','CANCELLED')) open_high,
    (SELECT count(*)::int FROM qms_epoch_validation_defects x WHERE x.package_id=$1 AND x.severity='HIGH' AND x.status NOT IN ('CLOSED','CANCELLED') AND x.limitation_accepted) accepted_high,
    (SELECT count(*)::int FROM qms_epoch_validation_defects x WHERE x.package_id=$1 AND x.retest_required) required_retests,
    (SELECT count(*)::int FROM qms_epoch_validation_defects x JOIN qms_epoch_validation_executions e ON e.id=x.retest_execution_id
      WHERE x.package_id=$1 AND x.retest_required AND e.overall_result IN ('PASSED','PASSED_WITH_APPROVED_DEVIATION') AND e.review_decision='APPROVED') passed_retests,
    EXISTS(SELECT 1 FROM qms_epoch_validation_protocols p JOIN qms_epoch_validation_executions e ON e.protocol_id=p.id
      WHERE p.package_id=$1 AND lower(p.title) LIKE '%backup%' AND e.overall_result='PASSED' AND e.review_decision='APPROVED') backup_passed,
    EXISTS(SELECT 1 FROM qms_epoch_validation_protocols p JOIN qms_epoch_validation_executions e ON e.protocol_id=p.id
      WHERE p.package_id=$1 AND lower(p.title) LIKE '%restore%' AND e.overall_result='PASSED' AND e.review_decision='APPROVED') restore_passed,
    EXISTS(SELECT 1 FROM qms_epoch_validation_protocols p JOIN qms_epoch_validation_executions e ON e.protocol_id=p.id
      WHERE p.package_id=$1 AND (lower(p.title) LIKE '%outage%' OR lower(p.title) LIKE '%recovery drill%') AND e.overall_result='PASSED' AND e.review_decision='APPROVED') outage_passed,
    NOT EXISTS(SELECT 1 FROM qms_epoch_validation_approvals a WHERE a.package_id=$1 AND a.status='INVALIDATED') AND
      (SELECT count(DISTINCT approval_role) FROM qms_epoch_validation_approvals a WHERE a.package_id=$1 AND a.record_type='FINAL' AND a.status='VALID' AND a.decision='APPROVED')>=3 approvals_current,
    EXISTS(SELECT 1 FROM qms_epoch_validation_packages p WHERE p.id=$1 AND nullif(trim(p.production_version),'') IS NOT NULL) version_identified`,
      [packageId]
    )
  )[0];
  return {
    intendedUseApproved: r.intended_use,
    requirementsBaselineApproved: r.requirements_approved,
    riskAssessmentApproved: r.risks_approved,
    validationPlanApproved: r.plan_approved,
    criticalRequirements: r.critical_requirements,
    criticalRequirementsTested: r.critical_requirements_tested,
    criticalTests: r.critical_tests,
    criticalTestsPassed: r.critical_tests_passed,
    openCriticalDefects: r.open_critical,
    openHighDefects: r.open_high,
    acceptedHighDefects: r.accepted_high,
    requiredRetests: r.required_retests,
    passedRetests: r.passed_retests,
    backupPassed: r.backup_passed,
    restorePassed: r.restore_passed,
    outageDrillPassed: r.outage_passed,
    approvalsCurrent: r.approvals_current,
    exactProductionVersionIdentified: r.version_identified,
  };
}
async function detail(packageId: string) {
  const p = await getPackage(packageId);
  if (!p) return null;
  const [
    intendedUse,
    intendedUseFunctions,
    responsibilities,
    requirements,
    risks,
    plans,
    protocols,
    executions,
    defects,
    approvals,
    reviews,
    events,
  ] = await Promise.all([
    query(
      'SELECT * FROM qms_epoch_validation_intended_use_revisions WHERE package_id=$1 ORDER BY revision DESC',
      [packageId]
    ),
    query(
      `SELECT f.* FROM qms_epoch_validation_intended_use_functions f
       JOIN qms_epoch_validation_intended_use_revisions u ON u.id=f.intended_use_revision_id
       WHERE f.package_id=$1 AND u.approval_status<>'SUPERSEDED'
       ORDER BY f.function_key`,
      [packageId]
    ),
    query(
      `SELECT r.*,e.name employee_name,e.department,e.position
       FROM qms_epoch_validation_responsibilities r
       JOIN employees e ON e.id=r.employee_id
       WHERE r.package_id=$1 AND r.active=true
       ORDER BY r.responsibility_role,e.name`,
      [packageId]
    ),
    query(
      'SELECT * FROM qms_epoch_validation_requirements WHERE package_id=$1 ORDER BY requirement_id',
      [packageId]
    ),
    query(
      'SELECT * FROM qms_epoch_validation_risks WHERE package_id=$1 ORDER BY risk_id',
      [packageId]
    ),
    query(
      'SELECT * FROM qms_epoch_validation_plans WHERE package_id=$1 ORDER BY revision DESC',
      [packageId]
    ),
    query(
      `SELECT p.*,(SELECT count(*)::int FROM qms_epoch_validation_protocol_steps s WHERE s.protocol_id=p.id) step_count
      FROM qms_epoch_validation_protocols p WHERE package_id=$1 ORDER BY test_id`,
      [packageId]
    ),
    query(
      'SELECT * FROM qms_epoch_validation_executions WHERE package_id=$1 ORDER BY created_at DESC',
      [packageId]
    ),
    query(
      'SELECT * FROM qms_epoch_validation_defects WHERE package_id=$1 ORDER BY created_at DESC',
      [packageId]
    ),
    query(
      'SELECT * FROM qms_epoch_validation_approvals WHERE package_id=$1 ORDER BY decided_at DESC',
      [packageId]
    ),
    query(
      'SELECT * FROM qms_epoch_validation_periodic_reviews WHERE package_id=$1 ORDER BY review_date DESC',
      [packageId]
    ),
    query(
      'SELECT * FROM qms_epoch_validation_events WHERE package_id=$1 ORDER BY created_at DESC LIMIT 250',
      [packageId]
    ),
  ]);
  const c = await counts(packageId),
    r = calculateReadiness(c);
  return {
    package: p,
    intendedUse,
    intendedUseFunctions,
    responsibilities,
    requirements,
    risks,
    plans,
    protocols,
    executions,
    defects,
    approvals,
    periodicReviews: reviews,
    events,
    readiness: { ...c, ...r },
    packageReadiness: await packageReadiness(p),
  };
}
router.get(
  '/:id',
  requirePermission('EPOCH_VALIDATION_VIEW'),
  async (req, res) => {
    const d = await detail(uuid.parse(req.params.id));
    if (!d)
      return res.status(404).json({ error: 'VALIDATION_PACKAGE_NOT_FOUND' });
    res.json(d);
  }
);
router.get(
  '/:id/readiness',
  requirePermission('EPOCH_VALIDATION_VIEW'),
  async (req, res) => {
    const id = uuid.parse(req.params.id);
    res.json({
      ...(await counts(id)),
      ...calculateReadiness(await counts(id)),
    });
  }
);
router.post(
  '/:id/status',
  requirePermission('EPOCH_VALIDATION_EDIT'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const body = z
      .object({ status: z.string(), reason: z.string().min(3) })
      .parse(req.body);
    if (
      !canTransition(
        p.status as ValidationStatus,
        body.status as ValidationStatus
      )
    )
      return res.status(409).json({
        error: 'ILLEGAL_STATUS_TRANSITION',
        from: p.status,
        to: body.status,
      });
    if (
      [
        'PLAN_APPROVED',
        'TESTING',
        'RETESTING',
        'READY_FOR_FINAL_REVIEW',
      ].includes(body.status)
    ) {
      const gate = await packageReadiness(p);
      if (!gate.executionReady)
        return res.status(409).json({
          error: 'PACKAGE_STATUS_READINESS_BLOCKED',
          blockers: gate.blockers,
        });
    }
    if (
      body.status === 'TESTING' &&
      !(await query(
        `SELECT 1 FROM qms_epoch_validation_plans WHERE package_id=$1 AND status='APPROVED'`,
        [p.id]
      ).then((x) => x.length))
    )
      return res
        .status(409)
        .json({ error: 'VALIDATION_PLAN_APPROVAL_REQUIRED' });
    if (body.status === 'READY_FOR_FINAL_REVIEW') {
      const structural = await counts(p.id);
      structural.approvalsCurrent = true;
      if (!calculateReadiness(structural).ready)
        return res.status(409).json({
          error: 'FINAL_READINESS_BLOCKED',
          ...calculateReadiness(structural),
        });
    }
    const a = actor(req),
      updated = (
        await query(
          `UPDATE qms_epoch_validation_packages SET status=$1,row_version=row_version+1,
    revision=revision+1,updated_by_user_id=$2,updated_by_display_name=$3,updated_at=now() WHERE id=$4 RETURNING *`,
          [body.status, a.id, a.name, p.id]
        )
      )[0];
    await invalidateApprovals(p.id, 'Package status changed');
    await logEvent(req, updated, 'PACKAGE', 'STATUS_CHANGED', {
      previous: p.status,
      next: body.status,
      reason: body.reason,
    });
    res.json(updated);
  }
);

const wizardSetupSchema = z.object({
  rowVersion: z.number().int().positive(),
  title: z.string().min(3).max(240),
  reasonForValidation: z.string().min(3).max(10000),
  validationType: z.enum([
    'INITIAL_INTENDED_USE',
    'MAJOR_RELEASE',
    'CRITICAL_CHANGE',
    'DATABASE_MIGRATION',
    'SECURITY_ACCESS_CONTROL',
    'BACKUP_RECOVERY',
    'PERIODIC_REVIEW',
    'PRE_AUDIT_REVALIDATION',
    'CORRECTIVE_REVALIDATION',
  ]),
  plannedStartDate: z.string().date(),
  plannedCompletionDate: z.string().date(),
  commitOrReleaseIdentifier: z.string().max(240).nullable().optional(),
  productionDeploymentDate: z.string().date().nullable().optional(),
  validationEnvironment: z.string().min(1),
  productionEnvironmentReference: z.string().min(1),
  environmentDifferences: z.string().max(10000).nullable().optional(),
});

router.patch(
  '/:id/wizard/setup',
  requirePermission('EPOCH_VALIDATION_EDIT'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const v = wizardSetupSchema.parse(req.body),
      a = actor(req),
      technicalChanged =
        v.commitOrReleaseIdentifier !== p.commit_or_release_identifier ||
        v.productionDeploymentDate !== p.production_deployment_date ||
        v.environmentDifferences !== p.environment_differences;
    const updated = (
      await query(
        `UPDATE qms_epoch_validation_packages SET
         title=$1,reason_for_validation=$2,validation_type=$3,
         planned_start_date=$4::date,planned_completion_date=$5::date,
         commit_or_release_identifier=$6,production_deployment_date=$7::date,
         validation_environment=$8,production_environment_reference=$9,environment_differences=$10,
         deployment_date_confirmed=CASE WHEN $11 THEN false ELSE deployment_date_confirmed END,
         deployment_date_confirmed_by_user_id=CASE WHEN $11 THEN NULL ELSE deployment_date_confirmed_by_user_id END,
         deployment_date_confirmed_by_display_name=CASE WHEN $11 THEN NULL ELSE deployment_date_confirmed_by_display_name END,
         deployment_date_confirmed_at=CASE WHEN $11 THEN NULL ELSE deployment_date_confirmed_at END,
         environment_separation_confirmed=CASE WHEN $11 THEN false ELSE environment_separation_confirmed END,
         environment_separation_confirmed_by_user_id=CASE WHEN $11 THEN NULL ELSE environment_separation_confirmed_by_user_id END,
         environment_separation_confirmed_by_display_name=CASE WHEN $11 THEN NULL ELSE environment_separation_confirmed_by_display_name END,
         environment_separation_confirmed_at=CASE WHEN $11 THEN NULL ELSE environment_separation_confirmed_at END,
         row_version=row_version+1,revision=revision+1,
         updated_by_user_id=$12,updated_by_display_name=$13,updated_at=now()
         WHERE id=$14 AND row_version=$15 RETURNING *`,
        [
          v.title,
          v.reasonForValidation,
          v.validationType,
          v.plannedStartDate,
          v.plannedCompletionDate,
          v.commitOrReleaseIdentifier ?? null,
          v.productionDeploymentDate ?? null,
          v.validationEnvironment,
          v.productionEnvironmentReference,
          v.environmentDifferences ?? null,
          technicalChanged,
          a.id,
          a.name,
          p.id,
          v.rowVersion,
        ]
      )
    )[0];
    if (!updated) return res.status(409).json({ error: 'STALE_RECORD' });
    await invalidateApprovals(p.id, 'Wizard setup changed');
    await logEvent(req, updated, 'PACKAGE', 'WIZARD_SETUP_SAVED', {
      previous: p,
      next: updated,
    });
    res.json({ package: updated, readiness: await packageReadiness(updated) });
  }
);

const responsibilityRole = z.enum([
  'SOFTWARE_OWNER',
  'QUALITY_REVIEWER',
  'VALIDATION_COORDINATOR',
  'ADDITIONAL_TESTER',
  'FINAL_APPROVING_AUTHORITY',
]);
const responsibilitySchema = z.object({
  rowVersion: z.number().int().positive(),
  assignments: z.array(
    z.object({
      role: responsibilityRole,
      employeeId: z.number().int().positive(),
    })
  ),
});

router.put(
  '/:id/responsibilities',
  requirePermission('EPOCH_VALIDATION_EDIT'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const body = responsibilitySchema.parse(req.body),
      a = actor(req);
    const singularRoles = [
      'SOFTWARE_OWNER',
      'QUALITY_REVIEWER',
      'VALIDATION_COORDINATOR',
      'FINAL_APPROVING_AUTHORITY',
    ] as const;
    for (const role of singularRoles) {
      if (body.assignments.filter((item) => item.role === role).length > 1)
        return res.status(400).json({
          error: 'RESPONSIBILITY_ROLE_MUST_BE_SINGULAR',
          role,
        });
    }
    const uniqueAssignments = new Set(
      body.assignments.map((item) => `${item.role}:${item.employeeId}`)
    );
    if (uniqueAssignments.size !== body.assignments.length)
      return res
        .status(400)
        .json({ error: 'DUPLICATE_RESPONSIBILITY_ASSIGNMENT' });
    const employeeIds = Array.from(
      new Set(body.assignments.map((x) => x.employeeId))
    );
    if (employeeIds.length) {
      const active = await query(
        `SELECT id FROM employees WHERE id=ANY($1::int[]) AND is_active=true`,
        [employeeIds]
      );
      if (active.length !== employeeIds.length)
        return res.status(409).json({ error: 'INACTIVE_EMPLOYEE_ASSIGNMENT' });
    }
    const updated = await tx(async (q) => {
      const locked = (
        await q(
          `SELECT * FROM qms_epoch_validation_packages WHERE id=$1 AND row_version=$2 FOR UPDATE`,
          [p.id, body.rowVersion]
        )
      )[0];
      if (!locked) return null;
      const previous = await q(
        `SELECT * FROM qms_epoch_validation_responsibilities WHERE package_id=$1 AND active=true`,
        [p.id]
      );
      const desiredKeys = new Set(
        body.assignments.map((item) => `${item.role}:${item.employeeId}`)
      );
      const previousKeys = new Set(
        previous.map(
          (item) => `${item.responsibility_role}:${item.employee_id}`
        )
      );
      const removedIds = previous
        .filter(
          (item) =>
            !desiredKeys.has(`${item.responsibility_role}:${item.employee_id}`)
        )
        .map((item) => item.id);
      if (removedIds.length)
        await q(
          `UPDATE qms_epoch_validation_responsibilities
           SET active=false,assignment_status='SUPERSEDED',superseded_at=now()
           WHERE package_id=$1 AND id=ANY($2::uuid[]) AND active=true`,
          [p.id, removedIds]
        );
      for (const assignment of body.assignments) {
        if (previousKeys.has(`${assignment.role}:${assignment.employeeId}`))
          continue;
        await q(
          `INSERT INTO qms_epoch_validation_responsibilities
          (package_id,responsibility_role,employee_id,assigned_by_user_id,assigned_by_display_name)
          VALUES($1,$2,$3,$4,$5)`,
          [p.id, assignment.role, assignment.employeeId, a.id, a.name]
        );
      }
      const assigned = (role: string) =>
        body.assignments.find((item) => item.role === role)?.employeeId || null;
      const packageRow = (
        await q(
          `UPDATE qms_epoch_validation_packages SET
           software_owner_employee_id=$1,quality_owner_employee_id=$2,validation_lead_employee_id=$3,
           row_version=row_version+1,revision=revision+1,
           updated_by_user_id=$4,updated_by_display_name=$5,updated_at=now()
           WHERE id=$6 RETURNING *`,
          [
            assigned('SOFTWARE_OWNER'),
            assigned('QUALITY_REVIEWER'),
            assigned('VALIDATION_COORDINATOR'),
            a.id,
            a.name,
            p.id,
          ]
        )
      )[0];
      await invalidateApprovals(p.id, 'Validation responsibilities changed', q);
      await logEvent(
        req,
        packageRow,
        'RESPONSIBILITY',
        'RESPONSIBILITIES_ASSIGNED',
        { previous, next: body.assignments },
        q
      );
      return packageRow;
    });
    if (!updated) return res.status(409).json({ error: 'STALE_RECORD' });
    res.json(await detail(updated.id));
  }
);

async function decideResponsibility(
  req: Request,
  res: any,
  forcedDecision?: 'ACCEPTED'
) {
  const p = await editable(req, res);
  if (!p) return;
  const assignmentId = uuid.parse(req.params.assignmentId);
  const body = responsibilityDecisionSchema.parse(
    forcedDecision ? { decision: forcedDecision } : req.body
  );
  const a = actor(req);
  const result = await tx(async (q) => {
    const packageRow = (
      await q(
        `SELECT * FROM qms_epoch_validation_packages
         WHERE id=$1 FOR SHARE`,
        [p.id]
      )
    )[0];
    if (!packageRow || isLocked(packageRow))
      return { packageLocked: true as const };
    const identity = (
      await q(
        `SELECT u.id AS user_id,u.employee_id,e.is_active AS employee_active
           FROM users u JOIN employees e ON e.id=u.employee_id
           WHERE u.id=$1 AND u.is_active=true FOR SHARE OF u,e`,
        [a.id]
      )
    )[0];
    if (!identity) return { identityError: 'EMPLOYEE_IDENTITY_REQUIRED' };
    const activeUserCount = Number(
      (
        await q(
          `SELECT count(*)::int AS count FROM users
             WHERE employee_id=$1 AND is_active=true`,
          [identity.employee_id]
        )
      )[0].count
    );
    const assignment = (
      await q(
        `SELECT r.*,e.is_active AS employee_active
           FROM qms_epoch_validation_responsibilities r
           JOIN employees e ON e.id=r.employee_id
           WHERE r.id=$1 AND r.package_id=$2 AND r.active=true FOR UPDATE OF r,e`,
        [assignmentId, p.id]
      )
    )[0];
    if (!assignment) return { missing: true as const };
    const identityError = responsibilityDecisionIdentityError({
      authenticatedUserId: a.id,
      authenticatedEmployeeId: Number(identity.employee_id),
      employeeActive:
        Boolean(identity.employee_active) &&
        Boolean(assignment.employee_active),
      activeUserCount,
      assignedEmployeeId: Number(assignment.employee_id),
    });
    if (identityError) return { identityError };
    if (assignment.assignment_status === body.decision)
      return { assignment, replay: true as const };
    if (assignment.assignment_status !== 'AWAITING_ACCEPTANCE')
      return { conflict: true as const };
    const updated = (
      await q(
        `UPDATE qms_epoch_validation_responsibilities SET
           assignment_status=$1,
           accepted_by_user_id=CASE WHEN $1='ACCEPTED' THEN $2 ELSE NULL END,
           accepted_by_display_name=CASE WHEN $1='ACCEPTED' THEN $3 ELSE NULL END,
           accepted_at=CASE WHEN $1='ACCEPTED' THEN now() ELSE NULL END
           WHERE id=$4 RETURNING *,clock_timestamp() AS decided_at`,
        [body.decision, a.id, a.name, assignment.id]
      )
    )[0];
    await logEvent(
      req,
      packageRow,
      'RESPONSIBILITY',
      body.decision === 'ACCEPTED'
        ? 'RESPONSIBILITY_ACCEPTED'
        : 'RESPONSIBILITY_DECLINED',
      {
        entityId: updated.id,
        previous: assignment,
        next: {
          assignmentId: updated.id,
          assignedEmployeeId: Number(updated.employee_id),
          authenticatedUserId: a.id,
          authenticatedEmployeeId: Number(identity.employee_id),
          decision: body.decision,
          decidedAt: updated.decided_at,
          packageRevision: packageRow.revision,
          productionVersion: packageRow.production_version,
        },
        reason: body.reason,
      },
      q
    );
    return { assignment: updated };
  });
  if ('missing' in result)
    return res.status(404).json({ error: 'RESPONSIBILITY_NOT_FOUND' });
  if ('packageLocked' in result)
    return res.status(409).json({ error: 'VALIDATION_PACKAGE_LOCKED' });
  if ('identityError' in result)
    return res.status(403).json({ error: result.identityError });
  if ('conflict' in result)
    return res
      .status(409)
      .json({ error: 'RESPONSIBILITY_DECISION_ALREADY_RECORDED' });
  res.json(result.assignment);
}

router.post('/:id/responsibilities/:assignmentId/decision', (req, res) =>
  decideResponsibility(req, res)
);
router.post('/:id/responsibilities/:assignmentId/accept', (req, res) =>
  decideResponsibility(req, res, 'ACCEPTED')
);

const intendedUseSchema = z.object({
  systemName: z.string().min(1),
  epochVersion: z.string().min(1),
  productionEnvironment: z.string().min(1),
  softwareOwnerEmployeeId: z.number().int().positive().optional(),
  qualityOwnerEmployeeId: z.number().int().positive().optional(),
  hostingProvider: z.string().min(1),
  databaseProvider: z.string().min(1),
  intendedUseStatement: z.string().min(20),
  qmsProcessesSupported: z.string().min(1),
  officialRecordsControlled: z.string().min(1),
  outsideProcessesRecords: z.string().optional(),
  userGroupsDepartments: z.string().min(1),
  interfacesDependencies: z.string().optional(),
  customerContractualRequirements: z.string().optional(),
  complianceConsiderations: z.string().optional(),
  knownLimitations: z.string().optional(),
  excludedFunctionality: z.string().optional(),
  dataRetentionResponsibilities: z.string().min(1),
  backupResponsibilities: z.string().min(1),
  functions: z
    .array(
      z
        .object({
          functionKey: z.string().min(1).max(120),
          usageStatus: z.enum(['USED_FOR_QMS', 'NOT_USED_FOR_QMS']),
          useDescription: z.string().max(5000).optional(),
          failureEffect: z.string().max(5000).optional(),
          criticalToQms: z.boolean().default(false),
          notUsedExplanation: z.string().max(5000).optional(),
        })
        .superRefine((value, ctx) => {
          if (
            value.usageStatus === 'USED_FOR_QMS' &&
            (!value.useDescription?.trim() || !value.failureEffect?.trim())
          )
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                'Selected functions require a use description and failure effect.',
            });
          if (
            value.usageStatus === 'NOT_USED_FOR_QMS' &&
            !value.notUsedExplanation?.trim()
          )
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Not-used functions require an explanation.',
            });
        })
    )
    .default([]),
});
router.post(
  '/:id/intended-use',
  requirePermission('EPOCH_VALIDATION_EDIT'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const v = intendedUseSchema.parse(req.body),
      a = actor(req);
    const record = await tx(async (q) => {
      await q(
        `SELECT id FROM qms_epoch_validation_packages WHERE id=$1 FOR UPDATE`,
        [p.id]
      );
      const revision = Number(
        (
          await q(
            `SELECT coalesce(max(revision),0)+1 revision FROM qms_epoch_validation_intended_use_revisions WHERE package_id=$1`,
            [p.id]
          )
        )[0].revision
      );
      await q(
        `UPDATE qms_epoch_validation_intended_use_revisions SET approval_status='SUPERSEDED' WHERE package_id=$1 AND approval_status<>'SUPERSEDED'`,
        [p.id]
      );
      const x = (
        await q(
          `INSERT INTO qms_epoch_validation_intended_use_revisions
      (package_id,revision,system_name,epoch_version,production_environment,software_owner_employee_id,quality_owner_employee_id,
       hosting_provider,database_provider,intended_use_statement,qms_processes_supported,official_records_controlled,
       outside_processes_records,user_groups_departments,interfaces_dependencies,customer_contractual_requirements,
       compliance_considerations,known_limitations,excluded_functionality,data_retention_responsibilities,
       backup_responsibilities,created_by_user_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
          [
            p.id,
            revision,
            v.systemName,
            v.epochVersion,
            v.productionEnvironment,
            v.softwareOwnerEmployeeId || null,
            v.qualityOwnerEmployeeId || null,
            v.hostingProvider,
            v.databaseProvider,
            v.intendedUseStatement,
            v.qmsProcessesSupported,
            v.officialRecordsControlled,
            v.outsideProcessesRecords || null,
            v.userGroupsDepartments,
            v.interfacesDependencies || null,
            v.customerContractualRequirements || null,
            v.complianceConsiderations || null,
            v.knownLimitations || null,
            v.excludedFunctionality || null,
            v.dataRetentionResponsibilities,
            v.backupResponsibilities,
            a.id,
          ]
        )
      )[0];
      for (const selectedFunction of v.functions) {
        await q(
          `INSERT INTO qms_epoch_validation_intended_use_functions
          (package_id,intended_use_revision_id,function_key,usage_status,use_description,failure_effect,
           critical_to_qms,not_used_explanation,created_by_user_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            p.id,
            x.id,
            selectedFunction.functionKey,
            selectedFunction.usageStatus,
            selectedFunction.useDescription?.trim() || null,
            selectedFunction.failureEffect?.trim() || null,
            selectedFunction.criticalToQms,
            selectedFunction.notUsedExplanation?.trim() || null,
            a.id,
          ]
        );
      }
      await invalidateApprovals(p.id, 'Intended Use revised', q);
      await logEvent(
        req,
        p,
        'INTENDED_USE',
        'INTENDED_USE_REVISED',
        { entityId: x.id, next: { revision } },
        q
      );
      return x;
    });
    res.status(201).json(record);
  }
);

const requirementSchema = z.object({
  module: z.string().min(1),
  category: z.string().min(1),
  statement: z.string().min(5),
  purpose: z.string().min(1),
  source: z.string().min(1),
  criticality: z.enum(['CRITICAL', 'HIGH', 'NORMAL', 'INFORMATIONAL']),
  productQualityRecordImpact: z.string().optional(),
  traceabilityImpact: z.string().optional(),
  securityAccessImpact: z.string().optional(),
  dataIntegrityImpact: z.string().optional(),
  regulatoryCustomerImpact: z.string().optional(),
  validationMethod: z.string().min(1),
  testRequired: z.boolean().default(true),
  ownerEmployeeId: z.number().int().positive().optional(),
});
router.post(
  '/:id/requirements',
  requirePermission('EPOCH_VALIDATION_EDIT'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const v = requirementSchema.parse(req.body),
      a = actor(req);
    const seq = (
      await query(
        `SELECT nextval('qms_epoch_validation_requirement_number_seq') value`
      )
    )[0].value;
    const rid = `ESR-${String(seq).padStart(4, '0')}`;
    const x = (
      await query(
        `INSERT INTO qms_epoch_validation_requirements
    (requirement_id,package_id,module,category,statement,purpose,source,criticality,product_quality_record_impact,
     traceability_impact,security_access_impact,data_integrity_impact,regulatory_customer_impact,
     validation_method,test_required,owner_employee_id,created_by_user_id,updated_by_user_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17) RETURNING *`,
        [
          rid,
          p.id,
          v.module,
          v.category,
          v.statement,
          v.purpose,
          v.source,
          v.criticality,
          v.productQualityRecordImpact || null,
          v.traceabilityImpact || null,
          v.securityAccessImpact || null,
          v.dataIntegrityImpact || null,
          v.regulatoryCustomerImpact || null,
          v.validationMethod,
          v.testRequired,
          v.ownerEmployeeId || null,
          a.id,
        ]
      )
    )[0];
    await invalidateApprovals(p.id, 'Requirement added');
    await logEvent(req, p, 'REQUIREMENT', 'REQUIREMENT_CREATED', {
      entityId: x.id,
      next: x,
    });
    res.status(201).json(x);
  }
);
router.post(
  '/:id/requirements/:recordId/approve',
  requirePermission('EPOCH_VALIDATION_PLAN_APPROVE'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const recordId = uuid.parse(req.params.recordId);
    const x = (
      await query(
        `UPDATE qms_epoch_validation_requirements SET status='APPROVED',updated_at=now()
    WHERE id=$1 AND package_id=$2 AND status IN ('DRAFT','READY_FOR_APPROVAL') RETURNING *`,
        [recordId, p.id]
      )
    )[0];
    if (!x)
      return res.status(409).json({ error: 'REQUIREMENT_NOT_APPROVABLE' });
    await approve(
      req,
      p,
      'REQUIREMENT',
      x.id,
      x.revision,
      'REQUIREMENTS_APPROVER',
      'Approved requirement baseline item',
      'EPOCH_VALIDATION_PLAN_APPROVE'
    );
    res.json(x);
  }
);

const riskSchema = z.object({
  requirementId: z.string().uuid().optional(),
  module: z.string().min(1),
  failureMode: z.string().min(3),
  cause: z.string().min(1),
  potentialEffect: z.string().min(1),
  qualityTraceabilityImpact: z.string().min(1),
  severity: z.number().int().min(1).max(5),
  likelihood: z.number().int().min(1).max(5),
  detectability: z.number().int().min(1).max(5),
  existingControls: z.string().optional(),
  additionalMitigation: z.string().optional(),
  mitigationOwnerEmployeeId: z.number().int().positive().optional(),
  dueDate: z.string().date().optional(),
  residualRisk: z.string().optional(),
  residualRiskLevel: z
    .enum(['CRITICAL', 'HIGH', 'NORMAL', 'LOW'])
    .default('NORMAL'),
  requiredTest: z.boolean().default(false),
});
router.post(
  '/:id/risks',
  requirePermission('EPOCH_VALIDATION_EDIT'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const v = riskSchema.parse(req.body),
      a = actor(req);
    if (
      v.requirementId &&
      !(await query(
        'SELECT 1 FROM qms_epoch_validation_requirements WHERE id=$1 AND package_id=$2',
        [v.requirementId, p.id]
      ).then((x) => x.length))
    )
      return res.status(409).json({ error: 'REQUIREMENT_LINK_INVALID' });
    const seq = (
        await query(
          `SELECT nextval('qms_epoch_validation_risk_number_seq') value`
        )
      )[0].value,
      rid = `ESRISK-${String(seq).padStart(4, '0')}`;
    const x = (
      await query(
        `INSERT INTO qms_epoch_validation_risks
    (risk_id,package_id,requirement_id,module,failure_mode,cause,potential_effect,quality_traceability_impact,
     severity,likelihood,detectability,existing_controls,additional_mitigation,mitigation_owner_employee_id,
     due_date,residual_risk,residual_risk_level,required_test,created_by_user_id,updated_by_user_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) RETURNING *`,
        [
          rid,
          p.id,
          v.requirementId || null,
          v.module,
          v.failureMode,
          v.cause,
          v.potentialEffect,
          v.qualityTraceabilityImpact,
          v.severity,
          v.likelihood,
          v.detectability,
          v.existingControls || null,
          v.additionalMitigation || null,
          v.mitigationOwnerEmployeeId || null,
          v.dueDate || null,
          v.residualRisk || null,
          v.residualRiskLevel,
          v.requiredTest || v.severity >= 4,
          a.id,
        ]
      )
    )[0];
    await invalidateApprovals(p.id, 'Risk added');
    await logEvent(req, p, 'RISK', 'RISK_CREATED', { entityId: x.id, next: x });
    res.status(201).json(x);
  }
);
router.post(
  '/:id/risks/:recordId/approve',
  requirePermission('EPOCH_VALIDATION_PLAN_APPROVE'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const recordId = uuid.parse(req.params.recordId);
    const risk = (
      await query(
        'SELECT * FROM qms_epoch_validation_risks WHERE id=$1 AND package_id=$2',
        [recordId, p.id]
      )
    )[0];
    if (!risk)
      return res.status(404).json({ error: 'VALIDATION_RISK_NOT_FOUND' });
    if (
      (risk.severity >= 4 || risk.required_test) &&
      !(await query(
        `SELECT 1 FROM qms_epoch_validation_protocol_risks pr
    JOIN qms_epoch_validation_protocols p ON p.id=pr.protocol_id WHERE pr.risk_id=$1 AND p.status='APPROVED'`,
        [recordId]
      ).then((x) => x.length))
    )
      return res
        .status(409)
        .json({ error: 'CRITICAL_HIGH_RISK_REQUIRES_APPROVED_PROTOCOL' });
    await query(
      `UPDATE qms_epoch_validation_risks SET status='APPROVED',updated_at=now() WHERE id=$1`,
      [recordId]
    );
    await approve(
      req,
      p,
      'RISK',
      risk.id,
      1,
      'RISK_APPROVER',
      'Approved software risk assessment item',
      'EPOCH_VALIDATION_PLAN_APPROVE'
    );
    res.json({ ...risk, status: 'APPROVED' });
  }
);
router.post(
  '/:id/risks/:recordId/accept',
  requirePermission('EPOCH_VALIDATION_FINAL_APPROVE'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const recordId = uuid.parse(req.params.recordId);
    const body = z
      .object({
        authorityRole: z.enum(['QUALITY_APPROVER', 'TOP_MANAGEMENT']),
        comments: z.string().min(20),
      })
      .parse(req.body);
    const risk = (
      await query(
        `UPDATE qms_epoch_validation_risks SET risk_accepted=true,updated_at=now()
    WHERE id=$1 AND package_id=$2 AND residual_risk_level IN ('CRITICAL','HIGH') RETURNING *`,
        [recordId, p.id]
      )
    )[0];
    if (!risk)
      return res
        .status(409)
        .json({ error: 'CRITICAL_HIGH_RESIDUAL_RISK_REQUIRED' });
    await approve(
      req,
      p,
      'RISK_ACCEPTANCE',
      risk.id,
      1,
      body.authorityRole,
      'Accepted documented critical/high residual software risk',
      'EPOCH_VALIDATION_FINAL_APPROVE',
      body.comments
    );
    res.json(risk);
  }
);

const planSchema = z.object({
  purpose: z.string().min(1),
  scope: z.string().min(1),
  epochVersion: z.string().min(1),
  commitOrReleaseIdentifier: z.string().optional(),
  includedModules: z.string().min(1),
  excludedModules: z.string().optional(),
  validationEnvironment: z.string().min(1),
  testDatabaseEnvironment: z.string().min(1),
  productionComparisonMethod: z.string().min(1),
  responsibilities: z.string().min(1),
  requiredResources: z.string().optional(),
  testingApproach: z.string().min(1),
  riskBasedSelection: z.string().min(1),
  evidenceRequirements: z.string().min(1),
  acceptanceCriteria: z.string().min(1),
  defectSeverityRules: z.string().min(1),
  retestingRequirements: z.string().min(1),
  regressionRequirements: z.string().min(1),
  backupRestoreRequirements: z.string().min(1),
  outageDrillRequirements: z.string().min(1),
  approvalRoles: z.string().min(1),
  schedule: z.string().min(1),
  deviations: z.string().optional(),
});
router.post(
  '/:id/plans',
  requirePermission('EPOCH_VALIDATION_EDIT'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const v = planSchema.parse(req.body),
      a = actor(req);
    const revision = Number(
      (
        await query(
          'SELECT coalesce(max(revision),0)+1 revision FROM qms_epoch_validation_plans WHERE package_id=$1',
          [p.id]
        )
      )[0].revision
    );
    await query(
      `UPDATE qms_epoch_validation_plans SET status='SUPERSEDED' WHERE package_id=$1 AND status<>'SUPERSEDED'`,
      [p.id]
    );
    const keys = Object.keys(v),
      values = Object.values(v);
    const x = (
      await query(
        `INSERT INTO qms_epoch_validation_plans
    (package_id,revision,purpose,scope,epoch_version,commit_or_release_identifier,included_modules,excluded_modules,
     validation_environment,test_database_environment,production_comparison_method,responsibilities,required_resources,
     testing_approach,risk_based_selection,evidence_requirements,acceptance_criteria,defect_severity_rules,
     retesting_requirements,regression_requirements,backup_restore_requirements,outage_drill_requirements,approval_roles,
     schedule,deviations,created_by_user_id)
    VALUES($1,$2,${values.map((_, i) => `$${i + 3}`).join(',')},$${values.length + 3}) RETURNING *`,
        [p.id, revision, ...values, a.id]
      )
    )[0];
    void keys;
    await invalidateApprovals(p.id, 'Validation Plan revised');
    await logEvent(req, p, 'PLAN', 'PLAN_REVISED', {
      entityId: x.id,
      next: { revision },
    });
    res.status(201).json(x);
  }
);
router.post(
  '/:id/plans/:recordId/approve',
  requirePermission('EPOCH_VALIDATION_PLAN_APPROVE'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const recordId = uuid.parse(req.params.recordId);
    const body = z
      .object({
        approvalRole: z.enum([
          'VALIDATION_LEAD',
          'EPOCH_IT_OWNER',
          'QUALITY_APPROVER',
        ]),
        comments: z.string().optional(),
      })
      .parse(req.body);
    const plan = (
      await query(
        'SELECT * FROM qms_epoch_validation_plans WHERE id=$1 AND package_id=$2',
        [recordId, p.id]
      )
    )[0];
    if (!plan)
      return res.status(404).json({ error: 'VALIDATION_PLAN_NOT_FOUND' });
    await approve(
      req,
      p,
      'PLAN',
      plan.id,
      plan.revision,
      body.approvalRole,
      'Approved Validation Plan revision',
      'EPOCH_VALIDATION_PLAN_APPROVE',
      body.comments
    );
    const n = Number(
      (
        await query(
          `SELECT count(DISTINCT approval_role) n FROM qms_epoch_validation_approvals WHERE record_type='PLAN' AND record_id=$1 AND record_revision=$2 AND status='VALID' AND decision='APPROVED'`,
          [plan.id, plan.revision]
        )
      )[0].n
    );
    if (n >= 3)
      await query(
        `UPDATE qms_epoch_validation_plans SET status='APPROVED' WHERE id=$1`,
        [plan.id]
      );
    res.json({ approvedRoles: n, complete: n >= 3 });
  }
);

const protocolSchema = z.object({
  title: z.string().min(1),
  module: z.string().min(1),
  criticality: z.enum(['CRITICAL', 'HIGH', 'NORMAL', 'INFORMATIONAL']),
  objective: z.string().min(1),
  preconditions: z.string().optional(),
  requiredUserRole: z.string().optional(),
  requiredTestData: z.string().optional(),
  testEnvironment: z.string().min(1),
  overallAcceptanceCriteria: z.string().min(1),
  requiredEvidence: z.string().min(1),
  regressionClassification: z.string().optional(),
  independentReviewRequired: z.boolean().default(false),
  requirementIds: z.array(z.string().uuid()).default([]),
  riskIds: z.array(z.string().uuid()).default([]),
  steps: z
    .array(
      z.object({
        instruction: z.string().min(1),
        expectedResult: z.string().min(1),
        required: z.boolean().default(true),
      })
    )
    .min(1),
});
router.post(
  '/:id/protocols',
  requirePermission('EPOCH_VALIDATION_EDIT'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const v = protocolSchema.parse(req.body),
      a = actor(req);
    const x = await tx(async (q) => {
      const seq = (
          await q(
            `SELECT nextval('qms_epoch_validation_test_number_seq') value`
          )
        )[0].value,
        tid = `EVT-${String(seq).padStart(4, '0')}`;
      const protocol = (
        await q(
          `INSERT INTO qms_epoch_validation_protocols
      (test_id,package_id,title,module,criticality,objective,preconditions,required_user_role,required_test_data,
       test_environment,overall_acceptance_criteria,required_evidence,regression_classification,
       independent_review_required,created_by_user_id,updated_by_user_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING *`,
          [
            tid,
            p.id,
            v.title,
            v.module,
            v.criticality,
            v.objective,
            v.preconditions || null,
            v.requiredUserRole || null,
            v.requiredTestData || null,
            v.testEnvironment,
            v.overallAcceptanceCriteria,
            v.requiredEvidence,
            v.regressionClassification || null,
            v.independentReviewRequired,
            a.id,
          ]
        )
      )[0];
      for (let i = 0; i < v.steps.length; i++)
        await q(
          `INSERT INTO qms_epoch_validation_protocol_steps
      (protocol_id,step_number,instruction,expected_result,required) VALUES($1,$2,$3,$4,$5)`,
          [
            protocol.id,
            i + 1,
            v.steps[i].instruction,
            v.steps[i].expectedResult,
            v.steps[i].required,
          ]
        );
      for (const id of v.requirementIds)
        await q(
          `INSERT INTO qms_epoch_validation_protocol_requirements VALUES($1,$2) ON CONFLICT DO NOTHING`,
          [protocol.id, id]
        );
      for (const id of v.riskIds)
        await q(
          `INSERT INTO qms_epoch_validation_protocol_risks VALUES($1,$2) ON CONFLICT DO NOTHING`,
          [protocol.id, id]
        );
      await logEvent(
        req,
        p,
        'PROTOCOL',
        'PROTOCOL_CREATED',
        { entityId: protocol.id, next: { testId: tid, revision: 1 } },
        q
      );
      return protocol;
    });
    await invalidateApprovals(p.id, 'Test protocol added');
    res.status(201).json(x);
  }
);
router.post(
  '/:id/protocols/:recordId/approve',
  requirePermission('EPOCH_VALIDATION_PLAN_APPROVE'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const recordId = uuid.parse(req.params.recordId);
    const x = (
      await query(
        `UPDATE qms_epoch_validation_protocols SET status='APPROVED',updated_at=now()
    WHERE id=$1 AND package_id=$2 AND status='DRAFT' RETURNING *`,
        [recordId, p.id]
      )
    )[0];
    if (!x) return res.status(409).json({ error: 'PROTOCOL_NOT_APPROVABLE' });
    await approve(
      req,
      p,
      'PROTOCOL',
      x.id,
      x.revision,
      'PROTOCOL_APPROVER',
      'Approved protocol revision',
      'EPOCH_VALIDATION_PLAN_APPROVE'
    );
    res.json(x);
  }
);

router.post(
  '/:id/protocols/:recordId/executions',
  requirePermission('EPOCH_VALIDATION_TEST_EXECUTE'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const protocolId = uuid.parse(req.params.recordId),
      a = actor(req);
    const packageGate = await packageReadiness(p);
    if (!packageGate.executionReady)
      return res.status(409).json({
        error: 'PACKAGE_EXECUTION_READINESS_BLOCKED',
        blockers: packageGate.blockers,
      });
    if (
      ![
        'PLAN_APPROVED',
        'TESTING',
        'TESTING_BLOCKED',
        'RETESTING',
        'CORRECTIONS_REQUIRED',
      ].includes(p.status)
    )
      return res.status(409).json({
        error: 'FORMAL_TEST_EXECUTION_NOT_ALLOWED',
        message: 'The Validation Plan must be approved before execution.',
      });
    const protocol = (
      await query(
        'SELECT * FROM qms_epoch_validation_protocols WHERE id=$1 AND package_id=$2',
        [protocolId, p.id]
      )
    )[0];
    if (!protocol || protocol.status !== 'APPROVED')
      return res.status(409).json({ error: 'APPROVED_PROTOCOL_REQUIRED' });
    const body = z
      .object({
        epochVersion: z.string().min(1),
        commitOrReleaseIdentifier: z.string().optional(),
        testEnvironment: z.string().min(1),
        testDatabase: z.string().min(1),
        retestOfExecutionId: z.string().uuid().optional(),
      })
      .parse(req.body);
    const execution = await tx(async (q) => {
      const seq = (
          await q(
            `SELECT nextval('qms_epoch_validation_execution_number_seq') value`
          )
        )[0].value,
        eid = `EVE-${String(seq).padStart(4, '0')}`;
      const x = (
        await q(
          `INSERT INTO qms_epoch_validation_executions
      (execution_id,package_id,protocol_id,protocol_revision,epoch_version,commit_or_release_identifier,
       test_environment,test_database,tester_user_id,tester_display_name,overall_result,retest_of_execution_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'IN_PROGRESS',$11) RETURNING *`,
          [
            eid,
            p.id,
            protocol.id,
            protocol.revision,
            body.epochVersion,
            body.commitOrReleaseIdentifier || null,
            body.testEnvironment,
            body.testDatabase,
            a.id,
            a.name,
            body.retestOfExecutionId || null,
          ]
        )
      )[0];
      await q(
        `INSERT INTO qms_epoch_validation_execution_steps
      (execution_id,protocol_step_id,step_number,instruction_snapshot,expected_result_snapshot,required)
      SELECT $1,id,step_number,instruction,expected_result,required FROM qms_epoch_validation_protocol_steps
      WHERE protocol_id=$2 ORDER BY step_number`,
        [x.id, protocol.id]
      );
      await logEvent(
        req,
        p,
        'EXECUTION',
        'TEST_EXECUTION_STARTED',
        {
          entityId: x.id,
          next: { executionId: eid, protocolRevision: protocol.revision },
        },
        q
      );
      return x;
    });
    res.status(201).json(execution);
  }
);
router.put(
  '/:id/executions/:recordId/steps',
  requirePermission('EPOCH_VALIDATION_TEST_EXECUTE'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const executionId = uuid.parse(req.params.recordId);
    const body = z
      .object({
        steps: z
          .array(
            z.object({
              stepNumber: z.number().int().positive(),
              actualResult: z.string().min(1),
              status: z.enum([
                'NOT_RUN',
                'IN_PROGRESS',
                'PASSED',
                'FAILED',
                'BLOCKED',
              ]),
            })
          )
          .min(1),
        linkedEpochRecords: z.string().optional(),
        githubReference: z.string().optional(),
        deviations: z.string().optional(),
        comments: z.string().optional(),
      })
      .parse(req.body);
    const result = deriveExecutionResult(
      body.steps.map((s) => ({ required: true, status: s.status }))
    );
    const updated = await tx(async (q) => {
      for (const s of body.steps)
        await q(
          `UPDATE qms_epoch_validation_execution_steps SET actual_result=$1,status=$2
      WHERE execution_id=$3 AND step_number=$4`,
          [s.actualResult, s.status, executionId, s.stepNumber]
        );
      const all = await q(
        `SELECT step_number,instruction_snapshot,expected_result_snapshot,actual_result,status,required
      FROM qms_epoch_validation_execution_steps WHERE execution_id=$1 ORDER BY step_number`,
        [executionId]
      );
      const derived = deriveExecutionResult(
        all.map((s) => ({ required: s.required, status: s.status }))
      );
      const snapshot = {
        protocolSteps: all,
        overallResult: derived,
        epochVersion: p.production_version,
      };
      const x = (
        await q(
          `UPDATE qms_epoch_validation_executions SET overall_result=$1,ended_at=CASE WHEN $1 IN ('PASSED','FAILED','BLOCKED') THEN now() ELSE ended_at END,
      linked_epoch_records=$2,github_reference=$3,deviations=$4,comments=$5,snapshot=$6::jsonb,snapshot_checksum=$7
      WHERE id=$8 AND package_id=$9 AND review_decision IS NULL RETURNING *`,
          [
            derived,
            body.linkedEpochRecords || null,
            body.githubReference || null,
            body.deviations || null,
            body.comments || null,
            JSON.stringify(snapshot),
            checksum(snapshot),
            executionId,
            p.id,
          ]
        )
      )[0];
      if (!x)
        throw Object.assign(new Error('Execution is immutable after review'), {
          status: 409,
        });
      if (['FAILED', 'BLOCKED'].includes(derived)) {
        const seq = (
          await q(
            `SELECT nextval('qms_epoch_validation_defect_number_seq') value`
          )
        )[0].value;
        const number = `ESD-${new Date().getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
        await q(
          `INSERT INTO qms_epoch_validation_defects
        (defect_number,package_id,failed_execution_id,module,description,severity,retest_required,created_by_user_id,updated_by_user_id)
        SELECT $1,$2,$3,p.module,$4,CASE WHEN p.criticality='CRITICAL' THEN 'CRITICAL' ELSE 'HIGH' END,true,$5,$5
        FROM qms_epoch_validation_protocols p JOIN qms_epoch_validation_executions e ON e.protocol_id=p.id WHERE e.id=$3
        ON CONFLICT(defect_number) DO NOTHING`,
          [
            number,
            p.id,
            executionId,
            `Automatically opened from ${x.execution_id} ${derived}`,
            actor(req).id,
          ]
        );
      }
      await logEvent(
        req,
        p,
        'EXECUTION',
        'TEST_EXECUTION_RECORDED',
        {
          entityId: executionId,
          next: { derivedResult: derived, clientCandidate: result },
        },
        q
      );
      return x;
    });
    res.json(updated);
  }
);
router.post(
  '/:id/executions/:recordId/review',
  requirePermission('EPOCH_VALIDATION_TEST_REVIEW'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const executionId = uuid.parse(req.params.recordId),
      a = actor(req);
    const body = z
      .object({
        decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
        comments: z.string().min(1),
      })
      .parse(req.body);
    const x = (
      await query(
        `UPDATE qms_epoch_validation_executions SET reviewer_user_id=$1,review_decision=$2,reviewed_at=now(),comments=concat_ws(E'\\n',comments,$3)
    WHERE id=$4 AND package_id=$5 AND overall_result NOT IN ('NOT_RUN','IN_PROGRESS') AND tester_user_id<>$1 AND review_decision IS NULL RETURNING *`,
        [a.id, body.decision, body.comments, executionId, p.id]
      )
    )[0];
    if (!x)
      return res.status(409).json({
        error: 'INDEPENDENT_REVIEW_REQUIRED_OR_EXECUTION_NOT_REVIEWABLE',
      });
    await logEvent(req, p, 'EXECUTION', 'EXECUTION_REVIEWED', {
      entityId: x.id,
      next: { decision: body.decision },
    });
    res.json(x);
  }
);

router.patch(
  '/:id/defects/:recordId',
  requirePermission('EPOCH_VALIDATION_DEFECT_MANAGE'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const recordId = uuid.parse(req.params.recordId),
      a = actor(req);
    const body = z
      .object({
        containment: z.string().optional(),
        rootCause: z.string().optional(),
        correctiveAction: z.string().optional(),
        ownerEmployeeId: z.number().int().positive().optional(),
        dueDate: z.string().date().optional(),
        githubReference: z.string().optional(),
        databaseMigrationReference: z.string().optional(),
        retestRequired: z.boolean().optional(),
        retestExecutionId: z.string().uuid().optional(),
        closureEvidence: z.string().optional(),
        status: z
          .enum([
            'OPEN',
            'CONTAINED',
            'CORRECTION_IN_PROGRESS',
            'READY_FOR_RETEST',
            'CLOSED',
            'CANCELLED',
          ])
          .optional(),
      })
      .parse(req.body);
    if (body.status === 'CLOSED') {
      const defect = (
        await query(
          'SELECT * FROM qms_epoch_validation_defects WHERE id=$1 AND package_id=$2',
          [recordId, p.id]
        )
      )[0];
      if (!defect)
        return res.status(404).json({ error: 'VALIDATION_DEFECT_NOT_FOUND' });
      if (
        defect.retest_required &&
        !body.retestExecutionId &&
        !defect.retest_execution_id
      )
        return res.status(409).json({ error: 'REQUIRED_RETEST_MISSING' });
    }
    const x = (
      await query(
        `UPDATE qms_epoch_validation_defects SET containment=COALESCE($1,containment),
    root_cause=COALESCE($2,root_cause),corrective_action=COALESCE($3,corrective_action),
    owner_employee_id=COALESCE($4,owner_employee_id),due_date=COALESCE($5,due_date),
    github_reference=COALESCE($6,github_reference),database_migration_reference=COALESCE($7,database_migration_reference),
    retest_required=COALESCE($8,retest_required),retest_execution_id=COALESCE($9,retest_execution_id),
    closure_evidence=COALESCE($10,closure_evidence),status=COALESCE($11,status),
    updated_by_user_id=$12,updated_at=now() WHERE id=$13 AND package_id=$14 RETURNING *`,
        [
          body.containment,
          body.rootCause,
          body.correctiveAction,
          body.ownerEmployeeId,
          body.dueDate,
          body.githubReference,
          body.databaseMigrationReference,
          body.retestRequired,
          body.retestExecutionId,
          body.closureEvidence,
          body.status,
          a.id,
          recordId,
          p.id,
        ]
      )
    )[0];
    if (!x)
      return res.status(404).json({ error: 'VALIDATION_DEFECT_NOT_FOUND' });
    await invalidateApprovals(p.id, 'Validation defect changed');
    await logEvent(req, p, 'DEFECT', 'DEFECT_UPDATED', {
      entityId: x.id,
      next: x,
    });
    res.json(x);
  }
);
router.post(
  '/:id/defects/:recordId/accept-limitation',
  requirePermission('EPOCH_VALIDATION_FINAL_APPROVE'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const recordId = uuid.parse(req.params.recordId);
    const body = z.object({ comments: z.string().min(20) }).parse(req.body);
    const defect = (
      await query(
        `UPDATE qms_epoch_validation_defects SET limitation_accepted=true,updated_at=now()
    WHERE id=$1 AND package_id=$2 AND severity='HIGH' AND status NOT IN ('CLOSED','CANCELLED') RETURNING *`,
        [recordId, p.id]
      )
    )[0];
    if (!defect)
      return res
        .status(409)
        .json({ error: 'ONLY_OPEN_HIGH_DEFECTS_MAY_BE_ACCEPTED' });
    await approve(
      req,
      p,
      'DEFECT_LIMITATION',
      defect.id,
      1,
      'QUALITY_MANAGEMENT',
      'Accepted documented high-severity limitation and residual risk',
      'EPOCH_VALIDATION_FINAL_APPROVE',
      body.comments
    );
    res.json(defect);
  }
);

router.post(
  '/:id/periodic-reviews',
  requirePermission('EPOCH_VALIDATION_EDIT'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const a = actor(req);
    const schema = z.object({
      reviewDate: z.string().date(),
      currentProductionVersion: z.string().min(1),
      previouslyApprovedVersion: z.string().min(1),
      changesSinceApproval: z.string().optional(),
      criticalChanges: z.string().optional(),
      databaseMigrations: z.string().optional(),
      securityAuthenticationChanges: z.string().optional(),
      hostingDatabaseChanges: z.string().optional(),
      backupRecoveryChanges: z.string().optional(),
      seriousDefectsIncidents: z.string().optional(),
      newOfficialQmsModules: z.string().optional(),
      auditFindings: z.string().optional(),
      customerFindings: z.string().optional(),
      revalidationRequired: z.boolean(),
      revalidationScope: z.string().optional(),
      nextReviewDate: z.string().date(),
    });
    const v = schema.parse(req.body),
      values = Object.values(v);
    const x = (
      await query(
        `INSERT INTO qms_epoch_validation_periodic_reviews
    (package_id,review_date,reviewer_user_id,current_production_version,previously_approved_version,
     changes_since_approval,critical_changes,database_migrations,security_authentication_changes,
     hosting_database_changes,backup_recovery_changes,serious_defects_incidents,new_official_qms_modules,
     audit_findings,customer_findings,revalidation_required,revalidation_scope,next_review_date)
    VALUES($1,$2,$3,${values
      .slice(1)
      .map((_, i) => `$${i + 4}`)
      .join(',')}) RETURNING *`,
        [p.id, v.reviewDate, a.id, ...values.slice(1)]
      )
    )[0];
    await logEvent(req, p, 'PERIODIC_REVIEW', 'PERIODIC_REVIEW_CREATED', {
      entityId: x.id,
      next: { revalidationRequired: v.revalidationRequired },
    });
    res.status(201).json(x);
  }
);

async function approve(
  req: Request,
  p: any,
  recordType: string,
  recordId: string,
  revision: number,
  role: string,
  meaning: string,
  capability: string,
  comments?: string
) {
  const a = actor(req),
    snap = {
      recordType,
      recordId,
      revision,
      packageRevision: p.revision,
      productionVersion: p.production_version,
    };
  await query(
    `INSERT INTO qms_epoch_validation_approvals
    (package_id,record_type,record_id,record_revision,approval_role,decision,meaning,actor_user_id,actor_employee_id,
     actor_display_name,actor_role,capability_used,comments,snapshot_checksum)
    VALUES($1,$2,$3,$4,$5,'APPROVED',$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT DO NOTHING`,
    [
      p.id,
      recordType,
      recordId,
      revision,
      role,
      meaning,
      a.id,
      a.employeeId,
      a.name,
      a.role,
      capability,
      comments || null,
      checksum(snap),
    ]
  );
  await logEvent(req, p, recordType, `${recordType}_APPROVED`, {
    entityId: recordId,
    next: { revision, role },
  });
}
router.post(
  '/:id/intended-use/:recordId/approve',
  requirePermission('EPOCH_VALIDATION_PLAN_APPROVE'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const recordId = uuid.parse(req.params.recordId);
    const body = z
      .object({
        approvalRole: z.enum(['EPOCH_IT_OWNER', 'QUALITY_APPROVER']),
        comments: z.string().optional(),
      })
      .parse(req.body);
    const record = (
      await query(
        'SELECT * FROM qms_epoch_validation_intended_use_revisions WHERE id=$1 AND package_id=$2',
        [recordId, p.id]
      )
    )[0];
    if (!record)
      return res.status(404).json({ error: 'INTENDED_USE_NOT_FOUND' });
    await approve(
      req,
      p,
      'INTENDED_USE',
      record.id,
      record.revision,
      body.approvalRole,
      'Approved Intended Use revision',
      'EPOCH_VALIDATION_PLAN_APPROVE',
      body.comments
    );
    const n = Number(
      (
        await query(
          `SELECT count(DISTINCT approval_role) n FROM qms_epoch_validation_approvals WHERE record_type='INTENDED_USE' AND record_id=$1 AND status='VALID' AND decision='APPROVED'`,
          [record.id]
        )
      )[0].n
    );
    if (n >= 2)
      await query(
        `UPDATE qms_epoch_validation_intended_use_revisions SET approval_status='APPROVED' WHERE id=$1`,
        [record.id]
      );
    res.json({ approvedRoles: n, complete: n >= 2 });
  }
);
router.post(
  '/:id/final-approvals',
  requirePermission('EPOCH_VALIDATION_FINAL_APPROVE'),
  async (req, res) => {
    const p = await editable(req, res);
    if (!p) return;
    const body = z
      .object({
        approvalRole: z.enum([
          'EPOCH_IT_OWNER',
          'VALIDATION_LEAD',
          'QUALITY_APPROVER',
          'PROCESS_OWNER',
          'TOP_MANAGEMENT',
        ]),
        outcome: z.enum([
          'APPROVED_FOR_INTENDED_USE',
          'APPROVED_WITH_LIMITATIONS',
          'REJECTED',
          'RETURNED_FOR_CORRECTION',
        ]),
        comments: z.string().min(1),
        approvedLimitations: z.string().optional(),
      })
      .parse(req.body);
    const packageGate = await packageReadiness(p);
    if (!packageGate.executionReady)
      return res.status(409).json({
        error: 'PACKAGE_FINAL_READINESS_BLOCKED',
        blockers: packageGate.blockers,
      });
    const incompleteProtocols = await query(
      `SELECT p.test_id,
    NOT EXISTS(SELECT 1 FROM qms_epoch_validation_executions e WHERE e.protocol_id=p.id
      AND e.overall_result IN ('PASSED','PASSED_WITH_APPROVED_DEVIATION')
      AND e.review_decision='APPROVED' AND e.snapshot_checksum IS NOT NULL) incomplete
    FROM qms_epoch_validation_protocols p WHERE p.package_id=$1 AND p.status='APPROVED'`,
      [p.id]
    );
    const missing = incompleteProtocols
      .filter((x) => x.incomplete)
      .map((x) => x.test_id);
    if (missing.length)
      return res.status(409).json({
        error: 'PROTOCOL_EXECUTION_OR_REVIEW_INCOMPLETE',
        protocols: missing,
      });
    const unresolvedDeviations = await query(
      `SELECT execution_id FROM qms_epoch_validation_executions
    WHERE package_id=$1 AND overall_result='PASSED_WITH_APPROVED_DEVIATION' AND review_decision<>'APPROVED'`,
      [p.id]
    );
    if (unresolvedDeviations.length)
      return res.status(409).json({
        error: 'UNRESOLVED_PROTOCOL_DEVIATIONS',
        executions: unresolvedDeviations.map((x) => x.execution_id),
      });
    const finalCounts = await counts(p.id);
    finalCounts.approvalsCurrent = true;
    const r = calculateReadiness(finalCounts);
    if (!r.ready && body.outcome.startsWith('APPROVED'))
      return res.status(409).json({ error: 'FINAL_READINESS_BLOCKED', ...r });
    const d = await detail(p.id),
      snap = {
        package: d?.package,
        intendedUse: d?.intendedUse[0],
        readiness: d?.readiness,
        requirements: d?.requirements,
        risks: d?.risks,
        plans: d?.plans,
        protocols: d?.protocols,
        executions: d?.executions,
        defects: d?.defects,
        limitations: body.approvedLimitations || null,
      };
    await approve(
      req,
      p,
      'FINAL',
      p.id,
      p.revision,
      body.approvalRole,
      `Authenticated ${body.outcome} decision for exact EPOCH version ${p.production_version}`,
      'EPOCH_VALIDATION_FINAL_APPROVE',
      body.comments
    );
    const required = body.outcome === 'APPROVED_WITH_LIMITATIONS' ? 4 : 3;
    const approvals = Number(
      (
        await query(
          `SELECT count(DISTINCT approval_role) n FROM qms_epoch_validation_approvals
    WHERE package_id=$1 AND record_type='FINAL' AND record_revision=$2 AND status='VALID' AND decision='APPROVED'`,
          [p.id, p.revision]
        )
      )[0].n
    );
    if (approvals >= required && body.outcome.startsWith('APPROVED')) {
      await tx(async (q) => {
        await q(
          `INSERT INTO qms_epoch_validation_snapshots
      (package_id,snapshot_type,package_revision,snapshot,checksum,created_by_user_id)
      VALUES($1,'FINAL_APPROVAL',$2,$3::jsonb,$4,$5) ON CONFLICT DO NOTHING`,
          [
            p.id,
            p.revision,
            JSON.stringify(snap),
            checksum(snap),
            actor(req).id,
          ]
        );
        await q(
          `UPDATE qms_epoch_validation_packages SET status=$1,locked_at=now(),actual_completion_date=current_date,
        updated_at=now() WHERE id=$2`,
          [body.outcome, p.id]
        );
      });
    } else if (!body.outcome.startsWith('APPROVED'))
      await query(
        `UPDATE qms_epoch_validation_packages SET status=$1 WHERE id=$2`,
        [
          body.outcome === 'RETURNED_FOR_CORRECTION'
            ? 'CORRECTIONS_REQUIRED'
            : 'REJECTED',
          p.id,
        ]
      );
    res.json({
      approvalCount: approvals,
      required,
      locked: approvals >= required && body.outcome.startsWith('APPROVED'),
    });
  }
);
router.post(
  '/:id/reopen',
  requirePermission('EPOCH_VALIDATION_REOPEN'),
  async (req, res) => {
    const id = uuid.parse(req.params.id),
      p = await getPackage(id);
    if (!p)
      return res.status(404).json({ error: 'VALIDATION_PACKAGE_NOT_FOUND' });
    const body = z.object({ reason: z.string().min(20) }).parse(req.body);
    const a = actor(req);
    const snapshot = (
      await query(
        `SELECT * FROM qms_epoch_validation_snapshots WHERE package_id=$1 AND snapshot_type='FINAL_APPROVAL' ORDER BY created_at DESC LIMIT 1`,
        [id]
      )
    )[0];
    if (!snapshot)
      return res.status(409).json({ error: 'APPROVED_SNAPSHOT_REQUIRED' });
    await tx(async (q) => {
      await invalidateApprovals(id, `Controlled reopening: ${body.reason}`, q);
      await q(
        `UPDATE qms_epoch_validation_packages SET status='CORRECTIONS_REQUIRED',locked_at=NULL,revision=revision+1,
      updated_by_user_id=$1,updated_by_display_name=$2,updated_at=now() WHERE id=$3`,
        [a.id, a.name, id]
      );
      await logEvent(
        req,
        p,
        'PACKAGE',
        'PACKAGE_REOPENED',
        { reason: body.reason, next: { preservedSnapshot: snapshot.id } },
        q
      );
    });
    res.json(await getPackage(id));
  }
);

router.get(
  '/:id/export',
  requirePermission('EPOCH_VALIDATION_EXPORT'),
  async (req, res) => {
    const id = uuid.parse(req.params.id),
      d = await detail(id);
    if (!d) return res.status(404).send('Validation package not found');
    const view = z
      .enum([
        'validation-plan',
        'requirements-matrix',
        'risk-register',
        'test-protocols',
        'test-executions',
        'defects',
        'summary',
        'complete-package',
      ])
      .catch('complete-package')
      .parse(req.query.view);
    const approved = [
      'APPROVED_FOR_INTENDED_USE',
      'APPROVED_WITH_LIMITATIONS',
    ].includes(d.package.status);
    const mark = approved
      ? 'CONTROLLED EPOCH SOFTWARE VALIDATION RECORD'
      : 'DRAFT - NOT APPROVED FOR INTENDED USE';
    const esc = (v: unknown) =>
      String(v ?? '').replace(
        /[&<>"']/g,
        (c) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[c]!
      );
    const table = (title: string, records: any[], fields: string[]) =>
      `<h2>${esc(title)}</h2><table><thead><tr>${fields.map((f) => `<th>${esc(f.replaceAll('_', ' '))}</th>`).join('')}</tr></thead><tbody>${records.map((x) => `<tr>${fields.map((f) => `<td>${esc(x[f])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const sections: Record<string, string> = {
      'validation-plan': table('Validation Plan', d.plans, [
        'revision',
        'status',
        'purpose',
        'scope',
        'included_modules',
        'excluded_modules',
        'acceptance_criteria',
      ]),
      'requirements-matrix': table(
        'Requirements Traceability Matrix',
        d.requirements,
        [
          'requirement_id',
          'module',
          'category',
          'statement',
          'criticality',
          'validation_method',
          'status',
        ]
      ),
      'risk-register': table('Risk Register', d.risks, [
        'risk_id',
        'module',
        'failure_mode',
        'potential_effect',
        'initial_risk_rating',
        'residual_risk',
        'status',
      ]),
      'test-protocols': table('Test Protocol Package', d.protocols, [
        'test_id',
        'title',
        'module',
        'criticality',
        'revision',
        'status',
      ]),
      'test-executions': table('Test Execution Report', d.executions, [
        'execution_id',
        'protocol_revision',
        'tester_display_name',
        'overall_result',
        'review_decision',
        'started_at',
        'ended_at',
      ]),
      defects: table('Validation Defect Report', d.defects, [
        'defect_number',
        'module',
        'severity',
        'description',
        'status',
        'retest_required',
      ]),
      summary: `<h2>Validation Summary</h2><pre>${esc(JSON.stringify(d.readiness, null, 2))}</pre>`,
      'complete-package': '',
    };
    const body =
      view === 'complete-package'
        ? Object.entries(sections)
            .filter(([k]) => k !== 'complete-package')
            .map(([, v]) => v)
            .join('')
        : sections[view];
    res.type('html')
      .send(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.package.package_number)}</title>
  <style>body{font:12px Arial;margin:32px;color:#172033}header{border-bottom:3px solid #214d74}h1,h2{color:#173f63}table{border-collapse:collapse;width:100%;margin:12px 0 24px}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}th{background:#edf4f8}.mark{font-weight:bold;padding:8px;border:2px solid #173f63}</style></head>
  <body><header><div class="mark">${mark}</div><h1>${esc(d.package.package_number)} - ${esc(d.package.title)}</h1>
  <p>Exact EPOCH version: ${esc(d.package.production_version)} | Commit/release: ${esc(d.package.commit_or_release_identifier || 'Not recorded')}</p></header>${body}
  <p>Attachment contents are excluded. Controlled evidence references remain available in EPOCH.</p></body></html>`);
  }
);

export async function getAuditReadinessValidationStatus(assessmentId: string) {
  const assessment = (
    await query(
      'SELECT id,epoch_version FROM qms_audit_readiness_assessments WHERE id=$1',
      [assessmentId]
    )
  )[0];
  if (!assessment) return null;
  const p = (
    await query(
      `SELECT * FROM qms_epoch_validation_packages WHERE audit_readiness_assessment_id=$1
    ORDER BY CASE WHEN status IN ('APPROVED_FOR_INTENDED_USE','APPROVED_WITH_LIMITATIONS') THEN 0 ELSE 1 END,updated_at DESC LIMIT 1`,
      [assessmentId]
    )
  )[0];
  if (!p)
    return {
      state: 'NOT_VALIDATED',
      message:
        'Not validated - create or link an EPOCH Software Validation Package.',
      package: null,
      complete: false,
      blockers: ['No linked validation package'],
    };
  const c = await counts(p.id),
    r = calculateReadiness(c);
  const review = (
    await query(
      `SELECT * FROM qms_epoch_validation_periodic_reviews WHERE package_id=$1 AND status='APPROVED' ORDER BY review_date DESC LIMIT 1`,
      [p.id]
    )
  )[0];
  const periodicCurrent =
    Boolean(review) &&
    new Date(review.next_review_date) >=
      new Date(new Date().toISOString().slice(0, 10));
  const versionMatches = p.production_version === assessment.epoch_version;
  const approved = [
    'APPROVED_FOR_INTENDED_USE',
    'APPROVED_WITH_LIMITATIONS',
  ].includes(p.status);
  const blockers = [
    ...r.blockers,
    ...(!approved ? ['Linked package is not approved for intended use'] : []),
    ...(!versionMatches
      ? ['Approved EPOCH version does not match the assessment']
      : []),
    ...(!periodicCurrent ? ['Periodic review is missing or overdue'] : []),
  ];
  return {
    state: blockers.length ? 'BLOCKED' : 'COMPLETE',
    message: blockers.length
      ? blockers.join('; ')
      : 'EPOCH intended-use validation is current.',
    package: {
      id: p.id,
      packageNumber: p.package_number,
      status: p.status,
      productionVersion: p.production_version,
    },
    assessmentVersion: assessment.epoch_version,
    versionMatches,
    periodicReviewCurrent: periodicCurrent,
    complete: blockers.length === 0,
    blockers,
    readiness: { ...c, ...r },
  };
}

export default router;
