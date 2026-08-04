import { createHash } from 'crypto';

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { pool } from '../../db';
import { requirePermission } from '../../middleware/requirePermission';
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
} from '../services/fileStorageProvider';
import {
  assessLegacyControlledDocument,
  checksumAuthoritativeBytes,
  CONTROLLED_DOCUMENT_RECONCILIATION_POLICY_VERSION,
  hashReconciliationPreview,
  type LegacyReconciliationAssessment,
} from '../services/controlledDocumentReconciliationService';
import { readContainedReconciliationFile } from '../services/controlledDocumentReconciliationFileResolver';
import {
  getControlledDocumentReconciliationAvailability,
  requireControlledDocumentReconciliationEnabled,
} from '../services/controlledDocumentReconciliationGate';
import { createControlledRevision } from '../services/controlledDocumentLifecycleService';
import { reportParentOnlyOperationalReferences } from '../services/controlledDocumentOperationalReferenceReport';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const requireAuth = async (req: Request, res: Response, next: () => void) => {
  const token =
    req.cookies?.sessionToken ||
    req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const session = await pool.query(
    `SELECT u.id, u.username, u.role FROM user_sessions s JOIN users u ON lower(u.username)=lower(s.username) WHERE s.session_token=$1 AND s.is_active=true AND s.expires_at>now() AND u.is_active=true LIMIT 1`,
    [token]
  );
  if (!session.rows[0])
    return res.status(401).json({ error: 'Authentication required' });
  (req as any).user = session.rows[0];
  next();
};
const actor = (req: Request) => ({
  id: Number((req as any).user.id),
  username: String((req as any).user.username),
  role: String((req as any).user.role),
});
const referenceType = (value: string | null) =>
  !value
    ? 'NONE'
    : /^https?:\/\//i.test(value)
      ? 'EXTERNAL_MUTABLE_URL'
      : value.startsWith('/objects/')
        ? 'OBJECT_STORAGE'
        : value.startsWith('/supabase-objects/')
          ? 'SUPABASE_OBJECT_STORAGE'
          : 'LEGACY_LOCAL_PATH';
const readBytes = async (value: string) => {
  if (value.startsWith('/objects/') || value.startsWith('/supabase-objects/'))
    return {
      bytes:
        await getFileStorageProviderForObjectPath(value).downloadBuffer(value),
      identity: { kind: 'OBJECT_STORAGE' },
    };
  return readContainedReconciliationFile(value);
};

type Queryable = {
  query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>;
};
async function inventory(
  client: Queryable = pool
): Promise<LegacyReconciliationAssessment[]> {
  const [
    documentsResult,
    revisionsResult,
    approvalsResult,
    registryResult,
    evidenceResult,
  ] = await Promise.all([
    client.query('SELECT * FROM controlled_documents ORDER BY created_at DESC'),
    client.query('SELECT * FROM document_version_history'),
    client.query('SELECT * FROM controlled_document_revision_approvals'),
    client.query('SELECT * FROM controlled_document_number_registry'),
    client.query(`SELECT id,controlled_document_id,revision_id,evidence_type,evidence_payload,immutable_file_path,immutable_file_checksum,
      immutable_file_media_type,immutable_file_size,confirmed_at,confirmed_by_user_id,created_at
      FROM controlled_document_reconciliation_evidence ORDER BY created_at`),
  ]);
  const documents = documentsResult.rows;
  const revisions = revisionsResult.rows;
  const approvals = approvalsResult.rows;
  const registry = registryResult.rows;
  const evidence = evidenceResult.rows;
  const counts = new Map<string, number>();
  const byDocument = new Map<string, typeof revisions>();
  const byId = new Map(revisions.map((r) => [r.id, r]));
  for (const d of documents) {
    const n = d.document_number.trim().toUpperCase();
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  for (const r of revisions) {
    const rows = byDocument.get(r.document_id) || [];
    rows.push(r);
    byDocument.set(r.document_id, rows);
  }
  return Promise.all(
    documents.map(async (d) => {
      const rows = byDocument.get(d.id) || [];
      const pointed = d.current_released_revision_id
        ? byId.get(d.current_released_revision_id)
        : null;
      const revision =
        pointed?.document_id === d.id
          ? pointed
          : rows.length === 1
            ? rows[0]
            : null;
      const confirmedEvidence = evidence.filter(
        (item) =>
          item.controlled_document_id === d.id &&
          item.confirmed_at &&
          item.confirmed_by_user_id &&
          (!item.revision_id || item.revision_id === revision?.id)
      );
      const confirmedFile = [...confirmedEvidence]
        .reverse()
        .find((item) => item.evidence_type === 'AUTHORITATIVE_HISTORICAL_FILE');
      const confirmedApproval = [...confirmedEvidence]
        .reverse()
        .find((item) => item.evidence_type === 'LEGACY_APPROVAL_EVIDENCE');
      const fileReference =
        confirmedFile?.immutable_file_path ||
        revision?.file_path ||
        d.file_path ||
        null;
      let accessibility:
        'ACCESSIBLE' | 'INACCESSIBLE' | 'EXTERNAL_MUTABLE' | 'MISSING' =
        fileReference ? 'INACCESSIBLE' : 'MISSING';
      let observedChecksum: string | null = null;
      if (referenceType(fileReference) === 'EXTERNAL_MUTABLE_URL')
        accessibility = 'EXTERNAL_MUTABLE';
      else if (fileReference)
        try {
          observedChecksum = checksumAuthoritativeBytes(
            (await readBytes(fileReference)).bytes
          );
          accessibility = 'ACCESSIBLE';
        } catch {
          accessibility = 'INACCESSIBLE';
        }
      const approval = approvals.find((a) => a.revision_id === revision?.id);
      const normalized = d.document_number.trim().toUpperCase();
      const pointerProblems: string[] = [];
      for (const [column, value] of [
        ['current_revision_id', d.current_revision_id],
        ['working_draft_revision_id', d.working_draft_revision_id],
        ['current_released_revision_id', d.current_released_revision_id],
      ] as const) {
        if (!value) continue;
        const target = byId.get(value);
        if (!target)
          pointerProblems.push(`${column} identifies a missing revision`);
        else if (target.document_id !== d.id)
          pointerProblems.push(`${column} identifies another document`);
      }
      if (
        d.current_revision_id &&
        d.working_draft_revision_id &&
        d.current_revision_id !== d.working_draft_revision_id
      )
        pointerProblems.push(
          'Current and working revision pointers are contradictory'
        );
      const acceptedEvidence = confirmedEvidence.map((item) => ({
        id: item.id,
        type: item.evidence_type,
        revisionId: item.revision_id,
        confirmedAt: item.confirmed_at,
      }));
      const assessment = assessLegacyControlledDocument({
        documentId: d.id,
        documentNumber: d.document_number,
        title: d.document_name,
        legacyStatus: d.status,
        lifecycleStatus: d.lifecycle_status,
        currentVersion: d.current_version,
        currentReleasedRevisionId: d.current_released_revision_id,
        revisionId: revision?.id || null,
        revisionCount: rows.length,
        revisionVersion: revision?.version_number || null,
        revisionLifecycleStatus:
          revision?.lifecycle_status || revision?.status || null,
        revisionChecksum: revision?.file_checksum || null,
        revisionChecksumStatus: revision?.checksum_status || null,
        fileReference,
        fileReferenceType: referenceType(fileReference),
        fileAccessibility: accessibility,
        observedChecksum,
        approvalIdentity:
          revision?.approved_by ||
          approval?.actor_username_snapshot ||
          confirmedApproval?.evidence_payload?.approvalIdentity ||
          null,
        approvalDate:
          revision?.approved_at ||
          approval?.created_at ||
          confirmedApproval?.evidence_payload?.approvalDate ||
          null,
        effectiveDate:
          revision?.effective_date ||
          d.effective_date ||
          confirmedApproval?.evidence_payload?.effectiveDate ||
          null,
        duplicateNumber:
          (counts.get(normalized) || 0) > 1 ||
          registry.some(
            (r) =>
              r.normalized_number === normalized &&
              r.controlled_document_id !== d.id
          ),
        pointerProblems,
        contradictoryLifecycle:
          d.lifecycle_status === 'RELEASED' &&
          !['approved', 'active'].includes(d.status.toLowerCase()),
        requiresCurrentApprovalWorkflow: Boolean(confirmedFile),
      });
      return {
        ...assessment,
        fileReference: null,
        acceptedEvidence,
      } as LegacyReconciliationAssessment;
    })
  );
}

router.get(
  '/status',
  requireAuth,
  requirePermission('documents.reconciliation_view'),
  async (_req, res) => {
    const availability =
      await getControlledDocumentReconciliationAvailability();
    res.status(availability.enabled ? 200 : 503).json(availability);
  }
);

router.use(requireAuth, requireControlledDocumentReconciliationEnabled);

router.get(
  '/inventory',
  requirePermission('documents.reconciliation_view'),
  async (_req, res) => {
    const assessments = await inventory();
    res.json({
      readOnly: true,
      policyVersion: CONTROLLED_DOCUMENT_RECONCILIATION_POLICY_VERSION,
      groups: assessments.reduce<Record<string, number>>(
        (g, r) => ((g[r.classification] = (g[r.classification] || 0) + 1), g),
        {}
      ),
      assessments,
    });
  }
);
router.get(
  '/operational-references',
  requirePermission('documents.reconciliation_view'),
  async (_req, res) => {
    res.json({
      readOnly: true,
      rewrittenRecords: 0,
      references: await reportParentOnlyOperationalReferences(pool),
    });
  }
);
router.post(
  '/preview',
  requirePermission('documents.reconciliation_preview'),
  async (req, res) => {
    const ids = z.array(z.string().uuid()).min(1).parse(req.body?.documentIds);
    const selected = (await inventory()).filter((r) =>
      ids.includes(r.documentId)
    );
    if (selected.length !== new Set(ids).size)
      return res
        .status(409)
        .json({ error: 'RECONCILIATION_SELECTION_CHANGED' });
    const snapshot = {
      policyVersion: CONTROLLED_DOCUMENT_RECONCILIATION_POLICY_VERSION,
      assessments: selected,
    };
    const hash = hashReconciliationPreview(snapshot);
    const expires = new Date(Date.now() + 1800000);
    const a = actor(req);
    const result = await pool.query(
      `INSERT INTO controlled_document_reconciliation_previews(preview_hash,policy_version,selected_document_ids,assessment_snapshot,actor_user_id,actor_snapshot,expires_at) VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6::jsonb,$7) RETURNING id`,
      [
        hash,
        CONTROLLED_DOCUMENT_RECONCILIATION_POLICY_VERSION,
        JSON.stringify(ids),
        JSON.stringify(snapshot),
        a.id,
        JSON.stringify(a),
        expires,
      ]
    );
    res.status(201).json({
      previewId: result.rows[0].id,
      previewHash: hash,
      expiresAt: expires,
      hiddenUpdates: false,
      ...snapshot,
    });
  }
);
router.post(
  '/execute',
  requirePermission('documents.reconciliation_execute'),
  async (req, res) => {
    const input = z
      .object({
        previewId: z.string().uuid(),
        previewHash: z.string().length(64),
        selectedDocumentIds: z.array(z.string().uuid()).min(1),
        reason: z.string().trim().min(10),
        acknowledgeHistoricalEvidence: z.literal(true),
      })
      .parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const p = (
        await client.query(
          'SELECT * FROM controlled_document_reconciliation_previews WHERE id=$1 FOR UPDATE',
          [input.previewId]
        )
      ).rows[0];
      if (
        !p ||
        p.preview_hash !== input.previewHash ||
        new Date(p.expires_at) <= new Date()
      )
        throw Object.assign(new Error('Preview is stale'), {
          code: 'RECONCILIATION_PREVIEW_STALE',
        });
      const lockedIds = [...new Set(input.selectedDocumentIds)].sort();
      for (const documentId of lockedIds) {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [documentId]
        );
      }
      const lockedDocuments = await client.query(
        `SELECT id,current_revision_id,working_draft_revision_id,current_released_revision_id
         FROM controlled_documents WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
        [lockedIds]
      );
      if (lockedDocuments.rows.length !== lockedIds.length)
        throw Object.assign(new Error('Document selection changed'), {
          code: 'RECONCILIATION_SOURCE_CHANGED',
        });
      const revisionIds = lockedDocuments.rows.flatMap((row) =>
        [
          row.current_revision_id,
          row.working_draft_revision_id,
          row.current_released_revision_id,
        ].filter(Boolean)
      );
      if (revisionIds.length)
        await client.query(
          'SELECT id FROM document_version_history WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [revisionIds]
        );

      const current = (await inventory(client)).filter((r) =>
        input.selectedDocumentIds.includes(r.documentId)
      );
      const expected = (
        p.assessment_snapshot.assessments as LegacyReconciliationAssessment[]
      ).filter((r) => input.selectedDocumentIds.includes(r.documentId));
      if (
        hashReconciliationPreview(current) !==
          hashReconciliationPreview(expected) ||
        current.some((r) => !r.automatic)
      )
        throw Object.assign(new Error('Source evidence changed'), {
          code: 'RECONCILIATION_PREVIEW_STALE',
        });
      const completed = [];
      const a = actor(req);
      for (const row of current) {
        const key = `${CONTROLLED_DOCUMENT_RECONCILIATION_POLICY_VERSION}:${row.documentId}:${row.revisionId}:${row.observedChecksum}`;
        if (
          (
            await client.query(
              'SELECT id FROM controlled_document_reconciliation_events WHERE idempotency_key=$1',
              [key]
            )
          ).rows.length
        ) {
          completed.push({ documentId: row.documentId, replayed: true });
          continue;
        }
        const original = (
          await client.query(
            `SELECT row_to_json(d) AS parent, row_to_json(r) AS revision,
              (SELECT coalesce(jsonb_agg(row_to_json(a) ORDER BY a.created_at), '[]'::jsonb)
                 FROM controlled_document_revision_approvals a WHERE a.revision_id=r.id) AS approvals,
              (SELECT row_to_json(n) FROM controlled_document_number_registry n
                 WHERE n.controlled_document_id=d.id LIMIT 1) AS number_registry,
              $3::text AS observed_checksum, $4::jsonb AS classification
             FROM controlled_documents d JOIN document_version_history r ON r.id=$2
             WHERE d.id=$1`,
            [
              row.documentId,
              row.revisionId,
              row.observedChecksum,
              JSON.stringify({
                classification: row.classification,
                blockers: row.blockers,
              }),
            ]
          )
        ).rows[0];
        if (!original || original.revision.document_id !== row.documentId)
          throw Object.assign(new Error('Revision ownership changed'), {
            code: 'RECONCILIATION_SOURCE_CHANGED',
          });
        if (
          original.revision.file_checksum &&
          original.revision.file_checksum !== row.observedChecksum
        )
          throw Object.assign(new Error('Checksum mismatch'), {
            code: 'CHECKSUM_MISMATCH',
          });
        await client.query(
          "UPDATE document_version_history SET file_checksum=$1,checksum_status='VERIFIED',lifecycle_status='RELEASED' WHERE id=$2 AND document_id=$3",
          [row.observedChecksum, row.revisionId, row.documentId]
        );
        await client.query(
          "UPDATE controlled_documents SET current_released_revision_id=$1,lifecycle_status='RELEASED',updated_at=now() WHERE id=$2",
          [row.revisionId, row.documentId]
        );
        const after = (
          await client.query(
            `SELECT row_to_json(d) AS parent, row_to_json(r) AS revision,
              (SELECT coalesce(jsonb_agg(row_to_json(a) ORDER BY a.created_at), '[]'::jsonb)
                 FROM controlled_document_revision_approvals a WHERE a.revision_id=r.id) AS approvals,
              (SELECT row_to_json(n) FROM controlled_document_number_registry n
                 WHERE n.controlled_document_id=d.id LIMIT 1) AS number_registry
             FROM controlled_documents d JOIN document_version_history r ON r.id=$2 WHERE d.id=$1`,
            [row.documentId, row.revisionId]
          )
        ).rows[0];
        await client.query(
          "INSERT INTO controlled_document_reconciliation_events(preview_id,controlled_document_id,revision_id,idempotency_key,event_type,provenance,policy_version,original_snapshot,proposed_changes,completed_changes,before_snapshot,after_snapshot,actor_user_id,actor_snapshot,reason,checksum,file_identity) VALUES($1,$2,$3,$4,'AUTOMATIC_BACKFILL','LEGACY_MIGRATION_VERIFIED',$5,$6::jsonb,$7::jsonb,$8::jsonb,$6::jsonb,$8::jsonb,$9,$10::jsonb,$11,$12,$13)",
          [
            input.previewId,
            row.documentId,
            row.revisionId,
            key,
            CONTROLLED_DOCUMENT_RECONCILIATION_POLICY_VERSION,
            JSON.stringify(original),
            JSON.stringify(row.proposedChanges),
            JSON.stringify(after),
            a.id,
            JSON.stringify(a),
            input.reason,
            row.observedChecksum,
            JSON.stringify({ referenceType: row.fileReferenceType }),
          ]
        );
        completed.push({ documentId: row.documentId, replayed: false });
      }
      await client.query('COMMIT');
      res.json({ completed, provenance: 'LEGACY_MIGRATION_VERIFIED' });
    } catch (error: any) {
      await client.query('ROLLBACK');
      res.status(409).json({
        error: error.code || 'RECONCILIATION_FAILED',
        message: error.message,
      });
    } finally {
      client.release();
    }
  }
);
router.post(
  '/:id/evidence',
  requirePermission('documents.reconciliation_resolve'),
  async (req, res) => {
    const input = z
      .object({
        revisionId: z.string().uuid().nullable().optional(),
        evidenceType: z.enum([
          'LEGACY_APPROVAL_EVIDENCE',
          'EFFECTIVE_STATUS_CONFIRMATION',
          'REFERENCE_ONLY',
          'OBSOLETE',
          'VOID',
        ]),
        evidence: z.record(z.unknown()),
        reason: z.string().trim().min(10),
      })
      .parse(req.body);
    if (input.revisionId) {
      const owned = await pool.query(
        'SELECT id FROM document_version_history WHERE id=$1 AND document_id=$2 LIMIT 1',
        [input.revisionId, req.params.id]
      );
      if (!owned.rows.length)
        return res.status(409).json({ error: 'CROSS_DOCUMENT_REVISION' });
    }
    const a = actor(req);
    const result = await pool.query(
      'INSERT INTO controlled_document_reconciliation_evidence(controlled_document_id,revision_id,evidence_type,evidence_payload,actor_user_id,actor_snapshot,reason) VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7) RETURNING id',
      [
        req.params.id,
        input.revisionId || null,
        input.evidenceType,
        JSON.stringify(input.evidence),
        a.id,
        JSON.stringify(a),
        input.reason,
      ]
    );
    res.status(201).json({ id: result.rows[0].id, appendOnly: true });
  }
);
router.post(
  '/:id/authoritative-file',
  requirePermission('documents.reconciliation_resolve'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ error: 'AUTHORITATIVE_FILE_REQUIRED' });
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 10)
      return res.status(400).json({ error: 'RECONCILIATION_REASON_REQUIRED' });
    const revisionId = String(req.body.revisionId || '').trim() || null;
    if (revisionId) {
      const owned = await pool.query(
        'SELECT id FROM document_version_history WHERE id=$1 AND document_id=$2 LIMIT 1',
        [revisionId, req.params.id]
      );
      if (!owned.rows.length)
        return res.status(409).json({ error: 'CROSS_DOCUMENT_REVISION' });
    }
    const a = actor(req);
    const checksum = createHash('sha256').update(req.file.buffer).digest('hex');
    const stored = await getFileStorageProvider().uploadBuffer({
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      scope: 'controlled-document-reconciliation',
      entityId: req.params.id,
    });
    const result = await pool.query(
      "INSERT INTO controlled_document_reconciliation_evidence(controlled_document_id,revision_id,evidence_type,evidence_payload,immutable_file_path,immutable_file_checksum,immutable_file_media_type,immutable_file_size,immutable_file_provenance,actor_user_id,actor_snapshot,reason) VALUES($1,$2,'AUTHORITATIVE_HISTORICAL_FILE',$3::jsonb,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11) RETURNING id",
      [
        req.params.id,
        revisionId,
        JSON.stringify({
          originalFileName: req.file.originalname,
          fileSize: req.file.size,
        }),
        stored,
        checksum,
        req.file.mimetype,
        req.file.size,
        JSON.stringify({
          storage: 'CONTROLLED_OBJECT_STORAGE',
          immutable: true,
          uploadedAt: new Date().toISOString(),
          originalReferencePreserved: true,
        }),
        a.id,
        JSON.stringify(a),
        reason,
      ]
    );
    res.status(201).json({
      id: result.rows[0].id,
      checksum,
      mediaType: req.file.mimetype,
      size: req.file.size,
      revisionUnchanged: true,
      releaseStatus: 'NOT_RELEASED',
    });
  }
);

router.post(
  '/:id/evidence/:evidenceId/confirm',
  requirePermission('documents.reconciliation_resolve'),
  async (req, res) => {
    const input = z
      .object({ reason: z.string().trim().min(10) })
      .parse(req.body);
    const source = (
      await pool.query(
        `SELECT * FROM controlled_document_reconciliation_evidence
       WHERE id=$1 AND controlled_document_id=$2`,
        [req.params.evidenceId, req.params.id]
      )
    ).rows[0];
    if (!source)
      return res
        .status(404)
        .json({ error: 'RECONCILIATION_EVIDENCE_NOT_FOUND' });
    const requirements: Record<string, string[]> = {
      AUTHORITATIVE_HISTORICAL_FILE: [
        'immutable_file_path',
        'immutable_file_checksum',
        'immutable_file_media_type',
        'immutable_file_size',
      ],
      LEGACY_APPROVAL_EVIDENCE: [],
      EFFECTIVE_STATUS_CONFIRMATION: [],
      REFERENCE_ONLY: [],
      OBSOLETE: [],
      VOID: [],
    };
    if (!requirements[source.evidence_type])
      return res
        .status(422)
        .json({ error: 'RECONCILIATION_EVIDENCE_TYPE_NOT_CONFIRMABLE' });
    const missing = requirements[source.evidence_type].filter(
      (field) => !source[field]
    );
    if (source.evidence_type === 'LEGACY_APPROVAL_EVIDENCE') {
      for (const field of ['approvalIdentity', 'approvalDate', 'effectiveDate'])
        if (!source.evidence_payload?.[field])
          missing.push(`evidence.${field}`);
    }
    if (
      source.evidence_type === 'EFFECTIVE_STATUS_CONFIRMATION' &&
      !source.evidence_payload?.effectiveStatus
    )
      missing.push('evidence.effectiveStatus');
    if (missing.length)
      return res
        .status(422)
        .json({ error: 'RECONCILIATION_EVIDENCE_INCOMPLETE', missing });
    const a = actor(req);
    const confirmed = await pool.query(
      `INSERT INTO controlled_document_reconciliation_evidence(
        controlled_document_id,revision_id,evidence_type,evidence_payload,immutable_file_path,
        immutable_file_checksum,immutable_file_media_type,immutable_file_size,immutable_file_provenance,
        actor_user_id,actor_snapshot,reason,confirmed_at,confirmed_by_user_id,confirmation_reason)
       VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12,now(),$10,$12) RETURNING id`,
      [
        source.controlled_document_id,
        source.revision_id,
        source.evidence_type,
        JSON.stringify({
          ...source.evidence_payload,
          sourceEvidenceId: source.id,
        }),
        source.immutable_file_path,
        source.immutable_file_checksum,
        source.immutable_file_media_type,
        source.immutable_file_size,
        JSON.stringify(source.immutable_file_provenance || {}),
        a.id,
        JSON.stringify(a),
        input.reason,
      ]
    );
    res.status(201).json({
      id: confirmed.rows[0].id,
      appendOnly: true,
      electronicApproval: false,
      released: false,
    });
  }
);

router.post(
  '/:id/send-through-current-approval-workflow',
  requirePermission('documents.reconciliation_resolve'),
  async (req, res) => {
    const input = z
      .object({
        evidenceId: z.string().uuid(),
        revisionValue: z.string().trim().min(1),
        reason: z.string().trim().min(10),
      })
      .parse(req.body);
    const evidence = (
      await pool.query(
        `SELECT * FROM controlled_document_reconciliation_evidence
       WHERE id=$1 AND controlled_document_id=$2 AND evidence_type='AUTHORITATIVE_HISTORICAL_FILE'
         AND confirmed_at IS NOT NULL AND confirmed_by_user_id IS NOT NULL`,
        [input.evidenceId, req.params.id]
      )
    ).rows[0];
    if (!evidence)
      return res
        .status(422)
        .json({ error: 'CONFIRMED_AUTHORITATIVE_FILE_REQUIRED' });
    const bytes = await getFileStorageProviderForObjectPath(
      evidence.immutable_file_path
    ).downloadBuffer(evidence.immutable_file_path);
    const observed = checksumAuthoritativeBytes(bytes);
    if (observed !== evidence.immutable_file_checksum)
      return res.status(409).json({
        error: 'CHECKSUM_MISMATCH',
        message:
          'Confirmed authoritative file checksum no longer matches stored bytes.',
      });
    const result = await createControlledRevision({
      documentId: req.params.id,
      revisionValue: input.revisionValue,
      reason: input.reason,
      file: {
        path: evidence.immutable_file_path,
        name: `legacy-authoritative-${input.evidenceId}`,
        mediaType: evidence.immutable_file_media_type,
        size: Number(evidence.immutable_file_size),
        buffer: bytes,
      },
      actor: actor(req),
      request: { ipAddress: req.ip, userAgent: req.get('user-agent') },
    });
    res.status(201).json({
      revisionId: result.revision.id,
      lifecycleStatus: result.revision.lifecycleStatus,
      released: false,
      currentApprovalWorkflowRequired: true,
    });
  }
);

export default router;
