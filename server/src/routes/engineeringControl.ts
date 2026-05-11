import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { recordAuditEvent } from '../services/auditLedgerService';
import {
  engineeringControlledRevisions,
  engineeringChangeOrders,
  engineeringEcoRevisionLinks,
  insertEngineeringControlledRevisionSchema,
  insertEngineeringChangeOrderSchema,
  insertEngineeringEcoRevisionLinkSchema,
} from '../../schema';

const router = Router();

const releaseStates = ['draft', 'review', 'approved', 'released', 'obsolete'] as const;
const ecoStatuses = ['draft', 'impact_review', 'approval', 'approved', 'rejected', 'implemented', 'released', 'closed'] as const;

const listRevisionQuerySchema = z.object({
  artifactType: z.enum(['BOM', 'ROUTING', 'TRAVELER_TEMPLATE', 'WORK_INSTRUCTION', 'SPEC', 'QC_FORM']).optional(),
  artifactId: z.string().optional(),
  releaseState: z.enum(releaseStates).optional(),
  customerId: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

const effectiveRevisionQuerySchema = z.object({
  artifactType: z.enum(['BOM', 'ROUTING', 'TRAVELER_TEMPLATE', 'WORK_INSTRUCTION', 'SPEC', 'QC_FORM']),
  artifactId: z.string().optional(),
  serialNumber: z.string().optional(),
  effectiveDate: z.string().optional(),
  customerId: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

const listEcoQuerySchema = z.object({
  status: z.enum(ecoStatuses).optional(),
});

const transitionRevisionSchema = z.object({
  releaseState: z.enum(releaseStates),
  actor: z.string().optional(),
  releaseNotes: z.string().optional(),
  ecoId: z.string().uuid().optional(),
});

const updateRevisionSchema = insertEngineeringControlledRevisionSchema.partial().omit({
  artifactType: true,
  artifactId: true,
  revision: true,
});

const impactReviewSchema = z.object({
  impactReview: z.record(z.unknown()),
  actor: z.string().optional(),
  approvalPlan: z.record(z.unknown()).optional(),
});

const approvalSchema = z.object({
  actor: z.string().optional(),
  approvalPlan: z.record(z.unknown()).optional(),
});

const rejectionSchema = z.object({
  actor: z.string().optional(),
  rejectionReason: z.string().min(1),
});

const implementationSchema = z.object({
  actor: z.string().optional(),
  implementationDate: z.string().min(1),
  releaseLinkage: z.record(z.unknown()).optional(),
});

const ecoReleaseSchema = z.object({
  actor: z.string().optional(),
  releaseLinkage: z.record(z.unknown()).optional(),
});

function actorFromRequest(req: Request, override?: string): string {
  if (override) return override;
  const user = (req as any).user;
  return user?.username || user?.email || user?.displayName || 'system';
}

function auditActor(req: Request) {
  const user = (req as any).user;
  return {
    id: typeof user?.id === 'number' ? user.id : null,
    username: user?.username ?? user?.email ?? user?.displayName ?? null,
    role: user?.role ?? null,
  };
}

async function logEngineeringControlEvent(req: Request, input: {
  eventType: string;
  subjectType: 'engineering_revision' | 'engineering_eco';
  subjectId: string;
  reason?: string | null;
  payload: Record<string, unknown>;
}) {
  await recordAuditEvent({
    eventType: input.eventType,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    sourceService: 'engineeringControl.route',
    actor: auditActor(req),
    reason: input.reason ?? null,
    payload: input.payload as any,
    entityType: input.subjectType,
    entityId: input.subjectId,
    meta: {
      ...input.payload,
      route: 'server/src/routes/engineeringControl.ts',
    } as any,
  });
}

function transitionAllowed(current: string, next: string): boolean {
  if (next === 'obsolete') return current !== 'obsolete';
  if (current === 'obsolete') return false;
  if (current === next) return true;
  const order: Record<string, number> = {
    draft: 0,
    review: 1,
    approved: 2,
    released: 3,
  };
  return order[next] === order[current] + 1;
}

function buildRevisionFilters(query: z.infer<typeof listRevisionQuerySchema>) {
  const filters = [];
  if (query.artifactType) filters.push(eq(engineeringControlledRevisions.artifactType, query.artifactType));
  if (query.artifactId) filters.push(eq(engineeringControlledRevisions.artifactId, query.artifactId));
  if (query.releaseState) filters.push(eq(engineeringControlledRevisions.releaseState, query.releaseState));
  if (query.customerId) filters.push(eq(engineeringControlledRevisions.effectivityCustomerId, query.customerId));
  if (query.projectId) filters.push(eq(engineeringControlledRevisions.effectivityProjectId, query.projectId));
  return filters.length ? and(...filters) : undefined;
}

function dateWithinRange(candidateDate: string, start?: string | null, end?: string | null): boolean {
  const value = candidateDate.slice(0, 10);
  return (!start || value >= String(start).slice(0, 10)) && (!end || value <= String(end).slice(0, 10));
}

function serialWithinRange(serial: string | undefined, start?: string | null, end?: string | null): boolean {
  if (!start && !end) return true;
  if (!serial) return false;
  return (!start || serial >= start) && (!end || serial <= end);
}

router.get('/revisions', async (req: Request, res: Response) => {
  try {
    const parsed = listRevisionQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid filters', details: parsed.error.issues });

    const rows = await db
      .select()
      .from(engineeringControlledRevisions)
      .where(buildRevisionFilters(parsed.data))
      .orderBy(desc(engineeringControlledRevisions.createdAt));

    return res.json(rows);
  } catch (error) {
    console.error('[EngineeringControl] list revisions error:', error);
    return res.status(500).json({ error: 'Failed to fetch engineering revisions' });
  }
});

router.get('/revisions/effective', async (req: Request, res: Response) => {
  try {
    const parsed = effectiveRevisionQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid filters', details: parsed.error.issues });

    const filters = [
      eq(engineeringControlledRevisions.artifactType, parsed.data.artifactType),
      eq(engineeringControlledRevisions.releaseState, 'released' as const),
    ];
    if (parsed.data.artifactId) {
      filters.push(eq(engineeringControlledRevisions.artifactId, parsed.data.artifactId));
    }

    const rows = await db
      .select()
      .from(engineeringControlledRevisions)
      .where(and(...filters))
      .orderBy(desc(engineeringControlledRevisions.releasedAt));

    const effectiveDate = parsed.data.effectiveDate ?? new Date().toISOString().slice(0, 10);
    const matches = rows.filter((row) => {
      const customerMatch = !row.effectivityCustomerId || row.effectivityCustomerId === parsed.data.customerId;
      const projectMatch = !row.effectivityProjectId || row.effectivityProjectId === parsed.data.projectId;
      const dateMatch = dateWithinRange(effectiveDate, row.effectivityStartDate, row.effectivityEndDate);
      const serialMatch = serialWithinRange(parsed.data.serialNumber, row.effectivitySerialStart, row.effectivitySerialEnd);
      return customerMatch && projectMatch && dateMatch && serialMatch;
    });

    return res.json({ effectiveDate, matches });
  } catch (error) {
    console.error('[EngineeringControl] resolve effectivity error:', error);
    return res.status(500).json({ error: 'Failed to resolve effective engineering revisions' });
  }
});

router.get('/revisions/:id', async (req: Request, res: Response) => {
  try {
    const [revision] = await db
      .select()
      .from(engineeringControlledRevisions)
      .where(eq(engineeringControlledRevisions.id, req.params.id))
      .limit(1);
    if (!revision) return res.status(404).json({ error: 'Engineering revision not found' });
    return res.json(revision);
  } catch (error) {
    console.error('[EngineeringControl] get revision error:', error);
    return res.status(500).json({ error: 'Failed to fetch engineering revision' });
  }
});

router.post('/revisions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const parsed = insertEngineeringControlledRevisionSchema.safeParse({
      ...req.body,
      createdBy: actorFromRequest(req, req.body?.createdBy),
    });
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });

    const [created] = await db.insert(engineeringControlledRevisions).values(parsed.data).returning();
    return res.status(201).json(created);
  } catch (error: any) {
    console.error('[EngineeringControl] create revision error:', error);
    return res.status(500).json({ error: 'Failed to create engineering revision', detail: error?.message });
  }
});

router.patch('/revisions/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const [existing] = await db
      .select()
      .from(engineeringControlledRevisions)
      .where(eq(engineeringControlledRevisions.id, req.params.id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Engineering revision not found' });
    if (!['draft', 'review'].includes(existing.releaseState)) {
      return res.status(400).json({ error: 'Only draft or review revisions can be edited directly. Use an ECO for released content.' });
    }

    const parsed = updateRevisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });

    const [updated] = await db
      .update(engineeringControlledRevisions)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(engineeringControlledRevisions.id, req.params.id))
      .returning();
    return res.json(updated);
  } catch (error: any) {
    console.error('[EngineeringControl] update revision error:', error);
    return res.status(500).json({ error: 'Failed to update engineering revision', detail: error?.message });
  }
});

router.post('/revisions/:id/transition', authenticateToken, requirePermission('engineering.release_revision'), async (req: Request, res: Response) => {
  try {
    const parsed = transitionRevisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });

    const [existing] = await db
      .select()
      .from(engineeringControlledRevisions)
      .where(eq(engineeringControlledRevisions.id, req.params.id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Engineering revision not found' });
    if (!transitionAllowed(existing.releaseState, parsed.data.releaseState)) {
      return res.status(400).json({ error: `Cannot transition revision from ${existing.releaseState} to ${parsed.data.releaseState}` });
    }

    if (parsed.data.ecoId) {
      const [eco] = await db
        .select()
        .from(engineeringChangeOrders)
        .where(eq(engineeringChangeOrders.id, parsed.data.ecoId))
        .limit(1);
      if (!eco) return res.status(404).json({ error: 'Linked ECO not found' });
      if (parsed.data.releaseState === 'released' && !['approved', 'implemented', 'released'].includes(eco.status)) {
        return res.status(400).json({ error: 'Revision release requires an approved, implemented, or released ECO.' });
      }
    }

    const actor = actorFromRequest(req, parsed.data.actor);
    const now = new Date();
    const updates: Record<string, unknown> = {
      releaseState: parsed.data.releaseState,
      updatedAt: now,
    };
    if (parsed.data.releaseNotes !== undefined) updates.releaseNotes = parsed.data.releaseNotes;
    if (parsed.data.releaseState === 'review') {
      updates.reviewedBy = actor;
      updates.reviewedAt = now;
    }
    if (parsed.data.releaseState === 'approved') {
      updates.approvedBy = actor;
      updates.approvedAt = now;
    }
    if (parsed.data.releaseState === 'released') {
      updates.releasedBy = actor;
      updates.releasedAt = now;
    }
    if (parsed.data.releaseState === 'obsolete') {
      updates.obsoleteBy = actor;
      updates.obsoleteAt = now;
    }

    const [updated] = await db
      .update(engineeringControlledRevisions)
      .set(updates)
      .where(eq(engineeringControlledRevisions.id, req.params.id))
      .returning();

    if (parsed.data.ecoId) {
      await db
        .insert(engineeringEcoRevisionLinks)
        .values({
          ecoId: parsed.data.ecoId,
          revisionId: updated.id,
          linkType: parsed.data.releaseState === 'released' ? 'release' : parsed.data.releaseState,
          createdBy: actor,
        })
        .onConflictDoNothing();
    }

    await logEngineeringControlEvent(req, {
      eventType: 'ENGINEERING_REVISION_TRANSITIONED',
      subjectType: 'engineering_revision',
      subjectId: updated.id,
      reason: parsed.data.releaseNotes ?? null,
      payload: {
        revisionId: updated.id,
        artifactType: updated.artifactType,
        artifactId: updated.artifactId,
        revision: updated.revision,
        priorReleaseState: existing.releaseState,
        nextReleaseState: parsed.data.releaseState,
        ecoId: parsed.data.ecoId ?? null,
        actor,
      },
    });

    return res.json(updated);
  } catch (error: any) {
    console.error('[EngineeringControl] transition revision error:', error);
    return res.status(500).json({ error: 'Failed to transition engineering revision', detail: error?.message });
  }
});

router.get('/ecos', async (req: Request, res: Response) => {
  try {
    const parsed = listEcoQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid filters', details: parsed.error.issues });

    const rows = await db
      .select()
      .from(engineeringChangeOrders)
      .where(parsed.data.status ? eq(engineeringChangeOrders.status, parsed.data.status) : undefined)
      .orderBy(desc(engineeringChangeOrders.createdAt));

    return res.json(rows);
  } catch (error) {
    console.error('[EngineeringControl] list ECOs error:', error);
    return res.status(500).json({ error: 'Failed to fetch engineering change orders' });
  }
});

router.get('/ecos/:id', async (req: Request, res: Response) => {
  try {
    const [eco] = await db
      .select()
      .from(engineeringChangeOrders)
      .where(eq(engineeringChangeOrders.id, req.params.id))
      .limit(1);
    if (!eco) return res.status(404).json({ error: 'ECO not found' });

    const links = await db
      .select()
      .from(engineeringEcoRevisionLinks)
      .where(eq(engineeringEcoRevisionLinks.ecoId, req.params.id));
    return res.json({ ...eco, revisionLinks: links });
  } catch (error) {
    console.error('[EngineeringControl] get ECO error:', error);
    return res.status(500).json({ error: 'Failed to fetch ECO' });
  }
});

router.post('/ecos', authenticateToken, async (req: Request, res: Response) => {
  try {
    const parsed = insertEngineeringChangeOrderSchema.safeParse({
      ...req.body,
      requestedBy: actorFromRequest(req, req.body?.requestedBy),
    });
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });

    const [created] = await db.insert(engineeringChangeOrders).values(parsed.data).returning();
    return res.status(201).json(created);
  } catch (error: any) {
    console.error('[EngineeringControl] create ECO error:', error);
    return res.status(500).json({ error: 'Failed to create ECO', detail: error?.message });
  }
});

router.post('/ecos/:id/impact-review', authenticateToken, requirePermission('engineering.release_revision'), async (req: Request, res: Response) => {
  try {
    const parsed = impactReviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });

    const [updated] = await db
      .update(engineeringChangeOrders)
      .set({
        status: 'impact_review',
        impactReview: parsed.data.impactReview,
        ...(parsed.data.approvalPlan !== undefined ? { approvalPlan: parsed.data.approvalPlan } : {}),
        impactReviewedBy: actorFromRequest(req, parsed.data.actor),
        impactReviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(engineeringChangeOrders.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'ECO not found' });
    await logEngineeringControlEvent(req, {
      eventType: 'ENGINEERING_ECO_IMPACT_REVIEWED',
      subjectType: 'engineering_eco',
      subjectId: updated.id,
      payload: {
        ecoId: updated.id,
        ecoNumber: updated.ecoNumber,
        status: updated.status,
        impactReviewedBy: updated.impactReviewedBy,
        impactReviewedAt: updated.impactReviewedAt,
      },
    });
    return res.json(updated);
  } catch (error: any) {
    console.error('[EngineeringControl] ECO impact review error:', error);
    return res.status(500).json({ error: 'Failed to record ECO impact review', detail: error?.message });
  }
});

router.post('/ecos/:id/submit-approval', authenticateToken, requirePermission('engineering.release_revision'), async (req: Request, res: Response) => {
  try {
    const parsed = approvalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });

    const [updated] = await db
      .update(engineeringChangeOrders)
      .set({
        status: 'approval',
        ...(parsed.data.approvalPlan !== undefined ? { approvalPlan: parsed.data.approvalPlan } : {}),
        updatedAt: new Date(),
      })
      .where(eq(engineeringChangeOrders.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'ECO not found' });
    await logEngineeringControlEvent(req, {
      eventType: 'ENGINEERING_ECO_SUBMITTED_FOR_APPROVAL',
      subjectType: 'engineering_eco',
      subjectId: updated.id,
      payload: {
        ecoId: updated.id,
        ecoNumber: updated.ecoNumber,
        status: updated.status,
        approvalPlan: updated.approvalPlan ?? null,
      },
    });
    return res.json(updated);
  } catch (error: any) {
    console.error('[EngineeringControl] ECO submit approval error:', error);
    return res.status(500).json({ error: 'Failed to submit ECO for approval', detail: error?.message });
  }
});

router.post('/ecos/:id/approve', authenticateToken, requirePermission('engineering.release_revision'), async (req: Request, res: Response) => {
  try {
    const parsed = approvalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });

    const [updated] = await db
      .update(engineeringChangeOrders)
      .set({
        status: 'approved',
        ...(parsed.data.approvalPlan !== undefined ? { approvalPlan: parsed.data.approvalPlan } : {}),
        approvedBy: actorFromRequest(req, parsed.data.actor),
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(engineeringChangeOrders.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'ECO not found' });
    await logEngineeringControlEvent(req, {
      eventType: 'ENGINEERING_ECO_APPROVED',
      subjectType: 'engineering_eco',
      subjectId: updated.id,
      payload: {
        ecoId: updated.id,
        ecoNumber: updated.ecoNumber,
        status: updated.status,
        approvedBy: updated.approvedBy,
        approvedAt: updated.approvedAt,
      },
    });
    return res.json(updated);
  } catch (error: any) {
    console.error('[EngineeringControl] ECO approve error:', error);
    return res.status(500).json({ error: 'Failed to approve ECO', detail: error?.message });
  }
});

router.post('/ecos/:id/reject', authenticateToken, requirePermission('engineering.release_revision'), async (req: Request, res: Response) => {
  try {
    const parsed = rejectionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });

    const [updated] = await db
      .update(engineeringChangeOrders)
      .set({
        status: 'rejected',
        rejectedBy: actorFromRequest(req, parsed.data.actor),
        rejectedAt: new Date(),
        rejectionReason: parsed.data.rejectionReason,
        updatedAt: new Date(),
      })
      .where(eq(engineeringChangeOrders.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'ECO not found' });
    await logEngineeringControlEvent(req, {
      eventType: 'ENGINEERING_ECO_REJECTED',
      subjectType: 'engineering_eco',
      subjectId: updated.id,
      reason: parsed.data.rejectionReason,
      payload: {
        ecoId: updated.id,
        ecoNumber: updated.ecoNumber,
        status: updated.status,
        rejectedBy: updated.rejectedBy,
        rejectedAt: updated.rejectedAt,
      },
    });
    return res.json(updated);
  } catch (error: any) {
    console.error('[EngineeringControl] ECO reject error:', error);
    return res.status(500).json({ error: 'Failed to reject ECO', detail: error?.message });
  }
});

router.post('/ecos/:id/implement', authenticateToken, requirePermission('engineering.release_revision'), async (req: Request, res: Response) => {
  try {
    const parsed = implementationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });

    const [existing] = await db
      .select()
      .from(engineeringChangeOrders)
      .where(eq(engineeringChangeOrders.id, req.params.id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'ECO not found' });
    if (existing.status !== 'approved') {
      return res.status(400).json({ error: 'Only approved ECOs can be implemented.' });
    }

    const [updated] = await db
      .update(engineeringChangeOrders)
      .set({
        status: 'implemented',
        implementationDate: parsed.data.implementationDate,
        ...(parsed.data.releaseLinkage !== undefined ? { releaseLinkage: parsed.data.releaseLinkage } : {}),
        implementedBy: actorFromRequest(req, parsed.data.actor),
        implementedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(engineeringChangeOrders.id, req.params.id))
      .returning();
    await logEngineeringControlEvent(req, {
      eventType: 'ENGINEERING_ECO_IMPLEMENTED',
      subjectType: 'engineering_eco',
      subjectId: updated.id,
      payload: {
        ecoId: updated.id,
        ecoNumber: updated.ecoNumber,
        priorStatus: existing.status,
        status: updated.status,
        implementationDate: updated.implementationDate,
        implementedBy: updated.implementedBy,
        implementedAt: updated.implementedAt,
      },
    });
    return res.json(updated);
  } catch (error: any) {
    console.error('[EngineeringControl] ECO implement error:', error);
    return res.status(500).json({ error: 'Failed to implement ECO', detail: error?.message });
  }
});

router.post('/ecos/:id/release', authenticateToken, requirePermission('engineering.release_revision'), async (req: Request, res: Response) => {
  try {
    const parsed = ecoReleaseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });

    const [existing] = await db
      .select()
      .from(engineeringChangeOrders)
      .where(eq(engineeringChangeOrders.id, req.params.id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'ECO not found' });
    if (!['implemented', 'approved'].includes(existing.status)) {
      return res.status(400).json({ error: 'Only approved or implemented ECOs can be released.' });
    }

    const [updated] = await db
      .update(engineeringChangeOrders)
      .set({
        status: 'released',
        ...(parsed.data.releaseLinkage !== undefined ? { releaseLinkage: parsed.data.releaseLinkage } : {}),
        releasedBy: actorFromRequest(req, parsed.data.actor),
        releasedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(engineeringChangeOrders.id, req.params.id))
      .returning();
    await logEngineeringControlEvent(req, {
      eventType: 'ENGINEERING_ECO_RELEASED',
      subjectType: 'engineering_eco',
      subjectId: updated.id,
      payload: {
        ecoId: updated.id,
        ecoNumber: updated.ecoNumber,
        priorStatus: existing.status,
        status: updated.status,
        releasedBy: updated.releasedBy,
        releasedAt: updated.releasedAt,
        releaseLinkage: updated.releaseLinkage ?? null,
      },
    });
    return res.json(updated);
  } catch (error: any) {
    console.error('[EngineeringControl] ECO release error:', error);
    return res.status(500).json({ error: 'Failed to release ECO', detail: error?.message });
  }
});

router.post('/ecos/:id/link-revision', authenticateToken, requirePermission('engineering.release_revision'), async (req: Request, res: Response) => {
  try {
    const parsed = insertEngineeringEcoRevisionLinkSchema.safeParse({
      ...req.body,
      ecoId: req.params.id,
      createdBy: actorFromRequest(req, req.body?.createdBy),
    });
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });

    const [created] = await db.insert(engineeringEcoRevisionLinks).values(parsed.data).returning();
    await logEngineeringControlEvent(req, {
      eventType: 'ENGINEERING_ECO_REVISION_LINKED',
      subjectType: 'engineering_eco',
      subjectId: req.params.id,
      payload: {
        ecoId: req.params.id,
        revisionId: created.revisionId,
        linkType: created.linkType,
        createdBy: created.createdBy,
      },
    });
    return res.status(201).json(created);
  } catch (error: any) {
    console.error('[EngineeringControl] ECO link revision error:', error);
    return res.status(500).json({ error: 'Failed to link revision to ECO', detail: error?.message });
  }
});

export default router;
