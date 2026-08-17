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
  projectFarFlowdowns,
  vendorPoFarFlowdowns,
  insertFarFlowdownClauseSchema,
} from '../../schema';
import { requirePermission } from '../../middleware/requirePermission';
import { auditService } from '../services/auditService';
import { getVendorPoFlowdownWorkspace, saveVendorPoFlowdownWorkspace } from '../services/flowdownApplicabilityService';
import { generateVendorFlowdownExhibitPdf } from '../../utils/pdf/vendorFlowdownExhibitPdf';

const router = Router();

const flowdownAnswersSchema = z.record(z.union([z.boolean(), z.null()]));

router.get('/po/:poId/workspace', requirePermission('purchasing.view_requisitions'), async (req, res) => {
  try {
    res.json(await getVendorPoFlowdownWorkspace(Number(req.params.poId)));
  } catch (error: any) {
    res.status(error?.message === 'Vendor PO not found' ? 404 : 500).json({ error: error?.message || 'Failed to load flowdown review' });
  }
});

router.put('/po/:poId/workspace', requirePermission('purchasing.manage_pos'), async (req: Request, res: Response) => {
  try {
    const payload = z.object({
      assessment: z.object({
        governmentSupported: z.boolean(),
        internalContractReference: z.string().nullable().optional(),
        sourceDocumentReference: z.string().nullable().optional(),
        discloseContractReference: z.boolean().optional(),
        procurementClass: z.enum(['UNKNOWN','COTS','COMMERCIAL_PRODUCT','COMMERCIAL_SERVICE','NONCOMMERCIAL_SUPPLY','SERVICE','CONSTRUCTION','MIXED']),
        answers: flowdownAnswersSchema,
        reviewStatus: z.enum(['DRAFT','REVIEW_REQUIRED','APPROVED','BLOCKED']),
        reviewNotes: z.string(),
      }),
      decisions: z.array(z.object({
        clauseId: z.number().int().positive(),
        decision: z.enum(['INCLUDE','EXCLUDE']),
        decisionReason: z.string(),
        recommendation: z.enum(['INCLUDE','EXCLUDE','REVIEW']),
        triggerReason: z.string(),
        inclusionMethod: z.string(),
      })),
    }).parse(req.body);
    const user = (req as any).user;
    const saved = await saveVendorPoFlowdownWorkspace({ vendorPoId: Number(req.params.poId), ...payload, actor: { id: user?.id, name: user?.username } });
    await auditService.logEvent({
      entityType: 'order' as any,
      entityId: String(req.params.poId),
      action: 'PO_FLOWDOWN_APPLICABILITY_REVIEW_SAVED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { status: saved.reviewStatus, included: payload.decisions.filter((row) => row.decision === 'INCLUDE').length, internalContractReferenceDisclosed: false },
    }).catch(() => {});
    res.json(saved);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: error.errors });
    res.status(409).json({ error: error?.message || 'Failed to save flowdown review' });
  }
});

router.get('/po/:poId/exhibit.pdf', requirePermission('purchasing.view_requisitions'), async (req, res) => {
  try {
    const workspace = await getVendorPoFlowdownWorkspace(Number(req.params.poId));
    if (workspace.assessment.reviewStatus !== 'APPROVED') return res.status(409).json({ error: 'Approve the flowdown review before generating an exhibit' });
    const pdf = await generateVendorFlowdownExhibitPdf(workspace);
    const poLabel = workspace.po.poNumber || workspace.po.id;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="AG_Flowdown_Exhibit_${poLabel}_R${workspace.assessment.exhibitRevision}.pdf"`);
    res.send(pdf);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to generate flowdown exhibit' });
  }
});

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

// PER-PROJECT flowdown continuity from purchase review checklist
router.get('/project/:projectId', requirePermission('purchasing.view_requisitions'), async (req, res) => {
  const projectId = req.params.projectId;
  const rows = await db
    .select({
      id: projectFarFlowdowns.id,
      projectId: projectFarFlowdowns.projectId,
      purchaseReviewChecklistId: projectFarFlowdowns.purchaseReviewChecklistId,
      clauseId: projectFarFlowdowns.clauseId,
      applicable: projectFarFlowdowns.applicable,
      reasoning: projectFarFlowdowns.reasoning,
      source: projectFarFlowdowns.source,
      status: projectFarFlowdowns.status,
      recordedByDisplayName: projectFarFlowdowns.recordedByDisplayName,
      createdAt: projectFarFlowdowns.createdAt,
      updatedAt: projectFarFlowdowns.updatedAt,
      clauseNumber: farFlowdownClauses.clauseNumber,
      title: farFlowdownClauses.title,
      description: farFlowdownClauses.description,
    })
    .from(projectFarFlowdowns)
    .innerJoin(farFlowdownClauses, eq(projectFarFlowdowns.clauseId, farFlowdownClauses.id))
    .where(eq(projectFarFlowdowns.projectId, projectId))
    .orderBy(farFlowdownClauses.clauseNumber);
  res.json(rows);
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
