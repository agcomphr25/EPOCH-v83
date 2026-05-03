/**
 * Tests for getDashboardSummary in dashboard.service.ts
 *
 * Fixed reference date: Wednesday 2026-04-22 12:00:00 UTC
 * workweekStartDay = 1 (Monday), timezone = 'UTC'
 *   weekStart = 2026-04-20T00:00:00Z
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
  timeOffRequestsTable: { status: { name: 'status' } },
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
import { getDashboardSummary } from '../src/services/timekeeping/dashboard.service';

// --------------------------------------------------------------------------
// Shared fixtures
// --------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-04-22T12:00:00Z');

const DEFAULT_SETTINGS = {
  id: 1,
  companyName: 'Test Co',
  timezone: 'UTC',
  workweekStartDay: 1,
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

function makeEmployee(overrides: {
  id?: number;
  timekeepingId?: number | null;
  epochEmployeeId?: number;
  name?: string;
  isActive?: boolean;
}) {
  return {
    id: overrides.id ?? 1,
    timekeepingId: 'timekeepingId' in overrides ? overrides.timekeepingId : 5,
    epochEmployeeId: overrides.epochEmployeeId ?? 20,
    name: overrides.name ?? 'Test Employee',
    firstName: 'Test',
    lastName: 'Employee',
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
 * Builds a mock db.select() chain that handles all call patterns used in
 * getDashboardSummary:
 *   .from().orderBy()           → resolves (allPunches)
 *   .from()                     → thenable (allTimesheets, allCerts)
 *   .from().where().orderBy()   → resolves (openLedgerSessions)
 *   .from().where()             → thenable (weekLedgerSessions)
 */
function makeDashboardChain(rows: unknown[]) {
  const orderByFn = vi.fn().mockResolvedValue(rows);

  const terminalWithOrderBy = {
    orderBy: orderByFn,
    then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  };

  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminalWithOrderBy),
      orderBy: orderByFn,
      then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(onFulfilled, onRejected),
    }),
  };
}

/**
 * Set up db.select mock for a full getDashboardSummary call.
 * The six queries in Promise.all order:
 *   1. allPunches           (.from().orderBy())
 *   2. allTimesheets        (.from() → thenable)
 *   3. allCerts             (.from() → thenable)
 *   4. openLedger           (.from().where().orderBy())
 *   5. weekLedger           (.from().where() → thenable)
 *   6. pendingTimeOffRows   (.from().where() → thenable)
 */
function setupDashboardMocks(opts: {
  punches?: unknown[];
  timesheets?: unknown[];
  certs?: unknown[];
  openLedger?: unknown[];
  weekLedger?: unknown[];
  pendingTimeOff?: unknown[];
}) {
  const {
    punches = [],
    timesheets = [],
    certs = [],
    openLedger = [],
    weekLedger = [],
    pendingTimeOff = [],
  } = opts;

  vi.mocked(db.select)
    .mockReturnValueOnce(makeDashboardChain(punches) as ReturnType<typeof db.select>)
    .mockReturnValueOnce(makeDashboardChain(timesheets) as ReturnType<typeof db.select>)
    .mockReturnValueOnce(makeDashboardChain(certs) as ReturnType<typeof db.select>)
    .mockReturnValueOnce(makeDashboardChain(openLedger) as ReturnType<typeof db.select>)
    .mockReturnValueOnce(makeDashboardChain(weekLedger) as ReturnType<typeof db.select>)
    .mockReturnValueOnce(makeDashboardChain(pendingTimeOff) as ReturnType<typeof db.select>);
}

// --------------------------------------------------------------------------
// Test suites
// --------------------------------------------------------------------------

describe('getDashboardSummary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    vi.mocked(getOrCreateSettings).mockResolvedValue(
      DEFAULT_SETTINGS as ReturnType<typeof getOrCreateSettings> extends Promise<infer T> ? T : never,
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

  it('returns zero counts when there are no employees or sessions', async () => {
    setupDashboardMocks({});

    const result = await getDashboardSummary();

    expect(result.totalEmployees).toBe(0);
    expect(result.activeEmployees).toBe(0);
    expect(result.clockedInNow).toBe(0);
    expect(result.onBreakNow).toBe(0);
    expect(result.hoursThisWeek).toBe(0);
    expect(result.overtimeHoursThisWeek).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Clocked-in count — punch_ledger path
  // -------------------------------------------------------------------------

  it('counts an employee with an open REGULAR ledger session as clocked in', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const openSession = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: null,
      laborClass: 'REGULAR',
    });

    setupDashboardMocks({ openLedger: [openSession] });

    const result = await getDashboardSummary();

    expect(result.clockedInNow).toBe(1);
    expect(result.onBreakNow).toBe(0);
  });

  it('counts an employee with an open BREAK ledger session as on break', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const openBreakSession = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T10:00:00Z',
      clockOut: null,
      laborClass: 'BREAK',
    });

    setupDashboardMocks({ openLedger: [openBreakSession] });

    const result = await getDashboardSummary();

    // on-break employees are still included in clockedInNow total
    expect(result.onBreakNow).toBe(1);
    expect(result.clockedInNow).toBe(1);
  });

  it('uses the most recent open session per employee to determine break vs clocked-in status', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Employee started work (REGULAR), then started a break — most recent is BREAK
    // DB returns sessions desc by clockIn, so BREAK session comes first
    const breakSession = makeLedgerSession({
      id: 11,
      employeeId: 20,
      clockIn: '2026-04-22T12:00:00Z',
      clockOut: null,
      laborClass: 'BREAK',
    });
    const regularSession = makeLedgerSession({
      id: 10,
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: null,
      laborClass: 'REGULAR',
    });

    setupDashboardMocks({ openLedger: [breakSession, regularSession] });

    const result = await getDashboardSummary();

    expect(result.onBreakNow).toBe(1);
    expect(result.clockedInNow).toBe(1);
  });

  it('does not count inactive employees from open ledger sessions', async () => {
    const inactiveEmp = makeEmployee({
      timekeepingId: null,
      epochEmployeeId: 20,
      isActive: false,
    });
    vi.mocked(listResolvedEmployees).mockResolvedValue([inactiveEmp]);

    const openSession = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: null,
    });

    setupDashboardMocks({ openLedger: [openSession] });

    const result = await getDashboardSummary();

    expect(result.clockedInNow).toBe(0);
    expect(result.onBreakNow).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Clocked-in count — legacy punch path
  // -------------------------------------------------------------------------

  it('counts an employee whose latest legacy punch is clock_in as clocked in', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punches = [
      makePunch({ id: 2, employeeId: 5, type: 'clock_in', punchedAt: '2026-04-22T08:00:00Z' }),
    ];

    setupDashboardMocks({ punches });

    const result = await getDashboardSummary();

    expect(result.clockedInNow).toBe(1);
    expect(result.onBreakNow).toBe(0);
  });

  it('counts an employee whose latest legacy punch is break_start as on break', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Desc order: break_start is the most recent
    const punches = [
      makePunch({ id: 2, employeeId: 5, type: 'break_start', punchedAt: '2026-04-22T10:00:00Z' }),
      makePunch({ id: 1, employeeId: 5, type: 'clock_in',    punchedAt: '2026-04-22T08:00:00Z' }),
    ];

    setupDashboardMocks({ punches });

    const result = await getDashboardSummary();

    expect(result.onBreakNow).toBe(1);
  });

  it('counts an employee whose latest legacy punch is break_end as clocked in', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punches = [
      makePunch({ id: 3, employeeId: 5, type: 'break_end',   punchedAt: '2026-04-22T11:00:00Z' }),
      makePunch({ id: 2, employeeId: 5, type: 'break_start', punchedAt: '2026-04-22T10:00:00Z' }),
      makePunch({ id: 1, employeeId: 5, type: 'clock_in',    punchedAt: '2026-04-22T08:00:00Z' }),
    ];

    setupDashboardMocks({ punches });

    const result = await getDashboardSummary();

    expect(result.clockedInNow).toBe(1);
    expect(result.onBreakNow).toBe(0);
  });

  it('does not count an employee whose latest legacy punch is clock_out', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punches = [
      makePunch({ id: 2, employeeId: 5, type: 'clock_out', punchedAt: '2026-04-22T17:00:00Z' }),
      makePunch({ id: 1, employeeId: 5, type: 'clock_in',  punchedAt: '2026-04-22T08:00:00Z' }),
    ];

    setupDashboardMocks({ punches });

    const result = await getDashboardSummary();

    expect(result.clockedInNow).toBe(0);
    expect(result.onBreakNow).toBe(0);
  });

  // -------------------------------------------------------------------------
  // No double-counting: legacy + punch_ledger
  // -------------------------------------------------------------------------

  it('does not double-count an employee already counted via legacy punches when they also have an open ledger session', async () => {
    // Employee has timekeepingId=5 (maps to epochEmployeeId=20)
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Legacy: most recent punch is clock_in → counted
    const punches = [
      makePunch({ employeeId: 5, type: 'clock_in', punchedAt: '2026-04-22T08:00:00Z' }),
    ];

    // Punch_ledger: same employee has an open REGULAR session
    const openSession = makeLedgerSession({
      employeeId: 20, // epochEmployeeId
      clockIn: '2026-04-22T09:00:00Z',
      clockOut: null,
      laborClass: 'REGULAR',
    });

    setupDashboardMocks({ punches, openLedger: [openSession] });

    const result = await getDashboardSummary();

    // Should count exactly 1, not 2
    expect(result.clockedInNow).toBe(1);
    expect(result.onBreakNow).toBe(0);
  });

  it('adds ledger-only employees (no timekeepingId) to the clocked-in count without affecting legacy-counted employees', async () => {
    // Alice: has a timekeepingId (legacy punch path)
    const alice = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20, name: 'Alice' });
    // Bob: no timekeepingId (ledger-only path)
    const bob = makeEmployee({ id: 2, timekeepingId: null, epochEmployeeId: 30, name: 'Bob' });
    vi.mocked(listResolvedEmployees).mockResolvedValue([alice, bob]);

    const punches = [
      makePunch({ employeeId: 5, type: 'clock_in', punchedAt: '2026-04-22T08:00:00Z' }),
    ];

    const openSessionBob = makeLedgerSession({
      id: 11,
      employeeId: 30, // Bob's epochEmployeeId
      clockIn: '2026-04-22T09:00:00Z',
      clockOut: null,
      laborClass: 'REGULAR',
    });

    setupDashboardMocks({ punches, openLedger: [openSessionBob] });

    const result = await getDashboardSummary();

    expect(result.clockedInNow).toBe(2);
    expect(result.onBreakNow).toBe(0);
  });

  // -------------------------------------------------------------------------
  // hoursThisWeek — punch_ledger path
  // -------------------------------------------------------------------------

  it('accumulates hours from closed ledger sessions within the week', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // 4-hour session on Wednesday
    const weekSession = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: '2026-04-22T12:00:00Z',
      laborClass: 'REGULAR',
    });

    setupDashboardMocks({ weekLedger: [weekSession] });

    const result = await getDashboardSummary();

    expect(result.hoursThisWeek).toBeCloseTo(4, 2);
  });

  it('excludes BREAK sessions from hoursThisWeek', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const breakSession = makeLedgerSession({
      id: 10,
      employeeId: 20,
      clockIn: '2026-04-22T09:00:00Z',
      clockOut: '2026-04-22T09:30:00Z',
      laborClass: 'BREAK',
    });
    const regularSession = makeLedgerSession({
      id: 11,
      employeeId: 20,
      clockIn: '2026-04-22T10:00:00Z',
      clockOut: '2026-04-22T14:00:00Z',
      laborClass: 'REGULAR',
    });

    setupDashboardMocks({ weekLedger: [breakSession, regularSession] });

    const result = await getDashboardSummary();

    // Only the 4-hour REGULAR session should count
    expect(result.hoursThisWeek).toBeCloseTo(4, 2);
  });

  it('clips cross-week ledger sessions to the weekStart boundary', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Session started Sunday Apr-19, ended Monday Apr-20 06:00 (8h total, 6h in-week)
    const crossBoundarySession = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-19T22:00:00Z',
      clockOut: '2026-04-20T06:00:00Z',
      laborClass: 'REGULAR',
    });

    setupDashboardMocks({ weekLedger: [crossBoundarySession] });

    const result = await getDashboardSummary();

    // weekStart = Apr-20 00:00Z; session clipped to 6h
    expect(result.hoursThisWeek).toBeCloseTo(6, 2);
  });

  it('attributes open ledger sessions up to now for hoursThisWeek', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Session started 3 hours ago, still open
    const threeHoursAgo = new Date(FIXED_NOW.getTime() - 3 * 3_600_000).toISOString();
    const openSession = makeLedgerSession({
      employeeId: 20,
      clockIn: threeHoursAgo,
      clockOut: null,
      laborClass: 'REGULAR',
    });

    setupDashboardMocks({ weekLedger: [openSession] });

    const result = await getDashboardSummary();

    expect(result.hoursThisWeek).toBeCloseTo(3, 1);
  });

  // -------------------------------------------------------------------------
  // hoursThisWeek — legacy punches path
  // -------------------------------------------------------------------------

  it('accumulates hours from legacy punch pairs within the week', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // 8-hour session on Tuesday via legacy punches
    const punches = [
      makePunch({ id: 1, employeeId: 5, type: 'clock_in',  punchedAt: '2026-04-21T08:00:00Z' }),
      makePunch({ id: 2, employeeId: 5, type: 'clock_out', punchedAt: '2026-04-21T16:00:00Z' }),
    ];

    setupDashboardMocks({ punches });

    const result = await getDashboardSummary();

    expect(result.hoursThisWeek).toBeCloseTo(8, 2);
  });

  // -------------------------------------------------------------------------
  // hoursThisWeek — combined from both tables
  // -------------------------------------------------------------------------

  it('sums hours from both legacy punches and ledger sessions without double-counting', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Legacy: 2 hours on Monday
    const punches = [
      makePunch({ id: 1, employeeId: 5, type: 'clock_in',  punchedAt: '2026-04-20T06:00:00Z' }),
      makePunch({ id: 2, employeeId: 5, type: 'clock_out', punchedAt: '2026-04-20T08:00:00Z' }),
    ];

    // Ledger: 3 hours on Monday (different employee or different time slot — no overlap)
    const weekSession = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-20T10:00:00Z',
      clockOut: '2026-04-20T13:00:00Z',
      laborClass: 'REGULAR',
    });

    setupDashboardMocks({ punches, weekLedger: [weekSession] });

    const result = await getDashboardSummary();

    expect(result.hoursThisWeek).toBeCloseTo(5, 2);
  });

  // -------------------------------------------------------------------------
  // overtimeHoursThisWeek
  // -------------------------------------------------------------------------

  it('calculates overtime when an employee exceeds the weekly threshold via ledger sessions', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // 42 hours across Mon-Sat (7h/day × 6 days)
    const sessions = [
      // Mon
      makeLedgerSession({ id: 1, employeeId: 20, clockIn: '2026-04-20T08:00:00Z', clockOut: '2026-04-20T15:00:00Z' }),
      // Tue
      makeLedgerSession({ id: 2, employeeId: 20, clockIn: '2026-04-21T08:00:00Z', clockOut: '2026-04-21T15:00:00Z' }),
      // Wed
      makeLedgerSession({ id: 3, employeeId: 20, clockIn: '2026-04-22T08:00:00Z', clockOut: '2026-04-22T15:00:00Z' }),
      // Thu
      makeLedgerSession({ id: 4, employeeId: 20, clockIn: '2026-04-23T08:00:00Z', clockOut: '2026-04-23T15:00:00Z' }),
      // Fri
      makeLedgerSession({ id: 5, employeeId: 20, clockIn: '2026-04-24T08:00:00Z', clockOut: '2026-04-24T15:00:00Z' }),
      // Sat
      makeLedgerSession({ id: 6, employeeId: 20, clockIn: '2026-04-25T08:00:00Z', clockOut: '2026-04-25T15:00:00Z' }),
    ];

    setupDashboardMocks({ weekLedger: sessions });

    const result = await getDashboardSummary();

    expect(result.hoursThisWeek).toBeCloseTo(42, 2);
    // Weekly threshold is 40 → 2 hours overtime
    expect(result.overtimeHoursThisWeek).toBeCloseTo(2, 2);
  });

  it('reports zero overtime when total hours are below the weekly threshold', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // 20 hours — well below the 40-hour threshold
    const session = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-20T08:00:00Z',
      clockOut: '2026-04-20T20:00:00Z', // 12h
      laborClass: 'REGULAR',
    });
    const session2 = makeLedgerSession({
      id: 11,
      employeeId: 20,
      clockIn: '2026-04-21T08:00:00Z',
      clockOut: '2026-04-21T16:00:00Z', // 8h
      laborClass: 'REGULAR',
    });

    setupDashboardMocks({ weekLedger: [session, session2] });

    const result = await getDashboardSummary();

    expect(result.hoursThisWeek).toBeCloseTo(20, 2);
    expect(result.overtimeHoursThisWeek).toBe(0);
  });

  it('overtime from ledger sessions is added to overtime from legacy punches in the combined total', async () => {
    // Two separate employees so the OT pathways are independent and easy to reason about.
    // Employee A uses only legacy punches (no ledger sessions).
    // Employee B uses only ledger sessions (no timekeepingId so no legacy punches).
    const empA = makeEmployee({ id: 1, timekeepingId: 5, epochEmployeeId: 20 });
    const empB = makeEmployee({ id: 2, timekeepingId: null, epochEmployeeId: 30 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([empA, empB]);

    // Employee A: 4 h on Monday — well under daily (8 h) and weekly (40 h) thresholds → 0 OT
    const punches = [
      makePunch({ id: 1, employeeId: 5, type: 'clock_in',  punchedAt: '2026-04-20T08:00:00Z' }),
      makePunch({ id: 2, employeeId: 5, type: 'clock_out', punchedAt: '2026-04-20T12:00:00Z' }), // 4 h
    ];

    // Employee B: 44 h across Mon–Fri via punch_ledger → 4 h over the 40 h weekly limit
    const weekSessions = [
      makeLedgerSession({ id: 10, employeeId: 30, clockIn: '2026-04-20T06:00:00Z', clockOut: '2026-04-20T15:00:00Z' }), // 9 h
      makeLedgerSession({ id: 11, employeeId: 30, clockIn: '2026-04-21T06:00:00Z', clockOut: '2026-04-21T15:00:00Z' }), // 9 h
      makeLedgerSession({ id: 12, employeeId: 30, clockIn: '2026-04-22T06:00:00Z', clockOut: '2026-04-22T15:00:00Z' }), // 9 h
      makeLedgerSession({ id: 13, employeeId: 30, clockIn: '2026-04-23T06:00:00Z', clockOut: '2026-04-23T15:00:00Z' }), // 9 h
      makeLedgerSession({ id: 14, employeeId: 30, clockIn: '2026-04-24T06:00:00Z', clockOut: '2026-04-24T14:00:00Z' }), // 8 h
    ];
    // B total: 9+9+9+9+8 = 44 h → 44 - 40 = 4 h OT

    setupDashboardMocks({ punches, weekLedger: weekSessions });

    const result = await getDashboardSummary();

    // 4 (A legacy) + 44 (B ledger) = 48 h total
    expect(result.hoursThisWeek).toBeCloseTo(48, 2);
    // 0 OT from A + 4 OT from B = 4 h overtime
    expect(result.overtimeHoursThisWeek).toBeCloseTo(4, 2);
  });

  it('excludes inactive employees from weekly ledger hours', async () => {
    const activeEmp   = makeEmployee({ id: 1, timekeepingId: null, epochEmployeeId: 20, isActive: true });
    const inactiveEmp = makeEmployee({ id: 2, timekeepingId: null, epochEmployeeId: 30, isActive: false });
    vi.mocked(listResolvedEmployees).mockResolvedValue([activeEmp, inactiveEmp]);

    // Active employee: 4-hour session
    const activeSession = makeLedgerSession({
      id: 10,
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: '2026-04-22T12:00:00Z',
      laborClass: 'REGULAR',
    });
    // Inactive employee: 8-hour session (must not contribute hours)
    const inactiveSession = makeLedgerSession({
      id: 11,
      employeeId: 30,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: '2026-04-22T16:00:00Z',
      laborClass: 'REGULAR',
    });

    setupDashboardMocks({ weekLedger: [activeSession, inactiveSession] });

    const result = await getDashboardSummary();

    // Only the 4 hours from the active employee should be counted
    expect(result.hoursThisWeek).toBeCloseTo(4, 2);
  });

  // -------------------------------------------------------------------------
  // Employee headcount
  // -------------------------------------------------------------------------

  it('reports correct totalEmployees and activeEmployees counts', async () => {
    const active1 = makeEmployee({ id: 1, timekeepingId: 5,  epochEmployeeId: 20, isActive: true });
    const active2 = makeEmployee({ id: 2, timekeepingId: 6,  epochEmployeeId: 21, isActive: true });
    const inactive = makeEmployee({ id: 3, timekeepingId: 7, epochEmployeeId: 22, isActive: false });
    vi.mocked(listResolvedEmployees).mockResolvedValue([active1, active2, inactive]);

    setupDashboardMocks({});

    const result = await getDashboardSummary();

    expect(result.totalEmployees).toBe(3);
    expect(result.activeEmployees).toBe(2);
  });
});
