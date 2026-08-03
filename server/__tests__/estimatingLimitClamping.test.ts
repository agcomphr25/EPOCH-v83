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

vi.mock('../storage', () => ({
  storage: {
    createEstimatingRfq: vi.fn(),
    getEstimatingRfq: vi.fn(),
    updateEstimatingRfq: vi.fn(),
    deleteEstimatingRfq: vi.fn(),
    createEstimatingRfqPart: vi.fn(),
    updateEstimatingRfqPart: vi.fn(),
    deleteEstimatingRfqPart: vi.fn(),
    createEstimatingTooling: vi.fn(),
    updateEstimatingTooling: vi.fn(),
    deleteEstimatingTooling: vi.fn(),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

import { pool } from '../db';

describe('GET /api/estimating/rfqs – limit clamping', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(pool.query).mockResolvedValue([] as any);
    app = express();
    app.use(express.json());
    const estimatingRouter = (await import('../src/routes/estimating')).default;
    app.use('/api/estimating', estimatingRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to a limit of 50 when no limit is provided', async () => {
    await request(app).get('/api/estimating/rfqs');

    const params = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(params).toContain(50);
  });

  it('respects a custom limit below the maximum', async () => {
    await request(app).get('/api/estimating/rfqs?limit=200');

    const params = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(params).toContain(200);
  });

  it('clamps an excessively large limit to 1000', async () => {
    await request(app).get('/api/estimating/rfqs?limit=999999');

    const params = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(params).toContain(1000);
    expect(params).not.toContain(999999);
  });

  it('falls back to default limit when an invalid limit is provided', async () => {
    await request(app).get('/api/estimating/rfqs?limit=notanumber');

    const params = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(params).toContain(50);
  });

  it('falls back to default limit when limit is zero', async () => {
    await request(app).get('/api/estimating/rfqs?limit=0');

    const params = vi.mocked(pool.query).mock.calls[0][1] as any[];
    expect(params).toContain(50);
  });
});
