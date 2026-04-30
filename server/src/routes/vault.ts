import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdminOrOwner } from '../../middleware/auth';
import { db } from '../../db';
import { vaultDocuments, vaultDocumentGrants as vaultAccessGrants, controlledDocuments } from '../../schema';
import { eq, and, desc } from 'drizzle-orm';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import { ObjectStorageService, ObjectNotFoundError } from '../../replit_integrations/object_storage';
import { buildAclPolicyMetadata, ObjectPermission, ObjectAccessGroupType, ObjectAclPolicy } from '../../replit_integrations/object_storage/objectAcl';
import { pool } from '../../db';
import { auditService } from '../services/auditService';
import {
  DOCUMENT_DOWNLOAD,
  DOCUMENT_UPLOAD,
  DOCUMENT_ACL_CHANGE,
  DOCUMENT_DELETE,
  DOCUMENT_ACCESS_DENIED,
} from '../constants/audit';
import type { File } from '@google-cloud/storage';
import { z } from 'zod';

const router = Router();
const objectStorage = new ObjectStorageService();

const CONTROLLED_CLASSIFICATIONS = ['cui', 'itar'];
const VALID_CLASSIFICATIONS = ['public', 'internal', 'cui', 'itar'] as const;
const META_CLASSIFICATION = 'custom:classification';
const META_SCOPE_TYPE = 'custom:scopeType';
const META_SCOPE_VALUE = 'custom:scopeValue';

// ─── Metadata Resolution ──────────────────────────────────────────────────────

/**
 * Resolve effective classification/scope from object metadata.
 * Object metadata is the durable authority for classification; the DB record is the fallback.
 */
async function resolveEffectiveClassification(
  objectFile: File,
  dbFallback: { classification: string; scopeType: string; scopeValue: string | null }
): Promise<{ classification: string; scopeType: string; scopeValue: string | null }> {
  try {
    const [meta] = await objectFile.getMetadata();
    const customMeta: Record<string, string> = (meta?.metadata as Record<string, string>) || {};
    const classification = customMeta[META_CLASSIFICATION] || dbFallback.classification;
    const scopeType = customMeta[META_SCOPE_TYPE] || dbFallback.scopeType;
    const scopeValue = customMeta[META_SCOPE_VALUE] || dbFallback.scopeValue || null;
    return { classification, scopeType, scopeValue };
  } catch (metaErr) {
    console.warn('[vault] Could not read object metadata for classification, using DB fallback:', metaErr);
    return dbFallback;
  }
}

// ─── Access Helpers ───────────────────────────────────────────────────────────

async function isUserInScope(userId: number, scopeType: string, scopeValue: string | null): Promise<boolean> {
  if (scopeType === 'global') return true;
  if (!scopeValue) return false;

  if (scopeType === 'project') {
    const rows = await pool.query(
      `SELECT 1 FROM perm_user_capability_scopes
       WHERE user_id = $1 AND scope_type = 'PROJECT' AND project_id = $2 LIMIT 1`,
      [userId, scopeValue]
    );
    return (rows as any[]).length > 0;
  }

  if (scopeType === 'department') {
    const rows = await pool.query(
      `SELECT 1 FROM perm_user_capability_scopes
       WHERE user_id = $1 AND scope_type = 'DEPARTMENT' AND department = $2 LIMIT 1`,
      [userId, scopeValue]
    );
    return (rows as any[]).length > 0;
  }

  return false;
}

async function userHasDocumentGrant(userId: number, documentId: number): Promise<boolean> {
  const rows = await db
    .select({ id: vaultAccessGrants.id })
    .from(vaultAccessGrants)
    .where(and(eq(vaultAccessGrants.documentId, documentId), eq(vaultAccessGrants.grantedToUserId, userId)))
    .limit(1);
  return rows.length > 0;
}

async function isDocumentInScope(
  userId: number,
  userRole: string | undefined,
  doc: { scopeType: string; scopeValue: string | null; uploaderUserId: number }
): Promise<boolean> {
  if (userRole === 'ADMIN' || userRole === 'OWNER') return true;
  if (doc.uploaderUserId === userId) return true;
  return isUserInScope(userId, doc.scopeType, doc.scopeValue);
}

async function canUserAccessDocument(
  userId: number,
  userRole: string | undefined,
  doc: { id: number; classification: string; scopeType: string; scopeValue: string | null; uploaderUserId: number }
): Promise<boolean> {
  if (userRole === 'ADMIN' || userRole === 'OWNER') return true;
  if (doc.uploaderUserId === userId) return true;

  if (doc.scopeType !== 'global') {
    const inScope = await isUserInScope(userId, doc.scopeType, doc.scopeValue);
    if (!inScope) return false;
  }

  if (!CONTROLLED_CLASSIFICATIONS.includes(doc.classification)) return true;

  return userHasDocumentGrant(userId, doc.id);
}

/**
 * Build ACL rules for the object based on classification and scope.
 *
 * CUI / ITAR (controlled): only USER_LIST is added. Scope-based (PROJECT/DEPARTMENT)
 * rules are deliberately excluded so that scope membership alone cannot grant access —
 * an explicit vault_access_grant is required. This prevents the OR-composition bypass
 * where a scoped user could read a controlled document without an explicit grant.
 *
 * Public / Internal (non-controlled): PROJECT/DEPARTMENT rules are included so that
 * scoped users can access documents within their project/department without needing
 * an individual grant.
 */
function buildAclRules(scopeType: string, scopeValue: string | null, docId: number, classification: string) {
  const rules: Array<{ group: { type: ObjectAccessGroupType; id: string }; permission: ObjectPermission }> = [];

  const isControlled = CONTROLLED_CLASSIFICATIONS.includes(classification);

  if (!isControlled) {
    if (scopeType === 'project' && scopeValue) {
      rules.push({ group: { type: ObjectAccessGroupType.PROJECT, id: scopeValue }, permission: ObjectPermission.READ });
    }
    if (scopeType === 'department' && scopeValue) {
      rules.push({ group: { type: ObjectAccessGroupType.DEPARTMENT, id: scopeValue }, permission: ObjectPermission.READ });
    }
  }

  rules.push({ group: { type: ObjectAccessGroupType.USER_LIST, id: String(docId) }, permission: ObjectPermission.READ });

  return rules;
}

function sanitizeDoc<T extends { objectPath: string }>(doc: T): Omit<T, 'objectPath'> {
  const { objectPath, ...rest } = doc;
  return rest;
}

// ─── Routes: vault_documents (CUI/ITAR object-storage vault) ─────────────────

/**
 * GET /api/vault/documents
 * - Out-of-scope documents completely hidden.
 * - CUI/ITAR in scope without grant: shown with canAccess=false (denied state visible).
 * - objectPath never returned to clients.
 */
router.get('/documents', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const allDocs = await db
      .select()
      .from(vaultDocuments)
      .orderBy(desc(vaultDocuments.createdAt));

    const result: any[] = [];

    for (const doc of allDocs) {
      const inScope = await isDocumentInScope(user.id, user.role, doc);
      if (!inScope) continue;

      const canAccess = await canUserAccessDocument(user.id, user.role, doc);

      result.push({
        ...sanitizeDoc(doc),
        isControlled: CONTROLLED_CLASSIFICATIONS.includes(doc.classification),
        canAccess,
      });
    }

    res.json(result);
  } catch (err: any) {
    console.error('[vault] list error:', err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

/**
 * POST /api/vault/documents/request-upload
 * Returns a presigned PUT URL. objectPath goes back to the uploader only at upload time.
 */
router.post('/documents/request-upload', authenticateToken, async (req, res) => {
  try {
    const { name, contentType, fileSizeBytes } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const uploadURL = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);

    res.json({ uploadURL, objectPath, metadata: { name, contentType, fileSizeBytes } });
  } catch (err: any) {
    console.error('[vault] request-upload error:', err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

/**
 * POST /api/vault/documents
 * Register a document after the PUT completes. Sets ACL policy and writes
 * classification/scope durably into object metadata. Returns doc without objectPath.
 */
router.post('/documents', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const { name, description, objectPath, classification, scopeType, scopeValue, contentType, fileSizeBytes } = req.body;

    if (!name || !objectPath || !classification) {
      return res.status(400).json({ error: 'name, objectPath, and classification are required' });
    }

    if (!VALID_CLASSIFICATIONS.includes(classification)) {
      return res.status(400).json({ error: `Invalid classification. Must be one of: ${VALID_CLASSIFICATIONS.join(', ')}` });
    }

    const snap = await resolveUserSnapshot(user.id);
    const effectiveScopeType = scopeType || 'global';
    const effectiveScopeValue = effectiveScopeType !== 'global' ? (scopeValue || null) : null;

    const [doc] = await db.insert(vaultDocuments).values({
      name,
      description: description || null,
      objectPath,
      classification,
      scopeType: effectiveScopeType,
      scopeValue: effectiveScopeValue,
      contentType: contentType || 'application/octet-stream',
      fileSizeBytes: fileSizeBytes || null,
      uploaderUserId: snap.userId,
      uploaderDisplayName: snap.displayName,
    }).returning();

    // Write ACL policy and classification/scope into object metadata in a single consolidated
    // setMetadata call so GCS does not patch-overwrite the custom:aclPolicy key.
    // If this fails, roll back the DB record — partial state is not acceptable for CUI/ITAR docs.
    try {
      const objectFile = await objectStorage.getObjectEntityFile(doc.objectPath);

      const [exists] = await objectFile.exists();
      if (!exists) throw new Error(`Object not found at path: ${doc.objectPath}`);

      const visibility = classification === 'public' ? 'public' : 'private';
      const aclRules = buildAclRules(effectiveScopeType, effectiveScopeValue, doc.id, classification);
      const aclPolicy: ObjectAclPolicy = { owner: String(user.id), visibility, aclRules };

      await objectFile.setMetadata({
        metadata: {
          ...buildAclPolicyMetadata(aclPolicy),
          [META_CLASSIFICATION]: classification,
          [META_SCOPE_TYPE]: effectiveScopeType,
          [META_SCOPE_VALUE]: effectiveScopeValue || '',
        },
      });
    } catch (aclErr) {
      console.error('[vault] Failed to set ACL/metadata — rolling back document record:', aclErr);
      await db.delete(vaultDocuments).where(eq(vaultDocuments.id, doc.id)).catch((rollbackErr) => {
        console.error('[vault] Rollback failed — orphaned document record:', doc.id, rollbackErr);
      });
      return res.status(503).json({
        error: 'Document upload failed: could not durably store classification metadata. Please retry.',
      });
    }

    // Log successful upload
    try {
      await auditService.logEvent({
        entityType: 'vault_document',
        entityId: String(doc.id),
        action: DOCUMENT_UPLOAD,
        actor: { id: user.id, username: user.username, role: user.role },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        meta: {
          documentName: doc.name,
          documentKey: doc.objectPath,
          classification,
          scopeType: effectiveScopeType,
          scopeValue: effectiveScopeValue,
          contentType: doc.contentType,
          fileSizeBytes: doc.fileSizeBytes,
        },
      });
    } catch (auditErr) {
      console.error('[vault] Failed to emit upload audit event:', auditErr);
    }

    res.status(201).json(sanitizeDoc(doc));
  } catch (err: any) {
    console.error('[vault] create document error:', err);
    res.status(500).json({ error: 'Failed to register document' });
  }
});

/**
 * GET /api/vault/documents/:id
 */
router.get('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const docId = parseInt(req.params.id);
    if (isNaN(docId)) return res.status(400).json({ error: 'Invalid document id' });

    const [doc] = await db.select().from(vaultDocuments).where(eq(vaultDocuments.id, docId)).limit(1);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const inScope = await isDocumentInScope(user.id, user.role, doc);
    if (!inScope) return res.status(403).json({ error: 'Access denied', reason: 'out_of_scope' });

    const canAccess = await canUserAccessDocument(user.id, user.role, doc);
    res.json({
      ...sanitizeDoc(doc),
      canAccess,
      isControlled: CONTROLLED_CLASSIFICATIONS.includes(doc.classification),
    });
  } catch (err: any) {
    console.error('[vault] get document error:', err);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

/**
 * GET /api/vault/documents/:id/download
 *
 * Secure download flow:
 * 1. Resolve effective classification/scope from object metadata (DB fallback).
 * 2. Enforce access check against the resolved classification/scope.
 * 3. On denial: emit auditService.logEvent('vault.download_denied') + write object_access_log → 403.
 * 4. On success: generate a presigned GET URL.
 */
router.get('/documents/:id/download', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const docId = parseInt(req.params.id);
    if (isNaN(docId)) return res.status(400).json({ error: 'Invalid document id' });

    const [doc] = await db.select().from(vaultDocuments).where(eq(vaultDocuments.id, docId)).limit(1);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const ipAddress = (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req as any).socket?.remoteAddress ||
      'unknown'
    );

    let effectiveClassification = doc.classification;
    let effectiveScopeType = doc.scopeType;
    let effectiveScopeValue = doc.scopeValue;
    let objectFile: any = null;

    try {
      objectFile = await objectStorage.getObjectEntityFile(doc.objectPath);
      const resolved = await resolveEffectiveClassification(objectFile, {
        classification: doc.classification,
        scopeType: doc.scopeType,
        scopeValue: doc.scopeValue,
      });
      effectiveClassification = resolved.classification;
      effectiveScopeType = resolved.scopeType;
      effectiveScopeValue = resolved.scopeValue;
    } catch (storageErr) {
      if (storageErr instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: 'File not found in storage' });
      }
      console.warn('[vault] Could not read object metadata, using DB classification:', storageErr);
    }

    const allowed = await canUserAccessDocument(user.id, user.role, {
      id: doc.id,
      classification: effectiveClassification,
      scopeType: effectiveScopeType,
      scopeValue: effectiveScopeValue,
      uploaderUserId: doc.uploaderUserId,
    });

    if (!allowed) {
      try {
        await auditService.logEvent({
          entityType: 'vault_document',
          entityId: String(docId),
          action: DOCUMENT_ACCESS_DENIED,
          actor: { id: user.id, username: user.username, role: user.role },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          meta: {
            documentName: doc.name,
            documentKey: doc.objectPath,
            classification: effectiveClassification,
            scopeType: effectiveScopeType,
            scopeValue: effectiveScopeValue,
            reason: 'insufficient_access',
            ipAddress,
          },
        });
      } catch (auditErr) {
        console.error('[vault] Failed to emit access-denied audit event:', auditErr);
      }

      return res.status(403).json({
        error: 'Access denied',
        reason: 'permission_denied',
        classification: effectiveClassification,
      });
    }

    if (!objectFile) {
      objectFile = await objectStorage.getObjectEntityFile(doc.objectPath);
    }
    const downloadUrl = await objectStorage.getObjectEntityDownloadURL(objectFile, 900);

    // Log successful download
    try {
      await auditService.logEvent({
        entityType: 'vault_document',
        entityId: String(docId),
        action: DOCUMENT_DOWNLOAD,
        actor: { id: user.id, username: user.username, role: user.role },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        meta: {
          documentName: doc.name,
          documentKey: doc.objectPath,
          classification: effectiveClassification,
          scopeType: effectiveScopeType,
          scopeValue: effectiveScopeValue,
        },
      });
    } catch (auditErr) {
      console.error('[vault] Failed to emit download audit event:', auditErr);
    }

    res.json({
      downloadUrl,
      expiresIn: 900,
      filename: doc.name,
      contentType: doc.contentType,
    });
  } catch (err: any) {
    console.error('[vault] download error:', err);
    if (err instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: 'File not found in storage' });
    }
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate download link' });
    }
  }
});

/**
 * DELETE /api/vault/documents/:id — permanently delete a document (admin only)
 *
 * Audit log is written BEFORE deletion so the record survives even if the
 * storage delete step fails (storage objects may be cleaned up separately).
 */
router.delete('/documents/:id', authenticateToken, requireAdminOrOwner, async (req, res) => {
  try {
    const user = (req as any).user;
    const docId = parseInt(req.params.id);
    if (isNaN(docId)) return res.status(400).json({ error: 'Invalid document id' });

    const [doc] = await db.select().from(vaultDocuments).where(eq(vaultDocuments.id, docId)).limit(1);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Emit DOCUMENT_DELETE BEFORE deletion so the event is always persisted
    try {
      await auditService.logEvent({
        entityType: 'vault_document',
        entityId: String(docId),
        action: DOCUMENT_DELETE,
        actor: { id: user.id, username: user.username, role: user.role },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        meta: {
          documentName: doc.name,
          documentKey: doc.objectPath,
          classification: doc.classification,
          scopeType: doc.scopeType,
          scopeValue: doc.scopeValue,
        },
      });
    } catch (auditErr) {
      console.error('[vault] Failed to emit delete audit event:', auditErr);
    }

    // Delete from database first; storage cleanup follows best-effort
    await db.delete(vaultDocuments).where(eq(vaultDocuments.id, docId));

    // Best-effort storage deletion — failure does not roll back the DB delete
    try {
      const objectFile = await objectStorage.getObjectEntityFile(doc.objectPath);
      await objectFile.delete();
    } catch (storageErr) {
      console.warn('[vault] Storage delete failed — object may be orphaned:', storageErr);
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[vault] delete document error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

/**
 * GET /api/vault/documents/:id/access — list grants (admin only)
 */
router.get('/documents/:id/access', authenticateToken, requireAdminOrOwner, async (req, res) => {
  try {
    const docId = parseInt(req.params.id);
    if (isNaN(docId)) return res.status(400).json({ error: 'Invalid document id' });

    const grants = await db
      .select()
      .from(vaultAccessGrants)
      .where(eq(vaultAccessGrants.documentId, docId))
      .orderBy(desc(vaultAccessGrants.createdAt));

    res.json(grants);
  } catch (err: any) {
    console.error('[vault] list grants error:', err);
    res.status(500).json({ error: 'Failed to list access grants' });
  }
});

/**
 * POST /api/vault/documents/:id/access — grant access (admin only)
 */
router.post('/documents/:id/access', authenticateToken, requireAdminOrOwner, async (req, res) => {
  try {
    const user = (req as any).user;
    const docId = parseInt(req.params.id);
    if (isNaN(docId)) return res.status(400).json({ error: 'Invalid document id' });

    const { grantedToUserId } = req.body;
    if (!grantedToUserId) return res.status(400).json({ error: 'grantedToUserId is required' });

    const [doc] = await db.select().from(vaultDocuments).where(eq(vaultDocuments.id, docId)).limit(1);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const targetSnap = await resolveUserSnapshot(parseInt(grantedToUserId));
    const adminSnap = await resolveUserSnapshot(user.id);

    const [grant] = await db.insert(vaultAccessGrants).values({
      documentId: docId,
      grantedToUserId: targetSnap.userId,
      grantedToDisplayName: targetSnap.displayName,
      grantedByUserId: adminSnap.userId,
      grantedByDisplayName: adminSnap.displayName,
    }).onConflictDoNothing().returning();

    if (!grant) {
      return res.status(409).json({ error: 'Access already granted to this user' });
    }

    try {
      const objectFile = await objectStorage.getObjectEntityFile(doc.objectPath);
      const aclRules = buildAclRules(doc.scopeType, doc.scopeValue, docId, doc.classification);
      const visibility = doc.classification === 'public' ? 'public' : 'private';
      const aclPolicy: ObjectAclPolicy = { owner: String(doc.uploaderUserId), visibility, aclRules };
      await objectFile.setMetadata({
        metadata: {
          ...buildAclPolicyMetadata(aclPolicy),
          [META_CLASSIFICATION]: doc.classification,
          [META_SCOPE_TYPE]: doc.scopeType,
          [META_SCOPE_VALUE]: doc.scopeValue || '',
        },
      });
    } catch { /* storage may be unavailable — grant is already recorded in DB */ }

    // Log ACL change
    try {
      await auditService.logEvent({
        entityType: 'vault_document',
        entityId: String(docId),
        action: DOCUMENT_ACL_CHANGE,
        actor: { id: user.id, username: user.username, role: user.role },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        meta: {
          documentName: doc.name,
          documentKey: doc.objectPath,
          classification: doc.classification,
          changeType: 'grant',
          grantedToUserId: targetSnap.userId,
          grantedToDisplayName: targetSnap.displayName,
        },
      });
    } catch (auditErr) {
      console.error('[vault] Failed to emit ACL change audit event:', auditErr);
    }

    res.status(201).json(grant);
  } catch (err: any) {
    console.error('[vault] grant access error:', err);
    res.status(500).json({ error: 'Failed to grant access' });
  }
});

/**
 * DELETE /api/vault/access/:grantId — revoke an access grant (admin only)
 */
router.delete('/access/:grantId', authenticateToken, requireAdminOrOwner, async (req, res) => {
  try {
    const user = (req as any).user;
    const grantId = parseInt(req.params.grantId);
    if (isNaN(grantId)) return res.status(400).json({ error: 'Invalid grant id' });

    // Fetch grant and document info before deleting for audit log
    const [grant] = await db.select().from(vaultAccessGrants).where(eq(vaultAccessGrants.id, grantId)).limit(1);

    await db.delete(vaultAccessGrants).where(eq(vaultAccessGrants.id, grantId));

    // Log ACL revoke
    if (grant) {
      try {
        const [doc] = await db.select().from(vaultDocuments).where(eq(vaultDocuments.id, grant.documentId)).limit(1);
        await auditService.logEvent({
          entityType: 'vault_document',
          entityId: String(grant.documentId),
          action: DOCUMENT_ACL_CHANGE,
          actor: { id: user.id, username: user.username, role: user.role },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          meta: {
            documentName: doc?.name ?? null,
            documentKey: doc?.objectPath ?? null,
            classification: doc?.classification ?? null,
            changeType: 'revoke',
            revokedFromUserId: grant.grantedToUserId,
            revokedFromDisplayName: grant.grantedToDisplayName,
          },
        });
      } catch (auditErr) {
        console.error('[vault] Failed to emit ACL revoke audit event:', auditErr);
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[vault] revoke access error:', err);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

/**
 * GET /api/vault/users — list active users for the access picker (admin only)
 */
router.get('/users', authenticateToken, requireAdminOrOwner, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT u.id, u.username, u.first_name as "firstName", u.last_name as "lastName", u.role
       FROM users u WHERE u.is_active = true ORDER BY u.username`
    ) as any[];
    res.json(rows.map((r: any) => ({
      id: r.id,
      username: r.username,
      displayName: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.username,
      role: r.role,
    })));
  } catch (err: any) {
    console.error('[vault] list users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// ─── CMMC Audit: writeAccessLog export (used by controlledDocuments.ts) ──────

/**
 * Write an immutable access log entry to object_access_log.
 * Throws on failure — never silently discards.
 * Used by the controlled documents download route for per-download audit trails.
 */
export async function writeAccessLog({
  documentId,
  userId,
  action,
  ipAddress,
}: {
  documentId: string;
  userId: string;
  action: 'view' | 'download' | 'denied';
  ipAddress?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO object_access_log (document_id, user_id, action, ip_address) VALUES ($1, $2, $3, $4)`,
      [documentId, userId, action, ipAddress ?? null]
    );
  } catch (err) {
    console.error('[Vault] Failed to write access log entry — NOT discarding:', { documentId, userId, action, err });
    throw err;
  }
}

/**
 * Check if a user/role has an explicit vault_access_grant for a controlled_document.
 * Used by the controlled documents download route for ACL enforcement.
 */
export async function hasVaultGrant(documentId: string, username: string, role: string): Promise<boolean> {
  try {
    const rows = await pool.query<{ id: number }>(
      `SELECT id FROM vault_access_grants WHERE document_id = $1 AND (
         (grantee_type = 'user' AND grantee_name = $2)
         OR (grantee_type = 'role' AND grantee_name = $3)
       ) LIMIT 1`,
      [documentId, username, role]
    );
    return (rows as any[]).length > 0;
  } catch {
    return false;
  }
}

// ─── Routes: controlled_documents classification + grant admin (Task #1034) ───
// Served under /api/vault/controlled/… to avoid collisions with vault_documents above.

/**
 * GET /api/vault/controlled — list controlled_documents with classification + last access
 */
router.get('/controlled', authenticateToken, requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const rows = await pool.query<{
      id: string;
      document_number: string;
      document_name: string;
      document_type: string;
      department: string;
      status: string;
      classification: string;
      file_path: string | null;
      created_by: string;
      created_at: string;
      updated_at: string;
      last_accessed: string | null;
      access_count: string;
    }>(`
      SELECT
        cd.id,
        cd.document_number,
        cd.document_name,
        cd.document_type,
        cd.department,
        cd.status,
        cd.classification,
        cd.file_path,
        cd.created_by,
        cd.created_at,
        cd.updated_at,
        MAX(oal.accessed_at) AS last_accessed,
        COUNT(oal.id) AS access_count
      FROM controlled_documents cd
      LEFT JOIN object_access_log oal ON oal.document_id = cd.id
      GROUP BY cd.id
      ORDER BY cd.document_name ASC
    `);
    return res.json(rows);
  } catch (err) {
    console.error('[Vault] GET /controlled error:', err);
    return res.status(500).json({ error: 'Failed to fetch vault documents' });
  }
});

/**
 * GET /api/vault/controlled/:id — single controlled document with grants
 */
router.get('/controlled/:id', authenticateToken, requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const [doc] = await db.select().from(controlledDocuments).where(eq(controlledDocuments.id, req.params.id));
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const grants = await pool.query(
      `SELECT id, grantee_type, grantee_name, granted_by, granted_at FROM vault_access_grants WHERE document_id = $1 ORDER BY granted_at DESC`,
      [req.params.id]
    );

    return res.json({ ...doc, grants });
  } catch (err) {
    console.error('[Vault] GET /controlled/:id error:', err);
    return res.status(500).json({ error: 'Failed to fetch vault document' });
  }
});

/**
 * PUT /api/vault/controlled/:id/classification — update classification on a controlled_document
 */
const updateClassificationSchema = z.object({
  classification: z.enum(['public', 'internal', 'restricted', 'classified']),
});

router.put('/controlled/:id/classification', authenticateToken, requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user.username;
    const input = updateClassificationSchema.parse(req.body);

    const [existing] = await db.select({ id: controlledDocuments.id })
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));
    if (!existing) return res.status(404).json({ error: 'Document not found' });

    const [updated] = await db
      .update(controlledDocuments)
      .set({ classification: input.classification, updatedAt: new Date() })
      .where(eq(controlledDocuments.id, req.params.id))
      .returning();

    console.log(`[Vault] Classification updated: doc=${req.params.id} classification=${input.classification} by=${actor}`);
    return res.json(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error('[Vault] PUT /controlled/:id/classification error:', err);
    return res.status(500).json({ error: 'Failed to update classification' });
  }
});

/**
 * POST /api/vault/controlled/:id/grants — add a user or role grant for a controlled_document
 */
const addGrantSchema = z.object({
  granteeType: z.enum(['user', 'role']),
  granteeName: z.string().min(1),
});

router.post('/controlled/:id/grants', authenticateToken, requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user.username;
    const input = addGrantSchema.parse(req.body);

    const [existing] = await db.select({ id: controlledDocuments.id })
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, req.params.id));
    if (!existing) return res.status(404).json({ error: 'Document not found' });

    const dup = await pool.query(
      `SELECT id FROM vault_access_grants WHERE document_id = $1 AND grantee_type = $2 AND grantee_name = $3`,
      [req.params.id, input.granteeType, input.granteeName]
    );
    if ((dup as any[]).length > 0) {
      return res.status(409).json({ error: 'Grant already exists for this grantee' });
    }

    const [grant] = await pool.query<any>(
      `INSERT INTO vault_access_grants (document_id, grantee_type, grantee_name, granted_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, input.granteeType, input.granteeName, actor]
    );

    return res.status(201).json(grant);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error('[Vault] POST /controlled/:id/grants error:', err);
    return res.status(500).json({ error: 'Failed to add grant' });
  }
});

/**
 * DELETE /api/vault/controlled/:id/grants/:grantId — remove a grant from a controlled_document
 */
router.delete('/controlled/:id/grants/:grantId', authenticateToken, requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM vault_access_grants WHERE id = $1 AND document_id = $2 RETURNING id`,
      [parseInt(req.params.grantId), req.params.id]
    );
    if (!result || (result as any[]).length === 0) {
      return res.status(404).json({ error: 'Grant not found' });
    }
    return res.json({ message: 'Grant removed' });
  } catch (err) {
    console.error('[Vault] DELETE /controlled/:id/grants/:grantId error:', err);
    return res.status(500).json({ error: 'Failed to remove grant' });
  }
});

/**
 * GET /api/vault/access-log — filterable immutable access log (Task #1034)
 * Filters: documentId, userId, action, dateFrom, dateTo, limit, offset
 */
router.get('/access-log', authenticateToken, requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const { documentId, userId, action, dateFrom, dateTo } = req.query;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const conditions: string[] = [];
    const params: any[] = [];

    if (documentId) {
      params.push(documentId);
      conditions.push(`oal.document_id = $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      conditions.push(`oal.user_id ILIKE $${params.length}`);
    }
    if (action) {
      params.push(action);
      conditions.push(`oal.action = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      conditions.push(`oal.accessed_at >= $${params.length}`);
    }
    if (dateTo) {
      params.push(dateTo);
      conditions.push(`oal.accessed_at <= $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM object_access_log oal ${where}`,
      params
    );
    const total = parseInt((countRows as any[])[0]?.total ?? '0');

    params.push(limit);
    params.push(offset);

    const rows = await pool.query(
      `SELECT
         oal.id,
         oal.document_id,
         oal.user_id,
         oal.action,
         oal.ip_address,
         oal.accessed_at,
         cd.document_name,
         cd.document_number,
         cd.classification
       FROM object_access_log oal
       LEFT JOIN controlled_documents cd ON cd.id = oal.document_id
       ${where}
       ORDER BY oal.accessed_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ entries: rows, total, limit, offset });
  } catch (err) {
    console.error('[Vault] GET /access-log error:', err);
    return res.status(500).json({ error: 'Failed to fetch access log' });
  }
});

export default router;
