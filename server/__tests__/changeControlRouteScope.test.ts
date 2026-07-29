import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  pool: { query: vi.fn() },
}));
vi.mock('../middleware/requirePermission', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../src/services/permissionService', () => ({
  getUserPermissions: vi.fn(),
}));
vi.mock('../src/services/changeControlService');

import { pool } from '../db';
import changeControlRoutes from '../src/routes/changeControl';

describe('Change Control router scope', () => {
  it('does not authenticate or check schema readiness for unrelated API routes', async () => {
    const app = express();
    app.use('/api', changeControlRoutes);
    app.get('/api/discounts/persistent-discounts', (_req, res) => {
      res.json({ reachedDiscountRoute: true });
    });

    const response = await request(app).get('/api/discounts/persistent-discounts');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reachedDiscountRoute: true });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
