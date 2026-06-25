import { Router, type Request, type Response } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
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
  visibility: z.enum(['public', 'private']).default('public'),
  allowPublicEdit: z.boolean().default(false),
}).passthrough();

type DraftBomActor = {
  userId: number | null;
  displayName: string;
  role?: string | null;
};

function isAdminActor(actor: DraftBomActor) {
  const role = String(actor.role ?? '').toUpperCase();
  return role === 'ADMIN' || role === 'OWNER';
}

function canManageDraft(row: typeof draftBomDrafts.$inferSelect, actor: DraftBomActor) {
  return (!!actor.userId && row.createdByUserId === actor.userId) || isAdminActor(actor);
}

function canEditDraft(row: typeof draftBomDrafts.$inferSelect, actor: DraftBomActor) {
  return canManageDraft(row, actor) || (row.visibility === 'public' && row.allowPublicEdit);
}

function toClientDraft(row: typeof draftBomDrafts.$inferSelect, actor: DraftBomActor) {
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  const canManageAccess = canManageDraft(row, actor);
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
    visibility: row.visibility,
    allowPublicEdit: row.allowPublicEdit,
    updatedAt: row.updatedAt?.toISOString?.() ?? (data as any).updatedAt,
    createdAt: row.createdAt?.toISOString?.() ?? (data as any).createdAt,
    createdByUserId: row.createdByUserId,
    createdByDisplayName: row.createdByDisplayName,
    updatedByDisplayName: row.updatedByDisplayName,
    canEdit: canEditDraft(row, actor),
    canManageAccess,
  };
}

async function userSnapshot(req: Request) {
  const user = (req as any).user;
  if (!user) return { userId: null, displayName: 'unknown', role: null };
  if (!user.id) {
    return {
      userId: null,
      displayName: user.username ?? user.displayName ?? 'unknown',
      role: user.role ?? null,
    };
  }
  return resolveUserSnapshot(user.id)
    .then((snapshot) => ({
      ...snapshot,
      role: user.role ?? null,
    }))
    .catch(() => ({
      userId: user.id ?? null,
      displayName: user.username ?? user.displayName ?? 'unknown',
      role: user.role ?? null,
    }));
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const actor = await userSnapshot(req);
    const rows = await db
      .select()
      .from(draftBomDrafts)
      .where(
        isAdminActor(actor)
          ? sql`TRUE`
          : sql`${draftBomDrafts.visibility} = 'public' OR ${draftBomDrafts.createdByUserId} = ${actor.userId}`
      )
      .orderBy(desc(draftBomDrafts.updatedAt));
    res.json(rows.map((row) => toClientDraft(row, actor)));
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
    const [existing] = await db.select().from(draftBomDrafts).where(eq(draftBomDrafts.id, parsed.id)).limit(1);

    if (existing && !canEditDraft(existing, snapshot)) {
      return res.status(403).json({ error: 'You can view this draft, but the creator has not allowed shared editing.' });
    }

    const canManageExisting = existing ? canManageDraft(existing, snapshot) : true;
    const visibility = canManageExisting ? parsed.visibility : existing?.visibility ?? 'public';
    const allowPublicEdit = canManageExisting ? parsed.allowPublicEdit : existing?.allowPublicEdit ?? false;
    const data = {
      ...parsed,
      visibility,
      allowPublicEdit,
    };

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
        visibility,
        allowPublicEdit,
        data,
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
          visibility,
          allowPublicEdit,
          data,
          updatedByUserId: snapshot.userId ?? null,
          updatedByDisplayName: snapshot.displayName ?? 'unknown',
          updatedAt: now,
        },
      })
      .returning();

    res.json(toClientDraft(row, snapshot));
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
    const actor = await userSnapshot(req);
    const [existing] = await db.select().from(draftBomDrafts).where(eq(draftBomDrafts.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Draft Builder draft not found' });
    }
    if (!canManageDraft(existing, actor)) {
      return res.status(403).json({ error: 'Only the draft creator can delete or manage this draft.' });
    }
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
