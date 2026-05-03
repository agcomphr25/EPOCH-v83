import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

vi.mock('../src/services/auditService', () => ({
  auditService: {
    getAllSettings: vi.fn().mockResolvedValue([]),
    updateSetting: vi.fn().mockResolvedValue({}),
    getAuditHistory: vi.fn().mockResolvedValue([]),
    getDepartmentTransitions: vi.fn().mockResolvedValue([]),
    getDepartmentTimeSummary: vi.fn().mockResolvedValue({}),
    getScrapCycleHistory: vi.fn().mockResolvedValue([]),
    recordEvent: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

import { auditService } from '../src/services/auditService';

describe('GET /api/audit/events/:entityType/:entityId – limit clamping', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(auditService.getAuditHistory).mockResolvedValue([]);
    app = express();
    app.use(express.json());
    const auditRouter = (await import('../src/routes/audit')).default;
    app.use('/api/audit', auditRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to a limit of 100 when no limit is provided', async () => {
    await request(app).get('/api/audit/events/lot/LOT-001');

    expect(auditService.getAuditHistory).toHaveBeenCalledWith('lot', 'LOT-001', 100);
  });

  it('respects a custom limit below the maximum', async () => {
    await request(app).get('/api/audit/events/lot/LOT-001?limit=200');

    expect(auditService.getAuditHistory).toHaveBeenCalledWith('lot', 'LOT-001', 200);
  });

  it('clamps an excessively large limit to 1000', async () => {
    await request(app).get('/api/audit/events/lot/LOT-001?limit=999999');

    expect(auditService.getAuditHistory).toHaveBeenCalledWith('lot', 'LOT-001', 1000);
  });

  it('falls back to default limit when an invalid limit is provided', async () => {
    await request(app).get('/api/audit/events/lot/LOT-001?limit=notanumber');

    expect(auditService.getAuditHistory).toHaveBeenCalledWith('lot', 'LOT-001', 100);
  });

  it('falls back to default limit when limit is zero or negative', async () => {
    await request(app).get('/api/audit/events/lot/LOT-001?limit=0');

    expect(auditService.getAuditHistory).toHaveBeenCalledWith('lot', 'LOT-001', 100);
  });
});
