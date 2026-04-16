export interface PayPeriod {
  start: Date;
  end: Date;
  label: string;
}

// Bi-weekly periods anchored to Monday, January 1, 2024.
// Arithmetic is done in UTC calendar days so DST transitions cannot
// shift period boundaries.
const ANCHOR_UTC = Date.UTC(2024, 0, 1); // 2024-01-01 00:00:00 UTC
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = 14;

function formatPeriodDate(date: Date): string {
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

export function getPayPeriod(date: Date = new Date()): PayPeriod {
  // Normalize the input to a UTC midnight timestamp using the *local* calendar
  // date (year/month/day) so the period matches what the employee sees on their
  // clock, while the arithmetic itself is DST-free.
  const inputUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

  // Number of whole days since the anchor — always an integer because both
  // values are UTC midnights, so no fractional-day DST skew can occur.
  const daysSinceAnchor = Math.round((inputUTC - ANCHOR_UTC) / DAY_MS);
  const periodIndex = Math.floor(daysSinceAnchor / PERIOD_DAYS);

  // Period start/end in UTC calendar days
  const startUTC = ANCHOR_UTC + periodIndex * PERIOD_DAYS * DAY_MS;
  const endUTC = startUTC + (PERIOD_DAYS - 1) * DAY_MS;

  // Convert the UTC calendar dates back to local-time Date objects so that
  // start/end boundaries align with local midnight as all callers expect.
  const startUTCDate = new Date(startUTC);
  const endUTCDate = new Date(endUTC);

  const start = new Date(
    startUTCDate.getUTCFullYear(),
    startUTCDate.getUTCMonth(),
    startUTCDate.getUTCDate(),
    0, 0, 0, 0,
  );
  const end = new Date(
    endUTCDate.getUTCFullYear(),
    endUTCDate.getUTCMonth(),
    endUTCDate.getUTCDate(),
    23, 59, 59, 999,
  );

  const label = `${formatPeriodDate(start)} – ${formatPeriodDate(end)}, ${end.getFullYear()}`;

  return { start, end, label };
}

export function getPayPeriodDates(referenceDate: Date = new Date()): { start: Date; end: Date } {
  const { start, end } = getPayPeriod(referenceDate);
  return { start, end };
}
