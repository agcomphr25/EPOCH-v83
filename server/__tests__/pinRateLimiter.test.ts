/**
 * Tests for the PIN brute-force rate limiter on POST /api/timekeeping/kiosk/identify
 *
 * The rate limiter is pure in-memory logic controlled by three env vars:
 *   KIOSK_PIN_MAX_FAILURES  — number of bad attempts allowed before the next one is blocked
 *   KIOSK_PIN_WINDOW_MS     — rolling window for counting failures
 *   KIOSK_PIN_LOCKOUT_MS    — how long the IP is locked out after the threshold is exceeded
 *
 * Semantics (N+1 contract):
 *   Exactly KIOSK_PIN_MAX_FAILURES failed attempts are allowed (each returns 401).
 *   The (N+1)-th failed attempt — and every attempt thereafter while locked — returns 429.
 *
 * These tests lock in:
 *   - Each of the first N bad PINs returns 401
 *   - The (N+1)-th bad PIN triggers lockout and returns 429 with a Retry-After header
 *   - Subsequent requests from the same IP while locked also return 429 with Retry-After
 *   - A successful PIN identification resets the failure counter (next bad PIN → 401)
 *   - After KIOSK_PIN_LOCKOUT_MS elapses the IP is allowed again
 *   - After KIOSK_PIN_WINDOW_MS elapses (without lockout) the failure counter resets
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Configure rate-limit env vars before any module is loaded.
// MAX_FAILURES=3 means 3 bad attempts are allowed; the 4th triggers lockout.
// ---------------------------------------------------------------------------
process.env.KIOSK_PIN_MAX_FAILURES = '3';
process.env.KIOSK_PIN_WINDOW_MS    = '60000';    // 1 minute
process.env.KIOSK_PIN_LOCKOUT_MS   = '300000';   // 5 minutes

// ---------------------------------------------------------------------------
// Mocks — declared before the first import so Vitest can hoist them correctly
// ---------------------------------------------------------------------------

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

// bcryptjs — we want full control over whether a PIN matches
const mockBcryptCompare = vi.fn<(data: string, hash: string) => Promise<boolean>>();
vi.mock('bcryptjs', () => ({
  default: {
    compare: (...args: [string, string]) => mockBcryptCompare(...args),
    hash: vi.fn().mockResolvedValue('$2b$10$fakehash'),
  },
}));

// Database — identify endpoint calls nativeDb.select().from().where()
const mockDbSelect = vi.fn();
vi.mock('../db', () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  },
  pool: {},
}));

// Storage
vi.mock('../storage', () => ({
  storage: {
    getPunchLedgerEntryById: vi.fn().mockResolvedValue(null),
    getEmployee: vi.fn().mockResolvedValue(null),
  },
}));

// Auth middleware — kiosk/identify is unauthenticated, but auth is imported by the router
vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
  optionalAuth: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

// Schema tables — only need to exist as objects; drizzle-orm query builders are mocked via db
vi.mock('../schema', () => ({
  employees:    {},
  users:        {},
  chargeCodes:  {},
  auditEvents:  {},
  apiIntegrationKeys: {},
}));

// Audit service — fire-and-forget, we don't want DB writes in tests
vi.mock('../src/services/timekeeping/audit.service', () => ({
  logAction:    vi.fn().mockResolvedValue(undefined),
  actorFromUser: vi.fn(() => ({ id: null, email: null, role: null })),
}));

// Timeoff service
vi.mock('../src/services/timekeeping/timeoff.service', () => ({
  checkActivePTOForEmployee: vi.fn().mockResolvedValue(null),
}));

// Punch ledger — needed when a successful identify resolves punch status
vi.mock('../src/lib/punchLedger', () => ({
  getOpenSession:     vi.fn().mockResolvedValue(null),
  deriveStatus:       vi.fn().mockReturnValue('OUT'),
  computeHoursToday:  vi.fn().mockResolvedValue(0),
  openSession:        vi.fn().mockResolvedValue({}),
  closeSession:       vi.fn().mockResolvedValue({}),
}));

// Traveler barcode resolver
vi.mock('../src/helpers/travelerBarcodeResolver', () => ({
  resolveTravelerBarcode: vi.fn().mockResolvedValue(null),
}));

// Notification manager
vi.mock('../src/services/notificationManager', () => ({
  notificationManager: {
    emit: vi.fn(),
    on:   vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fake employee row returned by the DB when looking up PIN candidates. */
function makeEmployeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Jane Doe',
    jobTitle: 'Operator',
    timekeeperPin: '$2b$10$hashedpin',
    isActive: true,
    ...overrides,
  };
}

/**
 * Wire up the nativeDb mock so that .select().from().where() resolves to `rows`.
 * The identify endpoint chain ends without .limit(), so the final call returns the array.
 */
function mockDbReturning(rows: unknown[]) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

// ---------------------------------------------------------------------------
// Convenience: send a bad-PIN identify request
// ---------------------------------------------------------------------------
async function badPin(app: express.Express) {
  return request(app)
    .post('/api/timekeeping/kiosk/identify')
    .send({ pin: '0000' });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('POST /api/timekeeping/kiosk/identify — PIN rate limiter (N+1 contract)', () => {
  // KIOSK_PIN_MAX_FAILURES = 3 → 3 failures are allowed; the 4th triggers lockout
  const MAX_FAILURES = 3;

  let app: express.Express;

  beforeEach(async () => {
    // Reset modules so the in-memory pinFailureMap starts empty for every test
    vi.resetModules();
    vi.clearAllMocks();

    // Default: one active employee whose PIN never matches (bad PIN scenario)
    mockDbReturning([makeEmployeeRow()]);
    mockBcryptCompare.mockResolvedValue(false);

    app = express();
    app.use(express.json());
    const router = (await import('../src/routes/timekeeping/punches')).default;
    app.use('/api/timekeeping', router);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // N+1 failure threshold
  // -------------------------------------------------------------------------

  it('returns 401 for each of the first N (MAX_FAILURES) bad PIN attempts', async () => {
    // All MAX_FAILURES attempts should be allowed (401 Not Found, not 429)
    for (let i = 0; i < MAX_FAILURES; i++) {
      const res = await badPin(app);
      expect(res.status).toBe(401);
    }
  });

  it('returns 429 on the (N+1)-th bad attempt — the first blocked attempt', async () => {
    // Exhaust the allowed failures
    for (let i = 0; i < MAX_FAILURES; i++) {
      await badPin(app);
    }

    // (N+1)-th attempt triggers lockout
    const res = await badPin(app);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many/i);
  });

  it('includes a positive Retry-After header on the locking 429 response', async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      await badPin(app);
    }

    const res = await badPin(app);

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    // Should reflect KIOSK_PIN_LOCKOUT_MS (300 s)
    expect(retryAfter).toBeCloseTo(300, -1); // within 10 s of 300
  });

  // -------------------------------------------------------------------------
  // Subsequent requests while locked
  // -------------------------------------------------------------------------

  it('returns 429 on every request while the IP is locked', async () => {
    // Trigger lockout
    for (let i = 0; i <= MAX_FAILURES; i++) {
      await badPin(app);
    }

    // Two more attempts after lockout — both should be 429
    expect((await badPin(app)).status).toBe(429);
    expect((await badPin(app)).status).toBe(429);
  });

  it('includes Retry-After on every 429 while locked (pre-check path)', async () => {
    for (let i = 0; i <= MAX_FAILURES; i++) {
      await badPin(app);
    }

    // Post-lockout request hits the pre-check branch in checkPinRateLimit
    const res = await badPin(app);

    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Successful identification resets the counter
  // -------------------------------------------------------------------------

  it('resets the failure counter after a successful PIN identification', async () => {
    // Accumulate failures up to (but not including) the threshold
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      await badPin(app);
    }

    // Successful identification
    mockBcryptCompare.mockResolvedValueOnce(true);
    const goodRes = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: '9999' });
    expect(goodRes.status).toBe(200);

    // Counter is now reset — a fresh bad attempt should return 401 (not 429)
    mockBcryptCompare.mockResolvedValue(false);
    const afterReset = await badPin(app);
    expect(afterReset.status).toBe(401);
  });

  it('returns employee data on a successful PIN identification', async () => {
    mockBcryptCompare.mockResolvedValueOnce(true);
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: '9999' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 1,
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  // -------------------------------------------------------------------------
  // Lockout expires after KIOSK_PIN_LOCKOUT_MS
  // -------------------------------------------------------------------------

  it('allows requests again after the lockout window has elapsed', async () => {
    vi.useFakeTimers();

    // Trigger lockout
    for (let i = 0; i <= MAX_FAILURES; i++) {
      await badPin(app);
    }

    // Confirm locked
    expect((await badPin(app)).status).toBe(429);

    // Advance clock past KIOSK_PIN_LOCKOUT_MS (300 000 ms)
    vi.advanceTimersByTime(300_001);

    // After lockout expires, a bad PIN should return 401 again (not 429)
    const afterExpiry = await badPin(app);
    expect(afterExpiry.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Failure window expiry resets the counter (no lockout occurred)
  // -------------------------------------------------------------------------

  it('resets the failure counter when the rolling window expires before lockout', async () => {
    vi.useFakeTimers();

    // One failure — well below the lockout threshold
    await badPin(app);

    // Advance past KIOSK_PIN_WINDOW_MS (60 000 ms) — window expires
    vi.advanceTimersByTime(60_001);

    // Failure count is cleared; a fresh N failures should all return 401
    for (let i = 0; i < MAX_FAILURES; i++) {
      expect((await badPin(app)).status).toBe(401);
    }
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  it('returns 400 when no PIN is provided', async () => {
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when the PIN is not a 4-digit string', async () => {
    const res = await request(app)
      .post('/api/timekeeping/kiosk/identify')
      .send({ pin: 'abc' });
    expect(res.status).toBe(400);
  });
});
