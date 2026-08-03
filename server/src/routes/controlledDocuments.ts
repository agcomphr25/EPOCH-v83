import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { db } from '../../../server/db';
import { pool } from '../../../server/db';
import { requirePermission } from '../../../server/middleware/requirePermission';
import { controlledDocumentNumberRegistry, controlledDocuments, documentVersionHistory, insertControlledDocumentSchema, insertDocumentVersionHistorySchema } from '../../../server/schema';
import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import fs from 'fs/promises';
import { z } from 'zod';
import Papa from 'papaparse';
import { requireStepUp } from '../../../server/middleware/auth';
import { writeAccessLog } from './vault';
import { getUserPermissions } from '../services/permissionService';
import { recordAuditEvent } from '../services/auditLedgerService';
import { fileURLToPath } from 'url';
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { getFileStorageProvider, getFileStorageProviderForObjectPath } from '../services/fileStorageProvider';
import {
  ControlledDocumentError,
  attachExternalApprovalEvidence,
  createControlledDocument,
  createControlledRevision,
  getControlledDocumentState,
  getDocumentNumberConflicts,
  recordRejectedHardDelete,
  transitionControlledRevision,
  updateDraftMetadata,
  verifyControlledRevisionFile,
} from '../services/controlledDocumentLifecycleService';
import {
  assertControlledDocumentSchemaReady,
  ControlledDocumentSchemaNotReadyError,
} from '../services/controlledDocumentSchemaReadiness';

const router = Router();

const lifecycleActor = (req: Request) => {
  const user = (req as any).user;
  if (!user || !Number.isInteger(Number(user.id))) {
    throw new ControlledDocumentError(401, 'AUTHENTICATION_REQUIRED', 'Authenticated user identity is required');
  }
  return { id: Number(user.id), username: String(user.username), role: String(user.role) };
};

const requestEvidence = (req: Request) => ({
  ipAddress: ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null),
  userAgent: req.headers['user-agent'] ?? null,
});

const sendLifecycleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof ControlledDocumentError) {
    res.status(error.statusCode).json({ error: error.code, message: error.message, ...error.details });
    return;
  }
  console.error(fallback, error);
  res.status(500).json({ error: 'CONTROLLED_DOCUMENT_OPERATION_FAILED', message: fallback });
};

// Helper function to get user from session
async function getUserFromSession(req: Request): Promise<any | null> {
  const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
  
  if (!sessionToken) {
    return null;
  }

  try {
    // Query database for session — enforce is_active so revoked/superseded sessions are rejected
    const result = await pool.query(
      `SELECT user_id, username, expires_at
       FROM user_sessions
       WHERE session_token = $1 AND is_active = true AND expires_at > NOW()`,
      [sessionToken]
    );

    if (!result || result.length === 0) {
      return null;
    }

    const session = result[0];

    // Belt-and-suspenders expiry check (the SQL above already filters these out)
    if (new Date(session.expires_at) < new Date()) {
      await pool.query(`UPDATE user_sessions SET is_active = false WHERE session_token = $1`, [sessionToken]);
      return null;
    }

    // Get user data from database
    const dbUserResult = await pool.query(
      `SELECT id, username, role FROM users WHERE username = $1 AND is_active = true`,
      [session.username.toLowerCase()]
    );

    if (dbUserResult && dbUserResult.length > 0) {
      return dbUserResult[0];
    }

    return null;
  } catch (error) {
    console.error('Error getting user from session:', error);
    return null;
  }
}

// Authentication middleware - runs before all other route handlers
const requireAuth = async (req: Request, res: Response, next: any) => {
  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  (req as any).user = user;
  next();
};

// Authorization middleware - check for admin/owner role
const requireAdminOrOwner = async (req: Request, res: Response, next: any) => {
  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (user.role !== 'ADMIN' && user.role !== 'OWNER') {
    return res.status(403).json({ error: 'Only admins and owners can perform this action' });
  }
  (req as any).user = user;
  next();
};

// Authorization middleware for document create/edit - admin, owner, or designated document managers
const requireDocumentEditor = async (req: Request, res: Response, next: any) => {
  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  (req as any).user = user;
  next();
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(pdf|docx?|xlsx?|txt|jpg|jpeg|png)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, Word, Excel, Text, Images'));
    }
  }
});

const persistControlledDocumentUpload = async (file: Express.Multer.File, entityId?: string) =>
  getFileStorageProvider().uploadBuffer({
    buffer: file.buffer,
    fileName: file.originalname,
    contentType: file.mimetype,
    scope: 'controlled-documents',
    entityId,
  });

const readControlledDocumentBytes = async (filePath: string) => {
  if (filePath.startsWith('/objects/') || filePath.startsWith('/supabase-objects/')) {
    return getFileStorageProviderForObjectPath(filePath).downloadBuffer(filePath);
  }
  const resolvedPath = resolveControlledDocumentFile(filePath);
  if (!resolvedPath) {
    throw new ControlledDocumentError(
      422,
      'REVISION_FILE_LOCATION_UNSUPPORTED',
      'Document file path is not a supported app-accessible location'
    );
  }
  try {
    return await fs.readFile(resolvedPath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new ControlledDocumentError(
        404,
        'REVISION_FILE_NOT_ACCESSIBLE',
        'Document file is not accessible from this server'
      );
    }
    throw error;
  }
};

const verifyStoredRevision = async (
  documentId: string,
  revision: { id: string },
  filePath: string,
  buffer: Buffer,
  req: Request,
) => verifyControlledRevisionFile({
  documentId,
  revisionId: revision.id,
  filePath,
  fileBuffer: buffer,
  actor: lifecycleActor(req),
  request: requestEvidence(req),
});

type ControlledDocumentRecord = typeof controlledDocuments.$inferSelect;
type ControlledRevisionRecord = typeof documentVersionHistory.$inferSelect;

const isPrivilegedDocumentActor = (actor: { role: string }) =>
  actor.role === 'ADMIN' || actor.role === 'OWNER';

const hasControlledDocumentGrant = async (
  documentId: string,
  actor: { username: string; role: string },
) => {
  const result = await pool.query<{ id: number }>(
    `SELECT id FROM vault_access_grants WHERE document_id = $1 AND (
       (grantee_type = 'user' AND grantee_name = $2)
       OR (grantee_type = 'role' AND grantee_name = $3)
     ) LIMIT 1`,
    [documentId, actor.username, actor.role],
  );
  return result.rows.length > 0;
};

const authorizeControlledDocumentAccess = async (
  req: Request,
  document: ControlledDocumentRecord,
) => {
  const actor = lifecycleActor(req);
  if (isPrivilegedDocumentActor(actor)) return actor;

  const classification = String(
    document.classification || 'internal',
  ).toLowerCase();
  const accessRule = String(
    document.accessRule || 'authenticated',
  ).toLowerCase();
  const grantRequired =
    accessRule === 'explicit_grant' ||
    classification === 'restricted' ||
    classification === 'classified';
  const allowed =
    accessRule !== 'admin_only' &&
    (!grantRequired || (await hasControlledDocumentGrant(document.id, actor)));

  if (!allowed) {
    await writeAccessLog({
      documentId: document.id,
      userId: actor.username,
      action: 'denied',
      ipAddress: requestEvidence(req).ipAddress ?? 'unknown',
    });
    throw new ControlledDocumentError(
      403,
      'CONTROLLED_DOCUMENT_ACCESS_DENIED',
      accessRule === 'admin_only'
        ? 'This document is restricted to administrators and owners'
        : 'An explicit vault grant is required to access this document',
      { classification, accessRule },
    );
  }
  return actor;
};

const assertExactRevisionPermission = async (
  actor: { id: number; role: string },
  revision: ControlledRevisionRecord,
) => {
  if (isPrivilegedDocumentActor(actor)) return;
  const lifecycle = String(
    revision.lifecycleStatus || revision.status || '',
  ).toUpperCase();
  if (['RELEASED', 'SUPERSEDED', 'OBSOLETE'].includes(lifecycle)) return;

  const { permissionSet } = await getUserPermissions(actor.id, actor.role);
  const required =
    lifecycle === 'IN_REVIEW' || lifecycle === 'APPROVED'
      ? ['documents.approve', 'documents.release']
      : ['documents.edit_draft', 'documents.revise'];
  if (!required.some((capability) => permissionSet.has(capability))) {
    throw new ControlledDocumentError(
      403,
      'DRAFT_REVISION_ACCESS_DENIED',
      'Draft and review revisions require an appropriate document lifecycle permission',
      { lifecycleStatus: lifecycle, requiredAnyCapability: required },
    );
  }
};

const getReleasedRevisionForControlledUse = async (
  req: Request,
  document: ControlledDocumentRecord,
  revisions: ControlledRevisionRecord[],
) => {
  if (!document.currentReleasedRevisionId) {
    const actor = lifecycleActor(req);
    await writeAccessLog({
      documentId: document.id,
      userId: actor.username,
      action: 'denied',
      ipAddress: requestEvidence(req).ipAddress ?? 'unknown',
    });
    throw new ControlledDocumentError(
      409,
      'NO_RELEASED_REVISION',
      'This controlled document has not been released',
    );
  }
  const revision = revisions.find(
    (candidate) => candidate.id === document.currentReleasedRevisionId,
  );
  if (!revision || revision.documentId !== document.id) {
    const actor = lifecycleActor(req);
    await writeAccessLog({
      documentId: document.id,
      userId: actor.username,
      action: 'denied',
      ipAddress: requestEvidence(req).ipAddress ?? 'unknown',
    });
    await recordAuditEvent({
      eventType: 'CONTROLLED_DOCUMENT_RELEASE_POINTER_INVALID',
      subjectType: 'controlled_document',
      subjectId: document.id,
      sourceService: 'controlledDocuments.route',
      actor,
      reason: 'Normal controlled-use access rejected an invalid released revision pointer',
      ipAddress: requestEvidence(req).ipAddress,
      userAgent: requestEvidence(req).userAgent,
      payload: {
        controlledDocumentId: document.id,
        currentReleasedRevisionId: document.currentReleasedRevisionId,
      },
    });
    throw new ControlledDocumentError(
      409,
      'RELEASED_REVISION_POINTER_INVALID',
      'The released revision reference is invalid; access has been denied and recorded',
    );
  }
  return revision;
};

// Separate multer configuration for CSV imports
const csvUpload = multer({
  storage: multer.memoryStorage(), // Store in memory for CSV parsing
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for CSV
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV files are allowed.'));
    }
  }
});

const nextRevisionVersion = (version: string | null | undefined): string => {
  const match = String(version || '1.0').match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return '1.1';

  const major = Number(match[1]);
  const minor = Number(match[2] || '0');
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return '1.1';

  if (minor >= 9) {
    return `${major + 1}.0`;
  }

  return `${major}.${minor + 1}`;
};

const getCsvValue = (row: Record<string, unknown>, names: string[]) => {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
};

const toForwardSlashPath = (filePath: string) => filePath.replace(/\\/g, '/').toLowerCase();

const isWindowsAbsolutePath = (filePath: string) => /^[a-zA-Z]:[\\/]/.test(filePath);

const isUncPath = (filePath: string) => /^\\\\[^\\]+\\[^\\]+/.test(filePath);

const isAllowedImportedAbsolutePath = (filePath: string) => {
  const normalized = toForwardSlashPath(filePath);
  return (
    normalized.includes('/my drive/') ||
    normalized.includes('/shared drives/') ||
    normalized.includes('/onedrive/') ||
    normalized.includes('/google drive/')
  );
};

const getExternalRedirectUrl = (filePath: string | null | undefined) => {
  const trimmed = String(filePath || '').trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(?:drive|docs)\.google\.com\//i.test(trimmed)) return `https://${trimmed}`;
  return null;
};

const getImportedFileReference = (filePath: string | null | undefined) => {
  const trimmed = String(filePath || '').trim();
  if (!trimmed) return null;
  if (getExternalRedirectUrl(trimmed)) return getExternalRedirectUrl(trimmed);
  if (trimmed.startsWith('/assets/documents/') || trimmed.startsWith('assets/documents/')) {
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  if (/^file:\/\//i.test(trimmed)) {
    try {
      const localPath = fileURLToPath(trimmed);
      return isAllowedImportedAbsolutePath(localPath) ? localPath : null;
    } catch {
      return null;
    }
  }

  if ((isWindowsAbsolutePath(trimmed) || isUncPath(trimmed) || path.isAbsolute(trimmed)) && isAllowedImportedAbsolutePath(trimmed)) {
    return trimmed;
  }

  return null;
};

const resolveControlledDocumentFile = (filePath: string | null | undefined) => {
  const trimmed = String(filePath || '').trim();
  if (!trimmed) return null;

  const centralMediaRoot = path.resolve(process.cwd(), 'uploads', 'media-library');
  if (trimmed.startsWith('/api/media/file/')) {
    try {
      const fileName = decodeURIComponent(trimmed.slice('/api/media/file/'.length));
      if (!fileName || path.basename(fileName) !== fileName) return null;
      return path.join(centralMediaRoot, fileName);
    } catch {
      return null;
    }
  }

  const normalizedMediaPath = trimmed.replace(/\\/g, '/').replace(/^\//, '');
  if (normalizedMediaPath.startsWith('uploads/media-library/')) {
    const relativeMediaPath = normalizedMediaPath.slice('uploads/media-library/'.length);
    const resolvedMediaPath = path.resolve(centralMediaRoot, relativeMediaPath);
    if (resolvedMediaPath !== centralMediaRoot && resolvedMediaPath.startsWith(`${centralMediaRoot}${path.sep}`)) {
      return resolvedMediaPath;
    }
    return null;
  }

  if (trimmed.startsWith('/assets/documents/') || trimmed.startsWith('assets/documents/')) {
    const relativePath = trimmed.replace(/^\//, '');
    return path.join(process.cwd(), 'server/src', relativePath);
  }

  if (/^file:\/\//i.test(trimmed)) {
    try {
      const localPath = fileURLToPath(trimmed);
      return isAllowedImportedAbsolutePath(localPath) ? localPath : null;
    } catch {
      return null;
    }
  }

  if ((isWindowsAbsolutePath(trimmed) || isUncPath(trimmed) || path.isAbsolute(trimmed)) && isAllowedImportedAbsolutePath(trimmed)) {
    return trimmed;
  }

  if (/^[^\\/]+\.[a-z0-9]{2,5}$/i.test(trimmed)) {
    return path.join(process.cwd(), 'server/src/assets/documents', path.basename(trimmed));
  }

  return null;
};

const formatControlledDocumentFooterDate = (value: Date | string | null | undefined) => {
  if (!value) return 'N/A';
  const date = value instanceof Date
    ? value
    : new Date(String(value).includes('T') ? String(value) : `${String(value)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
};

const truncateTextToWidth = (text: string, maxWidth: number, font: PDFFont, size: number) => {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;

  let truncated = text;
  while (truncated.length > 0 && font.widthOfTextAtSize(`${truncated}...`, size) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return truncated ? `${truncated}...` : text.slice(0, 12);
};

const addControlledDocumentFooter = async (
  pdfBytes: Buffer,
  doc: ControlledDocumentRecord,
  revision: ControlledRevisionRecord,
) => {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  const footerDate = formatControlledDocumentFooterDate(
    revision.effectiveDate || revision.releasedAt || revision.createdAt,
  );
  const lifecycleStatus = String(
    revision.lifecycleStatus || revision.status || 'UNKNOWN',
  ).toUpperCase();
  const footerText = `Doc #: ${doc.documentNumber || 'N/A'} | Version: ${revision.versionNumber || 'N/A'} | Effective: ${footerDate} | Status: ${lifecycleStatus}`;

  for (const page of pages) {
    const { width } = page.getSize();
    const marginX = 36;
    const footerHeight = 24;
    const fontSize = 8;
    const text = truncateTextToWidth(footerText, width - marginX * 2, font, fontSize);

    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: footerHeight,
      color: rgb(1, 1, 1),
      opacity: 0.92,
    });
    page.drawLine({
      start: { x: marginX, y: footerHeight },
      end: { x: width - marginX, y: footerHeight },
      thickness: 0.5,
      color: rgb(0.72, 0.72, 0.72),
    });
    page.drawText(text, {
      x: marginX,
      y: 8,
      size: fontSize,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  return Buffer.from(await pdfDoc.save());
};

const normalizeImportedFilePath = async (row: Record<string, unknown>, documentName: string) => {
  const explicitLink = getCsvValue(row, [
    'Document Link',
    'Document URL',
    'File Link',
    'File URL',
    'URL',
    'Link',
    'File Path',
    'filePath',
  ]);

  const importedFileReference = getImportedFileReference(explicitLink);
  if (importedFileReference) return importedFileReference;

  const candidateName = explicitLink || documentName;
  if (!/\.[a-z0-9]{2,5}$/i.test(candidateName)) return null;

  const safeName = path.basename(candidateName);
  const localPath = path.join(process.cwd(), 'server/src/assets/documents', safeName);
  try {
    await fs.access(localPath);
    return `/assets/documents/${safeName}`;
  } catch {
    return null;
  }
};

router.use(async (_req, res, next) => {
  try {
    await assertControlledDocumentSchemaReady();
    next();
  } catch (error) {
    if (error instanceof ControlledDocumentSchemaNotReadyError) {
      return res.status(503).json({
        error: error.code,
        message: error.message,
        requiredMigration: '0209_master_document_control_hardening.sql',
        missingObjects: error.missingObjects,
      });
    }
    next(error);
  }
});

// Get all controlled documents (authenticated users only)
router.get('/', requireAuth, requirePermission('documents.view'), async (req: Request, res: Response) => {
  try {
    const docs = await db.select().from(controlledDocuments).orderBy(desc(controlledDocuments.createdAt));
    res.json(docs);
  } catch (error) {
    console.error('Error fetching controlled documents:', error);
    res.status(500).json({ error: 'Failed to fetch controlled documents' });
  }
});

router.get('/number-conflicts', requireAuth, requirePermission('documents.number_admin'), async (_req: Request, res: Response) => {
  try {
    res.json({ conflicts: await getDocumentNumberConflicts() });
  } catch (error) {
    sendLifecycleError(res, error, 'Failed to load controlled document number conflicts');
  }
});

// Get single document by ID (authenticated users only)
router.get('/:id', requireAuth, requirePermission('documents.view'), async (req: Request, res: Response) => {
  try {
    const [doc] = await db
      .select()
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));
    
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(doc);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Get version history for a document (authenticated users only)
router.get('/:id/versions', requireAuth, requirePermission('documents.view'), async (req: Request, res: Response) => {
  try {
    const versions = await db
      .select()
      .from(documentVersionHistory)
      .where(eq(documentVersionHistory.documentId, req.params.id))
      .orderBy(desc(documentVersionHistory.createdAt));
    
    res.json(versions);
  } catch (error) {
    console.error('Error fetching version history:', error);
    res.status(500).json({ error: 'Failed to fetch version history' });
  }
});

router.get('/:id/revisions', requireAuth, requirePermission('documents.view'), async (req: Request, res: Response) => {
  try {
    const state = await getControlledDocumentState(req.params.id);
    res.json({ document: state.document, currentRevision: state.currentRevision, revisions: state.revisions, approvals: state.approvals });
  } catch (error) {
    sendLifecycleError(res, error, 'Failed to load controlled document revisions');
  }
});

router.get('/:id/revisions/:revisionId', requireAuth, requirePermission('documents.view'), async (req: Request, res: Response) => {
  try {
    const state = await getControlledDocumentState(req.params.id);
    const revision = state.revisions.find((candidate) => candidate.id === req.params.revisionId);
    if (!revision) return res.status(404).json({ error: 'REVISION_NOT_FOUND' });
    res.json({ document: state.document, revision, approvals: state.approvals.filter((row) => row.revisionId === revision.id) });
  } catch (error) {
    sendLifecycleError(res, error, 'Failed to load controlled document revision');
  }
});

router.get('/:id/revisions/:revisionId/download', requireAuth, requirePermission('documents.view'), requireStepUp(), async (req: Request, res: Response) => {
  try {
    const state = await getControlledDocumentState(req.params.id);
    const revision = state.revisions.find((candidate) => candidate.id === req.params.revisionId);
    if (!revision?.filePath) return res.status(404).json({ error: 'REVISION_FILE_NOT_FOUND' });
    const actor = await authorizeControlledDocumentAccess(req, state.document);
    try {
      await assertExactRevisionPermission(actor, revision);
    } catch (error) {
      await writeAccessLog({ documentId: state.document.id, userId: actor.username, action: 'denied', ipAddress: requestEvidence(req).ipAddress ?? 'unknown' });
      throw error;
    }
    if (getExternalRedirectUrl(revision.filePath)) {
      throw new ControlledDocumentError(422, 'IMMUTABLE_REVISION_FILE_REQUIRED', 'External references are not authoritative controlled revision files; upload an immutable verified copy');
    }
    const buffer = await readControlledDocumentBytes(revision.filePath);
    await verifyStoredRevision(state.document.id, revision, revision.filePath, buffer, req);
    await writeAccessLog({ documentId: state.document.id, userId: actor.username, action: 'download', ipAddress: requestEvidence(req).ipAddress ?? 'unknown' });
    res.setHeader('Content-Type', revision.mediaType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${revision.fileName || `${state.document.documentNumber}-${revision.versionNumber}`}"`);
    res.send(buffer);
  } catch (error) {
    sendLifecycleError(res, error, 'Failed to download exact controlled revision');
  }
});

router.post('/:id/revise', requireAuth, requirePermission('documents.revise'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'REVISION_FILE_REQUIRED' });
    const filePath = await persistControlledDocumentUpload(req.file, req.params.id);
    const result = await createControlledRevision({
      documentId: req.params.id,
      expectedCurrentRevisionId: typeof req.body?.currentRevisionId === 'string' ? req.body.currentRevisionId : undefined,
      revisionValue: String(req.body?.revisionValue || ''),
      reason: String(req.body?.reason || ''),
      file: { path: filePath, name: req.file.originalname, mediaType: req.file.mimetype, size: req.file.size, buffer: req.file.buffer },
      actor: lifecycleActor(req),
      request: requestEvidence(req),
    });
    res.status(201).json(result);
  } catch (error) {
    sendLifecycleError(res, error, 'Failed to create controlled revision');
  }
});

const lifecycleHandler = (
  action: 'submit' | 'approve' | 'release' | 'supersede' | 'obsolete' | 'void'
) => async (req: Request, res: Response) => {
  try {
    if (action === 'approve' || action === 'release') {
      const state = await getControlledDocumentState(req.params.id);
      const requestedRevisionId = typeof req.body?.revisionId === 'string' ? req.body.revisionId : null;
      const revision = requestedRevisionId
        ? state.revisions.find((candidate) => candidate.id === requestedRevisionId)
        : state.currentRevision;
      if (!revision) {
        throw new ControlledDocumentError(404, 'REVISION_NOT_FOUND', 'Controlled document revision not found');
      }
      const filePath = revision.filePath;
      if (!filePath) {
        throw new ControlledDocumentError(
          422,
          'VERIFIED_CHECKSUM_REQUIRED',
          'Exact stored file bytes are required before approval'
        );
      }
      if (getExternalRedirectUrl(filePath)) {
        throw new ControlledDocumentError(422, 'IMMUTABLE_REVISION_FILE_REQUIRED', 'External references cannot be approved or released; upload an immutable verified copy');
      }
      const buffer = await readControlledDocumentBytes(filePath);
      await verifyStoredRevision(state.document.id, revision, filePath, buffer, req);
    }
    const result = await transitionControlledRevision({
      documentId: req.params.id,
      revisionId: typeof req.body?.revisionId === 'string' ? req.body.revisionId : undefined,
      action,
      decision: action === 'approve' ? req.body?.decision : undefined,
      reason: String(req.body?.reason || req.body?.comment || ''),
      effectiveDate: typeof req.body?.effectiveDate === 'string' ? req.body.effectiveDate : null,
      actor: lifecycleActor(req),
      request: requestEvidence(req),
    });
    res.json(result);
  } catch (error) {
    sendLifecycleError(res, error, `Failed to ${action} controlled revision`);
  }
};

router.post('/:id/submit', requireAuth, requirePermission('documents.submit'), lifecycleHandler('submit'));
router.post('/:id/decision', requireAuth, requirePermission('documents.approve'), lifecycleHandler('approve'));
router.post('/:id/release', requireAuth, requirePermission('documents.release'), lifecycleHandler('release'));
router.post('/:id/supersede', requireAuth, requirePermission('documents.supersede'), lifecycleHandler('supersede'));
router.post('/:id/obsolete', requireAuth, requirePermission('documents.obsolete'), lifecycleHandler('obsolete'));
router.post('/:id/void', requireAuth, requirePermission('documents.void'), lifecycleHandler('void'));

router.post('/:id/revisions/:revisionId/external-approval-evidence', requireAuth, requirePermission('documents.approve'), async (req: Request, res: Response) => {
  try {
    const evidence = await attachExternalApprovalEvidence({
      documentId: req.params.id,
      revisionId: req.params.revisionId,
      externalApprover: String(req.body?.externalApprover || ''),
      externalOrganization: typeof req.body?.externalOrganization === 'string' ? req.body.externalOrganization : undefined,
      evidenceReference: String(req.body?.evidenceReference || ''),
      comment: String(req.body?.comment || ''),
      actor: lifecycleActor(req),
      request: requestEvidence(req),
    });
    res.status(201).json({ evidence });
  } catch (error) {
    sendLifecycleError(res, error, 'Failed to attach external approval evidence');
  }
});

// Create new document with file upload (admin/owner/document managers only)
// Auth middleware runs BEFORE upload to prevent anonymous file uploads
router.post('/', requireDocumentEditor, requirePermission('documents.create'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const filePath = req.file
      ? await persistControlledDocumentUpload(req.file, req.body.documentNumber)
      : null;
    const result = await createControlledDocument({
      document: {
        documentNumber: req.body.documentNumber,
        documentName: req.body.documentName,
        templateKey: req.body.templateKey || null,
        documentType: req.body.documentType,
        department: req.body.department,
        category: req.body.category || null,
        description: req.body.description || null,
        revisionValue: req.body.currentVersion || '1.0',
        retentionLength: req.body.retentionLength || '10 years',
        documentOwner: req.body.documentOwner || null,
        classification: req.body.classification || 'internal',
        cuiCategory: req.body.cuiCategory || null,
        itarCategory: req.body.itarCategory || null,
        exportControlJurisdiction: req.body.exportControlJurisdiction || null,
        customerId: req.body.customerId || null,
        contractArtifactType: req.body.contractArtifactType || null,
        accessRule: req.body.accessRule || 'authenticated',
        mfaRequired: req.body.mfaRequired === 'true' || req.body.mfaRequired === true,
      },
      file: req.file && filePath ? {
        path: filePath,
        name: req.file.originalname,
        mediaType: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
      } : null,
      actor: lifecycleActor(req),
      request: requestEvidence(req),
    });
    res.status(201).json(result.document);
  } catch (error: any) {
    sendLifecycleError(res, error, 'Failed to create controlled document');
  }
});

// Update document / Create new version (admin/owner/document managers only)
// Auth middleware runs BEFORE upload to prevent anonymous file uploads
router.put('/:id', requireDocumentEditor, requirePermission('documents.edit_draft'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { createNewVersion, changeDescription } = req.body;

    const [existingDoc] = await db
      .select()
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));

    if (!existingDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (req.file && !(createNewVersion === 'true' || createNewVersion === true)) {
      await updateDraftMetadata({
        documentId: req.params.id,
        patch: req.body,
        containsFile: true,
        actor: lifecycleActor(req),
        request: requestEvidence(req),
      });
      return;
    }

    if (req.file) {
      if (!String(changeDescription || '').trim()) {
        return res.status(400).json({ error: 'REVISION_REASON_REQUIRED', message: 'A revision reason is required' });
      }
      const filePath = await persistControlledDocumentUpload(req.file, existingDoc.id);
      const result = await createControlledRevision({
        documentId: req.params.id,
        expectedCurrentRevisionId: typeof req.body.currentRevisionId === 'string' ? req.body.currentRevisionId : undefined,
        revisionValue: String(req.body.revisionValue || nextRevisionVersion(existingDoc.currentVersion)),
        reason: String(changeDescription),
        file: {
          path: filePath,
          name: req.file.originalname,
          mediaType: req.file.mimetype,
          size: req.file.size,
          buffer: req.file.buffer,
        },
        actor: lifecycleActor(req),
        request: requestEvidence(req),
      });
      return res.json(result.document);
    }

    const metadataResult = await updateDraftMetadata({
      documentId: req.params.id,
      patch: req.body,
      containsFile: false,
      actor: lifecycleActor(req),
      request: requestEvidence(req),
    });
    return res.json(metadataResult.document);
  } catch (error) {
    sendLifecycleError(res, error, 'Failed to update controlled document');
  }
});

// Approve document — requires documents.approve capability
router.post('/:id/approve', requireAuth, requirePermission('documents.approve'), async (req: Request, res: Response) => {
  try {
    const preflight = await getControlledDocumentState(req.params.id);
    const requestedRevisionId = typeof req.body?.revisionId === 'string' ? req.body.revisionId : null;
    const revision = requestedRevisionId
      ? preflight.revisions.find((candidate) => candidate.id === requestedRevisionId)
      : preflight.currentRevision;
    if (!revision?.filePath || getExternalRedirectUrl(revision.filePath)) {
      throw new ControlledDocumentError(422, 'IMMUTABLE_REVISION_FILE_REQUIRED', 'External references cannot be approved; upload an immutable verified copy');
    }
    const bytes = await readControlledDocumentBytes(revision.filePath);
    await verifyStoredRevision(preflight.document.id, revision, revision.filePath, bytes, req);
    const state = await transitionControlledRevision({
      documentId: req.params.id,
      revisionId: typeof req.body?.revisionId === 'string' ? req.body.revisionId : undefined,
      action: 'approve',
      decision: 'APPROVED',
      reason: typeof req.body?.comment === 'string' && req.body.comment.trim()
        ? req.body.comment.trim()
        : 'Authenticated controlled revision approval',
      actor: lifecycleActor(req),
      request: requestEvidence(req),
    });
    res.json(state.document);
  } catch (error) {
    sendLifecycleError(res, error, 'Failed to approve controlled revision');
  }
});

// View PDF document file inline - requires authentication + step-up re-auth (credentials verified within 30 min)
// ACL enforcement: restricted/classified docs require an explicit vault access grant or admin/owner role
const legacyViewHandler = async (req: Request, res: Response) => {
  const actor = (req as any).user as { id: number; username: string; role: string };
  const ipAddress = (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );

  try {
    const [doc] = await db
      .select()
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // ACL enforcement for restricted/classified documents
    const classification = (doc as any).classification ?? 'internal';
    if (classification === 'restricted' || classification === 'classified') {
      const isAdminOrOwner = actor.role === 'ADMIN' || actor.role === 'OWNER';
      if (!isAdminOrOwner) {
        // Check for explicit vault grant
        const grantCheck = await pool.query<{ id: number }>(
          `SELECT id FROM vault_access_grants WHERE document_id = $1 AND (
             (grantee_type = 'user' AND grantee_name = $2)
             OR (grantee_type = 'role' AND grantee_name = $3)
           ) LIMIT 1`,
          [doc.id, actor.username, actor.role]
        );
        if (grantCheck.rows.length === 0) {
          // Write denied log entry — never silently discard
          await writeAccessLog({ documentId: doc.id, userId: actor.username, action: 'denied', ipAddress });
          return res.status(403).json({ error: 'Access denied: insufficient clearance for this document' });
        }
      }
    }

    const state = await getControlledDocumentState(doc.id);
    const revision = state.currentRevision;
    const authoritativeFilePath = revision?.filePath || doc.filePath;

    if (!authoritativeFilePath) {
      return res.status(404).json({ error: 'No file attached to this document' });
    }

    const externalRedirectUrl = getExternalRedirectUrl(authoritativeFilePath);
    if (externalRedirectUrl) {
      await writeAccessLog({ documentId: doc.id, userId: actor.username, action: 'view', ipAddress });
      return res.redirect(externalRedirectUrl);
    }

    if (authoritativeFilePath.startsWith('/objects/') || authoritativeFilePath.startsWith('/supabase-objects/')) {
      const buffer = await readControlledDocumentBytes(authoritativeFilePath);
      if (revision) await verifyStoredRevision(doc.id, revision, authoritativeFilePath, buffer, req);
      const stampedPdf = await addControlledDocumentFooter(
        buffer,
        doc,
        revision!,
      );
      await writeAccessLog({ documentId: doc.id, userId: actor.username, action: 'view', ipAddress });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${doc.documentNumber}.pdf"`);
      return res.send(stampedPdf);
    }

    const filePath = resolveControlledDocumentFile(authoritativeFilePath);
    if (!filePath) {
      return res.status(422).json({ error: 'Document file path is not a supported app-accessible location' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Document file is not accessible from this server' });
    }

    if (path.extname(filePath).toLowerCase() !== '.pdf') {
      return res.status(415).json({ error: 'Only PDF documents can be viewed inline' });
    }

    // Write view access log entry before sending the file
    await writeAccessLog({ documentId: doc.id, userId: actor.username, action: 'view', ipAddress });

    const buffer = await fs.readFile(filePath);
    if (revision) await verifyStoredRevision(doc.id, revision, authoritativeFilePath, buffer, req);
    const stampedPdf = await addControlledDocumentFooter(buffer, doc, revision!);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    res.send(stampedPdf);
  } catch (error) {
    sendLifecycleError(res, error, 'Failed to view document');
  }
};

// Download document file - requires authentication + step-up re-auth (credentials verified within 30 min)
// ACL enforcement: restricted/classified docs require an explicit vault access grant or admin/owner role
const legacyDownloadHandler = async (req: Request, res: Response) => {
  const actor = (req as any).user as { id: number; username: string; role: string };
  const ipAddress = (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );

  try {
    const [doc] = await db
      .select()
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // ACL enforcement for restricted/classified documents
    const classification = (doc as any).classification ?? 'internal';
    if (classification === 'restricted' || classification === 'classified') {
      const isAdminOrOwner = actor.role === 'ADMIN' || actor.role === 'OWNER';
      if (!isAdminOrOwner) {
        // Check for explicit vault grant
        const grantCheck = await pool.query<{ id: number }>(
          `SELECT id FROM vault_access_grants WHERE document_id = $1 AND (
             (grantee_type = 'user' AND grantee_name = $2)
             OR (grantee_type = 'role' AND grantee_name = $3)
           ) LIMIT 1`,
          [doc.id, actor.username, actor.role]
        );
        if (grantCheck.rows.length === 0) {
          // Write denied log entry - never silently discard
          await writeAccessLog({ documentId: doc.id, userId: actor.username, action: 'denied', ipAddress });
          return res.status(403).json({ error: 'Access denied: insufficient clearance for this document' });
        }
      }
    }

    const state = await getControlledDocumentState(doc.id);
    const revision = state.currentRevision;
    const authoritativeFilePath = revision?.filePath || doc.filePath;

    if (!authoritativeFilePath) {
      return res.status(404).json({ error: 'No file attached to this document' });
    }

    const externalRedirectUrl = getExternalRedirectUrl(authoritativeFilePath);
    if (externalRedirectUrl) {
      await writeAccessLog({ documentId: doc.id, userId: actor.username, action: 'download', ipAddress });
      return res.redirect(externalRedirectUrl);
    }

    if (authoritativeFilePath.startsWith('/objects/') || authoritativeFilePath.startsWith('/supabase-objects/')) {
      const buffer = await readControlledDocumentBytes(authoritativeFilePath);
      if (revision) await verifyStoredRevision(doc.id, revision, authoritativeFilePath, buffer, req);
      const stampedPdf = await addControlledDocumentFooter(
        buffer,
        doc,
        revision!,
      );
      await writeAccessLog({ documentId: doc.id, userId: actor.username, action: 'download', ipAddress });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${doc.documentNumber}.pdf"`);
      return res.send(stampedPdf);
    }

    const filePath = resolveControlledDocumentFile(authoritativeFilePath);
    if (!filePath) {
      return res.status(422).json({ error: 'Document file path is not a supported app-accessible location' });
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Document file is not accessible from this server' });
    }

    // Write download access log entry before sending the file
    await writeAccessLog({ documentId: doc.id, userId: actor.username, action: 'download', ipAddress });

    if (path.extname(filePath).toLowerCase() === '.pdf') {
      const buffer = await fs.readFile(filePath);
      if (revision) await verifyStoredRevision(doc.id, revision, authoritativeFilePath, buffer, req);
      const stampedPdf = await addControlledDocumentFooter(buffer, doc, revision!);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      return res.send(stampedPdf);
    }

    // Send file with appropriate content type
    const buffer = await fs.readFile(filePath);
    if (revision) await verifyStoredRevision(doc.id, revision, authoritativeFilePath, buffer, req);
    res.setHeader('Content-Type', revision?.mediaType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${revision?.fileName || path.basename(filePath)}"`);
    res.send(buffer);
  } catch (error) {
    sendLifecycleError(res, error, 'Failed to download document');
  }
};

// These former handlers are intentionally unregistered; controlled-use routes below
// replace them with a single released-revision implementation.
void legacyViewHandler;
void legacyDownloadHandler;

const serveReleasedControlledDocument = (mode: 'view' | 'download') => async (req: Request, res: Response) => {
  try {
    const state = await getControlledDocumentState(req.params.id);
    const actor = await authorizeControlledDocumentAccess(req, state.document);
    const revision = await getReleasedRevisionForControlledUse(req, state.document, state.revisions);
    if (!revision.filePath) {
      throw new ControlledDocumentError(422, 'RELEASED_REVISION_FILE_NOT_FOUND', 'The released revision has no immutable file attached');
    }
    if (getExternalRedirectUrl(revision.filePath)) {
      throw new ControlledDocumentError(422, 'IMMUTABLE_REVISION_FILE_REQUIRED', 'External references cannot be used for controlled View or Download; upload an immutable verified copy');
    }

    const buffer = await readControlledDocumentBytes(revision.filePath);
    await verifyStoredRevision(state.document.id, revision, revision.filePath, buffer, req);
    const isPdf = revision.mediaType === 'application/pdf'
      || revision.fileName?.toLowerCase().endsWith('.pdf')
      || revision.filePath.toLowerCase().endsWith('.pdf');
    if (mode === 'view' && !isPdf) {
      throw new ControlledDocumentError(415, 'PDF_VIEW_REQUIRED', 'Only released PDF revisions can be viewed inline');
    }
    const responseBytes = isPdf
      ? await addControlledDocumentFooter(buffer, state.document, revision)
      : buffer;
    await writeAccessLog({
      documentId: state.document.id,
      userId: actor.username,
      action: mode,
      ipAddress: requestEvidence(req).ipAddress ?? 'unknown',
    });
    const filename = revision.fileName || `${state.document.documentNumber}-${revision.versionNumber}${isPdf ? '.pdf' : ''}`;
    res.setHeader('Content-Type', isPdf ? 'application/pdf' : revision.mediaType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${mode === 'view' ? 'inline' : 'attachment'}; filename="${path.basename(filename)}"`);
    res.send(responseBytes);
  } catch (error) {
    sendLifecycleError(res, error, `Failed to ${mode} released controlled document`);
  }
};

router.get('/:id/view', requireAuth, requirePermission('documents.view'), requireStepUp(), serveReleasedControlledDocument('view'));
router.get('/:id/download', requireAuth, requirePermission('documents.view'), requireStepUp(), serveReleasedControlledDocument('download'));

// Delete document (admin/owner only)
router.delete('/:id', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const [doc] = await db
      .select()
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await recordRejectedHardDelete({
      documentId: doc.id,
      actor: lifecycleActor(req),
      request: requestEvidence(req),
    });

    res.status(410).json({
      error: 'HARD_DELETE_DISABLED',
      message: doc.lifecycleStatus === 'RELEASED' || doc.currentReleasedRevisionId
        ? 'Controlled documents and revision history cannot be deleted. Use the authorized Obsolete action.'
        : 'Controlled documents and revision history cannot be deleted. Use the authorized Void action.',
      lifecycleStatus: doc.lifecycleStatus,
    });
  } catch (error) {
    sendLifecycleError(res, error, 'Failed to reject controlled document hard deletion');
  }
});

// CSV Import (admin/owner/document managers only)
router.post('/import/csv', requireDocumentEditor, requirePermission('documents.number_admin'), csvUpload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user!;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    // Convert buffer to string (file is stored in memory)
    const fileContent = req.file.buffer.toString('utf-8');
    
    // Parse CSV
    const parseResult = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    });

    if (parseResult.errors.length > 0) {
      console.error('CSV parsing errors:', parseResult.errors);
      return res.status(400).json({ 
        error: 'CSV parsing failed',
        details: parseResult.errors 
      });
    }

    const rows = parseResult.data as any[];
    
    // Debug: Log the columns we found
    if (rows.length > 0) {
      console.log('CSV Columns found:', Object.keys(rows[0]));
      console.log('First row sample:', rows[0]);
    }
    
    // Skip the first row if it's a title row
    const dataRows = rows[0]?.TITLE?.includes('QMS MASTER LIST') ? rows.slice(1) : rows;
    
    const importResults = {
      success: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Helper function to determine document type from code
    const determineDocumentType = (code: string): string => {
      const upperCode = code?.toUpperCase() || '';
      if (upperCode.includes('POSTER')) return 'POSTER';
      if (upperCode.includes('FORM')) return 'FORM';
      if (upperCode.includes('DOC')) return 'PROCEDURE';
      return 'OTHER';
    };

    const parsedDocuments = [];

    // Process and validate each row before writing so the database work can be batched.
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      try {
        // Skip rows with missing critical data
        if (!row.TITLE || !row.CODE) {
          importResults.skipped++;
          importResults.errors.push(`Row ${i + 2}: Missing TITLE or CODE`);
          continue;
        }

        const documentNumber = String(row.CODE || '').trim();
        const documentName = String(row.TITLE || '').trim();
        const department = String(row.Department || 'General Use').trim();
        const currentVersion = String(row.Version || '1.0').trim();
        const retentionLength = String(row['Record Retention Length'] || 'N/A').trim();
        const description = String(row['Summary of Changes (if needed)'] || '').trim();
        const dateStr = String(row.Date || '').trim();
        const filePath = await normalizeImportedFilePath(row, documentName);
        
        // Parse effective date
        let effectiveDate = null;
        if (dateStr && dateStr !== 'N/A' && dateStr !== 'on-going') {
          try {
            const parsedDate = new Date(dateStr);
            if (!isNaN(parsedDate.getTime())) {
              effectiveDate = parsedDate.toISOString().split('T')[0];
            }
          } catch {
            // Invalid date, leave as null
          }
        }

        const documentType = determineDocumentType(documentNumber);

        // Calculate expiration date (1 year from effective date or now)
        const baseDate = effectiveDate ? new Date(effectiveDate) : new Date();
        const expirationDate = new Date(baseDate);
        expirationDate.setFullYear(expirationDate.getFullYear() + 1);

        parsedDocuments.push({
          documentNumber,
          documentName,
          documentType,
          department,
          currentVersion,
          retentionLength,
          description,
          filePath,
          effectiveDate,
          expirationDate: expirationDate.toISOString().split('T')[0],
          rowNumber: i + 2,
        });
      } catch (error: any) {
        const errorMsg = `Row ${i + 2}: ${error.message}`;
        console.error('CSV import error:', errorMsg);
        importResults.errors.push(errorMsg);
      }
    }

    const seenDocumentNumbers = new Set<string>();
    const importDocuments = parsedDocuments.filter((doc) => {
      if (seenDocumentNumbers.has(doc.documentNumber)) {
        importResults.skipped++;
        importResults.errors.push(`Row ${doc.rowNumber}: Duplicate CODE "${doc.documentNumber}" in import file`);
        return false;
      }
      seenDocumentNumbers.add(doc.documentNumber);
      return true;
    });

    const existingDocuments = importDocuments.length > 0
      ? await db
          .select()
          .from(controlledDocuments)
          .where(inArray(
            controlledDocuments.documentNumber,
            importDocuments.map((doc) => doc.documentNumber)
          ))
      : [];

    const existingByNumber = new Map(existingDocuments.map((doc) => [doc.documentNumber, doc]));
    const documentsToCreate = [];

    for (const doc of importDocuments) {
      const existing = existingByNumber.get(doc.documentNumber);

      if (existing) {
        await db
          .update(controlledDocuments)
          .set({
            retentionLength: doc.retentionLength,
            description: doc.description || existing.description,
            expirationDate: doc.expirationDate,
            updatedAt: new Date(),
          })
          .where(eq(controlledDocuments.id, existing.id));
      } else {
        documentsToCreate.push({
          documentNumber: doc.documentNumber,
          documentName: doc.documentName,
          documentType: doc.documentType,
          department: doc.department,
          currentVersion: doc.currentVersion,
          status: 'draft',
          lifecycleStatus: 'DRAFT',
          numberControlStatus: 'RESERVED',
          retentionLength: doc.retentionLength,
          description: doc.description,
          filePath: doc.filePath,
          effectiveDate: doc.effectiveDate,
          expirationDate: doc.expirationDate,
          createdBy: user.username,
        });
      }

      importResults.success++;
    }

    if (documentsToCreate.length > 0) {
      const newDocs = await db.insert(controlledDocuments).values(documentsToCreate).returning();

      for (const newDoc of newDocs) {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`document-number:${newDoc.documentNumber.trim().toUpperCase()}`}))`);
          await tx.insert(controlledDocumentNumberRegistry).values({
            normalizedNumber: newDoc.documentNumber.trim().toUpperCase(),
            displayNumber: newDoc.documentNumber.trim(),
            controlledDocumentId: newDoc.id,
            status: 'RESERVED',
          });
          const [revision] = await tx.insert(documentVersionHistory).values({
            documentId: newDoc.id,
            versionNumber: newDoc.currentVersion,
            revisionSequence: 1,
            lifecycleStatus: 'DRAFT',
            changeDescription: newDoc.description || 'Imported from CSV',
            revisionReason: 'Imported from CSV; legacy file checksum requires verification',
            changeType: 'major',
            status: 'draft',
            createdBy: user.username,
            filePath: newDoc.filePath,
            checksumStatus: newDoc.filePath ? 'PENDING_BACKFILL' : 'NOT_APPLICABLE',
            effectiveDate: newDoc.effectiveDate,
            expirationDate: newDoc.expirationDate,
            metadata: { provenance: 'LEGACY_CSV_IMPORT' },
          }).returning();
          await tx.update(controlledDocuments).set({
            currentRevisionId: revision.id,
            workingDraftRevisionId: revision.id,
          }).where(eq(controlledDocuments.id, newDoc.id));
        });
      }
    }

    // Log final results
    console.log('CSV Import Results:', {
      total: dataRows.length,
      success: importResults.success,
      skipped: importResults.skipped,
      errors: importResults.errors.length,
      firstFewErrors: importResults.errors.slice(0, 5)
    });

    res.json({
      message: 'CSV import completed',
      results: importResults,
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

export default router;
