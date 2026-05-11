import { Router, Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import {
  REQUIRED_CONTRACT_REVIEW_AREAS,
  clauseTemplates,
  contractClauses,
  contractReviewChecklistInstances,
  contractReviewChecklistTemplates,
  flowedRequirements,
  insertClauseTemplateSchema,
  insertContractClauseSchema,
  insertContractReviewChecklistTemplateSchema,
} from '../../schema';
import { requirePermission } from '../../middleware/requirePermission';
import { recordAuditEvent, type AuditPayload } from '../services/auditLedgerService';

const router = Router();

const targetTypeSchema = z.enum(['po', 'traveler', 'qc', 'supplier_po', 'cert_package']);
type ContractReviewAuditTx = Parameters<typeof recordAuditEvent>[1];

const instanceCreateSchema = z.object({
  checklistTemplateId: z.number().int().positive(),
  projectId: z.string().uuid().optional().nullable(),
  purchaseReviewChecklistId: z.number().int().positive().optional().nullable(),
  p2PurchaseOrderId: z.number().int().positive().optional().nullable(),
  vendorPoId: z.number().int().positive().optional().nullable(),
  travelerId: z.string().min(1).optional().nullable(),
  status: z.enum(['draft', 'in_review', 'submitted', 'approved']).default('in_review'),
  reviewAreaStatus: z.record(z.string(), z.unknown()).optional(),
  responses: z.record(z.string(), z.unknown()).optional(),
  targetIds: z.object({
    po: z.string().min(1).optional(),
    traveler: z.string().min(1).optional(),
    qc: z.string().min(1).optional(),
    supplier_po: z.string().min(1).optional(),
    cert_package: z.string().min(1).optional(),
  }).optional(),
});

const requirementStatusSchema = z.object({
  status: z.enum(['open', 'satisfied', 'waived', 'not_applicable']),
  evidence: z.record(z.string(), z.unknown()).optional().nullable(),
});

function displayName(req: Request): string | null {
  const user = (req as any).user;
  return user?.displayName ?? user?.fullName ?? user?.username ?? user?.email ?? (user?.id ? `user:${user.id}` : null);
}

function userId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (typeof raw === 'number') return raw;
  if (raw == null) return null;
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function auditActor(req: Request) {
  const user = (req as any).user;
  return {
    id: userId(req),
    username: displayName(req),
    role: user?.role ?? user?.primaryRole ?? null,
  };
}

async function logContractReviewEvent(
  req: Request,
  input: {
    eventType: string;
    subjectType: string;
    subjectId: string | number;
    payload?: Record<string, unknown>;
    reason?: string | null;
  },
  tx?: ContractReviewAuditTx,
) {
  await recordAuditEvent({
    eventType: input.eventType,
    subjectType: input.subjectType,
    subjectId: String(input.subjectId),
    sourceService: 'contractReview.route',
    actor: auditActor(req),
    payload: (input.payload ?? {}) as AuditPayload,
    reason: input.reason ?? null,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
    entityType: input.subjectType,
    entityId: String(input.subjectId),
    meta: {
      module: 'contract_review',
    },
  }, tx);
}

function normalizeAreas(areas: string[]): string[] {
  return areas.map((area) => area.trim().toLowerCase()).filter(Boolean);
}

function missingRequiredAreas(areas: string[]): string[] {
  const present = new Set(normalizeAreas(areas));
  return REQUIRED_CONTRACT_REVIEW_AREAS.filter((area) => !present.has(area));
}

function targetMapFromBody(body: z.infer<typeof instanceCreateSchema>): Map<string, string> {
  const targets = new Map<string, string>();
  if (body.p2PurchaseOrderId) targets.set('po', String(body.p2PurchaseOrderId));
  if (body.vendorPoId) targets.set('supplier_po', String(body.vendorPoId));
  if (body.travelerId) {
    targets.set('traveler', body.travelerId);
    targets.set('qc', body.travelerId);
  }
  if (body.p2PurchaseOrderId) targets.set('cert_package', String(body.p2PurchaseOrderId));
  else if (body.travelerId) targets.set('cert_package', body.travelerId);

  for (const [targetType, targetId] of Object.entries(body.targetIds ?? {})) {
    if (targetId) targets.set(targetType, targetId);
  }
  return targets;
}

async function loadTemplateClauseRows(templateId: number) {
  return db
    .select({
      clauseTemplateId: clauseTemplates.id,
      contractClauseId: contractClauses.id,
      clauseNumber: contractClauses.clauseNumber,
      title: contractClauses.title,
      reviewArea: clauseTemplates.reviewArea,
      requirementText: clauseTemplates.requirementText,
      requiredArtifacts: clauseTemplates.requiredArtifacts,
      flowTargets: clauseTemplates.flowTargets,
      defaultFlowTargets: contractClauses.defaultFlowTargets,
    })
    .from(clauseTemplates)
    .innerJoin(contractClauses, eq(clauseTemplates.contractClauseId, contractClauses.id))
    .where(and(
      eq(clauseTemplates.checklistTemplateId, templateId),
      eq(contractClauses.isActive, true),
    ))
    .orderBy(contractClauses.clauseNumber);
}

router.get('/templates', requirePermission('purchasing.view_requisitions'), async (_req: Request, res: Response) => {
  const templates = await db
    .select()
    .from(contractReviewChecklistTemplates)
    .where(eq(contractReviewChecklistTemplates.isActive, true))
    .orderBy(desc(contractReviewChecklistTemplates.updatedAt));
  res.json(templates);
});

router.post('/templates', requirePermission('purchasing.admin_chain'), async (req: Request, res: Response) => {
  try {
    const body = z.object({
      template: insertContractReviewChecklistTemplateSchema,
      clauseTemplates: z.array(insertClauseTemplateSchema.omit({ checklistTemplateId: true })).optional(),
    }).parse(req.body);

    const missing = missingRequiredAreas(body.template.reviewAreas);
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Contract review template is missing required review areas',
        requiredAreas: REQUIRED_CONTRACT_REVIEW_AREAS,
        missingAreas: missing,
      });
    }

    const [created] = await db.transaction(async (tx) => {
      const [template] = await tx.insert(contractReviewChecklistTemplates).values({
        ...body.template,
        createdByUserId: userId(req),
        createdByDisplayName: displayName(req),
      }).returning();

      let clauseTemplateCount = 0;
      for (const clauseTemplate of body.clauseTemplates ?? []) {
        await tx.insert(clauseTemplates).values({
          ...clauseTemplate,
          checklistTemplateId: template.id,
        });
        clauseTemplateCount += 1;
      }
      await logContractReviewEvent(req, {
        eventType: 'CONTRACT_REVIEW_TEMPLATE_CREATED',
        subjectType: 'contract_review_template',
        subjectId: template.id,
        payload: {
          templateId: template.id,
          name: template.name,
          version: template.version,
          reviewAreas: template.reviewAreas,
          requiredAreas: REQUIRED_CONTRACT_REVIEW_AREAS,
          clauseTemplateCount,
        },
      }, tx);
      return [template];
    });

    res.status(201).json(created);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.errors });
    res.status(500).json({ error: err.message ?? 'Failed to create contract review template' });
  }
});

router.get('/templates/:id/clauses', requirePermission('purchasing.view_requisitions'), async (req: Request, res: Response) => {
  const templateId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(templateId)) return res.status(400).json({ error: 'Invalid template ID' });
  res.json(await loadTemplateClauseRows(templateId));
});

router.get('/clauses', requirePermission('purchasing.view_requisitions'), async (_req: Request, res: Response) => {
  const clauses = await db
    .select()
    .from(contractClauses)
    .where(eq(contractClauses.isActive, true))
    .orderBy(contractClauses.clauseNumber);
  res.json(clauses);
});

router.post('/clauses', requirePermission('purchasing.admin_chain'), async (req: Request, res: Response) => {
  try {
    const parsed = insertContractClauseSchema.parse(req.body);
    const [created] = await db.transaction(async (tx) => {
      const [clause] = await tx.insert(contractClauses).values(parsed).returning();
      await logContractReviewEvent(req, {
        eventType: 'CONTRACT_CLAUSE_CREATED',
        subjectType: 'contract_clause',
        subjectId: clause.id,
        payload: {
          clauseId: clause.id,
          clauseNumber: clause.clauseNumber,
          title: clause.title,
          clauseType: clause.clauseType,
          source: clause.source,
          defaultFlowTargets: clause.defaultFlowTargets ?? [],
        },
      }, tx);
      return [clause];
    });
    res.status(201).json(created);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.errors });
    res.status(500).json({ error: err.message ?? 'Failed to create contract clause' });
  }
});

router.post('/templates/:id/clause-templates', requirePermission('purchasing.admin_chain'), async (req: Request, res: Response) => {
  try {
    const templateId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(templateId)) return res.status(400).json({ error: 'Invalid template ID' });

    const parsed = insertClauseTemplateSchema.parse({
      ...req.body,
      checklistTemplateId: templateId,
    });
    const [created] = await db.transaction(async (tx) => {
      const [clauseTemplate] = await tx.insert(clauseTemplates).values(parsed).returning();
      await logContractReviewEvent(req, {
        eventType: 'CONTRACT_CLAUSE_TEMPLATE_LINKED',
        subjectType: 'clause_template',
        subjectId: clauseTemplate.id,
        payload: {
          clauseTemplateId: clauseTemplate.id,
          checklistTemplateId: clauseTemplate.checklistTemplateId,
          contractClauseId: clauseTemplate.contractClauseId,
          reviewArea: clauseTemplate.reviewArea,
          flowTargets: clauseTemplate.flowTargets ?? [],
          requiredArtifacts: clauseTemplate.requiredArtifacts ?? [],
          required: clauseTemplate.required,
        },
      }, tx);
      return [clauseTemplate];
    });
    res.status(201).json(created);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.errors });
    res.status(500).json({ error: err.message ?? 'Failed to create clause template' });
  }
});

router.get('/instances/:id', requirePermission('purchasing.view_requisitions'), async (req: Request, res: Response) => {
  const id = req.params.id;
  const [instance] = await db
    .select()
    .from(contractReviewChecklistInstances)
    .where(eq(contractReviewChecklistInstances.id, id))
    .limit(1);
  if (!instance) return res.status(404).json({ error: 'Contract review instance not found' });

  const requirements = await db
    .select()
    .from(flowedRequirements)
    .where(eq(flowedRequirements.contractReviewInstanceId, id))
    .orderBy(flowedRequirements.targetType);
  res.json({ instance, requirements });
});

router.post('/instances', requirePermission('purchasing.manage_pos'), async (req: Request, res: Response) => {
  try {
    const body = instanceCreateSchema.parse(req.body);
    const [template] = await db
      .select()
      .from(contractReviewChecklistTemplates)
      .where(eq(contractReviewChecklistTemplates.id, body.checklistTemplateId))
      .limit(1);

    if (!template || !template.isActive) {
      return res.status(404).json({ error: 'Active contract review template not found' });
    }

    const missing = missingRequiredAreas(template.reviewAreas);
    if (missing.length > 0) {
      return res.status(409).json({
        error: 'Contract review template is not ready for use',
        requiredAreas: REQUIRED_CONTRACT_REVIEW_AREAS,
        missingAreas: missing,
      });
    }

    const targetIds = targetMapFromBody(body);
    const templateClauses = await loadTemplateClauseRows(body.checklistTemplateId);
    const actorId = userId(req);
    const actorName = displayName(req);

    const result = await db.transaction(async (tx) => {
      const reviewAreaStatus = body.reviewAreaStatus ?? Object.fromEntries(
        REQUIRED_CONTRACT_REVIEW_AREAS.map((area) => [area, { status: 'pending' }]),
      );

      const [instance] = await tx.insert(contractReviewChecklistInstances).values({
        checklistTemplateId: body.checklistTemplateId,
        projectId: body.projectId ?? null,
        purchaseReviewChecklistId: body.purchaseReviewChecklistId ?? null,
        p2PurchaseOrderId: body.p2PurchaseOrderId ?? null,
        vendorPoId: body.vendorPoId ?? null,
        travelerId: body.travelerId ?? null,
        status: body.status,
        reviewAreaStatus,
        responses: body.responses ?? {},
        missingReviewAreas: [],
        createdByUserId: actorId,
        createdByDisplayName: actorName,
        submittedAt: body.status === 'submitted' || body.status === 'approved' ? new Date() : null,
        approvedAt: body.status === 'approved' ? new Date() : null,
      }).returning();

      const flowed = [];
      for (const clause of templateClauses) {
        const requestedTargets = clause.flowTargets?.length
          ? clause.flowTargets
          : clause.defaultFlowTargets ?? [];

        for (const targetType of requestedTargets) {
          const targetId = targetIds.get(targetType);
          if (!targetId) continue;
          const [requirement] = await tx.insert(flowedRequirements).values({
            contractReviewInstanceId: instance.id,
            contractClauseId: clause.contractClauseId,
            clauseTemplateId: clause.clauseTemplateId,
            targetType,
            targetId,
            requirementText: clause.requirementText,
            requiredArtifacts: clause.requiredArtifacts ?? [],
            status: 'open',
            source: 'contract_review',
          }).onConflictDoNothing().returning();
          if (requirement) flowed.push(requirement);
        }
      }

      await logContractReviewEvent(req, {
        eventType: 'CONTRACT_REVIEW_ENGINE_COMPLETED',
        subjectType: 'contract_review',
        subjectId: instance.id,
        payload: {
          instanceId: instance.id,
          checklistTemplateId: instance.checklistTemplateId,
          status: instance.status,
          projectId: instance.projectId ?? null,
          purchaseReviewChecklistId: instance.purchaseReviewChecklistId ?? null,
          p2PurchaseOrderId: instance.p2PurchaseOrderId ?? null,
          vendorPoId: instance.vendorPoId ?? null,
          travelerId: instance.travelerId ?? null,
          targetSummary: Object.fromEntries(targetIds),
          flowedRequirementCount: flowed.length,
        },
      }, tx);

      await logContractReviewEvent(req, {
        eventType: 'CONTRACT_FLOWDOWN_RECORDED',
        subjectType: 'contract_review',
        subjectId: instance.id,
        payload: {
          instanceId: instance.id,
          targetSummary: Object.fromEntries(targetIds),
          requirements: flowed.map((requirement) => ({
            id: requirement.id,
            contractClauseId: requirement.contractClauseId,
            clauseTemplateId: requirement.clauseTemplateId,
            targetType: requirement.targetType,
            targetId: requirement.targetId,
            status: requirement.status,
            requiredArtifacts: requirement.requiredArtifacts ?? [],
          })),
        },
      }, tx);

      return { instance, flowedRequirements: flowed };
    });

    res.status(201).json({
      ...result,
      targetSummary: Object.fromEntries(targetIds),
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.errors });
    res.status(500).json({ error: err.message ?? 'Failed to create contract review instance' });
  }
});

router.get('/requirements', requirePermission('purchasing.view_requisitions'), async (req: Request, res: Response) => {
  const parsed = z.object({
    targetType: targetTypeSchema,
    targetId: z.string().min(1),
  }).safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({ error: 'targetType and targetId are required', issues: parsed.error.errors });
  }

  const rows = await db
    .select()
    .from(flowedRequirements)
    .where(and(
      eq(flowedRequirements.targetType, parsed.data.targetType),
      eq(flowedRequirements.targetId, parsed.data.targetId),
    ))
    .orderBy(desc(flowedRequirements.flowedAt));
  res.json(rows);
});

router.patch('/requirements/:id/status', requirePermission('purchasing.manage_pos'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const body = requirementStatusSchema.parse(req.body);
    const satisfied = body.status === 'satisfied';
    const [updated] = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(flowedRequirements)
        .where(eq(flowedRequirements.id, id))
        .limit(1);

      if (!existing) return [];

      const [requirement] = await tx
        .update(flowedRequirements)
        .set({
          status: body.status,
          evidence: body.evidence ?? null,
          satisfiedAt: satisfied ? new Date() : null,
          satisfiedByUserId: satisfied ? userId(req) : null,
          satisfiedByDisplayName: satisfied ? displayName(req) : null,
          updatedAt: new Date(),
        })
        .where(eq(flowedRequirements.id, id))
        .returning();

      if (!requirement) return [];

      await logContractReviewEvent(req, {
        eventType: satisfied ? 'CONTRACT_FLOWDOWN_REQUIREMENT_SATISFIED' : 'CONTRACT_FLOWDOWN_REQUIREMENT_CHANGED',
        subjectType: 'flowed_requirement',
        subjectId: id,
        payload: {
          requirementId: id,
          contractReviewInstanceId: requirement.contractReviewInstanceId,
          contractClauseId: requirement.contractClauseId ?? null,
          clauseTemplateId: requirement.clauseTemplateId ?? null,
          targetType: requirement.targetType,
          targetId: requirement.targetId,
          previousStatus: existing.status,
          newStatus: requirement.status,
          evidence: body.evidence ?? null,
          requiredArtifacts: requirement.requiredArtifacts ?? [],
          satisfiedAt: requirement.satisfiedAt ?? null,
          satisfiedByUserId: requirement.satisfiedByUserId ?? null,
          satisfiedByDisplayName: requirement.satisfiedByDisplayName ?? null,
        },
        reason: body.status,
      }, tx);

      return [requirement];
    });

    if (!updated) return res.status(404).json({ error: 'Flowed requirement not found' });
    res.json(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.errors });
    res.status(500).json({ error: err.message ?? 'Failed to update flowed requirement' });
  }
});

export default router;
