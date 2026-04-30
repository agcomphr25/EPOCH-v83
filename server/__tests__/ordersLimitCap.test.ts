import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
  },
  pool: {},
}));

vi.mock('../storage', () => ({
  storage: {
    getAllOrdersWithPaymentStatus: vi.fn(),
  },
}));

vi.mock('../src/services/queueReadinessService', () => ({
  evaluateQueueReadiness: vi.fn().mockResolvedValue(undefined),
}));

import { storage } from '../storage';
import ordersRouter from '../src/routes/orders';
import { DEFAULT_ORDERS_LIMIT, MAX_ORDERS_LIMIT } from '../src/constants/orders';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', ordersRouter);
  return app;
}

describe('GET /with-payment-status — limit clamping', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getAllOrdersWithPaymentStatus).mockResolvedValue([]);
  });

  it('defaults to DEFAULT_ORDERS_LIMIT when no limit param is provided', async () => {
    await request(app).get('/with-payment-status');
    expect(vi.mocked(storage.getAllOrdersWithPaymentStatus)).toHaveBeenCalledWith('', DEFAULT_ORDERS_LIMIT);
  });

  it('passes through a limit below MAX_ORDERS_LIMIT unchanged', async () => {
    await request(app).get('/with-payment-status?limit=50');
    expect(vi.mocked(storage.getAllOrdersWithPaymentStatus)).toHaveBeenCalledWith('', 50);
  });

  it('clamps a limit that exceeds MAX_ORDERS_LIMIT to MAX_ORDERS_LIMIT', async () => {
    await request(app).get('/with-payment-status?limit=99999');
    expect(vi.mocked(storage.getAllOrdersWithPaymentStatus)).toHaveBeenCalledWith('', MAX_ORDERS_LIMIT);
  });
});
