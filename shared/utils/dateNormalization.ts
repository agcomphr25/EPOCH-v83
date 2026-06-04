/**
 * Parse a value into a local-time Date.
 * Date-only strings ("YYYY-MM-DD") are parsed as local midnight to avoid
 * UTC-parsing shifting the calendar day in non-UTC timezones.
 * Date objects are kept as-is (their local-time date components are used).
 */
export function toLocalDate(value: Date | string): Date {
  if (value instanceof Date) {
    return value;
  }
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (dateOnlyMatch) {
    return new Date(
      parseInt(dateOnlyMatch[1], 10),
      parseInt(dateOnlyMatch[2], 10) - 1,
      parseInt(dateOnlyMatch[3], 10)
    );
  }
  return new Date(value);
}

/**
 * Normalize a date to the nearest Tuesday (same day if already Tuesday,
 * otherwise the next Tuesday). Operates in local time; returns midnight local time.
 */
export function normalizeToTuesday(date: Date | string): Date {
  const d = toLocalDate(date);
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = result.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  if (day !== 2) {
    const daysUntilTuesday = (2 - day + 7) % 7 || 7;
    result.setDate(result.getDate() + daysUntilTuesday);
  }
  return result;
}

export const normalizeDueDateForStorage = normalizeToTuesday;

export function formatDateOnly(
  value: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }
): string {
  if (!value) return '—';

  const date = toLocalDate(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-US', options).format(date);
}

export function formatDateOnlyMedium(value: Date | string | null | undefined): string {
  return formatDateOnly(value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
