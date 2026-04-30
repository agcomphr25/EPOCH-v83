import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  lt: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock('../schema', () => ({
  employees: {},
  chargeCodes: {},
  punchLedger: {},
}));

vi.mock('../src/services/notificationManager', () => ({
  notificationManager: {
    broadcast: vi.fn(),
  },
}));

vi.mock('../src/services/timekeeping/employees.service', () => ({
  comparePinToHash: vi.fn(),
}));

vi.mock('../src/helpers/travelerBarcodeResolver', () => ({
  resolveTravelerBarcode: vi.fn(),
}));

vi.mock('../src/services/timekeeping/audit.service', () => ({
  actorFromUser: vi.fn(() => ({ id: null, name: 'unknown' })),
}));

vi.mock('../storage', () => ({
  storage: {
    getEmployee: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: 1,
      username: 'portal_user',
      role: 'EMPLOYEE',
      employeeId: 42,
      canOverridePrices: false,
      isActive: true,
    };
    next();
  }),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../src/lib/timekeeping-zod', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/lib/timekeeping-zod')>();
  return { ...mod };
});

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'orderBy', 'offset']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain['limit'] = vi.fn().mockResolvedValue(result);
  chain['then'] = (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  },
  pool: {},
}));

vi.mock('../src/lib/punchLedger', () => ({
  getOpenSession: vi.fn(),
  deriveStatus: vi.fn(),
  openSession: vi.fn(),
  closeSession: vi.fn(),
  computeHoursToday: vi.fn().mockResolvedValue(0),
}));

import { db as nativeDb } from '../db';
import * as ledger from '../src/lib/punchLedger';
import { notificationManager } from '../src/services/notificationManager';
import { comparePinToHash } from '../src/services/timekeeping/employees.service';
import timekeepingRouter from '../src/routes/timekeeping/punches';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/timekeeping', timekeepingRouter);
  return app;
}

const FAKE_ENTRY = {
  id: 1,
  employeeId: 42,
  clockIn: new Date('2026-04-24T08:00:00Z'),
  clockOut: null,
  source: 'KIOSK',
  laborClass: 'REGULAR',
};

describe('POST /api/timekeeping/kiosk/punch — broadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(nativeDb.select).mockReturnValue(
      makeSelectChain([{ id: 1, name: 'Alice Smith', isActive: true, timekeeperPin: '$2b$10$hashed' }]) as ReturnType<typeof nativeDb.select>,
    );

    vi.mocked(comparePinToHash).mockResolvedValue(true);
    vi.mocked(ledger.getOpenSession).mockResolvedValue(null);
    vi.mocked(ledger.deriveStatus).mockReturnValue('clocked_out');
    vi.mocked(ledger.openSession).mockResolvedValue(FAKE_ENTRY as Awaited<ReturnType<typeof ledger.openSession>>);
  });

  it('calls notificationManager.broadcast with type punch_recorded after a successful kiosk clock_in', async () => {
    const app = buildApp();

    await request(app)
      .post('/api/timekeeping/kiosk/punch')
      .send({ employeeId: 1, pin: '1234', requestedAction: 'clock_in' })
      .expect(201);

    expect(notificationManager.broadcast).toHaveBeenCalledOnce();
    expect(notificationManager.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'punch_recorded' }),
    );
  });

  it('includes the employeeId and action in the broadcast data payload', async () => {
    const app = buildApp();

    await request(app)
      .post('/api/timekeeping/kiosk/punch')
      .send({ employeeId: 1, pin: '1234', requestedAction: 'clock_in' })
      .expect(201);

    const broadcastArg = vi.mocked(notificationManager.broadcast).mock.calls[0][0];
    expect(broadcastArg.data).toEqual(
      expect.objectContaining({ employeeId: 1, action: 'clock_in' }),
    );
  });

  it('does NOT call broadcast when PIN verification fails', async () => {
    vi.mocked(comparePinToHash).mockResolvedValue(false);
    const app = buildApp();

    await request(app)
      .post('/api/timekeeping/kiosk/punch')
      .send({ employeeId: 1, pin: 'wrong', requestedAction: 'clock_in' })
      .expect(401);

    expect(notificationManager.broadcast).not.toHaveBeenCalled();
  });

  it('does NOT call broadcast when the employee is not found', async () => {
    vi.mocked(nativeDb.select).mockReturnValue(
      makeSelectChain([]) as ReturnType<typeof nativeDb.select>,
    );
    const app = buildApp();

    await request(app)
      .post('/api/timekeeping/kiosk/punch')
      .send({ employeeId: 999, pin: '1234', requestedAction: 'clock_in' })
      .expect(404);

    expect(notificationManager.broadcast).not.toHaveBeenCalled();
  });

  it('does NOT call broadcast when status conflicts (already clocked in)', async () => {
    vi.mocked(ledger.deriveStatus).mockReturnValue('clocked_in');
    const app = buildApp();

    await request(app)
      .post('/api/timekeeping/kiosk/punch')
      .send({ employeeId: 1, pin: '1234', requestedAction: 'clock_in' })
      .expect(409);

    expect(notificationManager.broadcast).not.toHaveBeenCalled();
  });
});

describe('POST /api/timekeeping/punches/my — broadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ledger.getOpenSession).mockResolvedValue(null);
    vi.mocked(ledger.deriveStatus).mockReturnValue('clocked_out');
    vi.mocked(ledger.openSession).mockResolvedValue(FAKE_ENTRY as Awaited<ReturnType<typeof ledger.openSession>>);
  });

  it('calls notificationManager.broadcast with type punch_recorded after a successful portal clock_in', async () => {
    const app = buildApp();

    await request(app)
      .post('/api/timekeeping/punches/my')
      .send({ type: 'clock_in' })
      .expect(201);

    expect(notificationManager.broadcast).toHaveBeenCalledOnce();
    expect(notificationManager.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'punch_recorded' }),
    );
  });

  it('includes the employeeId and action in the broadcast data payload for portal punches', async () => {
    const app = buildApp();

    await request(app)
      .post('/api/timekeeping/punches/my')
      .send({ type: 'clock_in' })
      .expect(201);

    const broadcastArg = vi.mocked(notificationManager.broadcast).mock.calls[0][0];
    expect(broadcastArg.data).toEqual(
      expect.objectContaining({ employeeId: 42, action: 'clock_in' }),
    );
  });

  it('does NOT call broadcast when the punch type is invalid', async () => {
    const app = buildApp();

    await request(app)
      .post('/api/timekeeping/punches/my')
      .send({ type: 'invalid_type' })
      .expect(400);

    expect(notificationManager.broadcast).not.toHaveBeenCalled();
  });

  it('does NOT call broadcast when employee is already clocked in and tries to clock_in again', async () => {
    vi.mocked(ledger.deriveStatus).mockReturnValue('clocked_in');
    const app = buildApp();

    await request(app)
      .post('/api/timekeeping/punches/my')
      .send({ type: 'clock_in' })
      .expect(409);

    expect(notificationManager.broadcast).not.toHaveBeenCalled();
  });

  it('calls broadcast for clock_out too', async () => {
    vi.mocked(ledger.deriveStatus).mockReturnValue('clocked_in');
    vi.mocked(ledger.closeSession).mockResolvedValue(FAKE_ENTRY as Awaited<ReturnType<typeof ledger.closeSession>>);
    const app = buildApp();

    await request(app)
      .post('/api/timekeeping/punches/my')
      .send({ type: 'clock_out' })
      .expect(201);

    expect(notificationManager.broadcast).toHaveBeenCalledOnce();
    expect(notificationManager.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'punch_recorded' }),
    );
  });
});
