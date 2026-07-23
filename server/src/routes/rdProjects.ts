import { Router, type Request, type Response } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import { rdProjects } from '../../schema';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import { requirePermission } from '../../middleware/requirePermission';
import {
  designateAuthoritativeDesignControl,
  initializeDesignControlForProject,
  resolveDesignControlAuthority,
} from '../services/designControlAuthorityService';
import { recordAuditEvent } from '../services/auditLedgerService';

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

const localReconciliationSchema = rdProjectPayloadSchema.extend({
  confirmed: z.literal(true),
  localStorageKey: z.string().trim().min(1),
});

function actorSnapshot(req: Request) {
  const user = (req as any).user;
  return {
    id: typeof user?.id === 'number' ? user.id : null,
    username: user?.username ?? user?.email ?? user?.displayName ?? 'unknown',
    role: user?.role ?? null,
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

router.get('/:projectId/design-control', async (req: Request, res: Response) => {
  try {
    const resolution = await resolveDesignControlAuthority(req.params.projectId);
    if (!resolution) return res.status(404).json({ error: 'R&D project not found' });
    res.json(resolution);
  } catch (error) {
    console.error('Resolve project Design Control authority error:', error);
    res.status(500).json({ error: 'Failed to resolve project Design Control authority' });
  }
});

router.post(
  '/:projectId/design-control/initialize',
  requirePermission('design.control.create'),
  async (req: Request, res: Response) => {
    try {
      const result = await initializeDesignControlForProject({
        projectId: req.params.projectId,
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        actor: actorSnapshot(req),
        requestMetadata: { ipAddress: req.ip, userAgent: req.get('user-agent') ?? null },
      });
      if (result.status === 'project_not_found') return res.status(404).json({ error: 'R&D project not found' });
      if (result.status === 'conflict') {
        return res.status(409).json({
          error: 'DESIGN_CONTROL_RECONCILIATION_REQUIRED',
          message: 'Existing Design Control records require explicit authority reconciliation.',
          resolution: result.resolution,
        });
      }
      res.status(result.status === 'created' ? 201 : 200).json(result);
    } catch (error: any) {
      if (error?.code === '23505') {
        const resolution = await resolveDesignControlAuthority(req.params.projectId);
        return res.status(200).json({ status: 'existing', resolution });
      }
      console.error('Initialize project Design Control error:', error);
      res.status(500).json({ error: 'Failed to initialize project Design Control' });
    }
  },
);

router.post(
  '/:projectId/design-control/designate',
  requirePermission('design.control.admin'),
  async (req: Request, res: Response) => {
    try {
      const parsed = z.object({
        recordId: z.string().uuid(),
        reason: z.string().trim().min(1),
      }).parse(req.body);
      const result = await designateAuthoritativeDesignControl({
        projectId: req.params.projectId,
        recordId: parsed.recordId,
        reason: parsed.reason,
        actor: actorSnapshot(req),
        requestMetadata: { ipAddress: req.ip, userAgent: req.get('user-agent') ?? null },
      });
      if (result.status === 'project_not_found') return res.status(404).json({ error: 'R&D project not found' });
      if (result.status === 'record_not_in_project') {
        return res.status(409).json({ error: 'Selected Design Control record does not belong to this project' });
      }
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message ?? 'Invalid designation request' });
      }
      console.error('Designate project Design Control authority error:', error);
      res.status(500).json({ error: 'Failed to designate project Design Control authority' });
    }
  },
);

router.post('/reconcile-local', requirePermission('design.control.create'), async (req: Request, res: Response) => {
  try {
    const parsed = localReconciliationSchema.parse(req.body);
    const [sameId] = await db.select().from(rdProjects).where(eq(rdProjects.id, parsed.id)).limit(1);
    if (sameId) {
      return res.status(409).json({ outcome: 'server_match', project: toClientProject(sameId) });
    }

    const possibleDuplicates = await db.execute(sql`
      SELECT id, project_name, owner, status
      FROM rd_projects
      WHERE lower(trim(project_name)) = lower(trim(${parsed.projectName}))
      ORDER BY updated_at DESC
      LIMIT 10
    `);
    const duplicateRows = (possibleDuplicates as any)?.rows ?? possibleDuplicates;
    if (Array.isArray(duplicateRows) && duplicateRows.length > 0) {
      return res.status(409).json({
        outcome: 'possible_duplicate',
        message: 'A similarly named server project exists. No automatic merge or overwrite was performed.',
        possibleDuplicates: duplicateRows,
      });
    }

    const snapshot = await userSnapshot(req);
    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(rdProjects).values({
        id: parsed.id,
        projectName: parsed.projectName,
        owner: parsed.owner,
        status: parsed.status,
        signoffRequired: parsed.signoffRequired,
        signoffUserId: parsed.signoffRequired ? parsed.signoffUserId : '',
        draftTabIds: parsed.draftTabIds,
        description: parsed.description,
        createdByUserId: snapshot.userId,
        createdByDisplayName: snapshot.displayName,
        updatedByUserId: snapshot.userId,
        updatedByDisplayName: snapshot.displayName,
      }).returning();

      await recordAuditEvent({
        eventType: 'RD_PROJECT_IMPORTED_FROM_LOCAL_STORAGE',
        subjectType: 'rd_project',
        subjectId: row.id,
        sourceService: 'rdProjects.route',
        actor: actorSnapshot(req),
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
        reason: 'Reviewed browser-local R&D project import',
        fieldsChanged: { persistence: { before: 'browser_local', after: 'server_authoritative' } },
        payload: {
          projectId: row.id,
          localStorageKey: parsed.localStorageKey,
          importedFromLocalStorage: true,
        },
      }, tx);
      return row;
    });
    res.status(201).json({ outcome: 'imported', project: toClientProject(created) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ outcome: 'failed', error: error.errors[0]?.message ?? 'Invalid local project' });
    }
    console.error('Reconcile browser-local R&D project error:', error);
    res.status(500).json({ outcome: 'failed', error: 'Failed to import local project; local data was not changed' });
  }
});

export default router;
