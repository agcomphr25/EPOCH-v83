/**
 * Tests for getEmployeeHoursForPeriod in dashboard.service.ts
 *
 * The original bug: `lte` was missing from the drizzle-orm import, causing
 * the employee-hours endpoint to throw a 500. These tests exercise the function
 * end-to-end so that any missing import (or similar runtime breakage) is caught
 * before it reaches production.
 *
 * Fixed reference date: Wednesday 2026-04-22 12:00:00 UTC
 * Pay period: 2026-04-13 00:00:00Z → 2026-04-26 23:59:59Z (two-week period)
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
import { getOrCreateSettings } from '../src/services/timekeeping/settings.service';
import { listResolvedEmployees } from '../src/lib/timekeepingEmployeeResolver';
import { getPayPeriodDates } from '../src/services/payPeriod';
import { getEmployeeHoursForPeriod } from '../src/services/timekeeping/dashboard.service';

// --------------------------------------------------------------------------
// Shared fixtures
// --------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-04-22T12:00:00Z');

const PERIOD_START = new Date('2026-04-13T00:00:00Z');
const PERIOD_END   = new Date('2026-04-26T23:59:59Z');

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

function makePunch(overrides: {
  id?: number;
  employeeId?: number;
  type: string;
  punchedAt: string;
}) {
  return {
    id: overrides.id ?? 1,
    employeeId: overrides.employeeId ?? 1,
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

function makeSelectChainWithSpy(rows: unknown[]) {
  const whereSpy = vi.fn().mockResolvedValue(rows);
  const chain = {
    from: vi.fn().mockReturnValue({ where: whereSpy }),
  };
  return { chain, whereSpy };
}

function serializeWhereArg(arg: unknown): string {
  return JSON.stringify(arg, (_, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Date) return v.toISOString();
    return v;
  }) ?? '';
}

// --------------------------------------------------------------------------
// Test suites
// --------------------------------------------------------------------------

describe('getEmployeeHoursForPeriod', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();

    vi.mocked(getOrCreateSettings).mockResolvedValue(
      DEFAULT_SETTINGS as ReturnType<typeof getOrCreateSettings> extends Promise<infer T> ? T : never
    );
    vi.mocked(getPayPeriodDates).mockReturnValue({
      start: PERIOD_START,
      end: PERIOD_END,
    });
    vi.mocked(listResolvedEmployees).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // Baseline — catches missing import errors (the original bug)
  // -------------------------------------------------------------------------

  it('returns an array without throwing when there are no employees', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

    const result = await getEmployeeHoursForPeriod();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns an array without throwing when called with explicit from/to dates', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

    const from = new Date('2026-04-13T00:00:00Z');
    const to   = new Date('2026-04-19T23:59:59Z');
    const result = await getEmployeeHoursForPeriod(from, to);

    expect(Array.isArray(result)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Employee list shape
  // -------------------------------------------------------------------------

  it('returns one entry per active employee even when there are no punches', async () => {
    const alice = makeEmployee({ id: 1, timekeepingId: 1, epochEmployeeId: 10 });
    const bob   = makeEmployee({ id: 2, timekeepingId: 2, epochEmployeeId: 20, firstName: 'Bob', lastName: 'Jones' });
    vi.mocked(listResolvedEmployees).mockResolvedValue([alice, bob]);

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

    const result = await getEmployeeHoursForPeriod();

    expect(result).toHaveLength(2);
    const names = result.map((r) => r.name).sort();
    expect(names).toEqual(['Alice Smith', 'Bob Jones']);
    for (const row of result) {
      expect(row.totalHours).toBe(0);
      expect(row.regularHours).toBe(0);
    }
  });

  it('includes department from the employee record', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, department: 'Engineering' });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

    const result = await getEmployeeHoursForPeriod();

    expect(result).toHaveLength(1);
    expect(result[0].department).toBe('Engineering');
  });

  // -------------------------------------------------------------------------
  // Punch ledger (punch_ledger) — the path that uses `lte` in the predicate
  // -------------------------------------------------------------------------

  it('accumulates ledger hours for the active employee correctly', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: null });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const sessions = [
      makeLedgerSession({
        employeeId: 10,
        clockIn:  '2026-04-15T08:00:00Z',
        clockOut: '2026-04-15T12:00:00Z', // 4 hours
      }),
      makeLedgerSession({
        id: 11,
        employeeId: 10,
        clockIn:  '2026-04-16T09:00:00Z',
        clockOut: '2026-04-16T14:00:00Z', // 5 hours
      }),
    ];

    // No timekeepingId means no legacy punch query; only ledger query runs.
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

    const result = await getEmployeeHoursForPeriod();

    expect(result).toHaveLength(1);
    expect(result[0].totalHours).toBeCloseTo(9, 5);
    expect(result[0].regularHours).toBeCloseTo(9, 5);
  });

  it('BREAK sessions are excluded from employee period hours', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: null });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const sessions = [
      makeLedgerSession({
        employeeId: 10,
        clockIn:  '2026-04-15T08:00:00Z',
        clockOut: '2026-04-15T12:00:00Z',
        laborClass: 'REGULAR', // 4 hours
      }),
      makeLedgerSession({
        id: 11,
        employeeId: 10,
        clockIn:  '2026-04-15T12:00:00Z',
        clockOut: '2026-04-15T12:30:00Z',
        laborClass: 'BREAK', // 0.5 hours — must be excluded
      }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

    const result = await getEmployeeHoursForPeriod();

    expect(result).toHaveLength(1);
    expect(result[0].totalHours).toBeCloseTo(4, 5);
  });

  it('employees not in the active list are excluded even if their sessions exist in the ledger', async () => {
    // Only epochEmployeeId=10 is active; session for epochEmployeeId=99 must be dropped
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: null });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const sessions = [
      makeLedgerSession({ employeeId: 99, clockIn: '2026-04-15T08:00:00Z', clockOut: '2026-04-15T16:00:00Z' }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

    const result = await getEmployeeHoursForPeriod();

    expect(result).toHaveLength(1);
    expect(result[0].totalHours).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Legacy punch path — uses `gte` + `lte` on punchedAt (the missing-import site)
  // -------------------------------------------------------------------------

  it('accumulates legacy punch hours for an employee with a timekeepingId', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: 5 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punches = [
      makePunch({ employeeId: 5, type: 'clock_in',  punchedAt: '2026-04-14T08:00:00Z' }),
      makePunch({ employeeId: 5, type: 'clock_out', punchedAt: '2026-04-14T16:00:00Z' }), // 8 h
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(punches) as ReturnType<typeof db.select>) // legacy
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);     // ledger

    const result = await getEmployeeHoursForPeriod();

    expect(result).toHaveLength(1);
    expect(result[0].totalHours).toBeCloseTo(8, 5);
    expect(result[0].regularHours).toBeCloseTo(8, 5);
  });

  it('legacy punch query passes lte predicate referencing rangeEnd to where()', async () => {
    // This test would fail if `lte` is not imported, because the where() argument
    // would be undefined or throw — exactly the original production bug.
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: 5 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const { chain: punchesChain, whereSpy } = makeSelectChainWithSpy([]);

    vi.mocked(db.select)
      .mockReturnValueOnce(punchesChain as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

    await getEmployeeHoursForPeriod();

    // where() must have been called
    expect(whereSpy).toHaveBeenCalledTimes(1);

    const predicate = whereSpy.mock.calls[0][0];
    expect(predicate).not.toBeUndefined();

    // The predicate is a drizzle SQL AST. Serializing it reveals the date values
    // embedded as ISO strings. The rangeEnd (PERIOD_END) must appear, confirming
    // that `lte(punchesTable.punchedAt, rangeEnd)` was actually constructed.
    const serialized = serializeWhereArg(predicate);
    expect(serialized).toContain(PERIOD_END.toISOString());
  });

  // -------------------------------------------------------------------------
  // Combined legacy + ledger
  // -------------------------------------------------------------------------

  it('combines legacy punch hours and ledger hours for the same employee', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: 5 });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    const punches = [
      makePunch({ employeeId: 5, type: 'clock_in',  punchedAt: '2026-04-14T08:00:00Z' }),
      makePunch({ employeeId: 5, type: 'clock_out', punchedAt: '2026-04-14T10:00:00Z' }), // 2 h
    ];
    const sessions = [
      makeLedgerSession({ employeeId: 10, clockIn: '2026-04-15T09:00:00Z', clockOut: '2026-04-15T12:00:00Z' }), // 3 h
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(punches) as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

    const result = await getEmployeeHoursForPeriod();

    expect(result).toHaveLength(1);
    expect(result[0].totalHours).toBeCloseTo(5, 5); // 2 legacy + 3 ledger
  });

  // -------------------------------------------------------------------------
  // Overtime cap
  // -------------------------------------------------------------------------

  it('regularHours is capped below totalHours when overtime is worked', async () => {
    const emp = makeEmployee({ epochEmployeeId: 10, timekeepingId: null });
    vi.mocked(listResolvedEmployees).mockResolvedValue([emp]);

    // Use explicit from/to so the cap is deterministic: exactly 7 days → 1 week → cap = 40 h
    // Session: Apr-13 00:00 → Apr-16 18:00 = 90 h total, capped at 40 regular h
    const from = new Date('2026-04-13T00:00:00Z');
    const to   = new Date('2026-04-19T00:00:00Z'); // 6 days diff → rangeDays=7 → numWeeks=1 → cap=40

    const sessions = [
      makeLedgerSession({
        employeeId: 10,
        clockIn:  '2026-04-13T00:00:00Z',
        clockOut: '2026-04-16T18:00:00Z', // 90 hours — well above the 40 h cap
      }),
    ];

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain(sessions) as ReturnType<typeof db.select>);

    const result = await getEmployeeHoursForPeriod(from, to);

    expect(result).toHaveLength(1);
    expect(result[0].totalHours).toBeCloseTo(90, 0);
    // regularHours is capped; must be strictly less than totalHours
    expect(result[0].regularHours).toBeLessThan(result[0].totalHours);
    expect(result[0].regularHours).toBeLessThanOrEqual(40);
  });

  // -------------------------------------------------------------------------
  // Result ordering
  // -------------------------------------------------------------------------

  it('results are sorted alphabetically by name', async () => {
    const alice = makeEmployee({ id: 1, timekeepingId: null, epochEmployeeId: 10, firstName: 'Alice', lastName: 'Smith' });
    const bob   = makeEmployee({ id: 2, timekeepingId: null, epochEmployeeId: 20, firstName: 'Bob',   lastName: 'Jones' });
    const carol = makeEmployee({ id: 3, timekeepingId: null, epochEmployeeId: 30, firstName: 'Carol', lastName: 'Adams' });
    vi.mocked(listResolvedEmployees).mockResolvedValue([bob, carol, alice]);

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as ReturnType<typeof db.select>);

    const result = await getEmployeeHoursForPeriod();

    expect(result.map((r) => r.name)).toEqual(['Alice Smith', 'Bob Jones', 'Carol Adams']);
  });
});
