import { Router, Request, Response } from 'express';
import { insertVendorSchema, insertVendorContactSchema } from '@shared/schema';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';

import { storage } from '../../storage';
import { db } from '../../db';
import { authenticateToken } from '../../middleware/auth';
import { authorizeApiRoute } from '../../middleware/routeAuthorization';
import {
  ObjectNotFoundError,
  objectStorageClient,
} from '../../replit_integrations/object_storage/objectStorage';
import { setObjectAclPolicy } from '../../replit_integrations/object_storage/objectAcl';
import { auditService } from '../services/auditService';
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
  getStorageErrorResponse,
} from '../services/fileStorageProvider';
import {
  insertSupplierAuditSchema,
  insertSupplierScopeSchema,
  insertSupplierScorecardSchema,
  supplierAudits,
  supplierScopes,
  supplierScorecards,
} from '../../schema';

const router = Router();

router.use(authenticateToken);
router.use(authorizeApiRoute());

// Ensure vendor-approvals and vendor-documents directories exist
const uploadsDir = path.join(process.cwd(), 'uploads');
const vendorApprovalsDir = path.join(uploadsDir, 'vendor-approvals');
const vendorDocumentsDir = path.join(uploadsDir, 'vendor-documents');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(vendorApprovalsDir)) {
  fs.mkdirSync(vendorApprovalsDir, { recursive: true });
}

if (!fs.existsSync(vendorDocumentsDir)) {
  fs.mkdirSync(vendorDocumentsDir, { recursive: true });
}

type VendorDocumentPath =
  | { type: 'object'; path: string }
  | { type: 'upload'; path: string }
  | { type: 'external'; url: string };

function isVendorDocumentScope(pathValue: string): boolean {
  return (
    pathValue.includes('/vendor-documents/') ||
    pathValue.includes('/vendor-approvals/') ||
    pathValue.startsWith('vendor-documents/') ||
    pathValue.startsWith('vendor-approvals/')
  );
}

function normalizeVendorDocumentPath(rawValue: unknown): VendorDocumentPath | null {
  const value = String(rawValue || '').trim();
  if (!value) return null;

  if (value.startsWith('https://storage.googleapis.com/')) {
    try {
      const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      const rawPath = new URL(value).pathname;
      const entityDir = privateObjectDir
        ? privateObjectDir.endsWith('/')
          ? privateObjectDir
          : `${privateObjectDir}/`
        : null;

      if (entityDir && rawPath.startsWith(entityDir)) {
        const entityId = rawPath.slice(entityDir.length);
        if (isVendorDocumentScope(entityId)) {
          return { type: 'object', path: `/objects/${entityId}` };
        }
      }
    } catch {
      // Fall through to the direct external redirect below.
    }

    return { type: 'external', url: value };
  }

  const normalized = value.startsWith('objects/') ? `/${value}` : value;
  if (normalized.startsWith('/objects/')) {
    return isVendorDocumentScope(normalized)
      ? { type: 'object', path: normalized }
      : null;
  }

  if (normalized.startsWith('vendor-documents/') || normalized.startsWith('vendor-approvals/')) {
    return { type: 'object', path: `/objects/${normalized}` };
  }

  const uploadPath = normalized.startsWith('uploads/') ? `/${normalized}` : normalized;
  if (
    uploadPath.startsWith('/uploads/vendor-documents/') ||
    uploadPath.startsWith('/uploads/vendor-approvals/')
  ) {
    return { type: 'upload', path: uploadPath };
  }

  return null;
}

async function serveVendorDocumentPath(rawPath: unknown, res: Response): Promise<void> {
  const docPath = normalizeVendorDocumentPath(rawPath);
  if (!docPath) {
    res.status(404).json({ error: 'Vendor document not found' });
    return;
  }

  if (docPath.type === 'external') {
    res.redirect(docPath.url);
    return;
  }

  if (docPath.type === 'upload') {
    const relativePath = docPath.path.replace(/^\/uploads\//, '');
    const absolutePath = path.resolve(uploadsDir, relativePath);
    const uploadsRoot = path.resolve(uploadsDir);
    if (!absolutePath.startsWith(uploadsRoot + path.sep)) {
      res.status(400).json({ error: 'Invalid vendor document path' });
      return;
    }
    res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) {
        res.status((err as any).status || 404).json({ error: 'Vendor document not found' });
      }
    });
    return;
  }

  try {
    await getFileStorageProviderForObjectPath(docPath.path).downloadObject(docPath.path, res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError && !res.headersSent) {
      res.status(404).json({ error: 'Vendor document not found' });
      return;
    }
    throw error;
  }
}

// Configure multer for vendor approval PDFs (memory storage for object storage upload)
const vendorApprovalUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Configure multer for vendor document PDFs (memory storage for object storage upload)
const vendorDocumentUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Helper: parse a GCS bucket path (e.g. /bucket-name/a/b → { bucketName, objectName })
function parseGcsPath(fullPath: string): { bucketName: string; objectName: string } {
  const normalized = fullPath.startsWith('/') ? fullPath : `/${fullPath}`;
  const parts = normalized.split('/');
  return { bucketName: parts[1], objectName: parts.slice(2).join('/') };
}

async function uploadVendorPdfToStorage(file: Express.Multer.File, scope: 'vendor-approvals' | 'vendor-documents') {
  try {
    const provider = getFileStorageProvider();
    const objectPath = await provider.uploadBuffer({
      buffer: file.buffer,
      fileName: file.originalname,
      contentType: 'application/pdf',
      scope,
    });
    await provider.setPublicReadPolicy(objectPath, 'system');

    return {
      url: objectPath,
      filename: objectPath.split('/').pop() || file.originalname,
      originalName: file.originalname,
      size: file.size,
    };
  } catch (error) {
    if (!shouldUseLocalVendorUploadFallback(error)) {
      throw error;
    }

    const result = await saveVendorPdfLocally(file, scope);
    const { reason, message, status } = getStorageErrorResponse(error);
    console.warn('[vendor-upload] Used local upload fallback', {
      scope,
      originalName: file.originalname,
      reason,
      message,
      status,
      localUrl: result.url,
    });

    return result;
  }
}

function shouldUseLocalVendorUploadFallback(error: unknown): boolean {
  const { status, reason } = getStorageErrorResponse(error);
  if ([401, 403, 502, 503].includes(status)) return true;
  return /storage|signing|supabase|missing|unavailable|unauthorized/i.test(reason);
}

async function saveVendorPdfLocally(file: Express.Multer.File, scope: 'vendor-approvals' | 'vendor-documents') {
  const targetDir = scope === 'vendor-approvals' ? vendorApprovalsDir : vendorDocumentsDir;
  const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
  const safeBase = path
    .basename(file.originalname, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 90) || 'vendor-document';
  const filename = `${Date.now()}_${randomUUID()}_${safeBase}${ext}`;
  const absolutePath = path.join(targetDir, filename);

  await fs.promises.writeFile(absolutePath, file.buffer);

  return {
    url: `/uploads/${scope}/${filename}`,
    filename,
    originalName: file.originalname,
    size: file.size,
  };
}

// One-time startup migration: upload legacy local vendor documents to object storage
// and normalize any full GCS URLs already stored in the DB.
//
// Uses a persisted completion flag (vendor_doc_migration_flags table) so that:
//   - On subsequent restarts after full migration, the function exits after a single
//     fast flag lookup — no full vendor table scan.
//   - If new un-migrated records appear (re-upload), the flag is cleared and migration
//     runs again for only those records.
export async function migrateVendorDocumentUrls(): Promise<void> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    console.log('[vendor-doc-migration] PRIVATE_OBJECT_DIR not set — skipping migration');
    return;
  }

  try {
    const alreadyComplete = await storage.getVendorDocMigrationComplete();

    let withDocs = await storage.getVendorsWithUnmigratedDocuments();

    if (alreadyComplete) {
      // Fast path: migration was completed on a previous run.
      // The targeted query above already tells us whether any new un-migrated records exist.
      if (withDocs.length === 0) {
        console.log('[vendor-doc-migration] Migration flag is set and no un-migrated records found — skipping');
        return;
      }
      // New un-migrated records detected (e.g. re-upload); clear the flag and re-run.
      console.log(`[vendor-doc-migration] Found ${withDocs.length} un-migrated record(s) after previous completion — clearing flag and re-running`);
      await storage.setVendorDocMigrationComplete(false);
    }

    if (withDocs.length === 0) {
      console.log('[vendor-doc-migration] No un-migrated vendor documents found — marking complete');
      await storage.setVendorDocMigrationComplete(true);
      return;
    }

    let migrated = 0;
    let normalized = 0;
    let missing = 0;
    let skipped = 0;

    let approvalMigrated = 0;
    let approvalNormalized = 0;
    let approvalMissing = 0;
    let approvalSkipped = 0;

    for (const vendor of withDocs) {
      // --- mainDocumentUrl ---
      const url = vendor.mainDocumentUrl?.trim();
      if (url) {
        // Already in /objects/ format — nothing to do
        if (url.startsWith('/objects/')) {
          skipped++;
        } else if (url.startsWith('https://storage.googleapis.com/')) {
          // Normalize full GCS URL → /objects/ path
          try {
            const parsed = new URL(url);
            const rawPath = parsed.pathname; // /<bucket>/...
            const entityDir = privateObjectDir.endsWith('/') ? privateObjectDir : `${privateObjectDir}/`;
            if (rawPath.startsWith(entityDir)) {
              const entityId = rawPath.slice(entityDir.length);
              const newUrl = `/objects/${entityId}`;
              await storage.updateVendor(vendor.id, { mainDocumentUrl: newUrl });
              normalized++;
              console.log(`[vendor-doc-migration] Normalized GCS URL for vendor ${vendor.id} → ${newUrl}`);
            } else {
              skipped++;
            }
          } catch (e) {
            console.warn(`[vendor-doc-migration] Could not normalize GCS URL for vendor ${vendor.id}: ${e}`);
            skipped++;
          }
        } else if (url.startsWith('/uploads/vendor-documents/')) {
          // Legacy local upload path: /uploads/vendor-documents/<filename>
          const filename = url.split('/').pop() || '';
          const localPath = path.join(process.cwd(), 'uploads', 'vendor-documents', filename);
          if (!fs.existsSync(localPath)) {
            console.warn(`[vendor-doc-migration] Local file missing for vendor ${vendor.id} (${filename}) — clearing dead URL`);
            await storage.updateVendor(vendor.id, { mainDocumentUrl: null });
            missing++;
            try {
              await auditService.logEvent({
                entityType: 'vendor',
                entityId: String(vendor.id),
                action: 'VENDOR_DOCUMENT_CLEARED',
                reason: `Startup migration cleared a missing vendor document (${filename}) for vendor "${vendor.name || vendor.id}". Purchasing staff should re-upload the document.`,
                meta: { vendorName: vendor.name, clearedFilename: filename, clearedUrl: url, source: 'vendor-doc-migration' },
              });
            } catch (auditErr) {
              console.error(`[vendor-doc-migration] Failed to write audit log for vendor ${vendor.id}: ${auditErr}`);
            }
          } else {
            try {
              const buffer = fs.readFileSync(localPath);
              const objectId = randomUUID();
              const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
              const objectKey = `vendor-documents/${objectId}-${safeFilename}`;
              const fullPath = `${privateObjectDir}/${objectKey}`;
              const { bucketName, objectName } = parseGcsPath(fullPath);
              const bucket = objectStorageClient.bucket(bucketName);
              const file = bucket.file(objectName);
              await file.save(buffer, { contentType: 'application/pdf', metadata: { cacheControl: 'public, max-age=86400' } });
              await setObjectAclPolicy(file, { owner: 'system', visibility: 'public' });
              const newUrl = `/objects/${objectKey}`;
              await storage.updateVendor(vendor.id, { mainDocumentUrl: newUrl });
              migrated++;
              console.log(`[vendor-doc-migration] Migrated vendor ${vendor.id} (${vendor.name}) → ${newUrl}`);
            } catch (e) {
              console.error(`[vendor-doc-migration] Failed to migrate vendor ${vendor.id}: ${e}`);
            }
          }
        } else {
          // Unknown format — skip
          skipped++;
        }
      }

      // --- approvalPdfUrl ---
      const approvalUrl = vendor.approvalPdfUrl?.trim();
      if (approvalUrl) {
        // Already in /objects/ format — nothing to do
        if (approvalUrl.startsWith('/objects/')) {
          approvalSkipped++;
        } else if (approvalUrl.startsWith('https://storage.googleapis.com/')) {
          // Normalize full GCS URL → /objects/ path
          try {
            const parsed = new URL(approvalUrl);
            const rawPath = parsed.pathname;
            const entityDir = privateObjectDir.endsWith('/') ? privateObjectDir : `${privateObjectDir}/`;
            if (rawPath.startsWith(entityDir)) {
              const entityId = rawPath.slice(entityDir.length);
              const newUrl = `/objects/${entityId}`;
              await storage.updateVendor(vendor.id, { approvalPdfUrl: newUrl });
              approvalNormalized++;
              console.log(`[vendor-doc-migration] Normalized approval GCS URL for vendor ${vendor.id} → ${newUrl}`);
            } else {
              approvalSkipped++;
            }
          } catch (e) {
            console.warn(`[vendor-doc-migration] Could not normalize approval GCS URL for vendor ${vendor.id}: ${e}`);
            approvalSkipped++;
          }
        } else if (approvalUrl.startsWith('/uploads/vendor-approvals/')) {
          // Legacy local upload path: /uploads/vendor-approvals/<filename>
          const filename = approvalUrl.split('/').pop() || '';
          const localPath = path.join(process.cwd(), 'uploads', 'vendor-approvals', filename);
          if (!fs.existsSync(localPath)) {
            console.warn(`[vendor-doc-migration] Local approval file missing for vendor ${vendor.id} (${filename}) — clearing dead URL`);
            await storage.updateVendor(vendor.id, { approvalPdfUrl: null });
            approvalMissing++;
            try {
              await auditService.logEvent({
                entityType: 'vendor',
                entityId: String(vendor.id),
                action: 'VENDOR_APPROVAL_DOCUMENT_CLEARED',
                reason: `Startup migration cleared a missing vendor approval document (${filename}) for vendor "${vendor.name || vendor.id}". Purchasing staff should re-upload the document.`,
                meta: { vendorName: vendor.name, clearedFilename: filename, clearedUrl: approvalUrl, source: 'vendor-doc-migration' },
              });
            } catch (auditErr) {
              console.error(`[vendor-doc-migration] Failed to write audit log for vendor ${vendor.id}: ${auditErr}`);
            }
          } else {
            try {
              const buffer = fs.readFileSync(localPath);
              const objectId = randomUUID();
              const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
              const objectKey = `vendor-approvals/${objectId}-${safeFilename}`;
              const fullPath = `${privateObjectDir}/${objectKey}`;
              const { bucketName, objectName } = parseGcsPath(fullPath);
              const bucket = objectStorageClient.bucket(bucketName);
              const file = bucket.file(objectName);
              await file.save(buffer, { contentType: 'application/pdf', metadata: { cacheControl: 'public, max-age=86400' } });
              await setObjectAclPolicy(file, { owner: 'system', visibility: 'public' });
              const newUrl = `/objects/${objectKey}`;
              await storage.updateVendor(vendor.id, { approvalPdfUrl: newUrl });
              approvalMigrated++;
              console.log(`[vendor-doc-migration] Migrated approval PDF for vendor ${vendor.id} (${vendor.name}) → ${newUrl}`);
            } catch (e) {
              console.error(`[vendor-doc-migration] Failed to migrate approval PDF for vendor ${vendor.id}: ${e}`);
            }
          }
        } else {
          // Unknown format — skip
          approvalSkipped++;
        }
      }
    }

    console.log(
      `[vendor-doc-migration] mainDocumentUrl — migrated: ${migrated}, normalized: ${normalized}, cleared (local file missing): ${missing}, skipped: ${skipped}`,
    );
    console.log(
      `[vendor-doc-migration] approvalPdfUrl — migrated: ${approvalMigrated}, normalized: ${approvalNormalized}, cleared (local file missing): ${approvalMissing}, skipped: ${approvalSkipped}`,
    );

    await storage.setVendorDocMigrationComplete(true);
    console.log('[vendor-doc-migration] Completion flag saved — migration will be skipped on next startup');
  } catch (err) {
    console.error('[vendor-doc-migration] Migration failed:', err);
  }
}

// Helper function to sync vendor-level scores from annual evaluations
async function syncVendorScoresFromEvaluations(vendorId: number) {
  // Get current year
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Get all evaluations for this vendor
  const allEvaluations = await storage.getVendorMonthlyEvaluations(vendorId);

  // Use any scored evaluation as the source of truth for the evaluated flag so
  // historical vendors with saved scores still show as evaluated on the dashboard.
  const scoredEvaluations = allEvaluations.filter(ev =>
    ev.qualityScore !== null ||
    ev.costScore !== null ||
    ev.deliveryScore !== null ||
    ev.responseScore !== null
  );
  const isEvaluated = scoredEvaluations.length > 0;
  const currentYearEval = allEvaluations.find(ev => ev.year === currentYear && ev.month === 1);
  
  // Get the latest evaluation for displaying scores (not necessarily current month)
  const evaluationsWithScores = allEvaluations.filter(ev => 
    ev.qualityScore !== null || 
    ev.costScore !== null || 
    ev.deliveryScore !== null || 
    ev.responseScore !== null
  ).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
  
  // Keep the current-year evaluation date when present; otherwise preserve the
  // latest scored record date so historical vendors still appear evaluated.
  const evaluationDate = currentYearEval ? `${currentYear}-01-01` : (scoredEvaluations.length > 0 ? `${scoredEvaluations[0].year}-01-01` : null);

  if (evaluationsWithScores.length > 0) {
    const latestEval = evaluationsWithScores[0];
    
    // Update vendor: latest scores but evaluated status and date based on current year record existence
    await storage.updateVendor(vendorId, {
      qualityScore: latestEval.qualityScore,
      costScore: latestEval.costScore,
      deliveryScore: latestEval.deliveryScore,
      responseScore: latestEval.responseScore,
      evaluated: isEvaluated,
      evaluationDate,
    });
  } else if (isEvaluated) {
    // Current year has an evaluation record but all scores are N/A — still mark as evaluated
    await storage.updateVendor(vendorId, {
      qualityScore: null,
      costScore: null,
      deliveryScore: null,
      responseScore: null,
      evaluated: true,
      evaluationDate,
    });
  } else {
    // No evaluations at all — clear vendor scores and evaluated flag
    await storage.updateVendor(vendorId, {
      qualityScore: null,
      costScore: null,
      deliveryScore: null,
      responseScore: null,
      evaluated: false,
      evaluationDate: null,
    });
  }
}

// Query params schema for list vendors
const listVendorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(10000).default(100),
  search: z.string().optional(),
  approved: z.enum(['true', 'false', 'any']).default('any'),
  evaluated: z.enum(['true', 'false', 'any']).default('any'),
  evalFrom: z.string().optional(),
  evalTo: z.string().optional(),
  sort: z.string().default('createdAt:desc'),
});

// GET /api/vendors - List all vendors with filtering and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const params = listVendorsQuerySchema.parse(req.query);
    const result = await storage.getAllVendors(params);
    res.json(result);
  } catch (error) {
    console.error('Get vendors error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid query parameters', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// GET /api/vendors/documents/view - Stream a vendor document through the API
router.get('/documents/view', async (req: Request, res: Response) => {
  try {
    await serveVendorDocumentPath(req.query.path, res);
  } catch (error) {
    console.error('View vendor document error:', error);
    const { status, reason, message } = getStorageErrorResponse(error);
    res.status(status).json({ error: message, reason });
  }
});

// GET /api/vendors/documents/all - Get all vendors that have an uploaded document
router.get('/documents/all', async (req: Request, res: Response) => {
  try {
    const result = await storage.getAllVendors({ pageSize: 10000 });
    const withDocs = result.data
      .filter((v) => v.mainDocumentUrl && v.mainDocumentUrl.trim().length > 0)
      .map((v) => ({
        id: v.id,
        name: v.name,
        mainDocumentUrl: v.mainDocumentUrl,
      }));
    res.json(withDocs);
  } catch (error) {
    console.error('Get vendor documents error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor documents' });
  }
});

router.get('/:vendorId/supplier-controls', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendor ID' });

    const [scopes, audits, scorecards] = await Promise.all([
      db.select().from(supplierScopes).where(eq(supplierScopes.vendorId, vendorId)).orderBy(desc(supplierScopes.createdAt)),
      db.select().from(supplierAudits).where(eq(supplierAudits.vendorId, vendorId)).orderBy(desc(supplierAudits.auditDate)),
      db.select().from(supplierScorecards).where(eq(supplierScorecards.vendorId, vendorId)).orderBy(desc(supplierScorecards.periodEnd)),
    ]);

    res.json({ scopes, audits, scorecards });
  } catch (error: any) {
    console.error('Get supplier controls error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:vendorId/supplier-scopes', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendor ID' });
    const user = (req as any).user;
    const parsed = insertSupplierScopeSchema.parse({
      ...req.body,
      vendorId,
      approvedByUserId: req.body?.approvedByUserId ?? user?.id ?? null,
      approvedByDisplayName: req.body?.approvedByDisplayName ?? user?.username ?? null,
      approvedAt: req.body?.approvedAt ?? new Date(),
    });

    const [created] = await db.insert(supplierScopes).values(parsed).returning();
    await auditService.logEvent({
      entityType: 'vendor',
      entityId: String(vendorId),
      action: 'SUPPLIER_SCOPE_APPROVED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { scopeId: created.id, scopeCode: created.scopeCode, status: created.status, expiresAt: created.expiresAt },
    });

    res.status(201).json(created);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: error.errors });
    console.error('Create supplier scope error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:vendorId/supplier-audits', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendor ID' });
    const user = (req as any).user;
    const parsed = insertSupplierAuditSchema.parse({
      ...req.body,
      vendorId,
      performedByUserId: req.body?.performedByUserId ?? user?.id ?? null,
      performedByDisplayName: req.body?.performedByDisplayName ?? user?.username ?? null,
    });

    const [created] = await db.insert(supplierAudits).values(parsed).returning();
    await auditService.logEvent({
      entityType: 'vendor',
      entityId: String(vendorId),
      action: 'SUPPLIER_AUDIT_RECORDED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { auditId: created.id, auditType: created.auditType, status: created.status, auditDate: created.auditDate },
    });

    res.status(201).json(created);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: error.errors });
    console.error('Create supplier audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:vendorId/supplier-scorecards', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendor ID' });
    const user = (req as any).user;
    const scores = ['qualityScore', 'deliveryScore', 'costScore', 'responsivenessScore']
      .map((key) => Number(req.body?.[key]));
    const overallScore = Number.isFinite(Number(req.body?.overallScore))
      ? Number(req.body.overallScore)
      : scores.reduce((sum, value) => sum + value, 0) / scores.length;
    const parsed = insertSupplierScorecardSchema.parse({
      ...req.body,
      vendorId,
      overallScore,
      reviewedByUserId: req.body?.reviewedByUserId ?? user?.id ?? null,
      reviewedByDisplayName: req.body?.reviewedByDisplayName ?? user?.username ?? null,
      reviewedAt: req.body?.reviewedAt ?? new Date(),
    });

    const [created] = await db.insert(supplierScorecards).values(parsed).returning();
    await auditService.logEvent({
      entityType: 'vendor',
      entityId: String(vendorId),
      action: 'SUPPLIER_SCORECARD_RECORDED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { scorecardId: created.id, periodStart: created.periodStart, periodEnd: created.periodEnd, overallScore: created.overallScore, status: created.status },
    });

    res.status(201).json(created);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: error.errors });
    console.error('Create supplier scorecard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/vendors/:id - Get a single vendor by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    let vendor;
    try {
      vendor = await storage.getVendor(id);
    } catch (innerError) {
      const message = innerError instanceof Error ? innerError.message : String(innerError);
      if (message.includes('scope_approved_for')) {
        console.warn(`Vendor ${id} lookup hit missing scope_approved_for column; retrying without scope fields`);
        const fallbackResult = await db.execute(
          sql`
            SELECT *
            FROM vendors
            WHERE id = ${id}
            LIMIT 1
          `
        );
        vendor = Array.isArray(fallbackResult) ? fallbackResult[0] : (fallbackResult as any)?.rows?.[0];
      } else {
        throw innerError;
      }
    }
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json(vendor);
  } catch (error) {
    console.error('Get vendor error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

// POST /api/vendors - Create a new vendor
router.post('/', async (req: Request, res: Response) => {
  try {
    const { allowOverride, overrideReason, skipValidation, ...bodyData } = req.body;
    const data = insertVendorSchema.parse(bodyData);

    const hasAddress = data.street && data.city && data.state && data.zipCode;

    if (hasAddress && !skipValidation) {
      const { validateAndNormalize, fromLegacyFields, toLegacyFields } = await import('../domain/address/addressService');
      const addressInput = fromLegacyFields({
        street: data.street!,
        city: data.city!,
        state: data.state!,
        zipCode: data.zipCode!,
        country: data.country || 'United States',
      });

      const result = await validateAndNormalize(addressInput);

      if (result.success) {
        const legacyFields = toLegacyFields(result.address);
        const enrichedData = {
          ...data,
          ...legacyFields,
          validationStatus: result.address.status,
          validatedAt: result.address.validatedAt || new Date(),
          validationProvider: result.address.validationProvider || null,
          dpvMatchCode: result.address.dpvMatchCode || null,
        };
        const vendor = await storage.createVendor(enrichedData);
        return res.status(201).json(vendor);
      }

      if (allowOverride && overrideReason) {
        const legacyFields = toLegacyFields(result.address);
        const enrichedData = {
          ...data,
          ...legacyFields,
          validationStatus: 'overridden',
          validatedAt: new Date(),
          validationProvider: result.address.validationProvider || null,
          dpvMatchCode: result.address.dpvMatchCode || null,
          overrideReason,
        };
        const vendor = await storage.createVendor(enrichedData);
        return res.status(201).json(vendor);
      }

      return res.status(400).json({
        error: 'Address validation failed',
        message: result.message,
        validationStatus: result.address.status,
        dpvMatchCode: result.address.dpvMatchCode,
        suggestedAddress: result.address.suggestedAddress,
        originalAddress: {
          street: data.street,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode,
        },
      });
    }

    const vendor = await storage.createVendor(data);
    res.status(201).json(vendor);
  } catch (error) {
    console.error('Create vendor error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

// PUT /api/vendors/:id - Update a vendor
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const { allowOverride, overrideReason, skipValidation, ...bodyData } = req.body;
    const data = insertVendorSchema.partial().parse(bodyData);

    const hasAddressUpdate = data.street && data.city && data.state && data.zipCode;

    if (hasAddressUpdate && !skipValidation) {
      const { validateAndNormalize, fromLegacyFields, toLegacyFields } = await import('../domain/address/addressService');
      const addressInput = fromLegacyFields({
        street: data.street!,
        city: data.city!,
        state: data.state!,
        zipCode: data.zipCode!,
        country: data.country || 'United States',
      });

      const result = await validateAndNormalize(addressInput);

      if (result.success) {
        const legacyFields = toLegacyFields(result.address);
        Object.assign(data, legacyFields, {
          validationStatus: result.address.status,
          validatedAt: result.address.validatedAt || new Date(),
          validationProvider: result.address.validationProvider || null,
          dpvMatchCode: result.address.dpvMatchCode || null,
        });
      } else if (allowOverride && overrideReason) {
        const legacyFields = toLegacyFields(result.address);
        Object.assign(data, legacyFields, {
          validationStatus: 'overridden',
          validatedAt: new Date(),
          validationProvider: result.address.validationProvider || null,
          dpvMatchCode: result.address.dpvMatchCode || null,
          overrideReason,
        });
      } else {
        return res.status(400).json({
          error: 'Address validation failed',
          message: result.message,
          validationStatus: result.address.status,
          dpvMatchCode: result.address.dpvMatchCode,
          suggestedAddress: result.address.suggestedAddress,
          originalAddress: {
            street: data.street,
            city: data.city,
            state: data.state,
            zipCode: data.zipCode,
          },
        });
      }
    }
    
    // Auto-update evaluation status if evaluation scores are present
    const hasAnyScore = 
      data.qualityScore !== undefined && data.qualityScore !== null ||
      data.costScore !== undefined && data.costScore !== null ||
      data.deliveryScore !== undefined && data.deliveryScore !== null ||
      data.responseScore !== undefined && data.responseScore !== null;
    
    if (hasAnyScore) {
      data.evaluated = true;
      // Set evaluation date to today if not already set
      if (!data.evaluationDate) {
        data.evaluationDate = new Date().toISOString().split('T')[0];
      }
    }
    
    // Also check notes for evaluation data (legacy support)
    if (data.notes && typeof data.notes === 'string') {
      const hasQuality = data.notes.includes('Quality:');
      const hasDelivery = data.notes.includes('Delivery Rating:');
      const hasCost = data.notes.includes('Cost:');
      const hasCommunication = data.notes.includes('Communication:');
      
      // If all 4 evaluation criteria are present, mark as evaluated
      if (hasQuality && hasDelivery && hasCost && hasCommunication) {
        data.evaluated = true;
        // Set evaluation date to today if not already set
        if (!data.evaluationDate) {
          data.evaluationDate = new Date().toISOString().split('T')[0];
        }
      }
    }
    
    const vendor = await storage.updateVendor(id, data);
    res.json(vendor);
  } catch (error) {
    console.error('Update vendor error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

// DELETE /api/vendors/:id - Delete (soft delete) a vendor
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    await storage.deleteVendor(id);
    res.json({ success: true, message: 'Vendor deleted successfully' });
  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

// Vendor Contacts Routes

// GET /api/vendors/:vendorId/contacts - Get all contacts for a vendor
router.get('/:vendorId/contacts', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    if (!Number.isInteger(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const contacts = await storage.getVendorContacts(vendorId);
    res.json(contacts);
  } catch (error) {
    console.error('Get vendor contacts error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor contacts' });
  }
});

// POST /api/vendors/:vendorId/contacts - Create a new contact for a vendor
router.post('/:vendorId/contacts', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    if (!Number.isInteger(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const data = insertVendorContactSchema.parse({ ...req.body, vendorId });
    const contact = await storage.createVendorContact(data);
    res.status(201).json(contact);
  } catch (error) {
    console.error('Create vendor contact error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid contact data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create vendor contact' });
  }
});

// PUT /api/vendors/:vendorId/contacts/:contactId - Update a vendor contact
router.put(
  '/:vendorId/contacts/:contactId',
  async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const contactId = parseInt(req.params.contactId);

      if (!Number.isInteger(vendorId) || !Number.isInteger(contactId)) {
        return res.status(400).json({ error: 'Invalid vendor or contact ID' });
      }

      // Verify the contact belongs to the specified vendor
      const existingContacts = await storage.getVendorContacts(vendorId);
      const contactExists = existingContacts.some((c) => c.id === contactId);

      if (!contactExists) {
        return res
          .status(404)
          .json({ error: 'Contact not found for this vendor' });
      }

      // Parse and validate request body, but exclude vendorId to prevent reassignment
      const data = insertVendorContactSchema
        .partial()
        .omit({ vendorId: true })
        .parse(req.body);
      const contact = await storage.updateVendorContact(contactId, data);
      res.json(contact);
    } catch (error) {
      console.error('Update vendor contact error:', error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: 'Invalid contact data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to update vendor contact' });
    }
  }
);

// DELETE /api/vendors/:vendorId/contacts/:contactId - Delete a vendor contact
router.delete(
  '/:vendorId/contacts/:contactId',
  async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const contactId = parseInt(req.params.contactId);

      if (!Number.isInteger(vendorId) || !Number.isInteger(contactId)) {
        return res.status(400).json({ error: 'Invalid vendor or contact ID' });
      }

      // Verify the contact belongs to the specified vendor
      const existingContacts = await storage.getVendorContacts(vendorId);
      const contactExists = existingContacts.some((c) => c.id === contactId);

      if (!contactExists) {
        return res
          .status(404)
          .json({ error: 'Contact not found for this vendor' });
      }

      await storage.deleteVendorContact(contactId);
      res.json({ success: true, message: 'Contact deleted successfully' });
    } catch (error) {
      console.error('Delete vendor contact error:', error);
      res.status(500).json({ error: 'Failed to delete vendor contact' });
    }
  }
);

// POST /api/vendors/upload/approval - Upload vendor approval PDF to object storage
router.post('/upload/approval', vendorApprovalUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadResult = await uploadVendorPdfToStorage(req.file, 'vendor-approvals');
    return res.status(200).json(uploadResult);

  } catch (error) {
    console.error('Vendor approval upload error:', error);
    const { status, reason, message } = getStorageErrorResponse(error);
    res.status(status).json({ error: message, reason });
  }
});

// POST /api/vendors/upload/document - Upload vendor main document PDF to object storage
router.post('/upload/document', vendorDocumentUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadResult = await uploadVendorPdfToStorage(req.file, 'vendor-documents');
    return res.status(200).json(uploadResult);

  } catch (error) {
    console.error('Vendor document upload error:', error);
    const { status, reason, message } = getStorageErrorResponse(error);
    res.status(status).json({ error: message, reason });
  }
});

// Vendor Monthly Evaluations Routes

// GET /api/vendors/evaluations/ytd-summary - Get YTD overall average for all vendors
router.get('/evaluations/ytd-summary', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed
    
    const summary = await storage.getVendorEvaluationsYtdSummary(currentYear, currentMonth);
    
    res.json(summary);
  } catch (error) {
    console.error('Get vendor YTD summary error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor YTD summary' });
  }
});

// GET /api/vendors/:vendorId/evaluations - Get annual evaluations for a vendor
router.get('/:vendorId/evaluations', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;

    if (!Number.isInteger(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const evaluations = await storage.getVendorMonthlyEvaluations(vendorId, year);
    
    // Calculate totalScore for each evaluation
    const evaluationsWithTotal = evaluations.map(ev => {
      const scores = [
        ev.qualityScore,
        ev.costScore,
        ev.deliveryScore,
        ev.responseScore
      ].filter(score => score !== null && score !== undefined);
      
      const totalScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) : 0;
      
      return {
        ...ev,
        totalScore
      };
    });
    
    res.json(evaluationsWithTotal);
  } catch (error) {
    console.error('Get vendor monthly evaluations error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor monthly evaluations' });
  }
});

// POST /api/vendors/:vendorId/evaluations - Create or update an annual evaluation
router.post('/:vendorId/evaluations', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    if (!Number.isInteger(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const { month, year, qualityScore, costScore, deliveryScore, responseScore, notes } = req.body;

    // Validation
    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    // Check if evaluation exists
    const existing = await storage.getVendorMonthlyEvaluation(vendorId, month, year);

    let evaluation;
    if (existing) {
      // Update existing
      evaluation = await storage.updateVendorMonthlyEvaluation(existing.id, {
        qualityScore,
        costScore,
        deliveryScore,
        responseScore,
        notes,
      });
    } else {
      // Create new
      evaluation = await storage.createVendorMonthlyEvaluation({
        vendorId,
        month,
        year,
        qualityScore,
        costScore,
        deliveryScore,
        responseScore,
        notes,
      });
    }

    // Calculate totalScore for the response
    const scores = [
      evaluation.qualityScore,
      evaluation.costScore,
      evaluation.deliveryScore,
      evaluation.responseScore
    ].filter(score => score !== null && score !== undefined);
    
    const totalScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) : 0;

    const hasAnyAnnualScore =
      evaluation.qualityScore !== null && evaluation.qualityScore !== undefined ||
      evaluation.costScore !== null && evaluation.costScore !== undefined ||
      evaluation.deliveryScore !== null && evaluation.deliveryScore !== undefined ||
      evaluation.responseScore !== null && evaluation.responseScore !== undefined;

    await storage.updateVendor(vendorId, {
      evaluated: hasAnyAnnualScore,
      evaluationDate: hasAnyAnnualScore ? `${year}-01-01` : null,
    });

    // Update vendor record with the latest evaluation scores so they show on the vendor list
    await syncVendorScoresFromEvaluations(vendorId);

    res.json({
      ...evaluation,
      totalScore
    });
  } catch (error) {
    console.error('Create/update vendor monthly evaluation error:', error);
    res.status(500).json({ error: 'Failed to save vendor monthly evaluation' });
  }
});

// DELETE /api/vendors/:vendorId/evaluations/:evaluationId - Delete a monthly evaluation
router.delete('/:vendorId/evaluations/:evaluationId', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const evaluationId = parseInt(req.params.evaluationId);
    
    if (!Number.isInteger(evaluationId) || !Number.isInteger(vendorId)) {
      return res.status(400).json({ error: 'Invalid evaluation ID or vendor ID' });
    }

    await storage.deleteVendorMonthlyEvaluation(evaluationId);
    
    // Update vendor scores after deletion to reflect remaining evaluations
    await syncVendorScoresFromEvaluations(vendorId);
    
    res.json({ success: true, message: 'Evaluation deleted successfully' });
  } catch (error) {
    console.error('Delete vendor monthly evaluation error:', error);
    res.status(500).json({ error: 'Failed to delete vendor monthly evaluation' });
  }
});

// POST /api/vendors/sync-all-scores - Backfill vendor scores from evaluations (one-time or as needed)
router.post('/sync-all-scores', async (req: Request, res: Response) => {
  try {
    // Get all vendors
    const vendorsResult = await storage.getAllVendors({ pageSize: 10000 });
    const vendors = vendorsResult.data;
    
    let updated = 0;
    const errors: string[] = [];
    
    for (const vendor of vendors) {
      try {
        await syncVendorScoresFromEvaluations(vendor.id);
        updated++;
      } catch (error) {
        console.error(`Failed to sync scores for vendor ${vendor.name}:`, error);
        errors.push(`${vendor.name}: ${(error as Error).message}`);
      }
    }
    
    res.json({
      success: true,
      message: 'Vendor scores synchronized from evaluations',
      updated,
      total: vendors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Sync all vendor scores error:', error);
    res.status(500).json({ error: 'Failed to sync vendor scores' });
  }
});

// POST /api/vendors/import-evaluations - Import evaluations from CSV
router.post('/import-evaluations', async (req: Request, res: Response) => {
  try {
    const { csvData } = req.body;

    if (!csvData || !Array.isArray(csvData)) {
      return res.status(400).json({ error: 'Invalid CSV data' });
    }

    const results = {
      processed: 0,
      matched: 0,
      unmatched: [] as string[],
      created: 0,
      synced: 0,
      errors: [] as any[],
    };

    // Get all vendors for matching
    const vendorsResult = await storage.getAllVendors({ pageSize: 1000 });
    const vendors = vendorsResult.data;

    // Parse CSV and match vendors
    for (const row of csvData) {
      results.processed++;

      const vendorName = row['PL2 Supplier 2025'];
      if (!vendorName || vendorName.trim() === '') {
        continue;
      }

      // Try to match vendor by name (case-insensitive)
      const matchedVendor = vendors.find(v => 
        v.name.toLowerCase().trim() === vendorName.toLowerCase().trim()
      );

      if (!matchedVendor) {
        results.unmatched.push(vendorName);
        continue;
      }

      results.matched++;

      // Extract annual scores from CSV columns (stored with month=1 for the full year)
      const importYear = new Date().getFullYear();
      const annualMonth = 1; // Annual evaluation stored as month=1

      const qualityScore = row['Annual- Quality'] ? parseInt(row['Annual- Quality']) : null;
      const costScore = row['Annual- Cost'] ? parseInt(row['Annual- Cost']) : null;
      const deliveryScore = row['Annual- Delivery'] ? parseInt(row['Annual- Delivery']) : null;
      const responseScore = row['Annual- Response'] ? parseInt(row['Annual- Response']) : null;

      // Only create if at least one score is present
      if (qualityScore || costScore || deliveryScore || responseScore) {
        try {
          // Check if evaluation already exists
          const existing = await storage.getVendorMonthlyEvaluation(matchedVendor.id, annualMonth, importYear);

          if (existing) {
            // Update existing
            await storage.updateVendorMonthlyEvaluation(existing.id, {
              qualityScore,
              costScore,
              deliveryScore,
              responseScore,
            });
          } else {
            // Create new
            await storage.createVendorMonthlyEvaluation({
              vendorId: matchedVendor.id,
              month: annualMonth,
              year: importYear,
              qualityScore,
              costScore,
              deliveryScore,
              responseScore,
            });
            results.created++;
          }

          await syncVendorScoresFromEvaluations(matchedVendor.id);
          results.synced++;
        } catch (error) {
          results.errors.push({
            vendor: vendorName,
            period: `Annual ${importYear}`,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Import vendor evaluations error:', error);
    res.status(500).json({ error: 'Failed to import vendor evaluations' });
  }
});

// POST /api/vendors/reset-monthly-evaluations - Manually reset all vendor annual evaluations
router.post('/reset-monthly-evaluations', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Manual vendor annual evaluation reset requested...');
    
    // Get all vendors (use a large page size to get all)
    const { data: allVendors } = await storage.getAllVendors({ 
      pageSize: 10000 // Large enough to get all vendors
    });
    
    // Reset evaluation status and scores for all vendors
    const resetPromises = allVendors.map(vendor => 
      storage.updateVendor(vendor.id, {
        evaluated: false,
        evaluationDate: null,
        qualityScore: null,
        costScore: null,
        deliveryScore: null,
        responseScore: null,
      })
    );
    
    await Promise.all(resetPromises);
    
    console.log(`✅ Manual annual evaluation reset complete. Reset ${allVendors.length} vendors.`);
    
    res.json({
      success: true,
      message: `Successfully reset ${allVendors.length} vendors`,
      vendorsReset: allVendors.length,
    });
  } catch (error) {
    console.error('Manual vendor evaluation reset error:', error);
    res.status(500).json({ 
      error: 'Failed to reset vendor evaluations',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
