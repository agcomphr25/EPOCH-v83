import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock('../db', () => ({
  db: { select: mockSelect },
}));

vi.mock('../schema', () => ({
  punchLedger: {
    employeeId: 'pl.employeeId',
    clockIn: 'pl.clockIn',
    clockOut: 'pl.clockOut',
  },
}));

vi.mock('../src/schema/timekeeping', () => ({
  punchesTable: {
    employeeId: 'pt.employeeId',
    punchedAt: 'pt.punchedAt',
  },
  timesheetsTable: {},
}));

vi.mock('../src/services/timekeeping/settings.service', () => ({
  getOrCreateSettings: vi.fn(),
}));

vi.mock('../src/lib/timekeepingEmployeeResolver', () => ({
  resolveByTimekeepingId: vi.fn(),
  listResolvedEmployees: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/services/timekeeping/audit.service', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

import { computeHoursForPeriod } from '../src/services/timekeeping/timesheets.service';
import { getOrCreateSettings } from '../src/services/timekeeping/settings.service';
import { resolveByTimekeepingId } from '../src/lib/timekeepingEmployeeResolver';

const DEFAULT_SETTINGS = {
  timezone: 'America/Chicago',
  overtimeThresholdDaily: 8,
  overtimeThresholdWeekly: 40,
  roundingRuleMinutes: 0,
};

function makeSelectChain(rows: unknown[]): { from: ReturnType<typeof vi.fn> } {
  const whereFn = vi.fn().mockResolvedValue(rows);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

function mockDbQueries(punches: unknown[], sessions: unknown[]): void {
  mockSelect
    .mockReturnValueOnce(makeSelectChain(punches))
    .mockReturnValueOnce(makeSelectChain(sessions));
}

function punch(type: string, isoDate: string) {
  return { type, punchedAt: new Date(isoDate) };
}

function ledgerSession(clockIn: string, clockOut: string | null, laborClass = 'WORK') {
  return {
    laborClass,
    clockIn: new Date(clockIn),
    clockOut: clockOut ? new Date(clockOut) : null,
    employeeId: 99,
  };
}

const EMPLOYEE_ID = 1;
const PERIOD_START = '2026-01-05';
const PERIOD_END = '2026-01-11';
const RESOLVED_EMPLOYEE = { epochEmployeeId: 99 };

describe('computeHoursForPeriod', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getOrCreateSettings).mockResolvedValue(
      DEFAULT_SETTINGS as Awaited<ReturnType<typeof getOrCreateSettings>>
    );
    vi.mocked(resolveByTimekeepingId).mockResolvedValue(
      RESOLVED_EMPLOYEE as Awaited<ReturnType<typeof resolveByTimekeepingId>>
    );
  });

  describe('employee with only legacy punches (no punch_ledger sessions)', () => {
    it('calculates regular hours for a single 8-hour day', async () => {
      mockDbQueries(
        [
          punch('clock_in', '2026-01-05T14:00:00Z'),
          punch('clock_out', '2026-01-05T22:00:00Z'),
        ],
        []
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(8);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
    });

    it('calculates daily overtime when a single day exceeds 8 hours', async () => {
      mockDbQueries(
        [
          punch('clock_in', '2026-01-05T13:00:00Z'),
          punch('clock_out', '2026-01-05T23:00:00Z'),
        ],
        []
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(10);
      expect(result.overtimeHours).toBe(2);
      expect(result.regularHours).toBe(8);
    });

    it('calculates hours across multiple days correctly', async () => {
      mockDbQueries(
        [
          punch('clock_in', '2026-01-05T14:00:00Z'),
          punch('clock_out', '2026-01-05T22:00:00Z'),
          punch('clock_in', '2026-01-06T14:00:00Z'),
          punch('clock_out', '2026-01-06T22:00:00Z'),
          punch('clock_in', '2026-01-07T14:00:00Z'),
          punch('clock_out', '2026-01-07T22:00:00Z'),
          punch('clock_in', '2026-01-08T14:00:00Z'),
          punch('clock_out', '2026-01-08T22:00:00Z'),
          punch('clock_in', '2026-01-09T14:00:00Z'),
          punch('clock_out', '2026-01-09T22:00:00Z'),
        ],
        []
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(40);
      expect(result.regularHours).toBe(40);
      expect(result.overtimeHours).toBe(0);
    });

    it('calculates weekly overtime when the week total exceeds 40 hours', async () => {
      mockDbQueries(
        [
          punch('clock_in', '2026-01-05T13:00:00Z'),
          punch('clock_out', '2026-01-05T22:00:00Z'),
          punch('clock_in', '2026-01-06T13:00:00Z'),
          punch('clock_out', '2026-01-06T22:00:00Z'),
          punch('clock_in', '2026-01-07T13:00:00Z'),
          punch('clock_out', '2026-01-07T22:00:00Z'),
          punch('clock_in', '2026-01-08T13:00:00Z'),
          punch('clock_out', '2026-01-08T22:00:00Z'),
          punch('clock_in', '2026-01-09T13:00:00Z'),
          punch('clock_out', '2026-01-09T22:00:00Z'),
        ],
        []
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(45);
      expect(result.overtimeHours).toBe(5);
      expect(result.regularHours).toBe(40);
    });

    it('returns zero hours when no punches exist', async () => {
      mockDbQueries([], []);

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(0);
      expect(result.regularHours).toBe(0);
      expect(result.overtimeHours).toBe(0);
    });
  });

  describe('employee with only punch_ledger (portal/kiosk) sessions', () => {
    it('calculates regular hours from a single 8-hour kiosk session', async () => {
      mockDbQueries(
        [],
        [ledgerSession('2026-01-05T14:00:00Z', '2026-01-05T22:00:00Z')]
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(8);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
    });

    it('calculates daily overtime when a kiosk session exceeds 8 hours in one day', async () => {
      mockDbQueries(
        [],
        [ledgerSession('2026-01-05T13:00:00Z', '2026-01-05T23:00:00Z')]
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(10);
      expect(result.overtimeHours).toBe(2);
      expect(result.regularHours).toBe(8);
    });

    it('skips sessions where laborClass is BREAK', async () => {
      mockDbQueries(
        [],
        [
          ledgerSession('2026-01-05T14:00:00Z', '2026-01-05T22:00:00Z'),
          ledgerSession('2026-01-05T17:00:00Z', '2026-01-05T17:30:00Z', 'BREAK'),
        ]
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(8);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
    });

    it('calculates weekly overtime from multiple kiosk sessions exceeding 40 hours', async () => {
      mockDbQueries(
        [],
        [
          ledgerSession('2026-01-05T13:00:00Z', '2026-01-05T22:00:00Z'),
          ledgerSession('2026-01-06T13:00:00Z', '2026-01-06T22:00:00Z'),
          ledgerSession('2026-01-07T13:00:00Z', '2026-01-07T22:00:00Z'),
          ledgerSession('2026-01-08T13:00:00Z', '2026-01-08T22:00:00Z'),
          ledgerSession('2026-01-09T13:00:00Z', '2026-01-09T22:00:00Z'),
        ]
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(45);
      expect(result.overtimeHours).toBe(5);
      expect(result.regularHours).toBe(40);
    });

    it('correctly splits a session that crosses midnight across two calendar days', async () => {
      mockDbQueries(
        [],
        [ledgerSession('2026-01-05T22:00:00Z', '2026-01-06T04:00:00Z')]
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(6);
      expect(result.regularHours).toBe(6);
      expect(result.overtimeHours).toBe(0);
    });

    it('returns zero hours when the employee has no resolvable epoch ID', async () => {
      vi.mocked(resolveByTimekeepingId).mockResolvedValue(null);
      mockDbQueries([], []);

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(0);
      expect(result.regularHours).toBe(0);
      expect(result.overtimeHours).toBe(0);
    });
  });

  describe('employee with both legacy punches and punch_ledger sessions', () => {
    it('sums hours from both sources into a single total', async () => {
      mockDbQueries(
        [
          punch('clock_in', '2026-01-05T14:00:00Z'),
          punch('clock_out', '2026-01-05T18:00:00Z'),
        ],
        [
          ledgerSession('2026-01-06T14:00:00Z', '2026-01-06T22:00:00Z'),
        ]
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(12);
      expect(result.regularHours).toBe(12);
      expect(result.overtimeHours).toBe(0);
    });

    it('accumulates hours from both sources on the same day before applying daily overtime', async () => {
      mockDbQueries(
        [
          punch('clock_in', '2026-01-05T13:00:00Z'),
          punch('clock_out', '2026-01-05T18:00:00Z'),
        ],
        [
          ledgerSession('2026-01-05T19:00:00Z', '2026-01-05T23:00:00Z'),
        ]
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(9);
      expect(result.overtimeHours).toBe(1);
      expect(result.regularHours).toBe(8);
    });

    it('applies weekly overtime based on the merged total from both sources', async () => {
      mockDbQueries(
        [
          punch('clock_in', '2026-01-05T14:00:00Z'),
          punch('clock_out', '2026-01-05T22:00:00Z'),
          punch('clock_in', '2026-01-06T14:00:00Z'),
          punch('clock_out', '2026-01-06T22:00:00Z'),
          punch('clock_in', '2026-01-07T14:00:00Z'),
          punch('clock_out', '2026-01-07T22:00:00Z'),
        ],
        [
          ledgerSession('2026-01-08T14:00:00Z', '2026-01-08T22:00:00Z'),
          ledgerSession('2026-01-09T14:00:00Z', '2026-01-09T22:00:00Z'),
          ledgerSession('2026-01-10T14:00:00Z', '2026-01-10T21:00:00Z'),
        ]
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(47);
      expect(result.overtimeHours).toBe(7);
      expect(result.regularHours).toBe(40);
    });

    it('only counts legacy punch hours when the employee has no resolvable epoch ID', async () => {
      vi.mocked(resolveByTimekeepingId).mockResolvedValue(null);
      mockDbQueries(
        [
          punch('clock_in', '2026-01-05T14:00:00Z'),
          punch('clock_out', '2026-01-05T22:00:00Z'),
        ],
        []
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(8);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
    });
  });
});
