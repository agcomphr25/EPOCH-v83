/**
 * In/Out Board consistency tests
 *
 * Regression guard: the In/Out Board employee count (getEmployeeStatus().length)
 * must always equal the "Active Employees" summary count (getDashboardSummary().activeEmployees)
 * for the same set of employees — including employees who have no timekeepingId (portal-only).
 *
 * Fixed reference date: Wednesday 2026-04-22 12:00:00 UTC
 * timezone = 'UTC', workweekStartDay = 1 (Monday)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --------------------------------------------------------------------------
// Mocks — must be declared before any import that triggers the module graph
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
import { getOrCreateSettings } from '../src/services/timekeeping/settings.service';
import { listResolvedEmployees } from '../src/lib/timekeepingEmployeeResolver';
import { toApiEmployee } from '../src/services/timekeeping/employees.service';
import { getDashboardSummary } from '../src/services/timekeeping/dashboard.service';
import { getEmployeeStatus } from '../src/services/timekeeping/dashboard.service';

// --------------------------------------------------------------------------
// Fixtures
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
    name: `${overrides.firstName ?? 'Test'} ${overrides.lastName ?? 'Employee'}`,
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
 * Chain shape for getDashboardSummary db.select calls:
 *   .from().orderBy()         → resolves with rows (allPunches)
 *   .from()                   → thenable (timesheets, certs)
 *   .from().where().orderBy() → resolves with rows (openLedger)
 *   .from().where()           → thenable (weekLedger, pendingTimeOff)
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
 * Chain shape for getEmployeeStatus db.select calls:
 *   .from().where().orderBy() → resolves with rows
 *   .from().where()           → thenable
 */
function makeStatusChain(rows: unknown[]) {
  const orderByFn = vi.fn().mockResolvedValue(rows);
  const terminalNode = {
    orderBy: orderByFn,
    then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  };
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminalNode),
      orderBy: orderByFn,
      then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(onFulfilled, onRejected),
    }),
  };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('In/Out Board ↔ Dashboard summary consistency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    vi.mocked(toApiEmployee).mockImplementation((e: unknown) => e as ReturnType<typeof toApiEmployee>);
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
  // getDashboardSummary: activeEmployees includes portal-only employees
  // -------------------------------------------------------------------------

  it('getDashboardSummary.activeEmployees counts employees without a timekeepingId', async () => {
    // Three active employees: one anchored to timekeeping, two portal-only (no timekeepingId)
    const legacy  = makeEmployee({ id: 1, timekeepingId: 5,   epochEmployeeId: 10, firstName: 'Legacy',  lastName: 'User' });
    const portalA = makeEmployee({ id: 2, timekeepingId: null, epochEmployeeId: 20, firstName: 'Portal',  lastName: 'Alpha' });
    const portalB = makeEmployee({ id: 3, timekeepingId: null, epochEmployeeId: 30, firstName: 'Portal',  lastName: 'Beta' });
    vi.mocked(listResolvedEmployees).mockResolvedValue([legacy, portalA, portalB]);

    // getDashboardSummary Promise.all fires 6 select calls:
    //   1. allPunches, 2. allTimesheets, 3. allCerts,
    //   4. openLedger, 5. weekLedger, 6. pendingTimeOff
    vi.mocked(db.select)
      .mockReturnValueOnce(makeDashboardChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeDashboardChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeDashboardChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeDashboardChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeDashboardChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeDashboardChain([]) as ReturnType<typeof db.select>);

    const summary = await getDashboardSummary();

    // All three active employees must be reflected in the count
    expect(summary.activeEmployees).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Cross-function invariant: board count === activeEmployees count
  // -------------------------------------------------------------------------

  it('getEmployeeStatus().length equals getDashboardSummary().activeEmployees for a mixed employee set', async () => {
    // Four active employees: one with timekeepingId, three portal-only
    const legacy  = makeEmployee({ id: 1, timekeepingId: 7,   epochEmployeeId: 10, firstName: 'Legacy',  lastName: 'One' });
    const portalA = makeEmployee({ id: 2, timekeepingId: null, epochEmployeeId: 20, firstName: 'Portal',  lastName: 'A' });
    const portalB = makeEmployee({ id: 3, timekeepingId: null, epochEmployeeId: 30, firstName: 'Portal',  lastName: 'B' });
    const portalC = makeEmployee({ id: 4, timekeepingId: null, epochEmployeeId: 40, firstName: 'Portal',  lastName: 'C' });
    const allEmployees = [legacy, portalA, portalB, portalC];

    // --- getDashboardSummary call (6 selects, 0 executes) ---
    vi.mocked(listResolvedEmployees).mockResolvedValue(allEmployees);
    vi.mocked(db.select)
      .mockReturnValueOnce(makeDashboardChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeDashboardChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeDashboardChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeDashboardChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeDashboardChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeDashboardChain([]) as ReturnType<typeof db.select>);

    const summary = await getDashboardSummary();

    // --- getEmployeeStatus call (3 selects + 1 execute for the one legacy employee) ---
    vi.mocked(listResolvedEmployees).mockResolvedValue(allEmployees);
    vi.mocked(db.execute).mockResolvedValueOnce(
      { rows: [] } as ReturnType<typeof db.execute>,
    );
    vi.mocked(db.select)
      .mockReturnValueOnce(makeStatusChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeStatusChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeStatusChain([]) as ReturnType<typeof db.select>);

    const board = await getEmployeeStatus();

    // Both values must reflect all 4 active employees
    expect(summary.activeEmployees).toBe(4);
    expect(board).toHaveLength(4);
    expect(board.length).toBe(summary.activeEmployees);
  });
});
