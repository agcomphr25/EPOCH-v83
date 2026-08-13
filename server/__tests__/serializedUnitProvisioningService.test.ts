import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  transaction: vi.fn(),
  allocate: vi.fn(),
}));
vi.mock('../db', () => ({ db: { transaction: mocks.transaction } }));
vi.mock('../storage', () => ({
  storage: { addP2SerializedItemsForPoItem: mocks.allocate },
}));
vi.mock('../src/lib/featureFlags', () => ({
  isP2V2SerializedUnitProvisioningEnabled: mocks.enabled,
}));

import { provisionP2SerializedUnits } from '../src/services/serializedUnitProvisioningService';

const digest = 'c'.repeat(64);
const input = {
  idempotencyKey: 'synthetic-serial-key',
  expectedLaunchDigest: digest,
  signatureMeaning: 'Allocate controlled serialized units.',
};
const actor = {
  userId: 7,
  employeeId: 8,
  username: 'operator',
  displayName: 'Synthetic Operator',
  role: 'OPERATIONS',
};

describe('P2 serialized-unit provisioning service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
  });

  it('does not open a transaction while disabled', async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(
      provisionP2SerializedUnits('project-1', 'launch-1', input, actor)
    ).rejects.toMatchObject({
      code: 'P2_V2_SERIALIZED_UNIT_PROVISIONING_DISABLED',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('allocates and links exact root demand units atomically', async () => {
    const responses: unknown[] = [
      [],
      [
        {
          id: 'launch-1',
          status: 'COMPLETE',
          preview_digest: digest,
          wad_status: 'RELEASED',
          wad_work_order_id: 'wad-wo-1',
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
          shortage_quantity: '2.000000',
          demand_status: 'IN_PROCESS',
          routing_id: 'routing-1',
          p2_production_order_id: 41,
          order_quantity: 2,
          order_status: 'PENDING',
          order_project_id: 'project-1',
          order_po_id: 10,
          order_po_item_id: 11,
          order_sku: 'PART-1',
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
    mocks.allocate.mockResolvedValue([
      {
        id: 'serial-1',
        poId: 10,
        poItemId: 11,
        partNumber: 'PART-1',
        partRoutingId: 'routing-1',
        currentDepartment: 'Pending Layup',
      },
      {
        id: 'serial-2',
        poId: 10,
        poItemId: 11,
        partNumber: 'PART-1',
        partRoutingId: 'routing-1',
        currentDepartment: 'Pending Layup',
      },
    ]);

    await expect(
      provisionP2SerializedUnits('project-1', 'launch-1', input, actor)
    ).resolves.toMatchObject({
      replayed: false,
      serializedItemIds: ['serial-1', 'serial-2'],
      serializedDemandIds: ['demand-1'],
    });
    expect(mocks.allocate).toHaveBeenCalledWith(11, 2, expect.anything());
    expect(execute).toHaveBeenCalledTimes(8);
  });
});
