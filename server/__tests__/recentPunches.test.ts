/**
 * Tests for getRecentPunches in dashboard.service.ts
 *
 * getRecentPunches is the data-fetching function behind the "recent punches"
 * sidebar on the Time Clock Admin page. A missing import or query change there
 * would produce a silent 500. These tests exercise the function end-to-end so
 * that any such runtime breakage is caught before it reaches production.
 *
 * The function merges two sources:
 *   1. punch_ledger (kiosk/portal sessions) — each session contributes up to
 *      two events: clock_in at session.clockIn and clock_out at session.clockOut.
 *   2. punchesTable (legacy timekeeping system) — each row is one event.
 *
 * Events are sorted by timestamp descending, deduplicated, and sliced to `limit`.
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
  getPayPeriodDates: vi.fn(),
}));

// --------------------------------------------------------------------------
// Imports (after mocks are hoisted)
// --------------------------------------------------------------------------

import { db } from '../db';
import { listResolvedEmployees } from '../src/lib/timekeepingEmployeeResolver';
import { getRecentPunches } from '../src/services/timekeeping/dashboard.service';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Builds a Drizzle-like chain for queries of the shape:
 *   db.select().from(...).orderBy(...).limit(n)
 * which resolves with `rows`.
 */
function makeOrderByLimitChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function makeEmployee(overrides: {
  id?: number;
  timekeepingId?: number | null;
  epochEmployeeId?: number;
  firstName?: string;
  lastName?: string;
  department?: string | null;
}) {
  return {
    id: overrides.id ?? 1,
    timekeepingId: 'timekeepingId' in overrides ? overrides.timekeepingId : 1,
    epochEmployeeId: overrides.epochEmployeeId ?? 10,
    name: `${overrides.firstName ?? 'Alice'} ${overrides.lastName ?? 'Smith'}`,
    firstName: overrides.firstName ?? 'Alice',
    lastName: overrides.lastName ?? 'Smith',
    email: null,
    employeeCode: 'A001',
    isActive: true,
    timekeeperPin: null,
    timezone: 'UTC',
    hourlyRate: null,
    salary: null,
    payType: null,
    department: overrides.department ?? null,
    jobTitle: null,
    phone: null,
    hireDate: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
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
    employeeId: overrides.employeeId ?? 10,
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

function makeLegacyPunch(overrides: {
  id?: number;
  employeeId?: number;
  type?: string;
  punchedAt: string;
}) {
  return {
    id: overrides.id ?? 1,
    employeeId: overrides.employeeId ?? 1,
    type: overrides.type ?? 'clock_in',
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

// --------------------------------------------------------------------------
// Test suites
// --------------------------------------------------------------------------

describe('getRecentPunches', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T12:00:00Z'));
    vi.clearAllMocks();
    vi.mocked(listResolvedEmployees).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // Baseline — catches missing import errors
  // -------------------------------------------------------------------------

  it('returns an array without throwing when there are no sessions or employees', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>) // punchLedger
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>); // punchesTable

    const { punches: result, orphanedCount } = await getRecentPunches();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
    expect(orphanedCount).toBe(0);
  });

  it('returns an array without throwing when called with an explicit limit', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches(5);

    expect(Array.isArray(result)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Kiosk (punch_ledger) source
  // -------------------------------------------------------------------------

  it('emits a clock_in event for an open kiosk session', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: null });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const session = makeLedgerSession({
      id: 1,
      employeeId: 10,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: null,
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([session]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    expect(result).toHaveLength(1);
    expect(result[0].punchType).toBe('clock_in');
    expect(result[0].source).toBe('kiosk');
    expect(result[0].employeeName).toBe('Alice Smith');
    expect(result[0].punchedAt).toBe('2026-04-22T08:00:00.000Z');
  });

  it('emits both clock_in and clock_out events for a closed kiosk session', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: null });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const session = makeLedgerSession({
      id: 1,
      employeeId: 10,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: '2026-04-22T16:00:00Z',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([session]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    expect(result).toHaveLength(2);
    const types = result.map((r) => r.punchType);
    expect(types).toContain('clock_in');
    expect(types).toContain('clock_out');
  });

  it('skips kiosk sessions where the employee is not in the resolved list', async () => {
    vi.mocked(listResolvedEmployees).mockResolvedValue([]); // no employees

    const session = makeLedgerSession({
      employeeId: 99,
      clockIn: '2026-04-22T08:00:00Z',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([session]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>);

    const { punches: result, orphanedCount } = await getRecentPunches();

    expect(result).toHaveLength(0);
    expect(orphanedCount).toBe(1);
  });

  it('logs a warning when a kiosk session references an employee not in the resolved list', async () => {
    vi.mocked(listResolvedEmployees).mockResolvedValue([]); // no employees

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const session = makeLedgerSession({
      id: 42,
      employeeId: 99,
      clockIn: '2026-04-22T08:00:00Z',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([session]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>);

    await getRecentPunches();

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/employeeId=99/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/session id=42/);
    warnSpy.mockRestore();
  });

  it('includes department from the employee record on kiosk events', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: null, department: 'Engineering' });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const session = makeLedgerSession({
      employeeId: 10,
      clockIn: '2026-04-22T08:00:00Z',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([session]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    expect(result).toHaveLength(1);
    expect(result[0].department).toBe('Engineering');
  });

  // -------------------------------------------------------------------------
  // BREAK sessions — getRecentPunches filters out laborClass='BREAK' sessions
  // from punch_ledger because they represent rest periods, not meaningful
  // work punch activity, and would clutter the sidebar.
  // -------------------------------------------------------------------------

  it('BREAK-labeled kiosk sessions are excluded from the output', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: null });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const breakSession = makeLedgerSession({
      id: 5,
      employeeId: 10,
      clockIn: '2026-04-22T12:00:00Z',
      clockOut: '2026-04-22T12:30:00Z',
      laborClass: 'BREAK',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([breakSession]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    // The BREAK session must produce zero events in the sidebar
    expect(result).toHaveLength(0);
  });

  it('REGULAR sessions are not affected by BREAK filtering', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: null });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const regularSession = makeLedgerSession({
      id: 1,
      employeeId: 10,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: '2026-04-22T16:00:00Z',
      laborClass: 'REGULAR',
    });
    const breakSession = makeLedgerSession({
      id: 2,
      employeeId: 10,
      clockIn: '2026-04-22T12:00:00Z',
      clockOut: '2026-04-22T12:30:00Z',
      laborClass: 'BREAK',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([regularSession, breakSession]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    // Only the REGULAR session's two events should appear; BREAK session is excluded
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.source === 'kiosk')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Legacy punch source
  // -------------------------------------------------------------------------

  it('includes legacy clock_in punch events sourced from punchesTable', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: 7 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punch = makeLegacyPunch({
      id: 100,
      employeeId: 7,
      type: 'clock_in',
      punchedAt: '2026-04-21T09:00:00Z',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>)   // punchLedger
      .mockReturnValueOnce(makeOrderByLimitChain([punch]) as ReturnType<typeof db.select>); // punchesTable

    const { punches: result } = await getRecentPunches();

    expect(result).toHaveLength(1);
    expect(result[0].punchType).toBe('clock_in');
    expect(result[0].source).toBe('legacy');
    expect(result[0].employeeName).toBe('Alice Smith');
  });

  it('maps unknown legacy punch types to "other" instead of dropping them', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: 7 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punch = makeLegacyPunch({
      id: 200,
      employeeId: 7,
      type: 'UNKNOWN_TYPE',
      punchedAt: '2026-04-21T09:00:00Z',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([punch]) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    expect(result).toHaveLength(1);
    expect(result[0].punchType).toBe('other');
  });

  it('logs a console.warn when an unknown legacy punch type is encountered', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: 7 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punch = makeLegacyPunch({
      id: 201,
      employeeId: 7,
      type: 'totally_unknown_type',
      punchedAt: '2026-04-21T09:00:00Z',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([punch]) as ReturnType<typeof db.select>);

    await getRecentPunches();

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/Unknown punch type "totally_unknown_type"/);

    warnSpy.mockRestore();
  });

  it('does not log a warning for known punch types including break_start and break_end', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: 7 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punches = [
      makeLegacyPunch({ id: 4, employeeId: 7, type: 'clock_out',   punchedAt: '2026-04-22T17:00:00Z' }),
      makeLegacyPunch({ id: 3, employeeId: 7, type: 'break_end',   punchedAt: '2026-04-22T11:00:00Z' }),
      makeLegacyPunch({ id: 2, employeeId: 7, type: 'break_start', punchedAt: '2026-04-22T10:00:00Z' }),
      makeLegacyPunch({ id: 1, employeeId: 7, type: 'clock_in',    punchedAt: '2026-04-22T08:00:00Z' }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain(punches) as ReturnType<typeof db.select>);

    await getRecentPunches();

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('skips legacy punches where the employee is not in the resolved list', async () => {
    vi.mocked(listResolvedEmployees).mockResolvedValue([]); // no employees

    const punch = makeLegacyPunch({
      employeeId: 99,
      type: 'clock_in',
      punchedAt: '2026-04-21T09:00:00Z',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([punch]) as ReturnType<typeof db.select>);

    const { punches: result, orphanedCount } = await getRecentPunches();

    expect(result).toHaveLength(0);
    expect(orphanedCount).toBe(1);
  });

  it('logs a warning when a legacy punch references an employee not in the resolved list', async () => {
    vi.mocked(listResolvedEmployees).mockResolvedValue([]); // no employees

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const punch = makeLegacyPunch({
      id: 77,
      employeeId: 99,
      type: 'clock_in',
      punchedAt: '2026-04-21T09:00:00Z',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([punch]) as ReturnType<typeof db.select>);

    await getRecentPunches();

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/timekeepingId=99/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/punch id=77/);
    warnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // break_start and break_end legacy punch types are surfaced correctly
  // -------------------------------------------------------------------------

  it('includes a break_start legacy punch with punchType "break_start"', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: 7 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punches = [
      makeLegacyPunch({ id: 2, employeeId: 7, type: 'break_start', punchedAt: '2026-04-22T10:00:00Z' }),
      makeLegacyPunch({ id: 1, employeeId: 7, type: 'clock_in',    punchedAt: '2026-04-22T08:00:00Z' }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain(punches) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    const breakStartEvents = result.filter((e) => e.punchType === 'break_start');
    expect(breakStartEvents).toHaveLength(1);
    expect(breakStartEvents[0].punchedAt).toBe('2026-04-22T10:00:00.000Z');
    expect(breakStartEvents[0].source).toBe('legacy');
  });

  it('includes a break_end legacy punch with punchType "break_end"', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: 7 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punches = [
      makeLegacyPunch({ id: 3, employeeId: 7, type: 'break_end',   punchedAt: '2026-04-22T11:00:00Z' }),
      makeLegacyPunch({ id: 2, employeeId: 7, type: 'break_start', punchedAt: '2026-04-22T10:00:00Z' }),
      makeLegacyPunch({ id: 1, employeeId: 7, type: 'clock_in',    punchedAt: '2026-04-22T08:00:00Z' }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain(punches) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    const breakEndEvents = result.filter((e) => e.punchType === 'break_end');
    expect(breakEndEvents).toHaveLength(1);
    expect(breakEndEvents[0].punchedAt).toBe('2026-04-22T11:00:00.000Z');
    expect(breakEndEvents[0].source).toBe('legacy');
  });

  it('surfaces both break_start and break_end punches together in the result', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: 7 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punches = [
      makeLegacyPunch({ id: 3, employeeId: 7, type: 'break_end',   punchedAt: '2026-04-22T11:00:00Z' }),
      makeLegacyPunch({ id: 2, employeeId: 7, type: 'break_start', punchedAt: '2026-04-22T10:00:00Z' }),
      makeLegacyPunch({ id: 1, employeeId: 7, type: 'clock_in',    punchedAt: '2026-04-22T08:00:00Z' }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain(punches) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    const types = result.map((e) => e.punchType);
    expect(types).toContain('break_start');
    expect(types).toContain('break_end');
    expect(types).toContain('clock_in');
    expect(result).toHaveLength(3);
  });

  it('preserves the correct employeeName on break punch events', async () => {
    const emp = makeEmployee({
      epochEmployeeId: 10,
      timekeepingId: 7,
      firstName: 'Jane',
      lastName: 'Doe',
    });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punches = [
      makeLegacyPunch({ id: 1, employeeId: 7, type: 'break_start', punchedAt: '2026-04-22T10:00:00Z' }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain(punches) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    expect(result).toHaveLength(1);
    expect(result[0].punchType).toBe('break_start');
    expect(result[0].employeeName).toBe('Jane Doe');
  });

  // -------------------------------------------------------------------------
  // Sorting — most recent event first
  // -------------------------------------------------------------------------

  it('returns events sorted by timestamp descending (most recent first)', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: null });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const sessions = [
      makeLedgerSession({ id: 1, employeeId: 10, clockIn: '2026-04-20T08:00:00Z', clockOut: '2026-04-20T12:00:00Z' }),
      makeLedgerSession({ id: 2, employeeId: 10, clockIn: '2026-04-22T08:00:00Z', clockOut: '2026-04-22T12:00:00Z' }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain(sessions) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    // The four events (two sessions × two events each) must be sorted newest first
    const timestamps = result.map((r) => new Date(r.punchedAt).getTime());
    const sorted = [...timestamps].sort((a, b) => b - a);
    expect(timestamps).toEqual(sorted);
    // Most recent event is the clock_out from session 2
    expect(result[0].punchedAt).toBe('2026-04-22T12:00:00.000Z');
  });

  // -------------------------------------------------------------------------
  // Limit parameter
  // -------------------------------------------------------------------------

  it('respects the limit parameter and never returns more events than requested', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: null });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // 3 closed sessions → 6 events total; with limit=3 only 3 must be returned
    const sessions = [
      makeLedgerSession({ id: 1, employeeId: 10, clockIn: '2026-04-22T06:00:00Z', clockOut: '2026-04-22T07:00:00Z' }),
      makeLedgerSession({ id: 2, employeeId: 10, clockIn: '2026-04-22T08:00:00Z', clockOut: '2026-04-22T09:00:00Z' }),
      makeLedgerSession({ id: 3, employeeId: 10, clockIn: '2026-04-22T10:00:00Z', clockOut: '2026-04-22T11:00:00Z' }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain(sessions) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches(3);

    expect(result.length).toBeLessThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // Deduplication — same employee + same timestamp must not appear twice
  // -------------------------------------------------------------------------

  it('deduplicates events with the same employeeId and timestamp across sources', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: 7 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const sharedTimestamp = '2026-04-21T09:00:00Z';

    // Kiosk session whose clockIn matches the legacy punch timestamp exactly
    const session = makeLedgerSession({
      id: 1,
      employeeId: 10,
      clockIn: sharedTimestamp,
      clockOut: null,
    });

    // Legacy punch for the same employee at the same instant
    const punch = makeLegacyPunch({
      id: 100,
      employeeId: 7,
      type: 'clock_in',
      punchedAt: sharedTimestamp,
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([session]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([punch]) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    // Both sources produce a clock_in at the same timestamp; only one must survive
    expect(result).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Multi-source orphan accumulation
  // -------------------------------------------------------------------------

  it('accumulates orphanedCount across both kiosk and legacy sources', async () => {
    vi.mocked(listResolvedEmployees).mockResolvedValue([]); // no employees — all will be orphaned

    const kioskSession1 = makeLedgerSession({
      id: 10,
      employeeId: 101,
      clockIn: '2026-04-22T08:00:00Z',
    });
    const kioskSession2 = makeLedgerSession({
      id: 11,
      employeeId: 102,
      clockIn: '2026-04-22T09:00:00Z',
    });
    const legacyPunch1 = makeLegacyPunch({
      id: 200,
      employeeId: 201,
      type: 'clock_in',
      punchedAt: '2026-04-22T07:00:00Z',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([kioskSession1, kioskSession2]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([legacyPunch1]) as ReturnType<typeof db.select>);

    const { punches: result, orphanedCount } = await getRecentPunches();

    expect(result).toHaveLength(0);
    expect(orphanedCount).toBe(3);
  });

  it('BREAK kiosk sessions with unresolvable employees do not increment orphanedCount', async () => {
    vi.mocked(listResolvedEmployees).mockResolvedValue([]); // no employees

    const breakSession = makeLedgerSession({
      id: 20,
      employeeId: 999,
      clockIn: '2026-04-22T12:00:00Z',
      clockOut: '2026-04-22T12:30:00Z',
      laborClass: 'BREAK',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([breakSession]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>);

    const { punches: result, orphanedCount } = await getRecentPunches();

    // BREAK sessions are filtered before the orphan resolution check,
    // so a BREAK session with an unknown employee must not count as an orphan
    expect(result).toHaveLength(0);
    expect(orphanedCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Output shape — _ts field must be stripped from the public result
  // -------------------------------------------------------------------------

  it('does not expose the internal _ts field in the returned objects', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: null });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const session = makeLedgerSession({
      employeeId: 10,
      clockIn: '2026-04-22T08:00:00Z',
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeOrderByLimitChain([session]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeOrderByLimitChain([]) as ReturnType<typeof db.select>);

    const { punches: result } = await getRecentPunches();

    expect(result.length).toBeGreaterThan(0);
    for (const item of result) {
      expect(item).not.toHaveProperty('_ts');
    }
  });
});
