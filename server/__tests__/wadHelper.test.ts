import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../storage', () => ({
  storage: {
    getWorkOrdersByProject: vi.fn<(projectId: string) => Promise<unknown[]>>(),
    createProductionWorkOrder: vi.fn<(data: unknown) => Promise<unknown>>(),
  },
}));

vi.mock('../db', () => ({ db: {}, pool: { query: vi.fn() } }));
vi.mock('../schema', () => ({
  productionWorkOrders: {
    id: {},
    workOrderNumber: {},
    projectId: {},
    partNumber: {},
    description: {},
    quantity: {},
    status: {},
    departmentBudgets: {},
    totalBudgetHours: {},
    materialBudgetAmount: {},
    startDate: {},
    dueDate: {},
    warningThreshold: {},
    blockedThreshold: {},
    defaultChargeCodeId: {},
    dashboardType: {},
    queueType: {},
    assignedDepartment: {},
    assignedDashboardRoute: {},
    manufacturingQueueId: {},
    wadStatus: {},
    wizardData: {},
    createdAt: {},
    updatedAt: {},
  },
}));

import { ensureProjectHasWAD } from '../src/lib/wadHelper';
import { storage } from '../storage';

const PROJECT_ID = 'proj-0000-0000-0000-000000000001';

describe('ensureProjectHasWAD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a WAD with status PLANNED when none exist', async () => {
    vi.mocked(storage.getWorkOrdersByProject).mockResolvedValue([]);
    vi.mocked(storage.createProductionWorkOrder).mockResolvedValue({
      id: 'wad-1',
      status: 'PLANNED',
    });

    await ensureProjectHasWAD(PROJECT_ID, { projectName: 'Test Project' });

    expect(storage.createProductionWorkOrder).toHaveBeenCalledOnce();
    const callArg = vi.mocked(storage.createProductionWorkOrder).mock
      .calls[0][0] as Record<string, unknown>;
    expect(callArg.status).toBe('PLANNED');
    expect(callArg.projectId).toBe(PROJECT_ID);
    expect(callArg.partNumber).toBe('TBD');
    expect(callArg.quantity).toBe(1);
    expect(typeof callArg.workOrderNumber).toBe('string');
    expect(String(callArg.workOrderNumber)).toMatch(/^WAD-/);
  });

  it('includes the project name in the description when provided', async () => {
    vi.mocked(storage.getWorkOrdersByProject).mockResolvedValue([]);
    vi.mocked(storage.createProductionWorkOrder).mockResolvedValue({
      id: 'wad-1',
      status: 'PLANNED',
    });

    await ensureProjectHasWAD(PROJECT_ID, { projectName: 'Acme Widget' });

    const callArg = vi.mocked(storage.createProductionWorkOrder).mock
      .calls[0][0] as Record<string, unknown>;
    expect(String(callArg.description)).toContain('Acme Widget');
  });

  it('skips creation (duplicate guard) when a WAD already exists for the same projectId', async () => {
    vi.mocked(storage.getWorkOrdersByProject).mockResolvedValue([
      { id: 'wad-existing', status: 'PLANNED' },
    ]);

    await ensureProjectHasWAD(PROJECT_ID, { projectName: 'Test Project' });

    expect(storage.createProductionWorkOrder).not.toHaveBeenCalled();
  });

  it('creates exactly one WAD when called twice for the same projectId', async () => {
    vi.mocked(storage.getWorkOrdersByProject)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'wad-1', status: 'PLANNED' }]);
    vi.mocked(storage.createProductionWorkOrder).mockResolvedValue({
      id: 'wad-1',
      status: 'PLANNED',
    });

    await ensureProjectHasWAD(PROJECT_ID, { projectName: 'Test Project' });
    await ensureProjectHasWAD(PROJECT_ID, { projectName: 'Test Project' });

    expect(storage.createProductionWorkOrder).toHaveBeenCalledOnce();
  });
});
