/**
 * productionControlTemplates.ts — WAD Step 6 Template Library API
 *
 * Thin route layer: all business logic and DB access is in
 * productionControlTemplateService.ts. Routes only handle HTTP protocol
 * concerns (auth, request parsing, response serialisation).
 *
 * GET  /api/production-control-templates                     list
 * POST /api/production-control-templates                     create
 * POST /api/production-control-templates/request-upload-url  get presigned object-storage URL
 * GET  /api/production-control-templates/:id                 get single
 * PATCH /api/production-control-templates/:id               update (DRAFT only)
 * POST /api/production-control-templates/:id/link-file       attach uploaded file
 * POST /api/production-control-templates/:id/approve        approve (different role + person)
 * POST /api/production-control-templates/:id/obsolete       mark obsolete
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../middleware/auth';
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
  getStorageErrorResponse,
} from '../services/fileStorageProvider';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  linkFileToTemplate,
  approveTemplate,
  obsoleteTemplate,
} from '../services/productionControl/productionControlTemplateService';

const router = Router();

// ── List ────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, approval_status: approvalStatus } = req.query;
    const rows = await listTemplates({
      templateType: typeof type === 'string' ? type : undefined,
      approvalStatus: typeof approvalStatus === 'string' ? approvalStatus : undefined,
    });
    return res.json(rows);
  } catch (err: unknown) {
    console.error('[Templates] list error:', err);
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ── Create ──────────────────────────────────────────────────────────────────

router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { template, error } = await createTemplate(req.body, {
      username: user?.username ?? 'system',
      userId: user?.id ?? null,
    });
    if (error) return res.status(400).json({ error });
    return res.status(201).json(template);
  } catch (err: unknown) {
    console.error('[Templates] create error:', err);
    return res.status(500).json({ error: 'Failed to create template' });
  }
});

// ── Request upload URL (must come before /:id routes) ───────────────────────

router.post('/request-upload-url', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }

    const uploadTarget = await getFileStorageProvider().createUploadTarget({
      fileName: name,
      scope: 'production-control-templates',
    });

    return res.json({
      uploadURL: uploadTarget.uploadURL,
      objectPath: uploadTarget.objectPath,
      provider: uploadTarget.provider,
      fileName: name,
    });
  } catch (err: unknown) {
    const { status, reason, message } = getStorageErrorResponse(err);
    console.error('[Templates] request-upload-url error:', { status, reason, message });
    return res.status(status).json({ error: 'Failed to generate upload URL', reason, details: message });
  }
});

// ── Get single ──────────────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const row = await getTemplate(req.params.id);
    if (!row) return res.status(404).json({ error: 'Template not found' });
    return res.json(row);
  } catch (err: unknown) {
    console.error('[Templates] get error:', err);
    return res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// ── Update (DRAFT only for data) ────────────────────────────────────────────

router.patch('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { template, error, statusCode } = await updateTemplate(req.params.id, req.body as Record<string, unknown>);
    if (error) return res.status(statusCode ?? 400).json({ error });
    return res.json(template);
  } catch (err: unknown) {
    console.error('[Templates] update error:', err);
    return res.status(500).json({ error: 'Failed to update template' });
  }
});

// ── Link uploaded file to template ─────────────────────────────────────────

router.post('/:id/link-file', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { objectPath } = req.body;

    if (!objectPath || typeof objectPath !== 'string') {
      return res.status(400).json({ error: 'objectPath is required' });
    }

    try {
      await getFileStorageProviderForObjectPath(objectPath).setPublicReadPolicy(
        objectPath,
        user?.id?.toString() ?? 'system',
      );
    } catch {
      // ACL errors are non-fatal
    }

    const { template, error, statusCode } = await linkFileToTemplate(req.params.id, objectPath);
    if (error) return res.status(statusCode ?? 400).json({ error });
    return res.json(template);
  } catch (err: unknown) {
    console.error('[Templates] link-file error:', err);
    return res.status(500).json({ error: 'Failed to link file to template' });
  }
});

// ── Approve ─────────────────────────────────────────────────────────────────

router.post('/:id/approve', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const { template, error, statusCode, meta } = await approveTemplate(req.params.id, {
      userId: user.id ?? null,
      username: user.username,
      role: user.role ?? '',
    });

    if (error) return res.status(statusCode ?? 400).json({ error, ...meta });
    return res.json(template);
  } catch (err: unknown) {
    console.error('[Templates] approve error:', err);
    return res.status(500).json({ error: 'Failed to approve template' });
  }
});

// ── Mark Obsolete ───────────────────────────────────────────────────────────

router.post('/:id/obsolete', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { template, error, statusCode } = await obsoleteTemplate(req.params.id);
    if (error) return res.status(statusCode ?? 400).json({ error });
    return res.json(template);
  } catch (err: unknown) {
    console.error('[Templates] obsolete error:', err);
    return res.status(500).json({ error: 'Failed to mark template as obsolete' });
  }
});

export default router;
