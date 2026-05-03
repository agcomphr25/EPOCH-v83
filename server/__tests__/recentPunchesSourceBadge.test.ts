/**
 * Tests for getRecentPunches() in dashboard.service.ts
 *
 * Verifies that the `source` field is correctly stamped on every returned
 * punch event, edge cases are handled gracefully, and deduplication / sorting
 * work as expected.
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

vi.mock('../src/lib/timekeeping', () => ({
  computeHoursFromPunches: vi.fn().mockReturnValue(0),
  computeTimesheetHours: vi.fn().mockReturnValue(0),
  toTZDateStr: vi.fn((d: Date) => d.toISOString().slice(0, 10)),
  startOfWeekInTZ: vi.fn().mockReturnValue(new Date('2026-04-20T00:00:00Z')),
  derivePunchStatus: vi.fn().mockReturnValue('clocked_out'),
}));

vi.mock('../src/services/payPeriod', () => ({
  getPayPeriodDates: vi.fn(),
}));

vi.mock('../src/schema/timekeeping', () => ({
  punchesTable: {
    employeeId: { name: 'employee_id' },
    punchedAt: { name: 'punched_at' },
    id: { name: 'id' },
    type: { name: 'type' },
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

// --------------------------------------------------------------------------
// Imports (after mocks are hoisted)
// --------------------------------------------------------------------------

import { db } from '../db';
import { listResolvedEmployees } from '../src/lib/timekeepingEmployeeResolver';
import { getRecentPunches } from '../src/services/timekeeping/dashboard.service';

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

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

function makeLegacyPunch(overrides: {
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

function makeEmployee(overrides: {
  id?: number;
  timekeepingId?: number | null;
  epochEmployeeId?: number;
  firstName?: string;
  lastName?: string;
  department?: string | null;
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
    department: overrides.department ?? null,
    jobTitle: null,
    phone: null,
    hireDate: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

/**
 * Build a mock db.select() chain for getRecentPunches.
 * Query shape: .select().from(table).orderBy(...).limit(n) → Promise<rows>
 */
function makeSelectChain(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
  return {
    from: vi.fn().mockReturnValue({ orderBy: orderByFn }),
  };
}

/**
 * Wire db.select to return `sessions` for the first call (punch_ledger)
 * and `legacyPunches` for the second call (timekeeping.punches).
 */
function setupRecentPunchesMocks(opts: {
  sessions?: unknown[];
  legacyPunches?: unknown[];
}) {
  const { sessions = [], legacyPunches = [] } = opts;
  vi.mocked(db.select)
    .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>)
    .mockReturnValueOnce(makeSelectChain(legacyPunches) as ReturnType<typeof db.select>);
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('getRecentPunches – source field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listResolvedEmployees).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // kiosk source (punch_ledger)
  // -------------------------------------------------------------------------

  it('stamps source="kiosk" on clock_in events from punch_ledger', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const session = makeLedgerSession({
      id: 10,
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: null,
    });

    setupRecentPunchesMocks({ sessions: [session] });

    const result = await getRecentPunches(20);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('kiosk');
    expect(result[0].punchType).toBe('clock_in');
  });

  it('stamps source="kiosk" on clock_out events from closed punch_ledger sessions', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const session = makeLedgerSession({
      id: 10,
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: '2026-04-22T17:00:00Z',
    });

    setupRecentPunchesMocks({ sessions: [session] });

    const result = await getRecentPunches(20);

    expect(result).toHaveLength(2);
    const clockOut = result.find((p) => p.punchType === 'clock_out');
    expect(clockOut).toBeDefined();
    expect(clockOut!.source).toBe('kiosk');
  });

  it('emits two events (clock_in and clock_out) for a closed ledger session, both with source="kiosk"', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const session = makeLedgerSession({
      id: 10,
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: '2026-04-22T16:00:00Z',
    });

    setupRecentPunchesMocks({ sessions: [session] });

    const result = await getRecentPunches(20);

    expect(result).toHaveLength(2);
    expect(result.every((p) => p.source === 'kiosk')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // legacy source (timekeeping.punches)
  // -------------------------------------------------------------------------

  it('stamps source="legacy" on clock_in punches from timekeeping.punches', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punch = makeLegacyPunch({
      id: 1,
      employeeId: 5,
      type: 'clock_in',
      punchedAt: '2026-04-22T08:00:00Z',
    });

    setupRecentPunchesMocks({ legacyPunches: [punch] });

    const result = await getRecentPunches(20);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('legacy');
    expect(result[0].punchType).toBe('clock_in');
  });

  it('stamps source="legacy" on clock_out punches from timekeeping.punches', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punch = makeLegacyPunch({
      id: 2,
      employeeId: 5,
      type: 'clock_out',
      punchedAt: '2026-04-22T17:00:00Z',
    });

    setupRecentPunchesMocks({ legacyPunches: [punch] });

    const result = await getRecentPunches(20);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('legacy');
    expect(result[0].punchType).toBe('clock_out');
  });

  it('stamps source="legacy" on break_start and break_end punches', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punches = [
      makeLegacyPunch({ id: 2, employeeId: 5, type: 'break_start', punchedAt: '2026-04-22T12:00:00Z' }),
      makeLegacyPunch({ id: 1, employeeId: 5, type: 'break_end',   punchedAt: '2026-04-22T12:30:00Z' }),
    ];

    setupRecentPunchesMocks({ legacyPunches: punches });

    const result = await getRecentPunches(20);

    expect(result).toHaveLength(2);
    expect(result.every((p) => p.source === 'legacy')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Edge cases: unknown employees are silently skipped
  // -------------------------------------------------------------------------

  it('skips punch_ledger sessions whose employeeId does not match any resolved employee', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const unknownSession = makeLedgerSession({
      employeeId: 999, // no employee has this epochEmployeeId
      clockIn: '2026-04-22T08:00:00Z',
    });

    setupRecentPunchesMocks({ sessions: [unknownSession] });

    const result = await getRecentPunches(20);

    expect(result).toHaveLength(0);
  });

  it('skips timekeeping.punches rows whose employeeId does not match any resolved employee', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const unknownPunch = makeLegacyPunch({
      employeeId: 999, // no employee has this timekeepingId
      type: 'clock_in',
      punchedAt: '2026-04-22T08:00:00Z',
    });

    setupRecentPunchesMocks({ legacyPunches: [unknownPunch] });

    const result = await getRecentPunches(20);

    expect(result).toHaveLength(0);
  });

  it('returns an empty array when both tables return no rows', async () => {
    vi.mocked(listResolvedEmployees).mockResolvedValue([]);
    setupRecentPunchesMocks({});

    const result = await getRecentPunches(20);

    expect(result).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Edge cases: unrecognised punch type is silently skipped (not surfaced)
  // -------------------------------------------------------------------------

  it('does not surface timekeeping.punches rows with an unrecognised punch type', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const weirdPunch = makeLegacyPunch({
      id: 1,
      employeeId: 5,
      type: 'some_future_type',
      punchedAt: '2026-04-22T09:00:00Z',
    });

    setupRecentPunchesMocks({ legacyPunches: [weirdPunch] });

    const result = await getRecentPunches(20);

    expect(result).toHaveLength(0);
  });

  it('skips only the unrecognised-type punch while still returning recognised punches for the same employee', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const goodPunch = makeLegacyPunch({
      id: 1,
      employeeId: 5,
      type: 'clock_in',
      punchedAt: '2026-04-22T08:00:00Z',
    });
    const badPunch = makeLegacyPunch({
      id: 2,
      employeeId: 5,
      type: 'some_unknown_type',
      punchedAt: '2026-04-22T09:00:00Z',
    });

    setupRecentPunchesMocks({ legacyPunches: [badPunch, goodPunch] });

    const result = await getRecentPunches(20);

    expect(result).toHaveLength(1);
    expect(result[0].punchType).toBe('clock_in');
    expect(result[0].source).toBe('legacy');
  });

  // -------------------------------------------------------------------------
  // Sorting: results are returned newest-first
  // -------------------------------------------------------------------------

  it('returns events sorted by timestamp descending regardless of source', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Legacy punch at 10:00 — older
    const legacyPunch = makeLegacyPunch({
      id: 1,
      employeeId: 5,
      type: 'clock_in',
      punchedAt: '2026-04-22T10:00:00Z',
    });

    // Kiosk session clock-in at 12:00 — newer
    const session = makeLedgerSession({
      id: 10,
      employeeId: 20,
      clockIn: '2026-04-22T12:00:00Z',
      clockOut: null,
    });

    setupRecentPunchesMocks({ sessions: [session], legacyPunches: [legacyPunch] });

    const result = await getRecentPunches(20);

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].source).toBe('kiosk');   // newer at 12:00
    expect(result[1].source).toBe('legacy');  // older at 10:00
  });

  // -------------------------------------------------------------------------
  // Deduplication: same employee + same timestamp appears only once
  // -------------------------------------------------------------------------

  it('deduplicates events with the same employeeId and timestamp from both sources', async () => {
    const emp = makeEmployee({ timekeepingId: 5, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Same employee (epochEmployeeId=20 / timekeepingId=5), same moment
    const sharedTs = '2026-04-22T08:00:00Z';

    const session = makeLedgerSession({
      id: 10,
      employeeId: 20,
      clockIn: sharedTs,
      clockOut: null,
    });

    const legacyPunch = makeLegacyPunch({
      id: 1,
      employeeId: 5,
      type: 'clock_in',
      punchedAt: sharedTs,
    });

    setupRecentPunchesMocks({ sessions: [session], legacyPunches: [legacyPunch] });

    const result = await getRecentPunches(20);

    // Only one event despite appearing in both sources
    expect(result).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Limit is respected
  // -------------------------------------------------------------------------

  it('returns at most `limit` events', async () => {
    const emp = makeEmployee({ timekeepingId: null, epochEmployeeId: 20 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Build 5 distinct closed sessions → 10 events (clock_in + clock_out each)
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeLedgerSession({
        id: i + 1,
        employeeId: 20,
        clockIn: `2026-04-22T0${i}:00:00Z`,
        clockOut: `2026-04-22T0${i}:30:00Z`,
      })
    );

    setupRecentPunchesMocks({ sessions });

    const result = await getRecentPunches(3);

    expect(result.length).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Mixed-source run: both sources return events for different employees
  // -------------------------------------------------------------------------

  it('correctly separates kiosk vs legacy when both are present for different employees', async () => {
    // Alice is a kiosk-only employee (no timekeepingId)
    const alice = makeEmployee({
      id: 1,
      timekeepingId: null,
      epochEmployeeId: 20,
      firstName: 'Alice',
      lastName: 'Kiosk',
    });
    // Bob is a legacy employee (has timekeepingId=5, epochEmployeeId=30)
    const bob = makeEmployee({
      id: 2,
      timekeepingId: 5,
      epochEmployeeId: 30,
      firstName: 'Bob',
      lastName: 'Legacy',
    });
    vi.mocked(listResolvedEmployees).mockResolvedValue([alice, bob]);

    const aliceSession = makeLedgerSession({
      id: 10,
      employeeId: 20, // Alice's epochEmployeeId
      clockIn: '2026-04-22T08:00:00Z',
      clockOut: null,
    });

    const bobPunch = makeLegacyPunch({
      id: 1,
      employeeId: 5, // Bob's timekeepingId
      type: 'clock_in',
      punchedAt: '2026-04-22T09:00:00Z',
    });

    setupRecentPunchesMocks({ sessions: [aliceSession], legacyPunches: [bobPunch] });

    const result = await getRecentPunches(20);

    expect(result).toHaveLength(2);

    const alicePunch = result.find((p) => p.employeeName === 'Alice Kiosk');
    const bobResult  = result.find((p) => p.employeeName === 'Bob Legacy');

    expect(alicePunch).toBeDefined();
    expect(alicePunch!.source).toBe('kiosk');

    expect(bobResult).toBeDefined();
    expect(bobResult!.source).toBe('legacy');
  });

  // -------------------------------------------------------------------------
  // Employee name and department are resolved from the employee record
  // -------------------------------------------------------------------------

  it('includes the resolved employeeName on kiosk events', async () => {
    const emp = makeEmployee({
      timekeepingId: null,
      epochEmployeeId: 20,
      firstName: 'Jane',
      lastName: 'Smith',
      department: 'Welding',
    });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const session = makeLedgerSession({
      employeeId: 20,
      clockIn: '2026-04-22T08:00:00Z',
    });

    setupRecentPunchesMocks({ sessions: [session] });

    const result = await getRecentPunches(20);

    expect(result[0].employeeName).toBe('Jane Smith');
    expect(result[0].department).toBe('Welding');
  });

  it('includes the resolved employeeName on legacy events', async () => {
    const emp = makeEmployee({
      timekeepingId: 5,
      epochEmployeeId: 20,
      firstName: 'John',
      lastName: 'Doe',
      department: 'Assembly',
    });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punch = makeLegacyPunch({
      id: 1,
      employeeId: 5,
      type: 'clock_out',
      punchedAt: '2026-04-22T17:00:00Z',
    });

    setupRecentPunchesMocks({ legacyPunches: [punch] });

    const result = await getRecentPunches(20);

    expect(result[0].employeeName).toBe('John Doe');
    expect(result[0].department).toBe('Assembly');
  });
});
