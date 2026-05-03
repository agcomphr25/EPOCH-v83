import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import type { TimeClockEntry } from '../schema';

const EMPLOYEE_ID = 'EMP001';
const WORK_ORDER_ID = 'aabbccdd-1111-2222-3333-aabbccddeeff';

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

interface SelectLimitChain { limit: (n: number) => Promise<Record<string, unknown>[]> }
interface SelectWhereChain { where: (cond: unknown) => SelectLimitChain }
interface SelectFromChain { from: (table: unknown) => SelectWhereChain }

vi.mock('../db', () => ({
  db: {
    select: vi.fn<() => SelectFromChain>(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  },
  pool: {},
}));

vi.mock('../storage', () => ({
  storage: {
    getTimeClockEntries: vi.fn<(employeeId?: string, date?: string, limit?: number, offset?: number) => Promise<TimeClockEntry[]>>(),
    getEmployee: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    // Default: admin user who can query any employee
    req.user = {
      id: 1,
      username: 'admin',
      role: 'ADMIN',
      employeeId: null,
      canOverridePrices: true,
      isActive: true,
    };
    next();
  }),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../schema', () => ({
  timeClockEntries: {},
  employees: {},
  apiIntegrationKeys: {},
  epochExternalEvents: {},
  epochLaborFacts: {},
}));

import { storage } from '../storage';
import { authenticateToken } from '../middleware/auth';

function makeTimeClockEntry(overrides: Partial<TimeClockEntry> = {}): TimeClockEntry {
  return {
    id: 1,
    employeeId: EMPLOYEE_ID,
    clockIn: new Date('2026-04-16T08:00:00Z'),
    clockOut: new Date('2026-04-16T17:00:00Z'),
    date: '2026-04-16',
    createdAt: new Date('2026-04-16T08:00:00Z'),
    productionWorkOrderId: WORK_ORDER_ID,
    travelerId: null,
    department: 'WELD',
    operation: 'Weld',
    chargeCode: 'WO-123',
    approvalStatus: 'AUTO',
    laborApprovalId: null,
    ...overrides,
  };
}

describe('GET /api/labor/sessions', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const laborRouter = (await import('../src/routes/labor')).default;
    app.use('/api/labor', laborRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 400 when employeeId query param is missing', async () => {
    const res = await request(app).get('/api/labor/sessions');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/employeeId/i);
  });

  it('returns an empty array when the employee has no entries', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    const res = await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns chargeCode as a string for entries that have one', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([
      makeTimeClockEntry({ chargeCode: 'WO-ALPHA' }),
    ]);

    const res = await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].chargeCode).toBe('WO-ALPHA');
    expect(typeof res.body[0].chargeCode).toBe('string');
  });

  it('returns chargeCode as null (not "null", "undefined", or a number) when the entry has no charge code', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([
      makeTimeClockEntry({ chargeCode: null }),
    ]);

    const res = await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].chargeCode).toBeNull();
    expect(res.body[0].chargeCode).not.toBe('null');
    expect(res.body[0].chargeCode).not.toBe('undefined');
    expect(typeof res.body[0].chargeCode).not.toBe('number');
  });

  it('handles a mix of entries with and without charge codes', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([
      makeTimeClockEntry({ id: 1, chargeCode: 'WO-001' }),
      makeTimeClockEntry({ id: 2, chargeCode: null }),
      makeTimeClockEntry({ id: 3, chargeCode: 'WO-002' }),
    ]);

    const res = await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].chargeCode).toBe('WO-001');
    expect(res.body[1].chargeCode).toBeNull();
    expect(res.body[2].chargeCode).toBe('WO-002');
  });

  it('forwards the employeeId query parameter to the storage layer', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}`);

    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 200, 0);
  });

  it('forwards the optional date query parameter to the storage layer', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}&date=2026-04-16`);

    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, '2026-04-16', 200, 0);
  });

  it('defaults to a limit of 200 when no limit query param is provided', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}`);

    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 200, 0);
  });

  it('forwards a custom limit query param to the storage layer', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}&limit=50`);

    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 50, 0);
  });

  it('falls back to the default limit of 200 when an invalid limit is provided', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}&limit=notanumber`);

    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 200, 0);
  });

  it('falls back to the default limit of 200 when limit is zero or negative', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}&limit=0`);

    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 200, 0);
  });

  it('clamps an excessively large limit to the maximum of 1000', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}&limit=999999`);

    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 1000, 0);
  });

  it('forwards a custom offset query param to the storage layer', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}&offset=200`);

    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 200, 200);
  });

  it('combines limit and offset and forwards both to the storage layer', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}&limit=50&offset=100`);

    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 50, 100);
  });

  it('defaults offset to 0 when no offset query param is provided', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}`);

    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 200, 0);
  });

  it('falls back to offset 0 when an invalid offset is provided', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}&offset=notanumber`);

    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 200, 0);
  });

  it('falls back to offset 0 when a negative offset is provided', async () => {
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}&offset=-5`);

    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 200, 0);
  });

  it('returns 500 when storage throws', async () => {
    vi.mocked(storage.getTimeClockEntries).mockRejectedValue(new Error('DB connection lost'));

    const res = await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});

describe('GET /api/labor/sessions – auth scoping', () => {
  const OPERATOR_EMPLOYEE_ID = 42;
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const laborRouter = (await import('../src/routes/labor')).default;
    app.use('/api/labor', laborRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('admin can query any employeeId via query param', async () => {
    vi.mocked(authenticateToken).mockImplementation((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: 1, username: 'admin', role: 'ADMIN', employeeId: null, canOverridePrices: true, isActive: true };
      next();
    });
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([makeTimeClockEntry()]);

    const res = await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}`);

    expect(res.status).toBe(200);
    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 200, 0);
  });

  it('non-admin operator can access their own sessions when passing their own employeeId', async () => {
    vi.mocked(authenticateToken).mockImplementation((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: 2, username: 'operator1', role: 'OPERATOR', employeeId: OPERATOR_EMPLOYEE_ID, canOverridePrices: false, isActive: true };
      next();
    });
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([makeTimeClockEntry({ employeeId: String(OPERATOR_EMPLOYEE_ID) })]);

    const res = await request(app).get(`/api/labor/sessions?employeeId=${String(OPERATOR_EMPLOYEE_ID)}`);

    expect(res.status).toBe(200);
    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(String(OPERATOR_EMPLOYEE_ID), undefined, 200, 0);
  });

  it('non-admin operator with no employeeId query param has their own ID derived from req.user', async () => {
    vi.mocked(authenticateToken).mockImplementation((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: 2, username: 'operator1', role: 'OPERATOR', employeeId: OPERATOR_EMPLOYEE_ID, canOverridePrices: false, isActive: true };
      next();
    });
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([makeTimeClockEntry({ employeeId: String(OPERATOR_EMPLOYEE_ID) })]);

    const res = await request(app).get('/api/labor/sessions');

    expect(res.status).toBe(200);
    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(String(OPERATOR_EMPLOYEE_ID), undefined, 200, 0);
  });

  it('non-admin operator requesting a different employee ID receives 403', async () => {
    vi.mocked(authenticateToken).mockImplementation((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: 2, username: 'operator1', role: 'OPERATOR', employeeId: OPERATOR_EMPLOYEE_ID, canOverridePrices: false, isActive: true };
      next();
    });

    const res = await request(app).get(`/api/labor/sessions?employeeId=SOMEONE_ELSE`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/access denied/i);
    expect(storage.getTimeClockEntries).not.toHaveBeenCalled();
  });

  it('non-admin operator with no linked employee record receives 403', async () => {
    vi.mocked(authenticateToken).mockImplementation((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: 3, username: 'unlinked', role: 'OPERATOR', employeeId: null, canOverridePrices: false, isActive: true };
      next();
    });

    const res = await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/no employee record/i);
    expect(storage.getTimeClockEntries).not.toHaveBeenCalled();
  });

  it('HR user can query any employee by ID', async () => {
    vi.mocked(authenticateToken).mockImplementation((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: 4, username: 'hr_user', role: 'HR', employeeId: null, canOverridePrices: false, isActive: true };
      next();
    });
    vi.mocked(storage.getTimeClockEntries).mockResolvedValue([]);

    const res = await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}`);

    expect(res.status).toBe(200);
    expect(storage.getTimeClockEntries).toHaveBeenCalledWith(EMPLOYEE_ID, undefined, 200, 0);
  });

  it('returns 401 when req.user is not populated', async () => {
    vi.mocked(authenticateToken).mockImplementation((_req: Request, _res: Response, next: NextFunction) => {
      next();
    });

    const res = await request(app).get(`/api/labor/sessions?employeeId=${EMPLOYEE_ID}`);

    expect(res.status).toBe(401);
  });
});
