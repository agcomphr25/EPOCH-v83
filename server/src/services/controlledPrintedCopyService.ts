import { createHash, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

import { pgPool } from '../../db';
import { renderProjectForm } from './projectFormInstanceService';

export type CopyActor = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  capabilities: string[];
};
export class ControlledCopyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}
type SourceInput = { sourceType: string; sourceId: string };
type SourceEvidence = {
  sourceType: string;
  sourceId: string;
  documentId: string | null;
  documentVersionId: string | null;
  templateRevisionId: string | null;
  projectFormInstanceId: string | null;
  projectFormRevisionId: string | null;
  ecrId: string | null;
  ecrRevisionId: string | null;
  ecnId: string | null;
  ecnRevisionId: string | null;
  engineeringReleaseId: string | null;
  projectId: string | null;
  recordId: string | null;
  documentNumber: string;
  revision: string;
  retainedPath: string;
  checksum: string;
  historical: boolean;
};

const sha = (value: Buffer | string) =>
  createHash('sha256').update(value).digest('hex');
const snapshot = (actor: CopyActor) => ({
  userId: actor.id,
  username: actor.username,
  displayName: actor.displayName,
  role: actor.role,
  capabilities: actor.capabilities,
});
const one = async (client: PoolClient, text: string, values: unknown[]) =>
  (await client.query(text, values)).rows[0] ?? null;
const terminal = new Set(['CLOSED', 'DESTROYED', 'VOID', 'LOST', 'REPLACED']);

async function resolveSource(
  client: PoolClient,
  input: SourceInput
): Promise<SourceEvidence> {
  let source: any;
  if (input.sourceType === 'DESIGN_CONTROL_TEMPLATE') {
    source = await one(
      client,
      `SELECT r.id AS template_revision_id,r.document_version_history_id,
              t.controlled_document_id,
              r.document_number_snapshot AS document_number,
              r.document_revision_snapshot AS revision,r.lifecycle_status,
              r.blank_pdf_path AS retained_pdf_path,
              r.blank_pdf_checksum AS retained_pdf_checksum,
              t.active_template_revision_id
         FROM design_control_form_template_revisions r
         JOIN design_control_form_templates t ON t.id=r.design_control_form_template_id
        WHERE r.id=$1`,
      [input.sourceId]
    );
    if (
      !source ||
      !['RELEASED', 'SUPERSEDED', 'OBSOLETE'].includes(
        source.lifecycle_status
      ) ||
      (source.lifecycle_status === 'RELEASED' &&
        source.active_template_revision_id !== source.template_revision_id)
    )
      throw new ControlledCopyError(
        'CONTROLLED_COPY_RELEASED_TEMPLATE_REQUIRED',
        'Only the current RELEASED blank template revision may be issued',
        409
      );
  } else if (input.sourceType === 'PROJECT_FORM_INSTANCE') {
    source = await one(
      client,
      `SELECT p.id AS project_form_instance_id,p.current_content_revision_id AS project_form_revision_id,
              t.controlled_document_id,
              p.template_definition_revision_id AS template_revision_id,
              p.document_version_history_id,
              p.template_document_number_snapshot AS document_number,
              p.template_revision_snapshot AS revision,p.lifecycle_status,
              p.rd_project_id,p.design_control_record_id,
              COALESCE(p.retained_pdf_path,a.stored_path) AS retained_pdf_path,
              COALESCE(p.retained_pdf_checksum,a.sha256_checksum) AS retained_pdf_checksum
         FROM project_form_instances p
         JOIN design_control_form_templates t ON t.id=p.template_registration_id
         LEFT JOIN LATERAL (
           SELECT stored_path,sha256_checksum FROM project_form_attachments
            WHERE project_form_instance_id=p.id AND attachment_kind='PAPER_ORIGINAL'
            ORDER BY uploaded_at DESC LIMIT 1
         ) a ON true WHERE p.id=$1`,
      [input.sourceId]
    );
    if (!source || source.lifecycle_status !== 'APPROVED')
      throw new ControlledCopyError(
        'CONTROLLED_COPY_APPROVED_FORM_REQUIRED',
        'Project Form Instance must be approved',
        409
      );
  } else if (input.sourceType === 'ECR') {
    source = await one(
      client,
      `SELECT e.id AS ecr_id,e.current_content_revision_id AS ecr_revision_id,
              t.controlled_document_id,
              e.template_document_version_id AS document_version_history_id,
              e.template_definition_revision_id AS template_revision_id,
              e.ecr_number AS document_number,e.template_revision_snapshot AS revision,
              e.rd_project_id,e.design_control_record_id,e.lifecycle_status,
              e.retained_form_path AS retained_pdf_path,
              e.retained_form_checksum AS retained_pdf_checksum
         FROM engineering_change_requests e
         JOIN design_control_form_templates t ON t.id=e.template_registration_id
        WHERE e.id=$1`,
      [input.sourceId]
    );
    if (!source || source.lifecycle_status !== 'APPROVED')
      throw new ControlledCopyError(
        'CONTROLLED_COPY_APPROVED_ECR_REQUIRED',
        'ECR must be approved',
        409
      );
  } else if (input.sourceType === 'ECN') {
    source = await one(
      client,
      `SELECT e.id AS ecn_id,e.current_content_revision_id AS ecn_revision_id,
              t.controlled_document_id,
              e.template_document_version_id AS document_version_history_id,
              e.template_definition_revision_id AS template_revision_id,
              e.ecn_number AS document_number,e.template_revision_snapshot AS revision,
              e.rd_project_id,e.design_control_record_id,e.status AS lifecycle_status,
              e.retained_form_path AS retained_pdf_path,
              e.retained_form_checksum AS retained_pdf_checksum
         FROM engineering_change_orders e
         JOIN design_control_form_templates t ON t.id=e.template_registration_id
        WHERE e.id=$1`,
      [input.sourceId]
    );
    if (
      !source ||
      ![
        'approved',
        'in_implementation',
        'verification_validation',
        'release_ready',
        'implemented',
        'closed',
      ].includes(source.lifecycle_status)
    )
      throw new ControlledCopyError(
        'CONTROLLED_COPY_APPROVED_ECN_REQUIRED',
        'ECN must be approved or later in its controlled lifecycle',
        409
      );
  } else if (input.sourceType === 'ENGINEERING_RELEASE') {
    source = await one(
      client,
      `SELECT r.id AS engineering_release_id,r.release_number AS document_number,
              r.release_revision AS revision,r.rd_project_id,r.design_control_record_id,
              r.release_status AS lifecycle_status,
              COALESCE((r.metadata->>'retainedReceiptPath'),'') AS retained_pdf_path,
              r.release_checksum AS retained_pdf_checksum
         FROM engineering_releases r WHERE r.id=$1`,
      [input.sourceId]
    );
    if (!source || source.lifecycle_status !== 'RELEASED')
      throw new ControlledCopyError(
        'CONTROLLED_COPY_RELEASED_RECEIPT_REQUIRED',
        'Engineering Release must be released',
        409
      );
  } else {
    throw new ControlledCopyError(
      'CONTROLLED_COPY_SOURCE_UNSUPPORTED',
      'Unsupported controlled-copy source type'
    );
  }
  if (!source.retained_pdf_path || !source.retained_pdf_checksum)
    throw new ControlledCopyError(
      'CONTROLLED_COPY_IMMUTABLE_ARTIFACT_REQUIRED',
      'The exact retained source artifact and checksum are required',
      409
    );
  const bytes = String(source.retained_pdf_path).startsWith('internal://')
    ? Buffer.alloc(0)
    : await fs
        .readFile(path.resolve(source.retained_pdf_path))
        .catch(() => null);
  if (
    bytes === null ||
    (bytes.length > 0 && sha(bytes) !== source.retained_pdf_checksum)
  )
    throw new ControlledCopyError(
      'CONTROLLED_COPY_SOURCE_CHECKSUM_MISMATCH',
      'The retained source artifact is missing or failed checksum verification',
      409
    );
  return {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    documentId: source.controlled_document_id ?? null,
    documentVersionId: source.document_version_history_id ?? null,
    templateRevisionId: source.template_revision_id ?? null,
    projectFormInstanceId: source.project_form_instance_id ?? null,
    projectFormRevisionId: source.project_form_revision_id ?? null,
    ecrId: source.ecr_id ?? null,
    ecrRevisionId: source.ecr_revision_id ?? null,
    ecnId: source.ecn_id ?? null,
    ecnRevisionId: source.ecn_revision_id ?? null,
    engineeringReleaseId: source.engineering_release_id ?? null,
    projectId: source.rd_project_id ?? null,
    recordId: source.design_control_record_id ?? null,
    documentNumber: source.document_number,
    revision: source.revision,
    retainedPath: source.retained_pdf_path,
    checksum: source.retained_pdf_checksum,
    historical: Boolean(
      source.lifecycle_status === 'OBSOLETE' ||
      source.lifecycle_status === 'SUPERSEDED'
    ),
  };
}

async function loadSourceBytes(
  source: SourceEvidence,
  actor: CopyActor
): Promise<Buffer> {
  const bytes =
    source.retainedPath.startsWith('internal://project-form/') &&
    source.projectFormInstanceId
      ? (
          await renderProjectForm({
            instanceId: source.projectFormInstanceId,
            retainApproved: true,
            actor,
            request: {},
          })
        ).buffer
      : await fs.readFile(path.resolve(source.retainedPath));
  if (sha(bytes) !== source.checksum)
    throw new ControlledCopyError(
      'CONTROLLED_COPY_SOURCE_CHECKSUM_MISMATCH',
      'The exact retained source artifact failed checksum verification',
      409
    );
  return bytes;
}

async function stampPdf(
  sourceBytes: Buffer,
  label: 'CONTROLLED COPY' | 'UNCONTROLLED WHEN PRINTED',
  details: {
    copyNumber?: string;
    documentNumber: string;
    revision: string;
    issuedTo?: string;
    issueDate?: string;
    verificationUrl?: string;
    checksum: string;
  }
) {
  const pdf = await PDFDocument.load(sourceBytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const qr = details.verificationUrl
    ? await pdf.embedPng(await QRCode.toBuffer(details.verificationUrl))
    : null;
  const pages = pdf.getPages();
  for (const [index, page] of pages.entries()) {
    const { width, height } = page.getSize();
    page.drawRectangle({
      x: 0,
      y: height - 34,
      width,
      height: 34,
      color:
        label === 'CONTROLLED COPY' ? rgb(0.82, 0.92, 1) : rgb(1, 0.9, 0.75),
      opacity: 0.96,
    });
    page.drawText(label, { x: 18, y: height - 22, size: 12, font });
    page.drawText(
      `${details.copyNumber ?? ''} | ${details.documentNumber} Rev ${details.revision} | ${details.issuedTo ?? ''} | ${details.issueDate ?? ''}`,
      { x: 150, y: height - 21, size: 7, font }
    );
    page.drawText(
      `Page ${index + 1} of ${pages.length} | SHA-256 ${details.checksum.slice(0, 16)} | Status at issue: ISSUED`,
      { x: 18, y: 14, size: 7, font }
    );
    if (qr) page.drawImage(qr, { x: width - 42, y: 2, width: 34, height: 34 });
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

export async function renderUncontrolledPrint(
  input: SourceInput,
  actor: CopyActor
) {
  const client = await pgPool.connect();
  try {
    const source = await resolveSource(client, input);
    const bytes = await loadSourceBytes(source, actor);
    return {
      bytes: await stampPdf(bytes, 'UNCONTROLLED WHEN PRINTED', {
        documentNumber: source.documentNumber,
        revision: source.revision,
        checksum: source.checksum,
      }),
      createsControlledCopyRecord: false,
    };
  } finally {
    client.release();
  }
}

async function event(
  client: PoolClient,
  copy: any,
  type: string,
  prior: string | null,
  resulting: string,
  actor: CopyActor,
  reason: string,
  before: unknown,
  after: unknown,
  replacementId?: string | null
) {
  return one(
    client,
    `INSERT INTO controlled_printed_copy_events (
       controlled_copy_id,copy_number_snapshot,event_type,prior_status,
       resulting_status,actor_user_id,actor_snapshot,recipient_snapshot,reason,
       source_pdf_checksum,issued_pdf_checksum,related_replacement_copy_id,
       before_values,after_values
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13::jsonb,$14::jsonb)
     RETURNING *`,
    [
      copy.id,
      copy.copy_number,
      type,
      prior,
      resulting,
      actor.id,
      JSON.stringify(snapshot(actor)),
      JSON.stringify(copy.recipient_snapshot),
      reason,
      copy.source_pdf_checksum,
      copy.issued_pdf_checksum,
      replacementId ?? null,
      JSON.stringify(before),
      JSON.stringify(after),
    ]
  );
}

export async function issueControlledCopy(
  input: SourceInput & {
    recipient: Record<string, unknown>;
    department?: string;
    location?: string;
    purpose: string;
    dueAt?: string;
    acknowledgementRequired?: boolean;
    historicalException?: { reason: string; authorizedBy: string };
  },
  actor: CopyActor,
  verificationBaseUrl: string,
  transactionClient?: PoolClient
) {
  const owned = !transactionClient;
  const client = transactionClient ?? (await pgPool.connect());
  let issuedPathToCleanup: string | null = null;
  try {
    if (owned) await client.query('BEGIN');
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('controlled-copy-number'))`
    );
    const source = await resolveSource(client, input);
    if (source.historical && !input.historicalException)
      throw new ControlledCopyError(
        'CONTROLLED_COPY_OBSOLETE_SOURCE_BLOCKED',
        'Obsolete or superseded sources require an authorized historical-reference exception',
        409
      );
    if (!input.recipient?.type || !input.recipient?.displayName)
      throw new ControlledCopyError(
        'CONTROLLED_COPY_STRUCTURED_RECIPIENT_REQUIRED',
        'Recipient type and display name are required'
      );
    if (input.recipient.type === 'EMPLOYEE' && !input.recipient.userId)
      throw new ControlledCopyError(
        'CONTROLLED_COPY_INTERNAL_USER_REQUIRED',
        'An authenticated employee recipient requires a user ID'
      );
    let recipient = input.recipient;
    if (input.recipient.type === 'EMPLOYEE') {
      const employee = await one(
        client,
        `SELECT id,username,first_name,last_name,role
           FROM users WHERE id=$1 AND is_active=true`,
        [input.recipient.userId]
      );
      if (!employee)
        throw new ControlledCopyError(
          'CONTROLLED_COPY_RECIPIENT_NOT_FOUND',
          'Authenticated employee recipient was not found',
          404
        );
      recipient = {
        type: 'EMPLOYEE',
        userId: employee.id,
        username: employee.username,
        displayName:
          [employee.first_name, employee.last_name].filter(Boolean).join(' ') ||
          employee.username,
        role: employee.role,
      };
    }
    const sequence = await one(
      client,
      `SELECT nextval('controlled_printed_copy_number_seq') AS value`,
      []
    );
    const copyNumber = `CC-${new Date().getUTCFullYear()}-${String(sequence.value).padStart(6, '0')}`;
    const token = randomBytes(24).toString('hex');
    const sourceBytes = await loadSourceBytes(source, actor);
    const issuedAt = new Date().toISOString();
    const issuedBytes = await stampPdf(sourceBytes, 'CONTROLLED COPY', {
      copyNumber,
      documentNumber: source.documentNumber,
      revision: source.revision,
      issuedTo: String(recipient.displayName),
      issueDate: issuedAt.slice(0, 10),
      verificationUrl: `${verificationBaseUrl}/api/controlled-copies/verify/${token}`,
      checksum: source.checksum,
    });
    const issuedChecksum = sha(issuedBytes);
    const directory = path.resolve(
      process.cwd(),
      'uploads',
      'controlled-copies'
    );
    await fs.mkdir(directory, { recursive: true });
    const issuedPath = path.join(
      directory,
      `${copyNumber}-${issuedChecksum}.pdf`
    );
    await fs.writeFile(issuedPath, issuedBytes, { flag: 'wx' });
    issuedPathToCleanup = issuedPath;
    const copy = await one(
      client,
      `INSERT INTO controlled_printed_copies (
         copy_number,source_type,controlled_document_id,document_version_history_id,
         design_control_template_revision_id,project_form_instance_id,
         project_form_instance_revision_id,ecr_id,ecr_revision_id,ecn_id,ecn_revision_id,
         engineering_release_id,rd_project_id,design_control_record_id,
         source_document_number,source_revision,source_artifact_path,source_pdf_checksum,
         issued_artifact_path,issued_pdf_checksum,verification_token_hash,
         recipient_type,recipient_user_id,recipient_snapshot,department,location,purpose,
         acknowledgement_required,issued_by_user_id,issued_by_snapshot,due_at,
         source_historical_exception
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
         $19,$20,$21,$22,$23,$24::jsonb,$25,$26,$27,$28,$29,$30::jsonb,$31,$32::jsonb)
       RETURNING *`,
      [
        copyNumber,
        source.sourceType,
        source.documentId,
        source.documentVersionId,
        source.templateRevisionId,
        source.projectFormInstanceId,
        source.projectFormRevisionId,
        source.ecrId,
        source.ecrRevisionId,
        source.ecnId,
        source.ecnRevisionId,
        source.engineeringReleaseId,
        source.projectId,
        source.recordId,
        source.documentNumber,
        source.revision,
        source.retainedPath,
        source.checksum,
        issuedPath,
        issuedChecksum,
        sha(token),
        recipient.type,
        recipient.userId ?? null,
        JSON.stringify(recipient),
        input.department ?? null,
        input.location ?? null,
        input.purpose,
        Boolean(input.acknowledgementRequired),
        actor.id,
        JSON.stringify(snapshot(actor)),
        input.dueAt ?? null,
        JSON.stringify(input.historicalException ?? null),
      ]
    );
    await event(
      client,
      copy,
      'ISSUED',
      null,
      'ISSUED',
      actor,
      input.purpose,
      null,
      copy
    );
    if (owned) await client.query('COMMIT');
    issuedPathToCleanup = null;
    return { copy, verificationToken: token, bytes: issuedBytes };
  } catch (error) {
    if (owned) await client.query('ROLLBACK').catch(() => undefined);
    if (owned && issuedPathToCleanup)
      await fs.unlink(issuedPathToCleanup).catch(() => undefined);
    throw error;
  } finally {
    if (owned) client.release();
  }
}

const allowed: Record<string, string[]> = {
  ISSUED: ['RETURNED', 'DESTROYED', 'VOID', 'LOST', 'REPLACED'],
  RETURNED: ['SCANNED', 'DESTROYED', 'VOID'],
  SCANNED: ['CLOSED'],
};

export async function transitionControlledCopy(
  copyId: string,
  nextStatus: string,
  reason: string,
  actor: CopyActor,
  details: Record<string, unknown> = {}
) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const copy = await one(
      client,
      `SELECT * FROM controlled_printed_copies WHERE id=$1 FOR UPDATE`,
      [copyId]
    );
    if (!copy)
      throw new ControlledCopyError(
        'CONTROLLED_COPY_NOT_FOUND',
        'Controlled copy not found',
        404
      );
    if (
      terminal.has(copy.lifecycle_status) ||
      !(allowed[copy.lifecycle_status] ?? []).includes(nextStatus)
    )
      throw new ControlledCopyError(
        'CONTROLLED_COPY_TRANSITION_INVALID',
        `Cannot transition ${copy.lifecycle_status} to ${nextStatus}`,
        409
      );
    if (['DESTROYED', 'VOID'].includes(nextStatus) && !details.evidence)
      throw new ControlledCopyError(
        'CONTROLLED_COPY_DISPOSITION_EVIDENCE_REQUIRED',
        'Destruction or void evidence is required',
        422
      );
    if (nextStatus === 'LOST') {
      const required = [
        'discoveryDate',
        'reportedBy',
        'lastKnownHolderLocation',
        'searchActions',
        'securityAssessment',
        'qualityImpactAssessment',
        'revisionRisk',
        'dispositionApproval',
      ];
      const missing = required.filter((key) => !details[key]);
      if (missing.length)
        throw new ControlledCopyError(
          'CONTROLLED_COPY_LOSS_ASSESSMENT_REQUIRED',
          'Lost-copy assessment is incomplete',
          422,
          { missing }
        );
    }
    if (nextStatus === 'CLOSED') {
      const acceptance = await one(
        client,
        `SELECT id FROM controlled_printed_copy_scan_acceptances
          WHERE controlled_copy_id=$1 AND decision='ACCEPTED'
          ORDER BY decided_at DESC LIMIT 1`,
        [copyId]
      );
      if (!acceptance)
        throw new ControlledCopyError(
          'CONTROLLED_COPY_SCAN_ACCEPTANCE_REQUIRED',
          'Returned scan review and acceptance are required before closure',
          409
        );
    }
    const updated = await one(
      client,
      `UPDATE controlled_printed_copies SET lifecycle_status=$2,disposition=$3,
         returned_at=CASE WHEN $2='RETURNED' THEN now() ELSE returned_at END,
         closed_at=CASE WHEN $2 IN ('CLOSED','DESTROYED','VOID','LOST','REPLACED') THEN now() ELSE closed_at END
       WHERE id=$1 RETURNING *`,
      [copyId, nextStatus, reason]
    );
    await event(
      client,
      updated,
      nextStatus,
      copy.lifecycle_status,
      nextStatus,
      actor,
      reason,
      copy,
      { ...updated, details }
    );
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function acknowledgeControlledCopy(
  copyId: string,
  actor: CopyActor
) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const copy = await one(
      client,
      `SELECT * FROM controlled_printed_copies WHERE id=$1 FOR UPDATE`,
      [copyId]
    );
    if (!copy || copy.lifecycle_status !== 'ISSUED')
      throw new ControlledCopyError(
        'CONTROLLED_COPY_ACKNOWLEDGEMENT_INVALID',
        'Only an issued copy may be acknowledged',
        409
      );
    const updated = await one(
      client,
      `UPDATE controlled_printed_copies SET acknowledged_by_user_id=$2,acknowledgement_snapshot=$3::jsonb,acknowledged_at=now() WHERE id=$1 RETURNING *`,
      [copyId, actor.id, JSON.stringify(snapshot(actor))]
    );
    await event(
      client,
      updated,
      'ACKNOWLEDGED',
      'ISSUED',
      'ISSUED',
      actor,
      'Recipient acknowledgement',
      copy,
      updated
    );
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function uploadReturnedScan(
  copyId: string,
  input: {
    originalFilename: string;
    mimeType: string;
    bytes: Buffer;
    completedFormEvidence: boolean;
  },
  actor: CopyActor
) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const copy = await one(
      client,
      `SELECT * FROM controlled_printed_copies WHERE id=$1 FOR UPDATE`,
      [copyId]
    );
    if (!copy || copy.lifecycle_status !== 'RETURNED')
      throw new ControlledCopyError(
        'CONTROLLED_COPY_RETURN_REQUIRED',
        'Record physical return before scan upload',
        409
      );
    const checksum = sha(input.bytes);
    const directory = path.resolve(
      process.cwd(),
      'uploads',
      'controlled-copy-returns'
    );
    await fs.mkdir(directory, { recursive: true });
    const storedPath = path.join(
      directory,
      `${copy.copy_number}-${checksum}.pdf`
    );
    await fs.writeFile(storedPath, input.bytes, { flag: 'wx' });
    const updated = await one(
      client,
      `UPDATE controlled_printed_copies SET lifecycle_status='SCANNED' WHERE id=$1 RETURNING *`,
      [copyId]
    );
    const copyEvent = await event(
      client,
      updated,
      'RETURN_SCAN_UPLOADED',
      'RETURNED',
      'SCANNED',
      actor,
      'Immutable returned-copy scan retained',
      copy,
      { checksum, completedFormEvidence: input.completedFormEvidence }
    );
    const attachment = await one(
      client,
      `INSERT INTO controlled_printed_copy_attachments (
      controlled_copy_id,event_id,attachment_kind,original_filename,stored_path,mime_type,
      byte_size,sha256_checksum,completed_form_evidence,linked_project_form_instance_id,
      linked_ecr_id,linked_ecn_id,uploaded_by_user_id,uploaded_by_snapshot
    ) VALUES ($1,$2,'RETURN_SCAN',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING *`,
      [
        copyId,
        copyEvent.id,
        input.originalFilename,
        storedPath,
        input.mimeType,
        input.bytes.length,
        checksum,
        input.completedFormEvidence,
        copy.project_form_instance_id,
        copy.ecr_id,
        copy.ecn_id,
        actor.id,
        JSON.stringify(snapshot(actor)),
      ]
    );
    await client.query('COMMIT');
    return {
      copy: updated,
      attachment,
      paperFormIntegration:
        input.completedFormEvidence && copy.project_form_instance_id
          ? 'EXISTING_PROJECT_FORM_INSTANCE'
          : null,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function acceptReturnedScan(
  copyId: string,
  attachmentId: string,
  decision: 'ACCEPTED' | 'REJECTED',
  reason: string,
  actor: CopyActor
) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const copy = await one(
      client,
      `SELECT * FROM controlled_printed_copies WHERE id=$1 FOR UPDATE`,
      [copyId]
    );
    if (!copy || copy.lifecycle_status !== 'SCANNED')
      throw new ControlledCopyError(
        'CONTROLLED_COPY_SCAN_REVIEW_INVALID',
        'Only a scanned returned copy may be reviewed',
        409
      );
    const attachment = await one(
      client,
      `SELECT * FROM controlled_printed_copy_attachments
        WHERE id=$1 AND controlled_copy_id=$2`,
      [attachmentId, copyId]
    );
    if (!attachment)
      throw new ControlledCopyError(
        'CONTROLLED_COPY_SCAN_NOT_FOUND',
        'Returned scan attachment not found',
        404
      );
    const acceptance = await one(
      client,
      `INSERT INTO controlled_printed_copy_scan_acceptances (
         controlled_copy_id,attachment_id,decision,reason,actor_user_id,actor_snapshot
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
      [
        copyId,
        attachmentId,
        decision,
        reason,
        actor.id,
        JSON.stringify(snapshot(actor)),
      ]
    );
    await event(
      client,
      copy,
      `RETURN_SCAN_${decision}`,
      'SCANNED',
      'SCANNED',
      actor,
      reason,
      attachment,
      acceptance
    );
    await client.query('COMMIT');
    return acceptance;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function replaceControlledCopy(
  copyId: string,
  input: Parameters<typeof issueControlledCopy>[0] & {
    replacementReason: string;
    priorDisposition: string;
  },
  actor: CopyActor,
  verificationBaseUrl: string
) {
  const client = await pgPool.connect();
  let issuedPathToCleanup: string | null = null;
  try {
    await client.query('BEGIN');
    const locked = await one(
      client,
      `SELECT * FROM controlled_printed_copies WHERE id=$1 FOR UPDATE`,
      [copyId]
    );
    if (!locked || locked.lifecycle_status !== 'ISSUED')
      throw new ControlledCopyError(
        'CONTROLLED_COPY_REPLACEMENT_INVALID',
        'Only an outstanding issued copy may be replaced',
        409
      );
    if (!input.replacementReason?.trim() || !input.priorDisposition?.trim())
      throw new ControlledCopyError(
        'CONTROLLED_COPY_REPLACEMENT_REASON_REQUIRED',
        'Replacement reason and prior-copy disposition are required',
        422
      );
    const result = await issueControlledCopy(
      input,
      actor,
      verificationBaseUrl,
      client
    );
    issuedPathToCleanup = result.copy.issued_artifact_path;
    if (
      result.copy.source_type !== locked.source_type ||
      result.copy.source_pdf_checksum !== locked.source_pdf_checksum ||
      result.copy.source_revision !== locked.source_revision
    )
      throw new ControlledCopyError(
        'CONTROLLED_COPY_REPLACEMENT_SOURCE_MISMATCH',
        'Replacement must use the exact same controlled source revision and checksum',
        409
      );
    const replacement = await one(
      client,
      `UPDATE controlled_printed_copies SET replacement_for_copy_id=$2 WHERE id=$1 RETURNING *`,
      [result.copy.id, copyId]
    );
    await client.query(
      `UPDATE controlled_printed_copies SET lifecycle_status='REPLACED',disposition=$2,replaced_by_copy_id=$3,closed_at=now() WHERE id=$1`,
      [copyId, input.priorDisposition, result.copy.id]
    );
    await event(
      client,
      locked,
      'REPLACED',
      'ISSUED',
      'REPLACED',
      actor,
      input.replacementReason,
      locked,
      { replacementCopyId: result.copy.id },
      result.copy.id
    );
    await event(
      client,
      replacement,
      'REPLACEMENT_ISSUED',
      null,
      'ISSUED',
      actor,
      input.replacementReason,
      null,
      replacement,
      copyId
    );
    await client.query('COMMIT');
    issuedPathToCleanup = null;
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (issuedPathToCleanup)
      await fs.unlink(issuedPathToCleanup).catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listControlledCopies(
  filters: Record<string, string | undefined>
) {
  const result = await pgPool.query(
    `SELECT c.*,EXTRACT(day FROM now()-c.due_at)::int AS overdue_age_days,
       EXISTS(SELECT 1 FROM design_control_form_template_revisions r
         WHERE r.id=c.design_control_template_revision_id
           AND r.lifecycle_status IN ('OBSOLETE','SUPERSEDED')) AS obsolete_source_conflict
     FROM controlled_printed_copies c
     WHERE ($1::text IS NULL OR c.lifecycle_status=$1)
       AND ($2::text IS NULL OR c.rd_project_id=$2)
       AND ($3::uuid IS NULL OR c.design_control_record_id=$3)
       AND ($4::text IS NULL OR c.department=$4)
       AND ($5::uuid IS NULL OR c.controlled_document_id=$5)
     ORDER BY c.issued_at DESC`,
    [
      filters.status ?? null,
      filters.projectId ?? null,
      filters.recordId ?? null,
      filters.department ?? null,
      filters.documentId ?? null,
    ]
  );
  return result.rows;
}
export async function getControlledCopy(copyId: string) {
  return (
    (
      await pgPool.query(
        `SELECT * FROM controlled_printed_copies WHERE id=$1`,
        [copyId]
      )
    ).rows[0] ?? null
  );
}
export async function getControlledCopyHistory(copyId: string) {
  return (
    await pgPool.query(
      `SELECT * FROM controlled_printed_copy_events WHERE controlled_copy_id=$1 ORDER BY occurred_at,id`,
      [copyId]
    )
  ).rows;
}
export async function getIssuedCopyPdf(copyId: string) {
  const copy = await getControlledCopy(copyId);
  if (!copy)
    throw new ControlledCopyError(
      'CONTROLLED_COPY_NOT_FOUND',
      'Controlled copy not found',
      404
    );
  const bytes = await fs.readFile(path.resolve(copy.issued_artifact_path));
  if (sha(bytes) !== copy.issued_pdf_checksum)
    throw new ControlledCopyError(
      'CONTROLLED_COPY_ISSUED_CHECKSUM_MISMATCH',
      'Retained issued artifact failed checksum verification',
      409
    );
  return { copy, bytes };
}
export async function recordControlledCopyDownload(
  copyId: string,
  actor: CopyActor
) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const copy = await one(
      client,
      `SELECT * FROM controlled_printed_copies WHERE id=$1 FOR SHARE`,
      [copyId]
    );
    if (!copy)
      throw new ControlledCopyError(
        'CONTROLLED_COPY_NOT_FOUND',
        'Controlled copy not found',
        404
      );
    await event(
      client,
      copy,
      'ISSUED_PDF_DOWNLOADED',
      copy.lifecycle_status,
      copy.lifecycle_status,
      actor,
      'Retained issued artifact downloaded',
      null,
      { checksum: copy.issued_pdf_checksum }
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
export async function verifyControlledCopy(token: string) {
  const copy = (
    await pgPool.query(
      `SELECT copy_number,source_document_number,source_revision,lifecycle_status,issued_at,issued_pdf_checksum FROM controlled_printed_copies WHERE verification_token_hash=$1`,
      [sha(token)]
    )
  ).rows[0];
  return copy ?? null;
}
export async function reconcileLegacyDistributionLogs(actor: CopyActor) {
  const result =
    await pgPool.query(`INSERT INTO controlled_printed_copy_legacy_links (
    document_distribution_log_id,reconciliation_status,deterministic_source_reference,reason
  ) SELECT d.id,'LEGACY_DISTRIBUTION_UNVERIFIED',
    jsonb_build_object('documentId',d.document_id,'documentType',d.document_type),
    'Legacy distribution retained without inventing controlled-copy identity or disposition'
    FROM document_distribution_logs d
    ON CONFLICT (document_distribution_log_id) DO NOTHING RETURNING id`);
  return {
    linked: result.rowCount,
    status: 'LEGACY_DISTRIBUTION_UNVERIFIED',
    automaticallyIssued: 0,
    actor: snapshot(actor),
  };
}
export async function assertNoOutstandingCopiesForRevision(
  revisionId: string,
  exception?: { reason: string; actor: CopyActor }
) {
  const copies = (
    await pgPool.query(
      `SELECT id,copy_number,lifecycle_status FROM controlled_printed_copies WHERE design_control_template_revision_id=$1 AND lifecycle_status='ISSUED'`,
      [revisionId]
    )
  ).rows;
  if (copies.length && !exception)
    throw new ControlledCopyError(
      'CONTROLLED_COPY_OBSOLESCENCE_BLOCKED',
      'Outstanding controlled copies must be reconciled before obsolescence',
      409,
      { copies }
    );
  if (copies.length && exception) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      for (const item of copies) {
        const copy = await one(
          client,
          `SELECT * FROM controlled_printed_copies WHERE id=$1 FOR UPDATE`,
          [item.id]
        );
        await event(
          client,
          copy,
          'OBSOLESCENCE_EXCEPTION_AUTHORIZED',
          copy.lifecycle_status,
          copy.lifecycle_status,
          exception.actor,
          exception.reason,
          copy,
          { outstandingException: true }
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  return { ready: true, outstanding: copies, exception: exception ?? null };
}
