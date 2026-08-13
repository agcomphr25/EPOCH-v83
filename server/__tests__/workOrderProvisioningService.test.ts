import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  transaction: vi.fn(),
}));
vi.mock('../db', () => ({ db: { transaction: mocks.transaction } }));
vi.mock('../src/lib/featureFlags', () => ({
  isP2V2WorkOrderProvisioningEnabled: mocks.enabled,
}));

import { provisionP2WorkOrders } from '../src/services/workOrderProvisioningService';

describe('P2 work-order provisioning service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
  });

  it('performs no transaction while disabled', async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(
      provisionP2WorkOrders(
        'project-1',
        'launch-1',
        {
          idempotencyKey: 'synthetic-key',
          expectedLaunchDigest: 'a'.repeat(64),
          signatureMeaning: 'Provision work orders.',
        },
        {
          userId: 1,
          employeeId: 2,
          username: 'operator',
          displayName: 'Synthetic Operator',
          role: 'OPERATIONS',
        }
      )
    ).rejects.toMatchObject({ code: 'P2_V2_WORK_ORDER_PROVISIONING_DISABLED' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('reuses the exact root WAD and creates one draft manufactured child work order', async () => {
    const launchDigest = 'a'.repeat(64);
    const shared = {
      demand_status: 'IN_PROCESS',
      wad_link_id: 'wad-link',
      p2_order_link_id: 'p2-link',
      routing_id: 'routing-1',
      routing_first_department: 'CNC',
      first_department_snapshot: 'CNC',
      shortage_quantity: '150',
    };
    const responses: unknown[] = [
      [],
      [
        {
          id: 'launch-1',
          status: 'COMPLETE',
          preview_digest: launchDigest,
          wad_status: 'RELEASED',
          wad_work_order_id: 'wad-1',
          work_order_number: 'WAD-1',
          wad_part_number: 'HEATED-PITOT',
          wad_quantity: 150,
          work_order_wad_status: 'APPROVED',
        },
      ],
      [],
      [
        {
          ...shared,
          id: 'root-demand',
          parent_demand_id: null,
          part_number: 'HEATED-PITOT',
          assembly_path: 'root',
        },
        {
          ...shared,
          id: 'body-demand',
          parent_demand_id: 'root-demand',
          part_number: 'PITOT-BODY',
          assembly_path: 'root/body',
        },
      ],
      [],
      [],
      [{ id: 'body-work-order' }],
      [],
      [],
    ];
    const execute = vi.fn(async () => responses.shift() ?? []);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ execute })
    );

    await expect(
      provisionP2WorkOrders(
        'project-1',
        'launch-1',
        {
          idempotencyKey: 'synthetic-key',
          expectedLaunchDigest: launchDigest,
          signatureMeaning: 'Provision controlled work orders.',
        },
        {
          userId: 1,
          employeeId: 2,
          username: 'operator',
          displayName: 'Synthetic Operator',
          role: 'OPERATIONS',
        }
      )
    ).resolves.toMatchObject({
      replayed: false,
      workOrderIds: ['wad-1', 'body-work-order'],
    });

    expect(execute).toHaveBeenCalledTimes(9);
  });
});
