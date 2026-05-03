import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
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
  users: {},
  auditEvents: {},
  punchLedger: {},
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock('../src/services/notificationManager', () => ({
  notificationManager: { broadcast: vi.fn() },
}));

vi.mock('../src/services/timekeeping/audit.service', () => ({
  actorFromUser: vi.fn(() => ({ id: null, name: 'unknown' })),
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/services/timekeeping/timeoff.service', () => ({
  checkActivePTOForEmployee: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/helpers/travelerBarcodeResolver', () => ({
  resolveTravelerBarcode: vi.fn(),
}));

vi.mock('../storage', () => ({
  storage: {},
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req, _res, next) => next()),
  requireRole: vi.fn(() => (_req, _res, next) => next()),
  optionalAuth: vi.fn((_req, _res, next) => next()),
}));

vi.mock('../src/lib/punchLedger', () => ({
  getOpenSession: vi.fn().mockResolvedValue(null),
  deriveStatus: vi.fn().mockReturnValue('clocked_out'),
  computeHoursToday: vi.fn().mockResolvedValue(0),
  openSession: vi.fn(),
  closeSession: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  },
  pool: {},
}));

import { db as nativeDb } from '../db';
import bcrypt from 'bcryptjs';
import * as ledger from '../src/lib/punchLedger';
import timekeepingRouter from '../src/routes/timekeeping/punches';

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'orderBy', 'offset', 'innerJoin']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain['limit'] = vi.fn().mockResolvedValue(result);
  chain['then'] = (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/timekeeping', timekeepingRouter);
  return app;
}

const ACTIVE_EMP_WITH_PIN = {
  id: 7,
  name: 'Jane Doe',
  jobTitle: 'Operator',
  isActive: true,
  timekeeperPin: '$2b$10$fakehashedpin',
};

describe('POST /api/timekeeping/kiosk/identify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ledger.getOpenSession).mockResolvedValue(null);
    vi.mocked(ledger.deriveStatus).mockReturnValue('clocked_out');
    vi.mocked(ledger.computeHoursToday).mockResolvedValue(0);
  });

  it('returns 400 when pin is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({})
      .expect(400);
    expect(res.body.error).toMatch(/4-digit PIN/i);
  });

  it('returns 400 when pin is fewer than 4 digits', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: '123' })
      .expect(400);
    expect(res.body.error).toMatch(/4-digit PIN/i);
  });

  it('returns 400 when pin is more than 4 digits', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: '12345' })
      .expect(400);
    expect(res.body.error).toMatch(/4-digit PIN/i);
  });

  it('returns 400 when pin contains non-digit characters', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: 'abcd' })
      .expect(400);
    expect(res.body.error).toMatch(/4-digit PIN/i);
  });

  it('returns 400 when pin is a number instead of a string', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: 1234 })
      .expect(400);
    expect(res.body.error).toMatch(/4-digit PIN/i);
  });

  it('returns 401 when no active employees have a timekeeperPin set', async () => {
    vi.mocked(nativeDb.select).mockReturnValue(
      makeSelectChain([
        { id: 1, name: 'Bob Smith', jobTitle: null, isActive: true, timekeeperPin: null },
      ]) as ReturnType<typeof nativeDb.select>,
    );
    const app = buildApp();
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: '1234' })
      .expect(401);
    expect(res.body.error).toMatch(/PIN not recognised/i);
    expect(vi.mocked(bcrypt.compare)).not.toHaveBeenCalled();
  });

  it('returns 401 when pin does not match any stored hash', async () => {
    vi.mocked(nativeDb.select).mockReturnValue(
      makeSelectChain([ACTIVE_EMP_WITH_PIN]) as ReturnType<typeof nativeDb.select>,
    );
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const app = buildApp();
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: '9999' })
      .expect(401);
    expect(res.body.error).toMatch(/PIN not recognised/i);
  });

  it('returns 401 when employee list is empty (no active employees at all)', async () => {
    vi.mocked(nativeDb.select).mockReturnValue(
      makeSelectChain([]) as ReturnType<typeof nativeDb.select>,
    );
    const app = buildApp();
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: '1234' })
      .expect(401);
    expect(res.body.error).toMatch(/PIN not recognised/i);
  });

  it('returns 200 with employee id, firstName, lastName on a correct PIN match', async () => {
    vi.mocked(nativeDb.select).mockReturnValue(
      makeSelectChain([ACTIVE_EMP_WITH_PIN]) as ReturnType<typeof nativeDb.select>,
    );
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const app = buildApp();
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: '1234' })
      .expect(200);

    expect(res.body.id).toBe(7);
    expect(res.body.firstName).toBe('Jane');
    expect(res.body.lastName).toBe('Doe');
    expect(res.body.jobTitle).toBe('Operator');
  });

  it('includes punchStatus in the response on a correct PIN match', async () => {
    vi.mocked(nativeDb.select).mockReturnValue(
      makeSelectChain([ACTIVE_EMP_WITH_PIN]) as ReturnType<typeof nativeDb.select>,
    );
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const app = buildApp();
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: '1234' })
      .expect(200);

    expect(res.body.punchStatus).toBeDefined();
    expect(res.body.punchStatus.employeeId).toBe(7);
    expect(res.body.punchStatus.status).toBe('clocked_out');
  });

  it('includes punchStatus.hoursToday in the response', async () => {
    vi.mocked(nativeDb.select).mockReturnValue(
      makeSelectChain([ACTIVE_EMP_WITH_PIN]) as ReturnType<typeof nativeDb.select>,
    );
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(ledger.computeHoursToday).mockResolvedValue(3.5);

    const app = buildApp();
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: '1234' })
      .expect(200);

    expect(res.body.punchStatus.hoursToday).toBe(3.5);
  });

  it('short-circuits on the first matching employee and does not compare remaining hashes', async () => {
    const emp1 = { ...ACTIVE_EMP_WITH_PIN, id: 1, timekeeperPin: '$2b$10$hash1' };
    const emp2 = { ...ACTIVE_EMP_WITH_PIN, id: 2, timekeeperPin: '$2b$10$hash2' };
    vi.mocked(nativeDb.select).mockReturnValue(
      makeSelectChain([emp1, emp2]) as ReturnType<typeof nativeDb.select>,
    );
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);

    const app = buildApp();
    await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: '1234' })
      .expect(200);

    expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledTimes(1);
  });

  it('does not expose the stored timekeeperPin hash in the response', async () => {
    vi.mocked(nativeDb.select).mockReturnValue(
      makeSelectChain([ACTIVE_EMP_WITH_PIN]) as ReturnType<typeof nativeDb.select>,
    );
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const app = buildApp();
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: '1234' })
      .expect(200);

    expect(res.body.timekeeperPin).toBeUndefined();
  });
});
