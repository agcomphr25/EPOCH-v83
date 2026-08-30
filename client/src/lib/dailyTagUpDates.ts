const DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:$|T)/;

function parseDate(value: string | null, preserveDateOnly: boolean): Date | null {
  if (!value) return null;

  const datePrefix = preserveDateOnly ? value.match(DATE_PREFIX_PATTERN)?.[1] : undefined;
  const normalized = datePrefix ? `${datePrefix}T12:00:00` : value;
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDailyTagUpDate(value: string | null): string {
  const parsed = parseDate(value, true);
  if (!parsed) return 'Not set';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export function formatDailyTagUpUpdatedAt(value: string | null): string {
  const parsed = parseDate(value, false);
  if (!parsed) return 'Unavailable';

  return parsed.toLocaleTimeString();
}
