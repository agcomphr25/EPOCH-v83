import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
  pool: { query: vi.fn() },
}));

import { authorizeApiRoute } from '../middleware/routeAuthorization';
import { createUpdateMoldSettingsHandler } from '../src/routes/moldSettingsUpdate';

type MoldRow = Record<string, unknown>;

const originalRow: MoldRow = {
  id: 2,
  mold_id: 'MOLD-002',
  model_name: 'Alpine',
  stock_models: ['cf_alpine'],
  instance_number: 3,
  enabled: true,
  multiplier: 2,
  is_active: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

function createDatabase(initialRows: MoldRow[] = [originalRow], validStockModels = ['cf_alpine', 'cf_privateer']) {
  const rows = initialRows.map((row) => ({ ...row, stock_models: [...(row.stock_models as string[])] }));

  const database = {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      if (text.startsWith('SELECT id FROM stock_models')) {
        const requested = params[0] as string[];
        return { rows: requested.filter((id) => validStockModels.includes(id)).map((id) => ({ id })) };
      }

      const id = params.at(-1);
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) return { rows: [] };

      const assignments = text.match(/SET ([\s\S]+?)\s+WHERE/)?.[1].split(',') ?? [];
      assignments.forEach((assignment, index) => {
        const column = assignment.trim().split(/\s*=\s*/)[0];
        if (column !== 'updated_at') row[column] = params[index - 1];
      });
      row.updated_at = new Date('2026-07-28T00:00:00.000Z');
      return { rows: [{ ...row }] };
    }),
  };

  return { database, rows };
}

function createApp(
  database: ReturnType<typeof createDatabase>['database'],
  user: { id: number; username: string; role: string } | null = {
    id: 1,
    username: 'admin',
    role: 'ADMIN',
  },
) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) req.user = user as Request['user'];
    next();
  });
  app.patch(
    '/api/layup-schedule/molds/:id',
    authorizeApiRoute(['/department-queue/production-queue']),
    createUpdateMoldSettingsHandler(database),
  );
  return app;
}

describe('PATCH /api/layup-schedule/molds/:id', () => {
  it('updates an existing mold with a valid stock model and returns the canonical API shape', async () => {
    const { database } = createDatabase();
    const response = await request(createApp(database))
      .patch('/api/layup-schedule/molds/2')
      .send({ stockModels: ['cf_privateer'] });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body).toMatchObject({
      success: true,
      mold: {
        id: 2,
        moldId: 'MOLD-002',
        stockModels: ['cf_privateer'],
        instanceNumber: 3,
      },
    });
  });

  it('replaces an existing stock-model association', async () => {
    const { database, rows } = createDatabase();
    await request(createApp(database))
      .patch('/api/layup-schedule/molds/2')
      .send({ stockModels: ['cf_privateer'] })
      .expect(200);

    expect(rows[0].stock_models).toEqual(['cf_privateer']);
  });

  it('clears the association when stockModels is null', async () => {
    const { database, rows } = createDatabase();
    const response = await request(createApp(database))
      .patch('/api/layup-schedule/molds/2')
      .send({ stockModels: null })
      .expect(200);

    expect(rows[0].stock_models).toEqual([]);
    expect(response.body.mold.stockModels).toEqual([]);
  });

  it('returns JSON 404 for a nonexistent mold', async () => {
    const { database } = createDatabase([]);
    const response = await request(createApp(database))
      .patch('/api/layup-schedule/molds/999')
      .send({ enabled: false });

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body).toEqual({ success: false, error: 'Mold not found' });
  });

  it('rejects a nonexistent stock model without updating the mold', async () => {
    const { database } = createDatabase();
    const response = await request(createApp(database))
      .patch('/api/layup-schedule/molds/2')
      .send({ stockModels: ['missing_model'] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: 'Stock model not found: missing_model' });
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  it.each(['abc', '2x', '0', '-1', '1.5'])('rejects malformed mold ID %s with JSON', async (id) => {
    const { database } = createDatabase();
    const response = await request(createApp(database))
      .patch(`/api/layup-schedule/molds/${id}`)
      .send({ enabled: false });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body.success).toBe(false);
    expect(database.query).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated user with JSON', async () => {
    const { database } = createDatabase();
    const response = await request(createApp(database, null))
      .patch('/api/layup-schedule/molds/2')
      .send({ enabled: false });

    expect(response.status).toBe(401);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body).toEqual({ error: 'Authentication required' });
    expect(database.query).not.toHaveBeenCalled();
  });

  it('rejects an authenticated user without Mold Settings access with JSON', async () => {
    const { database } = createDatabase();
    const response = await request(
      createApp(database, { id: 42, username: 'no_mold_access', role: 'EMPLOYEE' }),
    )
      .patch('/api/layup-schedule/molds/2')
      .send({ enabled: false });

    expect(response.status).toBe(403);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body).toMatchObject({ error: 'Access denied' });
    expect(database.query).not.toHaveBeenCalled();
  });

  it('preserves unrelated mold fields omitted from the request', async () => {
    const { database } = createDatabase();
    const response = await request(createApp(database))
      .patch('/api/layup-schedule/molds/2')
      .send({ enabled: false })
      .expect(200);

    expect(response.body.mold).toMatchObject({
      moldId: 'MOLD-002',
      modelName: 'Alpine',
      instanceNumber: 3,
      multiplier: 2,
      stockModels: ['cf_alpine'],
      enabled: false,
    });
  });

  it('rejects unsupported mold fields instead of silently accepting them', async () => {
    const { database } = createDatabase();
    const response = await request(createApp(database))
      .patch('/api/layup-schedule/molds/2')
      .send({ moldId: 'RENAMED' });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body.success).toBe(false);
    expect(database.query).not.toHaveBeenCalled();
  });

  it('persists the updated association in the row used by mold reads', async () => {
    const { database, rows } = createDatabase();
    await request(createApp(database))
      .patch('/api/layup-schedule/molds/2')
      .send({ stockModels: ['cf_privateer'] })
      .expect(200);

    const readModel = {
      ...rows[0],
      stockModels: rows[0].stock_models,
    };
    expect(readModel.stockModels).toEqual(['cf_privateer']);
  });
});
