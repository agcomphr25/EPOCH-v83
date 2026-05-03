import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

vi.mock('../db', () => ({
  pool: {
    query: vi.fn().mockResolvedValue([]),
  },
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, username: 'admin', role: 'ADMIN', employeeId: null, canOverridePrices: true, isActive: true };
    next();
  }),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../src/services/checklistInstanceService', () => ({
  generateInstancesForEmployee: vi.fn().mockResolvedValue([]),
  createSingleInstance: vi.fn().mockResolvedValue({}),
}));

import { pool } from '../db';

describe('GET /api/checklist-management/history – limit clamping', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(pool.query).mockResolvedValue([] as any);
    app = express();
    app.use(express.json());
    const checklistMgmtRouter = (await import('../src/routes/checklistManagement')).default;
    app.use('/api/checklist-management', checklistMgmtRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to a limit of 50 when no limit is provided', async () => {
    await request(app).get('/api/checklist-management/history');

    const params = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(params).toContain(50);
  });

  it('respects a custom limit below the maximum', async () => {
    await request(app).get('/api/checklist-management/history?limit=200');

    const params = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(params).toContain(200);
  });

  it('clamps an excessively large limit to 1000', async () => {
    await request(app).get('/api/checklist-management/history?limit=999999');

    const params = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(params).toContain(1000);
    expect(params).not.toContain(999999);
  });

  it('falls back to default limit when an invalid limit is provided', async () => {
    await request(app).get('/api/checklist-management/history?limit=notanumber');

    const params = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(params).toContain(50);
  });

  it('falls back to default limit when limit is zero', async () => {
    await request(app).get('/api/checklist-management/history?limit=0');

    const params = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(params).toContain(50);
  });
});

describe('GET /api/checklist-instances/history – limit clamping', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(pool.query).mockResolvedValue([{ total: '0' }] as any);
    app = express();
    app.use(express.json());
    const checklistInstancesRouter = (await import('../src/routes/checklistInstances')).default;
    app.use('/api/checklist-instances', checklistInstancesRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to a limit of 50 when no limit is provided', async () => {
    await request(app).get('/api/checklist-instances/history');

    const firstCallParams = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(firstCallParams).toContain(50);
  });

  it('respects a custom limit below the maximum', async () => {
    await request(app).get('/api/checklist-instances/history?limit=300');

    const firstCallParams = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(firstCallParams).toContain(300);
  });

  it('clamps an excessively large limit to 1000', async () => {
    await request(app).get('/api/checklist-instances/history?limit=999999');

    const firstCallParams = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(firstCallParams).toContain(1000);
    expect(firstCallParams).not.toContain(999999);
  });

  it('falls back to default limit when an invalid limit is provided', async () => {
    await request(app).get('/api/checklist-instances/history?limit=notanumber');

    const firstCallParams = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(firstCallParams).toContain(50);
  });

  it('falls back to default limit when limit is zero', async () => {
    await request(app).get('/api/checklist-instances/history?limit=0');

    const firstCallParams = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(firstCallParams).toContain(50);
  });
});
