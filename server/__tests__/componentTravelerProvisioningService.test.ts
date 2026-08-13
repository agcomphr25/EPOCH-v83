import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  connect: vi.fn(),
  execute: vi.fn(),
  generate: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../db', () => ({
  db: { execute: mocks.execute },
  pgPool: { connect: mocks.connect },
}));
vi.mock('../storage', () => ({
  storage: {
    generateTravelerFromRouting: mocks.generate,
    updateTraveler: mocks.update,
  },
}));
vi.mock('../src/lib/featureFlags', () => ({
  isP2V2ComponentTravelerProvisioningEnabled: mocks.enabled,
}));

import { provisionP2ComponentTravelers } from '../src/services/componentTravelerProvisioningService';

const input = {
  idempotencyKey: 'synthetic-key',
  expectedLaunchDigest: 'a'.repeat(64),
  signatureMeaning: 'Provision component travelers.',
};
const actor = {
  userId: 1,
  employeeId: 2,
  username: 'operator',
  displayName: 'Synthetic Operator',
  role: 'OPERATIONS',
};

describe('P2 component traveler provisioning service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
  });

  it('performs no database or storage work while disabled', async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(
      provisionP2ComponentTravelers('project-1', 'launch-1', input, actor)
    ).rejects.toMatchObject({
      code: 'P2_V2_COMPONENT_TRAVELER_PROVISIONING_DISABLED',
    });
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('creates one draft batch traveler for a manufactured child work order', async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.connect.mockResolvedValue(client);
    const responses: unknown[] = [
      [
        {
          id: 'launch-1',
          status: 'COMPLETE',
          preview_digest: input.expectedLaunchDigest,
          wad_status: 'RELEASED',
          work_order_wad_status: 'APPROVED',
        },
      ],
      [],
      [{ id: 'work-order-event' }],
      [
        {
          demand_id: 'body-demand',
          assembly_path: 'root/body',
          part_number: 'PITOT-BODY',
          routing_id: 'routing-1',
          first_department_snapshot: 'CNC',
          shortage_quantity: '150',
          demand_status: 'IN_PROCESS',
          production_work_order_id: 'wo-1',
          work_order_number: 'P2WO-body',
          work_order_part_number: 'PITOT-BODY',
          work_order_quantity: 150,
          work_order_status: 'PLANNED',
          work_order_wad_status: 'DRAFT',
          assigned_department: 'CNC',
          traveler_id: null,
          routing_first_department: 'CNC',
        },
      ],
      [],
      [],
      [],
      [],
    ];
    mocks.execute.mockImplementation(async () => responses.shift() ?? []);
    mocks.generate.mockResolvedValue({ id: 'traveler-1' });
    mocks.update.mockResolvedValue({ id: 'traveler-1', status: 'DRAFT' });

    await expect(
      provisionP2ComponentTravelers('project-1', 'launch-1', input, actor)
    ).resolves.toMatchObject({
      replayed: false,
      travelerIds: ['traveler-1'],
      provisionedDemandIds: ['body-demand'],
    });
    expect(mocks.generate).toHaveBeenCalledWith(
      'routing-1',
      expect.objectContaining({ lotNumber: 'P2WO-body', quantity: 150 })
    );
    expect(mocks.update).toHaveBeenCalledWith(
      'traveler-1',
      expect.objectContaining({
        status: 'DRAFT',
        productionWorkOrderId: 'wo-1',
      })
    );
    expect(client.release).toHaveBeenCalledOnce();
  });
});
