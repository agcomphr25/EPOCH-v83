import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
}));

import { qmsDesignControlTestInternals } from '../src/routes/qmsDesignControl';
import {
  canonicalManufacturingEvidenceRequirements,
  type DesignManufacturingEvidence,
  type ManufacturingEvidenceSource,
} from '../src/services/designManufacturingEvidenceService';

const {
  buildReadinessFromSteps,
  createDesignControlRecordWithInitialWorkflow,
  deriveStatus,
  workflowSteps,
} = qmsDesignControlTestInternals;

function stepByKey(key: string) {
  const step = workflowSteps.find((item) => item.key === key);
  if (!step) throw new Error(`Missing workflow step ${key}`);
  return step;
}

function completePayloadForStep(step: ReturnType<typeof stepByKey>) {
  return {
    formData: Object.fromEntries(step.requiredFields.map((field) => [field, `value for ${field}`])),
    checklist: Object.fromEntries(step.requiredChecklist.map((item) => [item, true])),
    approvals: Object.fromEntries(step.requiredApprovals.map((approval) => [approval, true])),
  };
}

function persistedStep(key: string, overrides: Record<string, unknown> = {}) {
  const step = stepByKey(key);
  return {
    stepKey: key,
    status: key === '12' ? 'needs_approval' : 'approved',
    ...completePayloadForStep(step),
    ...overrides,
  };
}

function completePersistedSteps() {
  return workflowSteps.map((step) => persistedStep(step.key));
}

function evidenceSource(key: string, overrides: Partial<ManufacturingEvidenceSource> = {}): ManufacturingEvidenceSource {
  const requirement = canonicalManufacturingEvidenceRequirements.find((item) => item.key === key)
    ?? canonicalManufacturingEvidenceRequirements[0];

  return {
    key: requirement.key,
    label: requirement.label,
    sourceModule: requirement.sourceModule,
    managedBy: 'SOURCE_MODULE',
    sourceAvailable: true,
    status: 'RELEASED',
    ready: true,
    explanation: `${requirement.label} is released.`,
    missingItems: [],
    ...overrides,
  };
}

function manufacturingEvidence(overrides: Record<string, Partial<ManufacturingEvidenceSource>> = {}): DesignManufacturingEvidence {
  const sources = canonicalManufacturingEvidenceRequirements.map((requirement) => evidenceSource(requirement.key, overrides[requirement.key]));
  const missingItems = sources.flatMap((source) => source.missingItems);
  return {
    rdProjectId: 'rd-1',
    designControlRecordId: 'record-1',
    overallStatus: missingItems.length === 0 ? 'RELEASED' : 'BLOCKED',
    ready: missingItems.length === 0,
    missingItems,
    sources,
  };
}

function blockedEvidenceFor(...keys: string[]) {
  return manufacturingEvidence(Object.fromEntries(keys.map((key) => {
    const requirement = canonicalManufacturingEvidenceRequirements.find((item) => item.key === key)!;
    return [key, {
      sourceAvailable: false,
      status: 'NOT_CONFIGURED' as const,
      ready: false,
      explanation: `${requirement.label} source missing.`,
      missingItems: [`${requirement.label}: source module is not configured for this R&D project`],
    }];
  })));
}

describe('QMS design control release gate validation', () => {
  it('reports empty Step 12 as not ready with canonical missing evidence', () => {
    const steps = [
      ...workflowSteps.filter((step) => step.key !== '12').map((step) => persistedStep(step.key)),
      { stepKey: '12', status: 'incomplete', formData: {}, checklist: {}, approvals: {} },
    ];

    const readiness = buildReadinessFromSteps(steps, blockedEvidenceFor('released_cad'));

    expect(readiness.ready).toBe(false);
    expect(readiness.missingItems).toContain(
      'Step 12 Engineering Release Gate source incomplete: released CAD: source module is not configured for this R&D project',
    );
    expect(readiness.missingItems).toContain(
      'Step 12 Engineering Release Gate approval missing: engineering release approval',
    );
  });

  it('reports Steps 1-11 approved but Step 12 incomplete as not ready', () => {
    const step12 = persistedStep('12', {
      checklist: { 'released CAD': true },
      approvals: completePayloadForStep(stepByKey('12')).approvals,
    });

    const readiness = buildReadinessFromSteps([
      ...workflowSteps.filter((step) => step.key !== '12').map((step) => persistedStep(step.key)),
      step12,
    ], blockedEvidenceFor('released_drawings', 'approved_routing'));

    expect(readiness.ready).toBe(false);
    expect(readiness.missingItems).toEqual(
      expect.arrayContaining([
        'Step 12 Engineering Release Gate source incomplete: released drawings: source module is not configured for this R&D project',
        'Step 12 Engineering Release Gate source incomplete: approved routing: source module is not configured for this R&D project',
      ]),
    );
  });

  it('rejects client-supplied APPROVED when required evidence is missing', () => {
    const result = deriveStatus(stepByKey('3'), { status: 'APPROVED', formData: {}, checklist: {}, approvals: {} });

    expect(result.rejectedApproval).toBe(true);
    expect(result.status).toBe('needs_approval');
    expect(result.missing.fields).toContain('Requirement ID');
    expect(result.missing.checklist).toContain('Customer requirements captured');
    expect(result.missing.approvals).toContain('Requirements owner approval');
  });

  it('treats an invalid stepKey as rejected by the canonical step registry', () => {
    expect(workflowSteps.some((step) => step.key === 'NOT_A_STEP')).toBe(false);
  });

  it('reports a missing Step 12 approval', () => {
    const step12 = persistedStep('12', {
      approvals: {
        ...completePayloadForStep(stepByKey('12')).approvals,
        'quality release approval': false,
      },
    });

    const readiness = buildReadinessFromSteps([
      ...workflowSteps.filter((step) => step.key !== '12').map((step) => persistedStep(step.key)),
      step12,
    ], manufacturingEvidence());

    expect(readiness.ready).toBe(false);
    expect(readiness.missingItems).toContain(
      'Step 12 Engineering Release Gate approval missing: quality release approval',
    );
  });

  it('does not allow manual Step 12 checklist values to override source evidence', () => {
    const step12Payload = completePayloadForStep(stepByKey('12'));
    const step12 = persistedStep('12', {
      checklist: {
        ...step12Payload.checklist,
        'material requirements approved': true,
      },
    });

    const readiness = buildReadinessFromSteps([
      ...workflowSteps.filter((step) => step.key !== '12').map((step) => persistedStep(step.key)),
      step12,
    ], blockedEvidenceFor('material_requirements_approved'));

    expect(readiness.ready).toBe(false);
    expect(readiness.missingItems).toContain(
      'Step 12 Engineering Release Gate source incomplete: material requirements approved: source module is not configured for this R&D project',
    );
  });

  it('reports manufacturing module source status without duplicating source data', () => {
    const readiness = buildReadinessFromSteps([
      ...workflowSteps.filter((step) => step.key !== '12').map((step) => persistedStep(step.key)),
      { stepKey: '12', status: 'needs_approval', formData: {}, checklist: {}, approvals: {} },
    ], blockedEvidenceFor('released_bom', 'approved_traveler_requirement'));

    expect(readiness.sourceOfTruthPrinciple).toMatch(/manufacturing modules own their own data/i);
    expect(readiness.manufacturingSourceStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirement: 'released BOM',
          source: 'Draft Builder BOM / BOM module',
          ready: false,
        }),
        expect.objectContaining({
          requirement: 'approved traveler requirement',
          source: 'Traveler module',
          ready: false,
        }),
      ]),
    );
  });

  it('blocks submit-release readiness when Steps 1-11 are incomplete', () => {
    const steps = completePersistedSteps();
    const firstStep = steps.find((step) => step.stepKey === '1');
    if (firstStep) firstStep.status = 'needs_approval';

    const readiness = buildReadinessFromSteps(steps, manufacturingEvidence());

    expect(readiness.ready).toBe(false);
    expect(readiness.missingItems).toContain(
      'Step 1 Design Project Intake: approval required before Engineering Release Gate',
    );
  });

  it('blocks submit-release readiness when Step 12 is incomplete', () => {
    const readiness = buildReadinessFromSteps([
      ...workflowSteps.filter((step) => step.key !== '12').map((step) => persistedStep(step.key)),
      { stepKey: '12', status: 'needs_approval', formData: {}, checklist: {}, approvals: {} },
    ], blockedEvidenceFor('released_bom'));

    expect(readiness.ready).toBe(false);
    expect(readiness.missingItems).toContain(
      'Step 12 Engineering Release Gate source incomplete: released BOM: source module is not configured for this R&D project',
    );
  });

  it('allows submit-release readiness when all canonical requirements are satisfied', () => {
    const readiness = buildReadinessFromSteps(completePersistedSteps(), manufacturingEvidence());

    expect(readiness.ready).toBe(true);
    expect(readiness.missingItems).toEqual([]);
  });
});

describe('QMS design control record creation transaction', () => {
  function makeTransactionalClient(options: { failFirstStepInsert?: boolean } = {}) {
    const createdRecord = {
      id: 'record-1',
      rdProjectId: 'rd-1',
      projectId: null,
      productionWorkOrderId: null,
      p2PurchaseOrderId: null,
    };
    let insertCount = 0;
    let stepInsertCount = 0;
    let releaseGateUpsertCount = 0;
    let rolledBack = false;
    let committed = false;

    const tx = {
      insert: vi.fn(() => {
        insertCount += 1;
        if (insertCount === 1) {
          return {
            values: vi.fn(() => ({
              returning: vi.fn(async () => [createdRecord]),
            })),
          };
        }

        if (insertCount <= workflowSteps.length + 1) {
          return {
            values: vi.fn(() => ({
              onConflictDoNothing: vi.fn(async () => {
                stepInsertCount += 1;
                if (options.failFirstStepInsert && stepInsertCount === 1) {
                  throw new Error('initial step insert failed');
                }
              }),
            })),
          };
        }

        return {
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn(async () => {
              releaseGateUpsertCount += 1;
            }),
          })),
        };
      }),
    };

    const client = {
      transaction: vi.fn(async (callback: (transactionClient: typeof tx) => Promise<unknown>) => {
        try {
          const result = await callback(tx);
          committed = true;
          return result;
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      }),
    };

    return {
      client,
      stats: () => ({ committed, rolledBack, releaseGateUpsertCount, stepInsertCount }),
    };
  }

  it('upserts the initial release gate inside record creation', async () => {
    const { client, stats } = makeTransactionalClient();

    await createDesignControlRecordWithInitialWorkflow({ title: 'Test design' } as any, client as any);

    expect(client.transaction).toHaveBeenCalledTimes(1);
    expect(stats()).toMatchObject({
      committed: true,
      rolledBack: false,
      stepInsertCount: workflowSteps.length,
      releaseGateUpsertCount: 1,
    });
  });

  it('rolls back record creation when initial step creation fails', async () => {
    const { client, stats } = makeTransactionalClient({ failFirstStepInsert: true });

    await expect(
      createDesignControlRecordWithInitialWorkflow({ title: 'Test design' } as any, client as any),
    ).rejects.toThrow('initial step insert failed');

    expect(client.transaction).toHaveBeenCalledTimes(1);
    expect(stats()).toMatchObject({
      committed: false,
      rolledBack: true,
      releaseGateUpsertCount: 0,
    });
  });
});
