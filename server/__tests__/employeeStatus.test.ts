/**
 * Tests for getEmployeeStatus() in dashboard.service.ts
 *
 * Fixed reference date: Wednesday 2026-04-22 12:00:00 UTC
 * timezone = 'UTC'
 *
 * Key invariant under test: the function issues a fixed, small number of DB
 * queries regardless of employee count — the N+1 regression guard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --------------------------------------------------------------------------
// Mocks must be declared before any imports that trigger the module graph
// --------------------------------------------------------------------------

vi.mock('../db', () => ({
  db: { select: vi.fn(), execute: vi.fn() },
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
  // getEmployeePunchStatus is NOT called by getEmployeeStatus — the function
  // uses batched DISTINCT ON + date-bounded queries instead of per-employee calls.
  // Mock kept as empty module so any accidental import doesn't break the test file.
}));

vi.mock('../src/lib/punchLedger', () => ({
  getOpenLedgerSession: vi.fn(),
  closeLedgerSession: vi.fn(),
  computeHoursToday: vi.fn().mockResolvedValue(0),
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
  timeOffRequestsTable: {},
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

vi.mock('../src/services/payPeriod', () => ({
  getPayPeriodDates: vi.fn().mockReturnValue({
    start: new Date('2026-04-01T00:00:00Z'),
    end: new Date('2026-04-30T23:59:59Z'),
  }),
}));

// --------------------------------------------------------------------------
// Imports (after mocks are hoisted)
// --------------------------------------------------------------------------

import { db } from '../db';
import { listResolvedEmployees } from '../src/lib/timekeepingEmployeeResolver';
import { toApiEmployee } from '../src/services/timekeeping/employees.service';
import { getEmployeeStatus } from '../src/services/timekeeping/dashboard.service';

// --------------------------------------------------------------------------
// Shared fixtures
// --------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-04-22T12:00:00Z');

/**
 * A punch record in the camelCase ORM shape returned by db.select().from(punchesTable).
 */
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

/**
 * A punch row in the snake_case raw SQL shape returned by db.execute() (DISTINCT ON query).
 */
function makeLatestPunchRow(overrides: {
  id?: number;
  employee_id?: number;
  type: string;
  punched_at: string;
}) {
  return {
    id: overrides.id ?? 1,
    employee_id: overrides.employee_id ?? 5,
    type: overrides.type,
    punched_at: overrides.punched_at,
    timezone: 'UTC',
    source: null,
    cost_code: null,
    note: null,
    edit_note: null,
    is_edited: false,
    created_at: overrides.punched_at,
    updated_at: overrides.punched_at,
  };
}

/**
 * A punch_ledger session in the ORM shape returned by db.select().from(punchLedger).
 */
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
 * An employee in the resolved shape returned by listResolvedEmployees().
 */
function makeEmployee(overrides: {
  id?: number;
  timekeepingId?: number | null;
  epochEmployeeId?: number;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
}) {
  return {
    id: overrides.id ?? 1,
    timekeepingId: 'timekeepingId' in overrides ? overrides.timekeepingId : 5,
    epochEmployeeId: overrides.epochEmployeeId ?? 20,
    firstName: overrides.firstName ?? 'Test',
    lastName: overrides.lastName ?? 'Employee',
    email: null,
    employeeCode: 'T001',
    isActive: overrides.isActive ?? true,
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
}

/**
 * Builds a mock db.select() chain compatible with all query patterns used in
 * getEmployeeStatus:
 *   .from().where().orderBy()  → resolves with rows
 *   .from().where()            → thenable, resolves with rows
 */
function makeSelectChain(rows: unknown[]) {
  const orderByFn = vi.fn().mockResolvedValue(rows);

  const terminalNode = {
    orderBy: orderByFn,
    then: (
      onFulfilled: (v: unknown) => unknown,
      onRejected: (e: unknown) => unknown,
    ) => Promise.resolve(rows).then(onFulfilled, onRejected),
  };

  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminalNode),
      orderBy: orderByFn,
      then: (
        onFulfilled: (v: unknown) => unknown,
        onRejected: (e: unknown) => unknown,
      ) => Promise.resolve(rows).then(onFulfilled, onRejected),
    }),
  };
}

/**
 * Wire up db mocks for a single getEmployeeStatus() call.
 *
 * db.select() call order (determined by the function's execution path):
 *   1st → todayPunches  (Query B: punchesTable, date-bounded, only if hasLegacyEmployees)
 *   2nd → openSessions  (punchLedger WHERE clockOut IS NULL)
 *   3rd → todayLedger   (punchLedger WHERE employeeId IN (...) AND clockIn >= 2 days ago)
 *
 * db.execute() is called once (DISTINCT ON query) only when hasLegacyEmployees is true.
 */
function setupMocks(opts: {
  latestPunchRows?: unknown[];
  todayPunches?: unknown[];
  openSessions?: unknown[];
  todayLedger?: unknown[];
  hasLegacyEmployees?: boolean;
}) {
  const {
    latestPunchRows = [],
    todayPunches = [],
    openSessions = [],
    todayLedger = [],
    hasLegacyEmployees = true,
  } = opts;

  if (hasLegacyEmployees) {
    vi.mocked(db.execute).mockResolvedValueOnce(
      { rows: latestPunchRows } as ReturnType<typeof db.execute>,
    );
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(todayPunches) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(openSessions) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(todayLedger) as ReturnType<typeof db.select>);
  } else {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(openSessions) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(todayLedger) as ReturnType<typeof db.select>);
  }
}

// --------------------------------------------------------------------------
// Test suites
// --------------------------------------------------------------------------

describe('getEmployeeStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.resetAllMocks();
    vi.mocked(toApiEmployee).mockImplementation((e: unknown) => e as ReturnType<typeof toApiEmployee>);
    vi.mocked(listResolvedEmployees).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // Baseline
  // -------------------------------------------------------------------------

  it('returns an empty array when there are no employees', async () => {
    setupMocks({ hasLegacyEmployees: false });

    const result = await getEmployeeStatus();

    expect(result).toEqual([]);
  });

  it('returns all employees as clocked_out when there is no punch data', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    setupMocks({ hasLegacyEmployees: true, latestPunchRows: [], todayPunches: [] });

    const result = await getEmployeeStatus();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('clocked_out');
  });

  // -------------------------------------------------------------------------
  // Unanchored-employee inclusion guard (In/Out Board regression)
  // -------------------------------------------------------------------------

  it('includes all active employees in the board regardless of timekeepingId — employees without one appear as clocked_out', async () => {
    const anchored   = makeEmployee({ id: 1, timekeepingId: 5,   epochEmployeeId: 10, firstName: 'Anchored',   lastName: 'Emp' });
    const unanchored = makeEmployee({ id: 2, timekeepingId: null, epochEmployeeId: 20, firstName: 'Unanchored', lastName: 'Emp' });
    vi.mocked(listResolvedEmployees).mockResolvedValue([anchored, unanchored]);

    // anchored employee has timekeepingId → hasLegacyEmployees: true, but unanchored
    // must also appear in the result because statusMap is seeded from ALL active employees.
    setupMocks({ hasLegacyEmployees: true, latestPunchRows: [], todayPunches: [] });

    const result = await getEmployeeStatus();

    // Both employees must appear — the board count must match the active employee count.
    expect(result).toHaveLength(2);
    const byEpoch = new Map(result.map((r) => [(r.employee as ReturnType<typeof makeEmployee>).epochEmployeeId, r]));
    expect(byEpoch.get(10)?.status).toBe('clocked_out');
    expect(byEpoch.get(20)?.status).toBe('clocked_out');
  });

  it('employees without a timekeepingId appear in the board as clocked_in when they have an open ledger session', async () => {
    const unanchored = makeEmployee({ id: 1, timekeepingId: null, epochEmployeeId: 20, firstName: 'Portal', lastName: 'User' });
    vi.mocked(listResolvedEmployees).mockResolvedValue([unanchored]);

    const session = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: null,
      laborClass: 'REGULAR',
    });

    // No legacy path (no timekeepingId) — status comes entirely from punch_ledger
    setupMocks({ hasLegacyEmployees: false, openSessions: [session], todayLedger: [session] });

    const result = await getEmployeeStatus();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('clocked_in');
    expect(result[0].clockedInAt).toBe(new Date('2026-04-22T08:00:00Z').toISOString());
  });

  // -------------------------------------------------------------------------
  // Legacy punch path — status derivation
  // -------------------------------------------------------------------------

  it('sets status to clocked_in when the most recent legacy punch is clock_in', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punch = makePunch({ id: 1, employeeId: 5, type: 'clock_in', punchedAt: '2026-04-22T08:00:00Z' });
    const latestRow = makeLatestPunchRow({ id: 1, employee_id: 5, type: 'clock_in', punched_at: '2026-04-22T08:00:00Z' });

    setupMocks({
      latestPunchRows: [latestRow],
      todayPunches: [punch],
    });

    const result = await getEmployeeStatus();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('clocked_in');
    expect(result[0].clockedInAt).toBeDefined();
  });

  it('sets status to on_break when the most recent legacy punch is break_start', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punchIn    = makePunch({ id: 1, employeeId: 5, type: 'clock_in',    punchedAt: '2026-04-22T08:00:00Z' });
    const punchBreak = makePunch({ id: 2, employeeId: 5, type: 'break_start', punchedAt: '2026-04-22T10:00:00Z' });
    const latestRow  = makeLatestPunchRow({ id: 2, employee_id: 5, type: 'break_start', punched_at: '2026-04-22T10:00:00Z' });

    // db.select Query B returns today's punches descending (most recent first)
    setupMocks({
      latestPunchRows: [latestRow],
      todayPunches: [punchBreak, punchIn],
    });

    const result = await getEmployeeStatus();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('on_break');
  });

  it('sets status to clocked_in when the most recent legacy punch is break_end', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punchIn       = makePunch({ id: 1, employeeId: 5, type: 'clock_in',    punchedAt: '2026-04-22T08:00:00Z' });
    const punchBreak    = makePunch({ id: 2, employeeId: 5, type: 'break_start', punchedAt: '2026-04-22T10:00:00Z' });
    const punchBreakEnd = makePunch({ id: 3, employeeId: 5, type: 'break_end',   punchedAt: '2026-04-22T10:30:00Z' });
    const latestRow     = makeLatestPunchRow({ id: 3, employee_id: 5, type: 'break_end', punched_at: '2026-04-22T10:30:00Z' });

    setupMocks({
      latestPunchRows: [latestRow],
      todayPunches: [punchBreakEnd, punchBreak, punchIn],
    });

    const result = await getEmployeeStatus();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('clocked_in');
  });

  it('sets status to clocked_out when the most recent legacy punch is clock_out', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punchIn  = makePunch({ id: 1, employeeId: 5, type: 'clock_in',  punchedAt: '2026-04-22T08:00:00Z' });
    const punchOut = makePunch({ id: 2, employeeId: 5, type: 'clock_out', punchedAt: '2026-04-22T16:00:00Z' });
    const latestRow = makeLatestPunchRow({ id: 2, employee_id: 5, type: 'clock_out', punched_at: '2026-04-22T16:00:00Z' });

    setupMocks({
      latestPunchRows: [latestRow],
      todayPunches: [punchOut, punchIn],
    });

    const result = await getEmployeeStatus();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('clocked_out');
  });

  it('detects a still-open shift from a legacy punch older than the 2-day look-back window (DISTINCT ON guard)', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Punch is 22 days old — falls outside the 2-day Query B window
    const OLD_DATE = '2026-03-31T08:00:00Z';
    const latestRow = makeLatestPunchRow({ id: 1, employee_id: 5, type: 'clock_in', punched_at: OLD_DATE });

    // Query B (today's punches) returns nothing; DISTINCT ON row provides the latest punch
    setupMocks({
      latestPunchRows: [latestRow],
      todayPunches: [],
    });

    const result = await getEmployeeStatus();

    // Employee has an open clock_in from 3 weeks ago and was never clocked out
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('clocked_in');
  });

  // -------------------------------------------------------------------------
  // Punch-ledger path — status derivation
  // -------------------------------------------------------------------------

  it('sets status to clocked_in for an employee with an open REGULAR ledger session', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const session = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: null,
      laborClass: 'REGULAR',
    });

    setupMocks({
      hasLegacyEmployees: true,
      latestPunchRows: [],
      todayPunches: [],
      openSessions: [session],
      todayLedger: [session],
    });

    const result = await getEmployeeStatus();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('clocked_in');
    expect(result[0].clockedInAt).toBe(new Date('2026-04-22T08:00:00Z').toISOString());
  });

  it('sets status to on_break for an employee with an open BREAK ledger session', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const session = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T10:00:00Z',
      clockOut: null,
      laborClass: 'BREAK',
    });

    setupMocks({
      hasLegacyEmployees: true,
      latestPunchRows: [],
      todayPunches: [],
      openSessions: [session],
      todayLedger: [session],
    });

    const result = await getEmployeeStatus();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('on_break');
  });

  it('uses the most recent open session when an employee has multiple open ledger sessions', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // DB returns sessions desc by clockIn — BREAK is more recent
    const breakSession   = makeLedgerSession({ id: 2, employeeId: 20, clockIn: '2026-04-22T10:00:00Z', clockOut: null, laborClass: 'BREAK' });
    const regularSession = makeLedgerSession({ id: 1, employeeId: 20, clockIn: '2026-04-22T08:00:00Z', clockOut: null, laborClass: 'REGULAR' });

    setupMocks({
      hasLegacyEmployees: true,
      latestPunchRows: [],
      todayPunches: [],
      openSessions: [breakSession, regularSession],
      todayLedger: [breakSession, regularSession],
    });

    const result = await getEmployeeStatus();

    expect(result[0].status).toBe('on_break');
  });

  it('computes hoursToday from closed ledger sessions earlier in the day', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // 4-hour closed session this morning; employee is currently on a break
    const closedSession = makeLedgerSession({
      id: 1, employeeId: 20,
      clockIn: '2026-04-22T06:00:00Z', clockOut: '2026-04-22T10:00:00Z',
      laborClass: 'REGULAR',
    });
    const breakSession = makeLedgerSession({
      id: 2, employeeId: 20,
      clockIn: '2026-04-22T10:00:00Z', clockOut: null,
      laborClass: 'BREAK',
    });

    setupMocks({
      hasLegacyEmployees: true,
      latestPunchRows: [],
      todayPunches: [],
      openSessions: [breakSession],
      todayLedger: [closedSession, breakSession],
    });

    const result = await getEmployeeStatus();

    expect(result[0].status).toBe('on_break');
    // Closed REGULAR session contributes 4 h; BREAK session is excluded
    expect(result[0].hoursToday).toBeCloseTo(4, 1);
  });

  it('does not count inactive employees from open ledger sessions', async () => {
    const inactive = makeEmployee({ timekeepingId: null, epochEmployeeId: 20, isActive: false });
    vi.mocked(listResolvedEmployees).mockResolvedValue([inactive]);

    const session = makeLedgerSession({ employeeId: 20, clockIn: '2026-04-22T08:00:00Z', clockOut: null });

    setupMocks({ hasLegacyEmployees: false, openSessions: [session] });

    const result = await getEmployeeStatus();

    // Inactive employee is not included in results at all
    expect(result).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Legacy takes priority over punch_ledger
  // -------------------------------------------------------------------------

  it('does not override a legacy clocked_in status with a ledger open session for the same employee', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Legacy: clocked in
    const punch    = makePunch({ id: 1, employeeId: 5, type: 'clock_in', punchedAt: '2026-04-22T08:00:00Z' });
    const latestRow = makeLatestPunchRow({ id: 1, employee_id: 5, type: 'clock_in', punched_at: '2026-04-22T08:00:00Z' });

    // Punch_ledger: same employee (epochEmployeeId=20) has an open BREAK session
    const breakSession = makeLedgerSession({ employeeId: 20, clockIn: '2026-04-22T10:00:00Z', clockOut: null, laborClass: 'BREAK' });

    setupMocks({
      latestPunchRows: [latestRow],
      todayPunches: [punch],
      openSessions: [breakSession],
    });

    const result = await getEmployeeStatus();

    expect(result).toHaveLength(1);
    // Legacy path set clocked_in; ledger path must not override it
    expect(result[0].status).toBe('clocked_in');
  });

  // -------------------------------------------------------------------------
  // Multi-employee scenarios
  // -------------------------------------------------------------------------

  it('handles clocked_in, on_break, and clocked_out employees simultaneously', async () => {
    const alice = makeEmployee({ id: 1, timekeepingId: 1, epochEmployeeId: 10, firstName: 'Alice', lastName: 'A' });
    const bob   = makeEmployee({ id: 2, timekeepingId: 2, epochEmployeeId: 20, firstName: 'Bob',   lastName: 'B' });
    const carol = makeEmployee({ id: 3, timekeepingId: 3, epochEmployeeId: 30, firstName: 'Carol', lastName: 'C' });
    vi.mocked(listResolvedEmployees).mockResolvedValue([alice, bob, carol]);

    const aliceSession = makeLedgerSession({ id: 1, employeeId: 10, clockIn: '2026-04-22T08:00:00Z', clockOut: null,                laborClass: 'REGULAR' });
    const bobSession   = makeLedgerSession({ id: 2, employeeId: 20, clockIn: '2026-04-22T10:00:00Z', clockOut: null,                laborClass: 'BREAK'   });
    // Carol has no open session → remains clocked_out

    setupMocks({
      hasLegacyEmployees: true,
      latestPunchRows: [],
      todayPunches: [],
      openSessions: [bobSession, aliceSession],
      todayLedger: [aliceSession, bobSession],
    });

    const result = await getEmployeeStatus();

    expect(result).toHaveLength(3);

    const byId = new Map(result.map((r) => [(r.employee as ReturnType<typeof makeEmployee>).epochEmployeeId, r]));
    expect(byId.get(10)?.status).toBe('clocked_in');
    expect(byId.get(20)?.status).toBe('on_break');
    expect(byId.get(30)?.status).toBe('clocked_out');
  });

  it('sorts results: clocked_in first, on_break second, clocked_out last; alphabetically within each group', async () => {
    const alice = makeEmployee({ id: 1, timekeepingId: 1, epochEmployeeId: 10, firstName: 'Alice', lastName: 'Z' });
    const bob   = makeEmployee({ id: 2, timekeepingId: 2, epochEmployeeId: 20, firstName: 'Bob',   lastName: 'A' });
    const carol = makeEmployee({ id: 3, timekeepingId: 3, epochEmployeeId: 30, firstName: 'Carol', lastName: 'M' });
    vi.mocked(listResolvedEmployees).mockResolvedValue([alice, bob, carol]);

    // Alice → clocked_out (no open session), Bob → clocked_in, Carol → on_break
    const bobSession   = makeLedgerSession({ id: 1, employeeId: 20, clockIn: '2026-04-22T08:00:00Z', clockOut: null, laborClass: 'REGULAR' });
    const carolSession = makeLedgerSession({ id: 2, employeeId: 30, clockIn: '2026-04-22T09:00:00Z', clockOut: null, laborClass: 'BREAK'   });

    setupMocks({
      hasLegacyEmployees: true,
      latestPunchRows: [],
      todayPunches: [],
      openSessions: [carolSession, bobSession],
      todayLedger: [bobSession, carolSession],
    });

    const result = await getEmployeeStatus();

    expect(result[0].status).toBe('clocked_in');   // Bob
    expect(result[1].status).toBe('on_break');      // Carol
    expect(result[2].status).toBe('clocked_out');   // Alice
  });

  // -------------------------------------------------------------------------
  // Query-count guard — O(1) queries regardless of employee count
  // -------------------------------------------------------------------------

  it('issues exactly 3 db.select calls and 1 db.execute call regardless of employee count', async () => {
    // N=5 employees all using the legacy punch path (all have timekeepingId)
    const employees = Array.from({ length: 5 }, (_, i) =>
      makeEmployee({ id: i + 1, timekeepingId: i + 10, epochEmployeeId: i + 100 }),
    );
    vi.mocked(listResolvedEmployees).mockResolvedValue(employees);

    // Each employee has a clock_in punch so they all appear as clocked_in
    const latestPunchRows = employees.map((emp, i) =>
      makeLatestPunchRow({ id: i + 1, employee_id: emp.timekeepingId as number, type: 'clock_in', punched_at: '2026-04-22T08:00:00Z' }),
    );
    const todayPunches = employees.map((emp, i) =>
      makePunch({ id: i + 1, employeeId: emp.timekeepingId as number, type: 'clock_in', punchedAt: '2026-04-22T08:00:00Z' }),
    );

    setupMocks({ latestPunchRows, todayPunches });

    await getEmployeeStatus();

    // The function must issue exactly 1 batch execute (DISTINCT ON) + 3 batch selects:
    //   select 1 → today's punches (Query B)
    //   select 2 → open ledger sessions
    //   select 3 → today's ledger sessions
    // A naive N+1 implementation would issue N+1 calls for N employees.
    expect(vi.mocked(db.execute)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(3);
  });

  it('issues exactly 2 db.select calls and 0 db.execute calls when all employees are unanchored (timekeepingId=null)', async () => {
    // N=4 employees all without a timekeepingId — no legacy query runs, but both the
    // open-sessions select and the todayLedger select still execute because activeEpochIds
    // is non-empty (all 4 employees are active).
    const employees = Array.from({ length: 4 }, (_, i) =>
      makeEmployee({ id: i + 1, timekeepingId: null, epochEmployeeId: i + 100 }),
    );
    vi.mocked(listResolvedEmployees).mockResolvedValue(employees);

    setupMocks({ hasLegacyEmployees: false });

    await getEmployeeStatus();

    // All employees are unanchored → execute skipped; 2 selects: open sessions + todayLedger.
    expect(vi.mocked(db.execute)).not.toHaveBeenCalled();
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(2);
  });
});
