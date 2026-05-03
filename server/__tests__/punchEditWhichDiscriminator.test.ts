/**
 * Tests for PATCH /api/timekeeping/punches/:id — `which` discriminator
 *
 * The Punch Review table expands each session into two virtual event rows
 * (clock-in + clock-out). The PATCH handler must update only the timestamp
 * column named by the `which` field, never touching the other column.
 *
 * These tests verify that:
 *   - which='clockIn'  → only clockIn  is written; clockOut is untouched
 *   - which='clockOut' → only clockOut is written; clockIn  is untouched
 *   - missing `which`  → 400 validation error
 *   - missing editNote → 400 validation error (DCAA TK-004)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any code that imports the module graph
// ---------------------------------------------------------------------------

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

const mockUpdatePunchLedgerEntry = vi.fn();
const mockGetPunchLedgerEntryById = vi.fn();

vi.mock('../storage', () => ({
  storage: {
    getPunchLedgerEntryById: (...args: unknown[]) => mockGetPunchLedgerEntryById(...args),
    updatePunchLedgerEntry: (...args: unknown[]) => mockUpdatePunchLedgerEntry(...args),
  },
}));

const mockInsert = vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) }));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
  pool: {},
  nativeDb: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../src/lib/actorFromUser', () => ({
  actorFromUser: vi.fn(() => ({ id: 1, email: 'admin@test.com', role: 'ADMIN' })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLOCK_IN_TS = new Date('2026-04-20T08:00:00.000Z');
const CLOCK_OUT_TS = new Date('2026-04-20T17:00:00.000Z');

function makeLedgerEntry(overrides = {}) {
  return {
    id: 42,
    employeeId: 10,
    clockIn: CLOCK_IN_TS,
    clockOut: CLOCK_OUT_TS,
    isEdited: false,
    editNote: null,
    chargeCodeId: null,
    travelerId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /api/timekeeping/punches/:id — which discriminator', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: the session exists
    mockGetPunchLedgerEntryById.mockResolvedValue(makeLedgerEntry());
    mockUpdatePunchLedgerEntry.mockResolvedValue(makeLedgerEntry());

    app = express();
    app.use(express.json());
    const router = (await import('../src/routes/timekeeping/punches')).default;
    app.use('/api/timekeeping', router);
  });

  it('returns 400 when `which` is missing', async () => {
    const res = await request(app)
      .patch('/api/timekeeping/punches/42')
      .send({ punchedAt: '2026-04-20T09:00:00.000Z', editNote: 'fix' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when editNote is missing (DCAA TK-004)', async () => {
    const res = await request(app)
      .patch('/api/timekeeping/punches/42')
      .send({ which: 'clockIn', punchedAt: '2026-04-20T09:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/editNote/i);
  });

  it('updates only clockIn when which="clockIn"', async () => {
    const newTs = '2026-04-20T09:00:00.000Z';

    const res = await request(app)
      .patch('/api/timekeeping/punches/42')
      .send({ which: 'clockIn', punchedAt: newTs, editNote: 'late arrival correction' });

    expect(res.status).toBe(200);

    expect(mockUpdatePunchLedgerEntry).toHaveBeenCalledOnce();
    const [, updates] = mockUpdatePunchLedgerEntry.mock.calls[0];

    expect(updates).toHaveProperty('clockIn', new Date(newTs));
    expect(updates).not.toHaveProperty('clockOut');
  });

  it('updates only clockOut when which="clockOut"', async () => {
    const newTs = '2026-04-20T18:00:00.000Z';

    const res = await request(app)
      .patch('/api/timekeeping/punches/42')
      .send({ which: 'clockOut', punchedAt: newTs, editNote: 'early departure correction' });

    expect(res.status).toBe(200);

    expect(mockUpdatePunchLedgerEntry).toHaveBeenCalledOnce();
    const [, updates] = mockUpdatePunchLedgerEntry.mock.calls[0];

    expect(updates).toHaveProperty('clockOut', new Date(newTs));
    expect(updates).not.toHaveProperty('clockIn');
  });

  it('returns 404 when the session does not exist', async () => {
    mockGetPunchLedgerEntryById.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/timekeeping/punches/999')
      .send({ which: 'clockIn', punchedAt: '2026-04-20T09:00:00.000Z', editNote: 'test' });

    expect(res.status).toBe(404);
  });
});
