import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  transaction: vi.fn(),
  preview: vi.fn(),
  compile: vi.fn(),
}));
vi.mock('../db', () => ({ db: { transaction: mocks.transaction } }));
vi.mock('../src/lib/featureFlags', () => ({
  isP2V2ProductionLaunchPersistenceEnabled: mocks.enabled,
}));
vi.mock('../src/services/productionLaunchPreviewService', () => ({
  buildProductionLaunchPreview: mocks.preview,
}));
vi.mock('../src/services/productionDemandGraph', () => ({
  ProductionDemandGraphError: class ProductionDemandGraphError extends Error {},
  compileProductionDemandGraph: mocks.compile,
}));
vi.mock('../src/services/p2DemandPlanningDeterminism', () => ({
  demandPlanningChecksum: () => 'a'.repeat(64),
}));

import { persistProductionLaunch } from '../src/services/productionLaunchPersistenceService';

const digest = 'a'.repeat(64);
const actor = {
  userId: 7,
  employeeId: 8,
  username: 'operator',
  displayName: 'Synthetic Operator',
  role: 'OPERATIONS',
};
const input = {
  idempotencyKey: 'synthetic-launch-key',
  expectedPreviewDigest: digest,
  signatureMeaning: 'I authorize creation of planning evidence.',
};
const authority = {
  workflow_version: 'p2_v2',
  workflow_instance_id: 'workflow-1',
  production_release_id: 'release-1',
  configuration_baseline_id: 'baseline-1',
  production_plan_id: 'plan-1',
  production_plan_revision: 2,
  wad_authorization_id: 'wad-1',
  wad_revision: 3,
  production_plan_status: 'RELEASED',
  current_plan_revision: 2,
  current_plan_baseline: 'baseline-1',
  wad_status: 'RELEASED',
  current_wad_revision: 3,
};
const demand = {
  key: '11:root:11',
  parentKey: null,
  productionPlanId: 'plan-1',
  productionPlanItemId: 'plan-item-1',
  poItemId: 11,
  demandLineIdentity: '00000000-0000-0000-0000-000000000011',
  demandKey: '11:root:11',
  assemblyPath: 'root:11',
  pathDepth: 0,
  inventoryItemId: 20,
  partNumber: 'SYNTHETIC-ROOT',
  partRevision: 'A',
  description: 'Synthetic root',
  classification: 'MANUFACTURED',
  disposition: 'MAKE',
  quantityPerParent: 1,
  grossRequiredQuantity: 2,
  availableQuantitySnapshot: 0,
  allocatedQuantitySnapshot: 0,
  shortageQuantity: 2,
  originalCustomerQuantity: 2,
  effectiveCustomerQuantity: 2,
  customerDemandEventDigest: digest,
  customerDemandSnapshot: {},
  unitOfMeasure: 'EA',
  requiredByDate: null,
  bomId: 'bom-1',
  bomRevisionId: 'bom-rev-1',
  bomRevisionSnapshot: 'A',
  routingId: 'routing-1',
  routingRevisionSnapshot: 'A',
  firstDepartmentSnapshot: 'CNC',
  demandStatus: 'PLANNED',
  blockerSnapshot: [],
};

describe('Production Launch transactional writer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.preview.mockResolvedValue({
      resultChecksum: digest,
      blockers: [],
      nodes: [{}],
      project: { poId: 11 },
    });
    mocks.compile.mockReturnValue({ demands: [demand], dependencies: [] });
  });

  it('does not open a transaction while disabled', async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(
      persistProductionLaunch('project-1', input, actor)
    ).rejects.toMatchObject({
      code: 'P2_V2_PRODUCTION_LAUNCH_PERSISTENCE_DISABLED',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('creates the graph and audit atomically and returns exact replays', async () => {
    const responses: unknown[] = [
      [],
      [authority],
      [
        {
          id: 'plan-item-1',
          assembly_path: 'root:11',
          part_number: 'SYNTHETIC-ROOT',
          production_plan_id: 'plan-1',
          project_id: 'project-1',
        },
      ],
      [],
      [],
    ];
    const execute = vi.fn(async () => responses.shift() ?? []);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ execute })
    );
    const created = await persistProductionLaunch('project-1', input, actor);
    expect(created.replayed).toBe(false);
    expect(execute).toHaveBeenCalledTimes(8);

    const replayExecute = vi.fn(async () => {
      const call = replayExecute.mock.calls.length;
      if (call === 2) return [authority];
      if (call === 3) return [];
      if (call === 4)
        return [
          {
            id: 'launch-existing',
            request_hash: digest,
            configuration_baseline_id: 'baseline-1',
            status: 'COMPLETE',
          },
        ];
      return [];
    });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ execute: replayExecute })
    );
    const replayed = await persistProductionLaunch('project-1', input, actor);
    expect(replayed).toMatchObject({
      replayed: true,
      launch: { id: 'launch-existing' },
    });
  });

  it('propagates a final audit failure so the transaction rolls back', async () => {
    const responses: unknown[] = [[], [authority], [], [], []];
    const execute = vi.fn(async () => {
      if (execute.mock.calls.length === 8)
        throw new Error('synthetic audit failure');
      return responses.shift() ?? [];
    });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ execute })
    );
    await expect(
      persistProductionLaunch('project-1', input, actor)
    ).rejects.toThrow('synthetic audit failure');
  });
});
