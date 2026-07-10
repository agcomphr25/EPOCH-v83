import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
}));

import { qmsDesignControlTestInternals } from '../src/routes/qmsDesignControl';

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

describe('QMS design control release gate validation', () => {
  it('reports empty Step 12 as not ready with canonical missing evidence', () => {
    const steps = [
      ...workflowSteps.filter((step) => step.key !== '12').map((step) => persistedStep(step.key)),
      { stepKey: '12', status: 'incomplete', formData: {}, checklist: {}, approvals: {} },
    ];

    const readiness = buildReadinessFromSteps(steps);

    expect(readiness.ready).toBe(false);
    expect(readiness.missingItems).toContain(
      'Step 12 Design Production Release Gate checklist incomplete: released CAD',
    );
    expect(readiness.missingItems).toContain(
      'Step 12 Design Production Release Gate approval missing: engineering release approval',
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
    ]);

    expect(readiness.ready).toBe(false);
    expect(readiness.missingItems).toEqual(
      expect.arrayContaining([
        'Step 12 Design Production Release Gate checklist incomplete: released drawings',
        'Step 12 Design Production Release Gate checklist incomplete: approved routing',
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
    ]);

    expect(readiness.ready).toBe(false);
    expect(readiness.missingItems).toContain(
      'Step 12 Design Production Release Gate approval missing: quality release approval',
    );
  });

  it('reports a missing Step 12 checklist item even when other checklist entries are complete', () => {
    const step12Payload = completePayloadForStep(stepByKey('12'));
    const step12 = persistedStep('12', {
      checklist: {
        ...step12Payload.checklist,
        'material requirements approved': false,
      },
    });

    const readiness = buildReadinessFromSteps([
      ...workflowSteps.filter((step) => step.key !== '12').map((step) => persistedStep(step.key)),
      step12,
    ]);

    expect(readiness.ready).toBe(false);
    expect(readiness.missingItems).toContain(
      'Step 12 Design Production Release Gate checklist incomplete: material requirements approved',
    );
  });

  it('blocks submit-release readiness when Steps 1-11 are incomplete', () => {
    const steps = completePersistedSteps();
    const firstStep = steps.find((step) => step.stepKey === '1');
    if (firstStep) firstStep.status = 'needs_approval';

    const readiness = buildReadinessFromSteps(steps);

    expect(readiness.ready).toBe(false);
    expect(readiness.missingItems).toContain(
      'Step 1 Design Project Intake: approval required before Design Production Release Gate',
    );
  });

  it('blocks submit-release readiness when Step 12 is incomplete', () => {
    const readiness = buildReadinessFromSteps([
      ...workflowSteps.filter((step) => step.key !== '12').map((step) => persistedStep(step.key)),
      { stepKey: '12', status: 'needs_approval', formData: {}, checklist: {}, approvals: {} },
    ]);

    expect(readiness.ready).toBe(false);
    expect(readiness.missingItems).toContain(
      'Step 12 Design Production Release Gate checklist incomplete: released BOM',
    );
  });

  it('allows submit-release readiness when all canonical requirements are satisfied', () => {
    const readiness = buildReadinessFromSteps(completePersistedSteps());

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
