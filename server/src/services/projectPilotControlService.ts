import crypto from 'crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import type { AuditLedgerTx } from './auditLedgerService';
import { resolveProjectWorkflowVersion } from './projectWorkflowVersionService';

type Executor = AuditLedgerTx;
type Row = Record<string, unknown>;

export type PilotActor = {
  userId: number;
  employeeId: number | null;
  username: string;
  displayName: string;
  role: string;
};

export type PilotScopeInput = {
  environment: string;
  workflowInstanceId: string;
  customerPoId: number;
  customerPoNumber: string;
  approvedPoLines: Array<{
    poLineId: number;
    partNumber: string;
    maximumQuantity: number;
  }>;
  configurationBaselineRevision: string;
  productionPlanRevision: number;
  wadRevision: number;
  authorizedParticipants: Array<{ userId: number; functionalRole: string }>;
  qualityApproverUserId: number;
  operationsApproverUserId: number;
  projectManagementApproverUserId: number;
  rolloutOwnerUserId: number;
  pilotStartDate: string;
  reviewExpiresAt: string;
  rollbackOwnerUserId: number;
  rollbackPlanReference: string;
  risksAndMitigations: Array<{
    risk: string;
    mitigation: string;
    ownerUserId: number;
  }>;
};

export type PilotActionContext = {
  environment?: string;
  poLineId?: number;
  partNumber?: string;
  quantity?: number;
  idempotencyKey: string;
  confirmation: string;
};

export const PILOT_TRAINING_TOPICS = Object.freeze([
  'ten_stage_workflow',
  'stage_ownership',
  'revision_and_staleness_controls',
  'evidence_requirements',
  'electronic_approvals',
  'holds_and_exceptions',
  'production_release_vs_launch',
  'production_execution',
  'quality_and_product_release',
  'shipment_authorization_vs_confirmation',
  'delivery_and_pod',
  'project_closing',
  'controlled_reopening',
  'issue_escalation',
  'rollback_and_recovery',
  'data_integrity_and_audit_records',
]);

export const PILOT_READINESS_KEYS = Object.freeze([
  'customer_po_lines_approved',
  'contract_review_complete',
  'technical_configuration_review_complete',
  'drawings_specifications_current',
  'bom_routing_approved',
  'production_plan_approved',
  'wad_approved',
  'preproduction_evidence_complete',
  'material_traceability_defined',
  'special_process_sources_approved',
  'personnel_qualifications_current',
  'tooling_equipment_available',
  'calibration_satisfied',
  'inspection_sampling_defined',
  'key_characteristics_controlled',
  'product_safety_controls_satisfied',
  'users_capabilities_assigned',
  'training_complete',
  'no_blocking_quality_or_risk_records',
  'serialization_quantity_controls_defined',
  'rollback_recovery_documented',
  'required_pilot_approvals_complete',
]);

export const PILOT_EVIDENCE_CATEGORIES = Object.freeze([
  'customer_requirements',
  'contract_review',
  'technical_configuration_baseline',
  'drawings_specifications',
  'bom_routing',
  'production_plan',
  'wad',
  'preproduction_readiness',
  'production_release',
  'production_orders',
  'serialized_units',
  'material_lot_traceability',
  'travelers_work_orders',
  'personnel_qualifications',
  'equipment_calibration',
  'special_processes',
  'inspection_results',
  'ncr_holds_deviations_concessions',
  'product_release',
  'packaging_preservation',
  'shipment',
  'delivery_pod',
  'quantity_reconciliation',
  'closing_approvals',
  'audit_history',
]);

const transitions: Record<string, readonly string[]> = {
  DRAFT: ['PENDING_READINESS', 'CANCELLED'],
  PENDING_READINESS: ['PENDING_APPROVAL', 'DRAFT', 'CANCELLED'],
  PENDING_APPROVAL: ['AUTHORIZED', 'DRAFT', 'CANCELLED'],
  AUTHORIZED: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};

const rows = <T extends Row>(result: unknown): T[] => {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === 'object' &&
    Array.isArray((result as { rows?: unknown }).rows)
  )
    return (result as { rows: T[] }).rows;
  return [];
};

const normalizedEnvironment = () =>
  process.env.P2_V2_PILOT_ENVIRONMENT ??
  process.env.DEPLOYMENT_ENVIRONMENT ??
  process.env.NODE_ENV ??
  'development';

const scopePayload = (input: PilotScopeInput) => ({
  environment: input.environment,
  workflowInstanceId: input.workflowInstanceId,
  customerPoId: input.customerPoId,
  customerPoNumber: input.customerPoNumber,
  approvedPoLines: [...input.approvedPoLines].sort(
    (a, b) => a.poLineId - b.poLineId
  ),
  configurationBaselineRevision: input.configurationBaselineRevision,
  productionPlanRevision: input.productionPlanRevision,
  wadRevision: input.wadRevision,
  authorizedParticipants: [...input.authorizedParticipants].sort(
    (a, b) =>
      a.userId - b.userId || a.functionalRole.localeCompare(b.functionalRole)
  ),
  requiredApprovers: [
    input.qualityApproverUserId,
    input.operationsApproverUserId,
    input.projectManagementApproverUserId,
    input.rolloutOwnerUserId,
  ],
});

const hash = (value: unknown) =>
  crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class ProjectPilotControlError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ProjectPilotControlError';
  }
}

async function current(projectId: string, tx: Executor = db, lock = false) {
  return (
    rows(
      await tx.execute(sql`
      SELECT * FROM project_pilot_authorizations
      WHERE project_id=${projectId}
      ORDER BY revision_number DESC
      LIMIT 1 ${lock ? sql`FOR UPDATE` : sql``}`)
    )[0] ?? null
  );
}

async function event(
  pilot: Row,
  eventType: string,
  actor: PilotActor,
  meaning: string,
  reason: string | null,
  evidence: Record<string, unknown>,
  tx: Executor,
  fromStatus?: string,
  toStatus?: string,
  idempotencyKey?: string
) {
  await tx.execute(sql`
    INSERT INTO project_pilot_events
      (pilot_authorization_id,project_id,event_type,from_status,to_status,
       authorization_revision,actor_user_id,actor_role,meaning,reason,evidence,idempotency_key)
    VALUES (${pilot.id},${pilot.project_id},${eventType},${fromStatus ?? null},
      ${toStatus ?? null},${Number(pilot.revision_number)},${actor.userId},${actor.role},
      ${meaning},${reason},${JSON.stringify(evidence)}::jsonb,${idempotencyKey ?? null})
    ON CONFLICT (pilot_authorization_id,idempotency_key) WHERE idempotency_key IS NOT NULL
    DO NOTHING`);
}

async function transition(
  pilot: Row,
  next: string,
  actor: PilotActor,
  meaning: string,
  reason: string | null,
  tx: Executor,
  idempotencyKey?: string
) {
  const from = String(pilot.status);
  if (!transitions[from]?.includes(next))
    throw new ProjectPilotControlError(
      'INVALID_PILOT_TRANSITION',
      `Pilot transition ${from} to ${next} is not permitted.`,
      409,
      { from, to: next }
    );
  await tx.execute(
    sql`SELECT set_config('epoch.pilot_transition','allowed',true)`
  );
  const timestampColumn: Record<string, string> = {
    AUTHORIZED: 'authorized_at',
    ACTIVE: 'activated_at',
    PAUSED: 'paused_at',
    COMPLETED: 'completed_at',
    CANCELLED: 'cancelled_at',
    EXPIRED: 'expired_at',
  };
  const stamp = timestampColumn[next];
  await tx.execute(sql`
    UPDATE project_pilot_authorizations
    SET status=${next},lock_version=lock_version+1,updated_at=now(),
      approved_scope_hash=CASE WHEN ${next}='AUTHORIZED' THEN scope_hash ELSE approved_scope_hash END
      ${stamp ? sql.raw(`,${stamp}=now()`) : sql``}
    WHERE id=${pilot.id}`);
  await event(
    pilot,
    `PILOT_${next}`,
    actor,
    meaning,
    reason,
    { from, to: next },
    tx,
    from,
    next,
    idempotencyKey
  );
}

async function baseContext(projectId: string, tx: Executor, lock = false) {
  const project = rows(
    await tx.execute(sql`
      SELECT id,workflow_version,po_id,current_stage FROM projects
      WHERE id=${projectId} ${lock ? sql`FOR UPDATE` : sql``}`)
  )[0];
  if (!project)
    throw new ProjectPilotControlError(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      404
    );
  const version = resolveProjectWorkflowVersion(project.workflow_version);
  if (version !== 'p2_v2')
    throw new ProjectPilotControlError(
      'P2_V2_REQUIRED',
      'Pilot authorization requires an explicit p2_v2 project.',
      409,
      { effectiveWorkflowVersion: version }
    );
  const instances = rows(
    await tx.execute(sql`
      SELECT * FROM project_workflow_instances
      WHERE project_id=${projectId} AND workflow_version='p2_v2'
        AND status NOT IN ('SUPERSEDED','CANCELLED')`)
  );
  if (instances.length !== 1 || Number(instances[0].definition_version) !== 2)
    throw new ProjectPilotControlError(
      'CURRENT_P2_V2_INSTANCE_REQUIRED',
      'Exactly one current p2_v2 definition-version 2 workflow instance is required.'
    );
  return { project, instance: instances[0] };
}

export async function createPilotDraft(
  projectId: string,
  input: PilotScopeInput,
  actor: PilotActor
) {
  return db.transaction(async (tx) => {
    const ctx = await baseContext(projectId, tx, true);
    if (String(ctx.instance.id) !== input.workflowInstanceId)
      throw new ProjectPilotControlError(
        'WORKFLOW_INSTANCE_MISMATCH',
        'The pilot workflow instance does not match the project.'
      );
    if (Number(ctx.project.po_id) !== input.customerPoId)
      throw new ProjectPilotControlError(
        'CUSTOMER_PO_MISMATCH',
        'The pilot customer PO does not match the project.'
      );
    const scopedLines = rows(
      await tx.execute(sql`
        SELECT id,part_number,quantity FROM p2_purchase_order_items
        WHERE po_id=${input.customerPoId}`)
    );
    for (const approved of input.approvedPoLines) {
      const source = scopedLines.find(
        (line) => Number(line.id) === approved.poLineId
      );
      if (
        !source ||
        String(source.part_number).trim().toLowerCase() !==
          approved.partNumber.trim().toLowerCase() ||
        approved.maximumQuantity > Number(source.quantity)
      )
        throw new ProjectPilotControlError(
          'CUSTOMER_PO_SCOPE_MISMATCH',
          'Approved pilot lines, parts, and quantities must match the authoritative customer PO.'
        );
    }
    const plan = rows(
      await tx.execute(sql`
        SELECT revision_number,configuration_revision,status FROM project_production_plans
        WHERE project_id=${projectId} AND workflow_instance_id=${input.workflowInstanceId}
          AND status<>'SUPERSEDED'`)
    )[0];
    const wad = rows(
      await tx.execute(sql`
        SELECT wad_revision,production_plan_revision,configuration_revision,status
        FROM project_wad_authorizations
        WHERE project_id=${projectId} AND workflow_instance_id=${input.workflowInstanceId}
          AND status<>'SUPERSEDED'`)
    )[0];
    if (
      !plan ||
      !wad ||
      Number(plan.revision_number) !== input.productionPlanRevision ||
      Number(wad.production_plan_revision) !== input.productionPlanRevision ||
      Number(wad.wad_revision) !== input.wadRevision ||
      String(plan.configuration_revision) !==
        input.configurationBaselineRevision ||
      String(wad.configuration_revision) !==
        input.configurationBaselineRevision ||
      !['APPROVED', 'RELEASED'].includes(String(plan.status)) ||
      !['APPROVED', 'RELEASED'].includes(String(wad.status))
    )
      throw new ProjectPilotControlError(
        'UPSTREAM_REVISION_MISMATCH',
        'Pilot authorization requires current approved Production Plan, WAD, and configuration revisions.'
      );
    if (input.environment !== normalizedEnvironment())
      throw new ProjectPilotControlError(
        'ENVIRONMENT_MISMATCH',
        'Pilot environment must exactly match the current environment.'
      );
    if (!input.approvedPoLines.length)
      throw new ProjectPilotControlError(
        'PILOT_SCOPE_REQUIRED',
        'At least one approved PO line is required.'
      );
    if (
      input.approvedPoLines.some(
        (line) =>
          !line.poLineId || !line.partNumber.trim() || line.maximumQuantity <= 0
      )
    )
      throw new ProjectPilotControlError(
        'INVALID_PILOT_SCOPE',
        'Every pilot PO line requires a part and positive maximum quantity.'
      );
    const designated = [
      input.qualityApproverUserId,
      input.operationsApproverUserId,
      input.projectManagementApproverUserId,
      input.rolloutOwnerUserId,
    ];
    if (new Set(designated).size !== designated.length)
      throw new ProjectPilotControlError(
        'SEGREGATION_OF_DUTIES_REQUIRED',
        'Quality, Operations, Project Management, and rollout approvals require independent users.'
      );
    const prior = await current(projectId, tx, true);
    if (
      prior &&
      !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(String(prior.status))
    )
      throw new ProjectPilotControlError(
        'CURRENT_PILOT_EXISTS',
        'A current pilot authorization already exists for this project.'
      );
    const revision = prior ? Number(prior.revision_number) + 1 : 1;
    const payload = scopePayload(input);
    const scopeHash = hash(payload);
    const pilot = rows(
      await tx.execute(sql`
        INSERT INTO project_pilot_authorizations
          (authorization_number,environment,project_id,workflow_instance_id,
           customer_po_id,customer_po_number,approved_po_lines,approved_part_numbers,
           maximum_quantities,workflow_version,definition_version,
           configuration_baseline_revision,production_plan_revision,wad_revision,
           authorized_participants,quality_approver_user_id,operations_approver_user_id,
           project_management_approver_user_id,rollout_owner_user_id,pilot_start_date,
           review_expires_at,rollback_owner_user_id,rollback_plan_reference,
           risks_and_mitigations,revision_number,scope_hash,created_by)
        VALUES (${`PILOT-${projectId.slice(0, 8)}-R${revision}`},${input.environment},
          ${projectId},${input.workflowInstanceId},${input.customerPoId},
          ${input.customerPoNumber},${JSON.stringify(input.approvedPoLines)}::jsonb,
          ${JSON.stringify([...new Set(input.approvedPoLines.map((line) => line.partNumber))])}::jsonb,
          ${JSON.stringify(Object.fromEntries(input.approvedPoLines.map((line) => [String(line.poLineId), line.maximumQuantity])))}::jsonb,
          'p2_v2',2,${input.configurationBaselineRevision},${input.productionPlanRevision},
          ${input.wadRevision},${JSON.stringify(input.authorizedParticipants)}::jsonb,
          ${input.qualityApproverUserId},${input.operationsApproverUserId},
          ${input.projectManagementApproverUserId},${input.rolloutOwnerUserId},
          ${input.pilotStartDate}::date,${input.reviewExpiresAt}::timestamptz,
          ${input.rollbackOwnerUserId},${input.rollbackPlanReference},
          ${JSON.stringify(input.risksAndMitigations)}::jsonb,${revision},${scopeHash},
          ${actor.userId})
        RETURNING *`)
    )[0];
    await event(
      pilot,
      'PILOT_DRAFT_CREATED',
      actor,
      'Create a revision-controlled controlled-pilot authorization draft.',
      null,
      { scopeHash, noDeploymentSecretsStored: true },
      tx
    );
    return getPilotDashboard(projectId, tx);
  });
}

export async function recordReadinessEvidence(
  projectId: string,
  entries: Array<{
    checklistKey: string;
    status: string;
    authoritativeRecordType: string;
    authoritativeRecordId: string;
    authoritativeRevision: string;
    evidenceReference: string;
    responsibleFunction: string;
    correctionLocation: string;
    explanation: string;
  }>,
  expectedLockVersion: number,
  actor: PilotActor
) {
  return db.transaction(async (tx) => {
    const pilot = await current(projectId, tx, true);
    if (
      !pilot ||
      !['DRAFT', 'PENDING_READINESS'].includes(String(pilot.status))
    )
      throw new ProjectPilotControlError(
        'PILOT_DRAFT_REQUIRED',
        'Readiness evidence can be updated only before approval.'
      );
    if (Number(pilot.lock_version) !== expectedLockVersion)
      throw new ProjectPilotControlError(
        'STALE_PILOT_REVISION',
        'Reload the pilot authorization.'
      );
    const supplied = new Set(entries.map((entry) => entry.checklistKey));
    if (
      entries.some(
        (entry) => !PILOT_READINESS_KEYS.includes(entry.checklistKey as never)
      )
    )
      throw new ProjectPilotControlError(
        'UNKNOWN_CHECKLIST_KEY',
        'Unknown pilot readiness key.'
      );
    for (const entry of entries) {
      await tx.execute(sql`
        INSERT INTO project_pilot_readiness_evidence
          (pilot_authorization_id,checklist_key,status,authoritative_record_type,
           authoritative_record_id,authoritative_revision,evidence_reference,
           responsible_function,correction_location,explanation,evaluated_at)
        VALUES (${pilot.id},${entry.checklistKey},${entry.status},
          ${entry.authoritativeRecordType},${entry.authoritativeRecordId},
          ${entry.authoritativeRevision},${entry.evidenceReference},
          ${entry.responsibleFunction},${entry.correctionLocation},${entry.explanation},now())
        ON CONFLICT (pilot_authorization_id,checklist_key) DO UPDATE SET
          status=EXCLUDED.status,authoritative_record_type=EXCLUDED.authoritative_record_type,
          authoritative_record_id=EXCLUDED.authoritative_record_id,
          authoritative_revision=EXCLUDED.authoritative_revision,
          evidence_reference=EXCLUDED.evidence_reference,
          responsible_function=EXCLUDED.responsible_function,
          correction_location=EXCLUDED.correction_location,
          explanation=EXCLUDED.explanation,evaluated_at=now()`);
    }
    if (String(pilot.status) === 'DRAFT' && supplied.size)
      await transition(
        pilot,
        'PENDING_READINESS',
        actor,
        'Begin server-evaluated pilot readiness review.',
        null,
        tx
      );
    return getPilotDashboard(projectId, tx);
  });
}

export async function recordTrainingAcknowledgment(
  projectId: string,
  input: {
    userId: number;
    functionalRole: string;
    trainingVersion: string;
    completedAt: string;
    expiresAt?: string;
    trainerUserId: number;
    acknowledgmentMeaning: string;
    evidenceReference: string;
    topics: string[];
  },
  actor: PilotActor
) {
  return db.transaction(async (tx) => {
    const pilot = await current(projectId, tx, true);
    if (!pilot)
      throw new ProjectPilotControlError(
        'PILOT_NOT_FOUND',
        'Pilot authorization not found.',
        404
      );
    const missing = PILOT_TRAINING_TOPICS.filter(
      (topic) => !input.topics.includes(topic)
    );
    if (missing.length)
      throw new ProjectPilotControlError(
        'PILOT_TRAINING_INCOMPLETE',
        'The complete controlled-pilot training curriculum is required.',
        409,
        { missingTopics: missing }
      );
    await tx.execute(sql`
      INSERT INTO project_pilot_training_acknowledgments
        (pilot_authorization_id,user_id,functional_role,training_version,completed_at,
         expires_at,trainer_user_id,acknowledgment_meaning,evidence_reference,topics)
      VALUES (${pilot.id},${input.userId},${input.functionalRole},${input.trainingVersion},
        ${input.completedAt}::timestamptz,${input.expiresAt ?? null}::timestamptz,
        ${input.trainerUserId},${input.acknowledgmentMeaning},${input.evidenceReference},
        ${JSON.stringify(input.topics)}::jsonb)
      ON CONFLICT (pilot_authorization_id,user_id,functional_role,training_version)
      DO NOTHING`);
    await event(
      pilot,
      'PILOT_TRAINING_LINKED',
      actor,
      'Link authoritative controlled-pilot training evidence.',
      null,
      { userId: input.userId, trainingVersion: input.trainingVersion },
      tx
    );
    return getPilotDashboard(projectId, tx);
  });
}

export async function submitPilotForApproval(
  projectId: string,
  expectedLockVersion: number,
  actor: PilotActor
) {
  return db.transaction(async (tx) => {
    const pilot = await current(projectId, tx, true);
    if (!pilot || String(pilot.status) !== 'PENDING_READINESS')
      throw new ProjectPilotControlError(
        'PENDING_READINESS_REQUIRED',
        'Pilot readiness review is not current.'
      );
    if (Number(pilot.lock_version) !== expectedLockVersion)
      throw new ProjectPilotControlError(
        'STALE_PILOT_REVISION',
        'Reload the pilot authorization.'
      );
    const readiness = await evaluatePilotReadiness(projectId, tx);
    const preApprovalBlockers = readiness.blockers.filter(
      (blocker) => blocker.key !== 'required_pilot_approvals_complete'
    );
    if (preApprovalBlockers.length)
      throw new ProjectPilotControlError(
        'PILOT_NOT_READY',
        'Pilot readiness is blocked.',
        409,
        { blockers: preApprovalBlockers }
      );
    await transition(
      pilot,
      'PENDING_APPROVAL',
      actor,
      'Submit the current pilot authorization revision for independent approvals.',
      null,
      tx
    );
    await tx.execute(sql`
      UPDATE project_pilot_authorizations SET submitted_at=now()
      WHERE id=${pilot.id}`);
    return getPilotDashboard(projectId, tx);
  });
}

const approvalColumn: Record<string, string> = {
  QUALITY: 'quality_approver_user_id',
  OPERATIONS: 'operations_approver_user_id',
  PROJECT_MANAGEMENT: 'project_management_approver_user_id',
  ROLLOUT_OWNER: 'rollout_owner_user_id',
};

export async function decidePilotApproval(
  projectId: string,
  approvalType: keyof typeof approvalColumn,
  input: {
    decision: 'APPROVED' | 'REJECTED' | 'RETURNED';
    signatureMeaning: string;
    evidenceReference: string;
  },
  actor: PilotActor
) {
  return db.transaction(async (tx) => {
    const pilot = await current(projectId, tx, true);
    if (!pilot || String(pilot.status) !== 'PENDING_APPROVAL')
      throw new ProjectPilotControlError(
        'PENDING_APPROVAL_REQUIRED',
        'Pilot authorization is not pending approval.'
      );
    if (Number(pilot[approvalColumn[approvalType]]) !== actor.userId)
      throw new ProjectPilotControlError(
        'DESIGNATED_APPROVER_REQUIRED',
        `Only the designated ${approvalType} approver may decide this approval.`,
        403
      );
    await tx.execute(sql`
      INSERT INTO project_pilot_approvals
        (pilot_authorization_id,authorization_revision,approval_type,decision,
         signature_meaning,evidence_reference,actor_user_id,actor_employee_id,actor_role)
      VALUES (${pilot.id},${Number(pilot.revision_number)},${approvalType},${input.decision},
        ${input.signatureMeaning},${input.evidenceReference},${actor.userId},
        ${actor.employeeId},${actor.role})`);
    await event(
      pilot,
      'PILOT_APPROVAL_DECIDED',
      actor,
      input.signatureMeaning,
      null,
      {
        approvalType,
        decision: input.decision,
        evidenceReference: input.evidenceReference,
      },
      tx
    );
    return getPilotDashboard(projectId, tx);
  });
}

export async function authorizePilot(
  projectId: string,
  expectedLockVersion: number,
  actor: PilotActor
) {
  return db.transaction(async (tx) => {
    const pilot = await current(projectId, tx, true);
    if (!pilot || String(pilot.status) !== 'PENDING_APPROVAL')
      throw new ProjectPilotControlError(
        'PENDING_APPROVAL_REQUIRED',
        'Pilot authorization is not pending approval.'
      );
    if (Number(pilot.lock_version) !== expectedLockVersion)
      throw new ProjectPilotControlError(
        'STALE_PILOT_REVISION',
        'Reload the pilot authorization.'
      );
    const approvals = rows(
      await tx.execute(sql`
        SELECT approval_type,decision,actor_user_id FROM project_pilot_approvals
        WHERE pilot_authorization_id=${pilot.id}
          AND authorization_revision=${Number(pilot.revision_number)}`)
    );
    const required = Object.keys(approvalColumn);
    const missing = required.filter(
      (type) =>
        !approvals.some(
          (approval) =>
            approval.approval_type === type && approval.decision === 'APPROVED'
        )
    );
    if (missing.length)
      throw new ProjectPilotControlError(
        'PILOT_APPROVALS_REQUIRED',
        'All four independent pilot approvals are required.',
        409,
        { missingApprovals: missing }
      );
    if (
      new Set(approvals.map((approval) => Number(approval.actor_user_id)))
        .size !== 4
    )
      throw new ProjectPilotControlError(
        'SEGREGATION_OF_DUTIES_REQUIRED',
        'Pilot approvals must be recorded by four independent users.'
      );
    await transition(
      pilot,
      'AUTHORIZED',
      actor,
      'Authorize the exact controlled-pilot scope and revision.',
      null,
      tx
    );
    return getPilotDashboard(projectId, tx);
  });
}

export async function transitionPilot(
  projectId: string,
  next: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED',
  input: {
    expectedLockVersion: number;
    meaning: string;
    reason: string;
    idempotencyKey: string;
  },
  actor: PilotActor
) {
  return db.transaction(async (tx) => {
    const pilot = await current(projectId, tx, true);
    if (!pilot)
      throw new ProjectPilotControlError(
        'PILOT_NOT_FOUND',
        'Pilot authorization not found.',
        404
      );
    if (Number(pilot.lock_version) !== input.expectedLockVersion)
      throw new ProjectPilotControlError(
        'STALE_PILOT_REVISION',
        'Reload the pilot authorization.'
      );
    if (next === 'ACTIVE') {
      if (Number(pilot.rollout_owner_user_id) !== actor.userId)
        throw new ProjectPilotControlError(
          'ROLLOUT_OWNER_REQUIRED',
          'Only the designated rollout owner may activate or resume the pilot.',
          403
        );
      if (String(pilot.environment) !== normalizedEnvironment())
        throw new ProjectPilotControlError(
          'ENVIRONMENT_MISMATCH',
          'Pilot environment mismatch.'
        );
      if (new Date(String(pilot.review_expires_at)).getTime() <= Date.now())
        throw new ProjectPilotControlError(
          'PILOT_EXPIRED',
          'Pilot authorization has expired.'
        );
    }
    await transition(
      pilot,
      next,
      actor,
      input.meaning,
      input.reason,
      tx,
      input.idempotencyKey
    );
    return getPilotDashboard(projectId, tx);
  });
}

export async function recordPilotIssue(
  projectId: string,
  input: {
    workflowStage: string;
    severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
    category: string;
    description: string;
    affectedRecordType: string;
    affectedRecordId: string;
    affectedRevision: string;
    containment: string;
    ownerUserId: number;
  },
  actor: PilotActor
) {
  return db.transaction(async (tx) => {
    const pilot = await current(projectId, tx, true);
    if (!pilot)
      throw new ProjectPilotControlError(
        'PILOT_NOT_FOUND',
        'Pilot authorization not found.',
        404
      );
    const count = rows(
      await tx.execute(
        sql`SELECT count(*)::int AS count FROM project_pilot_issues`
      )
    )[0];
    const issueNumber = `PILOT-ISSUE-${String(Number(count?.count ?? 0) + 1).padStart(6, '0')}`;
    await tx.execute(sql`
      INSERT INTO project_pilot_issues
        (issue_number,pilot_authorization_id,workflow_stage,severity,category,
         description,affected_record_type,affected_record_id,affected_revision,
         reporter_user_id,containment,owner_user_id)
      VALUES (${issueNumber},${pilot.id},${input.workflowStage},${input.severity},
        ${input.category},${input.description},${input.affectedRecordType},
        ${input.affectedRecordId},${input.affectedRevision},${actor.userId},
        ${input.containment},${input.ownerUserId})`);
    if (
      ['CRITICAL', 'MAJOR'].includes(input.severity) &&
      String(pilot.status) === 'ACTIVE'
    )
      await transition(
        pilot,
        'PAUSED',
        actor,
        'Pause consequential pilot actions for a blocking issue.',
        `${issueNumber}: ${input.description}`,
        tx
      );
    await event(
      pilot,
      'PILOT_ISSUE_RECORDED',
      actor,
      'Record a controlled pilot issue without bypassing workflow gates.',
      input.description,
      { issueNumber, severity: input.severity, category: input.category },
      tx
    );
    return getPilotDashboard(projectId, tx);
  });
}

export async function closePilotIssue(
  projectId: string,
  issueId: string,
  input: {
    rootCause: string;
    correctiveAction: string;
    retestEvidence: string;
  },
  actor: PilotActor
) {
  return db.transaction(async (tx) => {
    const pilot = await current(projectId, tx, true);
    if (!pilot)
      throw new ProjectPilotControlError(
        'PILOT_NOT_FOUND',
        'Pilot authorization not found.',
        404
      );
    const issue = rows(
      await tx.execute(sql`
        UPDATE project_pilot_issues SET status='CLOSED',root_cause=${input.rootCause},
          corrective_action=${input.correctiveAction},retest_evidence=${input.retestEvidence},
          closure_approved_by=${actor.userId},closure_approved_at=now()
        WHERE id=${issueId} AND pilot_authorization_id=${pilot.id}
          AND status<>'CLOSED' RETURNING *`)
    )[0];
    if (!issue)
      throw new ProjectPilotControlError(
        'PILOT_ISSUE_NOT_FOUND',
        'Open pilot issue not found.',
        404
      );
    await event(
      pilot,
      'PILOT_ISSUE_CLOSED',
      actor,
      'Approve corrective action and retest evidence for pilot issue closure.',
      null,
      { issueId, retestEvidence: input.retestEvidence },
      tx
    );
    return getPilotDashboard(projectId, tx);
  });
}

export async function addPilotEvidenceManifest(
  projectId: string,
  entries: Array<{
    category: string;
    authoritativeRecordType: string;
    authoritativeRecordId: string;
    authoritativeRevision: string;
    evidenceReference: string;
    immutableHash?: string;
  }>,
  actor: PilotActor
) {
  return db.transaction(async (tx) => {
    const pilot = await current(projectId, tx, true);
    if (!pilot)
      throw new ProjectPilotControlError(
        'PILOT_NOT_FOUND',
        'Pilot authorization not found.',
        404
      );
    if (
      entries.some(
        (entry) => !PILOT_EVIDENCE_CATEGORIES.includes(entry.category as never)
      )
    )
      throw new ProjectPilotControlError(
        'UNKNOWN_EVIDENCE_CATEGORY',
        'Unknown pilot evidence category.'
      );
    for (const entry of entries)
      await tx.execute(sql`
        INSERT INTO project_pilot_evidence_manifest
          (pilot_authorization_id,category,authoritative_record_type,
           authoritative_record_id,authoritative_revision,evidence_reference,immutable_hash)
        VALUES (${pilot.id},${entry.category},${entry.authoritativeRecordType},
          ${entry.authoritativeRecordId},${entry.authoritativeRevision},
          ${entry.evidenceReference},${entry.immutableHash ?? null})
        ON CONFLICT DO NOTHING`);
    await event(
      pilot,
      'PILOT_EVIDENCE_MANIFEST_UPDATED',
      actor,
      'Link immutable references to authoritative pilot evidence.',
      null,
      { categories: entries.map((entry) => entry.category) },
      tx
    );
    return getPilotDashboard(projectId, tx);
  });
}

export async function evaluatePilotReadiness(
  projectId: string,
  tx: Executor = db
) {
  const pilot = await current(projectId, tx);
  if (!pilot)
    return {
      ready: false,
      blockers: [{ key: 'pilot', reason: 'No pilot authorization exists.' }],
    };
  const evidence = rows(
    await tx.execute(sql`
      SELECT * FROM project_pilot_readiness_evidence
      WHERE pilot_authorization_id=${pilot.id} ORDER BY checklist_key`)
  );
  const blockers = PILOT_READINESS_KEYS.flatMap((key) => {
    const item = evidence.find((entry) => entry.checklist_key === key);
    return !item || item.status !== 'CURRENT'
      ? [
          {
            key,
            reason: item
              ? String(item.explanation)
              : 'Required evidence is missing.',
            responsibleFunction:
              item?.responsible_function ?? 'Pilot administrator',
            correctionLocation:
              item?.correction_location ?? 'Pilot control center',
            status: item?.status ?? 'MISSING',
          },
        ]
      : [];
  });
  return { ready: blockers.length === 0, blockers, evidence };
}

export async function requireActivePilotForAction(
  projectId: string,
  action: string,
  actor: PilotActor,
  context: PilotActionContext,
  tx: Executor = db
) {
  if (!context.idempotencyKey?.trim() || !context.confirmation?.trim())
    throw new ProjectPilotControlError(
      'PILOT_CONFIRMATION_REQUIRED',
      'Explicit confirmation and an idempotency key are required for pilot actions.',
      400
    );
  const ctx = await baseContext(projectId, tx);
  const pilot = await current(projectId, tx);
  if (!pilot || String(pilot.status) !== 'ACTIVE')
    throw new ProjectPilotControlError(
      'ACTIVE_PILOT_REQUIRED',
      'A current ACTIVE pilot authorization is required for this project.',
      403
    );
  const requestEvidence = {
    action,
    poLineId: context.poLineId,
    partNumber: context.partNumber,
    quantity: context.quantity,
    confirmation: context.confirmation,
  };
  const requestHash = hash(requestEvidence);
  const priorKey = rows(
    await tx.execute(sql`
      SELECT evidence FROM project_pilot_events
      WHERE pilot_authorization_id=${pilot.id}
        AND idempotency_key=${context.idempotencyKey} LIMIT 1`)
  )[0];
  if (
    priorKey &&
    String((priorKey.evidence as { requestHash?: string }).requestHash) !==
      requestHash
  )
    throw new ProjectPilotControlError(
      'PILOT_IDEMPOTENCY_CONFLICT',
      'The pilot idempotency key was already used for a different request.',
      409
    );
  const environment = context.environment ?? normalizedEnvironment();
  if (
    String(pilot.environment) !== environment ||
    environment !== normalizedEnvironment()
  )
    throw new ProjectPilotControlError(
      'ENVIRONMENT_MISMATCH',
      'Pilot environment mismatch.',
      403
    );
  if (
    String(pilot.workflow_instance_id) !== String(ctx.instance.id) ||
    String(pilot.workflow_version) !== 'p2_v2' ||
    Number(pilot.definition_version) !== 2
  )
    throw new ProjectPilotControlError(
      'PILOT_WORKFLOW_MISMATCH',
      'Pilot workflow identity is stale or inconsistent.',
      403
    );
  if (String(pilot.scope_hash) !== String(pilot.approved_scope_hash))
    throw new ProjectPilotControlError(
      'PILOT_SCOPE_INVALIDATED',
      'Pilot scope or revision changed after authorization.',
      403
    );
  const revisionState = rows(
    await tx.execute(sql`
      SELECT
        (SELECT revision_number FROM project_production_plans
         WHERE project_id=${projectId} AND workflow_instance_id=${ctx.instance.id}
           AND status<>'SUPERSEDED') AS production_plan_revision,
        (SELECT configuration_revision FROM project_production_plans
         WHERE project_id=${projectId} AND workflow_instance_id=${ctx.instance.id}
           AND status<>'SUPERSEDED') AS configuration_revision,
        (SELECT wad_revision FROM project_wad_authorizations
         WHERE project_id=${projectId} AND workflow_instance_id=${ctx.instance.id}
           AND status<>'SUPERSEDED') AS wad_revision`)
  )[0];
  if (
    Number(revisionState?.production_plan_revision) !==
      Number(pilot.production_plan_revision) ||
    Number(revisionState?.wad_revision) !== Number(pilot.wad_revision) ||
    String(revisionState?.configuration_revision) !==
      String(pilot.configuration_baseline_revision)
  )
    throw new ProjectPilotControlError(
      'PILOT_SCOPE_INVALIDATED',
      'Production Plan, WAD, or configuration revision changed after pilot authorization.',
      403
    );
  if (new Date(String(pilot.review_expires_at)).getTime() <= Date.now())
    throw new ProjectPilotControlError(
      'PILOT_EXPIRED',
      'Pilot authorization has expired.',
      403
    );
  const participants = pilot.authorized_participants as Array<{
    userId: number;
    functionalRole: string;
  }>;
  const participant = participants.find(
    (entry) => Number(entry.userId) === actor.userId
  );
  if (!participant)
    throw new ProjectPilotControlError(
      'PILOT_PARTICIPANT_REQUIRED',
      'The authenticated user is not authorized for this pilot.',
      403
    );
  const training = rows(
    await tx.execute(sql`
      SELECT id FROM project_pilot_training_acknowledgments
      WHERE pilot_authorization_id=${pilot.id} AND user_id=${actor.userId}
        AND functional_role=${participant.functionalRole}
        AND (expires_at IS NULL OR expires_at>now()) LIMIT 1`)
  )[0];
  if (!training)
    throw new ProjectPilotControlError(
      'PILOT_TRAINING_REQUIRED',
      'Current authoritative pilot training evidence is required.',
      403
    );
  const issue = rows(
    await tx.execute(sql`
      SELECT issue_number,severity FROM project_pilot_issues
      WHERE pilot_authorization_id=${pilot.id}
        AND severity IN ('CRITICAL','MAJOR') AND status<>'CLOSED' LIMIT 1`)
  )[0];
  if (issue)
    throw new ProjectPilotControlError(
      'PILOT_BLOCKING_ISSUE',
      'A critical or major pilot issue pauses consequential actions.',
      409,
      { issueNumber: issue.issue_number, severity: issue.severity }
    );
  const lines = pilot.approved_po_lines as Array<{
    poLineId: number;
    partNumber: string;
    maximumQuantity: number;
  }>;
  if (context.poLineId !== undefined) {
    const line = lines.find(
      (entry) => Number(entry.poLineId) === context.poLineId
    );
    if (!line)
      throw new ProjectPilotControlError(
        'PILOT_PO_LINE_NOT_AUTHORIZED',
        'PO line is outside pilot scope.',
        403
      );
    if (
      context.partNumber &&
      line.partNumber.toLowerCase() !== context.partNumber.trim().toLowerCase()
    )
      throw new ProjectPilotControlError(
        'PILOT_PART_NOT_AUTHORIZED',
        'Part is outside pilot scope.',
        403
      );
    if (
      context.quantity !== undefined &&
      context.quantity > Number(line.maximumQuantity)
    )
      throw new ProjectPilotControlError(
        'PILOT_QUANTITY_EXCEEDED',
        'Requested quantity exceeds the pilot authorization.',
        403
      );
  }
  await event(
    pilot,
    'PILOT_ACTION_AUTHORIZED',
    actor,
    context.confirmation,
    null,
    { ...requestEvidence, requestHash },
    tx,
    undefined,
    undefined,
    context.idempotencyKey
  );
  return { pilot, participant };
}

export async function getPilotDashboard(projectId: string, tx: Executor = db) {
  const pilot = await current(projectId, tx);
  if (!pilot)
    return {
      projectId,
      pilot: null,
      readiness: await evaluatePilotReadiness(projectId, tx),
    };
  const [approvals, training, issues, manifest, events, readiness] =
    await Promise.all([
      tx.execute(
        sql`SELECT * FROM project_pilot_approvals WHERE pilot_authorization_id=${pilot.id} ORDER BY decided_at`
      ),
      tx.execute(
        sql`SELECT * FROM project_pilot_training_acknowledgments WHERE pilot_authorization_id=${pilot.id} ORDER BY user_id`
      ),
      tx.execute(
        sql`SELECT * FROM project_pilot_issues WHERE pilot_authorization_id=${pilot.id} ORDER BY reported_at DESC`
      ),
      tx.execute(
        sql`SELECT * FROM project_pilot_evidence_manifest WHERE pilot_authorization_id=${pilot.id} ORDER BY category`
      ),
      tx.execute(
        sql`SELECT * FROM project_pilot_events WHERE pilot_authorization_id=${pilot.id} ORDER BY occurred_at DESC`
      ),
      evaluatePilotReadiness(projectId, tx),
    ]);
  const blockers = [
    ...readiness.blockers,
    ...rows(issues)
      .filter(
        (issue) =>
          ['CRITICAL', 'MAJOR'].includes(String(issue.severity)) &&
          issue.status !== 'CLOSED'
      )
      .map((issue) => ({
        key: 'pilot_issue',
        reason: issue.description,
        responsibleFunction: `Owner user ${issue.owner_user_id}`,
        correctionLocation: 'Pilot issue log',
        status: issue.status,
      })),
  ];
  return {
    projectId,
    environment: normalizedEnvironment(),
    pilot,
    readiness: { ...readiness, blockers },
    approvals: rows(approvals),
    training: rows(training),
    issues: rows(issues),
    evidenceManifest: rows(manifest),
    events: rows(events),
    nextAuthorizedAction:
      pilot.status === 'DRAFT'
        ? 'Record readiness evidence'
        : pilot.status === 'PENDING_READINESS'
          ? 'Resolve readiness blockers and submit'
          : pilot.status === 'PENDING_APPROVAL'
            ? 'Complete independent approvals'
            : pilot.status === 'AUTHORIZED'
              ? 'Pilot activation awaiting authorization'
              : pilot.status === 'ACTIVE'
                ? 'Proceed only with the next stage-authorized action'
                : 'Resolve the controlled pilot state before proceeding',
  };
}
