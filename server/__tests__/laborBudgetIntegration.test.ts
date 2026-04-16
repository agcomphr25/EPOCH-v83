import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import type { LaborApproval, TimeClockEntry } from '../schema';
import type { ResolveResult } from '../src/helpers/travelerBarcodeResolver';
import type { WorkOrderLaborStatusResult } from '../src/helpers/laborBudgetHelper';

const WORK_ORDER_ID = 'aabbccdd-1111-2222-3333-aabbccddeeff';
const EMPLOYEE_ID = 'EMP001';
const APPROVAL_ID = 42;

const mockLaborStatus: WorkOrderLaborStatusResult = {
  totalHours: 0,
  departmentHours: null,
  totalBudget: 100,
  departmentBudget: null,
  percentUsed: 0,
  departmentPercentUsed: null,
  status: 'OK',
};

vi.mock('../src/helpers/laborBudgetHelper', () => ({
  evaluateWorkOrderLaborStatus: vi.fn<(id: string, dept?: string | null) => Promise<WorkOrderLaborStatusResult>>(),
}));

vi.mock('../src/helpers/travelerBarcodeResolver', () => ({
  resolveTravelerBarcode: vi.fn<(scanValue: string) => Promise<ResolveResult>>(),
}));

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

interface SelectLimitChain { limit: (n: number) => Promise<Record<string, unknown>[]> }
interface SelectWhereChain { where: (cond: unknown) => SelectLimitChain }
interface SelectFromChain { from: (table: unknown) => SelectWhereChain }
interface MockDbSelectDistinctChain { from: (table: unknown) => { where: (c: unknown) => Promise<unknown[]> } }

vi.mock('../db', () => ({
  db: {
    select: vi.fn<() => SelectFromChain>(),
    selectDistinct: vi.fn<() => MockDbSelectDistinctChain>(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  },
  pool: {},
}));

vi.mock('../storage', () => ({
  storage: {
    getOpenTimeClockEntry: vi.fn<(employeeId: string) => Promise<TimeClockEntry | null>>(),
    createTimeClockEntryWithChargeContext: vi.fn<(data: unknown) => Promise<TimeClockEntry>>(),
    getLaborApprovalById: vi.fn<(id: number) => Promise<LaborApproval | null>>(),
    createLaborApproval: vi.fn<(data: unknown) => Promise<LaborApproval>>(),
    getLaborHoursByWorkOrder: vi.fn<(id: string) => Promise<number>>(),
    getLaborHoursByWorkOrderAndDepartment: vi.fn<(id: string, dept: string) => Promise<number>>(),
    switchActiveTimeEntryToTraveler: vi.fn(),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user: unknown }).user = {
      id: 'test-user',
      username: 'supervisor1',
      role: 'SUPERVISOR',
    };
    next();
  }),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../schema', () => ({
  productionWorkOrders: {},
  apiIntegrationKeys: {},
  epochExternalEvents: {},
  epochLaborFacts: {},
  workOrders: {},
  workOrderParts: {},
  workOrderAttachments: {},
  assets: {},
  inventoryItems: {},
  users: {},
  maintenanceSchedules: {},
  insertWorkOrderSchema: { parse: vi.fn() },
  insertWorkOrderPartSchema: { parse: vi.fn() },
  insertWorkOrderAttachmentSchema: { parse: vi.fn() },
  insertProductionWorkOrderSchema: { parse: vi.fn() },
}));

import { evaluateWorkOrderLaborStatus } from '../src/helpers/laborBudgetHelper';
import { resolveTravelerBarcode } from '../src/helpers/travelerBarcodeResolver';
import { db } from '../db';
import { storage } from '../storage';

function buildDbQueryMock(workOrder: Record<string, unknown> | null): void {
  const rows = workOrder ? [workOrder] : [];
  const limitFn = vi.fn<() => Promise<Record<string, unknown>[]>>().mockResolvedValue(rows);
  const whereFn = vi.fn<() => SelectLimitChain>().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn<() => SelectWhereChain>().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn });
}

const MOCK_WORK_ORDER: Record<string, unknown> = {
  id: WORK_ORDER_ID,
  totalBudgetHours: '100',
  departmentBudgets: null,
};

function makeLaborApproval(overrides: Partial<LaborApproval> = {}): LaborApproval {
  return {
    id: APPROVAL_ID,
    productionWorkOrderId: WORK_ORDER_ID,
    employeeId: EMPLOYEE_ID,
    approvedBy: 'supervisor1',
    department: null,
    reason: 'Critical deadline',
    approvedAt: new Date('2026-04-16T00:00:00Z'),
    hoursAtApproval: '100',
    ...overrides,
  };
}

function makeTimeClockEntry(overrides: Partial<TimeClockEntry> = {}): TimeClockEntry {
  return {
    id: 99,
    employeeId: EMPLOYEE_ID,
    clockIn: new Date(),
    clockOut: null,
    date: '2026-04-16',
    createdAt: new Date(),
    productionWorkOrderId: WORK_ORDER_ID,
    travelerId: 'TRV-001',
    department: 'WELD',
    operation: 'Weld',
    chargeCode: 'WO-123',
    approvalStatus: 'AUTO',
    laborApprovalId: null,
    ...overrides,
  };
}

const mockTravelerContext = {
  ok: true as const,
  context: {
    wadId: WORK_ORDER_ID,
    travelerId: 'TRV-001',
    wadNumber: 'WO-123',
    travelerNumber: 'TRV-001',
    projectId: 'PROJ-1',
    chargeCode: 'WO-123',
    department: 'WELD',
    operation: 'Weld',
  },
} satisfies ResolveResult;

describe('GET /api/work-orders/:id/labor-status', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const workOrdersRouter = (await import('../src/routes/workOrders')).default;
    app.use('/api/work-orders', workOrdersRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 400 for an invalid UUID', async () => {
    const res = await request(app).get('/api/work-orders/not-a-uuid/labor-status');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid/i);
  });

  it('returns 404 when the work order does not exist', async () => {
    buildDbQueryMock(null);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({ ...mockLaborStatus });

    const res = await request(app).get(`/api/work-orders/${WORK_ORDER_ID}/labor-status`);
    expect(res.status).toBe(404);
  });

  it('returns OK status for a work order with low usage', async () => {
    buildDbQueryMock(MOCK_WORK_ORDER);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({
      ...mockLaborStatus,
      status: 'OK',
      totalHours: 50,
      percentUsed: 50,
    });

    const res = await request(app).get(`/api/work-orders/${WORK_ORDER_ID}/labor-status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.workOrderId).toBe(WORK_ORDER_ID);
    expect(res.body.totalHours).toBe(50);
  });

  it('returns WARNING status when approaching budget', async () => {
    buildDbQueryMock(MOCK_WORK_ORDER);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({
      ...mockLaborStatus,
      status: 'WARNING',
      totalHours: 85,
      percentUsed: 85,
    });

    const res = await request(app).get(`/api/work-orders/${WORK_ORDER_ID}/labor-status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('WARNING');
  });

  it('returns BLOCKED status when budget is exhausted', async () => {
    buildDbQueryMock(MOCK_WORK_ORDER);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({
      ...mockLaborStatus,
      status: 'BLOCKED',
      totalHours: 100,
      percentUsed: 100,
    });

    const res = await request(app).get(`/api/work-orders/${WORK_ORDER_ID}/labor-status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('BLOCKED');
  });

  it('passes department query param to the helper', async () => {
    buildDbQueryMock(MOCK_WORK_ORDER);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({ ...mockLaborStatus });

    await request(app).get(`/api/work-orders/${WORK_ORDER_ID}/labor-status?department=WELD`);
    expect(evaluateWorkOrderLaborStatus).toHaveBeenCalledWith(WORK_ORDER_ID, 'WELD');
  });
});

describe('POST /api/work-orders/:id/approve-overrun', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const workOrdersRouter = (await import('../src/routes/workOrders')).default;
    app.use('/api/work-orders', workOrdersRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 400 for an invalid UUID', async () => {
    const res = await request(app)
      .post('/api/work-orders/bad-id/approve-overrun')
      .send({ employeeId: EMPLOYEE_ID, reason: 'Critical deadline' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when required body fields are missing', async () => {
    buildDbQueryMock(MOCK_WORK_ORDER);
    const res = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/approve-overrun`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 404 when the work order does not exist', async () => {
    buildDbQueryMock(null);
    const res = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/approve-overrun`)
      .send({ employeeId: EMPLOYEE_ID, reason: 'Critical deadline' });
    expect(res.status).toBe(404);
  });

  it('creates a labor approval and returns 201', async () => {
    buildDbQueryMock(MOCK_WORK_ORDER);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({
      ...mockLaborStatus,
      status: 'BLOCKED',
      totalHours: 100,
    });
    vi.mocked(storage.createLaborApproval).mockResolvedValue(makeLaborApproval());

    const res = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/approve-overrun`)
      .send({ employeeId: EMPLOYEE_ID, reason: 'Critical deadline' });

    expect(res.status).toBe(201);
    expect(res.body.approval.id).toBe(APPROVAL_ID);
    expect(res.body.approval.employeeId).toBe(EMPLOYEE_ID);
    expect(res.body.laborStatus).toBeDefined();
  });

  it('records the approver username from the authenticated user', async () => {
    buildDbQueryMock(MOCK_WORK_ORDER);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({ ...mockLaborStatus });
    vi.mocked(storage.createLaborApproval).mockResolvedValue(makeLaborApproval());

    await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/approve-overrun`)
      .send({ employeeId: EMPLOYEE_ID, reason: 'Reason' });

    expect(storage.createLaborApproval).toHaveBeenCalledWith(
      expect.objectContaining({ approvedBy: 'supervisor1' })
    );
  });
});

describe('POST /api/time-clock/clock-in/traveler — labor budget gate', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const { registerTimeClockRoutes } = await import('../src/routes/timeClock');
    registerTimeClockRoutes(app);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 403 with LABOR_BUDGET_BLOCKED when budget is at 100%', async () => {
    vi.mocked(resolveTravelerBarcode).mockResolvedValue(mockTravelerContext);
    vi.mocked(storage.getOpenTimeClockEntry).mockResolvedValue(null);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({
      ...mockLaborStatus,
      status: 'BLOCKED',
      totalHours: 100,
      percentUsed: 100,
    });

    const res = await request(app)
      .post('/api/time-clock/clock-in/traveler')
      .send({ scanValue: 'TRV-001', employeeId: EMPLOYEE_ID });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('LABOR_BUDGET_BLOCKED');
    expect(res.body.approvalEndpoint).toBe(`/api/work-orders/${WORK_ORDER_ID}/approve-overrun`);
    expect(res.body.laborStatus.status).toBe('BLOCKED');
    expect(storage.createTimeClockEntryWithChargeContext).not.toHaveBeenCalled();
  });

  it('creates an APPROVED_OVERRUN entry when a valid laborApprovalId is supplied', async () => {
    vi.mocked(resolveTravelerBarcode).mockResolvedValue(mockTravelerContext);
    vi.mocked(storage.getOpenTimeClockEntry).mockResolvedValue(null);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({
      ...mockLaborStatus,
      status: 'BLOCKED',
      totalHours: 100,
      percentUsed: 100,
    });
    vi.mocked(storage.getLaborApprovalById).mockResolvedValue(makeLaborApproval());
    vi.mocked(storage.createTimeClockEntryWithChargeContext).mockResolvedValue(
      makeTimeClockEntry({ approvalStatus: 'APPROVED_OVERRUN', laborApprovalId: APPROVAL_ID })
    );

    const res = await request(app)
      .post('/api/time-clock/clock-in/traveler')
      .send({ scanValue: 'TRV-001', employeeId: EMPLOYEE_ID, laborApprovalId: APPROVAL_ID });

    expect(res.status).toBe(201);
    expect(res.body.entry.approvalStatus).toBe('APPROVED_OVERRUN');
    expect(storage.createTimeClockEntryWithChargeContext).toHaveBeenCalledWith(
      expect.objectContaining({ approvalStatus: 'APPROVED_OVERRUN', laborApprovalId: APPROVAL_ID })
    );
  });

  it('returns 403 when laborApprovalId is for a different employee', async () => {
    vi.mocked(resolveTravelerBarcode).mockResolvedValue(mockTravelerContext);
    vi.mocked(storage.getOpenTimeClockEntry).mockResolvedValue(null);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({
      ...mockLaborStatus,
      status: 'BLOCKED',
      totalHours: 100,
      percentUsed: 100,
    });
    vi.mocked(storage.getLaborApprovalById).mockResolvedValue(
      makeLaborApproval({ employeeId: 'DIFFERENT_EMP' })
    );

    const res = await request(app)
      .post('/api/time-clock/clock-in/traveler')
      .send({ scanValue: 'TRV-001', employeeId: EMPLOYEE_ID, laborApprovalId: APPROVAL_ID });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INVALID_LABOR_APPROVAL');
    expect(storage.createTimeClockEntryWithChargeContext).not.toHaveBeenCalled();
  });

  it('returns 403 when laborApprovalId is for a different work order', async () => {
    vi.mocked(resolveTravelerBarcode).mockResolvedValue(mockTravelerContext);
    vi.mocked(storage.getOpenTimeClockEntry).mockResolvedValue(null);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({
      ...mockLaborStatus,
      status: 'BLOCKED',
      totalHours: 100,
      percentUsed: 100,
    });
    vi.mocked(storage.getLaborApprovalById).mockResolvedValue(
      makeLaborApproval({ productionWorkOrderId: 'different-wo-id' })
    );

    const res = await request(app)
      .post('/api/time-clock/clock-in/traveler')
      .send({ scanValue: 'TRV-001', employeeId: EMPLOYEE_ID, laborApprovalId: APPROVAL_ID });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INVALID_LABOR_APPROVAL');
  });

  it('clocks in normally with AUTO status when budget is OK', async () => {
    vi.mocked(resolveTravelerBarcode).mockResolvedValue(mockTravelerContext);
    vi.mocked(storage.getOpenTimeClockEntry).mockResolvedValue(null);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({
      ...mockLaborStatus,
      status: 'OK',
      totalHours: 40,
      percentUsed: 40,
    });
    vi.mocked(storage.createTimeClockEntryWithChargeContext).mockResolvedValue(
      makeTimeClockEntry({ id: 1, approvalStatus: 'AUTO' })
    );

    const res = await request(app)
      .post('/api/time-clock/clock-in/traveler')
      .send({ scanValue: 'TRV-001', employeeId: EMPLOYEE_ID });

    expect(res.status).toBe(201);
    expect(res.body.entry.approvalStatus).toBe('AUTO');
    expect(storage.createTimeClockEntryWithChargeContext).toHaveBeenCalledWith(
      expect.objectContaining({ approvalStatus: 'AUTO', laborApprovalId: null })
    );
  });

  it('clocks in with warning when budget is in WARNING state', async () => {
    vi.mocked(resolveTravelerBarcode).mockResolvedValue(mockTravelerContext);
    vi.mocked(storage.getOpenTimeClockEntry).mockResolvedValue(null);
    vi.mocked(evaluateWorkOrderLaborStatus).mockResolvedValue({
      ...mockLaborStatus,
      status: 'WARNING',
      totalHours: 85,
      percentUsed: 85,
    });
    vi.mocked(storage.createTimeClockEntryWithChargeContext).mockResolvedValue(
      makeTimeClockEntry({ id: 2, approvalStatus: 'AUTO' })
    );

    const res = await request(app)
      .post('/api/time-clock/clock-in/traveler')
      .send({ scanValue: 'TRV-001', employeeId: EMPLOYEE_ID });

    expect(res.status).toBe(201);
    expect(res.body.warning).toBeDefined();
    expect(res.body.warning).toMatch(/85%/);
  });

  it('returns 400 when scanValue is missing', async () => {
    const res = await request(app)
      .post('/api/time-clock/clock-in/traveler')
      .send({ employeeId: EMPLOYEE_ID });
    expect(res.status).toBe(400);
  });

  it('returns 400 when employeeId is missing', async () => {
    const res = await request(app)
      .post('/api/time-clock/clock-in/traveler')
      .send({ scanValue: 'TRV-001' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when employee is already clocked in', async () => {
    vi.mocked(resolveTravelerBarcode).mockResolvedValue(mockTravelerContext);
    vi.mocked(storage.getOpenTimeClockEntry).mockResolvedValue(
      makeTimeClockEntry({ id: 5, clockIn: new Date() })
    );

    const res = await request(app)
      .post('/api/time-clock/clock-in/traveler')
      .send({ scanValue: 'TRV-001', employeeId: EMPLOYEE_ID });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_CLOCKED_IN');
    expect(storage.createTimeClockEntryWithChargeContext).not.toHaveBeenCalled();
  });
});
