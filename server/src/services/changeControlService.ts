import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import * as XLSX from 'xlsx';

import { pgPool } from '../../db';
import { createEcr, type EcrActor } from './engineeringChangeRequestService';

export const CHANGE_TYPES = [
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
  if (text(filters.changeType)) add('r.change_type=?', text(filters.changeType));
  if (text(filters.status)) add('r.status=?', text(filters.status));
  if (text(filters.department)) add('r.department=?', text(filters.department));
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
  return result.rows;
}

export async function getChangeControlRecord(id: string) {
  const [record, links, evidence, historicalApprovals, audit] = await Promise.all([
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
  ]);
  if (!record.rows[0])
    throw new ChangeControlError('CHANGE_NOT_FOUND', 'Change record not found', 404);
  return {
    ...record.rows[0],
    links: links.rows,
    evidence: evidence.rows,
    historicalApprovals: historicalApprovals.rows,
    audit: audit.rows,
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
      !['DRAFT', 'ON_HOLD'].includes(record.status)
    )
      throw new ChangeControlError(
        'AFFECTED_RECORDS_IMMUTABLE',
        'Native affected records may only be added while the change is a draft',
        409
      );
    const linkType = text(input.linkType);
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
        text(input.linkedRecordId),
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
