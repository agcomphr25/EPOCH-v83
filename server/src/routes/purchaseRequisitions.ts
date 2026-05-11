/**
 * Purchase Requisitions — Task #83
 * Requisition → approval chain → PO conversion, with FAR flowdown + debarment evidence.
 */
import { Router, Request, Response } from 'express';
import { eq, desc, and, sql, gte, isNull, or, lte } from 'drizzle-orm';
import { db } from '../../db';
import {
  purchaseRequisitions,
  purchaseRequisitionLines,
  purchaseRequisitionApprovals,
  purchaseRequisitionApprovalChain,
  vendorDebarmentChecks,
  insertPurchaseRequisitionSchema,
  insertPurchaseRequisitionLineSchema,
  procurementSettings,
} from '../../schema';
import { z } from 'zod';
import { requirePermission } from '../../middleware/requirePermission';
import { auditService } from '../services/auditService';
import { getUserPermissions } from '../services/permissionService';
import { getSection6ApprovalStages } from '../services/procurementControlsService';

const router = Router();

const createReqSchema = insertPurchaseRequisitionSchema.extend({
  lines: z.array(insertPurchaseRequisitionLineSchema.omit({ requisitionId: true, lineNumber: true })).min(1, 'At least one line item required'),
});

async function nextReqNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db.execute(
    sql`SELECT COALESCE(MAX(CAST(SPLIT_PART(req_number, '-', 3) AS INTEGER)), 0) AS maxn
        FROM purchase_requisitions WHERE req_number LIKE ${`REQ-${year}-%`}`
  );
  const rows = (result as any).rows ?? result;
  const next = (rows[0]?.maxn ?? 0) + 1;
  return `REQ-${year}-${String(next).padStart(5, '0')}`;
}

async function buildApprovalStages(category: string, amount: number): Promise<Array<{ stage: number; capability: string }>> {
  const chain = await db.select().from(purchaseRequisitionApprovalChain).where(
    and(
      eq(purchaseRequisitionApprovalChain.isActive, true),
      or(
        eq(purchaseRequisitionApprovalChain.category, category),
        eq(purchaseRequisitionApprovalChain.category, 'default'),
      ),
    ),
  );
  const matching = chain.filter((c: any) => {
    const min = Number(c.minAmount ?? 0);
    const max = c.maxAmount === null || c.maxAmount === undefined ? Infinity : Number(c.maxAmount);
    return amount >= min && amount <= max;
  });
  if (matching.length === 0) {
    return getSection6ApprovalStages(amount).map(({ stage, capability }) => ({ stage, capability }));
  }
  if (matching.every((m: any) => m.category === 'default' && m.capability === 'purchasing.approve_requisition')) {
    return getSection6ApprovalStages(amount).map(({ stage, capability }) => ({ stage, capability }));
  }
  const sorted = matching
    .filter((m: any) => m.category === category || matching.every((x: any) => x.category === 'default'))
    .sort((a: any, b: any) => a.stage - b.stage);
  // Prefer category-specific over default if both present at same stage
  const byStage = new Map<number, any>();
  for (const m of sorted) {
    const existing = byStage.get(m.stage);
    if (!existing || (existing.category === 'default' && m.category !== 'default')) {
      byStage.set(m.stage, m);
    }
  }
  return Array.from(byStage.values()).sort((a, b) => a.stage - b.stage).map(m => ({ stage: m.stage, capability: m.capability }));
}

// LIST
router.get('/', requirePermission('purchasing.view_requisitions'), async (req: Request, res: Response) => {
  try {
    const { status, mine } = req.query;
    const where: any[] = [];
    if (status) where.push(eq(purchaseRequisitions.status, String(status)));
    if (mine === 'true' && (req as any).user?.id) {
      where.push(eq(purchaseRequisitions.requestedByUserId, (req as any).user.id));
    }
    const rows = await db.select().from(purchaseRequisitions)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(purchaseRequisitions.createdAt))
      .limit(500);
    res.json(rows);
  } catch (err: any) {
    console.error('[requisitions] list error', err);
    res.status(500).json({ error: err.message });
  }
});

// PENDING APPROVAL QUEUE — for current user based on capabilities
router.get('/pending-approval', requirePermission('purchasing.view_requisitions'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { permissionSet } = await getUserPermissions(user.id, user.role);
    // Bypass for admins
    const isAdmin = user.role === 'ADMIN' || user.role === 'OWNER';

    const submitted = await db.select().from(purchaseRequisitions)
      .where(eq(purchaseRequisitions.status, 'SUBMITTED'))
      .orderBy(desc(purchaseRequisitions.submittedAt));

    const result: any[] = [];
    for (const r of submitted) {
      const approvals = await db.select().from(purchaseRequisitionApprovals)
        .where(eq(purchaseRequisitionApprovals.requisitionId, r.id))
        .orderBy(purchaseRequisitionApprovals.stage);
      const nextPending = approvals.find((a: any) => !a.decision);
      if (!nextPending) continue;
      if (isAdmin || permissionSet.has(nextPending.capability)) {
        result.push({ ...r, currentStage: nextPending });
      }
    }
    res.json(result);
  } catch (err: any) {
    console.error('[requisitions] pending error', err);
    res.status(500).json({ error: err.message });
  }
});

// ADMIN PENDING BY STAGE — grouped queue view with aging in days, plus
// escalation flag for items older than the configured aging threshold.
// Task #83.
router.get('/admin/pending-by-stage', requirePermission('purchasing.admin_chain'), async (req: Request, res: Response) => {
  try {
    const agingThresholdDays = Math.max(1, parseInt(String((req.query as any).agingDays ?? '5')) || 5);
    const submitted = await db.select().from(purchaseRequisitions)
      .where(eq(purchaseRequisitions.status, 'SUBMITTED'))
      .orderBy(desc(purchaseRequisitions.submittedAt));

    const now = Date.now();
    const stages: Record<string, any[]> = {};
    for (const r of submitted) {
      const approvals = await db.select().from(purchaseRequisitionApprovals)
        .where(eq(purchaseRequisitionApprovals.requisitionId, r.id))
        .orderBy(purchaseRequisitionApprovals.stage);
      const next = approvals.find((a: any) => !a.decision);
      if (!next) continue;
      const submittedAt = r.submittedAt ? new Date(r.submittedAt).getTime() : now;
      const ageDays = Math.floor((now - submittedAt) / 86_400_000);
      const escalated = ageDays >= agingThresholdDays;
      const key = `stage_${next.stage}_${next.capability}`;
      (stages[key] ??= []).push({
        ...r,
        currentStage: next,
        ageDays,
        escalated,
      });
    }

    // Sort each bucket: escalated first, then oldest first
    for (const k of Object.keys(stages)) {
      stages[k].sort((a, b) => (Number(b.escalated) - Number(a.escalated)) || (b.ageDays - a.ageDays));
    }

    const totals = Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, {
      count: v.length,
      escalatedCount: v.filter(x => x.escalated).length,
      maxAgeDays: v.reduce((m, x) => Math.max(m, x.ageDays), 0),
    }]));

    res.json({ agingThresholdDays, stages, totals });
  } catch (err: any) {
    console.error('[requisitions] pending-by-stage error', err);
    res.status(500).json({ error: err.message });
  }
});

// GET ONE (with lines + approvals)
router.get('/:id', requirePermission('purchasing.view_requisitions'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [r] = await db.select().from(purchaseRequisitions).where(eq(purchaseRequisitions.id, id));
    if (!r) return res.status(404).json({ error: 'Not found' });
    const lines = await db.select().from(purchaseRequisitionLines)
      .where(eq(purchaseRequisitionLines.requisitionId, id))
      .orderBy(purchaseRequisitionLines.lineNumber);
    const approvals = await db.select().from(purchaseRequisitionApprovals)
      .where(eq(purchaseRequisitionApprovals.requisitionId, id))
      .orderBy(purchaseRequisitionApprovals.stage);
    const debarmentChecks = r.vendorId
      ? await db.select().from(vendorDebarmentChecks)
          .where(and(
            eq(vendorDebarmentChecks.vendorId, r.vendorId),
            eq(vendorDebarmentChecks.context, 'requisition_approval'),
            eq(vendorDebarmentChecks.contextRefId, id),
          ))
          .orderBy(desc(vendorDebarmentChecks.checkedAt))
      : [];
    res.json({ ...r, lines, approvals, debarmentChecks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE (DRAFT)
router.post('/', requirePermission('purchasing.create_requisition'), async (req: Request, res: Response) => {
  try {
    const parsed = createReqSchema.parse(req.body);
    const user = (req as any).user;
    const reqNumber = await nextReqNumber();

    if (parsed.competitionMethod === 'sole-source' && !parsed.soleSourceJustification?.trim()) {
      return res.status(400).json({ error: 'Sole-source justification required when competition method is sole-source' });
    }

    const [created] = await db.insert(purchaseRequisitions).values({
      reqNumber,
      status: 'DRAFT',
      projectId: parsed.projectId ?? null,
      chargeCodeId: parsed.chargeCodeId ?? null,
      category: parsed.category ?? 'default',
      vendorId: parsed.vendorId ?? null,
      estimatedTotal: parsed.estimatedTotal,
      needByDate: parsed.needByDate ?? null,
      justification: parsed.justification,
      competitionMethod: parsed.competitionMethod,
      soleSourceJustification: parsed.soleSourceJustification ?? null,
      requestedByUserId: user?.id ?? null,
      requestedByDisplayName: user?.username ?? user?.displayName ?? null,
      notes: parsed.notes ?? null,
    }).returning();

    for (let i = 0; i < parsed.lines.length; i++) {
      const l = parsed.lines[i];
      await db.insert(purchaseRequisitionLines).values({
        requisitionId: created.id,
        lineNumber: i + 1,
        description: l.description,
        partNumber: l.partNumber ?? null,
        quantity: l.quantity,
        unit: l.unit ?? null,
        unitPrice: l.unitPrice ?? 0,
        lineTotal: (l.quantity ?? 0) * (l.unitPrice ?? 0),
        notes: l.notes ?? null,
      });
    }

    await auditService.logEvent({
      entityType: 'order' as any, // Reusing existing audit entity type set; treat as procurement event
      entityId: String(created.id),
      action: 'REQUISITION_CREATED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { reqNumber, estimatedTotal: parsed.estimatedTotal, competitionMethod: parsed.competitionMethod },
    });

    res.status(201).json(created);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.errors });
    console.error('[requisitions] create error', err);
    res.status(500).json({ error: err.message });
  }
});

// SUBMIT — generate approval chain
router.post('/:id/submit', requirePermission('purchasing.create_requisition'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [r] = await db.select().from(purchaseRequisitions).where(eq(purchaseRequisitions.id, id));
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.status !== 'DRAFT') return res.status(400).json({ error: `Cannot submit requisition in status ${r.status}` });

    // Task #83: enforce required project / charge code at submit time so
    // every approved requisition is cost-attributable downstream.
    const missing: string[] = [];
    if (!r.projectId) missing.push('projectId');
    if (!r.chargeCodeId) missing.push('chargeCodeId');
    if (!r.justification || r.justification.trim().length < 10) missing.push('justification');
    if (missing.length > 0) {
      return res.status(422).json({
        error: 'Requisition incomplete',
        message: `Cannot submit: missing required field(s): ${missing.join(', ')}. Update the draft and try again.`,
        missing,
      });
    }
    const lineCount = await db.select().from(purchaseRequisitionLines)
      .where(eq(purchaseRequisitionLines.requisitionId, id));
    if (lineCount.length === 0) {
      return res.status(422).json({ error: 'Requisition incomplete', message: 'At least one line item is required to submit.' });
    }

    // Authz: only the original requester (or ADMIN/OWNER) may submit a draft
    const submitter = (req as any).user;
    const submitterIsAdmin = submitter?.role === 'ADMIN' || submitter?.role === 'OWNER';
    if (!submitterIsAdmin && r.requestedByUserId && r.requestedByUserId !== submitter?.id) {
      return res.status(403).json({ error: 'Only the original requester may submit this draft' });
    }

    const stages = await buildApprovalStages(r.category, Number(r.estimatedTotal));
    for (const s of stages) {
      await db.insert(purchaseRequisitionApprovals).values({
        requisitionId: id, stage: s.stage, capability: s.capability,
      });
    }
    const [updated] = await db.update(purchaseRequisitions)
      .set({ status: 'SUBMITTED', submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(purchaseRequisitions.id, id))
      .returning();

    const user = (req as any).user;
    await auditService.logEvent({
      entityType: 'order' as any,
      entityId: String(id),
      action: 'REQUISITION_SUBMITTED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { reqNumber: r.reqNumber, stages: stages.length },
    });
    res.json(updated);
  } catch (err: any) {
    console.error('[requisitions] submit error', err);
    res.status(500).json({ error: err.message });
  }
});

// APPROVE / REJECT a stage
router.post('/:id/decide', requirePermission('purchasing.view_requisitions'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { decision, notes, debarmentCheck } = req.body ?? {};
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
    }
    const [r] = await db.select().from(purchaseRequisitions).where(eq(purchaseRequisitions.id, id));
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.status !== 'SUBMITTED') return res.status(400).json({ error: `Requisition is in status ${r.status}` });

    const approvals = await db.select().from(purchaseRequisitionApprovals)
      .where(eq(purchaseRequisitionApprovals.requisitionId, id))
      .orderBy(purchaseRequisitionApprovals.stage);
    const nextPending = approvals.find((a: any) => !a.decision);
    if (!nextPending) return res.status(400).json({ error: 'No pending approval stage' });

    const user = (req as any).user;
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'OWNER';
    if (!isAdmin) {
      const { permissionSet } = await getUserPermissions(user.id, user.role);
      if (!permissionSet.has(nextPending.capability)) {
        return res.status(403).json({ error: 'You lack the required capability for this approval stage', requiredCapability: nextPending.capability });
      }
    }

    // On final-stage approval require a debarment check (vendor-bound requisitions only)
    const remainingAfter = approvals.filter((a: any) => !a.decision && a.id !== nextPending.id).length;
    const isFinalStage = decision === 'approved' && remainingAfter === 0;
    if (isFinalStage && r.vendorId) {
      // Either accept inline check payload or require an existing fresh check
      if (debarmentCheck) {
        await db.insert(vendorDebarmentChecks).values({
          vendorId: r.vendorId,
          context: 'requisition_approval',
          contextRefId: id,
          source: debarmentCheck.source ?? 'manual_attestation',
          result: debarmentCheck.result ?? 'pass',
          checkedByUserId: user?.id ?? null,
          checkedByDisplayName: user?.username ?? null,
          evidenceUrl: debarmentCheck.evidenceUrl ?? null,
          attestationText: debarmentCheck.attestationText ?? null,
          notes: debarmentCheck.notes ?? null,
        });
      } else {
        const [setting] = await db.select().from(procurementSettings).limit(1);
        const freshnessDays = setting?.debarmentCheckFreshnessDays ?? 30;
        const cutoff = new Date(Date.now() - freshnessDays * 86_400_000);
        const existing = await db.select().from(vendorDebarmentChecks).where(and(
          eq(vendorDebarmentChecks.vendorId, r.vendorId),
          gte(vendorDebarmentChecks.checkedAt, cutoff),
          eq(vendorDebarmentChecks.result, 'pass'),
        )).limit(1);
        if (existing.length === 0) {
          return res.status(422).json({ error: 'No fresh passing debarment check on file. Submit a debarmentCheck object with this approval, or record one separately first.' });
        }
      }
    }

    await db.update(purchaseRequisitionApprovals)
      .set({
        decision,
        decidedByUserId: user?.id ?? null,
        decidedByDisplayName: user?.username ?? null,
        decidedAt: new Date(),
        notes: notes ?? null,
      })
      .where(eq(purchaseRequisitionApprovals.id, nextPending.id));

    let newStatus = r.status;
    const updates: any = { updatedAt: new Date() };
    if (decision === 'rejected') {
      newStatus = 'REJECTED';
      updates.status = 'REJECTED';
      updates.rejectedAt = new Date();
      updates.rejectionReason = notes ?? 'Rejected without reason';
    } else if (isFinalStage) {
      newStatus = 'APPROVED';
      updates.status = 'APPROVED';
      updates.approvedAt = new Date();
    }
    await db.update(purchaseRequisitions).set(updates).where(eq(purchaseRequisitions.id, id));

    await auditService.logEvent({
      entityType: 'order' as any,
      entityId: String(id),
      action: decision === 'approved' ? 'REQUISITION_STAGE_APPROVED' : 'REQUISITION_REJECTED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      reason: notes,
      meta: { reqNumber: r.reqNumber, stage: nextPending.stage, finalStage: isFinalStage, newStatus },
    });

    res.json({ ok: true, status: newStatus });
  } catch (err: any) {
    console.error('[requisitions] decide error', err);
    res.status(500).json({ error: err.message });
  }
});

// CANCEL — owner can cancel own DRAFT; cancelling others' or non-DRAFT requires admin_chain capability or admin/owner role
router.post('/:id/cancel', requirePermission('purchasing.create_requisition'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body ?? {};
    const [r] = await db.select().from(purchaseRequisitions).where(eq(purchaseRequisitions.id, id));
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (['CONVERTED_TO_PO', 'CANCELLED', 'REJECTED'].includes(r.status)) {
      return res.status(400).json({ error: `Cannot cancel requisition in status ${r.status}` });
    }

    const user = (req as any).user;
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'OWNER';
    const isOwner = !!r.requestedByUserId && r.requestedByUserId === user?.id;
    const ownerCanCancelHere = isOwner && r.status === 'DRAFT';
    if (!isAdmin && !ownerCanCancelHere) {
      // Elevated: must hold admin_chain to cancel non-drafts or others' requisitions
      const { permissionSet } = await getUserPermissions(user.id, user.role);
      if (!permissionSet.has('purchasing.admin_chain')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: r.status === 'DRAFT'
            ? 'Only the original requester may cancel a draft requisition'
            : `Cancelling a ${r.status} requisition requires the purchasing.admin_chain capability`,
        });
      }
    }

    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({ error: 'Cancellation reason (≥5 chars) is required for the audit trail' });
    }

    await db.update(purchaseRequisitions).set({
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancellationReason: String(reason).trim(),
      updatedAt: new Date(),
    }).where(eq(purchaseRequisitions.id, id));

    await auditService.logEvent({
      entityType: 'order' as any,
      entityId: String(id),
      action: 'REQUISITION_CANCELLED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      reason: String(reason).trim(),
      meta: { reqNumber: r.reqNumber, priorStatus: r.status },
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// MARK CONVERTED — called by PO issue flow
router.post('/:id/mark-converted', requirePermission('purchasing.approve_po'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { vendorPoId } = req.body ?? {};
    if (!vendorPoId) return res.status(400).json({ error: 'vendorPoId required' });
    const [r] = await db.select().from(purchaseRequisitions).where(eq(purchaseRequisitions.id, id));
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.status !== 'APPROVED') return res.status(400).json({ error: `Requisition must be APPROVED (currently ${r.status})` });
    await db.update(purchaseRequisitions).set({
      status: 'CONVERTED_TO_PO',
      convertedToPoId: Number(vendorPoId),
      convertedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(purchaseRequisitions.id, id));

    const user = (req as any).user;
    await auditService.logEvent({
      entityType: 'order' as any,
      entityId: String(id),
      action: 'REQUISITION_CONVERTED_TO_PO',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { reqNumber: r.reqNumber, vendorPoId: Number(vendorPoId) },
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// APPROVAL CHAIN CONFIG admin
router.get('/admin/approval-chain', requirePermission('purchasing.admin_chain'), async (_req, res) => {
  const rows = await db.select().from(purchaseRequisitionApprovalChain).orderBy(
    purchaseRequisitionApprovalChain.category, purchaseRequisitionApprovalChain.minAmount, purchaseRequisitionApprovalChain.stage,
  );
  res.json(rows);
});

router.post('/admin/approval-chain', requirePermission('purchasing.admin_chain'), async (req, res) => {
  try {
    const schema = z.object({
      category: z.string().default('default'),
      minAmount: z.union([z.number(), z.string()]).transform(v => String(v)),
      maxAmount: z.union([z.number(), z.string()]).nullable().optional().transform(v => v == null ? null : String(v)),
      stage: z.number().int().positive(),
      capability: z.string().min(1),
      description: z.string().optional().nullable(),
      isActive: z.boolean().default(true),
    });
    const parsed = schema.parse(req.body);
    const [row] = await db.insert(purchaseRequisitionApprovalChain).values(parsed).returning();
    res.status(201).json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/approval-chain/:id', requirePermission('purchasing.admin_chain'), async (req, res) => {
  await db.delete(purchaseRequisitionApprovalChain).where(eq(purchaseRequisitionApprovalChain.id, parseInt(req.params.id)));
  res.json({ ok: true });
});

// PROCUREMENT SETTINGS
router.get('/admin/settings', requirePermission('purchasing.admin_chain'), async (_req, res) => {
  const [row] = await db.select().from(procurementSettings).limit(1);
  if (!row) {
    const [created] = await db.insert(procurementSettings).values({}).returning();
    return res.json(created);
  }
  res.json(row);
});

router.put('/admin/settings', requirePermission('purchasing.admin_chain'), async (req, res) => {
  try {
    const schema = z.object({
      debarmentCheckFreshnessDays: z.number().int().positive().optional(),
      allowDirectPo: z.boolean().optional(),
      directPoExceptionCapability: z.string().optional(),
    });
    const parsed = schema.parse(req.body);
    const existing = await db.select().from(procurementSettings).limit(1);
    if (existing.length === 0) {
      const [row] = await db.insert(procurementSettings).values(parsed).returning();
      return res.json(row);
    }
    const [row] = await db.update(procurementSettings)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(procurementSettings.id, existing[0].id)).returning();
    res.json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.errors });
    res.status(500).json({ error: err.message });
  }
});

// PROCUREMENT AUDIT REPORT — POs in period, with justification + check evidence
router.get('/audit/report', requirePermission('purchasing.view_requisitions'), async (req, res) => {
  try {
    const fromStr = String(req.query.from ?? '');
    const toStr = String(req.query.to ?? '');
    const where: any[] = [];
    if (fromStr) where.push(gte(purchaseRequisitions.createdAt, new Date(fromStr)));
    if (toStr) where.push(lte(purchaseRequisitions.createdAt, new Date(toStr)));
    const reqs = await db.select().from(purchaseRequisitions)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(purchaseRequisitions.createdAt));
    const detailed = await Promise.all(reqs.map(async (r: any) => {
      const approvals = await db.select().from(purchaseRequisitionApprovals)
        .where(eq(purchaseRequisitionApprovals.requisitionId, r.id));
      const checks = r.vendorId
        ? await db.select().from(vendorDebarmentChecks)
            .where(and(
              eq(vendorDebarmentChecks.vendorId, r.vendorId),
              eq(vendorDebarmentChecks.contextRefId, r.id),
            ))
        : [];
      return { requisition: r, approvals, debarmentChecks: checks };
    }));
    res.json({ from: fromStr, to: toStr, count: detailed.length, requisitions: detailed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
