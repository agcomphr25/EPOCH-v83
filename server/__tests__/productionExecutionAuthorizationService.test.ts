import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  transaction: vi.fn(),
}));
vi.mock('../db', () => ({ db: { transaction: mocks.transaction } }));
vi.mock('../src/lib/featureFlags', () => ({
  isP2V2ExecutionAuthorizationEnabled: mocks.enabled,
}));

import { authorizeProductionExecution } from '../src/services/productionExecutionAuthorizationService';

const digest = 'a'.repeat(64);
const input = {
  idempotencyKey: 'synthetic-execution-key',
  expectedLaunchDigest: digest,
  signatureMeaning: 'I authorize the released plan against its WAD.',
};
const actor = {
  userId: 7,
  employeeId: 8,
  username: 'operator',
  displayName: 'Synthetic Operator',
  role: 'OPERATIONS',
};

describe('Production execution authorization service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
  });

  it('does not open a transaction while disabled', async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(
      authorizeProductionExecution('project-1', 'launch-1', input, actor)
    ).rejects.toMatchObject({ code: 'P2_V2_EXECUTION_AUTHORIZATION_DISABLED' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('authorizes MAKE demand against the released WAD atomically', async () => {
    const responses: unknown[] = [
      [],
      [
        {
          id: 'launch-1',
          project_id: 'project-1',
          status: 'COMPLETE',
          preview_digest: digest,
          wad_authorization_id: 'wad-auth-1',
          wad_status: 'RELEASED',
          wad_work_order_id: 'wad-work-order-1',
          work_order_status: 'RELEASED',
          work_order_wad_status: 'APPROVED',
        },
      ],
      [],
      [
        {
          id: 'demand-1',
          disposition: 'MAKE',
          shortage_quantity: 2,
          demand_status: 'PLANNED',
          routing_id: 'routing-1',
          wad_authorization_id: 'wad-auth-1',
          assembly_path: 'root:1',
        },
      ],
      [],
      [],
      [],
      [],
    ];
    const execute = vi.fn(async () => responses.shift() ?? []);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ execute })
    );

    await expect(
      authorizeProductionExecution('project-1', 'launch-1', input, actor)
    ).resolves.toMatchObject({
      replayed: false,
      authorizedDemandIds: ['demand-1'],
    });
    expect(execute).toHaveBeenCalledTimes(8);
    const statements = execute.mock.calls.map(([query]) =>
      query.queryChunks?.map((chunk: unknown) => String(chunk)).join('')
    );
    expect(statements.join('\n')).not.toMatch(
      /INSERT INTO (?:p2_production_orders|production_work_orders|travelers|cnc_jobs|manufacturing_queue)/
    );
  });
});
