/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { pool } from '../../db';
import { requireStepUp } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { recordAuditEvent } from '../services/auditLedgerService';
import {
  assertControlledDocumentReconciliationSchemaReady,
  ControlledDocumentSchemaNotReadyError as ControlledDocumentReconciliationSchemaNotReadyError,
} from '../services/controlledDocumentSchemaReadiness';
import { isControlledDocumentReconciliationExplicitlyEnabled } from '../services/controlledDocumentReconciliationGate';
import {
  getControlledDocumentRecoveryAvailability,
  isControlledDocumentRecoveryExplicitlyEnabled,
  requireControlledDocumentRecoveryExecution,
  requireControlledDocumentRecoverySchema,
} from '../services/controlledDocumentRecoveryGate';
import {
  assertControlledDocumentRecoverySchemaReady,
  ControlledDocumentRecoverySchemaNotReadyError,
} from '../services/controlledDocumentRecoverySchemaReadiness';
import {
  buildRecoveryInventory,
  checksumRecoveryBytes,
  CONTROLLED_DOCUMENT_RECOVERY_POLICY_VERSION,
  hashRecoveryValue,
  normalizeRecoveryDocumentCode,
  sanitizeRecoverySourceProvenance,
  sanitizeRecoverySupportingEvidence,
  titlesMateriallyConflict,
  validateRecoveryUpload,
  type RecoverySourceRow,
} from '../services/controlledDocumentRecoveryService';
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
} from '../services/fileStorageProvider';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

const sourceRowSchema = z.object({
  documentCode: z.string().max(200),
  title: z.string().max(500),
  sourceType: z.enum([
    'DIRECT_UPLOAD',
    'GOOGLE_DRIVE_PROVENANCE',
    'LEGACY_EPOCH_REFERENCE',
    'OTHER_VERIFIED_SOURCE',
  ]),
  sourceUrl: z.string().max(2048).nullable().optional(),
  driveFileId: z.string().max(200).nullable().optional(),
});

type Actor = { id: number; username: string; role: string };
type Queryable = {
  query(
    sql: string,
    values?: unknown[]
  ): Promise<{ rows: any[]; rowCount?: number | null }>;
};

const actor = (req: Request): Actor => ({
  id: Number((req as any).user.id),
  username: String((req as any).user.username),
  role: String((req as any).user.role),
});

const requestEvidence = (req: Request) => ({
  ipAddress:
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    null,
  userAgent: req.get('user-agent') || null,
});

const sessionToken = (req: Request) =>
  String(
    req.cookies?.sessionToken ||
      req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
      ''
  );

const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const token = sessionToken(req);
  if (!token) return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });
  const result = await pool.query(
    `SELECT u.id,u.username,u.role
     FROM user_sessions session
     JOIN users u ON u.id=session.user_id
     WHERE session.session_token=$1 AND session.is_active=true
       AND session.expires_at>now() AND u.is_active=true LIMIT 1`,
    [token]
  );
  if (!result.rows[0])
    return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });
  (req as any).user = result.rows[0];
  next();
};

const audit = async (
  req: Request,
  eventType: string,
  subjectId: string,
  payload: Record<string, string | number | boolean | null>,
  reason?: string
) => {
  try {
    await recordAuditEvent({
      eventType,
      subjectType: 'controlled_document_recovery',
      subjectId,
      sourceService: 'controlledDocumentRecovery.route',
      actor: actor(req),
      payload,
      reason,
      ...requestEvidence(req),
    });
  } catch (error) {
    console.error('[controlled-document-recovery] audit write failed', error);
  }
};

const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    handler(req, res).catch(next);

const safeError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof ControlledDocumentRecoverySchemaNotReadyError)
    return res.status(503).json({
      error: error.code,
      message: error.message,
      missingObjects: error.missingObjects,
    });
  if (error instanceof ControlledDocumentReconciliationSchemaNotReadyError)
    return res.status(503).json({
      error: error.code,
      message: error.message,
      missingObjects: error.missingObjects,
    });
  const typed = error as { code?: string; message?: string; status?: number };
  const known = new Set([
    'CONTROLLED_DOCUMENT_RECOVERY_DISABLED',
    'CONTROLLED_DOCUMENT_RECONCILIATION_DISABLED',
    'SOURCE_PROVENANCE_REJECTED',
    'UNSAFE_FILENAME',
    'RECOVERY_FILE_SIZE_REJECTED',
    'UNSUPPORTED_RECOVERY_FILE_TYPE',
    'RECOVERY_FILE_SIGNATURE_MISMATCH',
    'CHECKSUM_MISMATCH',
    'RECOVERY_PREVIEW_STALE',
    'RECOVERY_MATCH_BLOCKED',
    'CROSS_DOCUMENT_REVISION',
    'RECOVERY_IDEMPOTENCY_KEY_REUSE',
    'RECOVERY_IMPORT_NOT_STAGED',
    'RECOVERY_SOURCE_CHANGED',
    'LEGACY_APPROVAL_EVIDENCE_REQUIRED',
    'RELEASED_REVISION_CONFLICT',
    'REVISION_VALUE_CONFLICT',
    'STEP_UP_REQUIRED',
    'RECOVERY_PERMISSION_REQUIRED',
    'RECOVERY_EVIDENCE_REJECTED',
  ]);
  if (typed.code && known.has(typed.code))
    return res.status(typed.status || 409).json({
      error: typed.code,
      message: typed.message,
    });
  console.error('[controlled-document-recovery]', fallback, error);
  return res.status(500).json({
    error: 'CONTROLLED_DOCUMENT_RECOVERY_FAILED',
    message: fallback,
  });
};

const documentSnapshot = (document: any, revision: any, facts: any) => ({
  document: {
    id: document.id,
    documentNumber: document.document_number,
    normalizedDocumentCode: normalizeRecoveryDocumentCode(
      document.document_number
    ),
    title: document.document_name,
    lifecycleStatus: document.lifecycle_status,
    compatibilityStatus: document.status,
    currentVersion: document.current_version,
    currentRevisionId: document.current_revision_id,
    workingDraftRevisionId: document.working_draft_revision_id,
    currentReleasedRevisionId: document.current_released_revision_id,
    numberControlStatus: document.number_control_status,
    updatedAt: document.updated_at,
  },
  revision: revision
    ? {
        id: revision.id,
        documentId: revision.document_id,
        versionNumber: revision.version_number,
        revisionSequence: revision.revision_sequence,
        lifecycleStatus: revision.lifecycle_status,
        compatibilityStatus: revision.status,
        fileChecksum: revision.file_checksum,
        checksumStatus: revision.checksum_status,
        createdAt: revision.created_at,
      }
    : null,
  matchingEpochDocumentIds: facts.matchingEpochDocumentIds,
  matchingSourceCount: facts.matchingSourceCount,
  dispositionId: facts.dispositionId || null,
});

async function loadRecoveryFacts(
  sourceRows: RecoverySourceRow[],
  client: Queryable = pool
) {
  const [documents, revisions, dispositions] = await Promise.all([
    client.query(`SELECT id,document_number,document_name,lifecycle_status,status,
      current_revision_id,current_released_revision_id,working_draft_revision_id,file_path,
      current_version,number_control_status,updated_at FROM controlled_documents ORDER BY created_at,id`),
    client.query(`SELECT id,document_id,version_number,revision_sequence,lifecycle_status,status,
      file_path,file_checksum,checksum_status,created_at FROM document_version_history ORDER BY document_id,revision_sequence,id`),
    client.query(`SELECT DISTINCT ON (normalized_document_code)
      id,normalized_document_code,authoritative_document_id
      FROM controlled_document_recovery_dispositions
      WHERE disposition='AUTHORITATIVE_RECORD_SELECTED'
      ORDER BY normalized_document_code,created_at DESC,id DESC`),
  ]);
  const mappedDocuments = documents.rows.map((row) => ({
    id: row.id,
    documentNumber: row.document_number,
    documentName: row.document_name,
    lifecycleStatus: row.lifecycle_status,
    status: row.status,
    currentRevisionId: row.current_revision_id,
    currentReleasedRevisionId: row.current_released_revision_id,
    workingDraftRevisionId: row.working_draft_revision_id,
    filePath: row.file_path,
  }));
  const mappedRevisions = revisions.rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    versionNumber: row.version_number,
    lifecycleStatus: row.lifecycle_status,
    filePath: row.file_path,
    fileChecksum: row.file_checksum,
    checksumStatus: row.checksum_status,
  }));
  return {
    rawDocuments: documents.rows,
    rawRevisions: revisions.rows,
    dispositions: dispositions.rows,
    inventory: buildRecoveryInventory({
      documents: mappedDocuments,
      revisions: mappedRevisions,
      sourceRows,
      dispositions: dispositions.rows.map((row) => ({
        normalizedDocumentCode: row.normalized_document_code,
        authoritativeDocumentId: row.authoritative_document_id,
      })),
    }),
  };
}

router.get(
  '/status',
  requireAuth,
  requirePermission('documents.recovery_view'),
  asyncRoute(async (req, res) => {
    const availability = await getControlledDocumentRecoveryAvailability();
    await audit(req, 'CONTROLLED_DOCUMENT_RECOVERY_STATUS_VIEWED', 'status', {
      schemaReady: availability.schemaReady,
      executionEnabled: availability.executionEnabled,
    });
    return res.status(availability.schemaReady ? 200 : 503).json(availability);
  })
);

router.use(requireAuth, requireControlledDocumentRecoverySchema);

const inventoryHandler = async (req: Request, res: Response) => {
  const sourceRows = z
    .array(sourceRowSchema)
    .max(1000)
    .parse(req.body?.sourceRows || [])
    .map((row) => ({
      ...row,
      ...sanitizeRecoverySourceProvenance(row),
    })) as RecoverySourceRow[];
  const facts = await loadRecoveryFacts(sourceRows);
  const groups = facts.inventory.reduce<Record<string, number>>(
    (result, row) => {
      result[row.category] = (result[row.category] || 0) + 1;
      return result;
    },
    {}
  );
  await audit(
    req,
    'CONTROLLED_DOCUMENT_RECOVERY_INVENTORY_VIEWED',
    'inventory',
    {
      documentCount: facts.rawDocuments.length,
      sourceRowCount: sourceRows.length,
      blockedCount: facts.inventory.filter((row) => row.blockers.length > 0)
        .length,
    }
  );
  return res.json({
    readOnly: true,
    hiddenUpdates: false,
    groups,
    rows: facts.inventory,
  });
};

router.get(
  '/inventory',
  requirePermission('documents.recovery_view'),
  asyncRoute(inventoryHandler)
);
router.post(
  '/inventory',
  requirePermission('documents.recovery_view'),
  asyncRoute(inventoryHandler)
);

router.post(
  '/preview',
  requirePermission('documents.recovery_preview'),
  asyncRoute(async (req, res) => {
    const input = z
      .object({
        documentId: z.string().uuid(),
        revisionId: z.string().uuid().nullable().optional(),
        source: sourceRowSchema,
        sourceRows: z.array(sourceRowSchema).max(1000).optional(),
      })
      .parse(req.body);
    const source = {
      ...input.source,
      ...sanitizeRecoverySourceProvenance(input.source),
    } as RecoverySourceRow;
    const sourceRows = (
      input.sourceRows?.length ? input.sourceRows : [source]
    ).map((row) => ({ ...row, ...sanitizeRecoverySourceProvenance(row) }));
    const facts = await loadRecoveryFacts(sourceRows);
    const document = facts.rawDocuments.find(
      (row) => row.id === input.documentId
    );
    if (!document) return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
    const revisionId = input.revisionId || document.current_revision_id || null;
    const revision = revisionId
      ? facts.rawRevisions.find((row) => row.id === revisionId)
      : null;
    if (revisionId && revision?.document_id !== document.id)
      return res.status(409).json({
        error: 'CROSS_DOCUMENT_REVISION',
        message: 'The selected revision does not belong to this document.',
      });
    const code = normalizeRecoveryDocumentCode(source.documentCode);
    const documentCode = normalizeRecoveryDocumentCode(
      document.document_number
    );
    const matchingEpochDocumentIds = facts.rawDocuments
      .filter(
        (candidate) =>
          normalizeRecoveryDocumentCode(candidate.document_number) === code
      )
      .map((candidate) => candidate.id)
      .sort();
    const matchingSources = sourceRows.filter(
      (candidate) =>
        normalizeRecoveryDocumentCode(candidate.documentCode) === code
    );
    const disposition = facts.dispositions.find(
      (candidate) =>
        normalizeRecoveryDocumentCode(candidate.normalized_document_code) ===
          code && candidate.authoritative_document_id === document.id
    );
    const blockers: string[] = [];
    if (!code) blockers.push('The source row has no document code');
    if (code !== documentCode)
      blockers.push(
        'The source code does not exactly match the selected EPOCH record'
      );
    if (matchingSources.length !== 1)
      blockers.push('The master source contains a duplicate document code');
    if (matchingEpochDocumentIds.length !== 1 && !disposition)
      blockers.push(
        'EPOCH contains duplicate records for this normalized code'
      );
    if (titlesMateriallyConflict(source.title, document.document_name))
      blockers.push(
        'The source title materially conflicts with the EPOCH title'
      );
    const sanitizedSource = {
      documentCode: source.documentCode,
      normalizedDocumentCode: code,
      title: source.title,
      sourceType: source.sourceType,
      sourceUrl: source.sourceUrl || null,
      driveFileId: source.driveFileId || null,
      mutableReferenceIsProvenanceOnly: true,
    };
    const currentDocumentSnapshot = documentSnapshot(document, revision, {
      matchingEpochDocumentIds,
      matchingSourceCount: matchingSources.length,
      dispositionId: disposition?.id || null,
    });
    const recommendedAction = blockers.length
      ? 'QUALITY_DISPOSITION_REQUIRED'
      : 'UPLOAD_EXACT_AUTHORITATIVE_BYTES';
    const snapshot = {
      policyVersion: CONTROLLED_DOCUMENT_RECOVERY_POLICY_VERSION,
      source: sanitizedSource,
      document: currentDocumentSnapshot,
      blockers,
      recommendedAction,
    };
    const previewHash = hashRecoveryValue(snapshot);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const a = actor(req);
    const result = await pool.query(
      `INSERT INTO controlled_document_recovery_previews(
        preview_hash,policy_version,normalized_document_code,controlled_document_id,
        revision_id,source_snapshot,document_snapshot,blockers,recommended_action,
        actor_user_id,actor_snapshot,expires_at)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb,$12)
       RETURNING id`,
      [
        previewHash,
        CONTROLLED_DOCUMENT_RECOVERY_POLICY_VERSION,
        code,
        document.id,
        revision?.id || null,
        JSON.stringify(sanitizedSource),
        JSON.stringify(currentDocumentSnapshot),
        JSON.stringify(blockers),
        recommendedAction,
        a.id,
        JSON.stringify(a),
        expiresAt,
      ]
    );
    await audit(
      req,
      'CONTROLLED_DOCUMENT_RECOVERY_PREVIEW_CREATED',
      result.rows[0].id,
      {
        controlledDocumentId: document.id,
        revisionId: revision?.id || null,
        previewHash,
        blockerCount: blockers.length,
      }
    );
    return res.status(201).json({
      previewId: result.rows[0].id,
      previewHash,
      expiresAt,
      hiddenUpdates: false,
      exactProposedAdditions: blockers.length
        ? []
        : [
            'Managed immutable object',
            'Checksum-bound recovery evidence',
            'New working or legacy-verified revision after explicit execution',
          ],
      ...snapshot,
    });
  })
);

const uploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, async (error) => {
    if (!error) return next();
    await audit(
      req,
      'CONTROLLED_DOCUMENT_RECOVERY_UPLOAD_DENIED',
      req.params.previewId,
      {
        reasonCode: error.code || 'UPLOAD_REJECTED',
      }
    );
    return res.status(error instanceof multer.MulterError ? 413 : 400).json({
      error: 'RECOVERY_UPLOAD_REJECTED',
      message:
        'The recovery upload was rejected before any controlled record changed.',
    });
  });
};

router.post(
  '/previews/:previewId/stage',
  requirePermission('documents.recovery_import'),
  requireControlledDocumentRecoveryExecution,
  requireStepUp(),
  uploadMiddleware,
  asyncRoute(async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: 'RECOVERY_FILE_REQUIRED' });
      const input = z
        .object({
          previewHash: z.string().length(64),
          idempotencyKey: z.string().trim().min(12).max(200),
          expectedChecksum: z
            .string()
            .regex(/^[0-9a-f]{64}$/)
            .optional(),
          reason: z.string().trim().min(10).max(2000),
        })
        .parse(req.body);
      const checked = validateRecoveryUpload({
        fileName: req.file.originalname,
        mediaType: req.file.mimetype,
        size: req.file.size,
        bytes: req.file.buffer,
      });
      if (input.expectedChecksum && input.expectedChecksum !== checked.checksum)
        throw Object.assign(
          new Error('Uploaded bytes do not match the expected checksum'),
          {
            code: 'CHECKSUM_MISMATCH',
          }
        );
      const preview = (
        await pool.query(
          `SELECT * FROM controlled_document_recovery_previews WHERE id=$1`,
          [req.params.previewId]
        )
      ).rows[0];
      if (
        !preview ||
        preview.preview_hash !== input.previewHash ||
        new Date(preview.expires_at) <= new Date() ||
        preview.actor_user_id !== actor(req).id
      )
        throw Object.assign(new Error('The recovery preview is stale'), {
          code: 'RECOVERY_PREVIEW_STALE',
        });
      if ((preview.blockers || []).length)
        throw Object.assign(
          new Error('Blocked matches cannot stage authoritative bytes'),
          {
            code: 'RECOVERY_MATCH_BLOCKED',
          }
        );
      const sourceProvenance = sanitizeRecoverySourceProvenance(
        preview.source_snapshot
      );
      const requestIdentityHash = hashRecoveryValue({
        previewId: preview.id,
        previewHash: preview.preview_hash,
        documentId: preview.controlled_document_id,
        revisionId: preview.revision_id,
        checksum: checked.checksum,
        fileName: checked.fileName,
        mediaType: checked.mediaType,
        fileSize: req.file.size,
        sourceProvenance,
      });
      const a = actor(req);
      const reserved = await pool.query(
        `INSERT INTO controlled_document_recovery_imports(
          preview_id,controlled_document_id,revision_id,idempotency_key,request_identity_hash,
          original_filename,media_type,file_size,file_checksum,expected_checksum,source_type,
          source_provenance,status,actor_user_id,actor_snapshot,reason)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,'RESERVED',$13,$14::jsonb,$15)
         ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
        [
          preview.id,
          preview.controlled_document_id,
          preview.revision_id,
          input.idempotencyKey,
          requestIdentityHash,
          checked.fileName,
          checked.mediaType,
          req.file.size,
          checked.checksum,
          input.expectedChecksum || null,
          sourceProvenance.sourceType,
          JSON.stringify(sourceProvenance),
          a.id,
          JSON.stringify(a),
          input.reason,
        ]
      );
      if (!reserved.rows[0]) {
        const existing = (
          await pool.query(
            `SELECT id,request_identity_hash,status,file_checksum FROM controlled_document_recovery_imports
             WHERE idempotency_key=$1`,
            [input.idempotencyKey]
          )
        ).rows[0];
        if (!existing || existing.request_identity_hash !== requestIdentityHash)
          throw Object.assign(
            new Error('Idempotency key belongs to different recovery content'),
            {
              code: 'RECOVERY_IDEMPOTENCY_KEY_REUSE',
            }
          );
        return res.json({
          importId: existing.id,
          status: existing.status,
          checksum: existing.file_checksum,
          replayed: true,
          managedStorage: true,
        });
      }
      const importId = reserved.rows[0].id;
      const provider = getFileStorageProvider();
      let objectPath: string | null = null;
      try {
        objectPath = await provider.uploadBuffer({
          buffer: req.file.buffer,
          fileName: checked.fileName,
          contentType: checked.mediaType,
          scope: 'controlled-document-recovery-staging',
          entityId: importId,
        });
        if (
          !objectPath.startsWith('/objects/') &&
          !objectPath.startsWith('/supabase-objects/')
        )
          throw new Error(
            'Storage provider did not return a managed object identity'
          );
        const storedBytes =
          await getFileStorageProviderForObjectPath(objectPath).downloadBuffer(
            objectPath
          );
        if (checksumRecoveryBytes(storedBytes) !== checked.checksum)
          throw Object.assign(
            new Error('Staged object checksum does not match uploaded bytes'),
            {
              code: 'CHECKSUM_MISMATCH',
            }
          );
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const updated = await client.query(
            `UPDATE controlled_document_recovery_imports
             SET storage_object_path=$1,storage_provider=$2,status='STAGED',staged_at=now()
             WHERE id=$3 AND status='RESERVED' RETURNING id`,
            [objectPath, provider.name, importId]
          );
          if (!updated.rows[0])
            throw new Error('Recovery staging reservation changed');
          await client.query(
            `INSERT INTO controlled_document_recovery_events(
              preview_id,import_id,controlled_document_id,revision_id,idempotency_key,event_type,
              policy_version,evidence_snapshot,checksum,actor_user_id,actor_snapshot,reason)
             VALUES($1,$2,$3,$4,$5,'AUTHORITATIVE_BYTES_STAGED',$6,$7::jsonb,$8,$9,$10::jsonb,$11)`,
            [
              preview.id,
              importId,
              preview.controlled_document_id,
              preview.revision_id,
              `stage:${input.idempotencyKey}`,
              CONTROLLED_DOCUMENT_RECOVERY_POLICY_VERSION,
              JSON.stringify({
                requestIdentityHash,
                originalFilename: checked.fileName,
                mediaType: checked.mediaType,
                fileSize: req.file.size,
                checksum: checked.checksum,
                sourceType: sourceProvenance.sourceType,
                sourceIdentifierHash: hashRecoveryValue(sourceProvenance),
                storageProvider: provider.name,
                immutable: true,
                objectPathExposed: false,
              }),
              checked.checksum,
              a.id,
              JSON.stringify(a),
              input.reason,
            ]
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
        await audit(
          req,
          'CONTROLLED_DOCUMENT_RECOVERY_UPLOAD_ALLOWED',
          importId,
          {
            controlledDocumentId: preview.controlled_document_id,
            revisionId: preview.revision_id,
            checksum: checked.checksum,
            fileSize: req.file.size,
          },
          input.reason
        );
        return res.status(201).json({
          importId,
          status: 'STAGED',
          checksum: checked.checksum,
          storedChecksum:
            preview.document_snapshot?.revision?.fileChecksum || null,
          checksumResult:
            preview.document_snapshot?.revision?.fileChecksum &&
            preview.document_snapshot.revision.fileChecksum !== checked.checksum
              ? 'MISMATCH'
              : preview.document_snapshot?.revision?.fileChecksum
                ? 'MATCH'
                : 'NOT_PREVIOUSLY_STORED',
          replayed: false,
          managedStorage: true,
          objectPathExposed: false,
          nextActions: ['CURRENT_APPROVAL_WORKFLOW', 'LEGACY_RECONCILIATION'],
        });
      } catch (error) {
        let cleanupRequired = false;
        if (objectPath) {
          try {
            await getFileStorageProviderForObjectPath(objectPath).deleteObject(
              objectPath
            );
          } catch {
            cleanupRequired = true;
          }
        }
        await pool.query(
          `UPDATE controlled_document_recovery_imports
           SET status=$1,failure_code=$2,storage_object_path=$3,storage_provider=$4
           WHERE id=$5 AND status='RESERVED'`,
          [
            cleanupRequired ? 'CLEANUP_REQUIRED' : 'STAGING_FAILED',
            (error as any)?.code || 'STAGING_FAILED',
            cleanupRequired ? objectPath : null,
            cleanupRequired ? provider.name : null,
            importId,
          ]
        );
        throw error;
      }
    } catch (error) {
      await audit(
        req,
        'CONTROLLED_DOCUMENT_RECOVERY_UPLOAD_DENIED',
        req.params.previewId,
        {
          reasonCode: String((error as any)?.code || 'UPLOAD_REJECTED'),
        }
      );
      return safeError(res, error, 'The recovery upload failed safely.');
    }
  })
);

async function revalidateExecutionActor(
  client: Queryable,
  a: Actor,
  token: string,
  capability: string
) {
  const authenticated = await client.query(
    `SELECT u.id,u.role FROM user_sessions session
     JOIN users u ON u.id=session.user_id
     WHERE session.session_token=$1 AND session.is_active=true AND session.expires_at>now()
       AND session.last_credential_verified_at >= now() - interval '30 minutes'
       AND u.id=$2 AND lower(u.username)=lower($3) AND u.is_active=true
     FOR SHARE OF session,u`,
    [token, a.id, a.username]
  );
  if (!authenticated.rows[0])
    throw Object.assign(
      new Error('Current step-up authentication is required'),
      {
        code: 'STEP_UP_REQUIRED',
        status: 401,
      }
    );
  if (a.role === 'ADMIN' || a.role === 'OWNER') return;
  const allowed = await client.query(
    `SELECT (
       EXISTS(SELECT 1 FROM users u JOIN perm_roles role ON role.name=u.role
         JOIN perm_role_capabilities rc ON rc.role_id=role.id
         JOIN perm_capabilities c ON c.id=rc.capability_id
         WHERE u.id=$1 AND c.key=$2)
       OR EXISTS(SELECT 1 FROM perm_user_overrides o JOIN perm_capabilities c ON c.id=o.capability_id
         WHERE o.user_id=$1 AND c.key=$2 AND o.effect='allow')
     ) AND NOT EXISTS(SELECT 1 FROM perm_user_overrides o JOIN perm_capabilities c ON c.id=o.capability_id
       WHERE o.user_id=$1 AND c.key=$2 AND o.effect='deny') AS allowed`,
    [a.id, capability]
  );
  if (!allowed.rows[0]?.allowed)
    throw Object.assign(new Error(`${capability} authority is required`), {
      code: 'RECOVERY_PERMISSION_REQUIRED',
      status: 403,
    });
}

export async function executeControlledDocumentRecovery(input: {
  importId: string;
  executionAction: 'CURRENT_APPROVAL_WORKFLOW' | 'LEGACY_RECONCILIATION';
  revisionValue: string;
  idempotencyKey: string;
  reason: string;
  legacyApprovalEvidenceId?: string;
  actor: Actor;
  sessionToken: string;
  injectFailureAfterMutation?: boolean;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The import identity is the only trusted key before its row is locked.
    // Once locked, acquire the remaining stable advisory locks in sorted order;
    // every value later used for mutation is then re-read under row locks.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `recovery-import:${input.importId}`,
    ]);
    const recoveryImport = (
      await client.query(
        `SELECT i.*,p.preview_hash,p.expires_at,p.policy_version,p.normalized_document_code,
          p.source_snapshot,p.document_snapshot,p.blockers
         FROM controlled_document_recovery_imports i
         JOIN controlled_document_recovery_previews p ON p.id=i.preview_id
         WHERE i.id=$1 FOR UPDATE OF i,p`,
        [input.importId]
      )
    ).rows[0];
    if (!recoveryImport)
      throw Object.assign(new Error('Recovery import was not found'), {
        code: 'RECOVERY_IMPORT_NOT_STAGED',
      });
    const lockKeys = [
      `controlled-document:${recoveryImport.controlled_document_id}`,
      `recovery-execution:${input.idempotencyKey}`,
    ].sort();
    for (const key of lockKeys)
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [key]
      );
    const document = (
      await client.query(
        'SELECT * FROM controlled_documents WHERE id=$1 FOR UPDATE',
        [recoveryImport.controlled_document_id]
      )
    ).rows[0];
    const revisions = (
      await client.query(
        'SELECT * FROM document_version_history WHERE document_id=$1 ORDER BY id FOR UPDATE',
        [document.id]
      )
    ).rows;
    await client.query(
      `SELECT id FROM controlled_document_reconciliation_evidence
       WHERE controlled_document_id=$1 ORDER BY id FOR UPDATE`,
      [document.id]
    );
    await client.query(
      `SELECT id FROM controlled_document_number_registry
       WHERE controlled_document_id=$1 OR normalized_number=$2 ORDER BY id FOR UPDATE`,
      [document.id, recoveryImport.normalized_document_code]
    );
    await client.query(
      `SELECT id FROM controlled_document_recovery_dispositions
       WHERE normalized_document_code=$1 ORDER BY id FOR SHARE`,
      [recoveryImport.normalized_document_code]
    );
    await assertControlledDocumentRecoverySchemaReady(client);
    if (!isControlledDocumentRecoveryExplicitlyEnabled())
      throw Object.assign(new Error('Recovery execution is disabled'), {
        code: 'CONTROLLED_DOCUMENT_RECOVERY_DISABLED',
        status: 503,
      });
    await revalidateExecutionActor(
      client,
      input.actor,
      input.sessionToken,
      'documents.recovery_execute'
    );
    if (input.executionAction === 'LEGACY_RECONCILIATION') {
      if (!isControlledDocumentReconciliationExplicitlyEnabled())
        throw Object.assign(
          new Error(
            'Phase 1B reconciliation must be explicitly enabled for a legacy-verified release'
          ),
          {
            code: 'CONTROLLED_DOCUMENT_RECONCILIATION_DISABLED',
            status: 503,
          }
        );
      await assertControlledDocumentReconciliationSchemaReady(client);
      await revalidateExecutionActor(
        client,
        input.actor,
        input.sessionToken,
        'documents.reconciliation_execute'
      );
    }
    const requestIdentityHash = hashRecoveryValue({
      importId: input.importId,
      executionAction: input.executionAction,
      revisionValue: input.revisionValue.trim(),
      legacyApprovalEvidenceId: input.legacyApprovalEvidenceId || null,
    });
    const existingEvent = (
      await client.query(
        `SELECT id,revision_id,evidence_snapshot FROM controlled_document_recovery_events
         WHERE idempotency_key=$1`,
        [`execute:${input.idempotencyKey}`]
      )
    ).rows[0];
    if (existingEvent) {
      if (
        existingEvent.evidence_snapshot?.requestIdentityHash !==
        requestIdentityHash
      )
        throw Object.assign(
          new Error('Execution key belongs to different content'),
          {
            code: 'RECOVERY_IDEMPOTENCY_KEY_REUSE',
          }
        );
      await client.query('COMMIT');
      return {
        importId: input.importId,
        revisionId: existingEvent.revision_id,
        replayed: true,
        executionAction: input.executionAction,
      };
    }
    if (
      recoveryImport.status !== 'STAGED' ||
      !recoveryImport.storage_object_path ||
      (recoveryImport.blockers || []).length
    )
      throw Object.assign(
        new Error('Recovery import is not staged and executable'),
        {
          code: 'RECOVERY_IMPORT_NOT_STAGED',
        }
      );
    const selectedRevision = recoveryImport.revision_id
      ? revisions.find((row) => row.id === recoveryImport.revision_id)
      : null;
    if (recoveryImport.revision_id && !selectedRevision)
      throw Object.assign(
        new Error('Selected revision no longer belongs to this document'),
        {
          code: 'CROSS_DOCUMENT_REVISION',
        }
      );
    for (const [pointerName, pointerValue] of [
      ['current_revision_id', document.current_revision_id],
      ['working_draft_revision_id', document.working_draft_revision_id],
      ['current_released_revision_id', document.current_released_revision_id],
    ] as const) {
      if (
        pointerValue &&
        !revisions.some((revision) => revision.id === pointerValue)
      )
        throw Object.assign(
          new Error(
            `${pointerName} does not identify this document's revision`
          ),
          { code: 'CROSS_DOCUMENT_REVISION' }
        );
    }
    const matchingDocuments = (
      await client.query(
        `SELECT id FROM controlled_documents WHERE upper(regexp_replace(trim(document_number),'\\s+',' ','g'))=$1 ORDER BY id FOR SHARE`,
        [recoveryImport.normalized_document_code]
      )
    ).rows.map((row) => row.id);
    const disposition = (
      await client.query(
        `SELECT id,authoritative_document_id FROM controlled_document_recovery_dispositions
         WHERE normalized_document_code=$1 AND disposition='AUTHORITATIVE_RECORD_SELECTED'
         ORDER BY created_at DESC,id DESC LIMIT 1`,
        [recoveryImport.normalized_document_code]
      )
    ).rows[0];
    const currentSnapshot = documentSnapshot(document, selectedRevision, {
      matchingEpochDocumentIds: matchingDocuments,
      matchingSourceCount:
        recoveryImport.document_snapshot?.matchingSourceCount ?? 1,
      dispositionId:
        disposition?.authoritative_document_id === document.id
          ? disposition.id
          : null,
    });
    if (
      hashRecoveryValue(currentSnapshot) !==
      hashRecoveryValue(recoveryImport.document_snapshot)
    )
      throw Object.assign(
        new Error('Document or revision state changed after preview'),
        {
          code: 'RECOVERY_SOURCE_CHANGED',
        }
      );
    if (
      matchingDocuments.length !== 1 &&
      disposition?.authoritative_document_id !== document.id
    )
      throw Object.assign(
        new Error('Duplicate document code requires Quality disposition'),
        {
          code: 'RECOVERY_MATCH_BLOCKED',
        }
      );
    const bytes = await getFileStorageProviderForObjectPath(
      recoveryImport.storage_object_path
    ).downloadBuffer(recoveryImport.storage_object_path);
    const observedChecksum = checksumRecoveryBytes(bytes);
    if (
      observedChecksum !== recoveryImport.file_checksum ||
      (recoveryImport.expected_checksum &&
        observedChecksum !== recoveryImport.expected_checksum)
    )
      throw Object.assign(new Error('Managed bytes changed after preview'), {
        code: 'CHECKSUM_MISMATCH',
      });
    if (
      revisions.some((row) => row.version_number === input.revisionValue.trim())
    )
      throw Object.assign(new Error('That revision value already exists'), {
        code: 'REVISION_VALUE_CONFLICT',
      });
    const nextSequence =
      Math.max(0, ...revisions.map((row) => Number(row.revision_sequence))) + 1;
    let legacyApproval: any = null;
    if (input.executionAction === 'LEGACY_RECONCILIATION') {
      if (!selectedRevision)
        throw Object.assign(
          new Error('A historical source revision is required'),
          {
            code: 'LEGACY_APPROVAL_EVIDENCE_REQUIRED',
          }
        );
      if (document.current_released_revision_id)
        throw Object.assign(
          new Error('Another released revision already exists'),
          {
            code: 'RELEASED_REVISION_CONFLICT',
          }
        );
      legacyApproval = (
        await client.query(
          `SELECT * FROM controlled_document_reconciliation_evidence
           WHERE id=$1 AND controlled_document_id=$2
             AND evidence_type='LEGACY_APPROVAL_EVIDENCE'
             AND confirmed_at IS NOT NULL AND confirmed_by_user_id IS NOT NULL
             AND (revision_id IS NULL OR revision_id=$3)`,
          [
            input.legacyApprovalEvidenceId || null,
            document.id,
            selectedRevision.id,
          ]
        )
      ).rows[0];
      const payload = legacyApproval?.evidence_payload || {};
      if (
        !legacyApproval ||
        !payload.approvalIdentity ||
        !payload.approvalDate ||
        !payload.effectiveDate
      )
        throw Object.assign(
          new Error('Complete confirmed legacy approval evidence is required'),
          {
            code: 'LEGACY_APPROVAL_EVIDENCE_REQUIRED',
          }
        );
    }
    const lifecycle =
      input.executionAction === 'LEGACY_RECONCILIATION' ? 'RELEASED' : 'DRAFT';
    const insertedRevision = (
      await client.query(
        `INSERT INTO document_version_history(
          document_id,version_number,revision_sequence,lifecycle_status,change_description,
          change_type,file_path,file_name,media_type,file_size,file_checksum,checksum_status,
          status,created_by,revision_reason,metadata,effective_date)
         VALUES($1,$2,$3,$4,$5,'source_recovery',$6,$7,$8,$9,$10,'VERIFIED',$11,$12,$5,$13::jsonb,$14)
         RETURNING *`,
        [
          document.id,
          input.revisionValue.trim(),
          nextSequence,
          lifecycle,
          input.reason,
          recoveryImport.storage_object_path,
          recoveryImport.original_filename,
          recoveryImport.media_type,
          Number(recoveryImport.file_size),
          observedChecksum,
          lifecycle === 'RELEASED' ? 'approved' : 'draft',
          input.actor.username,
          JSON.stringify({
            provenance:
              lifecycle === 'RELEASED'
                ? 'LEGACY_MIGRATION_VERIFIED'
                : 'CONTROLLED_DOCUMENT_SOURCE_RECOVERY',
            sourceRevisionId: selectedRevision?.id || null,
            sourceRecoveryImportId: recoveryImport.id,
            electronicApproval: false,
            historicalFieldsPreserved: true,
          }),
          legacyApproval?.evidence_payload?.effectiveDate || null,
        ]
      )
    ).rows[0];
    if (input.injectFailureAfterMutation)
      throw new Error('INJECTED_RECOVERY_ROLLBACK');
    if (lifecycle === 'RELEASED') {
      await client.query(
        `UPDATE controlled_documents SET current_released_revision_id=$1,
          lifecycle_status='RELEASED',lifecycle_reason=$2,updated_at=now() WHERE id=$3`,
        [insertedRevision.id, input.reason, document.id]
      );
    } else {
      await client.query(
        `UPDATE controlled_documents SET current_revision_id=$1,working_draft_revision_id=$1,
          lifecycle_status='DRAFT',lifecycle_reason=$2,status='draft',updated_at=now()
         WHERE id=$3`,
        [insertedRevision.id, input.reason, document.id]
      );
    }
    const evidence = (
      await client.query(
        `INSERT INTO controlled_document_reconciliation_evidence(
          controlled_document_id,revision_id,evidence_type,evidence_payload,immutable_file_path,
          immutable_file_checksum,immutable_file_media_type,immutable_file_size,
          immutable_file_provenance,actor_user_id,actor_snapshot,reason,confirmed_at,
          confirmed_by_user_id,confirmation_reason)
         VALUES($1,$2,'AUTHORITATIVE_HISTORICAL_FILE',$3::jsonb,$4,$5,$6,$7,$8::jsonb,
          $9,$10::jsonb,$11,now(),$9,$11) RETURNING id`,
        [
          document.id,
          insertedRevision.id,
          JSON.stringify({
            sourceRecoveryImportId: recoveryImport.id,
            sourceRevisionId: selectedRevision?.id || null,
            originalFilename: recoveryImport.original_filename,
            electronicApproval: false,
          }),
          recoveryImport.storage_object_path,
          observedChecksum,
          recoveryImport.media_type,
          Number(recoveryImport.file_size),
          JSON.stringify({
            storage: 'CONTROLLED_OBJECT_STORAGE',
            immutable: true,
            sourceIdentityHash: hashRecoveryValue(
              recoveryImport.source_provenance
            ),
            originalReferencePreserved: true,
          }),
          input.actor.id,
          JSON.stringify(input.actor),
          input.reason,
        ]
      )
    ).rows[0];
    const evidenceSnapshot = {
      requestIdentityHash,
      importId: recoveryImport.id,
      controlledDocumentId: document.id,
      sourceRevisionId: selectedRevision?.id || null,
      createdRevisionId: insertedRevision.id,
      evidenceId: evidence.id,
      checksum: observedChecksum,
      fileSize: Number(recoveryImport.file_size),
      mediaType: recoveryImport.media_type,
      executionAction: input.executionAction,
      legacyApprovalEvidenceId: legacyApproval?.id || null,
      electronicApproval: false,
      released: lifecycle === 'RELEASED',
      historicalFieldsPreserved: true,
      managedObjectPathExposed: false,
    };
    await client.query(
      `INSERT INTO controlled_document_recovery_events(
        preview_id,import_id,controlled_document_id,revision_id,idempotency_key,event_type,
        policy_version,evidence_snapshot,checksum,actor_user_id,actor_snapshot,reason)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12)`,
      [
        recoveryImport.preview_id,
        recoveryImport.id,
        document.id,
        insertedRevision.id,
        `execute:${input.idempotencyKey}`,
        lifecycle === 'RELEASED'
          ? 'LEGACY_VERIFIED_REVISION_CREATED'
          : 'CURRENT_APPROVAL_WORKFLOW_HANDOFF',
        CONTROLLED_DOCUMENT_RECOVERY_POLICY_VERSION,
        JSON.stringify(evidenceSnapshot),
        observedChecksum,
        input.actor.id,
        JSON.stringify(input.actor),
        input.reason,
      ]
    );
    if (lifecycle === 'RELEASED') {
      await client.query(
        `INSERT INTO controlled_document_reconciliation_events(
          controlled_document_id,revision_id,idempotency_key,event_type,provenance,policy_version,
          original_snapshot,proposed_changes,completed_changes,before_snapshot,after_snapshot,
          actor_user_id,actor_snapshot,reason,checksum,file_identity)
         VALUES($1,$2,$3,'SOURCE_RECOVERY_LEGACY_REVISION','LEGACY_MIGRATION_VERIFIED',$4,
          $5::jsonb,$6::jsonb,$7::jsonb,$5::jsonb,$7::jsonb,$8,$9::jsonb,$10,$11,$12)`,
        [
          document.id,
          insertedRevision.id,
          `source-recovery:${input.idempotencyKey}`,
          CONTROLLED_DOCUMENT_RECOVERY_POLICY_VERSION,
          JSON.stringify(recoveryImport.document_snapshot),
          JSON.stringify({
            createLegacyVerifiedRevision: true,
            preserveSourceRevision: selectedRevision.id,
            setCurrentReleasedRevisionId: insertedRevision.id,
          }),
          JSON.stringify({
            controlledDocumentId: document.id,
            releasedRevisionId: insertedRevision.id,
            checksum: observedChecksum,
            provenance: 'LEGACY_MIGRATION_VERIFIED',
            electronicApproval: false,
          }),
          input.actor.id,
          JSON.stringify(input.actor),
          input.reason,
          observedChecksum,
          JSON.stringify({
            storageProvider: recoveryImport.storage_provider,
            checksum: observedChecksum,
            objectPathExposed: false,
          }),
        ]
      );
    }
    await client.query(
      `UPDATE controlled_document_recovery_imports SET status='CONSUMED',consumed_at=now()
       WHERE id=$1 AND status='STAGED'`,
      [recoveryImport.id]
    );
    await client.query('COMMIT');
    return {
      importId: recoveryImport.id,
      revisionId: insertedRevision.id,
      replayed: false,
      executionAction: input.executionAction,
      lifecycleStatus: lifecycle,
      released: lifecycle === 'RELEASED',
      currentApprovalRequired: lifecycle !== 'RELEASED',
      electronicApprovalCreated: false,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

router.post(
  '/imports/:importId/execute',
  requirePermission('documents.recovery_execute'),
  requireControlledDocumentRecoveryExecution,
  requireStepUp(),
  asyncRoute(async (req, res) => {
    try {
      const input = z
        .object({
          executionAction: z.enum([
            'CURRENT_APPROVAL_WORKFLOW',
            'LEGACY_RECONCILIATION',
          ]),
          revisionValue: z.string().trim().min(1).max(80),
          idempotencyKey: z.string().trim().min(12).max(200),
          legacyApprovalEvidenceId: z.string().uuid().optional(),
          reason: z.string().trim().min(10).max(2000),
        })
        .parse(req.body);
      const result = await executeControlledDocumentRecovery({
        importId: req.params.importId,
        ...input,
        actor: actor(req),
        sessionToken: sessionToken(req),
      });
      await audit(
        req,
        result.replayed
          ? 'CONTROLLED_DOCUMENT_RECOVERY_EXECUTION_REPLAYED'
          : 'CONTROLLED_DOCUMENT_RECOVERY_EXECUTED',
        req.params.importId,
        {
          controlledRevisionId: result.revisionId,
          executionAction: result.executionAction,
          released: result.released ?? false,
        },
        input.reason
      );
      return res.json(result);
    } catch (error) {
      await audit(
        req,
        'CONTROLLED_DOCUMENT_RECOVERY_EXECUTION_DENIED',
        req.params.importId,
        {
          reasonCode: String((error as any)?.code || 'EXECUTION_FAILED'),
        }
      );
      return safeError(
        res,
        error,
        'Recovery execution failed and was rolled back.'
      );
    }
  })
);

router.post(
  '/dispositions',
  requirePermission('documents.recovery_disposition'),
  requireControlledDocumentRecoveryExecution,
  requireStepUp(),
  asyncRoute(async (req, res) => {
    const input = z
      .object({
        documentCode: z.string().trim().min(1).max(200),
        authoritativeDocumentId: z.string().uuid(),
        relatedDocumentIds: z.array(z.string().uuid()).min(2).max(20),
        disposition: z.enum([
          'AUTHORITATIVE_RECORD_SELECTED',
          'REFERENCE_ONLY',
          'OBSOLETE',
          'VOID',
          'MANUAL_REVIEW_REQUIRED',
        ]),
        supportingEvidence: z.record(z.unknown()),
        reason: z.string().trim().min(10).max(2000),
      })
      .parse(req.body);
    const normalized = normalizeRecoveryDocumentCode(input.documentCode);
    const ids = Array.from(new Set(input.relatedDocumentIds)).sort();
    if (!ids.includes(input.authoritativeDocumentId))
      return res
        .status(422)
        .json({ error: 'AUTHORITATIVE_RECORD_NOT_IN_RELATED_SET' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`recovery-disposition:${normalized}`]
      );
      const documents = await client.query(
        `SELECT id,document_number,document_name FROM controlled_documents
         WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`,
        [ids]
      );
      if (
        documents.rows.length !== ids.length ||
        documents.rows.some(
          (row) =>
            normalizeRecoveryDocumentCode(row.document_number) !== normalized
        )
      )
        throw Object.assign(
          new Error('Disposition records do not share the exact code'),
          {
            code: 'RECOVERY_MATCH_BLOCKED',
          }
        );
      await assertControlledDocumentRecoverySchemaReady(client);
      await revalidateExecutionActor(
        client,
        actor(req),
        sessionToken(req),
        'documents.recovery_disposition'
      );
      const a = actor(req);
      const result = await client.query(
        `INSERT INTO controlled_document_recovery_dispositions(
          normalized_document_code,authoritative_document_id,related_document_ids,
          disposition,supporting_evidence,actor_user_id,actor_snapshot,reason)
         VALUES($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7::jsonb,$8) RETURNING id`,
        [
          normalized,
          input.authoritativeDocumentId,
          JSON.stringify(ids),
          input.disposition,
          JSON.stringify(
            sanitizeRecoverySupportingEvidence(input.supportingEvidence)
          ),
          a.id,
          JSON.stringify(a),
          input.reason,
        ]
      );
      await client.query('COMMIT');
      await audit(
        req,
        'CONTROLLED_DOCUMENT_RECOVERY_DISPOSITION_RECORDED',
        result.rows[0].id,
        {
          normalizedDocumentCode: normalized,
          authoritativeDocumentId: input.authoritativeDocumentId,
          relatedRecordCount: ids.length,
          disposition: input.disposition,
        },
        input.reason
      );
      return res.status(201).json({
        dispositionId: result.rows[0].id,
        appendOnly: true,
        recordsModified: 0,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      return safeError(res, error, 'Quality disposition was not recorded.');
    } finally {
      client.release();
    }
  })
);

router.use(
  (error: unknown, req: Request, res: Response, _next: NextFunction) => {
    void audit(
      req,
      'CONTROLLED_DOCUMENT_RECOVERY_REQUEST_DENIED',
      req.originalUrl,
      {
        reasonCode: String((error as any)?.code || 'REQUEST_REJECTED'),
      }
    );
    return safeError(
      res,
      error,
      'Document File Recovery request was rejected.'
    );
  }
);

export default router;
