/**
 * Core timekeeping domain logic — pure computation, no database access.
 *
 * This module is intentionally decoupled from the storage layer so it can be
 * transplanted into EPOCH (or any other host) without modification. All
 * functions accept plain data and return plain values. DB concerns belong in
 * the service layer.
 */

// Minimal punch shape required by this module — matches the DB row but is
// declared locally so this file has no runtime DB dependency.
export interface PunchRecord {
  punchedAt: Date | string;
  type: string;
}

export type PunchStatus = "clocked_out" | "clocked_in" | "on_break";
export type PunchType = "clock_in" | "clock_out" | "break_start" | "break_end";

// ---------------------------------------------------------------------------
// Timezone helpers (native Intl API, no external deps)
// ---------------------------------------------------------------------------

/**
 * Returns "YYYY-MM-DD" for a given Date in the specified IANA timezone.
 * Used to bucket punch timestamps into local calendar days.
 */
export function toTZDateStr(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);
}

/**
 * Returns the UTC offset in milliseconds for a given timezone at a given moment.
 * Positive value means local time is behind UTC (e.g. America/New_York = +5h in winter).
 */
function tzOffsetMs(tz: string, refDate: Date): number {
  const utcStr = refDate.toLocaleString("en-US", { timeZone: "UTC" });
  const localStr = refDate.toLocaleString("en-US", { timeZone: tz });
  return new Date(utcStr).getTime() - new Date(localStr).getTime();
}

/**
 * Returns a UTC Date object representing midnight (00:00:00) of the given
 * "YYYY-MM-DD" string in the specified IANA timezone.
 */
export function midnightInTZ(dateStr: string, tz: string): Date {
  // Use noon UTC as a stable reference (avoids DST edge cases at midnight)
  const noonUTC = new Date(`${dateStr}T12:00:00Z`);
  const offset = tzOffsetMs(tz, noonUTC);
  const midnightUTC = new Date(`${dateStr}T00:00:00Z`);
  return new Date(midnightUTC.getTime() + offset);
}

/**
 * Returns a UTC Date object for the start of the current week in the given
 * timezone. `startDay` follows JS convention: 0 = Sunday, 1 = Monday … 6 = Saturday.
 */
export function startOfWeekInTZ(
  tz: string,
  startDay: number = 1,
  refDate: Date = new Date()
): Date {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const currentDayName = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(refDate);
  const currentDay = dayNames.indexOf(currentDayName);
  const diff = (currentDay - startDay + 7) % 7;

  // Step back `diff` UTC days then re-anchor to the local date string
  const shifted = new Date(refDate);
  shifted.setUTCDate(shifted.getUTCDate() - diff);
  const dateStr = toTZDateStr(shifted, tz);
  return midnightInTZ(dateStr, tz);
}

// ---------------------------------------------------------------------------
// Certifications
// ---------------------------------------------------------------------------

export function computeCertStatus(
  expiresDate: string | null
): "active" | "expiring_soon" | "expired" {
  if (!expiresDate) return "active";
  const expires = new Date(expiresDate);
  const now = new Date();
  const thirtyDaysOut = new Date();
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  if (expires < now) return "expired";
  if (expires <= thirtyDaysOut) return "expiring_soon";
  return "active";
}

// ---------------------------------------------------------------------------
// Punch computation
// ---------------------------------------------------------------------------

function roundMs(ms: number, roundingMinutes: number): number {
  if (roundingMinutes <= 0) return ms;
  const interval = roundingMinutes * 60 * 1000;
  return Math.round(ms / interval) * interval;
}

/**
 * Computes total worked hours from a raw sequence of punch events.
 * - Rounding is applied per clock-in/clock-out interval when roundingMinutes > 0.
 * - An open clock-in (no matching clock-out) is treated as ongoing until now.
 */
export function computeHoursFromPunches(
  punches: PunchRecord[],
  roundingMinutes: number = 0
): number {
  const sorted = [...punches].sort(
    (a, b) =>
      new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime()
  );

  let totalMs = 0;
  let clockInTime: Date | null = null;
  let breakStartTime: Date | null = null;
  let totalBreakMs = 0;

  for (const punch of sorted) {
    const t = new Date(punch.punchedAt);
    if (punch.type === "clock_in") {
      clockInTime = t;
      breakStartTime = null;
      totalBreakMs = 0;
    } else if (punch.type === "break_start" && clockInTime) {
      breakStartTime = t;
    } else if (punch.type === "break_end" && breakStartTime) {
      totalBreakMs += t.getTime() - breakStartTime.getTime();
      breakStartTime = null;
    } else if (punch.type === "clock_out" && clockInTime) {
      const raw = t.getTime() - clockInTime.getTime() - totalBreakMs;
      totalMs += roundMs(Math.max(0, raw), roundingMinutes);
      clockInTime = null;
      totalBreakMs = 0;
    }
  }

  // Open shift: treat as still running
  if (clockInTime) {
    const now = Date.now();
    const currentBreak = breakStartTime ? now - breakStartTime.getTime() : 0;
    const raw = now - clockInTime.getTime() - totalBreakMs - currentBreak;
    totalMs += roundMs(Math.max(0, raw), roundingMinutes);
  }

  return Math.round((totalMs / 3_600_000) * 100) / 100;
}

/**
 * Derives the current punch status from a list of punches (no DB access).
 * Uses the provided timezone for "today" boundary calculations.
 */
export function derivePunchStatus(
  punches: PunchRecord[],
  timezone: string
): {
  status: PunchStatus;
  lastPunch: PunchRecord | null;
  clockedInAt: Date | null;
  hoursToday: number;
} {
  const sorted = [...punches].sort(
    (a, b) =>
      new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime()
  );

  const lastPunch = sorted.at(-1) ?? null;

  let status: PunchStatus = "clocked_out";
  if (lastPunch) {
    if (lastPunch.type === "clock_in" || lastPunch.type === "break_end") {
      status = "clocked_in";
    } else if (lastPunch.type === "break_start") {
      status = "on_break";
    } else if (lastPunch.type === "clock_out") {
      status = "clocked_out";
    }
  }

  const todayStr = toTZDateStr(new Date(), timezone);
  const todayPunches = sorted.filter(
    (p) => toTZDateStr(new Date(p.punchedAt), timezone) === todayStr
  );
  const hoursToday = computeHoursFromPunches(todayPunches);

  let clockedInAt: Date | null = null;
  if (status === "clocked_in" || status === "on_break") {
    const clockIn = [...todayPunches].reverse().find((p) => p.type === "clock_in");
    if (clockIn) clockedInAt = new Date(clockIn.punchedAt);
  }

  return { status, lastPunch, clockedInAt, hoursToday };
}

/**
 * Given a current punch status, returns the logical next punch type.
 * Pure function — callers can override for surface-specific UX (e.g. kiosk
 * break button vs. direct clock-out).
 */
export function resolveNextPunchType(status: PunchStatus): PunchType {
  if (status === "clocked_out") return "clock_in";
  if (status === "clocked_in") return "clock_out";
  if (status === "on_break") return "break_end";
  return "clock_in";
}

// ---------------------------------------------------------------------------
// Timesheet computation
// ---------------------------------------------------------------------------

export interface TimesheetHours {
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
}

/**
 * Computes timesheet hour totals from raw punches, using the company timezone
 * for day-boundary determination and the configured overtime thresholds.
 */
export function computeTimesheetHours(
  punches: PunchRecord[],
  opts: {
    timezone: string;
    overtimeThresholdDaily: number;
    overtimeThresholdWeekly: number;
    roundingMinutes?: number;
  }
): TimesheetHours {
  const {
    timezone,
    overtimeThresholdDaily,
    overtimeThresholdWeekly,
    roundingMinutes = 0,
  } = opts;

  const byDay = new Map<string, PunchRecord[]>();
  for (const p of punches) {
    const day = toTZDateStr(new Date(p.punchedAt), timezone);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(p);
  }

  let totalHours = 0;
  let overtimeHours = 0;

  for (const dayPunches of byDay.values()) {
    const dayHours = computeHoursFromPunches(dayPunches, roundingMinutes);
    totalHours += dayHours;
    if (dayHours > overtimeThresholdDaily) {
      overtimeHours += dayHours - overtimeThresholdDaily;
    }
  }

  const weeklyOvertime = Math.max(0, totalHours - overtimeThresholdWeekly);
  overtimeHours = Math.max(overtimeHours, weeklyOvertime);
  const regularHours = Math.max(0, totalHours - overtimeHours);

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    regularHours: Math.round(regularHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
  };
}
