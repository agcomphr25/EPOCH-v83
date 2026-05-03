import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockPoolQuery } = vi.hoisted(() => ({ mockPoolQuery: vi.fn() }));

vi.mock('../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
  },
  pool: { query: mockPoolQuery },
}));

vi.mock('../storage', () => ({
  storage: {
    getAllOrdersWithPaymentStatus: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../src/services/queueReadinessService', () => ({
  evaluateQueueReadiness: vi.fn().mockResolvedValue(undefined),
}));

import ordersRouter from '../src/routes/orders';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', ordersRouter);
  return app;
}

describe('GET /search-all', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns [] when no query param is provided', async () => {
    const res = await request(app).get('/search-all');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns [] when query param is an empty string', async () => {
    const res = await request(app).get('/search-all?query=');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns [] when query param is only whitespace', async () => {
    const res = await request(app).get('/search-all?query=   ');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns matching results for a partial order_id match', async () => {
    mockPoolQuery.mockResolvedValueOnce([
      {
        order_id: 'ORD-001',
        fb_order_number: 'FB-001',
        customer_po: 'CPO-001',
        current_department: 'Cutting',
        source: 'all_orders',
      },
    ]);

    const res = await request(app).get('/search-all?query=ORD');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      orderId: 'ORD-001',
      fbOrderNumber: 'FB-001',
      customerPO: 'CPO-001',
      currentDepartment: 'Cutting',
      source: 'all_orders',
    });
  });

  it('passes the query as a ILIKE wildcard to pool.query', async () => {
    mockPoolQuery.mockResolvedValueOnce([]);

    await request(app).get('/search-all?query=abc');
    expect(mockPoolQuery).toHaveBeenCalledOnce();
    const [, params] = mockPoolQuery.mock.calls[0];
    expect(params).toEqual(['%abc%']);
  });

  it('trims whitespace from the query before searching', async () => {
    mockPoolQuery.mockResolvedValueOnce([]);

    await request(app).get('/search-all?query=  abc  ');
    expect(mockPoolQuery).toHaveBeenCalledOnce();
    const [, params] = mockPoolQuery.mock.calls[0];
    expect(params).toEqual(['%abc%']);
  });

  it('returns matching results for a partial fb_order_number match', async () => {
    mockPoolQuery.mockResolvedValueOnce([
      {
        order_id: 'ORD-002',
        fb_order_number: 'FB-999',
        customer_po: null,
        current_department: 'Sewing',
        source: 'all_orders',
      },
    ]);

    const res = await request(app).get('/search-all?query=FB-999');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      orderId: 'ORD-002',
      fbOrderNumber: 'FB-999',
      customerPO: null,
      source: 'all_orders',
    });
  });

  it('returns matching results for a partial customer_po match', async () => {
    mockPoolQuery.mockResolvedValueOnce([
      {
        order_id: 'ORD-003',
        fb_order_number: null,
        customer_po: 'PO-XYZ',
        current_department: 'QC',
        source: 'order_drafts',
      },
    ]);

    const res = await request(app).get('/search-all?query=PO-XYZ');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      orderId: 'ORD-003',
      customerPO: 'PO-XYZ',
      source: 'order_drafts',
    });
  });

  it('deduplicates rows by order_id and prefers production_orders over all_orders', async () => {
    mockPoolQuery.mockResolvedValueOnce([
      {
        order_id: 'ORD-DUP',
        fb_order_number: 'FB-DUP',
        customer_po: 'CPO-DUP',
        current_department: 'Shipping',
        source: 'all_orders',
      },
      {
        order_id: 'ORD-DUP',
        fb_order_number: null,
        customer_po: 'PO-PROD',
        current_department: 'Production Floor',
        source: 'production_orders',
      },
    ]);

    const res = await request(app).get('/search-all?query=ORD-DUP');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      orderId: 'ORD-DUP',
      source: 'production_orders',
      currentDepartment: 'Production Floor',
    });
  });

  it('deduplicates rows by order_id and prefers production_orders over order_drafts', async () => {
    mockPoolQuery.mockResolvedValueOnce([
      {
        order_id: 'ORD-DUP2',
        fb_order_number: 'FB-DUP2',
        customer_po: 'CPO-DUP2',
        current_department: 'Drafts Dept',
        source: 'order_drafts',
      },
      {
        order_id: 'ORD-DUP2',
        fb_order_number: null,
        customer_po: 'PO-PROD2',
        current_department: 'Production Dept',
        source: 'production_orders',
      },
    ]);

    const res = await request(app).get('/search-all?query=ORD-DUP2');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      orderId: 'ORD-DUP2',
      source: 'production_orders',
      currentDepartment: 'Production Dept',
    });
  });

  it('deduplicates rows by order_id and prefers order_drafts over all_orders', async () => {
    mockPoolQuery.mockResolvedValueOnce([
      {
        order_id: 'ORD-DUP3',
        fb_order_number: 'FB-DUP3',
        customer_po: 'CPO-DUP3',
        current_department: 'All Orders Dept',
        source: 'all_orders',
      },
      {
        order_id: 'ORD-DUP3',
        fb_order_number: 'FB-DUP3-DRAFT',
        customer_po: 'CPO-DUP3-DRAFT',
        current_department: 'Drafts Dept',
        source: 'order_drafts',
      },
    ]);

    const res = await request(app).get('/search-all?query=ORD-DUP3');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      orderId: 'ORD-DUP3',
      source: 'order_drafts',
      currentDepartment: 'Drafts Dept',
    });
  });

  it('returns multiple distinct results without deduplication when order_ids differ', async () => {
    mockPoolQuery.mockResolvedValueOnce([
      {
        order_id: 'ORD-A',
        fb_order_number: 'FB-A',
        customer_po: 'PO-A',
        current_department: 'Dept A',
        source: 'all_orders',
      },
      {
        order_id: 'ORD-B',
        fb_order_number: 'FB-B',
        customer_po: 'PO-B',
        current_department: 'Dept B',
        source: 'production_orders',
      },
    ]);

    const res = await request(app).get('/search-all?query=ORD');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('falls back to "Unknown" for current_department when the value is null', async () => {
    mockPoolQuery.mockResolvedValueOnce([
      {
        order_id: 'ORD-NODEPT',
        fb_order_number: null,
        customer_po: null,
        current_department: null,
        source: 'all_orders',
      },
    ]);

    const res = await request(app).get('/search-all?query=ORD-NODEPT');
    expect(res.status).toBe(200);
    expect(res.body[0].currentDepartment).toBe('Unknown');
  });

  it('skips rows with a null or missing order_id', async () => {
    mockPoolQuery.mockResolvedValueOnce([
      {
        order_id: null,
        fb_order_number: 'FB-NULL',
        customer_po: null,
        current_department: 'Somewhere',
        source: 'all_orders',
      },
    ]);

    const res = await request(app).get('/search-all?query=FB-NULL');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 when pool.query throws', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('DB failure'));

    const res = await request(app).get('/search-all?query=crash');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'Failed to search orders' });
  });
});
