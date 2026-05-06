import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticateToken, requireRole } from '../../middleware/auth';
import {
  listPoliciesWithCurrent,
  getPolicyByKey,
  getVersionsForPolicy,
  publishInRepoVersion,
  publishExternalVersion,
  recordAcknowledgment,
  getAcknowledgmentsForUser,
  getOutstandingForUser,
  getCoverageReport,
  detectDrift,
  sha256Hex,
  readPolicyDoc,
} from '../services/policiesService';
import { ObjectStorageService } from '../../replit_integrations/object_storage/objectStorage';
import { db } from '../../db';
import { policies, policyVersions } from '../../schema';
import { eq } from 'drizzle-orm';

const router = Router();
const objectStorage = new ObjectStorageService();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const requireAdmin = [authenticateToken, requireRole('ADMIN', 'OWNER')];

function actorFromReq(req: Request) {
  const u = (req as any).user;
  if (!u) return undefined;
  const display = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
  return { userId: u.id as number, displayName: display };
}

// ─── Public (authenticated) endpoints ─────────────────────────────────────

router.get('/', authenticateToken, async (_req, res) => {
  try {
    const rows = await listPoliciesWithCurrent();
    res.json(rows);
  } catch (err: any) {
    console.error('[policies] list error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to list policies' });
  }
});

router.get('/outstanding', authenticateToken, async (req, res) => {
  try {
    const u = (req as any).user;
    const rows = await getOutstandingForUser({ userId: u.id, role: u.role });
    res.json(rows);
  } catch (err: any) {
    console.error('[policies] outstanding error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to fetch outstanding policies' });
  }
});

router.get('/me/acknowledgments', authenticateToken, async (req, res) => {
  try {
    const u = (req as any).user;
    const rows = await getAcknowledgmentsForUser(u.id);
    res.json(rows);
  } catch (err: any) {
    console.error('[policies] my acks error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to load acknowledgments' });
  }
});

router.get('/:key', authenticateToken, async (req, res) => {
  try {
    const policy = await getPolicyByKey(req.params.key);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    let currentVersion: any = null;
    if (policy.currentVersionId) {
      const rows = await db
        .select()
        .from(policyVersions)
        .where(eq(policyVersions.id, policy.currentVersionId))
        .limit(1);
      currentVersion = rows[0] ?? null;
    }
    res.json({ policy, currentVersion });
  } catch (err: any) {
    console.error('[policies] get error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to load policy' });
  }
});

router.get('/:key/versions', authenticateToken, async (req, res) => {
  try {
    const policy = await getPolicyByKey(req.params.key);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    const versions = await getVersionsForPolicy(policy.id);
    res.json(versions);
  } catch (err: any) {
    console.error('[policies] versions error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to load versions' });
  }
});

router.post('/:key/acknowledge', authenticateToken, async (req, res) => {
  try {
    const u = (req as any).user;
    const policy = await getPolicyByKey(req.params.key);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    if (!policy.currentVersionId) return res.status(400).json({ error: 'Policy has no published version' });
    const display = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
    const ack = await recordAcknowledgment({
      policyVersionId: policy.currentVersionId,
      userId: u.id,
      userDisplayName: display,
      userRole: u.role,
      ipAddress: (req.ip as string) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    res.status(201).json(ack);
  } catch (err: any) {
    console.error('[policies] acknowledge error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to record acknowledgment' });
  }
});

// ─── Admin endpoints ──────────────────────────────────────────────────────

router.post('/:key/publish-from-doc', ...requireAdmin, async (req: Request, res: Response) => {
  try {
    const { changeSummary } = req.body ?? {};
    const version = await publishInRepoVersion({
      policyKey: req.params.key,
      changeSummary,
      actor: actorFromReq(req),
    });
    res.status(201).json(version);
  } catch (err: any) {
    console.error('[policies] publish-from-doc error:', err);
    res.status(400).json({ error: err.message ?? 'Failed to publish version' });
  }
});

const ALLOWED_POLICY_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
]);
const ALLOWED_POLICY_EXTS = ['.pdf', '.doc', '.docx', '.md', '.txt'];

router.post(
  '/:key/upload-version',
  ...requireAdmin,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'file is required' });
      const { changeSummary } = req.body ?? {};

      const mime = (file.mimetype || '').toLowerCase();
      const lowerName = (file.originalname || '').toLowerCase();
      const extOk = ALLOWED_POLICY_EXTS.some((ext) => lowerName.endsWith(ext));
      if (!ALLOWED_POLICY_MIMES.has(mime) && !extOk) {
        return res.status(400).json({
          error: `Unsupported file type. Allowed: ${ALLOWED_POLICY_EXTS.join(', ')}`,
        });
      }

      // Upload bytes to object storage via signed URL
      const uploadUrl = await objectStorage.getObjectEntityUploadURL();
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file.buffer,
        headers: { 'Content-Type': file.mimetype || 'application/octet-stream' },
      });
      if (!putRes.ok) {
        throw new Error(`Object storage upload failed: ${putRes.status}`);
      }

      // Set ACL on uploaded object so all authenticated users can read it.
      // Policies are intentionally readable by every user in scope, so we
      // mark visibility "public" — which `canAccessObject` allows for any
      // GET request once metadata is present.
      const actor = actorFromReq(req);
      const normalizedPath = await objectStorage.trySetObjectEntityAclPolicy(uploadUrl, {
        owner: String(actor?.userId ?? 'system'),
        visibility: 'public',
      });

      const hash = sha256Hex(file.buffer);
      const version = await publishExternalVersion({
        policyKey: req.params.key,
        uploadedFileUrl: normalizedPath,
        uploadedFileName: file.originalname,
        uploadedFileMime: file.mimetype || 'application/octet-stream',
        contentHash: hash,
        changeSummary,
        actor,
      });
      res.status(201).json(version);
    } catch (err: any) {
      console.error('[policies] upload-version error:', err);
      res.status(400).json({ error: err.message ?? 'Failed to upload version' });
    }
  },
);

// Convert an in-repo policy into an external-upload policy (admin only)
router.patch('/:key', ...requireAdmin, async (req: Request, res: Response) => {
  try {
    const policy = await getPolicyByKey(req.params.key);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    const allowed: Record<string, any> = {};
    if (typeof req.body.title === 'string') allowed.title = req.body.title;
    if (typeof req.body.description === 'string') allowed.description = req.body.description;
    if (typeof req.body.owner === 'string') allowed.owner = req.body.owner;
    if (typeof req.body.requiresAcknowledgment === 'boolean') allowed.requiresAcknowledgment = req.body.requiresAcknowledgment;
    if (Array.isArray(req.body.acknowledgmentRoles)) allowed.acknowledgmentRoles = req.body.acknowledgmentRoles;
    if (req.body.source === 'in-repo' || req.body.source === 'external-upload') allowed.source = req.body.source;
    if (typeof req.body.isActive === 'boolean') allowed.isActive = req.body.isActive;
    allowed.updatedAt = new Date();
    const updated = await db.update(policies).set(allowed).where(eq(policies.id, policy.id)).returning();
    res.json(updated[0]);
  } catch (err: any) {
    console.error('[policies] patch error:', err);
    res.status(400).json({ error: err.message ?? 'Failed to update policy' });
  }
});

router.get('/admin/coverage', ...requireAdmin, async (_req, res) => {
  try {
    const rows = await getCoverageReport();
    res.json(rows);
  } catch (err: any) {
    console.error('[policies] coverage error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to compute coverage' });
  }
});

router.get('/admin/coverage.csv', ...requireAdmin, async (_req, res) => {
  try {
    const rows = await getCoverageReport();
    const header = ['policy_key', 'policy_title', 'current_version', 'published_at', 'eligible_users', 'acknowledged_users', 'overdue_users', 'overdue_usernames'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.policyKey,
        JSON.stringify(r.policyTitle),
        r.currentVersionNumber ?? '',
        r.publishedAt ? new Date(r.publishedAt).toISOString() : '',
        r.eligibleUserCount,
        r.acknowledgedUserCount,
        r.overdueUserCount,
        JSON.stringify(r.overdueUsers.map((u) => u.username).join(';')),
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="policy_coverage.csv"');
    res.send(lines.join('\n'));
  } catch (err: any) {
    console.error('[policies] coverage.csv error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to export coverage' });
  }
});

router.get('/admin/drift', ...requireAdmin, async (_req, res) => {
  try {
    const rows = await detectDrift();
    res.json(rows);
  } catch (err: any) {
    console.error('[policies] drift error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to detect drift' });
  }
});

router.get('/:key/doc-preview', ...requireAdmin, async (req: Request, res: Response) => {
  try {
    const doc = readPolicyDoc(req.params.key);
    if (!doc) return res.status(404).json({ error: 'Doc not found' });
    res.json({ ...doc });
  } catch (err: any) {
    console.error('[policies] doc-preview error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to read doc' });
  }
});

export default router;
