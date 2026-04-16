import { describe, it, expect } from 'vitest';
import {
  sumLaborHoursFromEntries,
  collectUniqueDepartments,
  extractQuotedLaborFromLineItems,
  computeLaborVariance,
  computeActualLeadTimeDays,
  computeScheduleVarianceDays,
  determineOverrunFlag,
} from '../src/helpers/quoteFeedbackHelper';

// ---------------------------------------------------------------------------
// sumLaborHoursFromEntries
// ---------------------------------------------------------------------------

describe('sumLaborHoursFromEntries', () => {
  it('returns 0 for an empty entry list', () => {
    expect(sumLaborHoursFromEntries([])).toBe(0);
  });

  it('sums hours across multiple completed entries', () => {
    const entries = [
      { clockIn: '2026-04-01T08:00:00Z', clockOut: '2026-04-01T10:00:00Z' },
      { clockIn: '2026-04-01T12:00:00Z', clockOut: '2026-04-01T14:30:00Z' },
    ];
    expect(sumLaborHoursFromEntries(entries)).toBe(4.5);
  });

  it('ignores entries where clockOut is null', () => {
    const entries = [
      { clockIn: '2026-04-01T08:00:00Z', clockOut: null },
      { clockIn: '2026-04-01T12:00:00Z', clockOut: '2026-04-01T14:00:00Z' },
    ];
    expect(sumLaborHoursFromEntries(entries)).toBe(2);
  });

  it('ignores entries where clockIn is null', () => {
    const entries = [
      { clockIn: null, clockOut: '2026-04-01T10:00:00Z' },
      { clockIn: '2026-04-01T12:00:00Z', clockOut: '2026-04-01T13:00:00Z' },
    ];
    expect(sumLaborHoursFromEntries(entries)).toBe(1);
  });

  it('ignores entries with negative duration (clockOut before clockIn)', () => {
    const entries = [
      { clockIn: '2026-04-01T10:00:00Z', clockOut: '2026-04-01T08:00:00Z' },
      { clockIn: '2026-04-01T12:00:00Z', clockOut: '2026-04-01T14:00:00Z' },
    ];
    expect(sumLaborHoursFromEntries(entries)).toBe(2);
  });

  it('rounds result to two decimal places', () => {
    const entries = [
      { clockIn: '2026-04-01T08:00:00Z', clockOut: '2026-04-01T09:20:00Z' },
    ];
    expect(sumLaborHoursFromEntries(entries)).toBe(1.33);
  });

  it('works with Date objects as well as ISO strings', () => {
    const clockIn = new Date('2026-04-01T08:00:00Z');
    const clockOut = new Date('2026-04-01T10:00:00Z');
    expect(sumLaborHoursFromEntries([{ clockIn, clockOut }])).toBe(2);
  });

  it('returns 0 when all entries have both nulls', () => {
    const entries = [
      { clockIn: null, clockOut: null },
      { clockIn: null, clockOut: null },
    ];
    expect(sumLaborHoursFromEntries(entries)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// collectUniqueDepartments
// ---------------------------------------------------------------------------

describe('collectUniqueDepartments', () => {
  it('returns empty array for empty input', () => {
    expect(collectUniqueDepartments([])).toEqual([]);
  });

  it('returns sorted unique department names', () => {
    const entries = [
      { department: 'WELD' },
      { department: 'CNC' },
      { department: 'WELD' },
      { department: 'ASSEMBLY' },
    ];
    expect(collectUniqueDepartments(entries)).toEqual(['ASSEMBLY', 'CNC', 'WELD']);
  });

  it('skips null department values', () => {
    const entries = [
      { department: null },
      { department: 'PAINT' },
      { department: null },
    ];
    expect(collectUniqueDepartments(entries)).toEqual(['PAINT']);
  });

  it('skips undefined department values', () => {
    const entries = [{ department: undefined }, { department: 'LAYUP' }];
    expect(collectUniqueDepartments(entries)).toEqual(['LAYUP']);
  });

  it('returns empty array when all departments are null', () => {
    const entries = [{ department: null }, { department: null }];
    expect(collectUniqueDepartments(entries)).toEqual([]);
  });

  it('deduplicates case-sensitively (preserves original casing)', () => {
    const entries = [{ department: 'Weld' }, { department: 'WELD' }];
    const result = collectUniqueDepartments(entries);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// extractQuotedLaborFromLineItems
// ---------------------------------------------------------------------------

describe('extractQuotedLaborFromLineItems', () => {
  it('returns null hours and "none" source for an empty list', () => {
    expect(extractQuotedLaborFromLineItems([])).toEqual({ hours: null, source: 'none' });
  });

  it('matches "labor" keyword and sums quantities', () => {
    const items = [
      { description: 'Direct Labor', quantity: 10 },
      { description: 'Material', quantity: 5 },
    ];
    const result = extractQuotedLaborFromLineItems(items);
    expect(result).toEqual({ hours: 10, source: 'line_items' });
  });

  it('matches "assembly" keyword', () => {
    const items = [{ description: 'Assembly work', quantity: 8 }];
    expect(extractQuotedLaborFromLineItems(items)).toEqual({ hours: 8, source: 'line_items' });
  });

  it('matches "machining" keyword', () => {
    const items = [{ description: 'CNC Machining', quantity: 12.5 }];
    expect(extractQuotedLaborFromLineItems(items)).toEqual({ hours: 12.5, source: 'line_items' });
  });

  it('matches "welding" keyword', () => {
    const items = [{ description: 'Welding operations', quantity: 4 }];
    expect(extractQuotedLaborFromLineItems(items)).toEqual({ hours: 4, source: 'line_items' });
  });

  it('matches "engineering" keyword', () => {
    const items = [{ description: 'Engineering time', quantity: 20 }];
    expect(extractQuotedLaborFromLineItems(items)).toEqual({ hours: 20, source: 'line_items' });
  });

  it('is case-insensitive for keyword matching', () => {
    const items = [{ description: 'LABOR hours', quantity: 6 }];
    expect(extractQuotedLaborFromLineItems(items)).toEqual({ hours: 6, source: 'line_items' });
  });

  it('returns null hours when no item descriptions match labor keywords', () => {
    const items = [
      { description: 'Raw material', quantity: 10 },
      { description: 'Shipping', quantity: 1 },
    ];
    expect(extractQuotedLaborFromLineItems(items)).toEqual({ hours: null, source: 'none' });
  });

  it('returns null hours when labor items sum to zero', () => {
    const items = [{ description: 'Labor', quantity: 0 }];
    expect(extractQuotedLaborFromLineItems(items)).toEqual({ hours: null, source: 'none' });
  });

  it('returns null hours when quantity is null on labor items', () => {
    const items = [{ description: 'Labor', quantity: null }];
    expect(extractQuotedLaborFromLineItems(items)).toEqual({ hours: null, source: 'none' });
  });

  it('skips items with null description', () => {
    const items = [{ description: null, quantity: 10 }];
    expect(extractQuotedLaborFromLineItems(items)).toEqual({ hours: null, source: 'none' });
  });

  it('sums multiple matching labor line items', () => {
    const items = [
      { description: 'Labor - setup', quantity: 4 },
      { description: 'Welding labor', quantity: 8 },
      { description: 'Material cost', quantity: 100 },
    ];
    expect(extractQuotedLaborFromLineItems(items)).toEqual({ hours: 12, source: 'line_items' });
  });

  it('rounds to two decimal places', () => {
    const items = [{ description: 'Labor', quantity: 1.336 }];
    const result = extractQuotedLaborFromLineItems(items);
    expect(result.hours).toBe(1.34);
  });
});

// ---------------------------------------------------------------------------
// computeLaborVariance
// ---------------------------------------------------------------------------

describe('computeLaborVariance', () => {
  it('returns null for both values when quoted is null', () => {
    expect(computeLaborVariance(null, 10)).toEqual({
      laborHoursVariance: null,
      laborHoursVariancePct: null,
    });
  });

  it('returns null for both values when actual is null', () => {
    expect(computeLaborVariance(10, null)).toEqual({
      laborHoursVariance: null,
      laborHoursVariancePct: null,
    });
  });

  it('returns null for both values when both are null', () => {
    expect(computeLaborVariance(null, null)).toEqual({
      laborHoursVariance: null,
      laborHoursVariancePct: null,
    });
  });

  it('computes a positive variance when actual exceeds quoted', () => {
    const result = computeLaborVariance(10, 15);
    expect(result.laborHoursVariance).toBe(5);
    expect(result.laborHoursVariancePct).toBe(50);
  });

  it('computes a negative variance when actual is under quoted', () => {
    const result = computeLaborVariance(20, 15);
    expect(result.laborHoursVariance).toBe(-5);
    expect(result.laborHoursVariancePct).toBe(-25);
  });

  it('computes zero variance when actual equals quoted', () => {
    const result = computeLaborVariance(10, 10);
    expect(result.laborHoursVariance).toBe(0);
    expect(result.laborHoursVariancePct).toBe(0);
  });

  it('returns null percentage when quoted hours is zero (division by zero guard)', () => {
    const result = computeLaborVariance(0, 5);
    expect(result.laborHoursVariance).toBe(5);
    expect(result.laborHoursVariancePct).toBeNull();
  });

  it('rounds variance and percentage to two decimal places', () => {
    const result = computeLaborVariance(3, 4);
    expect(result.laborHoursVariance).toBe(1);
    expect(result.laborHoursVariancePct).toBeCloseTo(33.33, 1);
  });
});

// ---------------------------------------------------------------------------
// computeActualLeadTimeDays
// ---------------------------------------------------------------------------

describe('computeActualLeadTimeDays', () => {
  it('returns null when projectCreatedAt is null', () => {
    expect(computeActualLeadTimeDays(null, '2026-04-10', null, [])).toBeNull();
  });

  it('uses actualShipDate as the primary source (priority 1)', () => {
    const result = computeActualLeadTimeDays(
      '2026-01-01T00:00:00Z',
      '2026-01-31T00:00:00Z',
      '2026-02-15T00:00:00Z',
      []
    );
    expect(result).toBe(30);
  });

  it('falls back to closingApprovedAt when actualShipDate is missing (priority 2)', () => {
    const result = computeActualLeadTimeDays(
      '2026-01-01T00:00:00Z',
      null,
      '2026-01-21T00:00:00Z',
      []
    );
    expect(result).toBe(20);
  });

  it('falls back to WAD date span when ship/closing dates are missing (priority 3)', () => {
    const wads = [
      { startDate: '2026-01-05', dueDate: '2026-01-25' },
      { startDate: '2026-01-10', dueDate: '2026-02-04' },
    ];
    const result = computeActualLeadTimeDays('2026-01-01T00:00:00Z', null, null, wads);
    expect(result).toBe(30);
  });

  it('returns null when all fallbacks are unavailable', () => {
    expect(computeActualLeadTimeDays('2026-01-01T00:00:00Z', null, null, [])).toBeNull();
  });

  it('returns null when WADs have no startDate or dueDate', () => {
    const wads = [{ startDate: null, dueDate: null }];
    expect(computeActualLeadTimeDays('2026-01-01T00:00:00Z', null, null, wads)).toBeNull();
  });

  it('computes a single-day lead time correctly', () => {
    const result = computeActualLeadTimeDays(
      '2026-04-01T00:00:00Z',
      '2026-04-02T00:00:00Z',
      null,
      []
    );
    expect(result).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeScheduleVarianceDays
// ---------------------------------------------------------------------------

describe('computeScheduleVarianceDays', () => {
  it('returns null when neither quoted+actual nor ship dates are available', () => {
    expect(computeScheduleVarianceDays(null, null, null, null)).toBeNull();
  });

  it('computes variance from quoted and actual lead times', () => {
    expect(computeScheduleVarianceDays(30, 45, null, null)).toBe(15);
  });

  it('computes negative variance when finished ahead of schedule', () => {
    expect(computeScheduleVarianceDays(30, 20, null, null)).toBe(-10);
  });

  it('returns zero when actual equals quoted lead time', () => {
    expect(computeScheduleVarianceDays(30, 30, null, null)).toBe(0);
  });

  it('falls back to ship date comparison when quoted lead time is null', () => {
    const result = computeScheduleVarianceDays(
      null,
      null,
      '2026-04-01',
      '2026-04-11'
    );
    expect(result).toBe(10);
  });

  it('returns negative fallback when shipped before target', () => {
    const result = computeScheduleVarianceDays(
      null,
      null,
      '2026-04-15',
      '2026-04-10'
    );
    expect(result).toBe(-5);
  });

  it('returns null when only quotedLeadTimeDays is present but actualLeadTimeDays is null', () => {
    expect(computeScheduleVarianceDays(30, null, null, null)).toBeNull();
  });

  it('returns null when only actualLeadTimeDays is present but quoted is null and no ship dates', () => {
    expect(computeScheduleVarianceDays(null, 45, null, null)).toBeNull();
  });

  it('prefers lead-time comparison over ship-date fallback', () => {
    const result = computeScheduleVarianceDays(
      30,
      35,
      '2026-04-01',
      '2026-04-20'
    );
    expect(result).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// determineOverrunFlag
// ---------------------------------------------------------------------------

describe('determineOverrunFlag', () => {
  it('returns null when both variances are null', () => {
    expect(determineOverrunFlag(null, null)).toBeNull();
  });

  it('returns true when labor hours variance is positive', () => {
    expect(determineOverrunFlag(5, null)).toBe(true);
  });

  it('returns true when schedule variance is positive', () => {
    expect(determineOverrunFlag(null, 3)).toBe(true);
  });

  it('returns true when both variances are positive', () => {
    expect(determineOverrunFlag(5, 3)).toBe(true);
  });

  it('returns false when labor variance is exactly zero and schedule variance is null', () => {
    expect(determineOverrunFlag(0, null)).toBe(false);
  });

  it('returns false when schedule variance is exactly zero and labor variance is null', () => {
    expect(determineOverrunFlag(null, 0)).toBe(false);
  });

  it('returns false when labor variance is negative (under budget)', () => {
    expect(determineOverrunFlag(-2, null)).toBe(false);
  });

  it('returns false when schedule variance is negative (ahead of schedule)', () => {
    expect(determineOverrunFlag(null, -5)).toBe(false);
  });

  it('returns false when both variances are negative', () => {
    expect(determineOverrunFlag(-2, -3)).toBe(false);
  });

  it('returns true when labor is overrun but schedule is ahead', () => {
    expect(determineOverrunFlag(10, -5)).toBe(true);
  });

  it('returns true when schedule is overrun but labor is under', () => {
    expect(determineOverrunFlag(-2, 7)).toBe(true);
  });
});
