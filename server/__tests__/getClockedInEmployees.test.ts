/**
 * Tests for getClockedInEmployees() in dashboard.service.ts
 *
 * Fixed reference date: Wednesday 2026-04-22 12:00:00 UTC
 * timezone = 'UTC'
 *
 * Key invariants under test:
 *  1. Employees clocked in via the legacy timekeeping.punches path appear in results.
 *  2. Employees clocked in via an open punch_ledger session appear in results.
 *  3. The deduplication guard prevents an employee from appearing twice when they
 *     exist in both the legacy punches and the punch_ledger.
 *  4. Query-count assertion: the function issues a fixed, small number of DB queries
 *     regardless of employee count (N+1 regression guard).
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
  // getEmployeePunchStatus is NOT called by getClockedInEmployees — the function
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
import { getClockedInEmployees } from '../src/services/timekeeping/dashboard.service';

// --------------------------------------------------------------------------
// Shared fixtures
// --------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-04-22T12:00:00Z');

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
 * getClockedInEmployees:
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
 * Wire up db mocks for a single getClockedInEmployees() call.
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

describe('getClockedInEmployees', () => {
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

    const result = await getClockedInEmployees();

    expect(result).toEqual([]);
  });

  it('returns an empty array when employees exist but none are clocked in', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punchOut = makePunch({ id: 2, employeeId: 5, type: 'clock_out', punchedAt: '2026-04-22T09:00:00Z' });
    const latestRow = makeLatestPunchRow({ id: 2, employee_id: 5, type: 'clock_out', punched_at: '2026-04-22T09:00:00Z' });

    setupMocks({
      latestPunchRows: [latestRow],
      todayPunches: [punchOut],
    });

    const result = await getClockedInEmployees();

    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Legacy punch path
  // -------------------------------------------------------------------------

  it('includes an employee clocked in via the legacy punch path (clock_in)', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punch = makePunch({ id: 1, employeeId: 5, type: 'clock_in', punchedAt: '2026-04-22T08:00:00Z' });
    const latestRow = makeLatestPunchRow({ id: 1, employee_id: 5, type: 'clock_in', punched_at: '2026-04-22T08:00:00Z' });

    setupMocks({ latestPunchRows: [latestRow], todayPunches: [punch] });

    const result = await getClockedInEmployees();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('clocked_in');
    expect(result[0].clockedInAt).toBeDefined();
  });

  it('includes an employee on break via the legacy punch path (break_start)', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punchIn    = makePunch({ id: 1, employeeId: 5, type: 'clock_in',    punchedAt: '2026-04-22T08:00:00Z' });
    const punchBreak = makePunch({ id: 2, employeeId: 5, type: 'break_start', punchedAt: '2026-04-22T10:00:00Z' });
    const latestRow  = makeLatestPunchRow({ id: 2, employee_id: 5, type: 'break_start', punched_at: '2026-04-22T10:00:00Z' });

    setupMocks({
      latestPunchRows: [latestRow],
      todayPunches: [punchBreak, punchIn],
    });

    const result = await getClockedInEmployees();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('on_break');
  });

  it('detects a still-open shift from a legacy punch older than the 2-day look-back (DISTINCT ON guard)', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const OLD_DATE = '2026-03-31T08:00:00Z';
    const latestRow = makeLatestPunchRow({ id: 1, employee_id: 5, type: 'clock_in', punched_at: OLD_DATE });

    setupMocks({ latestPunchRows: [latestRow], todayPunches: [] });

    const result = await getClockedInEmployees();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('clocked_in');
  });

  it('excludes an employee whose most recent legacy punch is clock_out', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punchIn  = makePunch({ id: 1, employeeId: 5, type: 'clock_in',  punchedAt: '2026-04-22T08:00:00Z' });
    const punchOut = makePunch({ id: 2, employeeId: 5, type: 'clock_out', punchedAt: '2026-04-22T16:00:00Z' });
    const latestRow = makeLatestPunchRow({ id: 2, employee_id: 5, type: 'clock_out', punched_at: '2026-04-22T16:00:00Z' });

    setupMocks({
      latestPunchRows: [latestRow],
      todayPunches: [punchOut, punchIn],
    });

    const result = await getClockedInEmployees();

    expect(result).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Punch-ledger path
  // -------------------------------------------------------------------------

  it('includes an employee with an open REGULAR ledger session', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const session = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: null,
      laborClass: 'REGULAR',
    });

    setupMocks({
      hasLegacyEmployees: false,
      openSessions: [session],
      todayLedger: [session],
    });

    const result = await getClockedInEmployees();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('clocked_in');
    expect(result[0].clockedInAt).toBe(new Date('2026-04-22T08:00:00Z').toISOString());
  });

  it('includes an employee with an open BREAK ledger session with status on_break', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const session = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T10:00:00Z',
      clockOut: null,
      laborClass: 'BREAK',
    });

    setupMocks({
      hasLegacyEmployees: false,
      openSessions: [session],
      todayLedger: [session],
    });

    const result = await getClockedInEmployees();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('on_break');
  });

  it('computes hoursToday from closed ledger sessions earlier in the day', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const closedSession = makeLedgerSession({
      id: 1, employeeId: 20,
      clockIn: '2026-04-22T06:00:00Z', clockOut: '2026-04-22T10:00:00Z',
      laborClass: 'REGULAR',
    });
    const openSession = makeLedgerSession({
      id: 2, employeeId: 20,
      clockIn: '2026-04-22T10:30:00Z', clockOut: null,
      laborClass: 'REGULAR',
    });

    setupMocks({
      hasLegacyEmployees: false,
      openSessions: [openSession],
      todayLedger: [closedSession, openSession],
    });

    const result = await getClockedInEmployees();

    expect(result).toHaveLength(1);
    // Closed session = 4 h; open session at 12:00 UTC = 1.5 h since 10:30 UTC
    expect(result[0].hoursToday).toBeGreaterThan(4);
  });

  it('excludes an employee with no open ledger session (closed session only)', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const closedSession = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: '2026-04-22T16:00:00Z',
      laborClass: 'REGULAR',
    });

    setupMocks({
      hasLegacyEmployees: false,
      openSessions: [],
      todayLedger: [closedSession],
    });

    const result = await getClockedInEmployees();

    expect(result).toHaveLength(0);
  });

  it('excludes inactive employees with open ledger sessions', async () => {
    const inactive = makeEmployee({ timekeepingId: null, epochEmployeeId: 20, isActive: false });
    vi.mocked(listResolvedEmployees).mockResolvedValue([inactive]);

    const session = makeLedgerSession({ employeeId: 20, clockIn: '2026-04-22T08:00:00Z', clockOut: null });

    setupMocks({ hasLegacyEmployees: false, openSessions: [session], todayLedger: [session] });

    const result = await getClockedInEmployees();

    expect(result).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Deduplication guard
  // -------------------------------------------------------------------------

  it('does not include a duplicate entry when an employee appears in both legacy and ledger paths', async () => {
    // Employee has both a timekeepingId (legacy) and an epochEmployeeId (ledger)
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Legacy path: clocked in
    const punch    = makePunch({ id: 1, employeeId: 5, type: 'clock_in', punchedAt: '2026-04-22T08:00:00Z' });
    const latestRow = makeLatestPunchRow({ id: 1, employee_id: 5, type: 'clock_in', punched_at: '2026-04-22T08:00:00Z' });

    // Punch_ledger: same employee (epochEmployeeId=20) also has an open REGULAR session
    const ledgerSession = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T08:05:00Z',
      clockOut: null,
      laborClass: 'REGULAR',
    });

    setupMocks({
      latestPunchRows: [latestRow],
      todayPunches: [punch],
      openSessions: [ledgerSession],
      todayLedger: [ledgerSession],
    });

    const result = await getClockedInEmployees();

    // Employee should appear exactly once despite being present in both paths
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('clocked_in');
  });

  it('legacy path status takes precedence over ledger path for the same employee', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Legacy: clocked in (not on break)
    const punch    = makePunch({ id: 1, employeeId: 5, type: 'clock_in', punchedAt: '2026-04-22T08:00:00Z' });
    const latestRow = makeLatestPunchRow({ id: 1, employee_id: 5, type: 'clock_in', punched_at: '2026-04-22T08:00:00Z' });

    // Punch_ledger: same employee has an open BREAK session (conflicting status)
    const breakSession = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T10:00:00Z',
      clockOut: null,
      laborClass: 'BREAK',
    });

    setupMocks({
      latestPunchRows: [latestRow],
      todayPunches: [punch],
      openSessions: [breakSession],
      todayLedger: [breakSession],
    });

    const result = await getClockedInEmployees();

    expect(result).toHaveLength(1);
    // Legacy path ran first and added the employee as clocked_in;
    // the ledger path must not override it.
    expect(result[0].status).toBe('clocked_in');
  });

  // -------------------------------------------------------------------------
  // Query-count guard — O(1) queries regardless of employee count
  // -------------------------------------------------------------------------

  it('issues exactly 3 db.select calls and 1 db.execute call for N legacy employees', async () => {
    const employees = Array.from({ length: 5 }, (_, i) =>
      makeEmployee({ id: i + 1, timekeepingId: i + 10, epochEmployeeId: i + 100 }),
    );
    vi.mocked(listResolvedEmployees).mockResolvedValue(employees);

    const latestPunchRows = employees.map((emp, i) =>
      makeLatestPunchRow({ id: i + 1, employee_id: emp.timekeepingId as number, type: 'clock_in', punched_at: '2026-04-22T08:00:00Z' }),
    );
    const todayPunches = employees.map((emp, i) =>
      makePunch({ id: i + 1, employeeId: emp.timekeepingId as number, type: 'clock_in', punchedAt: '2026-04-22T08:00:00Z' }),
    );

    setupMocks({ latestPunchRows, todayPunches });

    await getClockedInEmployees();

    // Must issue exactly 1 batch execute (DISTINCT ON) + 3 batch selects:
    //   select 1 → today's punches (Query B)
    //   select 2 → open ledger sessions
    //   select 3 → today's ledger sessions
    // A naive N+1 implementation would issue N+1 calls per employee.
    expect(vi.mocked(db.execute)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(3);
  });

  it('issues exactly 2 db.select calls and 0 db.execute calls for N ledger-only employees', async () => {
    const employees = Array.from({ length: 4 }, (_, i) =>
      makeEmployee({ id: i + 1, timekeepingId: null, epochEmployeeId: i + 100 }),
    );
    vi.mocked(listResolvedEmployees).mockResolvedValue(employees);

    setupMocks({ hasLegacyEmployees: false });

    await getClockedInEmployees();

    // No legacy employees → execute skipped entirely; only 2 selects needed:
    //   select 1 → open ledger sessions
    //   select 2 → today's ledger sessions
    expect(vi.mocked(db.execute)).not.toHaveBeenCalled();
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(2);
  });
});
