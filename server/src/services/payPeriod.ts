import { midnightInTZ, toTZDateStr } from "../lib/timekeeping";

export interface PayPeriod {
  start: Date;
  end: Date;
  label: string;
}

const ANCHOR_UTC = Date.UTC(2024, 0, 1); // 2024-01-01 00:00:00 UTC
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = 14;

function formatPeriodDate(date: Date): string {
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

export function getPayPeriod(date: Date = new Date(), timezone: string = 'America/Chicago'): PayPeriod {
  const localDateStr = toTZDateStr(date, timezone);
  const [y, m, d] = localDateStr.split('-').map(Number);
  const inputUTC = Date.UTC(y, m - 1, d);

  const daysSinceAnchor = Math.round((inputUTC - ANCHOR_UTC) / DAY_MS);
  const periodIndex = Math.floor(daysSinceAnchor / PERIOD_DAYS);

  const startUTC = ANCHOR_UTC + periodIndex * PERIOD_DAYS * DAY_MS;
  const endUTC = startUTC + (PERIOD_DAYS - 1) * DAY_MS;

  const startDateStr = new Date(startUTC).toISOString().slice(0, 10);
  const endDateStr = new Date(endUTC).toISOString().slice(0, 10);

  const start = midnightInTZ(startDateStr, timezone);

  const nextDayAfterEnd = new Date(endUTC + DAY_MS).toISOString().slice(0, 10);
  const end = new Date(midnightInTZ(nextDayAfterEnd, timezone).getTime() - 1);

  const label = `${formatPeriodDate(start)} – ${formatPeriodDate(end)}, ${end.getFullYear()}`;

  return { start, end, label };
}

export function getPayPeriodDates(referenceDate: Date = new Date(), timezone: string = 'America/Chicago'): { start: Date; end: Date } {
  const { start, end } = getPayPeriod(referenceDate, timezone);
  return { start, end };
}
