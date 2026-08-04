import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { desc } from 'drizzle-orm';
import { z } from 'zod';

import { db, pool } from '../../db';
import { requirePermission } from '../../middleware/requirePermission';
import {
  controlledDocumentNumberRegistry,
  controlledDocumentRevisionApprovals,
  controlledDocuments,
  documentVersionHistory,
} from '../../schema';
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
    return getFileStorageProviderForObjectPath(value).downloadBuffer(value);
  const normalized = value.replace(/\\/g, '/').replace(/^\//, '');
  const allowed =
    normalized.startsWith('uploads/media-library/') ||
    normalized.startsWith('assets/documents/');
  if (!allowed) throw new Error('Unsupported or mutable file reference');
  return fs.readFile(
    path.resolve(
      process.cwd(),
      normalized.startsWith('assets/') ? `server/src/${normalized}` : normalized
    )
  );
};

async function inventory(): Promise<LegacyReconciliationAssessment[]> {
  const [documents, revisions, approvals, registry] = await Promise.all([
    db
      .select()
      .from(controlledDocuments)
      .orderBy(desc(controlledDocuments.createdAt)),
    db.select().from(documentVersionHistory),
    db.select().from(controlledDocumentRevisionApprovals),
    db.select().from(controlledDocumentNumberRegistry),
  ]);
  const counts = new Map<string, number>();
  const byDocument = new Map<string, typeof revisions>();
  const byId = new Map(revisions.map((r) => [r.id, r]));
  for (const d of documents) {
    const n = d.documentNumber.trim().toUpperCase();
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  for (const r of revisions) {
    const rows = byDocument.get(r.documentId) || [];
    rows.push(r);
    byDocument.set(r.documentId, rows);
  }
  return Promise.all(
    documents.map(async (d) => {
      const rows = byDocument.get(d.id) || [];
      const pointed = d.currentReleasedRevisionId
        ? byId.get(d.currentReleasedRevisionId)
        : null;
      const revision =
        pointed?.documentId === d.id
          ? pointed
          : rows.length === 1
            ? rows[0]
            : null;
      const fileReference = revision?.filePath || d.filePath || null;
      let accessibility:
        'ACCESSIBLE' | 'INACCESSIBLE' | 'EXTERNAL_MUTABLE' | 'MISSING' =
        fileReference ? 'INACCESSIBLE' : 'MISSING';
      let observedChecksum: string | null = null;
      if (referenceType(fileReference) === 'EXTERNAL_MUTABLE_URL')
        accessibility = 'EXTERNAL_MUTABLE';
      else if (fileReference)
        try {
          observedChecksum = checksumAuthoritativeBytes(
            await readBytes(fileReference)
          );
          accessibility = 'ACCESSIBLE';
        } catch {
          accessibility = 'INACCESSIBLE';
        }
      const approval = approvals.find((a) => a.revisionId === revision?.id);
      const normalized = d.documentNumber.trim().toUpperCase();
      return assessLegacyControlledDocument({
        documentId: d.id,
        documentNumber: d.documentNumber,
        title: d.documentName,
        legacyStatus: d.status,
        lifecycleStatus: d.lifecycleStatus,
        currentVersion: d.currentVersion,
        currentReleasedRevisionId: d.currentReleasedRevisionId,
        revisionId: revision?.id || null,
        revisionCount: rows.length,
        revisionVersion: revision?.versionNumber || null,
        revisionLifecycleStatus:
          revision?.lifecycleStatus || revision?.status || null,
        revisionChecksum: revision?.fileChecksum || null,
        fileReference,
        fileReferenceType: referenceType(fileReference),
        fileAccessibility: accessibility,
        observedChecksum,
        approvalIdentity:
          revision?.approvedBy || approval?.actorUsernameSnapshot || null,
        approvalDate:
          revision?.approvedAt?.toISOString() ||
          approval?.createdAt?.toISOString() ||
          null,
        effectiveDate: revision?.effectiveDate || d.effectiveDate || null,
        duplicateNumber:
          (counts.get(normalized) || 0) > 1 ||
          registry.some(
            (r) =>
              r.normalizedNumber === normalized &&
              r.controlledDocumentId !== d.id
          ),
        crossDocumentPointer: Boolean(
          d.currentReleasedRevisionId && pointed?.documentId !== d.id
        ),
        contradictoryLifecycle:
          d.lifecycleStatus === 'RELEASED' &&
          !['approved', 'active'].includes(d.status.toLowerCase()),
      });
    })
  );
}

router.get(
  '/inventory',
  requireAuth,
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
router.post(
  '/preview',
  requireAuth,
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
  requireAuth,
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
      const current = (await inventory()).filter((r) =>
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
            'SELECT d.*,r.document_id AS revision_document_id,r.file_checksum AS revision_file_checksum FROM controlled_documents d JOIN document_version_history r ON r.id=$2 WHERE d.id=$1 FOR UPDATE OF d,r',
            [row.documentId, row.revisionId]
          )
        ).rows[0];
        if (!original || original.revision_document_id !== row.documentId)
          throw Object.assign(new Error('Revision ownership changed'), {
            code: 'RECONCILIATION_SOURCE_CHANGED',
          });
        if (
          original.revision_file_checksum &&
          original.revision_file_checksum !== row.observedChecksum
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
        await client.query(
          "INSERT INTO controlled_document_reconciliation_events(preview_id,controlled_document_id,revision_id,idempotency_key,event_type,provenance,policy_version,original_snapshot,proposed_changes,completed_changes,actor_user_id,actor_snapshot,reason,checksum,file_identity) VALUES($1,$2,$3,$4,'AUTOMATIC_BACKFILL','LEGACY_MIGRATION_VERIFIED',$5,$6::jsonb,$7::jsonb,$7::jsonb,$8,$9::jsonb,$10,$11,$12)",
          [
            input.previewId,
            row.documentId,
            row.revisionId,
            key,
            CONTROLLED_DOCUMENT_RECONCILIATION_POLICY_VERSION,
            JSON.stringify(original),
            JSON.stringify(row.proposedChanges),
            a.id,
            JSON.stringify(a),
            input.reason,
            row.observedChecksum,
            row.fileReference,
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
  requireAuth,
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
  requireAuth,
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
      "INSERT INTO controlled_document_reconciliation_evidence(controlled_document_id,revision_id,evidence_type,evidence_payload,immutable_file_path,immutable_file_checksum,actor_user_id,actor_snapshot,reason) VALUES($1,$2,'AUTHORITATIVE_HISTORICAL_FILE',$3::jsonb,$4,$5,$6,$7::jsonb,$8) RETURNING id",
      [
        req.params.id,
        revisionId,
        JSON.stringify({
          originalFileName: req.file.originalname,
          fileSize: req.file.size,
        }),
        stored,
        checksum,
        a.id,
        JSON.stringify(a),
        reason,
      ]
    );
    res.status(201).json({
      id: result.rows[0].id,
      checksum,
      immutablePath: stored,
      revisionUnchanged: true,
    });
  }
);

export default router;
