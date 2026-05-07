import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { desc } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { improvementNotes } from '../../schema';
import { requirePermission } from '../../middleware/requirePermission';
import { resolveUserSnapshot } from '../../utils/userSnapshot';

const router = Router();

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) =>
    fn(req, res, next).catch(err => {
      console.error('[improvementNotes]', err?.message ?? err);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    });
}

const noteCreateSchema = z.object({
  title: z.string().trim().min(1).max(500),
  details: z.string().max(5000).optional().default(''),
  role: z.string().trim().min(1).max(120).default('Other'),
  workflow: z.string().trim().min(1).max(120).default('Other'),
  type: z.enum(['pain-point', 'missing-info', 'repeated-task', 'bug', 'idea']).default('idea'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  pagePath: z.string().max(1000).optional().default(''),
  pageTitle: z.string().max(500).optional().default(''),
  pageUrl: z.string().max(2000).optional().default(''),
  source: z.enum(['context-capture', 'dashboard']).default('context-capture'),
});

const noteUpdateSchema = noteCreateSchema.partial().extend({
  status: z.enum(['new', 'reviewed', 'planned', 'built']).optional(),
});

const uuidSchema = z.string().uuid();

// GET /api/improvement-notes — list all notes (most recent first)
router.get(
  '/',
  requirePermission('improvement_notes.view'),
  h(async (_req, res) => {
    const rows = await db
      .select()
      .from(improvementNotes)
      .orderBy(desc(improvementNotes.createdAt));
    res.json(rows);
  }),
);

// POST /api/improvement-notes — anyone authenticated can submit a note
router.post(
  '/',
  h(async (req, res) => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const parsed = noteCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const snapshot = await resolveUserSnapshot(user.id).catch(() => ({
      userId: user.id ?? null,
      displayName: user.username ?? user.displayName ?? 'unknown',
    }));

    const data = parsed.data;
    const [row] = await db
      .insert(improvementNotes)
      .values({
        title: data.title,
        details: data.details ?? '',
        role: data.role,
        workflow: data.workflow,
        type: data.type,
        priority: data.priority,
        status: 'new',
        pagePath: data.pagePath ?? '',
        pageTitle: data.pageTitle ?? '',
        pageUrl: data.pageUrl ?? '',
        source: data.source,
        createdByUserId: snapshot.userId ?? null,
        createdByDisplayName: snapshot.displayName ?? 'unknown',
      })
      .returning();

    res.status(201).json(row);
  }),
);

// PATCH /api/improvement-notes/:id — manage status / details / priority
router.patch(
  '/:id',
  requirePermission('improvement_notes.manage'),
  h(async (req, res) => {
    const idParse = uuidSchema.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: 'Invalid note id' });
      return;
    }
    const id = idParse.data;
    const parsed = noteUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if ('pagePath' in updates) updates.pagePath = updates.pagePath ?? '';
    if ('pageTitle' in updates) updates.pageTitle = updates.pageTitle ?? '';
    if ('pageUrl' in updates) updates.pageUrl = updates.pageUrl ?? '';
    if ('details' in updates) updates.details = updates.details ?? '';

    const [updated] = await db
      .update(improvementNotes)
      .set(updates as any)
      .where(eq(improvementNotes.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    res.json(updated);
  }),
);

// DELETE /api/improvement-notes/:id — manage capability
router.delete(
  '/:id',
  requirePermission('improvement_notes.manage'),
  h(async (req, res) => {
    const idParse = uuidSchema.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: 'Invalid note id' });
      return;
    }
    const id = idParse.data;
    const [deleted] = await db
      .delete(improvementNotes)
      .where(eq(improvementNotes.id, id))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    res.json({ success: true });
  }),
);

export default router;
