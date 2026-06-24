import { Router, type Request, type Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { draftBomDrafts } from '../../schema';
import { resolveUserSnapshot } from '../../utils/userSnapshot';

const router = Router();

const draftPayloadSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).default('New Draft BOM'),
  revision: z.string().trim().min(1).default('Draft A'),
  project: z.string().default(''),
  projectId: z.string().nullable().optional(),
  projectCode: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  projectType: z.enum(['P2_PROJECT', 'R_AND_D']).nullable().optional(),
}).passthrough();

function toClientDraft(row: typeof draftBomDrafts.$inferSelect) {
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    id: row.id,
    name: row.name,
    revision: row.revision,
    project: row.project,
    projectId: row.projectId,
    projectCode: row.projectCode,
    projectName: row.projectName,
    projectType: row.projectType,
    updatedAt: row.updatedAt?.toISOString?.() ?? (data as any).updatedAt,
    createdByDisplayName: row.createdByDisplayName,
    updatedByDisplayName: row.updatedByDisplayName,
  };
}

async function userSnapshot(req: Request) {
  const user = (req as any).user;
  if (!user) return { userId: null, displayName: 'unknown' };
  if (!user.id) {
    return {
      userId: null,
      displayName: user.username ?? user.displayName ?? 'unknown',
    };
  }
  return resolveUserSnapshot(user.id).catch(() => ({
    userId: user.id ?? null,
    displayName: user.username ?? user.displayName ?? 'unknown',
  }));
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(draftBomDrafts)
      .orderBy(desc(draftBomDrafts.updatedAt));
    res.json(rows.map(toClientDraft));
  } catch (error) {
    console.error('List Draft Builder drafts error:', error);
    res.status(500).json({ error: 'Failed to fetch Draft Builder drafts' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = draftPayloadSchema.parse({ ...req.body, id: req.params.id });
    const snapshot = await userSnapshot(req);
    const now = new Date();

    const [row] = await db
      .insert(draftBomDrafts)
      .values({
        id: parsed.id,
        name: parsed.name,
        revision: parsed.revision,
        project: parsed.project ?? '',
        projectId: parsed.projectId ?? null,
        projectCode: parsed.projectCode ?? null,
        projectName: parsed.projectName ?? null,
        projectType: parsed.projectType ?? null,
        data: parsed,
        createdByUserId: snapshot.userId ?? null,
        createdByDisplayName: snapshot.displayName ?? 'unknown',
        updatedByUserId: snapshot.userId ?? null,
        updatedByDisplayName: snapshot.displayName ?? 'unknown',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: draftBomDrafts.id,
        set: {
          name: parsed.name,
          revision: parsed.revision,
          project: parsed.project ?? '',
          projectId: parsed.projectId ?? null,
          projectCode: parsed.projectCode ?? null,
          projectName: parsed.projectName ?? null,
          projectType: parsed.projectType ?? null,
          data: parsed,
          updatedByUserId: snapshot.userId ?? null,
          updatedByDisplayName: snapshot.displayName ?? 'unknown',
          updatedAt: now,
        },
      })
      .returning();

    res.json(toClientDraft(row));
  } catch (error) {
    console.error('Save Draft Builder draft error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Invalid Draft Builder draft payload' });
    }
    res.status(500).json({ error: 'Failed to save Draft Builder draft' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const [deleted] = await db
      .delete(draftBomDrafts)
      .where(eq(draftBomDrafts.id, id))
      .returning({ id: draftBomDrafts.id });

    if (!deleted) {
      return res.status(404).json({ error: 'Draft Builder draft not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete Draft Builder draft error:', error);
    res.status(500).json({ error: 'Failed to delete Draft Builder draft' });
  }
});

export default router;
