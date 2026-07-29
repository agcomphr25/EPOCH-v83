import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import * as XLSX from 'xlsx';

import { pgPool } from '../../db';
import { createEcr, type EcrActor } from './engineeringChangeRequestService';
import {
  evaluateImplementationGate,
  evaluateNextRequiredAction,
  type QualityActionState,
} from './qualityActionEngine';

export const CHANGE_TYPES = [
  'NCR',
  'CAR',
  'PCR',
  'ECR',
  'ECN_ECO',
  'DOCUMENT_CHANGE',
  'PRODUCTION_PROCESS_CHANGE',
  'TEMPORARY_DEVIATION',
  'PERMANENT_DEVIATION_WAIVER',
  'SUPPLIER_CHANGE',
  'OTHER',
] as const;

export class ChangeControlError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

type Actor = EcrActor;
type HistoricalRow = Record<string, unknown>;
const text = (value: unknown) => String(value ?? '').trim();
const nullable = (value: unknown) => text(value) || null;
const actorSnapshot = (actor: Actor) => ({
  userId: actor.id,
  username: actor.username,
  displayName: actor.displayName,
  role: actor.role,
});

function normalizeType(value: unknown) {
  const normalized = text(value).toUpperCase().replace(/[ /-]+/g, '_');
  const aliases: Record<string, string> = {
    CAPA: 'CAR',
    CORRECTIVE_ACTION: 'CAR',
    PCF: 'PCR',
    PROCESS_CHANGE_REQUEST: 'PCR',
    ECN: 'ECN_ECO',
    ECO: 'ECN_ECO',
    'ECN/ECO': 'ECN_ECO',
    DOCUMENT: 'DOCUMENT_CHANGE',
    PROCESS_CHANGE: 'PRODUCTION_PROCESS_CHANGE',
    TEMPORARY_DEVIATION_WAIVER: 'TEMPORARY_DEVIATION',
    PERMANENT_DEVIATION: 'PERMANENT_DEVIATION_WAIVER',
  };
  const result = aliases[normalized] ?? normalized;
  return CHANGE_TYPES.includes(result as any) ? result : null;
}

function isoDate(value: unknown) {
  if (!value) return null;
  const parsed =
    typeof value === 'number'
      ? XLSX.SSF.parse_date_code(value)
      : new Date(String(value));
  if (parsed instanceof Date)
    return Number.isNaN(parsed.getTime())
      ? null
      : parsed.toISOString().slice(0, 10);
  if (!parsed) return null;
  return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
}

export async function listChangeControlRecords(filters: Record<string, unknown>) {
  const values: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    where.push(sql.replace('?', `$${values.length}`));
  };
  if (text(filters.source)) add('r.source=?', text(filters.source));
  if (text(filters.changeType))
    add('COALESCE(r.authoritative_record_type,r.change_type)=?', text(filters.changeType));
  if (text(filters.status)) add('r.status=?', text(filters.status));
  if (text(filters.department)) add('r.department=?', text(filters.department));
  if (text(filters.severityRisk)) add('r.severity_risk=?', text(filters.severityRisk));
  if (text(filters.ownerUserId)) add('r.owner_user_id=?', Number(filters.ownerUserId));
  if (text(filters.customerId)) add('r.customer_id=?', Number(filters.customerId));
  if (text(filters.projectId)) {
    values.push(text(filters.projectId));
    where.push(
      `(r.project_id=$${values.length} OR r.design_control_project_id=$${values.length})`
    );
  }
  if (text(filters.affected)) {
    values.push(`%${text(filters.affected)}%`);
    where.push(
      `EXISTS (SELECT 1 FROM change_control_record_links l
        WHERE l.change_control_record_id=r.id
          AND (l.linked_record_number ILIKE $${values.length}
            OR l.description ILIKE $${values.length}))`
    );
  }
  if (text(filters.dateFrom)) add('r.updated_at::date>=?', text(filters.dateFrom));
  if (text(filters.dateTo)) add('r.updated_at::date<=?', text(filters.dateTo));
  if (text(filters.overdue) === 'true')
    where.push("COALESCE(r.next_action_due_date,r.due_date) < CURRENT_DATE AND r.status <> 'CLOSED'");
  if (text(filters.productionBlocked) === 'true') where.push('r.production_blocked=true');
  if (text(filters.customerDecisionRequired) === 'true')
    where.push('r.customer_decision_required=true');
  const result = await pgPool.query(
    `SELECT r.*,u.username AS owner_username,
            (SELECT count(*)::int FROM change_control_record_links l
              WHERE l.change_control_record_id=r.id) AS affected_items_count
       FROM change_control_records r
       LEFT JOIN users u ON u.id=r.owner_user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY r.updated_at DESC,r.change_number`,
    values
  );
  const enriched = await Promise.all(
    result.rows.map(async (record) => ({
      ...record,
      display_type: record.authoritative_record_type ?? record.change_type,
      next_action: evaluateNextRequiredAction(await loadQualityActionState(record)),
    }))
  );
  const nextActionCategory = text(filters.nextActionCategory);
  return nextActionCategory
    ? enriched.filter(
        (record) =>
          record.next_action.code === nextActionCategory ||
          record.next_action.classification === nextActionCategory
      )
    : enriched;
}

async function loadQualityActionState(record: any): Promise<QualityActionState> {
  const assessment = await pgPool.query(
    `SELECT a.id,a.lifecycle_status,
            NOT EXISTS (
              SELECT 1 FROM change_control_assessment_recommendations r
               WHERE r.assessment_id=a.id AND r.quality_decision IS NULL
            ) AS recommendations_resolved
       FROM change_control_assessments a
      WHERE a.change_control_record_id=$1
      ORDER BY a.version DESC LIMIT 1`,
    [record.id]
  );
  const latest = assessment.rows[0];
  const base: QualityActionState = {
    recordType: (record.authoritative_record_type || 'ECR') as QualityActionState['recordType'],
    status: record.status,
    ownerUserId: record.owner_user_id,
    dueDate: record.due_date,
    assessmentSubmitted: ['SUBMITTED', 'CONFIRMED'].includes(latest?.lifecycle_status),
    assessmentRecommendationsResolved:
      latest?.lifecycle_status === 'CONFIRMED' && Boolean(latest?.recommendations_resolved),
    customerApprovalRequired: Boolean(record.customer_decision_required),
    customerApprovalComplete: Boolean(record.customer_approval_evidence),
    controlledDocumentsRequired: false,
    controlledDocumentsReleased: true,
    wipDispositionRequired: false,
    wipDispositionComplete: true,
    validationRequired: false,
    validationComplete: true,
    faiDetermined: true,
    faiRequired: false,
    faiComplete: true,
    trainingRequired: false,
    trainingComplete: true,
    effectivityComplete: Boolean(record.actual_effective_date || record.proposed_effective_date),
    requiredApprovalsComplete: ['APPROVED','IMPLEMENTATION_IN_PROGRESS','PENDING_VERIFICATION','VERIFIED','CLOSED'].includes(record.status),
    implementationAuthorized: ['IMPLEMENTATION_IN_PROGRESS','PENDING_VERIFICATION','VERIFIED','CLOSED'].includes(record.status),
    implementationComplete: ['PENDING_VERIFICATION','VERIFIED','CLOSED'].includes(record.status),
    verificationRequired: true,
    verificationComplete: ['VERIFIED','CLOSED'].includes(record.status),
    effectivenessRequired: record.authoritative_record_type === 'CAR',
    effectivenessComplete: record.status === 'CLOSED',
  };
  if (record.authoritative_record_type === 'PCR') {
    const [pcr, approvals] = await Promise.all([
      pgPool.query(
        'SELECT * FROM p2_production_changes WHERE id=$1',
        [record.authoritative_record_id]
      ),
      pgPool.query(
        `SELECT DISTINCT approval_function
           FROM pcr_functional_approvals
          WHERE pcr_id=$1 AND decision='APPROVED'`,
        [record.authoritative_record_id]
      ),
    ]);
    const row = pcr.rows[0] ?? {};
    const approvedFunctions = new Set(
      approvals.rows.map((approval) => approval.approval_function)
    );
    const allRequiredApprovalsComplete = requiredPcrApprovals(row).every(
      (approvalFunction) => approvedFunctions.has(approvalFunction)
    );
    return {
      ...base,
      investigatorAssigned: Boolean(row.investigator_user_id),
      investigationComplete: Boolean(row.investigation_notes),
      designImpact: row.design_impact,
      customerApprovalRequired: Boolean(row.requires_customer_approval),
      customerApprovalComplete:
        !row.requires_customer_approval || Boolean(row.customer_approval_evidence_id),
      wipDispositionRequired: true,
      wipDispositionComplete: Boolean(row.wip_inventory_disposition_complete),
      effectivityComplete: Boolean(row.effectivity_established),
      validationRequired: Boolean(row.impact_assessment?.validationRequired),
      validationComplete: Boolean(row.validation_testing_complete),
      faiDetermined: Boolean(row.fai_determination),
      faiRequired: ['REQUIRED', 'PARTIAL'].includes(row.fai_determination),
      faiComplete:
        row.fai_determination === 'NOT_REQUIRED' || Boolean(row.fai_evidence_reference),
      trainingRequired: Boolean(row.training_required),
      trainingComplete: !row.training_required || Boolean(row.training_acknowledged),
      requiredApprovalsComplete: allRequiredApprovalsComplete,
      implementationAuthorized: Boolean(row.implementation_authorized_at),
      implementationComplete: Boolean(row.implemented_at),
      verificationComplete: Boolean(row.verified_at),
    };
  }
  if (record.authoritative_record_type === 'NCR') {
    const ncr = await pgPool.query(
      'SELECT * FROM nonconformance_records WHERE id=$1',
      [record.authoritative_record_id]
    );
    const row = ncr.rows[0] ?? {};
    return {
      ...base,
      containmentRequired: true,
      containmentComplete: Boolean(row.containment_completed_at && row.containment_action),
      rootCauseRequired: Boolean(row.capa_required || row.recurrence_detected),
      rootCauseComplete: Boolean(row.root_cause),
      effectivenessRequired: Boolean(row.capa_required),
      effectivenessComplete: row.effectiveness_status === 'effective',
    };
  }
  if (record.authoritative_record_type === 'CAR') {
    const car = await pgPool.query('SELECT * FROM capa_records WHERE id=$1', [
      record.authoritative_record_id,
    ]);
    const row = car.rows[0] ?? {};
    return {
      ...base,
      rootCauseRequired: true,
      rootCauseComplete: Boolean(row.root_cause),
      effectivenessRequired: true,
      effectivenessComplete: row.effectiveness_status === 'effective',
    };
  }
  if (record.authoritative_record_type === 'ECR') {
    const ecr = await pgPool.query(
      `SELECT q.lifecycle_status,
              (SELECT count(*)::int FROM engineering_change_orders e WHERE e.source_ecr_id=q.id) AS ecn_count
         FROM engineering_change_requests q WHERE q.id=$1`,
      [record.authoritative_record_id]
    );
    return {
      ...base,
      approvedEcr: ecr.rows[0]?.lifecycle_status === 'APPROVED',
      linkedEcnCount: Number(ecr.rows[0]?.ecn_count ?? 0),
    };
  }
  return base;
}

export async function getQualityActionDashboard(filters: Record<string, unknown>) {
  const records = await listChangeControlRecords(filters);
  const today = new Date().toISOString().slice(0, 10);
  const count = (predicate: (row: any) => boolean) => records.filter(predicate).length;
  return {
    cards: {
      newSubmissions: count((row) => row.status === 'SUBMITTED'),
      awaitingQmsReview: count((row) => row.next_action.code === 'QUALITY_INITIAL_REVIEW'),
      investigationOverdue: count(
        (row) =>
          row.due_date &&
          row.due_date < today &&
          ['INVESTIGATOR_ASSIGNMENT_REQUIRED', 'ROOT_CAUSE_REQUIRED'].includes(row.next_action.code)
      ),
      awaitingApproval: count((row) => row.status === 'PENDING_APPROVAL'),
      productionBlocked: count((row) => row.production_blocked),
      customerDecisionRequired: count(
        (row) => row.next_action.code === 'CUSTOMER_APPROVAL_REQUIRED'
      ),
      implementationIncomplete: count((row) =>
        ['IMPLEMENTATION_INCOMPLETE', 'IMPLEMENTATION_AUTHORIZATION_REQUIRED'].includes(
          row.next_action.code
        )
      ),
      effectivenessReviewDue: count(
        (row) => row.next_action.code === 'EFFECTIVENESS_REVIEW_DUE'
      ),
      overdueActions: count(
        (row) => row.next_action.dueDate && row.next_action.dueDate < today
      ),
      recentlyClosed: count(
        (row) =>
          row.status === 'CLOSED' &&
          Date.now() - new Date(row.updated_at).getTime() <= 30 * 86400000
      ),
    },
    records,
  };
}

export async function getChangeControlRecord(id: string) {
  const [record, links, evidence, historicalApprovals, audit, assessments] = await Promise.all([
    pgPool.query('SELECT * FROM change_control_records WHERE id=$1', [id]),
    pgPool.query(
      'SELECT * FROM change_control_record_links WHERE change_control_record_id=$1 ORDER BY created_at',
      [id]
    ),
    pgPool.query(
      'SELECT * FROM change_control_evidence WHERE change_control_record_id=$1 ORDER BY uploaded_at',
      [id]
    ),
    pgPool.query(
      'SELECT * FROM change_control_historical_approvals WHERE change_control_record_id=$1 ORDER BY approval_date,transcribed_at',
      [id]
    ),
    pgPool.query(
      'SELECT * FROM change_control_audit_events WHERE change_control_record_id=$1 ORDER BY occurred_at',
      [id]
    ),
    pgPool.query(
      `SELECT a.*,
              (SELECT count(*)::int FROM change_control_assessment_recommendations r
                WHERE r.assessment_id=a.id AND r.quality_decision IS NULL) AS unresolved_recommendations
         FROM change_control_assessments a
        WHERE a.change_control_record_id=$1 ORDER BY version DESC`,
      [id]
    ),
  ]);
  if (!record.rows[0])
    throw new ChangeControlError('CHANGE_NOT_FOUND', 'Change record not found', 404);
  const result = {
    ...record.rows[0],
    links: links.rows,
    evidence: evidence.rows,
    historicalApprovals: historicalApprovals.rows,
    audit: audit.rows,
    assessments: assessments.rows,
  };
  return {
    ...result,
    display_type: result.authoritative_record_type ?? result.change_type,
    next_action: evaluateNextRequiredAction(await loadQualityActionState(result)),
  };
}

export async function addChangeControlLink(
  id: string,
  input: HistoricalRow,
  actor: Actor
) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT * FROM change_control_records WHERE id=$1 FOR UPDATE',
      [id]
    );
    const record = locked.rows[0];
    if (!record)
      throw new ChangeControlError('CHANGE_NOT_FOUND', 'Change record not found', 404);
    if (
      record.source === 'EPOCH_NATIVE' &&
      ['ECR', 'ECN_ECO'].includes(
        record.authoritative_record_type ?? record.change_type
      ) &&
      !['DRAFT', 'ON_HOLD'].includes(record.status)
    )
      throw new ChangeControlError(
        'AFFECTED_RECORDS_IMMUTABLE',
        'Native affected records may only be added while the change is a draft',
        409
      );
    const linkType = text(input.linkType);
    const linkedRecordId = text(input.linkedRecordId);
    if (!linkedRecordId)
      throw new ChangeControlError(
        'LINKED_RECORD_REQUIRED',
        'A linked record identifier is required',
        422
      );
    if (linkType === 'RELATED_CHANGE') {
      if (linkedRecordId === id)
        throw new ChangeControlError(
          'CHANGE_RELATIONSHIP_SELF_REFERENCE',
          'A Quality Action cannot relate to itself',
          409
        );
      const cycle = await client.query(
        `WITH RECURSIVE edges AS (
           SELECT change_control_record_id::text AS source_id,linked_record_id AS target_id
             FROM change_control_record_links WHERE link_type='RELATED_CHANGE'
         ), reachable(id) AS (
           SELECT $2::text
           UNION
           SELECT e.target_id FROM edges e JOIN reachable r ON e.source_id=r.id
         )
         SELECT EXISTS(SELECT 1 FROM reachable WHERE id=$1::text) AS creates_cycle`,
        [id, linkedRecordId]
      );
      if (cycle.rows[0]?.creates_cycle)
        throw new ChangeControlError(
          'CHANGE_RELATIONSHIP_CYCLE',
          'This relationship would create a circular Quality Action dependency',
          409
        );
    }
    if (
      ['CONTROLLED_DOCUMENT', 'DOCUMENT_REVISION'].includes(linkType) &&
      !text(input.replacementRevisionId) &&
      !text(input.noRevisionJustification)
    )
      throw new ChangeControlError(
        'DOCUMENT_REVISION_DISPOSITION_REQUIRED',
        'A controlled document requires a replacement revision or documented no-revision justification',
        422
      );
    const inserted = await client.query(
      `INSERT INTO change_control_record_links (
        change_control_record_id,link_type,linked_record_id,linked_record_number,
        linked_revision_id,linked_revision,superseded_revision_id,
        replacement_revision_id,no_revision_justification,relationship_role,
        description,created_by_user_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        id,
        linkType,
        linkedRecordId,
        nullable(input.linkedRecordNumber),
        nullable(input.linkedRevisionId),
        nullable(input.linkedRevision),
        nullable(input.supersededRevisionId),
        nullable(input.replacementRevisionId),
        nullable(input.noRevisionJustification),
        text(input.relationshipRole) || 'AFFECTED',
        nullable(input.description),
        actor.id,
      ]
    );
    await client.query(
      `UPDATE change_control_records
          SET record_revision=record_revision+1,updated_at=now() WHERE id=$1`,
      [id]
    );
    await client.query(
      `INSERT INTO change_control_audit_events (
        change_control_record_id,event_type,record_revision,actor_user_id,
        actor_snapshot,reason,after_values
      ) VALUES ($1,'RELATIONSHIP_ADDED',$2,$3,$4,$5,$6)`,
      [
        id,
        Number(record.record_revision) + 1,
        actor.id,
        actorSnapshot(actor),
        text(input.reason) || 'Affected record linked',
        inserted.rows[0],
      ]
    );
    await client.query('COMMIT');
    return inserted.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function parseRegister(buffer: Buffer, filename: string) {
  const extension = path.extname(filename).toLowerCase();
  if (!['.csv', '.xlsx', '.xls'].includes(extension))
    throw new ChangeControlError(
      'UNSUPPORTED_REGISTER_FORMAT',
      'Bulk imports must be CSV, XLSX, or XLS'
    );
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<HistoricalRow>(sheet, { defval: '' });
}

export async function previewHistoricalRows(rows: HistoricalRow[]) {
  const numbers = rows.map((row) => text(row.originalRecordNumber || row.changeNumber)).filter(Boolean);
  const duplicateResult = numbers.length
    ? await pgPool.query(
        `SELECT lower(COALESCE(original_record_number,change_number)) AS number
           FROM change_control_records
          WHERE lower(COALESCE(original_record_number,change_number))=ANY($1::text[])`,
        [numbers.map((number) => number.toLowerCase())]
      )
    : { rows: [] as any[] };
  const existing = new Set(duplicateResult.rows.map((row) => row.number));
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const originalRecordNumber = text(row.originalRecordNumber || row.changeNumber);
    const errors: string[] = [];
    const warnings: string[] = [];
    const changeType = normalizeType(row.changeType);
    if (!originalRecordNumber) errors.push('Original record number is required');
    if (!changeType) errors.push('Unsupported change type');
    if (!text(row.title)) errors.push('Title is required');
    if (!text(row.originalSystemOrSource))
      errors.push('Original source/system is required');
    if (!nullable(row.evidenceUnavailableReason))
      warnings.push('Evidence must be attached during individual import or an unavailable reason supplied');
    const key = originalRecordNumber.toLowerCase();
    if (key && (existing.has(key) || seen.has(key)))
      errors.push('Duplicate original/change number');
    seen.add(key);
    return {
      rowNumber: index + 2,
      data: {
        ...row,
        originalRecordNumber,
        changeType,
        originalRecordDate: isoDate(row.originalRecordDate),
        actualEffectiveDate: isoDate(row.actualEffectiveDate),
      },
      valid: errors.length === 0,
      errors,
      warnings,
    };
  });
}

async function persistEvidence(
  client: any,
  recordId: string,
  file: Express.Multer.File,
  category: string,
  sourceRecordDate: string | null,
  description: string | null,
  actor: Actor
) {
  const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const directory = path.resolve(process.cwd(), 'uploads', 'qms-change-control');
  await fs.mkdir(directory, { recursive: true });
  const storedPath = path.join(directory, `${checksum}-${path.basename(file.originalname)}`);
  await fs.writeFile(storedPath, file.buffer, { flag: 'wx' }).catch((error: any) => {
    if (error?.code !== 'EEXIST') throw error;
  });
  const result = await client.query(
    `INSERT INTO change_control_evidence (
       change_control_record_id,storage_reference,original_filename,document_type,
       mime_type,byte_size,sha256_checksum,evidence_category,source_record_date,
       description,uploaded_by_user_id,uploaded_by_snapshot
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      recordId,
      storedPath,
      file.originalname,
      path.extname(file.originalname).replace('.', '').toUpperCase() || 'OTHER',
      file.mimetype || 'application/octet-stream',
      file.size,
      checksum,
      category,
      sourceRecordDate,
      description,
      actor.id,
      actorSnapshot(actor),
    ]
  );
  return result.rows[0];
}

export async function importHistoricalRecord(
  input: HistoricalRow,
  file: Express.Multer.File | undefined,
  actor: Actor
) {
  const previews = await previewHistoricalRows([input]);
  if (!previews[0].valid)
    throw new ChangeControlError('IMPORT_VALIDATION_FAILED', 'Historical record is invalid', 422, {
      errors: previews[0].errors,
    });
  if (!file && !text(input.evidenceUnavailableReason))
    throw new ChangeControlError(
      'HISTORICAL_EVIDENCE_REQUIRED',
      'Attach original evidence or document why it is unavailable',
      422
    );
  const row = previews[0].data as HistoricalRow;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO change_control_records (
        change_number,change_type,title,description,reason_for_change,source,
        original_record_number,original_record_date,original_system_or_source,
        original_status,requested_by,department,status,priority,actual_effective_date,
        implementation_notes,closure_notes,evidence_unavailable_reason,
        created_by_user_id,imported_at,imported_by_user_id
      ) VALUES ($1,$2,$3,$4,$5,'IMPORTED_HISTORICAL',$6,$7,$8,$9,$10,$11,
        'HISTORICAL',$12,$13,$14,$15,$16,$17,now(),$17) RETURNING *`,
      [
        text(row.originalRecordNumber),
        row.changeType,
        text(row.title),
        nullable(row.description),
        nullable(row.reasonForChange),
        text(row.originalRecordNumber),
        row.originalRecordDate || null,
        text(row.originalSystemOrSource),
        nullable(row.originalStatus),
        nullable(row.requestedBy),
        nullable(row.department),
        text(row.priority) || 'NORMAL',
        row.actualEffectiveDate || null,
        nullable(row.implementationNotes),
        nullable(row.closureNotes),
        nullable(row.evidenceUnavailableReason),
        actor.id,
      ]
    );
    const record = inserted.rows[0];
    let evidence = null;
    if (file)
      evidence = await persistEvidence(
        client,
        record.id,
        file,
        text(input.evidenceCategory) || 'ORIGINAL_RECORD',
        row.originalRecordDate as string | null,
        nullable(input.evidenceDescription),
        actor
      );
    const approvals = Array.isArray(input.historicalApprovals)
      ? input.historicalApprovals
      : [];
    for (const approval of approvals as HistoricalRow[]) {
      await client.query(
        `INSERT INTO change_control_historical_approvals (
          change_control_record_id,printed_name,role_or_function,decision,
          approval_date,evidence_id,transcription_note,transcribed_by_user_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          record.id,
          text(approval.printedName),
          nullable(approval.roleOrFunction),
          nullable(approval.decision),
          isoDate(approval.approvalDate),
          evidence?.id ?? null,
          'Historical approval evidence; not an EPOCH electronic signature',
          actor.id,
        ]
      );
    }
    await client.query(
      `INSERT INTO change_control_audit_events (
        change_control_record_id,event_type,record_revision,actor_user_id,
        actor_snapshot,reason,after_values
      ) VALUES ($1,'HISTORICAL_RECORD_IMPORTED',1,$2,$3,$4,$5)`,
      [
        record.id,
        actor.id,
        actorSnapshot(actor),
        text(input.importReason) || 'Historical register import',
        { record, evidenceId: evidence?.id ?? null, historicalApprovalCount: approvals.length },
      ]
    );
    await client.query('COMMIT');
    return getChangeControlRecord(record.id);
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error?.code === '23505')
      throw new ChangeControlError(
        'DUPLICATE_CHANGE_NUMBER',
        'The original/change number already exists and requires administrator resolution',
        409
      );
    throw error;
  } finally {
    client.release();
  }
}

export async function importHistoricalRows(rows: HistoricalRow[], actor: Actor) {
  const preview = await previewHistoricalRows(rows);
  if (preview.some((row) => !row.valid))
    throw new ChangeControlError(
      'BULK_IMPORT_VALIDATION_FAILED',
      'Resolve rejected and duplicate rows before committing',
      422,
      { preview }
    );
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const imported: Array<{ rowNumber: number; id: string; changeNumber: string }> = [];
    for (const item of preview) {
      const row = item.data as HistoricalRow;
      const result = await client.query(
        `INSERT INTO change_control_records (
          change_number,change_type,title,description,reason_for_change,source,
          original_record_number,original_record_date,original_system_or_source,
          original_status,requested_by,department,status,priority,actual_effective_date,
          implementation_notes,closure_notes,evidence_unavailable_reason,
          created_by_user_id,imported_at,imported_by_user_id
        ) VALUES ($1,$2,$3,$4,$5,'IMPORTED_HISTORICAL',$6,$7,$8,$9,$10,$11,
          'HISTORICAL',$12,$13,$14,$15,$16,$17,now(),$17) RETURNING id,change_number`,
        [
          text(row.originalRecordNumber),
          row.changeType,
          text(row.title),
          nullable(row.description),
          nullable(row.reasonForChange),
          text(row.originalRecordNumber),
          row.originalRecordDate || null,
          text(row.originalSystemOrSource),
          nullable(row.originalStatus),
          nullable(row.requestedBy),
          nullable(row.department),
          text(row.priority) || 'NORMAL',
          row.actualEffectiveDate || null,
          nullable(row.implementationNotes),
          nullable(row.closureNotes),
          nullable(row.evidenceUnavailableReason) || 'Bulk register import; original evidence pending linkage',
          actor.id,
        ]
      );
      const record = result.rows[0];
      await client.query(
        `INSERT INTO change_control_audit_events (
          change_control_record_id,event_type,record_revision,actor_user_id,
          actor_snapshot,reason,after_values
        ) VALUES ($1,'BULK_HISTORICAL_RECORD_IMPORTED',1,$2,$3,$4,$5)`,
        [record.id, actor.id, actorSnapshot(actor), 'Validated bulk register import', row]
      );
      imported.push({ rowNumber: item.rowNumber, id: record.id, changeNumber: record.change_number });
    }
    await client.query('COMMIT');
    return { imported, rejected: [], warnings: preview.flatMap((row) => row.warnings) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createNativeChange(input: HistoricalRow, actor: Actor) {
  if (!actor.capabilities.includes('qms.change_control.create'))
    throw new ChangeControlError(
      'CHANGE_CONTROL_CREATE_FORBIDDEN',
      'Change Control draft creation capability is required',
      403
    );
  if (!text(input.designControlProjectId))
    throw new ChangeControlError(
      'DESIGN_PROJECT_REQUIRED',
      'A Design Control project is required so native changes use the authoritative ECR workflow',
      422
    );
  const ecrActor = actor.capabilities.includes('engineering.ecr.create')
    ? actor
    : {
        ...actor,
        capabilities: [...actor.capabilities, 'engineering.ecr.create'],
      };
  const ecr = await createEcr(
    text(input.designControlProjectId),
    {
      designControlRecordId: nullable(input.designControlRecordId),
      title: text(input.title),
      priority: text(input.priority) || 'NORMAL',
      changeClassification: normalizeType(input.changeType) || 'OTHER',
      problemOpportunityStatement: text(input.description),
      requestedChange: text(input.requestedChange || input.implementationPlan),
      reasonBusinessJustification: text(input.reasonForChange),
    },
    ecrActor
  );
  const ecrRow: any = (ecr as any).ecr ?? ecr;
  const result = await pgPool.query(
    `INSERT INTO change_control_records (
       change_number,change_type,title,description,reason_for_change,source,
       requested_by,owner_user_id,department,design_control_project_id,ecr_id,
       status,priority,implementation_plan,risk_assessment,product_safety_impact,
       regulatory_impact,configuration_impact,customer_approval_required,
       created_by_user_id
     ) VALUES ($1,$2,$3,$4,$5,'EPOCH_NATIVE',$6,$7,$8,$9,$10,'DRAFT',$11,
       $12,$13,$14,$15,$16,$17,$7)
     ON CONFLICT (change_number) DO UPDATE SET
       change_type=EXCLUDED.change_type,department=EXCLUDED.department,
       implementation_plan=EXCLUDED.implementation_plan,
       risk_assessment=EXCLUDED.risk_assessment,
       product_safety_impact=EXCLUDED.product_safety_impact,
       regulatory_impact=EXCLUDED.regulatory_impact,
       configuration_impact=EXCLUDED.configuration_impact,
       customer_approval_required=EXCLUDED.customer_approval_required,
       updated_at=now()
     RETURNING *`,
    [
      ecrRow.ecr_number,
      normalizeType(input.changeType) || 'ECR',
      text(input.title),
      nullable(input.description),
      nullable(input.reasonForChange),
      actor.displayName,
      actor.id,
      nullable(input.department),
      text(input.designControlProjectId),
      ecrRow.id,
      text(input.priority) || 'NORMAL',
      nullable(input.implementationPlan),
      nullable(input.riskAssessment),
      nullable(input.productSafetyImpact),
      nullable(input.regulatoryImpact),
      nullable(input.configurationImpact),
      Boolean(input.customerApprovalRequired),
    ]
  );
  await pgPool.query(
    `INSERT INTO change_control_audit_events (
       change_control_record_id,event_type,record_revision,actor_user_id,actor_snapshot,reason,after_values
     ) VALUES ($1,'NATIVE_CHANGE_CREATED',1,$2,$3,$4,$5)`,
    [result.rows[0].id, actor.id, actorSnapshot(actor), text(input.reasonForChange), result.rows[0]]
  );
  return getChangeControlRecord(result.rows[0].id);
}

export function importTemplate() {
  const headers = [
    'originalRecordNumber',
    'changeType',
    'title',
    'description',
    'reasonForChange',
    'originalRecordDate',
    'originalSystemOrSource',
    'originalStatus',
    'requestedBy',
    'department',
    'priority',
    'actualEffectiveDate',
    'implementationNotes',
    'closureNotes',
    'evidenceUnavailableReason',
  ];
  return `${headers.join(',')}\n`;
}

const ASSESSMENT_QUESTIONS = [
  'ACTUAL_NONCONFORMANCE',
  'PRODUCT_CONTAINED',
  'OTHER_PRODUCT_AFFECTED',
  'SIGNIFICANT_SYSTEMIC_CUSTOMER',
  'PRODUCTION_METHOD_CHANGE',
  'DESIGN_PERFORMANCE_IMPACT',
  'DESIGN_OUTPUT_CHANGE',
  'TEMPORARY_OR_PERMANENT',
  'CUSTOMER_REGULATORY_APPROVAL',
  'CONTROLLED_DOCUMENTS_AFFECTED',
  'TRAINING_REQUIRED',
  'VALIDATION_TESTING_FAI_REQUIRED',
  'WIP_INVENTORY_DISPOSITION',
  'EFFECTIVENESS_VERIFICATION',
] as const;

function deriveRecommendations(answers: Record<string, string>) {
  const recommendations: Array<{
    code: string;
    recommendation: string;
    questions: string[];
    controlReference: string;
  }> = [];
  const yes = (key: string) => answers[key] === 'YES';
  const unknownOrYes = (key: string) =>
    !['NO', 'NOT_APPLICABLE'].includes(answers[key]);
  if (yes('ACTUAL_NONCONFORMANCE'))
    recommendations.push({
      code: 'CREATE_OR_LINK_NCR',
      recommendation: 'Create or link the authoritative NCR.',
      questions: ['ACTUAL_NONCONFORMANCE'],
      controlReference: 'Nonconforming output control',
    });
  if (yes('SIGNIFICANT_SYSTEMIC_CUSTOMER'))
    recommendations.push({
      code: 'CREATE_OR_LINK_CAR',
      recommendation: 'Create or link the authoritative CAR/CAPA.',
      questions: ['SIGNIFICANT_SYSTEMIC_CUSTOMER'],
      controlReference: 'Corrective action control',
    });
  if (yes('PRODUCTION_METHOD_CHANGE'))
    recommendations.push({
      code: 'CREATE_OR_LINK_PCR',
      recommendation: 'Create or link a controlled PCR.',
      questions: ['PRODUCTION_METHOD_CHANGE'],
      controlReference: 'Production process change control',
    });
  if (
    unknownOrYes('DESIGN_PERFORMANCE_IMPACT') ||
    unknownOrYes('DESIGN_OUTPUT_CHANGE')
  )
    recommendations.push({
      code: 'CREATE_OR_LINK_ECR',
      recommendation:
        'Engineering must assess the design baseline; create or link an ECR before implementation.',
      questions: ['DESIGN_PERFORMANCE_IMPACT', 'DESIGN_OUTPUT_CHANGE'],
      controlReference: 'Design and development change control',
    });
  if (yes('CUSTOMER_REGULATORY_APPROVAL'))
    recommendations.push({
      code: 'CUSTOMER_AUTHORIZATION',
      recommendation:
        'Obtain immutable customer, regulatory, contract, or design-authority evidence.',
      questions: ['CUSTOMER_REGULATORY_APPROVAL'],
      controlReference: 'Customer and regulatory authorization',
    });
  if (yes('CONTROLLED_DOCUMENTS_AFFECTED'))
    recommendations.push({
      code: 'CONTROLLED_DOCUMENT_REVISION',
      recommendation: 'Link and release applicable controlled-document revisions.',
      questions: ['CONTROLLED_DOCUMENTS_AFFECTED'],
      controlReference: 'Controlled documented information',
    });
  if (yes('TRAINING_REQUIRED'))
    recommendations.push({
      code: 'TRAINING_EVIDENCE',
      recommendation: 'Identify affected employees and retain training acknowledgment evidence.',
      questions: ['TRAINING_REQUIRED'],
      controlReference: 'Competence and awareness',
    });
  if (yes('VALIDATION_TESTING_FAI_REQUIRED'))
    recommendations.push({
      code: 'VALIDATION_FAI_DETERMINATION',
      recommendation: 'Record validation, testing, FAI, or partial FAI determination and evidence.',
      questions: ['VALIDATION_TESTING_FAI_REQUIRED'],
      controlReference: 'Verification, validation, and first article planning',
    });
  if (yes('WIP_INVENTORY_DISPOSITION'))
    recommendations.push({
      code: 'WIP_INVENTORY_DISPOSITION',
      recommendation: 'Define effectivity and disposition affected WIP and inventory.',
      questions: ['WIP_INVENTORY_DISPOSITION'],
      controlReference: 'Configuration and product-control effectivity',
    });
  if (yes('EFFECTIVENESS_VERIFICATION'))
    recommendations.push({
      code: 'EFFECTIVENESS_REVIEW',
      recommendation: 'Plan and complete an effectiveness review before closure.',
      questions: ['EFFECTIVENESS_VERIFICATION'],
      controlReference: 'Corrective action effectiveness',
    });
  return recommendations;
}

export async function createAssessment(
  recordId: string,
  input: HistoricalRow,
  actor: Actor
) {
  const answers = Array.isArray(input.answers) ? (input.answers as HistoricalRow[]) : [];
  const byKey = new Map(answers.map((answer) => [text(answer.questionKey), answer]));
  const missing = ASSESSMENT_QUESTIONS.filter((key) => !byKey.has(key));
  if (missing.length)
    throw new ChangeControlError(
      'ASSESSMENT_INCOMPLETE',
      'Every workflow-assessment question requires a response and explanation',
      422,
      { missingQuestions: missing }
    );
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const record = await client.query(
      'SELECT * FROM change_control_records WHERE id=$1 FOR UPDATE',
      [recordId]
    );
    if (!record.rows[0])
      throw new ChangeControlError('CHANGE_NOT_FOUND', 'Change record not found', 404);
    const nextVersion = await client.query(
      `SELECT COALESCE(max(version),0)+1 AS version
         FROM change_control_assessments WHERE change_control_record_id=$1`,
      [recordId]
    );
    const created = await client.query(
      `INSERT INTO change_control_assessments (
         change_control_record_id,version,lifecycle_status,assessor_user_id,
         assessor_snapshot,overall_explanation,submitted_at
       ) VALUES ($1,$2,'SUBMITTED',$3,$4,$5,now()) RETURNING *`,
      [
        recordId,
        nextVersion.rows[0].version,
        actor.id,
        actorSnapshot(actor),
        nullable(input.overallExplanation),
      ]
    );
    const normalized: Record<string, string> = {};
    for (const questionKey of ASSESSMENT_QUESTIONS) {
      const answer = byKey.get(questionKey)!;
      const response = text(answer.response).toUpperCase();
      if (!['YES', 'NO', 'UNKNOWN', 'NOT_APPLICABLE'].includes(response))
        throw new ChangeControlError(
          'ASSESSMENT_RESPONSE_INVALID',
          `${questionKey} has an invalid response`,
          422
        );
      if (!text(answer.explanation))
        throw new ChangeControlError(
          'ASSESSMENT_EXPLANATION_REQUIRED',
          `${questionKey} requires an explanation`,
          422
        );
      normalized[questionKey] = response;
      await client.query(
        `INSERT INTO change_control_assessment_answers (
           assessment_id,question_key,response,explanation,answered_by_user_id,answered_by_snapshot
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          created.rows[0].id,
          questionKey,
          response,
          text(answer.explanation),
          actor.id,
          actorSnapshot(actor),
        ]
      );
    }
    for (const recommendation of deriveRecommendations(normalized)) {
      await client.query(
        `INSERT INTO change_control_assessment_recommendations (
           assessment_id,recommendation_code,recommendation,
           supporting_question_keys,control_reference
         ) VALUES ($1,$2,$3,$4,$5)`,
        [
          created.rows[0].id,
          recommendation.code,
          recommendation.recommendation,
          recommendation.questions,
          recommendation.controlReference,
        ]
      );
    }
    await client.query(
      `UPDATE change_control_assessments
          SET lifecycle_status='SUPERSEDED'
        WHERE change_control_record_id=$1 AND id<>$2 AND lifecycle_status<>'SUPERSEDED'`,
      [recordId, created.rows[0].id]
    );
    await client.query(
      `INSERT INTO change_control_audit_events (
         change_control_record_id,event_type,record_revision,actor_user_id,
         actor_snapshot,reason,after_values
       ) VALUES ($1,'ASSESSMENT_SUBMITTED',$2,$3,$4,$5,$6)`,
      [
        recordId,
        record.rows[0].record_revision,
        actor.id,
        actorSnapshot(actor),
        'Versioned Quality workflow assessment submitted',
        { assessmentId: created.rows[0].id, version: created.rows[0].version },
      ]
    );
    await client.query('COMMIT');
    return getAssessment(created.rows[0].id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getAssessment(assessmentId: string) {
  const [assessment, answers, recommendations] = await Promise.all([
    pgPool.query('SELECT * FROM change_control_assessments WHERE id=$1', [
      assessmentId,
    ]),
    pgPool.query(
      'SELECT * FROM change_control_assessment_answers WHERE assessment_id=$1 ORDER BY question_key',
      [assessmentId]
    ),
    pgPool.query(
      'SELECT * FROM change_control_assessment_recommendations WHERE assessment_id=$1 ORDER BY recommendation_code',
      [assessmentId]
    ),
  ]);
  if (!assessment.rows[0])
    throw new ChangeControlError('ASSESSMENT_NOT_FOUND', 'Assessment not found', 404);
  return {
    ...assessment.rows[0],
    answers: answers.rows,
    recommendations: recommendations.rows,
  };
}

export async function decideAssessmentRecommendation(
  recordId: string,
  assessmentId: string,
  recommendationId: string,
  input: HistoricalRow,
  actor: Actor
) {
  const decision = text(input.decision).toUpperCase();
  if (!['CONFIRMED', 'OVERRIDDEN'].includes(decision))
    throw new ChangeControlError('QUALITY_DECISION_INVALID', 'Decision must be CONFIRMED or OVERRIDDEN');
  if (decision === 'OVERRIDDEN' && !text(input.reason))
    throw new ChangeControlError(
      'QUALITY_OVERRIDE_REASON_REQUIRED',
      'A documented reason is required to override a recommendation',
      422
    );
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE change_control_assessment_recommendations
          SET quality_decision=$4,quality_decision_reason=$5,
              decided_by_user_id=$6,decided_by_snapshot=$7,decided_at=now()
        WHERE id=$3 AND assessment_id=$2
          AND EXISTS (
            SELECT 1 FROM change_control_assessments a
             WHERE a.id=$2 AND a.change_control_record_id=$1 AND a.lifecycle_status='SUBMITTED'
          )
          AND quality_decision IS NULL
      RETURNING *`,
      [
        recordId,
        assessmentId,
        recommendationId,
        decision,
        nullable(input.reason),
        actor.id,
        actorSnapshot(actor),
      ]
    );
    if (!updated.rows[0])
      throw new ChangeControlError(
        'RECOMMENDATION_DECISION_IMMUTABLE',
        'Recommendation is missing, already decided, or assessment is not current',
        409
      );
    const unresolved = await client.query(
      `SELECT count(*)::int AS count
         FROM change_control_assessment_recommendations
        WHERE assessment_id=$1 AND quality_decision IS NULL`,
      [assessmentId]
    );
    if (Number(unresolved.rows[0].count) === 0)
      await client.query(
        `UPDATE change_control_assessments
            SET lifecycle_status='CONFIRMED',confirmed_at=now() WHERE id=$1`,
        [assessmentId]
      );
    await client.query(
      `INSERT INTO change_control_audit_events (
        change_control_record_id,event_type,record_revision,actor_user_id,
        actor_snapshot,reason,after_values
      ) SELECT $1,'ASSESSMENT_RECOMMENDATION_DECIDED',record_revision,$2,$3,$4,$5
          FROM change_control_records WHERE id=$1`,
      [
        recordId,
        actor.id,
        actorSnapshot(actor),
        text(input.reason) || 'Quality confirmed assessment recommendation',
        updated.rows[0],
      ]
    );
    await client.query('COMMIT');
    return getAssessment(assessmentId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const PCR_APPROVAL_CAPABILITIES: Record<string, string> = {
  QUALITY: 'qms.quality_action.approve_quality',
  PRODUCTION: 'qms.quality_action.approve_production',
  ENGINEERING: 'qms.quality_action.approve_engineering',
  PROGRAM_CONTRACTS: 'qms.quality_action.approve_program_contracts',
  TECHNICAL_AUTHORITY: 'qms.quality_action.approve_technical_authority',
  FINANCE_EXECUTIVE: 'qms.quality_action.approve_finance',
};

function requiredPcrApprovals(pcr: any) {
  const required = new Set(['PRODUCTION', 'QUALITY']);
  const impact = pcr.impact_assessment ?? {};
  if (impact.technicalManufacturingImpact || pcr.design_impact)
    required.add('ENGINEERING');
  if (pcr.contract_customer_impact || pcr.requires_customer_approval)
    required.add('PROGRAM_CONTRACTS');
  if (pcr.safety_regulatory_impact) required.add('TECHNICAL_AUTHORITY');
  if (impact.financeApprovalRequired === true) required.add('FINANCE_EXECUTIVE');
  return [...required];
}

async function pcrEvent(
  client: any,
  pcr: any,
  eventType: string,
  actor: Actor,
  reason: string,
  beforeValues?: unknown,
  afterValues?: unknown
) {
  await client.query(
    `INSERT INTO pcr_audit_events (
       pcr_id,event_type,record_revision,actor_user_id,actor_snapshot,
       reason,before_values,after_values
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      pcr.id,
      eventType,
      pcr.quality_action_revision,
      actor.id,
      actorSnapshot(actor),
      reason,
      beforeValues ?? null,
      afterValues ?? null,
    ]
  );
}

export async function createPcr(input: HistoricalRow, actor: Actor) {
  if (!actor.capabilities.includes('qms.quality_action.pcr_create'))
    throw new ChangeControlError('PCR_CREATE_FORBIDDEN', 'PCR creation capability is required', 403);
  if (!text(input.proposedChange) || !text(input.reason))
    throw new ChangeControlError(
      'PCR_REQUIRED_FIELDS_MISSING',
      'Proposed change and business reason are required',
      422
    );
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const seq = await client.query("SELECT nextval('pcr_number_seq')::bigint AS value");
    const number = `PCR-${new Date().getUTCFullYear()}-${String(seq.rows[0].value).padStart(4, '0')}`;
    const created = await client.query(
      `INSERT INTO p2_production_changes (
         change_number,change_type,scope,part_number,po_id,routing_id,current_revision,
         proposed_revision,proposed_change,reason,risk_assessment,affected_documents,
         required_actions,requires_customer_approval,status,quality_action_status,
         requester_user_id,requester_snapshot,submitted_by_name,submitted_at,notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
         'SUBMITTED','SUBMITTED',$15,$16,$17,now(),$18) RETURNING *`,
      [
        number,
        text(input.changeType) || 'PROCESS',
        text(input.scope) || 'PART',
        nullable(input.partNumber),
        input.poId ? Number(input.poId) : null,
        nullable(input.routingId),
        nullable(input.currentRevision),
        nullable(input.proposedRevision),
        text(input.proposedChange),
        text(input.reason),
        nullable(input.riskAssessment),
        JSON.stringify(Array.isArray(input.affectedDocuments) ? input.affectedDocuments : []),
        JSON.stringify(Array.isArray(input.requiredActions) ? input.requiredActions : []),
        Boolean(input.requiresCustomerApproval),
        actor.id,
        actorSnapshot(actor),
        actor.displayName,
        nullable(input.notes),
      ]
    );
    await pcrEvent(
      client,
      created.rows[0],
      'PCR_SUBMITTED',
      actor,
      text(input.reason),
      null,
      created.rows[0]
    );
    await client.query('COMMIT');
    return created.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function transitionPcr(
  pcrId: string,
  action: string,
  input: HistoricalRow,
  actor: Actor
) {
  const rules: Record<
    string,
    { capability: string; from: string[]; to: string; requireReason?: boolean }
  > = {
    screen: {
      capability: 'qms.quality_action.screen',
      from: ['SUBMITTED', 'REOPENED'],
      to: 'QMS_REVIEW',
    },
    request_information: {
      capability: 'qms.quality_action.screen',
      from: ['SUBMITTED', 'QMS_REVIEW', 'UNDER_INVESTIGATION', 'IMPACT_REVIEW'],
      to: 'MORE_INFORMATION_REQUIRED',
      requireReason: true,
    },
    deny: {
      capability: 'qms.quality_action.screen',
      from: ['SUBMITTED', 'QMS_REVIEW', 'IMPACT_REVIEW', 'AWAITING_APPROVAL'],
      to: 'DENIED',
      requireReason: true,
    },
    duplicate: {
      capability: 'qms.quality_action.screen',
      from: ['SUBMITTED', 'QMS_REVIEW'],
      to: 'DUPLICATE',
      requireReason: true,
    },
    cancel: {
      capability: 'qms.quality_action.screen',
      from: ['SUBMITTED', 'QMS_REVIEW', 'MORE_INFORMATION_REQUIRED', 'IMPACT_REVIEW'],
      to: 'CANCELLED',
      requireReason: true,
    },
    redirect: {
      capability: 'qms.quality_action.screen',
      from: ['SUBMITTED', 'QMS_REVIEW', 'IMPACT_REVIEW'],
      to: 'REDIRECTED',
      requireReason: true,
    },
    investigate: {
      capability: 'qms.quality_action.investigate',
      from: ['INVESTIGATION_ASSIGNED', 'MORE_INFORMATION_REQUIRED'],
      to: 'UNDER_INVESTIGATION',
    },
    impact_review: {
      capability: 'qms.quality_action.assess_impact',
      from: ['UNDER_INVESTIGATION'],
      to: 'IMPACT_REVIEW',
    },
    submit_approval: {
      capability: 'qms.quality_action.assess_impact',
      from: ['IMPACT_REVIEW'],
      to: 'AWAITING_APPROVAL',
    },
    reopen: {
      capability: 'qms.change_control.reopen',
      from: ['CLOSED', 'DENIED', 'CANCELLED'],
      to: 'REOPENED',
      requireReason: true,
    },
  };
  const rule = rules[action];
  if (!rule)
    throw new ChangeControlError('PCR_ACTION_INVALID', 'Unsupported PCR action', 400);
  if (!actor.capabilities.includes(rule.capability))
    throw new ChangeControlError('PCR_ACTION_FORBIDDEN', `${rule.capability} is required`, 403);
  if (rule.requireReason && !text(input.reason))
    throw new ChangeControlError('PCR_REASON_REQUIRED', 'A reason is required', 422);
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT * FROM p2_production_changes WHERE id=$1 FOR UPDATE',
      [pcrId]
    );
    const pcr = locked.rows[0];
    if (!pcr) throw new ChangeControlError('PCR_NOT_FOUND', 'PCR not found', 404);
    if (!rule.from.includes(pcr.quality_action_status))
      throw new ChangeControlError(
        'PCR_TRANSITION_INVALID',
        `Cannot ${action} from ${pcr.quality_action_status}`,
        409
      );
    if (action === 'impact_review' && !pcr.investigation_notes)
      throw new ChangeControlError(
        'PCR_INVESTIGATION_INCOMPLETE',
        'Investigation notes are required before impact review',
        422
      );
    if (action === 'submit_approval' && pcr.design_impact !== false)
      throw new ChangeControlError(
        'PCR_DESIGN_CHANGE_REQUIRES_ECR',
        'PCR cannot approve or release a possible design change; link an ECR and use the ECR/ECN workflow',
        409
      );
    const updated = await client.query(
      `UPDATE p2_production_changes
          SET quality_action_status=$2,quality_action_revision=quality_action_revision+1,
              investigation_notes=COALESCE($3,investigation_notes),
              impact_assessment=COALESCE($4::jsonb,impact_assessment),
              design_impact=COALESCE($5,design_impact),
              safety_regulatory_impact=COALESCE($6,safety_regulatory_impact),
              contract_customer_impact=COALESCE($7,contract_customer_impact),
              updated_at=now(),
              reopened_at=CASE WHEN $2='REOPENED' THEN now() ELSE reopened_at END,
              reopened_by_user_id=CASE WHEN $2='REOPENED' THEN $8 ELSE reopened_by_user_id END,
              reopen_reason=CASE WHEN $2='REOPENED' THEN $9 ELSE reopen_reason END
        WHERE id=$1 RETURNING *`,
      [
        pcrId,
        rule.to,
        nullable(input.investigationNotes),
        input.impactAssessment ? JSON.stringify(input.impactAssessment) : null,
        typeof input.designImpact === 'boolean' ? input.designImpact : null,
        typeof input.safetyRegulatoryImpact === 'boolean'
          ? input.safetyRegulatoryImpact
          : null,
        typeof input.contractCustomerImpact === 'boolean'
          ? input.contractCustomerImpact
          : null,
        actor.id,
        nullable(input.reason),
      ]
    );
    await pcrEvent(
      client,
      updated.rows[0],
      `PCR_${action.toUpperCase()}`,
      actor,
      text(input.reason) || action,
      pcr,
      updated.rows[0]
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function assignPcrInvestigator(
  pcrId: string,
  input: HistoricalRow,
  actor: Actor
) {
  if (!actor.capabilities.includes('qms.quality_action.assign_investigation'))
    throw new ChangeControlError(
      'PCR_ASSIGNMENT_FORBIDDEN',
      'Investigation assignment capability is required',
      403
    );
  if (!input.investigatorUserId || !isoDate(input.dueDate))
    throw new ChangeControlError(
      'PCR_ASSIGNMENT_INCOMPLETE',
      'Investigator and due date are required',
      422
    );
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const pcr = await client.query(
      `SELECT p.*,u.username,u.first_name,u.last_name
         FROM p2_production_changes p
         LEFT JOIN users u ON u.id=$2
        WHERE p.id=$1 FOR UPDATE OF p`,
      [pcrId, Number(input.investigatorUserId)]
    );
    if (!pcr.rows[0]) throw new ChangeControlError('PCR_NOT_FOUND', 'PCR not found', 404);
    if (!pcr.rows[0].username)
      throw new ChangeControlError('PCR_INVESTIGATOR_NOT_FOUND', 'Investigator user not found', 404);
    const investigator = {
      userId: Number(input.investigatorUserId),
      username: pcr.rows[0].username,
      displayName:
        [pcr.rows[0].first_name, pcr.rows[0].last_name].filter(Boolean).join(' ') ||
        pcr.rows[0].username,
    };
    const updated = await client.query(
      `UPDATE p2_production_changes
          SET investigator_user_id=$2,investigator_snapshot=$3,
              investigation_due_date=$4,quality_action_status='INVESTIGATION_ASSIGNED',
              quality_action_revision=quality_action_revision+1,updated_at=now()
        WHERE id=$1 RETURNING *`,
      [pcrId, investigator.userId, investigator, isoDate(input.dueDate)]
    );
    await pcrEvent(
      client,
      updated.rows[0],
      'PCR_INVESTIGATOR_ASSIGNED',
      actor,
      text(input.reason) || 'Investigation assigned',
      pcr.rows[0],
      updated.rows[0]
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function decidePcr(
  pcrId: string,
  input: HistoricalRow,
  actor: Actor
) {
  const approvalFunction = text(input.approvalFunction).toUpperCase();
  const capability = PCR_APPROVAL_CAPABILITIES[approvalFunction];
  if (!capability || !actor.capabilities.includes(capability))
    throw new ChangeControlError(
      'PCR_APPROVAL_FORBIDDEN',
      'The required functional approval capability is missing',
      403,
      { requiredCapability: capability }
    );
  const decision = text(input.decision).toUpperCase();
  if (!['APPROVED', 'REJECTED', 'RETURNED'].includes(decision))
    throw new ChangeControlError('PCR_DECISION_INVALID', 'Invalid PCR decision');
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT * FROM p2_production_changes WHERE id=$1 FOR UPDATE',
      [pcrId]
    );
    const pcr = locked.rows[0];
    if (!pcr) throw new ChangeControlError('PCR_NOT_FOUND', 'PCR not found', 404);
    if (pcr.quality_action_status !== 'AWAITING_APPROVAL')
      throw new ChangeControlError(
        'PCR_NOT_AWAITING_APPROVAL',
        'PCR is not awaiting approval',
        409
      );
    if (Number(pcr.requester_user_id) === actor.id)
      throw new ChangeControlError(
        'PCR_SELF_APPROVAL_FORBIDDEN',
        'The PCR requester cannot approve their own request',
        409
      );
    if (!requiredPcrApprovals(pcr).includes(approvalFunction))
      throw new ChangeControlError(
        'PCR_APPROVAL_FUNCTION_NOT_REQUIRED',
        `${approvalFunction} is not required by this impact assessment`,
        409
      );
    const checksum = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          id: pcr.id,
          revision: pcr.quality_action_revision,
          proposedChange: pcr.proposed_change,
          reason: pcr.reason,
          impact: pcr.impact_assessment,
        })
      )
      .digest('hex');
    await client.query(
      `INSERT INTO pcr_functional_approvals (
         pcr_id,record_revision,approval_function,required_capability_snapshot,
         decision,signature_meaning,record_checksum,actor_user_id,actor_snapshot,reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        pcrId,
        pcr.quality_action_revision,
        approvalFunction,
        capability,
        decision,
        text(input.signatureMeaning) || 'I approve this PCR for my functional authority',
        checksum,
        actor.id,
        actorSnapshot(actor),
        nullable(input.reason),
      ]
    );
    const approvals = await client.query(
      `SELECT DISTINCT approval_function FROM pcr_functional_approvals
        WHERE pcr_id=$1 AND record_revision=$2 AND decision='APPROVED'`,
      [pcrId, pcr.quality_action_revision]
    );
    const approved = new Set(approvals.rows.map((row) => row.approval_function));
    if (decision === 'APPROVED') approved.add(approvalFunction);
    const allApproved = requiredPcrApprovals(pcr).every((item) => approved.has(item));
    const nextStatus =
      decision === 'REJECTED'
        ? 'DENIED'
        : decision === 'RETURNED'
          ? 'MORE_INFORMATION_REQUIRED'
          : allApproved
            ? 'APPROVED'
            : 'AWAITING_APPROVAL';
    const updated = await client.query(
      `UPDATE p2_production_changes
          SET quality_action_status=$2,updated_at=now() WHERE id=$1 RETURNING *`,
      [pcrId, nextStatus]
    );
    await pcrEvent(
      client,
      updated.rows[0],
      'PCR_FUNCTIONAL_DECISION',
      actor,
      text(input.reason) || decision,
      null,
      { approvalFunction, decision, checksum, nextStatus }
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function authorizePcrImplementation(
  pcrId: string,
  input: HistoricalRow,
  actor: Actor
) {
  if (!actor.capabilities.includes('qms.quality_action.authorize_implementation'))
    throw new ChangeControlError(
      'PCR_IMPLEMENTATION_AUTHORIZATION_FORBIDDEN',
      'Implementation authorization capability is required',
      403
    );
  const client = await pgPool.connect();
  try {
  await client.query('BEGIN');
  const pcrResult = await client.query(
    `SELECT p.*,r.id AS register_id,r.status AS register_status
       FROM p2_production_changes p
       JOIN change_control_records r
         ON r.authoritative_record_type='PCR' AND r.authoritative_record_id=p.id::text
      WHERE p.id=$1 FOR UPDATE OF p`,
    [pcrId]
  );
  const pcr = pcrResult.rows[0];
  if (!pcr) throw new ChangeControlError('PCR_NOT_FOUND', 'PCR not found', 404);
  if (pcr.design_impact !== false)
    throw new ChangeControlError(
      'PCR_DESIGN_CHANGE_CANNOT_BE_RELEASED',
      'PCR cannot authorize implementation of a possible design change; approved ECR and ECN release are required',
      409
    );
  const state = await loadQualityActionState({
    ...pcr,
    id: pcr.register_id,
    authoritative_record_type: 'PCR',
    authoritative_record_id: pcr.id,
    status: pcr.register_status,
  });
  const gate = evaluateImplementationGate(state);
  const implementationBlockers = gate.blockers.filter(
    (blocker) =>
      !['IMPLEMENTATION_AUTHORIZATION_REQUIRED', 'IMPLEMENTATION_INCOMPLETE',
        'IMPLEMENTATION_VERIFICATION_REQUIRED', 'EFFECTIVENESS_REVIEW_DUE'].includes(blocker.code)
  );
  if (implementationBlockers.length)
    throw new ChangeControlError(
      'PCR_IMPLEMENTATION_GATE_BLOCKED',
      'PCR implementation is blocked by unmet controlled requirements',
      409,
      { blockers: implementationBlockers }
    );
  if (!text(input.reason))
    throw new ChangeControlError(
      'PCR_IMPLEMENTATION_REASON_REQUIRED',
      'Implementation authorization reason is required',
      422
    );
  const result = await client.query(
    `UPDATE p2_production_changes
        SET implementation_authorized_at=now(),implementation_authorized_by_user_id=$2,
            implementation_authorization_snapshot=$3,
            quality_action_status='IMPLEMENTATION_PENDING',updated_at=now()
      WHERE id=$1 AND quality_action_status='APPROVED' RETURNING *`,
    [pcrId, actor.id, actorSnapshot(actor)]
  );
  if (!result.rows[0])
    throw new ChangeControlError(
      'PCR_NOT_APPROVED',
      'PCR must be approved before implementation authorization',
      409
    );
  await pcrEvent(
    client,
    result.rows[0],
    'PCR_IMPLEMENTATION_AUTHORIZED',
    actor,
    text(input.reason),
    null,
    { authorizedAt: result.rows[0].implementation_authorized_at }
  );
  await client.query('COMMIT');
  return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function completePcrImplementation(
  pcrId: string,
  input: HistoricalRow,
  actor: Actor
) {
  if (!actor.capabilities.includes('qms.quality_action.authorize_implementation'))
    throw new ChangeControlError('PCR_IMPLEMENTATION_FORBIDDEN', 'Implementation authority is required', 403);
  if (!text(input.evidence))
    throw new ChangeControlError('PCR_IMPLEMENTATION_EVIDENCE_REQUIRED', 'Implementation evidence is required', 422);
  return updatePcrLifecycle(
    pcrId, 'IMPLEMENTATION_PENDING', 'VERIFICATION', actor,
    'PCR_IMPLEMENTATION_COMPLETED', text(input.evidence),
    `implemented_at=now(),implemented_by_user_id=$3,implementation_evidence=$4`,
    [actor.id, text(input.evidence)]
  );
}

export async function verifyPcrImplementation(
  pcrId: string,
  input: HistoricalRow,
  actor: Actor
) {
  if (!actor.capabilities.includes('qms.quality_action.verify_implementation'))
    throw new ChangeControlError('PCR_VERIFICATION_FORBIDDEN', 'Implementation verification authority is required', 403);
  if (!text(input.results))
    throw new ChangeControlError('PCR_VERIFICATION_RESULTS_REQUIRED', 'Verification results are required', 422);
  return updatePcrLifecycle(
    pcrId, 'VERIFICATION', 'VERIFICATION', actor, 'PCR_IMPLEMENTATION_VERIFIED',
    text(input.results), `verified_at=now(),verified_by_user_id=$3,verification_results=$4`,
    [actor.id, text(input.results)]
  );
}

export async function closePcr(pcrId: string, input: HistoricalRow, actor: Actor) {
  if (!actor.capabilities.includes('qms.quality_action.close'))
    throw new ChangeControlError(
      'PCR_CLOSURE_FORBIDDEN',
      'Quality closure authority is required',
      403
    );
  if (!text(input.reason))
    throw new ChangeControlError(
      'PCR_CLOSURE_REASON_REQUIRED',
      'Closure rationale is required',
      422
    );
  const verified = await pgPool.query(
    `SELECT verified_at FROM p2_production_changes
      WHERE id=$1 AND quality_action_status='VERIFICATION'`,
    [pcrId]
  );
  if (!verified.rows[0]?.verified_at)
    throw new ChangeControlError(
      'PCR_VERIFICATION_REQUIRED',
      'Implementation verification must be completed before closure',
      409
    );
  return updatePcrLifecycle(
    pcrId,
    'VERIFICATION',
    'CLOSED',
    actor,
    'PCR_CLOSED',
    text(input.reason),
    '',
    []
  );
}

async function updatePcrLifecycle(
  pcrId: string,
  expectedStatus: string,
  nextStatus: string,
  actor: Actor,
  eventType: string,
  reason: string,
  assignments: string,
  values: unknown[]
) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(
      'SELECT * FROM p2_production_changes WHERE id=$1 FOR UPDATE',
      [pcrId]
    );
    if (!before.rows[0]) throw new ChangeControlError('PCR_NOT_FOUND', 'PCR not found', 404);
    if (before.rows[0].quality_action_status !== expectedStatus)
      throw new ChangeControlError(
        'PCR_TRANSITION_INVALID',
        `PCR must be ${expectedStatus} before this action`,
        409
      );
    const updated = await client.query(
      `UPDATE p2_production_changes
          SET quality_action_status=$2,quality_action_revision=quality_action_revision+1,
              ${assignments ? `${assignments},` : ''}updated_at=now()
        WHERE id=$1 RETURNING *`,
      [pcrId, nextStatus, ...values]
    );
    await pcrEvent(client, updated.rows[0], eventType, actor, reason, before.rows[0], updated.rows[0]);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
