import { describe, expect, it } from 'vitest';

import { formatDailyTagUpDate, formatDailyTagUpUpdatedAt } from '@/lib/dailyTagUpDates';

describe('Daily Tag Up date formatting', () => {
  it('formats date-only and full timestamp due dates without throwing', () => {
    const dateOnly = formatDailyTagUpDate('2026-08-29');
    expect(dateOnly).not.toBe('Not set');
    expect(formatDailyTagUpDate('2026-08-29T00:00:00.000Z')).toBe(dateOnly);
  });

  it('fails closed for missing or malformed dates', () => {
    expect(formatDailyTagUpDate(null)).toBe('Not set');
    expect(formatDailyTagUpDate('not-a-date')).toBe('Not set');
    expect(formatDailyTagUpUpdatedAt('not-a-date')).toBe('Unavailable');
  });
});
