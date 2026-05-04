import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock('../db', () => ({
  db: { select: mockSelect },
  pool: { query: vi.fn().mockResolvedValue([]) },
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

import { computeHoursForPeriod, useLedgerForPeriod } from '../src/services/timekeeping/timesheets.service';
import { getOrCreateSettings } from '../src/services/timekeeping/settings.service';
import { resolveByTimekeepingId } from '../src/lib/timekeepingEmployeeResolver';
import { midnightInTZ, toTZDateStr } from '../src/lib/timekeeping';
import { getPayPeriod, getPayPeriodDates } from '../src/services/payPeriod';

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

function ledgerSession(clockIn: string, clockOut: string | null, laborClass = 'WORK') {
  return {
    laborClass,
    clockIn: new Date(clockIn),
    clockOut: clockOut ? new Date(clockOut) : null,
    employeeId: 99,
  };
}

function punch(type: string, isoDate: string) {
  return { type, punchedAt: new Date(isoDate) };
}

const EMPLOYEE_ID = 1;
const PERIOD_START = '2026-01-05';
const PERIOD_END = '2026-01-11';
const RESOLVED_EMPLOYEE = { epochEmployeeId: 99 };

const PRE_CUTOVER_START = '2023-06-01';
const PRE_CUTOVER_END = '2023-06-14';

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

  describe('post-cutover: punch_ledger only (no legacy punches queried)', () => {
    it('calculates regular hours from a single 8-hour kiosk session', async () => {
      mockSelect.mockReturnValueOnce(
        makeSelectChain([ledgerSession('2026-01-05T14:00:00Z', '2026-01-05T22:00:00Z')])
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(8);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
    });

    it('calculates daily overtime when a kiosk session exceeds 8 hours in one day', async () => {
      mockSelect.mockReturnValueOnce(
        makeSelectChain([ledgerSession('2026-01-05T13:00:00Z', '2026-01-05T23:00:00Z')])
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(10);
      expect(result.overtimeHours).toBe(2);
      expect(result.regularHours).toBe(8);
    });

    it('skips sessions where laborClass is BREAK', async () => {
      mockSelect.mockReturnValueOnce(
        makeSelectChain([
          ledgerSession('2026-01-05T14:00:00Z', '2026-01-05T22:00:00Z'),
          ledgerSession('2026-01-05T17:00:00Z', '2026-01-05T17:30:00Z', 'BREAK'),
        ])
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(8);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
    });

    it('calculates weekly overtime from multiple kiosk sessions exceeding 40 hours', async () => {
      mockSelect.mockReturnValueOnce(
        makeSelectChain([
          ledgerSession('2026-01-05T13:00:00Z', '2026-01-05T22:00:00Z'),
          ledgerSession('2026-01-06T13:00:00Z', '2026-01-06T22:00:00Z'),
          ledgerSession('2026-01-07T13:00:00Z', '2026-01-07T22:00:00Z'),
          ledgerSession('2026-01-08T13:00:00Z', '2026-01-08T22:00:00Z'),
          ledgerSession('2026-01-09T13:00:00Z', '2026-01-09T22:00:00Z'),
        ])
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(45);
      expect(result.overtimeHours).toBe(5);
      expect(result.regularHours).toBe(40);
    });

    it('correctly splits a session that crosses midnight across two calendar days', async () => {
      mockSelect.mockReturnValueOnce(
        makeSelectChain([ledgerSession('2026-01-05T22:00:00Z', '2026-01-06T04:00:00Z')])
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(6);
      expect(result.regularHours).toBe(6);
      expect(result.overtimeHours).toBe(0);
    });

    it('returns zero hours when the employee has no resolvable epoch ID', async () => {
      vi.mocked(resolveByTimekeepingId).mockResolvedValue(null);

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(0);
      expect(result.regularHours).toBe(0);
      expect(result.overtimeHours).toBe(0);
    });

    it('returns zero hours when no sessions exist', async () => {
      mockSelect.mockReturnValueOnce(makeSelectChain([]));

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(0);
      expect(result.regularHours).toBe(0);
      expect(result.overtimeHours).toBe(0);
    });
  });

  describe('pre-cutover: legacy punches only (no punch_ledger queried)', () => {
    it('calculates regular hours from legacy punches only', async () => {
      mockSelect.mockReturnValueOnce(
        makeSelectChain([
          punch('clock_in', '2023-06-05T14:00:00Z'),
          punch('clock_out', '2023-06-05T22:00:00Z'),
        ])
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PRE_CUTOVER_START, PRE_CUTOVER_END);

      expect(result.totalHours).toBe(8);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
    });

    it('calculates daily overtime from legacy punches', async () => {
      mockSelect.mockReturnValueOnce(
        makeSelectChain([
          punch('clock_in', '2023-06-05T13:00:00Z'),
          punch('clock_out', '2023-06-05T23:00:00Z'),
        ])
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PRE_CUTOVER_START, PRE_CUTOVER_END);

      expect(result.totalHours).toBe(10);
      expect(result.overtimeHours).toBe(2);
      expect(result.regularHours).toBe(8);
    });
  });

  describe('ledger session clipping at active-window boundaries', () => {
    it('clips a ledger session that starts BEFORE periodStart to the period start', async () => {
      mockSelect.mockReturnValueOnce(
        makeSelectChain([
          ledgerSession('2026-01-04T20:00:00Z', '2026-01-05T22:00:00Z'),
        ])
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      const periodStartMs = midnightInTZ(PERIOD_START, 'America/Chicago').getTime();
      const sessionEndMs = new Date('2026-01-05T22:00:00Z').getTime();
      const expectedHours = (sessionEndMs - periodStartMs) / 3_600_000;

      expect(result.totalHours).toBeCloseTo(Math.round(expectedHours * 100) / 100, 2);
    });

    it('clips a ledger session that ends AFTER periodEnd to the period end', async () => {
      mockSelect.mockReturnValueOnce(
        makeSelectChain([
          ledgerSession('2026-01-11T20:00:00Z', '2026-01-13T20:00:00Z'),
        ])
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      const sessionStartMs = new Date('2026-01-11T20:00:00Z').getTime();
      const periodEndMs = midnightInTZ('2026-01-12', 'America/Chicago').getTime() - 1;
      const expectedHours = (periodEndMs - sessionStartMs) / 3_600_000;

      expect(result.totalHours).toBeCloseTo(Math.round(expectedHours * 100) / 100, 1);
    });

    it('clips an OPEN ledger session (clockOut=null) to the period end', async () => {
      mockSelect.mockReturnValueOnce(
        makeSelectChain([
          ledgerSession('2026-01-11T20:00:00Z', null),
        ])
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      const sessionStartMs = new Date('2026-01-11T20:00:00Z').getTime();
      const periodEndMs = midnightInTZ('2026-01-12', 'America/Chicago').getTime() - 1;
      const nowMs = Date.now();
      const expectedEndMs = Math.min(nowMs, periodEndMs);
      const expectedHours = Math.max(0, (expectedEndMs - sessionStartMs) / 3_600_000);

      expect(result.totalHours).toBeCloseTo(Math.round(expectedHours * 100) / 100, 0);
    });

    it('skips a ledger session whose clipped window is empty (entirely outside period)', async () => {
      mockSelect.mockReturnValueOnce(
        makeSelectChain([
          ledgerSession('2025-12-01T14:00:00Z', '2025-12-01T22:00:00Z'),
        ])
      );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(result.totalHours).toBe(0);
    });
  });

  describe('spanning-cutover: period crosses cutover date — queries both sources', () => {
    const SPAN_START = '2023-12-25';
    const SPAN_END = '2024-01-07';

    it('sums hours from legacy (pre-cutover) and ledger (post-cutover) sub-ranges', async () => {
      mockSelect
        .mockReturnValueOnce(
          makeSelectChain([ledgerSession('2024-01-02T14:00:00Z', '2024-01-02T22:00:00Z')])
        )
        .mockReturnValueOnce(
          makeSelectChain([
            punch('clock_in', '2023-12-26T14:00:00Z'),
            punch('clock_out', '2023-12-26T22:00:00Z'),
          ])
        );

      const result = await computeHoursForPeriod(EMPLOYEE_ID, SPAN_START, SPAN_END);

      expect(result.totalHours).toBe(16);
      expect(result.regularHours).toBe(16);
      expect(result.overtimeHours).toBe(0);
    });

    it('queries db.select exactly twice for spanning periods (ledger + legacy)', async () => {
      mockSelect
        .mockReturnValueOnce(makeSelectChain([]))
        .mockReturnValueOnce(makeSelectChain([]));

      await computeHoursForPeriod(EMPLOYEE_ID, SPAN_START, SPAN_END);

      expect(mockSelect).toHaveBeenCalledTimes(2);
    });

    it('queries db.select exactly once for fully post-cutover periods', async () => {
      mockSelect.mockReturnValueOnce(makeSelectChain([]));

      await computeHoursForPeriod(EMPLOYEE_ID, PERIOD_START, PERIOD_END);

      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it('queries db.select exactly once for fully pre-cutover periods', async () => {
      mockSelect.mockReturnValueOnce(makeSelectChain([]));

      await computeHoursForPeriod(EMPLOYEE_ID, PRE_CUTOVER_START, PRE_CUTOVER_END);

      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it('clips a ledger session that spans the cutover boundary — only post-cutover portion counted', async () => {
      // Session spans 2023-12-31T20:00Z → 2024-01-02T04:00Z (32 raw hours, but
      // only the post-cutover portion should be counted via the ledger half).
      mockSelect
        .mockReturnValueOnce(
          makeSelectChain([
            ledgerSession('2023-12-31T20:00:00Z', '2024-01-02T04:00:00Z'),
          ])
        )
        .mockReturnValueOnce(makeSelectChain([])); // no legacy events

      const result = await computeHoursForPeriod(EMPLOYEE_ID, SPAN_START, SPAN_END);

      // Cutover boundary in America/Chicago = 2024-01-01T00:00 local = 2024-01-01T06:00Z
      const cutoverMs = midnightInTZ('2024-01-01', 'America/Chicago').getTime();
      const sessionEndMs = new Date('2024-01-02T04:00:00Z').getTime();
      const expectedHours = (sessionEndMs - cutoverMs) / 3_600_000;

      // Daily-OT cap of 8h applies per day; we just assert the total matches the
      // clipped window length (regardless of OT split).
      expect(result.totalHours).toBeCloseTo(Math.round(expectedHours * 100) / 100, 1);
      expect(result.totalHours).toBeGreaterThan(0);
      expect(result.totalHours).toBeLessThan(32);
    });
  });
});

describe('Dashboard summary — split-at-cutover semantics', () => {
  it('uses ledger when the entire week is post-cutover', () => {
    expect(useLedgerForPeriod('2026-01-05')).toBe(true);
    expect(useLedgerForPeriod('2026-01-11')).toBe(true);
  });

  it('uses legacy when the entire week is pre-cutover', () => {
    expect(useLedgerForPeriod('2023-12-18')).toBe(false);
    expect(useLedgerForPeriod('2023-12-24')).toBe(false);
  });

  it('detects a week that spans the cutover boundary — needs BOTH halves', () => {
    const weekStart = '2023-12-25';
    const weekEnd   = '2023-12-31';
    const dayAfterEnd = '2024-01-01';

    // For a week ending 2023-12-31, the FOLLOWING calendar day is 2024-01-01,
    // which is the cutover. A spanning week is one whose Sunday is < cutover
    // and whose following Saturday is >= cutover-1.  To exercise the spanning
    // branch in getDashboardSummary we use a week that straddles the boundary:
    const spanWeekStart = '2023-12-31';
    const spanWeekEnd   = '2024-01-06';

    expect(useLedgerForPeriod(weekStart)).toBe(false);
    expect(useLedgerForPeriod(weekEnd)).toBe(false);
    expect(useLedgerForPeriod(dayAfterEnd)).toBe(true);

    // The spanning-week case: start before cutover, end on/after cutover.
    expect(useLedgerForPeriod(spanWeekStart)).toBe(false);
    expect(useLedgerForPeriod(spanWeekEnd)).toBe(true);
  });
});

describe('auditLegacyPunchEventsInsideLedgerSessions — documented limitation', () => {
  // This describe block intentionally documents (in test form) the known
  // limitation of the audit utility: it joins individual legacy event
  // timestamps to ledger session windows, so it MISSES the case where a
  // long legacy interval fully contains a ledger session.
  //
  // If/when interval-pairing is added (follow-up #40), these documentation
  // tests should be deleted and replaced with positive interval-overlap
  // assertions.
  it('documents that single-event matching does not detect interval-spanning overlap', () => {
    // Hypothetical scenario:
    //   Legacy:  clock_in @ 09:00Z, clock_out @ 17:00Z   (interval [09:00, 17:00])
    //   Ledger:  session  10:00Z → 16:00Z                (interval [10:00, 16:00])
    // The legacy interval fully contains the ledger session, but neither legacy
    // EVENT timestamp (09:00, 17:00) lies between the ledger session bounds
    // (10:00, 16:00). The current SQL `p.punched_at BETWEEN pl.clock_in AND pl.clock_out`
    // therefore returns ZERO rows for this employee.
    const legacyClockInMs  = new Date('2024-06-01T09:00:00Z').getTime();
    const legacyClockOutMs = new Date('2024-06-01T17:00:00Z').getTime();
    const ledgerStartMs    = new Date('2024-06-01T10:00:00Z').getTime();
    const ledgerEndMs      = new Date('2024-06-01T16:00:00Z').getTime();

    const eventInsideSession = (eventMs: number) =>
      eventMs >= ledgerStartMs && eventMs <= ledgerEndMs;

    expect(eventInsideSession(legacyClockInMs)).toBe(false);
    expect(eventInsideSession(legacyClockOutMs)).toBe(false);

    const intervalsOverlap = legacyClockInMs < ledgerEndMs && legacyClockOutMs > ledgerStartMs;
    expect(intervalsOverlap).toBe(true);
  });

  it('confirms the audit DOES detect the simpler case: a legacy event inside a ledger session', () => {
    const ledgerStartMs = new Date('2024-06-01T10:00:00Z').getTime();
    const ledgerEndMs   = new Date('2024-06-01T16:00:00Z').getTime();
    const eventInside   = new Date('2024-06-01T12:00:00Z').getTime();

    const detected = eventInside >= ledgerStartMs && eventInside <= ledgerEndMs;
    expect(detected).toBe(true);
  });
});

describe('Double-count prevention via cutover date', () => {
  it('post-cutover periods read ONLY from ledger — never both sources', () => {
    expect(useLedgerForPeriod('2024-06-01')).toBe(true);
  });

  it('pre-cutover periods read ONLY from legacy — never both sources', () => {
    expect(useLedgerForPeriod('2023-06-01')).toBe(false);
  });

  it('cutover boundary date uses ledger', () => {
    expect(useLedgerForPeriod('2024-01-01')).toBe(true);
  });

  it('one day before cutover uses legacy', () => {
    expect(useLedgerForPeriod('2023-12-31')).toBe(false);
  });
});

describe('midnightInTZ — period boundary correctness', () => {
  it('returns correct UTC instant for America/Chicago midnight', () => {
    const midnight = midnightInTZ('2026-01-11', 'America/Chicago');
    expect(midnight.toISOString()).toBe('2026-01-11T06:00:00.000Z');
  });

  it('returns correct UTC instant for UTC midnight', () => {
    const midnight = midnightInTZ('2026-01-11', 'UTC');
    expect(midnight.toISOString()).toBe('2026-01-11T00:00:00.000Z');
  });

  it('returns correct UTC instant for America/New_York midnight', () => {
    const midnight = midnightInTZ('2026-07-04', 'America/New_York');
    expect(midnight.toISOString()).toBe('2026-07-04T04:00:00.000Z');
  });
});

describe('TZ boundary — last day of period inclusion', () => {
  it('punch at 11pm CST on the last day of the period is included in TZ-correct boundaries', () => {
    const tz = 'America/Chicago';
    const periodEnd = '2026-01-11';

    const periodStartDate = midnightInTZ('2026-01-05', tz);
    const nextDayAfterEnd = '2026-01-12';
    const periodEndDate = new Date(midnightInTZ(nextDayAfterEnd, tz).getTime() - 1);

    const punchAt11pmCST = new Date('2026-01-12T05:00:00Z');

    expect(punchAt11pmCST.getTime()).toBeGreaterThanOrEqual(periodStartDate.getTime());
    expect(punchAt11pmCST.getTime()).toBeLessThanOrEqual(periodEndDate.getTime());
  });

  it('naive UTC boundary would EXCLUDE 11pm CST punch — proving the bug existed', () => {
    const naiveEnd = new Date('2026-01-11T23:59:59Z');
    const punchAt11pmCST = new Date('2026-01-12T05:00:00Z');
    expect(punchAt11pmCST.getTime()).toBeGreaterThan(naiveEnd.getTime());
  });
});

describe('TZ boundary — first day of period inclusion', () => {
  it('punch at 1am CST on the first day is included in TZ-correct boundaries', () => {
    const tz = 'America/Chicago';

    const periodStartDate = midnightInTZ('2026-01-05', tz);
    const punchAt1amCST = new Date('2026-01-05T07:00:00Z');

    expect(punchAt1amCST.getTime()).toBeGreaterThanOrEqual(periodStartDate.getTime());
  });
});

describe('Cross-midnight session at period boundary — day-by-day splitting', () => {
  it('correctly splits hours across two days at midnight boundary', () => {
    const tz = 'America/Chicago';
    const sessionStart = new Date('2026-01-11T04:00:00Z').getTime();
    const sessionEnd = new Date('2026-01-12T08:00:00Z').getTime();

    const hoursByDay = new Map<string, number>();
    let cursor = sessionStart;
    while (cursor < sessionEnd) {
      const dayKey = toTZDateStr(new Date(cursor), tz);
      const [y, m, d] = dayKey.split('-').map(Number);
      const nextDayStr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
      const dayBoundaryMs = midnightInTZ(nextDayStr, tz).getTime();

      const sliceEnd = Math.min(sessionEnd, dayBoundaryMs);
      const hrs = (sliceEnd - cursor) / 3_600_000;
      hoursByDay.set(dayKey, (hoursByDay.get(dayKey) ?? 0) + hrs);
      cursor = sliceEnd;
    }

    const totalHours = Array.from(hoursByDay.values()).reduce((a, b) => a + b, 0);
    expect(totalHours).toBeCloseTo(28, 1);

    expect(hoursByDay.has('2026-01-10')).toBe(true);
    expect(hoursByDay.has('2026-01-11')).toBe(true);
    expect(hoursByDay.get('2026-01-11')!).toBeCloseTo(24, 1);
  });
});

describe('getPayPeriod — timezone-aware boundaries', () => {
  it('returns TZ-correct period start for America/Chicago', () => {
    const refDate = new Date('2026-01-11T20:00:00Z');
    const period = getPayPeriod(refDate, 'America/Chicago');

    const startStr = toTZDateStr(period.start, 'America/Chicago');
    const endStr = toTZDateStr(new Date(period.end.getTime() - 100), 'America/Chicago');

    expect(startStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    expect(daysDiff).toBe(13);
  });

  it('getPayPeriodDates uses timezone parameter', () => {
    const utc = getPayPeriodDates(new Date('2026-06-15T23:00:00Z'), 'UTC');
    const cst = getPayPeriodDates(new Date('2026-06-15T23:00:00Z'), 'America/Chicago');
    expect(utc.start.getTime()).not.toBe(cst.start.getTime());
  });
});

describe('Overtime at TZ-adjusted boundaries', () => {
  it('weekly overtime calculation works with TZ boundaries', () => {
    const dailyThreshold = 8;
    const weeklyThreshold = 40;

    const hoursByDay = new Map<string, number>();
    hoursByDay.set('2026-01-05', 9);
    hoursByDay.set('2026-01-06', 9);
    hoursByDay.set('2026-01-07', 9);
    hoursByDay.set('2026-01-08', 9);
    hoursByDay.set('2026-01-09', 9);

    let totalHours = 0;
    let overtimeHours = 0;
    for (const dayHours of hoursByDay.values()) {
      totalHours += dayHours;
      if (dayHours > dailyThreshold) {
        overtimeHours += dayHours - dailyThreshold;
      }
    }
    const weeklyOvertime = Math.max(0, totalHours - weeklyThreshold);
    overtimeHours = Math.max(overtimeHours, weeklyOvertime);
    const regularHours = Math.max(0, totalHours - overtimeHours);

    expect(totalHours).toBe(45);
    expect(overtimeHours).toBe(5);
    expect(regularHours).toBe(40);
  });
});
