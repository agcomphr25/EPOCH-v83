import { Router, Request, Response } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  designControlChanges,
  designControlRecords,
  designControlReleaseGate,
  designControlRequirements,
  designControlReviews,
  designControlRisks,
  designControlSteps,
  designControlValidation,
  designControlVerification,
  insertDesignControlRecordSchema,
} from '../../schema';

const router = Router();

type StepPayload = {
  formData?: Record<string, unknown>;
  checklist?: Record<string, unknown>;
  approvals?: Record<string, unknown>;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
  status?: string;
};

const workflowSteps = [
  { key: '1', title: 'Design Project Intake' },
  { key: '2', title: 'Design Planning' },
  { key: '3', title: 'Design Inputs / Requirements' },
  { key: '4', title: 'Requirements Review Checklist' },
  { key: '5', title: 'Design Risk Assessment' },
  { key: '6', title: 'Concept Design Review' },
  { key: '7', title: 'Detailed Design Outputs' },
  { key: '8', title: 'Prototype Build Record' },
  { key: '9', title: 'Design Verification' },
  { key: '10', title: 'Design Validation' },
  { key: '11', title: 'Final Design Review' },
  { key: '12', title: 'Design Production Release Gate' },
];

const requiredStepKeys = workflowSteps.filter((step) => step.key !== '12').map((step) => step.key);

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return isRecordObject(value) ? value : {};
}

function normalizeAttachments(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function deriveStatus(payload: StepPayload) {
  if (typeof payload.status === 'string' && payload.status.trim()) {
    return payload.status.trim();
  }
  const formData = normalizeJsonObject(payload.formData);
  const checklist = normalizeJsonObject(payload.checklist);
  const approvals = normalizeJsonObject(payload.approvals);
  const fieldsFilled = Object.values(formData).some((value) => String(value ?? '').trim().length > 0);
  const checklistComplete = Object.values(checklist).length > 0 && Object.values(checklist).every(Boolean);
  const approvalsComplete = Object.values(approvals).length > 0 && Object.values(approvals).every(Boolean);

  if (approvalsComplete && (checklistComplete || Object.values(checklist).length === 0) && fieldsFilled) {
    return 'approved';
  }
  if (fieldsFilled || checklistComplete || approvalsComplete) {
    return 'needs_approval';
  }
  return 'incomplete';
}

async function getRecord(id: string) {
  const [record] = await db.select().from(designControlRecords).where(eq(designControlRecords.id, id)).limit(1);
  return record;
}

async function getSteps(recordId: string) {
  return db.select().from(designControlSteps).where(eq(designControlSteps.recordId, recordId));
}

async function ensureWorkflowSteps(record: typeof designControlRecords.$inferSelect) {
  for (const step of workflowSteps) {
    await db
      .insert(designControlSteps)
      .values({
        recordId: record.id,
        stepKey: step.key,
        title: step.title,
        status: 'incomplete',
        projectId: record.projectId,
        productionWorkOrderId: record.productionWorkOrderId,
        p2PurchaseOrderId: record.p2PurchaseOrderId,
        formData: {},
        checklist: {},
        approvals: {},
        attachments: [],
        metadata: { source: 'qms-design-control' },
      })
      .onConflictDoNothing();
  }
}

async function buildReadiness(recordId: string) {
  const steps = await getSteps(recordId);
  const byKey = new Map(steps.map((step) => [step.stepKey, step]));
  const missingItems: string[] = [];

  for (const step of workflowSteps) {
    const persisted = byKey.get(step.key);
    if (!persisted) {
      missingItems.push(`Step ${step.key} ${step.title}: record is missing`);
      continue;
    }
    if (step.key !== '12' && persisted.status !== 'approved') {
      missingItems.push(`Step ${step.key} ${step.title}: approval required before Design Production Release Gate`);
    }
  }

  const releaseStep = byKey.get('12');
  if (!releaseStep) {
    missingItems.push('Release Gate: step 12 record is missing');
  } else {
    const releaseChecklist = normalizeJsonObject(releaseStep.checklist);
    const releaseApprovals = normalizeJsonObject(releaseStep.approvals);
    Object.entries(releaseChecklist)
      .filter(([, value]) => !value)
      .forEach(([key]) => missingItems.push(`Release Gate checklist incomplete: ${key}`));
    Object.entries(releaseApprovals)
      .filter(([, value]) => !value)
      .forEach(([key]) => missingItems.push(`Release Gate approval missing: ${key}`));
  }

  return {
    ready: missingItems.length === 0,
    missingItems,
    steps: workflowSteps.map((step) => ({
      key: step.key,
      title: step.title,
      status: byKey.get(step.key)?.status ?? 'missing',
    })),
  };
}

async function upsertReleaseGate(record: typeof designControlRecords.$inferSelect, payload: StepPayload, gateStatus: string) {
  const values = {
    recordId: record.id,
    gateStatus,
    projectId: record.projectId,
    productionWorkOrderId: record.productionWorkOrderId,
    p2PurchaseOrderId: record.p2PurchaseOrderId,
    formData: normalizeJsonObject(payload.formData),
    checklist: normalizeJsonObject(payload.checklist),
    approvals: normalizeJsonObject(payload.approvals),
    attachments: normalizeAttachments(payload.attachments),
    metadata: normalizeJsonObject(payload.metadata),
    updatedAt: new Date(),
  };

  await db
    .insert(designControlReleaseGate)
    .values(values)
    .onConflictDoUpdate({
      target: designControlReleaseGate.recordId,
      set: values,
    });
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const records = await db
      .select()
      .from(designControlRecords)
      .orderBy(desc(designControlRecords.updatedAt), desc(designControlRecords.createdAt));
    res.json({ records });
  } catch (error) {
    console.error('[qms-design-control] Failed to list records', error);
    res.status(500).json({ message: 'Failed to load design control records' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = insertDesignControlRecordSchema.safeParse({
      title: req.body?.title || 'New Design Control Record',
      recordNumber: req.body?.recordNumber ?? null,
      status: req.body?.status || 'draft',
      projectId: req.body?.projectId ?? null,
      productionWorkOrderId: req.body?.productionWorkOrderId ?? null,
      p2PurchaseOrderId: req.body?.p2PurchaseOrderId ?? null,
      formData: normalizeJsonObject(req.body?.formData),
      checklist: normalizeJsonObject(req.body?.checklist),
      approvals: normalizeJsonObject(req.body?.approvals),
      attachments: normalizeAttachments(req.body?.attachments),
      metadata: normalizeJsonObject(req.body?.metadata),
    });

    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid design control record', issues: parsed.error.issues });
      return;
    }

    const [record] = await db.insert(designControlRecords).values(parsed.data).returning();
    await ensureWorkflowSteps(record);
    await upsertReleaseGate(record, {}, 'not_ready');

    res.status(201).json({ record });
  } catch (error) {
    console.error('[qms-design-control] Failed to create record', error);
    res.status(500).json({ message: 'Failed to create design control record' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const record = await getRecord(req.params.id);
    if (!record) {
      res.status(404).json({ message: 'Design control record not found' });
      return;
    }

    await ensureWorkflowSteps(record);
    const [
      steps,
      requirements,
      risks,
      reviews,
      verification,
      validation,
      changes,
      releaseGate,
    ] = await Promise.all([
      getSteps(record.id),
      db.select().from(designControlRequirements).where(eq(designControlRequirements.recordId, record.id)),
      db.select().from(designControlRisks).where(eq(designControlRisks.recordId, record.id)),
      db.select().from(designControlReviews).where(eq(designControlReviews.recordId, record.id)),
      db.select().from(designControlVerification).where(eq(designControlVerification.recordId, record.id)),
      db.select().from(designControlValidation).where(eq(designControlValidation.recordId, record.id)),
      db.select().from(designControlChanges).where(eq(designControlChanges.recordId, record.id)),
      db.select().from(designControlReleaseGate).where(eq(designControlReleaseGate.recordId, record.id)),
    ]);

    res.json({
      record,
      steps,
      requirements,
      risks,
      reviews,
      verification,
      validation,
      changes,
      releaseGate: releaseGate[0] ?? null,
    });
  } catch (error) {
    console.error('[qms-design-control] Failed to load record', error);
    res.status(500).json({ message: 'Failed to load design control record' });
  }
});

router.patch('/:id/steps/:stepKey', async (req: Request, res: Response) => {
  try {
    const record = await getRecord(req.params.id);
    if (!record) {
      res.status(404).json({ message: 'Design control record not found' });
      return;
    }

    const step = workflowSteps.find((item) => item.key === req.params.stepKey);
    if (!step) {
      res.status(404).json({ message: 'Design control step not found' });
      return;
    }

    await ensureWorkflowSteps(record);

    const payload: StepPayload = {
      formData: normalizeJsonObject(req.body?.formData),
      checklist: normalizeJsonObject(req.body?.checklist),
      approvals: normalizeJsonObject(req.body?.approvals),
      attachments: normalizeAttachments(req.body?.attachments),
      metadata: normalizeJsonObject(req.body?.metadata),
      status: req.body?.status,
    };
    const status = deriveStatus(payload);

    if (step.key === '12' && status === 'approved') {
      const approvedSteps = await db
        .select({ stepKey: designControlSteps.stepKey })
        .from(designControlSteps)
        .where(and(
          eq(designControlSteps.recordId, record.id),
          inArray(designControlSteps.stepKey, requiredStepKeys),
          eq(designControlSteps.status, 'approved')
        ));

      if (approvedSteps.length < requiredStepKeys.length) {
        const readiness = await buildReadiness(record.id);
        res.status(422).json({
          message: 'Step 12 cannot be approved until steps 1-11 are approved',
          missingItems: readiness.missingItems,
        });
        return;
      }
    }

    const values = {
      recordId: record.id,
      stepKey: step.key,
      title: step.title,
      status,
      projectId: record.projectId,
      productionWorkOrderId: record.productionWorkOrderId,
      p2PurchaseOrderId: record.p2PurchaseOrderId,
      formData: payload.formData ?? {},
      checklist: payload.checklist ?? {},
      approvals: payload.approvals ?? {},
      attachments: payload.attachments ?? [],
      metadata: payload.metadata ?? {},
      approvedAt: status === 'approved' ? new Date() : null,
      updatedAt: new Date(),
    };

    const [updatedStep] = await db
      .insert(designControlSteps)
      .values(values)
      .onConflictDoUpdate({
        target: [designControlSteps.recordId, designControlSteps.stepKey],
        set: values,
      })
      .returning();

    if (step.key === '12') {
      await upsertReleaseGate(record, payload, status === 'approved' ? 'approved' : 'not_ready');
    }

    await db
      .update(designControlRecords)
      .set({
        status: status === 'approved' && step.key === '12' ? 'release_ready' : 'active',
        updatedAt: sql`now()`,
      })
      .where(eq(designControlRecords.id, record.id));

    const readiness = await buildReadiness(record.id);
    res.json({ step: updatedStep, readiness });
  } catch (error) {
    console.error('[qms-design-control] Failed to patch step', error);
    res.status(500).json({ message: 'Failed to save design control step' });
  }
});

router.post('/:id/submit-release', async (req: Request, res: Response) => {
  try {
    const record = await getRecord(req.params.id);
    if (!record) {
      res.status(404).json({ message: 'Design control record not found' });
      return;
    }

    await ensureWorkflowSteps(record);
    const readiness = await buildReadiness(record.id);
    if (!readiness.ready) {
      res.status(422).json({
        message: 'Design Production Release Gate is not ready',
        missingItems: readiness.missingItems,
      });
      return;
    }

    const now = new Date();
    await db
      .update(designControlSteps)
      .set({ status: 'approved', approvedAt: now, updatedAt: now })
      .where(and(eq(designControlSteps.recordId, record.id), eq(designControlSteps.stepKey, '12')));

    await db
      .update(designControlReleaseGate)
      .set({ gateStatus: 'approved', submittedAt: now, releasedAt: now, updatedAt: now })
      .where(eq(designControlReleaseGate.recordId, record.id));

    const [updatedRecord] = await db
      .update(designControlRecords)
      .set({ status: 'release_ready', submittedAt: now, releasedAt: now, updatedAt: now })
      .where(eq(designControlRecords.id, record.id))
      .returning();

    res.json({ record: updatedRecord, readiness: await buildReadiness(record.id) });
  } catch (error) {
    console.error('[qms-design-control] Failed to submit release gate', error);
    res.status(500).json({ message: 'Failed to submit design production release gate' });
  }
});

router.get('/:id/readiness', async (req: Request, res: Response) => {
  try {
    const record = await getRecord(req.params.id);
    if (!record) {
      res.status(404).json({ message: 'Design control record not found' });
      return;
    }

    await ensureWorkflowSteps(record);
    res.json(await buildReadiness(record.id));
  } catch (error) {
    console.error('[qms-design-control] Failed to compute readiness', error);
    res.status(500).json({ message: 'Failed to compute design control readiness' });
  }
});

export default router;
