/**
 * Pay-period clipping helpers.
 *
 * @clipping-sync CANONICAL SOURCE – these functions are the single source of
 * truth for charge-code hour clipping.  The route
 * server/src/routes/timekeeping.ts (charge-code summary block) MUST delegate
 * to buildChargeCodeSummary; it must never re-implement LEAST/GREATEST/COALESCE
 * clipping inline.  A test in server/__tests__/payPeriodClipping.test.ts
 * enforces that both files carry this @clipping-sync marker.
 *
 * Semantics mirror the original SQL intent:
 *   - Only completed entries (clock_out IS NOT NULL) contribute hours.
 *   - Open entries set the inProgress flag and are excluded from the hours sum.
 *   - Completed entries are clipped to [windowStart, windowEnd] via
 *       GREATEST(clock_in, windowStart) and LEAST(clock_out, windowEnd).
 */

export interface ClockEntry {
  chargeCode: string | null;
  clockIn: Date;
  clockOut: Date | null;
}

export interface ChargeCodeSummary {
  chargeCode: string | null;
  hours: number;
  inProgress: boolean;
  inProgressClockIn: string | null;
}

/**
 * Compute the overlap hours between a *completed* entry and [windowStart, windowEnd].
 *
 * Returns 0 when:
 *   - The entry does not overlap the window at all.
 *   - clockOut <= clockIn (degenerate / inverted entry).
 *
 * This is the TypeScript equivalent of:
 *   EXTRACT(EPOCH FROM (
 *     LEAST(clock_out, windowEnd) - GREATEST(clock_in, windowStart)
 *   )) / 3600.0
 */
export function clipEntryHours(
  clockIn: Date,
  clockOut: Date,
  windowStart: Date,
  windowEnd: Date,
): number {
  const clippedStart = new Date(Math.max(clockIn.getTime(), windowStart.getTime()));
  const clippedEnd   = new Date(Math.min(clockOut.getTime(), windowEnd.getTime()));
  const deltaMs = clippedEnd.getTime() - clippedStart.getTime();
  if (deltaMs <= 0) return 0;
  return deltaMs / (1000 * 3600);
}

/**
 * Aggregate a flat list of raw time_clock_entry rows into the charge-code
 * summary shape consumed by the admin endpoint.
 *
 * Mirrors the GROUP BY tce.charge_code aggregation that was previously done
 * entirely in SQL, including:
 *   - Summing clipped hours for completed entries.
 *   - Flagging charge codes with at least one open entry (inProgress).
 *   - Tracking the earliest in-progress clock_in per charge code.
 *   - Sorting alphabetically with NULL charge code last.
 */
export function buildChargeCodeSummary(
  entries: ClockEntry[],
  windowStart: Date,
  windowEnd: Date,
): ChargeCodeSummary[] {
  const map = new Map<string, ChargeCodeSummary>();

  const key = (chargeCode: string | null) => chargeCode ?? '\x00__null__';

  for (const entry of entries) {
    const k = key(entry.chargeCode);
    if (!map.has(k)) {
      map.set(k, {
        chargeCode: entry.chargeCode,
        hours: 0,
        inProgress: false,
        inProgressClockIn: null,
      });
    }
    const summary = map.get(k)!;

    if (entry.clockOut === null) {
      summary.inProgress = true;
      const inTs = entry.clockIn.toISOString();
      if (summary.inProgressClockIn === null || inTs < summary.inProgressClockIn) {
        summary.inProgressClockIn = inTs;
      }
    } else {
      summary.hours += clipEntryHours(entry.clockIn, entry.clockOut, windowStart, windowEnd);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.chargeCode === null && b.chargeCode === null) return 0;
    if (a.chargeCode === null) return 1;
    if (b.chargeCode === null) return -1;
    return a.chargeCode.localeCompare(b.chargeCode);
  });
}
