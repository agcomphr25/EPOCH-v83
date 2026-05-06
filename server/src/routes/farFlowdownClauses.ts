/**
 * FAR Flowdown Clause Library — Task #83
 * Admin-managed list of clauses with applicability rules; per-PO selection lives in vendor_po_far_flowdowns.
 */
import { Router, Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import {
  farFlowdownClauses,
  vendorPoFarFlowdowns,
  insertFarFlowdownClauseSchema,
} from '../../schema';
import { requirePermission } from '../../middleware/requirePermission';
import { auditService } from '../services/auditService';

const router = Router();

// PUBLIC clause library list (any user with view requisitions can read)
router.get('/', requirePermission('purchasing.view_requisitions'), async (_req: Request, res: Response) => {
  const rows = await db.select().from(farFlowdownClauses)
    .where(eq(farFlowdownClauses.isActive, true))
    .orderBy(farFlowdownClauses.clauseNumber);
  res.json(rows);
});

router.post('/', requirePermission('purchasing.admin_chain'), async (req: Request, res: Response) => {
  try {
    const parsed = insertFarFlowdownClauseSchema.parse(req.body);
    const [row] = await db.insert(farFlowdownClauses).values(parsed).returning();
    res.status(201).json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requirePermission('purchasing.admin_chain'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const parsed = insertFarFlowdownClauseSchema.partial().parse(req.body);
    const [row] = await db.update(farFlowdownClauses)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(farFlowdownClauses.id, id)).returning();
    res.json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requirePermission('purchasing.admin_chain'), async (req, res) => {
  await db.update(farFlowdownClauses)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(farFlowdownClauses.id, parseInt(req.params.id)));
  res.json({ ok: true });
});

// PER-PO flowdown selections (read + bulk upsert)
router.get('/po/:poId', requirePermission('purchasing.view_requisitions'), async (req, res) => {
  const poId = parseInt(req.params.poId);
  const rows = await db.select().from(vendorPoFarFlowdowns)
    .where(eq(vendorPoFarFlowdowns.vendorPoId, poId))
    .orderBy(vendorPoFarFlowdowns.id);
  res.json(rows);
});

router.put('/po/:poId', requirePermission('purchasing.manage_pos'), async (req, res) => {
  try {
    const poId = parseInt(req.params.poId);
    const schema = z.object({
      flowdowns: z.array(z.object({
        clauseId: z.number().int().positive(),
        applicable: z.boolean(),
        reasoning: z.string().min(3, 'Reasoning required'),
      })).min(1),
    });
    const { flowdowns } = schema.parse(req.body);
    const user = (req as any).user;

    // Replace existing
    await db.delete(vendorPoFarFlowdowns).where(eq(vendorPoFarFlowdowns.vendorPoId, poId));
    for (const f of flowdowns) {
      await db.insert(vendorPoFarFlowdowns).values({
        vendorPoId: poId,
        clauseId: f.clauseId,
        applicable: f.applicable,
        reasoning: f.reasoning,
        recordedByUserId: user?.id ?? null,
        recordedByDisplayName: user?.username ?? null,
      });
    }

    await auditService.logEvent({
      entityType: 'order' as any,
      entityId: String(poId),
      action: 'PO_FAR_FLOWDOWNS_RECORDED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { count: flowdowns.length, applicableCount: flowdowns.filter(f => f.applicable).length },
    }).catch(() => {});

    res.json({ ok: true, count: flowdowns.length });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.errors });
    res.status(500).json({ error: err.message });
  }
});

export default router;
