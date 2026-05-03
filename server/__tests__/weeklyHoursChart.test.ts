/**
 * Tests for getWeeklyHours in dashboard.service.ts
 *
 * Fixed reference date: Wednesday 2026-04-22 12:00:00 UTC
 * workweekStartDay = 1 (Monday), timezone = 'UTC'
 *   weekStart = 2026-04-20T00:00:00Z
 *   weekEnd   = 2026-04-27T00:00:00Z
 * Day keys: 2026-04-20 … 2026-04-26
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --------------------------------------------------------------------------
// Mocks must be declared before any imports that trigger the module graph
// --------------------------------------------------------------------------

vi.mock('../db', () => ({
  db: { select: vi.fn() },
  pool: {},
}));

vi.mock('../src/services/timekeeping/settings.service', () => ({
  getOrCreateSettings: vi.fn(),
}));

vi.mock('../src/lib/timekeepingEmployeeResolver', () => ({
  listResolvedEmployees: vi.fn(),
}));

vi.mock('../src/services/timekeeping/employees.service', () => ({
  toApiEmployee: vi.fn((e: unknown) => e),
}));

vi.mock('../src/services/timekeeping/punches.service', () => ({
  getEmployeePunchStatus: vi.fn(),
}));

vi.mock('../src/lib/punchLedger', () => ({
  getOpenLedgerSession: vi.fn(),
  closeLedgerSession: vi.fn(),
}));

vi.mock('../src/schema/timekeeping', () => ({
  punchesTable: {
    employeeId: { name: 'employee_id' },
    punchedAt: { name: 'punched_at' },
  },
  timesheetsTable: {},
  certificationsTable: {},
  settingsTable: {},
  employeesTable: {},
  leaveEntriesTable: {},
}));

vi.mock('../schema', () => ({
  punchLedger: {
    clockIn: { name: 'clock_in' },
    clockOut: { name: 'clock_out' },
    employeeId: { name: 'employee_id' },
    laborClass: { name: 'labor_class' },
    id: { name: 'id' },
  },
  employees: {},
  productionWorkOrders: {},
  apiIntegrationKeys: {},
  epochExternalEvents: {},
  epochLaborFacts: {},
  travelers: {},
  chargeCodes: {},
  laborApprovals: {},
  laborBudgetOverrides: {},
  projects: {},
}));

// --------------------------------------------------------------------------
// Imports (after mocks are hoisted)
// --------------------------------------------------------------------------

import { db } from '../db';
import { getOrCreateSettings } from '../src/services/timekeeping/settings.service';
import { listResolvedEmployees } from '../src/lib/timekeepingEmployeeResolver';
import { getWeeklyHours } from '../src/services/timekeeping/dashboard.service';

// --------------------------------------------------------------------------
// Shared fixtures
// --------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-04-22T12:00:00Z');

const DEFAULT_SETTINGS = {
  id: 1,
  companyName: 'Test Co',
  timezone: 'UTC',
  workweekStartDay: 1, // Monday
  overtimeThresholdDaily: 8,
  overtimeThresholdWeekly: 40,
  roundingRuleMinutes: 0,
  breakDurationMinutes: 30,
  requireBreakAfterHours: 6,
  kioskRequirePin: false,
  kioskTimeoutSeconds: 60,
  standardWorkWeekHours: 40,
  kioskMessage: null,
  dcaaChargeCodeEnforcement: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function makePunch(overrides: {
  id?: number;
  employeeId?: number;
  type: string;
  punchedAt: string;
}) {
  return {
    id: overrides.id ?? 1,
    employeeId: overrides.employeeId ?? 5,
    type: overrides.type,
    punchedAt: new Date(overrides.punchedAt),
    timezone: 'UTC',
    note: null,
    source: 'web',
    isEdited: false,
    editNote: null,
    costCode: null,
    createdAt: new Date(overrides.punchedAt),
    updatedAt: new Date(overrides.punchedAt),
  };
}

function makeLedgerSession(overrides: {
  id?: number;
  employeeId?: number;
  clockIn: string;
  clockOut?: string | null;
  laborClass?: string;
}) {
  return {
    id: overrides.id ?? 10,
    employeeId: overrides.employeeId ?? 20,
    clockIn: new Date(overrides.clockIn),
    clockOut: overrides.clockOut != null ? new Date(overrides.clockOut) : null,
    source: 'KIOSK',
    travelerId: null,
    productionWorkOrderId: null,
    chargeCodeId: null,
    chargeCode: null,
    department: null,
    operation: null,
    laborClass: overrides.laborClass ?? 'REGULAR',
    projectId: null,
    travelerStepId: null,
    certificationStatus: null,
    isOverrun: false,
    overrunReason: null,
    overrideReason: null,
    approvalStatus: 'AUTO',
    laborApprovalId: null,
    laborBudgetOverrideId: null,
    createdBy: null,
    createdByDisplayName: null,
    updatedBy: null,
    updatedByDisplayName: null,
    isEdited: false,
    editNote: null,
    createdAt: new Date(overrides.clockIn),
    updatedAt: new Date(overrides.clockIn),
  };
}

/**
 * Builds a mock db.select() chain returning the given result.
 * The where() call is a no-op that resolves to the provided rows,
 * allowing client-side logic in getWeeklyHours to be exercised.
 */
function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

/**
 * Builds a select chain where the where() spy is exposed for assertion.
 * Use when you need to inspect the predicate passed to the DB query.
 */
function makeSelectChainWithSpy(rows: unknown[]) {
  const whereSpy = vi.fn().mockResolvedValue(rows);
  const chain = {
    from: vi.fn().mockReturnValue({ where: whereSpy }),
  };
  return { chain, whereSpy };
}

/**
 * Safely serialize a drizzle SQL AST for predicate assertions.
 * Drizzle's internal SQL objects carry chunks/values that can be inspected
 * via JSON.stringify, which walks all enumerable properties.
 */
function serializeWhereArg(arg: unknown): string {
  return JSON.stringify(arg, (_, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Date) return v.toISOString();
    return v;
  }) ?? '';
}

/** Shared resolved-employee fixture used across filter tests. */
const ALICE: ReturnType<typeof listResolvedEmployees> extends Promise<infer T> ? T[number] : never = {
  id: 5,
  timekeepingId: 5,
  epochEmployeeId: 20,
  name: 'Alice Smith',
  firstName: 'Alice',
  lastName: 'Smith',
  email: null,
  employeeCode: 'A001',
  isActive: true,
  timekeeperPin: null,
  timezone: 'UTC',
  hourlyRate: null,
  salary: null,
  payType: null,
  department: null,
  jobTitle: null,
  phone: null,
  hireDate: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

// --------------------------------------------------------------------------
// Test suites
// --------------------------------------------------------------------------

describe('getWeeklyHours', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    vi.mocked(getOrCreateSettings).mockResolvedValue(
      DEFAULT_SETTINGS as ReturnType<typeof getOrCreateSettings> extends Promise<infer T> ? T : never
    );
    vi.mocked(listResolvedEmployees).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // Baseline
  // -------------------------------------------------------------------------

  it('returns 7 days keyed by local date string when no data exists', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

    const result = await getWeeklyHours();

    expect(result).toHaveLength(7);
    const dates = result.map((d) => d.date).sort();
    expect(dates).toEqual([
      '2026-04-20',
      '2026-04-21',
      '2026-04-22',
      '2026-04-23',
      '2026-04-24',
      '2026-04-25',
      '2026-04-26',
    ]);
    for (const day of result) {
      expect(day.hours).toBe(0);
      expect(day.regularHours).toBe(0);
      expect(day.overtimeHours).toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // Legacy punches (timekeeping.punches)
  // -------------------------------------------------------------------------

  it('employees with only legacy punches show correct per-day totals', async () => {
    const punches = [
      makePunch({ type: 'clock_in',  punchedAt: '2026-04-21T08:00:00Z' }),
      makePunch({ type: 'clock_out', punchedAt: '2026-04-21T16:00:00Z' }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(punches) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

    const result = await getWeeklyHours();

    const tuesday = result.find((d) => d.date === '2026-04-21');
    expect(tuesday).toBeDefined();
    expect(tuesday!.hours).toBe(8);
    expect(tuesday!.regularHours).toBe(8);
    expect(tuesday!.overtimeHours).toBe(0);

    for (const day of result.filter((d) => d.date !== '2026-04-21')) {
      expect(day.hours).toBe(0);
    }
  });

  it('a punch whose punchedAt is before weekStart is not counted in any day', async () => {
    // This punch is on Sunday (2026-04-19) — one day before the week starts.
    // The service buckets punches by TZ date string; '2026-04-19' is not in dayMap
    // so this punch must be silently dropped without inflating any day's total.
    const preWeekPunches = [
      makePunch({ type: 'clock_in',  punchedAt: '2026-04-19T08:00:00Z' }),
      makePunch({ type: 'clock_out', punchedAt: '2026-04-19T16:00:00Z' }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(preWeekPunches) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

    const result = await getWeeklyHours();

    for (const day of result) {
      expect(day.hours).toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // Punch ledger (punch_ledger)
  // -------------------------------------------------------------------------

  it('employees with only punch_ledger sessions show correct per-day totals', async () => {
    const sessions = [
      makeLedgerSession({
        clockIn:  '2026-04-22T09:00:00Z',
        clockOut: '2026-04-22T13:00:00Z',
      }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

    const result = await getWeeklyHours();

    const wednesday = result.find((d) => d.date === '2026-04-22');
    expect(wednesday).toBeDefined();
    expect(wednesday!.hours).toBeCloseTo(4, 5);
    expect(wednesday!.regularHours).toBeCloseTo(4, 5);
    expect(wednesday!.overtimeHours).toBe(0);

    for (const day of result.filter((d) => d.date !== '2026-04-22')) {
      expect(day.hours).toBe(0);
    }
  });

  it('a ledger session entirely before weekStart contributes 0 hours', async () => {
    // clockOut is Sunday Apr-19, entirely before weekStart Apr-20.
    // After clipping sessionStart=max(Apr-18,weekStart)=Apr-20 and
    // sessionEnd=min(Apr-19,weekEnd)=Apr-19, sessionEnd<=sessionStart → skipped.
    const preWeekSession = [
      makeLedgerSession({
        clockIn:  '2026-04-18T08:00:00Z',
        clockOut: '2026-04-19T08:00:00Z',
      }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(preWeekSession) as ReturnType<typeof db.select>);

    const result = await getWeeklyHours();

    for (const day of result) {
      expect(day.hours).toBe(0);
    }
  });

  it('a ledger session starting before weekStart is clipped to only the in-week portion', async () => {
    // Session: Sun 2026-04-19 22:00 → Mon 2026-04-20 06:00 (8 hours total).
    // Only the 6 hours after weekStart (Mon 00:00) should be counted.
    const crossBoundarySession = [
      makeLedgerSession({
        clockIn:  '2026-04-19T22:00:00Z',
        clockOut: '2026-04-20T06:00:00Z',
      }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(crossBoundarySession) as ReturnType<typeof db.select>);

    const result = await getWeeklyHours();

    const monday = result.find((d) => d.date === '2026-04-20');
    expect(monday).toBeDefined();
    // Only the 2026-04-20 00:00–06:00 portion (6 hours) falls within the week
    expect(monday!.hours).toBeCloseTo(6, 5);

    // The pre-week portion (22:00–00:00) must NOT appear on any day
    for (const day of result.filter((d) => d.date !== '2026-04-20')) {
      expect(day.hours).toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // Combined / merge
  // -------------------------------------------------------------------------

  it('employees with sessions in both tables accumulate hours without double-counting', async () => {
    const punches = [
      makePunch({ type: 'clock_in',  punchedAt: '2026-04-20T06:00:00Z' }),
      makePunch({ type: 'clock_out', punchedAt: '2026-04-20T08:00:00Z' }), // 2 h
    ];
    const sessions = [
      makeLedgerSession({
        clockIn:  '2026-04-20T10:00:00Z',
        clockOut: '2026-04-20T13:00:00Z', // 3 h
      }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(punches) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

    const result = await getWeeklyHours();

    const monday = result.find((d) => d.date === '2026-04-20');
    expect(monday).toBeDefined();
    expect(monday!.hours).toBeCloseTo(5, 5); // 2 legacy + 3 ledger
    expect(monday!.regularHours).toBeCloseTo(5, 5);
    expect(monday!.overtimeHours).toBe(0);

    for (const day of result.filter((d) => d.date !== '2026-04-20')) {
      expect(day.hours).toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // BREAK exclusion
  // -------------------------------------------------------------------------

  it('BREAK sessions are excluded from productive hours', async () => {
    const sessions = [
      makeLedgerSession({
        clockIn:  '2026-04-22T09:00:00Z',
        clockOut: '2026-04-22T09:30:00Z',
        laborClass: 'BREAK',
      }),
      makeLedgerSession({
        id: 11,
        clockIn:  '2026-04-22T10:00:00Z',
        clockOut: '2026-04-22T12:00:00Z',
        laborClass: 'REGULAR',
      }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

    const result = await getWeeklyHours();

    const wednesday = result.find((d) => d.date === '2026-04-22');
    expect(wednesday).toBeDefined();
    // Only the REGULAR session (2 hours); BREAK (0.5 h) is excluded
    expect(wednesday!.hours).toBeCloseTo(2, 5);
  });

  // -------------------------------------------------------------------------
  // Midnight spanning
  // -------------------------------------------------------------------------

  it('sessions spanning midnight are split correctly across two days', async () => {
    // Tue 2026-04-21 22:00 → Wed 2026-04-22 02:00 (4 hours total)
    const sessions = [
      makeLedgerSession({
        clockIn:  '2026-04-21T22:00:00Z',
        clockOut: '2026-04-22T02:00:00Z',
      }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

    const result = await getWeeklyHours();

    const tuesday   = result.find((d) => d.date === '2026-04-21');
    const wednesday = result.find((d) => d.date === '2026-04-22');

    expect(tuesday).toBeDefined();
    expect(wednesday).toBeDefined();
    expect(tuesday!.hours).toBeCloseTo(2, 5);   // 22:00–00:00
    expect(wednesday!.hours).toBeCloseTo(2, 5); // 00:00–02:00
    expect(tuesday!.hours + wednesday!.hours).toBeCloseTo(4, 5);
  });

  // -------------------------------------------------------------------------
  // Overtime
  // -------------------------------------------------------------------------

  it('overtime hours are calculated correctly when daily threshold is exceeded', async () => {
    const sessions = [
      makeLedgerSession({
        clockIn:  '2026-04-23T07:00:00Z',
        clockOut: '2026-04-23T17:00:00Z', // 10 hours
      }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

    const result = await getWeeklyHours();

    const thursday = result.find((d) => d.date === '2026-04-23');
    expect(thursday).toBeDefined();
    expect(thursday!.hours).toBeCloseTo(10, 5);
    expect(thursday!.regularHours).toBeCloseTo(8, 5);
    expect(thursday!.overtimeHours).toBeCloseTo(2, 5);
  });

  // -------------------------------------------------------------------------
  // Open sessions
  // -------------------------------------------------------------------------

  it('open ledger sessions (no clock-out) are attributed up to now', async () => {
    const oneHourAgo = new Date(FIXED_NOW.getTime() - 3_600_000).toISOString();
    const sessions = [
      makeLedgerSession({ clockIn: oneHourAgo, clockOut: null }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

    const result = await getWeeklyHours();

    const wednesday = result.find((d) => d.date === '2026-04-22');
    expect(wednesday).toBeDefined();
    expect(wednesday!.hours).toBeCloseTo(1, 1);
  });

  // -------------------------------------------------------------------------
  // employeeId filter resolution
  // -------------------------------------------------------------------------

  describe('employeeId filter resolution', () => {
    it('resolves timekeepingId to epochEmployeeId for the ledger query', async () => {
      vi.mocked(listResolvedEmployees).mockResolvedValue([ALICE]);

      const sessions = [
        makeLedgerSession({
          employeeId: 20, // ALICE.epochEmployeeId
          clockIn:  '2026-04-22T09:00:00Z',
          clockOut: '2026-04-22T11:00:00Z',
        }),
      ];

      vi.mocked(db.select)
        .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
        .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

      const result = await getWeeklyHours({ employeeId: 5 });

      const wednesday = result.find((d) => d.date === '2026-04-22');
      expect(wednesday).toBeDefined();
      expect(wednesday!.hours).toBeCloseTo(2, 5);
      expect(listResolvedEmployees).toHaveBeenCalled();
    });

    it('skips the ledger query entirely when timekeepingId has no matching epoch employee', async () => {
      // ALICE has timekeepingId=5; we filter by timekeepingId=99 — no match
      vi.mocked(listResolvedEmployees).mockResolvedValue([ALICE]);

      vi.mocked(db.select)
        .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);
      // Deliberately provide only ONE chain — a second db.select() call would
      // return undefined and cause the test to fail, proving the ledger is skipped.

      const result = await getWeeklyHours({ employeeId: 99 });

      expect(db.select).toHaveBeenCalledTimes(1);
      for (const day of result) {
        expect(day.hours).toBe(0);
      }
    });

    it('includes all employees in ledger when no employeeId filter is supplied', async () => {
      const sessions = [
        makeLedgerSession({ employeeId: 20, clockIn: '2026-04-20T09:00:00Z', clockOut: '2026-04-20T11:00:00Z' }),
        makeLedgerSession({ id: 11, employeeId: 30, clockIn: '2026-04-21T14:00:00Z', clockOut: '2026-04-21T15:00:00Z' }),
      ];

      vi.mocked(db.select)
        .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
        .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

      const result = await getWeeklyHours();

      expect(listResolvedEmployees).not.toHaveBeenCalled();

      const monday  = result.find((d) => d.date === '2026-04-20');
      const tuesday = result.find((d) => d.date === '2026-04-21');
      expect(monday!.hours).toBeCloseTo(2, 5);
      expect(tuesday!.hours).toBeCloseTo(1, 5);
    });

    // -----------------------------------------------------------------------
    // Predicate construction — assert the where() argument directly so that
    // removing or simplifying the predicates in getWeeklyHours causes failure.
    // -----------------------------------------------------------------------

    it('legacy punches query passes an employeeId constraint to where() when filtered', async () => {
      vi.mocked(listResolvedEmployees).mockResolvedValue([ALICE]);

      const { chain: punchesChain, whereSpy } = makeSelectChainWithSpy([]);
      vi.mocked(db.select)
        .mockReturnValueOnce(punchesChain as ReturnType<typeof db.select>)
        .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

      await getWeeklyHours({ employeeId: 5 });

      expect(whereSpy).toHaveBeenCalledTimes(1);
      const predicate = whereSpy.mock.calls[0][0];
      expect(predicate).not.toBeUndefined();

      // The predicate must reference the employee ID value (5).
      // Drizzle SQL ASTs store literal parameter values as bare numbers inside
      // the queryChunks array, so they appear as e.g. "},5," in the serialized form.
      const serialized = serializeWhereArg(predicate);
      expect(serialized).toContain(',5,');
    });

    it('legacy punches query predicate does NOT contain an employee ID when no filter is provided', async () => {
      const { chain: punchesChain, whereSpy } = makeSelectChainWithSpy([]);
      vi.mocked(db.select)
        .mockReturnValueOnce(punchesChain as ReturnType<typeof db.select>)
        .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

      await getWeeklyHours();

      expect(whereSpy).toHaveBeenCalledTimes(1);
      const predicate = whereSpy.mock.calls[0][0];
      const serialized = serializeWhereArg(predicate);
      // Without a filter the predicate is only the gte(punchedAt, weekStart)
      // condition — no numeric employee-ID literal should appear in it.
      expect(serialized).not.toMatch(/"value":\d+/);
    });

    it('ledger query passes the resolved epochEmployeeId to its where() predicate', async () => {
      vi.mocked(listResolvedEmployees).mockResolvedValue([ALICE]); // timekeepingId=5 → epochEmployeeId=20

      const { chain: ledgerChain, whereSpy } = makeSelectChainWithSpy([]);
      vi.mocked(db.select)
        .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>) // punches
        .mockReturnValueOnce(ledgerChain as ReturnType<typeof db.select>);         // ledger

      await getWeeklyHours({ employeeId: 5 });

      expect(whereSpy).toHaveBeenCalledTimes(1);
      const predicate = whereSpy.mock.calls[0][0];
      const serialized = serializeWhereArg(predicate);
      // Drizzle SQL ASTs store literal parameter values as bare numbers inside
      // queryChunks, serialized as e.g. "},20," — epochEmployeeId, not timekeepingId.
      expect(serialized).toContain(',20,');
      expect(serialized).not.toContain(',5,');
    });
  });

  // -------------------------------------------------------------------------
  // Punch-rounding rules
  // -------------------------------------------------------------------------

  describe('punch-rounding rules', () => {
    it('rounds legacy punch pairs UP to the nearest 15 minutes (7h53m → 8h)', async () => {
      // 7h53m = 473 min. Divided by 15 = 31.53 → rounds to 32 → 32*15 = 480 min = 8h exactly.
      const punches = [
        makePunch({ type: 'clock_in',  punchedAt: '2026-04-21T08:00:00Z' }),
        makePunch({ type: 'clock_out', punchedAt: '2026-04-21T15:53:00Z' }),
      ];

      vi.mocked(getOrCreateSettings).mockResolvedValue({
        ...DEFAULT_SETTINGS,
        roundingRuleMinutes: 15,
      } as ReturnType<typeof getOrCreateSettings> extends Promise<infer T> ? T : never);

      vi.mocked(db.select)
        .mockReturnValueOnce(makeSelectChain(punches) as ReturnType<typeof db.select>)
        .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

      const result = await getWeeklyHours();

      const tuesday = result.find((d) => d.date === '2026-04-21');
      expect(tuesday).toBeDefined();
      // 7h53m rounded to nearest 15 min = 8h
      expect(tuesday!.hours).toBeCloseTo(8, 5);
    });

    it('rounds legacy punch pairs DOWN to the nearest 15 minutes (7h7m → 7h)', async () => {
      // 7h7m = 427 min. Divided by 15 = 28.47 → rounds to 28 → 28*15 = 420 min = 7h exactly.
      const punches = [
        makePunch({ type: 'clock_in',  punchedAt: '2026-04-21T08:00:00Z' }),
        makePunch({ type: 'clock_out', punchedAt: '2026-04-21T15:07:00Z' }),
      ];

      vi.mocked(getOrCreateSettings).mockResolvedValue({
        ...DEFAULT_SETTINGS,
        roundingRuleMinutes: 15,
      } as ReturnType<typeof getOrCreateSettings> extends Promise<infer T> ? T : never);

      vi.mocked(db.select)
        .mockReturnValueOnce(makeSelectChain(punches) as ReturnType<typeof db.select>)
        .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

      const result = await getWeeklyHours();

      const tuesday = result.find((d) => d.date === '2026-04-21');
      expect(tuesday).toBeDefined();
      // 7h7m rounded to nearest 15 min = 7h
      expect(tuesday!.hours).toBeCloseTo(7, 5);
    });

    it('does NOT round punch_ledger hours — ledger durations are stored precisely', async () => {
      // Session lasts exactly 6h53m. With 15-min rounding that would be 7h, but rounding
      // must NOT be applied to ledger sessions — the raw exact duration must be kept.
      const sessions = [
        makeLedgerSession({
          clockIn:  '2026-04-22T09:00:00Z',
          clockOut: '2026-04-22T15:53:00Z', // 6h53m = 6.8833... hours
        }),
      ];

      vi.mocked(getOrCreateSettings).mockResolvedValue({
        ...DEFAULT_SETTINGS,
        roundingRuleMinutes: 15,
      } as ReturnType<typeof getOrCreateSettings> extends Promise<infer T> ? T : never);

      vi.mocked(db.select)
        .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
        .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

      const result = await getWeeklyHours();

      const wednesday = result.find((d) => d.date === '2026-04-22');
      expect(wednesday).toBeDefined();
      // Exact duration: 6h53m = 6 + 53/60 ≈ 6.8833 hours — NOT rounded to 7h
      expect(wednesday!.hours).toBeCloseTo(6 + 53 / 60, 4);
      expect(wednesday!.hours).not.toBeCloseTo(7, 1);
    });

    it('chart totals reflect rounded values across multiple days when roundingRuleMinutes > 0', async () => {
      // Monday: 7h53m punch pair → rounds to 8h
      // Tuesday: 7h7m punch pair → rounds to 7h
      // Combined chart must show rounded totals, not raw durations.
      const punches = [
        makePunch({ id: 1, type: 'clock_in',  punchedAt: '2026-04-20T08:00:00Z' }),
        makePunch({ id: 2, type: 'clock_out', punchedAt: '2026-04-20T15:53:00Z' }), // 7h53m
        makePunch({ id: 3, type: 'clock_in',  punchedAt: '2026-04-21T08:00:00Z' }),
        makePunch({ id: 4, type: 'clock_out', punchedAt: '2026-04-21T15:07:00Z' }), // 7h7m
      ];

      vi.mocked(getOrCreateSettings).mockResolvedValue({
        ...DEFAULT_SETTINGS,
        roundingRuleMinutes: 15,
      } as ReturnType<typeof getOrCreateSettings> extends Promise<infer T> ? T : never);

      vi.mocked(db.select)
        .mockReturnValueOnce(makeSelectChain(punches) as ReturnType<typeof db.select>)
        .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

      const result = await getWeeklyHours();

      const monday  = result.find((d) => d.date === '2026-04-20');
      const tuesday = result.find((d) => d.date === '2026-04-21');
      expect(monday).toBeDefined();
      expect(tuesday).toBeDefined();
      // Monday: 7h53m → 8h after rounding
      expect(monday!.hours).toBeCloseTo(8, 5);
      // Tuesday: 7h7m → 7h after rounding
      expect(tuesday!.hours).toBeCloseTo(7, 5);
    });
  });
});
