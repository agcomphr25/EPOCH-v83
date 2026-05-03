import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const mockLimit = vi.fn().mockResolvedValue([]);
const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock('../db', () => ({
  db: { select: mockSelect },
  pool: { query: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../schema', () => ({
  apiIntegrationKeys: {},
  epochExternalEvents: {},
  epochLaborFacts: { employeeId: 'employeeId', occurredAt: 'occurredAt', jobId: 'jobId', siteId: 'siteId' },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: any, _res: any, next: any) => next()),
  requireRole: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock('../storage', () => ({
  storage: {
    getEmployee: vi.fn().mockResolvedValue(null),
    getTimeClockEntries: vi.fn().mockResolvedValue([]),
    createTimeClockEntry: vi.fn(),
    updateTimeClockEntry: vi.fn(),
  },
}));

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

vi.mock('../src/helpers/travelerBarcodeResolver', () => ({
  resolveTravelerBarcode: vi.fn(),
}));

vi.mock('../src/helpers/laborBudgetHelper', () => ({
  evaluateWorkOrderLaborStatus: vi.fn(),
}));

import { getConnectorHealthHistory } from '../src/services/connectorHealthService';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  return app;
}

describe('GET /api/labor-facts/by-employee/:employeeId – limit clamping', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    app = buildApp();
    const { registerTimeClockRoutes } = await import('../src/routes/timeClock');
    registerTimeClockRoutes(app);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to a limit of 100 when no limit is provided', async () => {
    await request(app).get('/api/labor-facts/by-employee/EMP001');

    expect(mockLimit).toHaveBeenCalledWith(100);
  });

  it('respects a custom limit below the maximum', async () => {
    await request(app).get('/api/labor-facts/by-employee/EMP001?limit=200');

    expect(mockLimit).toHaveBeenCalledWith(200);
  });

  it('clamps an excessively large limit to 1000', async () => {
    await request(app).get('/api/labor-facts/by-employee/EMP001?limit=999999');

    expect(mockLimit).toHaveBeenCalledWith(1000);
  });

  it('falls back to default limit when an invalid limit is provided', async () => {
    await request(app).get('/api/labor-facts/by-employee/EMP001?limit=notanumber');

    expect(mockLimit).toHaveBeenCalledWith(100);
  });

  it('falls back to default limit when limit is zero', async () => {
    await request(app).get('/api/labor-facts/by-employee/EMP001?limit=0');

    expect(mockLimit).toHaveBeenCalledWith(100);
  });
});

describe('GET /api/labor-facts/by-job/:jobId – limit clamping', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    app = buildApp();
    const { registerTimeClockRoutes } = await import('../src/routes/timeClock');
    registerTimeClockRoutes(app);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to a limit of 100 when no limit is provided', async () => {
    await request(app).get('/api/labor-facts/by-job/WO-001');

    expect(mockLimit).toHaveBeenCalledWith(100);
  });

  it('clamps an excessively large limit to 1000', async () => {
    await request(app).get('/api/labor-facts/by-job/WO-001?limit=999999');

    expect(mockLimit).toHaveBeenCalledWith(1000);
  });
});

describe('GET /api/labor-facts/by-date – limit clamping', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    app = buildApp();
    const { registerTimeClockRoutes } = await import('../src/routes/timeClock');
    registerTimeClockRoutes(app);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to a limit of 500 when no limit is provided', async () => {
    await request(app).get('/api/labor-facts/by-date?startDate=2026-01-01&endDate=2026-04-01');

    expect(mockLimit).toHaveBeenCalledWith(500);
  });

  it('clamps an excessively large limit to 1000', async () => {
    await request(app).get('/api/labor-facts/by-date?startDate=2026-01-01&endDate=2026-04-01&limit=999999');

    expect(mockLimit).toHaveBeenCalledWith(1000);
  });
});

describe('GET /api/labor-facts/by-site/:siteId – limit clamping', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    app = buildApp();
    const { registerTimeClockRoutes } = await import('../src/routes/timeClock');
    registerTimeClockRoutes(app);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to a limit of 500 when no limit is provided', async () => {
    await request(app).get('/api/labor-facts/by-site/SITE-001');

    expect(mockLimit).toHaveBeenCalledWith(500);
  });

  it('clamps an excessively large limit to 1000', async () => {
    await request(app).get('/api/labor-facts/by-site/SITE-001?limit=999999');

    expect(mockLimit).toHaveBeenCalledWith(1000);
  });
});

describe('GET /api/connector-health/:tenantId/:sourceSystem/history – limit clamping', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getConnectorHealthHistory).mockResolvedValue([]);
    app = buildApp();
    const { registerTimeClockRoutes } = await import('../src/routes/timeClock');
    registerTimeClockRoutes(app);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to a limit of 50 when no limit is provided', async () => {
    await request(app).get('/api/connector-health/tenant1/erp/history');

    expect(getConnectorHealthHistory).toHaveBeenCalledWith('tenant1', 'erp', 50);
  });

  it('respects a custom limit below the maximum', async () => {
    await request(app).get('/api/connector-health/tenant1/erp/history?limit=200');

    expect(getConnectorHealthHistory).toHaveBeenCalledWith('tenant1', 'erp', 200);
  });

  it('clamps an excessively large limit to 1000', async () => {
    await request(app).get('/api/connector-health/tenant1/erp/history?limit=999999');

    expect(getConnectorHealthHistory).toHaveBeenCalledWith('tenant1', 'erp', 1000);
  });

  it('falls back to default limit when an invalid limit is provided', async () => {
    await request(app).get('/api/connector-health/tenant1/erp/history?limit=notanumber');

    expect(getConnectorHealthHistory).toHaveBeenCalledWith('tenant1', 'erp', 50);
  });

  it('falls back to default limit when limit is zero', async () => {
    await request(app).get('/api/connector-health/tenant1/erp/history?limit=0');

    expect(getConnectorHealthHistory).toHaveBeenCalledWith('tenant1', 'erp', 50);
  });
});
