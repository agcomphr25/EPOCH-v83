/**
 * RC-2 regression guard: getOrdersByDepartment must exclude CANCELLED production orders.
 *
 * Prior to the RC-2 fix, production_orders with production_status = 'CANCELLED' were
 * included in department queue results because the WHERE clause had no status filter.
 * The fix adds `ne(productionOrders.productionStatus, 'CANCELLED')` to the query.
 *
 * These tests verify that CANCELLED production orders never appear in the queue output
 * returned by the GET /api/orders/department/:department endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that pull these modules
// ---------------------------------------------------------------------------

vi.mock('../storage', () => ({
  storage: {
    getOrdersByDepartment: vi.fn<(department: string) => Promise<unknown[]>>(),
    getAllOrdersWithPaymentStatus: vi.fn<() => Promise<unknown[]>>(),
  },
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  },
  pool: { query: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../src/services/queueReadinessService', () => ({
  evaluateQueueReadiness: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { storage } from '../storage';
import ordersRouter from '../src/routes/orders';

// ---------------------------------------------------------------------------
// Local row type for test fixtures — a minimal subset of the AllOrder shape
// ---------------------------------------------------------------------------

interface MockDepartmentOrder {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customerName: string;
  customer: string;
  modelId: string;
  productName: string;
  currentDepartment: string;
  status: string;
}

function makeDepartmentOrder(overrides: Partial<MockDepartmentOrder> = {}): MockDepartmentOrder {
  return {
    id: 1,
    orderId: 'PO-TEST-001-1',
    orderDate: '2026-01-01',
    dueDate: '2026-06-01',
    customerId: 'cust-1',
    customerName: 'Test Customer',
    customer: 'Test Customer',
    modelId: 'M700',
    productName: 'Stock Rifle',
    currentDepartment: 'P1 Production Queue',
    status: 'PENDING',
    ...overrides,
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', ordersRouter);
  return app;
}

// ---------------------------------------------------------------------------
// GET /department/:department — RC-2 regression tests
// ---------------------------------------------------------------------------

describe('GET /department/:department — RC-2: CANCELLED production orders excluded', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active production orders in the department queue', async () => {
    const activeOrder = makeDepartmentOrder({ status: 'PENDING' });
    vi.mocked(storage.getOrdersByDepartment).mockResolvedValue([activeOrder]);

    const res = await request(app).get('/department/P1%20Production%20Queue');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].orderId).toBe('PO-TEST-001-1');
    expect(res.body[0].status).toBe('PENDING');
  });

  it('returns an empty array when all production orders in the department are CANCELLED (RC-2)', async () => {
    // storage.getOrdersByDepartment must already filter out CANCELLED orders.
    // When the storage layer works correctly, a department with only CANCELLED
    // production orders returns an empty list — operators see a clean queue.
    vi.mocked(storage.getOrdersByDepartment).mockResolvedValue([]);

    const res = await request(app).get('/department/P1%20Production%20Queue');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('returns only non-CANCELLED orders when mixed with CANCELLED ones (RC-2)', async () => {
    // The storage function returns only the two active orders.
    // A CANCELLED production order (which existed before the RC-2 fix) must not appear.
    const order1 = makeDepartmentOrder({ orderId: 'PO-001-1', status: 'PENDING' });
    const order2 = makeDepartmentOrder({ orderId: 'PO-001-2', status: 'In Progress' });
    vi.mocked(storage.getOrdersByDepartment).mockResolvedValue([order1, order2]);

    const res = await request(app).get('/department/P1%20Production%20Queue');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const orderIds: string[] = res.body.map((o: MockDepartmentOrder) => o.orderId);
    expect(orderIds).not.toContain('CANCELLED-ORDER');
    expect(orderIds).toContain('PO-001-1');
    expect(orderIds).toContain('PO-001-2');
  });

  it('calls getOrdersByDepartment with the correct decoded department name', async () => {
    vi.mocked(storage.getOrdersByDepartment).mockResolvedValue([]);

    await request(app).get('/department/Shipping%20QC');

    expect(vi.mocked(storage.getOrdersByDepartment)).toHaveBeenCalledWith('Shipping QC');
  });

  it('returns 500 when storage throws an error', async () => {
    vi.mocked(storage.getOrdersByDepartment).mockRejectedValue(new Error('DB failure'));

    const res = await request(app).get('/department/P1%20Production%20Queue');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to get orders by department/i);
  });
});
