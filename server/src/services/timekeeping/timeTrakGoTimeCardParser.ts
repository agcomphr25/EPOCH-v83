export type TimeTrakGoTimeCardRowType = 'punch_pair' | 'daily_total';

export interface TimeTrakGoTimeCardRow {
  employeeName: string;
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
  clockInIso: string | null;
  clockOutIso: string | null;
  hours: number;
  dayTotal: number | null;
  rowType: TimeTrakGoTimeCardRowType;
  flags: string[];
  sourceLine: string;
}

export interface TimeTrakGoParseResult {
  rows: TimeTrakGoTimeCardRow[];
  completePunchPairs: TimeTrakGoTimeCardRow[];
  reviewRows: TimeTrakGoTimeCardRow[];
  reportTotal: number | null;
}

export interface TimeTrakGoParseOptions {
  /**
   * Offset from UTC in minutes for the time clock location. Central daylight
   * time is -300; central standard time is -360.
   */
  timezoneOffsetMinutes?: number;
}

const DAY_ROW = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)$/;
const SKIP_PREFIXES = [
  'Time Card Report',
  'TimeTrakGO',
  'AG Composites',
  'Pay Date',
  'Week Total',
  'User Total',
  'Warning',
  'Punches',
  'Thursday,',
];

function looksLikeEmployeeName(line: string): boolean {
  if (!line || SKIP_PREFIXES.some((prefix) => line.startsWith(prefix))) return false;
  if (DAY_ROW.test(line)) return false;
  return /^[A-Za-z][A-Za-z .'-]+$/.test(line);
}

function parseHours(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.startsWith('.') ? `0${raw}` : raw;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseTimestamp(workDate: string, time: string, timezoneOffsetMinutes: number): string {
  const [month, day, year] = workDate.split('/').map(Number);
  const match = time.match(/^(\d{1,2}):(\d{2})\s+([AP]M)$/);
  if (!match || !month || !day || !year) throw new Error(`Invalid TimeTrakGO timestamp: ${workDate} ${time}`);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3] === 'PM' && hour !== 12) hour += 12;
  if (match[3] === 'AM' && hour === 12) hour = 0;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - timezoneOffsetMinutes * 60_000).toISOString();
}

function readPunchMark(tokens: string[], index: number): { value: string | 'Missing' | null; next: number } {
  if (index >= tokens.length) return { value: null, next: index };
  if (tokens[index] === 'Missing') return { value: 'Missing', next: index + 1 };
  if (/^\d{1,2}:\d{2}$/.test(tokens[index] ?? '') && ['AM', 'PM'].includes(tokens[index + 1] ?? '')) {
    return { value: `${tokens[index]} ${tokens[index + 1]}`, next: index + 2 };
  }
  return { value: null, next: index };
}

export function parseTimeTrakGoTimeCardText(
  text: string,
  options: TimeTrakGoParseOptions = {},
): TimeTrakGoParseResult {
  const rows: TimeTrakGoTimeCardRow[] = [];
  const timezoneOffsetMinutes = options.timezoneOffsetMinutes ?? -300;
  let employeeName: string | null = null;
  let currentDate: string | null = null;
  let reportTotal: number | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const reportTotalMatch = line.match(/^Regular\s+(\.?\d+(?:\.\d+)?)\s*Report Total$/);
    if (reportTotalMatch) {
      reportTotal = parseHours(reportTotalMatch[1]) ?? reportTotal;
      continue;
    }

    if (looksLikeEmployeeName(line)) {
      employeeName = line;
      currentDate = null;
      continue;
    }

    if (!employeeName) continue;

    const dated = line.match(DAY_ROW);
    const workDate = dated?.[2] ?? currentDate;
    const payload = dated?.[3] ?? line;
    if (dated?.[2]) currentDate = dated[2];
    if (!workDate || !payload) continue;

    const tokens = payload.split(/\s+/);
    if (tokens.length === 3 && tokens[0] === 'Regular') {
      const hours = parseHours(tokens[1]);
      const dayTotal = parseHours(tokens[2]);
      if (hours != null && dayTotal != null) {
        rows.push({
          employeeName,
          workDate,
          clockIn: null,
          clockOut: null,
          clockInIso: null,
          clockOutIso: null,
          hours,
          dayTotal,
          rowType: 'daily_total',
          flags: ['NO_PUNCH_TIMES'],
          sourceLine: line,
        });
      }
      continue;
    }

    if (SKIP_PREFIXES.some((prefix) => payload.startsWith(prefix)) || payload.startsWith('Regular ')) continue;

    let cursor = 0;
    const flags: string[] = [];
    const inMark = readPunchMark(tokens, cursor);
    cursor = inMark.next;
    if (!inMark.value) continue;

    if (['Late', 'Early'].includes(tokens[cursor] ?? '')) {
      flags.push((tokens[cursor] ?? '').toUpperCase());
      cursor += 1;
    }

    const outMark = readPunchMark(tokens, cursor);
    cursor = outMark.next;
    if (!outMark.value) continue;

    const hours = parseHours(tokens[cursor]);
    const dayTotal = parseHours(tokens[cursor + 1]);
    if (hours == null) continue;

    if (inMark.value === 'Missing') flags.push('MISSING_IN');
    if (outMark.value === 'Missing') flags.push('MISSING_OUT');

    const clockIn = inMark.value === 'Missing' ? null : inMark.value;
    const clockOut = outMark.value === 'Missing' ? null : outMark.value;
    rows.push({
      employeeName,
      workDate,
      clockIn,
      clockOut,
      clockInIso: clockIn ? parseTimestamp(workDate, clockIn, timezoneOffsetMinutes) : null,
      clockOutIso: clockOut ? parseTimestamp(workDate, clockOut, timezoneOffsetMinutes) : null,
      hours,
      dayTotal,
      rowType: 'punch_pair',
      flags,
      sourceLine: line,
    });
  }

  const completePunchPairs = rows.filter((row) => row.rowType === 'punch_pair' && row.clockInIso && row.clockOutIso);
  const reviewRows = rows.filter((row) => row.rowType !== 'punch_pair' || !row.clockInIso || !row.clockOutIso);
  return { rows, completePunchPairs, reviewRows, reportTotal };
}
