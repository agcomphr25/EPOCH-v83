import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  transaction: vi.fn(),
}));
vi.mock('../db', () => ({ db: { transaction: mocks.transaction } }));
vi.mock('../src/lib/featureFlags', () => ({
  isP2V2ProductionOrderProvisioningEnabled: mocks.enabled,
}));

import { provisionP2ProductionOrders } from '../src/services/productionOrderProvisioningService';

const digest = 'b'.repeat(64);
const input = {
  idempotencyKey: 'synthetic-provisioning-key',
  expectedLaunchDigest: digest,
  signatureMeaning: 'Provision controlled P2 production orders.',
};
const actor = {
  userId: 7,
  employeeId: 8,
  username: 'operator',
  displayName: 'Synthetic Operator',
  role: 'OPERATIONS',
};

describe('P2 production order provisioning service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
  });

  it('does not open a transaction while disabled', async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(
      provisionP2ProductionOrders('project-1', 'launch-1', input, actor)
    ).rejects.toMatchObject({
      code: 'P2_V2_PRODUCTION_ORDER_PROVISIONING_DISABLED',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('creates only one P2 order and link for an authorized demand', async () => {
    const responses: unknown[] = [
      [],
      [
        {
          id: 'launch-1',
          status: 'COMPLETE',
          preview_digest: digest,
          wad_status: 'RELEASED',
          wad_work_order_id: 'wad-work-order-1',
          work_order_wad_status: 'APPROVED',
        },
      ],
      [],
      [
        {
          id: 'demand-1',
          po_id: 10,
          po_item_id: 11,
          part_number: 'PART-1',
          part_name: 'Controlled Part',
          shortage_quantity: '2.000000',
          demand_status: 'AUTHORIZED',
          wad_link_id: 'wad-link-1',
          routing_id: 'routing-1',
          routing_first_department: 'CNC',
          first_department_snapshot: 'CNC',
          assembly_path: 'root:1',
        },
      ],
      [],
      [{ id: 41 }],
      [],
      [],
      [],
    ];
    const execute = vi.fn(async () => responses.shift() ?? []);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ execute })
    );

    await expect(
      provisionP2ProductionOrders('project-1', 'launch-1', input, actor)
    ).resolves.toMatchObject({
      replayed: false,
      productionOrderIds: [41],
      provisionedDemandIds: ['demand-1'],
    });
    expect(execute).toHaveBeenCalledTimes(9);
    const statements = execute.mock.calls.map(([query]) =>
      query.queryChunks?.map((chunk: unknown) => String(chunk)).join('')
    );
    expect(statements.join('\n')).not.toMatch(
      /INSERT INTO (?:p2_serialized_items|travelers|cnc_jobs|manufacturing_queue|production_work_orders)/
    );
  });
});
