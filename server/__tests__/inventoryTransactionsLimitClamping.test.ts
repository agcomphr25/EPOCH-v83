import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../db', () => ({
  pool: { query: vi.fn().mockResolvedValue([]) },
  db: { select: vi.fn(), execute: vi.fn() },
}));

vi.mock('../storage', () => ({
  storage: {
    getAllInventoryTransactions: vi.fn().mockResolvedValue([]),
    getInventoryItems: vi.fn().mockResolvedValue([]),
    getInventoryItem: vi.fn().mockResolvedValue(null),
    createInventoryItem: vi.fn(),
    updateInventoryItem: vi.fn(),
    deleteInventoryItem: vi.fn(),
    getInventoryScans: vi.fn().mockResolvedValue([]),
    createInventoryScan: vi.fn(),
    getInventoryTransaction: vi.fn().mockResolvedValue(null),
    createInventoryTransaction: vi.fn(),
    getInventoryBalance: vi.fn().mockResolvedValue(null),
    getInventoryBalances: vi.fn().mockResolvedValue([]),
    createInventoryBalance: vi.fn(),
    updateInventoryBalance: vi.fn(),
    getVendorParts: vi.fn().mockResolvedValue([]),
    createVendorPart: vi.fn(),
    updateVendorPart: vi.fn(),
    deleteVendorPart: vi.fn(),
    getInventoryItemGroups: vi.fn().mockResolvedValue([]),
    createInventoryItemGroup: vi.fn(),
    updateInventoryItemGroup: vi.fn(),
    deleteInventoryItemGroup: vi.fn(),
    getPartsRequests: vi.fn().mockResolvedValue([]),
    createPartsRequest: vi.fn(),
    updatePartsRequest: vi.fn(),
    getDepartments: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: any, _res: any, next: any) => next()),
  requireRole: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock('../schema', () => ({
  DEPARTMENT_LOCATION_MAP: {},
  getSupplySourceDashboard: vi.fn(() => null),
}));

vi.mock('../src/services/mrpMaterialPlanning', () => ({
  calculateMaterialDemand: vi.fn(),
  calculateMaterialShortages: vi.fn(),
  calculateBuildCapacity: vi.fn(),
  runMrp: vi.fn(),
}));

vi.mock('../src/utils/unitConversionService', () => ({
  validateSameFamily: vi.fn(),
}));

import { storage } from '../storage';

describe('GET /api/enhanced/inventory/transactions – limit clamping', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(storage.getAllInventoryTransactions).mockResolvedValue([]);
    app = express();
    app.use(express.json());
    const inventoryRouter = (await import('../src/routes/inventory')).default;
    app.use('/api/enhanced', inventoryRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to a limit of 50 when no limit is provided', async () => {
    const res = await request(app).get('/api/enhanced/inventory/transactions');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(50);
  });

  it('respects a custom limit below the maximum', async () => {
    const res = await request(app).get('/api/enhanced/inventory/transactions?limit=200');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(200);
  });

  it('clamps an excessively large limit to 1000', async () => {
    const res = await request(app).get('/api/enhanced/inventory/transactions?limit=999999');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(1000);
  });

  it('falls back to default limit when an invalid limit is provided', async () => {
    const res = await request(app).get('/api/enhanced/inventory/transactions?limit=notanumber');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(50);
  });

  it('falls back to default limit when limit is zero', async () => {
    const res = await request(app).get('/api/enhanced/inventory/transactions?limit=0');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(50);
  });
});
