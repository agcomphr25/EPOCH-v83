import { Router, type Request, type Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { rdProjects } from '../../schema';
import { resolveUserSnapshot } from '../../utils/userSnapshot';

const router = Router();

const rdProjectPayloadSchema = z.object({
  id: z.string().trim().min(1),
  projectName: z.string().trim().min(1),
  owner: z.string().default(''),
  status: z.enum(['draft', 'active']).default('draft'),
  signoffRequired: z.boolean().default(false),
  signoffUserId: z.string().default(''),
  draftTabIds: z.array(z.string()).default([]),
  description: z.string().default(''),
});

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

function toClientProject(row: typeof rdProjects.$inferSelect) {
  return {
    id: row.id,
    projectName: row.projectName,
    owner: row.owner,
    status: row.status,
    signoffRequired: row.signoffRequired,
    signoffUserId: row.signoffUserId,
    draftTabIds: Array.isArray(row.draftTabIds) ? row.draftTabIds : [],
    description: row.description,
    createdAt: row.createdAt?.toISOString?.(),
    updatedAt: row.updatedAt?.toISOString?.(),
    createdByUserId: row.createdByUserId,
    createdByDisplayName: row.createdByDisplayName,
    updatedByDisplayName: row.updatedByDisplayName,
  };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(rdProjects).orderBy(desc(rdProjects.updatedAt));
    res.json(rows.map(toClientProject));
  } catch (error) {
    console.error('List R&D projects error:', error);
    res.status(500).json({ error: 'Failed to fetch R&D projects' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = rdProjectPayloadSchema.parse({ ...req.body, id: req.params.id });
    const snapshot = await userSnapshot(req);
    const now = new Date();

    const [existing] = await db.select().from(rdProjects).where(eq(rdProjects.id, parsed.id)).limit(1);

    const [row] = await db
      .insert(rdProjects)
      .values({
        id: parsed.id,
        projectName: parsed.projectName,
        owner: parsed.owner,
        status: parsed.status,
        signoffRequired: parsed.signoffRequired,
        signoffUserId: parsed.signoffRequired ? parsed.signoffUserId : '',
        draftTabIds: parsed.draftTabIds,
        description: parsed.description,
        createdByUserId: existing?.createdByUserId ?? snapshot.userId ?? null,
        createdByDisplayName: existing?.createdByDisplayName ?? snapshot.displayName ?? 'unknown',
        updatedByUserId: snapshot.userId ?? null,
        updatedByDisplayName: snapshot.displayName ?? 'unknown',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: rdProjects.id,
        set: {
          projectName: parsed.projectName,
          owner: parsed.owner,
          status: parsed.status,
          signoffRequired: parsed.signoffRequired,
          signoffUserId: parsed.signoffRequired ? parsed.signoffUserId : '',
          draftTabIds: parsed.draftTabIds,
          description: parsed.description,
          updatedByUserId: snapshot.userId ?? null,
          updatedByDisplayName: snapshot.displayName ?? 'unknown',
          updatedAt: now,
        },
      })
      .returning();

    res.json(toClientProject(row));
  } catch (error) {
    console.error('Save R&D project error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Invalid R&D project payload' });
    }
    res.status(500).json({ error: 'Failed to save R&D project' });
  }
});

export default router;
