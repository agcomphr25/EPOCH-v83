/**
 * Unit tests for the pay-period clipping math.
 *
 * clipEntryHours / buildChargeCodeSummary are the canonical implementation of
 * the charge-code summary logic.  The admin route
 * (server/src/routes/timekeeping.ts) delegates to buildChargeCodeSummary, so
 * these tests cover the production code path directly.
 *
 * Semantics:
 *   - Only completed entries (clock_out NOT NULL) contribute to hours.
 *   - Completed entries are clipped to [windowStart, windowEnd].
 *   - Open entries set inProgress=true and contribute 0 hours.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { clipEntryHours, buildChargeCodeSummary, type ClockEntry } from '../src/services/payPeriodClipping';

// Shared pay-period window
// Mon Apr 7 00:00:00 UTC  →  Sun Apr 20 23:59:59 UTC
const WINDOW_START = new Date('2026-04-07T00:00:00.000Z');
const WINDOW_END   = new Date('2026-04-20T23:59:59.000Z');

const d = (iso: string) => new Date(iso);

// ── clipEntryHours: fully-inside entries ─────────────────────────────────────

describe('clipEntryHours – entry fully inside the window', () => {
  it('returns exact hours for a clean 8-hour shift', () => {
    expect(clipEntryHours(
      d('2026-04-10T08:00:00Z'), d('2026-04-10T16:00:00Z'),
      WINDOW_START, WINDOW_END,
    )).toBeCloseTo(8, 6);
  });

  it('returns exact hours for a 1-hour shift', () => {
    expect(clipEntryHours(
      d('2026-04-15T10:00:00Z'), d('2026-04-15T11:00:00Z'),
      WINDOW_START, WINDOW_END,
    )).toBeCloseTo(1, 6);
  });

  it('returns fractional hours for a 90-minute shift', () => {
    expect(clipEntryHours(
      d('2026-04-12T09:00:00Z'), d('2026-04-12T10:30:00Z'),
      WINDOW_START, WINDOW_END,
    )).toBeCloseTo(1.5, 6);
  });
});

// ── clipEntryHours: leading-edge clipping ────────────────────────────────────

describe('clipEntryHours – entry starts before the window (leading clip)', () => {
  it('clips a shift that began 2 hours before the window start', () => {
    // clock_in 22:00 Apr 6, clock_out 04:00 Apr 7 = 6 h total; only 4 h inside
    expect(clipEntryHours(
      d('2026-04-06T22:00:00Z'), d('2026-04-07T04:00:00Z'),
      WINDOW_START, WINDOW_END,
    )).toBeCloseTo(4, 6);
  });

  it('clips correctly when only 30 minutes of a long shift falls inside the window', () => {
    expect(clipEntryHours(
      d('2026-04-06T17:30:00Z'), d('2026-04-07T00:30:00Z'),
      WINDOW_START, WINDOW_END,
    )).toBeCloseTo(0.5, 6);
  });

  it('returns 0 when the entry ends exactly at the window start (no overlap)', () => {
    expect(clipEntryHours(
      d('2026-04-06T20:00:00Z'), d('2026-04-07T00:00:00Z'),
      WINDOW_START, WINDOW_END,
    )).toBe(0);
  });

  it('returns 0 when the entry ends before the window start', () => {
    expect(clipEntryHours(
      d('2026-04-05T08:00:00Z'), d('2026-04-06T17:00:00Z'),
      WINDOW_START, WINDOW_END,
    )).toBe(0);
  });

  it('clips a shift that started exactly at the window start to the full duration', () => {
    expect(clipEntryHours(
      d('2026-04-07T00:00:00Z'), d('2026-04-07T08:00:00Z'),
      WINDOW_START, WINDOW_END,
    )).toBeCloseTo(8, 6);
  });
});

// ── clipEntryHours: trailing-edge clipping ───────────────────────────────────

describe('clipEntryHours – entry ends after the window (trailing clip)', () => {
  it('clips a shift that runs 3 hours past the window end', () => {
    const hours = clipEntryHours(
      d('2026-04-20T22:00:00Z'), d('2026-04-21T03:00:00Z'),
      WINDOW_START, WINDOW_END,
    );
    const expectedMs = WINDOW_END.getTime() - d('2026-04-20T22:00:00Z').getTime();
    expect(hours).toBeCloseTo(expectedMs / (1000 * 3600), 6);
  });

  it('clips correctly when only 15 minutes of a shift falls inside the window', () => {
    const clockIn = d('2026-04-20T23:44:59Z');
    const hours = clipEntryHours(clockIn, d('2026-04-21T02:00:00Z'), WINDOW_START, WINDOW_END);
    const expectedMs = WINDOW_END.getTime() - clockIn.getTime();
    expect(hours).toBeCloseTo(expectedMs / (1000 * 3600), 6);
  });

  it('returns 0 when the entry starts exactly at the window end', () => {
    expect(clipEntryHours(
      d('2026-04-20T23:59:59Z'), d('2026-04-21T08:00:00Z'),
      WINDOW_START, WINDOW_END,
    )).toBe(0);
  });

  it('returns 0 when the entry starts after the window end', () => {
    expect(clipEntryHours(
      d('2026-04-21T08:00:00Z'), d('2026-04-21T16:00:00Z'),
      WINDOW_START, WINDOW_END,
    )).toBe(0);
  });
});

// ── clipEntryHours: entry spans the entire window ────────────────────────────

describe('clipEntryHours – entry spans the entire window', () => {
  it('returns exactly the window duration', () => {
    const windowMs = WINDOW_END.getTime() - WINDOW_START.getTime();
    const hours = clipEntryHours(
      d('2026-04-01T00:00:00Z'), d('2026-04-30T00:00:00Z'),
      WINDOW_START, WINDOW_END,
    );
    expect(hours).toBeCloseTo(windowMs / (1000 * 3600), 6);
  });
});

// ── clipEntryHours: degenerate entries ───────────────────────────────────────

describe('clipEntryHours – degenerate entries', () => {
  it('returns 0 for a zero-duration entry (clock_in === clock_out)', () => {
    const t = d('2026-04-10T12:00:00Z');
    expect(clipEntryHours(t, t, WINDOW_START, WINDOW_END)).toBe(0);
  });

  it('returns 0 for an inverted entry (clock_out before clock_in)', () => {
    expect(clipEntryHours(
      d('2026-04-10T16:00:00Z'), d('2026-04-10T08:00:00Z'),
      WINDOW_START, WINDOW_END,
    )).toBe(0);
  });
});

// ── buildChargeCodeSummary: out-of-order / malformed entries ─────────────────

describe('buildChargeCodeSummary – out-of-order / malformed entries', () => {
  it('returns 0 hours (not negative) for an inverted entry where clock_out is before clock_in', () => {
    const entries: ClockEntry[] = [
      { chargeCode: 'WO-INV', clockIn: d('2026-04-10T16:00:00Z'), clockOut: d('2026-04-10T08:00:00Z') },
    ];
    const [s] = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    expect(s.hours).toBe(0);
    expect(s.hours).toBeGreaterThanOrEqual(0);
  });

  it('does not let an inverted entry reduce hours below zero when mixed with a valid entry on the same charge code', () => {
    const entries: ClockEntry[] = [
      { chargeCode: 'WO-MIX', clockIn: d('2026-04-08T08:00:00Z'), clockOut: d('2026-04-08T16:00:00Z') }, // 8 h
      { chargeCode: 'WO-MIX', clockIn: d('2026-04-10T16:00:00Z'), clockOut: d('2026-04-10T08:00:00Z') }, // inverted
    ];
    const [s] = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    expect(s.hours).toBeCloseTo(8, 6);
    expect(s.hours).toBeGreaterThanOrEqual(0);
  });
});

// ── buildChargeCodeSummary: basic aggregation ────────────────────────────────

describe('buildChargeCodeSummary – basic aggregation', () => {
  it('returns an empty array for an empty entry list', () => {
    expect(buildChargeCodeSummary([], WINDOW_START, WINDOW_END)).toEqual([]);
  });

  it('sums hours for fully-inside completed entries', () => {
    const entries: ClockEntry[] = [
      { chargeCode: 'WO-001', clockIn: d('2026-04-08T08:00:00Z'), clockOut: d('2026-04-08T16:00:00Z') },
      { chargeCode: 'WO-001', clockIn: d('2026-04-09T09:00:00Z'), clockOut: d('2026-04-09T12:00:00Z') },
    ];
    const [summary] = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    expect(summary.chargeCode).toBe('WO-001');
    expect(summary.hours).toBeCloseTo(11, 6);
    expect(summary.inProgress).toBe(false);
  });

  it('groups entries by charge code independently', () => {
    const entries: ClockEntry[] = [
      { chargeCode: 'WO-A', clockIn: d('2026-04-08T08:00:00Z'), clockOut: d('2026-04-08T12:30:00Z') }, // 4.5 h
      { chargeCode: 'WO-B', clockIn: d('2026-04-08T09:00:00Z'), clockOut: d('2026-04-08T12:15:00Z') }, // 3.25 h
    ];
    const result = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    const byCode = Object.fromEntries(result.map(r => [r.chargeCode, r.hours]));
    expect(byCode['WO-A']).toBeCloseTo(4.5, 6);
    expect(byCode['WO-B']).toBeCloseTo(3.25, 6);
  });
});

// ── buildChargeCodeSummary: boundary-spanning clipping ───────────────────────

describe('buildChargeCodeSummary – boundary-spanning entries', () => {
  it('clips a leading-boundary entry to only the overlap portion', () => {
    // Starts 2 h before window, ends 4 h into window → 4 h inside
    const entries: ClockEntry[] = [
      { chargeCode: 'WO-LEAD', clockIn: d('2026-04-06T22:00:00Z'), clockOut: d('2026-04-07T04:00:00Z') },
    ];
    const [s] = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    expect(s.hours).toBeCloseTo(4, 6);
  });

  it('clips a trailing-boundary entry to only the overlap portion', () => {
    // Ends 3 h after window
    const clockIn = d('2026-04-20T22:00:00Z');
    const entries: ClockEntry[] = [
      { chargeCode: 'WO-TRAIL', clockIn, clockOut: d('2026-04-21T03:00:00Z') },
    ];
    const [s] = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    const expectedMs = WINDOW_END.getTime() - clockIn.getTime();
    expect(s.hours).toBeCloseTo(expectedMs / (1000 * 3600), 6);
  });

  it('clips mixed boundary-spanning + fully-inside entries correctly', () => {
    const leading = d('2026-04-06T22:00:00Z');
    const trailing = d('2026-04-20T22:00:00Z');
    const entries: ClockEntry[] = [
      { chargeCode: 'WO-X', clockIn: leading, clockOut: d('2026-04-07T02:00:00Z') }, // 2 h inside
      { chargeCode: 'WO-X', clockIn: d('2026-04-10T08:00:00Z'), clockOut: d('2026-04-10T16:00:00Z') }, // 8 h
      { chargeCode: 'WO-X', clockIn: trailing, clockOut: d('2026-04-21T03:00:00Z') },
    ];
    const trailingMs = WINDOW_END.getTime() - trailing.getTime();
    const expected = 2 + 8 + trailingMs / (1000 * 3600);
    const [s] = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    expect(s.hours).toBeCloseTo(expected, 6);
  });

  it('excludes entries that fall entirely before the window', () => {
    const entries: ClockEntry[] = [
      { chargeCode: 'WO-OLD', clockIn: d('2026-04-01T08:00:00Z'), clockOut: d('2026-04-01T16:00:00Z') },
    ];
    const [s] = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    expect(s.hours).toBe(0);
  });

  it('excludes entries that fall entirely after the window', () => {
    const entries: ClockEntry[] = [
      { chargeCode: 'WO-FUT', clockIn: d('2026-04-25T08:00:00Z'), clockOut: d('2026-04-25T16:00:00Z') },
    ];
    const [s] = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    expect(s.hours).toBe(0);
  });
});

// ── buildChargeCodeSummary: open (in-progress) entries ───────────────────────
// Open entries contribute 0 hours but set inProgress=true and record
// the earliest in-progress clock_in.

describe('buildChargeCodeSummary – open (in-progress) entries', () => {
  it('contributes 0 hours and sets inProgress=true for an open entry', () => {
    const entries: ClockEntry[] = [
      { chargeCode: 'WO-OPEN', clockIn: d('2026-04-15T10:00:00Z'), clockOut: null },
    ];
    const [s] = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    expect(s.hours).toBe(0);
    expect(s.inProgress).toBe(true);
    expect(s.inProgressClockIn).toBe('2026-04-15T10:00:00.000Z');
  });

  it('records the earliest in-progress clock_in when multiple open entries share a charge code', () => {
    const entries: ClockEntry[] = [
      { chargeCode: 'WO-OPEN', clockIn: d('2026-04-15T14:00:00Z'), clockOut: null },
      { chargeCode: 'WO-OPEN', clockIn: d('2026-04-15T10:00:00Z'), clockOut: null },
    ];
    const [s] = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    expect(s.inProgressClockIn).toBe('2026-04-15T10:00:00.000Z');
  });

  it('sums completed hours AND flags inProgress when both kinds exist for one charge code', () => {
    const entries: ClockEntry[] = [
      { chargeCode: 'WO-MIX', clockIn: d('2026-04-08T08:00:00Z'), clockOut: d('2026-04-08T16:00:00Z') },
      { chargeCode: 'WO-MIX', clockIn: d('2026-04-15T10:00:00Z'), clockOut: null },
    ];
    const [s] = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    expect(s.hours).toBeCloseTo(8, 6);
    expect(s.inProgress).toBe(true);
  });
});

// ── buildChargeCodeSummary: null charge codes ────────────────────────────────

describe('buildChargeCodeSummary – null charge codes', () => {
  it('groups entries with null chargeCode together', () => {
    const entries: ClockEntry[] = [
      { chargeCode: null, clockIn: d('2026-04-10T08:00:00Z'), clockOut: d('2026-04-10T14:00:00Z') }, // 6 h
      { chargeCode: null, clockIn: d('2026-04-11T08:00:00Z'), clockOut: d('2026-04-11T10:00:00Z') }, // 2 h
    ];
    const [s] = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    expect(s.chargeCode).toBeNull();
    expect(s.hours).toBeCloseTo(8, 6);
  });

  it('sorts null chargeCode last', () => {
    const entries: ClockEntry[] = [
      { chargeCode: null, clockIn: d('2026-04-10T08:00:00Z'), clockOut: d('2026-04-10T09:00:00Z') },
      { chargeCode: 'WO-001', clockIn: d('2026-04-10T08:00:00Z'), clockOut: d('2026-04-10T09:00:00Z') },
    ];
    const result = buildChargeCodeSummary(entries, WINDOW_START, WINDOW_END);
    expect(result[0].chargeCode).toBe('WO-001');
    expect(result[1].chargeCode).toBeNull();
  });
});

// ── @clipping-sync coupling guard ─────────────────────────────────────────────
// This test ensures both the canonical helper and its sole consumer carry the
// @clipping-sync sentinel.  If either marker is removed, this test fails,
// making it impossible for the two to drift without a test failure.

describe('@clipping-sync coupling guard', () => {
  const ROOT = path.resolve(__dirname, '../..');

  it('payPeriodClipping.ts carries the @clipping-sync marker', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'server/src/services/payPeriodClipping.ts'),
      'utf8',
    );
    expect(src).toContain('@clipping-sync');
  });

  it('timekeeping route carries the @clipping-sync marker', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'server/src/routes/timekeeping.ts'),
      'utf8',
    );
    expect(src).toContain('@clipping-sync');
  });

  it('timekeeping route imports buildChargeCodeSummary from payPeriodClipping', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'server/src/routes/timekeeping.ts'),
      'utf8',
    );
    expect(src).toMatch(/import[^;]+buildChargeCodeSummary[^;]+payPeriodClipping/);
  });
});
