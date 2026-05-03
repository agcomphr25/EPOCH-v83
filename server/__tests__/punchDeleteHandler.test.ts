/**
 * Tests for DELETE /api/timekeeping/punches/:id
 *
 * DCAA TK-004 requires an editNote whenever a punch record is deleted so that
 * every removal is traceable in the audit log.  A missing or blank editNote
 * must be rejected with HTTP 400 — never silently swallowed.
 *
 * These tests lock in:
 *   - 400 when editNote is absent (undefined body field)
 *   - 400 when editNote is an empty/whitespace-only string
 *   - 404 when the targeted punch_ledger row does not exist
 *   - 204 (no body) on a successful deletion
 *   - storage.deletePunchLedgerEntry is called with the correct id on success
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mocks — declared before any import that pulls in the module graph
// ---------------------------------------------------------------------------

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

const mockGetPunchLedgerEntryById = vi.fn();
const mockDeletePunchLedgerEntry = vi.fn();
const mockUpdatePunchLedgerEntry = vi.fn();

vi.mock('../storage', () => ({
  storage: {
    getPunchLedgerEntryById: (...args: unknown[]) => mockGetPunchLedgerEntryById(...args),
    deletePunchLedgerEntry: (...args: unknown[]) => mockDeletePunchLedgerEntry(...args),
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

function makeLedgerEntry(overrides = {}) {
  return {
    id: 42,
    employeeId: 10,
    clockIn: new Date('2026-04-20T08:00:00.000Z'),
    clockOut: new Date('2026-04-20T17:00:00.000Z'),
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

describe('DELETE /api/timekeeping/punches/:id — editNote requirement (DCAA TK-004)', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockGetPunchLedgerEntryById.mockResolvedValue(makeLedgerEntry());
    mockDeletePunchLedgerEntry.mockResolvedValue(undefined);

    app = express();
    app.use(express.json());
    const router = (await import('../src/routes/timekeeping/punches')).default;
    app.use('/api/timekeeping', router);
  });

  it('returns 400 when editNote is absent from the request body', async () => {
    const res = await request(app)
      .delete('/api/timekeeping/punches/42')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/editNote/i);
  });

  it('returns 400 when editNote is an empty string', async () => {
    const res = await request(app)
      .delete('/api/timekeeping/punches/42')
      .send({ editNote: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/editNote/i);
  });

  it('returns 400 when editNote is a whitespace-only string', async () => {
    const res = await request(app)
      .delete('/api/timekeeping/punches/42')
      .send({ editNote: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/editNote/i);
  });

  it('includes the DCAA rule reference in the 400 error message', async () => {
    const res = await request(app)
      .delete('/api/timekeeping/punches/42')
      .send({});

    expect(res.body.error).toMatch(/DCAA/i);
  });

  it('proceeds past the editNote guard when a non-empty reason is supplied', async () => {
    const res = await request(app)
      .delete('/api/timekeeping/punches/42')
      .send({ editNote: 'Duplicate entry — removing the extra record' });

    expect(res.status).not.toBe(400);
  });
});

describe('DELETE /api/timekeeping/punches/:id — resource existence', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockDeletePunchLedgerEntry.mockResolvedValue(undefined);

    app = express();
    app.use(express.json());
    const router = (await import('../src/routes/timekeeping/punches')).default;
    app.use('/api/timekeeping', router);
  });

  it('returns 404 when the punch_ledger row does not exist', async () => {
    mockGetPunchLedgerEntryById.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/timekeeping/punches/999')
      .send({ editNote: 'Removing phantom punch' });

    expect(res.status).toBe(404);
  });

  it('does not call deletePunchLedgerEntry when the entry is not found', async () => {
    mockGetPunchLedgerEntryById.mockResolvedValue(null);

    await request(app)
      .delete('/api/timekeeping/punches/999')
      .send({ editNote: 'Removing phantom punch' });

    expect(mockDeletePunchLedgerEntry).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/timekeeping/punches/:id — successful deletion', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockGetPunchLedgerEntryById.mockResolvedValue(makeLedgerEntry());
    mockDeletePunchLedgerEntry.mockResolvedValue(undefined);

    app = express();
    app.use(express.json());
    const router = (await import('../src/routes/timekeeping/punches')).default;
    app.use('/api/timekeeping', router);
  });

  it('returns 204 on a successful deletion', async () => {
    const res = await request(app)
      .delete('/api/timekeeping/punches/42')
      .send({ editNote: 'Duplicate entry — operator clocked in twice' });

    expect(res.status).toBe(204);
  });

  it('calls deletePunchLedgerEntry with the correct id', async () => {
    await request(app)
      .delete('/api/timekeeping/punches/42')
      .send({ editNote: 'Correcting a data entry error' });

    expect(mockDeletePunchLedgerEntry).toHaveBeenCalledOnce();
    const [calledId] = mockDeletePunchLedgerEntry.mock.calls[0];
    expect(calledId).toBe(42);
  });

  it('returns no body on a successful deletion (204 No Content)', async () => {
    const res = await request(app)
      .delete('/api/timekeeping/punches/42')
      .send({ editNote: 'Correcting a data entry error' });

    expect(res.text).toBe('');
  });
});

describe('DELETE /api/timekeeping/punches/:id — id validation', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockGetPunchLedgerEntryById.mockResolvedValue(makeLedgerEntry());
    mockDeletePunchLedgerEntry.mockResolvedValue(undefined);

    app = express();
    app.use(express.json());
    const router = (await import('../src/routes/timekeeping/punches')).default;
    app.use('/api/timekeeping', router);
  });

  it('returns 400 when the id param is not a positive integer', async () => {
    const res = await request(app)
      .delete('/api/timekeeping/punches/not-a-number')
      .send({ editNote: 'test' });

    expect(res.status).toBe(400);
  });
});
