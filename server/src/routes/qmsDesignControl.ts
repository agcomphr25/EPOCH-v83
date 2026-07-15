import { Router, Request, Response } from 'express';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';

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
import {
  canonicalManufacturingEvidenceRequirements,
  getDesignManufacturingEvidence,
  type DesignManufacturingEvidence,
} from '../services/designManufacturingEvidenceService';
import {
  getEngineeringReleasePreview,
  submitEngineeringRelease,
} from '../services/engineeringReleaseService';
import {
  assertDesignControlSchemaReady,
  designControlSchemaNotReadyPayload,
  isDesignControlSchemaNotReadyError,
} from '../services/designControlSchemaReadiness';

const router = Router();

router.use(async (_req, res, next) => {
  try {
    await assertDesignControlSchemaReady();
    next();
  } catch (error) {
    if (isDesignControlSchemaNotReadyError(error)) {
      res.status(503).json(designControlSchemaNotReadyPayload(error));
      return;
    }
    next(error);
  }
});

type StepPayload = {
  formData?: Record<string, unknown>;
  checklist?: Record<string, unknown>;
  approvals?: Record<string, unknown>;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
  status?: string;
};

const workflowSteps = [
  {
    key: '1',
    title: 'Design Project Intake',
    requiredFields: [
      'Project / customer / order link',
      'Design type',
      'Product name',
      'Intended use',
      'Customer requirements summary',
      'Target manufacturing date',
      'Responsible engineer',
      'Quality representative',
      'Manufacturing representative',
      'Required deliverables',
    ],
    requiredChecklist: [],
    requiredApprovals: ['Engineering intake approval', 'Quality intake approval'],
  },
  {
    key: '2',
    title: 'Design Planning',
    requiredFields: [
      'Design scope',
      'Design milestones',
      'Required reviews',
      'Required verification activities',
      'Required validation activities',
      'Required resources',
      'Required suppliers',
      'Required software/tools',
      'Responsibilities',
      'Approval roles',
    ],
    requiredChecklist: [],
    requiredApprovals: ['Engineering planning approval', 'Quality planning approval', 'Manufacturing planning approval'],
  },
  {
    key: '3',
    title: 'Design Inputs / Requirements',
    requiredFields: [
      'Requirement ID',
      'Requirement category',
      'Source',
      'Requirement statement',
      'Acceptance criteria',
      'Verification method',
      'Priority',
      'Owner',
      'Status',
    ],
    requiredChecklist: [
      'Customer requirements captured',
      'Performance requirements captured',
      'Regulatory requirements captured',
      'Safety requirements captured',
      'Material requirements captured',
      'Manufacturing requirements captured',
      'Inspection requirements captured',
      'Test requirements captured',
      'Packaging/shipping requirements captured',
    ],
    requiredApprovals: ['Requirements owner approval'],
  },
  {
    key: '4',
    title: 'Requirements Review Checklist',
    requiredFields: ['Review notes', 'Open requirement gaps', 'Disposition of conflicts'],
    requiredChecklist: [
      'Requirements are complete',
      'Requirements are clear',
      'Requirements are measurable',
      'Conflicts resolved',
      'Missing information documented',
      'Manufacturability reviewed',
      'Inspection requirements reviewed',
      'Test requirements reviewed',
      'Quality approval complete',
      'Engineering approval complete',
    ],
    requiredApprovals: ['Engineering approval', 'Quality approval'],
  },
  {
    key: '5',
    title: 'Design Risk Assessment',
    requiredFields: [
      'Risk item',
      'Failure mode',
      'Cause',
      'Effect',
      'Severity',
      'Occurrence',
      'Detection',
      'Risk priority',
      'Mitigation action',
      'Owner',
      'Due date',
      'Residual risk',
      'Approval status',
    ],
    requiredChecklist: [],
    requiredApprovals: ['Engineering risk approval', 'Quality risk approval'],
  },
  {
    key: '6',
    title: 'Concept Design Review',
    requiredFields: [
      'Concept summary',
      'Design alternatives considered',
      'Selected concept',
      'Reason selected',
      'Major assumptions',
      'Open questions',
      'Manufacturability concerns',
      'Quality concerns',
      'Attachments',
    ],
    requiredChecklist: [
      'Concept meets major requirements',
      'Risks reviewed',
      'Manufacturing reviewed',
      'Quality reviewed',
      'Customer needs considered',
      'Approval to proceed',
    ],
    requiredApprovals: ['Engineering concept approval', 'Quality concept approval', 'Manufacturing concept approval'],
  },
  {
    key: '7',
    title: 'Detailed Design Outputs',
    requiredFields: ['Output package notes', 'Linked drawings/BOM/revision package', 'Design output owner'],
    requiredChecklist: [
      'CAD model attached',
      'Drawing attached',
      'BOM created',
      'Material specs defined',
      'Critical characteristics defined',
      'Tolerances defined',
      'Special processes defined',
      'Inspection points defined',
      'Test requirements defined',
      'Software/firmware version defined, if applicable',
      'Supplier parts identified',
      'Revision assigned',
      'Design output approved',
    ],
    requiredApprovals: ['Engineering output approval', 'Document control approval'],
  },
  {
    key: '8',
    title: 'Prototype Build Record',
    requiredFields: [
      'Prototype serial number',
      'Build revision',
      'Build date',
      'Builder',
      'Linked BOM revision',
      'Linked drawing revisions',
      'Material lots',
      'Purchased component lots/serials',
      'Deviations used',
      'Photos',
      'Build notes',
      'Issues found',
      'Disposition',
    ],
    requiredChecklist: [],
    requiredApprovals: ['Engineering build approval', 'Quality build approval'],
  },
  {
    key: '9',
    title: 'Design Verification',
    requiredFields: [
      'Requirement ID',
      'Verification method',
      'Test/inspection performed',
      'Result',
      'Pass/fail',
      'Evidence attachment',
      'Nonconformance link',
      'Engineering disposition',
      'Verified by',
      'Date',
    ],
    requiredChecklist: [],
    requiredApprovals: ['Verification approval'],
  },
  {
    key: '10',
    title: 'Design Validation',
    requiredFields: [
      'Validation activity',
      'Intended use tested',
      'Mission/profile tested',
      'Customer requirement linked',
      'Result',
      'Pass/fail',
      'Evidence attachment',
      'Customer witness/approval, if applicable',
      'Validation approval',
    ],
    requiredChecklist: [],
    requiredApprovals: ['Engineering validation approval', 'Quality validation approval', 'Customer/program validation approval'],
  },
  {
    key: '11',
    title: 'Final Design Review',
    requiredFields: ['Final review notes', 'Open issue disposition', 'Configuration baseline'],
    requiredChecklist: [
      'All requirements reviewed',
      'All high risks closed or accepted',
      'Design outputs approved',
      'Prototype build documented',
      'Verification complete',
      'Validation complete',
      'Open issues dispositioned',
      'Configuration baseline established',
      'Manufacturing reviewed',
      'Quality reviewed',
      'Program management reviewed',
    ],
    requiredApprovals: ['Engineering', 'Quality', 'Manufacturing', 'Program Manager'],
  },
  {
    key: '12',
    title: 'Engineering Release Gate',
    requiredFields: ['Release package notes', 'Linked project_id / PO / WAD', 'Locked design revision baseline'],
    requiredChecklist: [
      'released CAD',
      'released drawings',
      'released BOM',
      'approved routing',
      'approved traveler requirement',
      'approved work instructions',
      'approved inspection plan',
      'approved test procedure',
      'required certifications identified',
      'supplier requirements flowed down',
      'material requirements approved',
      'tooling and fixtures ready',
      'CNC programs approved when applicable',
      'training and certifications complete',
      'packaging and shipping requirements defined',
      'design revision baseline locked',
    ],
    requiredApprovals: [
      'engineering release approval',
      'quality release approval',
      'manufacturing release approval',
      'program manager release approval',
    ],
  },
];

const requiredStepKeys = workflowSteps.filter((step) => step.key !== '12').map((step) => step.key);
const releaseGateSourceRequirements = canonicalManufacturingEvidenceRequirements.map((requirement) => ({
  item: requirement.label,
  source: requirement.sourceModule,
}));
type WorkflowStepDefinition = typeof workflowSteps[number];
type StepMissingEvidence = ReturnType<typeof missingForStep>;
type PersistedWorkflowStep = {
  stepKey: string;
  status?: string | null;
  formData?: unknown;
  checklist?: unknown;
  approvals?: unknown;
};

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return isRecordObject(value) ? value : {};
}

function normalizeAttachments(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\//g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function valueForCanonicalKey(values: Record<string, unknown>, canonicalKey: string) {
  if (Object.prototype.hasOwnProperty.call(values, canonicalKey)) {
    return values[canonicalKey];
  }

  const target = normalizeKey(canonicalKey);
  const found = Object.entries(values).find(([key]) => normalizeKey(key) === target);
  return found?.[1];
}

function isTruthyCanonical(values: Record<string, unknown>, canonicalKey: string) {
  return valueForCanonicalKey(values, canonicalKey) === true;
}

function hasFilledCanonicalValue(values: Record<string, unknown>, canonicalKey: string) {
  const value = valueForCanonicalKey(values, canonicalKey);
  return String(value ?? '').trim().length > 0;
}

function missingForStep(step: WorkflowStepDefinition, payload: StepPayload, options: { includeChecklist?: boolean } = {}) {
  const formData = normalizeJsonObject(payload.formData);
  const checklist = normalizeJsonObject(payload.checklist);
  const approvals = normalizeJsonObject(payload.approvals);
  const includeChecklist = options.includeChecklist ?? true;

  return {
    fields: step.requiredFields.filter((field) => !hasFilledCanonicalValue(formData, field)),
    checklist: includeChecklist ? step.requiredChecklist.filter((item) => !isTruthyCanonical(checklist, item)) : [],
    approvals: step.requiredApprovals.filter((approval) => !isTruthyCanonical(approvals, approval)),
  };
}

function hasAnyStepEvidence(payload: StepPayload) {
  const formData = normalizeJsonObject(payload.formData);
  const checklist = normalizeJsonObject(payload.checklist);
  const approvals = normalizeJsonObject(payload.approvals);
  return (
    Object.values(formData).some((value) => String(value ?? '').trim().length > 0) ||
    Object.values(checklist).some(Boolean) ||
    Object.values(approvals).some(Boolean)
  );
}

function deriveStatus(step: WorkflowStepDefinition, payload: StepPayload, options: { includeChecklist?: boolean } = {}) {
  const requestedStatus = typeof payload.status === 'string' ? payload.status.trim().toLowerCase() : '';
  const missing = missingForStep(step, payload, options);
  const complete = missing.fields.length === 0 && missing.checklist.length === 0 && missing.approvals.length === 0;

  if (requestedStatus === 'approved' && !complete) {
    return {
      status: 'needs_approval',
      missing,
      rejectedApproval: true,
    };
  }

  if (complete) {
    return {
      status: 'approved',
      missing,
      rejectedApproval: false,
    };
  }

  return {
    status: hasAnyStepEvidence(payload) ? 'needs_approval' : 'incomplete',
    missing,
    rejectedApproval: false,
  };
}

function formatMissingItems(step: WorkflowStepDefinition, missing: StepMissingEvidence) {
  return [
    ...missing.fields.map((field) => `Step ${step.key} ${step.title} field missing: ${field}`),
    ...missing.checklist.map((item) => {
      const sourceRequirement = releaseGateSourceRequirements.find((requirement) => normalizeKey(requirement.item) === normalizeKey(item));
      if (step.key === '12' && sourceRequirement) {
        return `Step ${step.key} ${step.title} source status incomplete: ${item} (${sourceRequirement.source})`;
      }
      return `Step ${step.key} ${step.title} checklist incomplete: ${item}`;
    }),
    ...missing.approvals.map((approval) => `Step ${step.key} ${step.title} approval missing: ${approval}`),
  ];
}

function formatStepRequirementError(step: WorkflowStepDefinition, missing: StepMissingEvidence) {
  const missingSourceStatuses = step.key === '12'
    ? missing.checklist.map((item) => {
      const sourceRequirement = releaseGateSourceRequirements.find((requirement) => normalizeKey(requirement.item) === normalizeKey(item));
      return {
        item,
        source: sourceRequirement?.source ?? 'External source of truth',
      };
    })
    : [];

  return {
    error: 'Step requirements are incomplete',
    stepKey: step.key,
    missingFormFields: missing.fields,
    missingChecklistItems: missing.checklist,
    missingApprovals: missing.approvals,
    missingSourceStatuses,
    missingItems: formatMissingItems(step, missing),
  };
}

async function getRecord(id: string) {
  const [record] = await db.select().from(designControlRecords).where(eq(designControlRecords.id, id)).limit(1);
  return record;
}

async function getSteps(recordId: string) {
  return db.select().from(designControlSteps).where(eq(designControlSteps.recordId, recordId));
}

function buildReadinessFromSteps(steps: PersistedWorkflowStep[], manufacturingEvidence?: DesignManufacturingEvidence | null) {
  const byKey = new Map(steps.map((step) => [step.stepKey, step]));
  const missingItems: string[] = [];

  for (const step of workflowSteps) {
    const persisted = byKey.get(step.key);
    if (!persisted) {
      missingItems.push(`Step ${step.key} ${step.title}: record is missing`);
      continue;
    }
    if (step.key !== '12' && persisted.status !== 'approved') {
      missingItems.push(`Step ${step.key} ${step.title}: approval required before Engineering Release Gate`);
    }
  }

  const releaseStep = byKey.get('12');
  if (!releaseStep) {
    missingItems.push('Engineering Release Gate: step 12 record is missing');
  } else {
    const releaseDefinition = workflowSteps.find((step) => step.key === '12')!;
    const missing = missingForStep(releaseDefinition, {
      formData: normalizeJsonObject(releaseStep.formData),
      checklist: normalizeJsonObject(releaseStep.checklist),
      approvals: normalizeJsonObject(releaseStep.approvals),
    }, { includeChecklist: false });
    missingItems.push(
      ...missing.fields.map((field) => `Step ${releaseDefinition.key} ${releaseDefinition.title} field missing: ${field}`),
      ...missing.approvals.map((approval) => `Step ${releaseDefinition.key} ${releaseDefinition.title} approval missing: ${approval}`)
    );
  }

  if (manufacturingEvidence) {
    missingItems.push(...manufacturingEvidence.missingItems.map((item) => `Step 12 Engineering Release Gate source incomplete: ${item}`));
  } else {
    missingItems.push(...canonicalManufacturingEvidenceRequirements.map((requirement) => (
      `Step 12 Engineering Release Gate source incomplete: ${requirement.label}: source evidence has not been evaluated`
    )));
  }

  return {
    ready: missingItems.length === 0,
    missingItems,
    sourceOfTruthPrinciple: 'R&D Project owns engineering process; Design Control orchestrates; manufacturing modules own their own data and Design Control evaluates their status.',
    manufacturingEvidence: manufacturingEvidence ?? null,
    manufacturingSourceStatuses: (manufacturingEvidence?.sources ?? []).map((source) => ({
      requirement: source.label,
      source: source.sourceModule,
      ready: source.ready,
      status: source.status,
    })),
    steps: workflowSteps.map((step) => ({
      key: step.key,
      title: step.title,
      status: byKey.get(step.key)?.status ?? 'missing',
    })),
  };
}

async function ensureWorkflowSteps(record: typeof designControlRecords.$inferSelect, client: typeof db = db) {
  for (const step of workflowSteps) {
    await client
      .insert(designControlSteps)
      .values({
        recordId: record.id,
        stepKey: step.key,
        title: step.title,
        status: 'incomplete',
        rdProjectId: record.rdProjectId,
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
  const record = await getRecord(recordId);
  const steps = await getSteps(recordId);
  const manufacturingEvidence = record
    ? await getDesignManufacturingEvidence({ rdProjectId: record.rdProjectId, designControlRecordId: record.id })
    : null;
  return buildReadinessFromSteps(steps, manufacturingEvidence);
}

function actorFromRequest(req: Request) {
  const user = (req as any).user;
  return user?.username || user?.email || user?.displayName || 'system';
}

async function upsertReleaseGate(
  record: typeof designControlRecords.$inferSelect,
  payload: StepPayload,
  gateStatus: string,
  client: typeof db = db,
  timestamps: { submittedAt?: Date; releasedAt?: Date } = {}
) {
  const values = {
    recordId: record.id,
    gateStatus,
    rdProjectId: record.rdProjectId,
    projectId: record.projectId,
    productionWorkOrderId: record.productionWorkOrderId,
    p2PurchaseOrderId: record.p2PurchaseOrderId,
    formData: normalizeJsonObject(payload.formData),
    checklist: normalizeJsonObject(payload.checklist),
    approvals: normalizeJsonObject(payload.approvals),
    attachments: normalizeAttachments(payload.attachments),
    metadata: normalizeJsonObject(payload.metadata),
    ...timestamps,
    updatedAt: new Date(),
  };

  await client
    .insert(designControlReleaseGate)
    .values(values)
    .onConflictDoUpdate({
      target: designControlReleaseGate.recordId,
      set: values,
    });
}

async function createDesignControlRecordWithInitialWorkflow(
  data: typeof designControlRecords.$inferInsert,
  client: typeof db = db
) {
  return client.transaction(async (tx) => {
    const [createdRecord] = await tx.insert(designControlRecords).values(data).returning();
    await ensureWorkflowSteps(createdRecord, tx as typeof db);
    await upsertReleaseGate(createdRecord, {}, 'not_ready', tx as typeof db);
    return createdRecord;
  });
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const conditions: SQL[] = [];
    if (typeof _req.query.rdProjectId === 'string' && _req.query.rdProjectId.trim()) {
      conditions.push(eq(designControlRecords.rdProjectId, _req.query.rdProjectId.trim()));
    }
    if (typeof _req.query.projectId === 'string' && _req.query.projectId.trim()) {
      conditions.push(eq(designControlRecords.projectId, _req.query.projectId.trim()));
    }

    const records = conditions.length > 0
      ? await db
        .select()
        .from(designControlRecords)
        .where(and(...conditions))
        .orderBy(desc(designControlRecords.updatedAt), desc(designControlRecords.createdAt))
      : await db
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
      rdProjectId: req.body?.rdProjectId ?? null,
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

    const record = await createDesignControlRecordWithInitialWorkflow(parsed.data);

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
      res.status(400).json({
        error: 'Invalid design control step',
        stepKey: req.params.stepKey,
        validStepKeys: workflowSteps.map((item) => item.key),
      });
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
    const derived = deriveStatus(step, payload, { includeChecklist: step.key !== '12' });
    const requestedStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
    let status = derived.status;

    if (derived.rejectedApproval) {
      res.status(400).json({
        message: `Step ${step.key} cannot be approved until required evidence is complete`,
        ...formatStepRequirementError(step, derived.missing),
      });
      return;
    }

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
        if (requestedStatus === 'approved') {
          res.status(422).json({
            message: 'Step 12 cannot be approved until steps 1-11 are approved',
            missingItems: readiness.missingItems,
          });
          return;
        }

        status = 'needs_approval';
      }
    }

    if (step.key === '12' && status === 'approved') {
      const manufacturingEvidence = await getDesignManufacturingEvidence({
        rdProjectId: record.rdProjectId,
        designControlRecordId: record.id,
      });
      if (!manufacturingEvidence.ready) {
        res.status(422).json({
          message: 'Step 12 cannot be approved until manufacturing source evidence is ready',
          missingItems: manufacturingEvidence.missingItems,
          manufacturingEvidence,
        });
        return;
      }
    }

    const values = {
      recordId: record.id,
      stepKey: step.key,
      title: step.title,
      status,
      rdProjectId: record.rdProjectId,
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
      await upsertReleaseGate(record, payload, status === 'approved' ? 'ready' : 'not_ready');
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
        message: 'Engineering Release Gate is not ready',
        missingItems: readiness.missingItems,
      });
      return;
    }

    const now = new Date();
    const [releaseStep] = await db
      .select()
      .from(designControlSteps)
      .where(and(eq(designControlSteps.recordId, record.id), eq(designControlSteps.stepKey, '12')))
      .limit(1);

    const updatedRecord = await db.transaction(async (tx) => {
      await tx
        .update(designControlSteps)
        .set({ status: 'approved', approvedAt: now, updatedAt: now })
        .where(and(eq(designControlSteps.recordId, record.id), eq(designControlSteps.stepKey, '12')));

      await upsertReleaseGate(
        record,
        {
          formData: normalizeJsonObject(releaseStep?.formData),
          checklist: normalizeJsonObject(releaseStep?.checklist),
          approvals: normalizeJsonObject(releaseStep?.approvals),
          attachments: normalizeAttachments(releaseStep?.attachments),
          metadata: normalizeJsonObject(releaseStep?.metadata),
        },
        'approved',
        tx as typeof db,
        { submittedAt: now, releasedAt: now }
      );

      const [updated] = await tx
        .update(designControlRecords)
        .set({ status: 'release_ready', submittedAt: now, releasedAt: now, updatedAt: now })
        .where(eq(designControlRecords.id, record.id))
        .returning();
      return updated;
    });

    res.json({ record: updatedRecord, readiness: await buildReadiness(record.id) });
  } catch (error) {
    console.error('[qms-design-control] Failed to submit release gate', error);
    res.status(500).json({ message: 'Failed to submit engineering release gate' });
  }
});

router.get('/:id/manufacturing-evidence', async (req: Request, res: Response) => {
  try {
    const record = await getRecord(req.params.id);
    if (!record) {
      res.status(404).json({ message: 'Design control record not found' });
      return;
    }

    res.json(await getDesignManufacturingEvidence({
      rdProjectId: record.rdProjectId,
      designControlRecordId: record.id,
    }));
  } catch (error) {
    console.error('[qms-design-control] Failed to compute manufacturing evidence', error);
    res.status(500).json({ message: 'Failed to compute design manufacturing evidence' });
  }
});

router.get('/:id/engineering-release-preview', async (req: Request, res: Response) => {
  try {
    const preview = await getEngineeringReleasePreview(req.params.id);
    if (!preview) {
      res.status(404).json({ message: 'Design control record not found' });
      return;
    }

    res.json({ preview });
  } catch (error) {
    console.error('[qms-design-control] Failed to compute engineering release preview', error);
    res.status(500).json({ message: 'Failed to compute engineering release preview' });
  }
});

router.post('/:id/engineering-release', async (req: Request, res: Response) => {
  try {
    const result = await submitEngineeringRelease({
      recordId: req.params.id,
      actor: actorFromRequest(req),
      effectiveDate: typeof req.body?.effectiveDate === 'string' ? req.body.effectiveDate : null,
    });

    if (result.status === 'not_found') {
      res.status(404).json({ message: 'Design control record not found' });
      return;
    }

    if (result.status === 'blocked') {
      res.status(422).json({
        message: 'Engineering Release Gate is not ready',
        missingEvidence: result.missingEvidence,
        preview: result.preview ?? null,
      });
      return;
    }

    res.status(result.status === 'existing' ? 200 : 201).json(result);
  } catch (error) {
    console.error('[qms-design-control] Failed to submit engineering release', error);
    res.status(500).json({ message: 'Failed to submit engineering release' });
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

export const qmsDesignControlTestInternals = {
  workflowSteps,
  requiredStepKeys,
  releaseGateSourceRequirements,
  buildReadinessFromSteps,
  createDesignControlRecordWithInitialWorkflow,
  deriveStatus,
  formatStepRequirementError,
  missingForStep,
};

export default router;
