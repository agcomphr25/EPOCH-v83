import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const ORDER_ID = 'test-order-001';

const { mockLogEvent } = vi.hoisted(() => ({
  mockLogEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireRole: vi.fn((..._roles: string[]) =>
    (_req: Request, _res: Response, next: NextFunction) => next()
  ),
}));

vi.mock('../src/services/auditService', () => ({
  auditService: {
    logEvent: mockLogEvent,
    logFieldChanges: vi.fn().mockResolvedValue(undefined),
    recordDepartmentEntry: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
  },
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

vi.mock('../storage', () => ({
  storage: {
    getAllOrdersWithPaymentStatus: vi.fn().mockResolvedValue([]),
    getFinalizedOrderById: vi.fn().mockRejectedValue(new Error('not found')),
    getOrderDraft: vi.fn().mockRejectedValue(new Error('not found')),
    getProductionOrderByOrderId: vi.fn().mockResolvedValue(null),
    updateFinalizedOrder: vi.fn().mockRejectedValue(new Error('not found')),
    updateOrderDraft: vi.fn().mockRejectedValue(new Error('not found')),
  },
}));

vi.mock('../src/services/queueReadinessService', () => ({
  evaluateQueueReadiness: vi.fn().mockResolvedValue(undefined),
}));

import { authenticateToken } from '../middleware/auth';

function injectUser(role: string, id = 1, username = 'test-user') {
  vi.mocked(authenticateToken).mockImplementation(
    (req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = { id, username, role, employeeId: null, canOverridePrices: false, isActive: true };
      next();
    }
  );
}

async function buildApp() {
  const app = express();
  app.use(express.json());
  const router = (await import('../src/routes/orders')).default;
  app.use('/', router);
  return app;
}

describe('Role enforcement — PATCH /:orderId/department', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 403 for an EMPLOYEE user', async () => {
    injectUser('EMPLOYEE');
    const app = await buildApp();

    const res = await request(app)
      .patch(`/${ORDER_ID}/department`)
      .send({ department: 'Shipping', reason: 'test' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });

  it('returns 403 for a MANAGER user', async () => {
    injectUser('MANAGER');
    const app = await buildApp();

    const res = await request(app)
      .patch(`/${ORDER_ID}/department`)
      .send({ department: 'CNC', reason: 'test' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });

  it('records a DEPARTMENT_TRANSFER_BLOCKED audit event when a non-admin is blocked', async () => {
    injectUser('EMPLOYEE', 42, 'shop-op');
    const app = await buildApp();

    await request(app)
      .patch(`/${ORDER_ID}/department`)
      .send({ department: 'Paint', reason: 'sneaky' });

    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'p1_order',
        entityId: ORDER_ID,
        action: 'DEPARTMENT_TRANSFER_BLOCKED',
        actor: expect.objectContaining({ username: 'shop-op', role: 'EMPLOYEE' }),
      })
    );
  });

  it('allows an ADMIN user through (returns 404 when order not found)', async () => {
    injectUser('ADMIN', 99, 'admin-user');
    const app = await buildApp();

    const res = await request(app)
      .patch(`/${ORDER_ID}/department`)
      .send({ department: 'Shipping', reason: 'admin move' });

    expect(res.status).not.toBe(403);
    expect(mockLogEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEPARTMENT_TRANSFER_BLOCKED' })
    );
  });

  it('allows an OWNER user through (returns 404 when order not found)', async () => {
    injectUser('OWNER', 1, 'owner-user');
    const app = await buildApp();

    const res = await request(app)
      .patch(`/${ORDER_ID}/department`)
      .send({ department: 'CNC', reason: 'owner move' });

    expect(res.status).not.toBe(403);
    expect(mockLogEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEPARTMENT_TRANSFER_BLOCKED' })
    );
  });
});
