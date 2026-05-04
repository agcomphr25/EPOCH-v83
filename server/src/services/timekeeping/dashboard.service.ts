import { db } from "../../../db";
import { punchesTable, timesheetsTable, certificationsTable, timeOffRequestsTable, auditLogTable, timesheetCorrectionsTable } from "../../schema/timekeeping";
import { gte, lte, and, desc, eq, isNull, or, lt, sql, inArray, notInArray } from "drizzle-orm";
import type { Punch } from "../../schema/timekeeping";
import { punchLedger, employees as publicEmployees } from "../../../schema";
import { listResolvedEmployees, type ResolvedEmployee } from "../../lib/timekeepingEmployeeResolver";
import { toApiEmployee, type Employee } from "./employees.service";
import { getOrCreatePolicySettings } from "./policySettings.service";
import {
  computeHoursFromPunches,
  computeTimesheetHours,
  toTZDateStr,
  startOfWeekInTZ,
  midnightInTZ,
  derivePunchStatus,
} from "../../lib/timekeeping";
import { getOrCreateSettings } from "./settings.service";
import * as ledger from "../../lib/punchLedger";
import { getPayPeriodDates } from "../payPeriod";
import { punchLedgerCutoverDate } from "../../lib/featureFlags";

/**
 * Open punch_ledger sessions older than this threshold are considered stale
 * (employee forgot to clock out). They are excluded from active counts and
 * surfaced in the Missing Punches banner instead.
 */
const STALE_SESSION_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface DashboardSummary {
  totalEmployees: number;
  activeEmployees: number;
  clockedInNow: number;
  onBreakNow: number;
  pendingTimesheets: number;
  pendingTimeOffRequests: number;
  hoursThisWeek: number;
  overtimeHoursThisWeek: number;
  expiringCertifications: number;
  missingPunchCount: number;
}

interface AttendanceState {
  clockedInNow: number;
  onBreakNow: number;
  /** epochEmployeeIds of employees flagged for missing/incomplete punch pairs */
  missingPunchEpochIds: Set<number>;
  /** epochEmployeeIds of employees with a stale open session (> 24h, no clock-out) */
  staleSessionEpochIds: Set<number>;
  /**
   * Per-employee status map keyed by epochEmployeeId.
   * hoursToday defaults to 0; callers that need accurate hours must update it.
   */
  statusMap: Map<number, EmployeeStatusEntry>;
}

/**
 * Shared attendance computation helper — the single source of truth for
 * "who is clocked in / on break / clocked out" and missing-punch detection.
 *
 * Called by both getDashboardSummary() and getEmployeeStatus() so the summary
 * card counts and the In/Out Board can never diverge.
 *
 * IMPORTANT — ID namespaces:
 *   punchesTable.employeeId  →  public.employees.id  (epochEmployeeId)
 *   punchLedger.employeeId   →  public.employees.id  (epochEmployeeId)
 *   timekeepingId            →  timekeeping.employees.id  (different sequence)
 *
 * All filtering against punchesTable or punchLedger must use epochEmployeeId.
 *
 * @param allEmployees      Resolved employee list from listResolvedEmployees()
 * @param latestLegacyPunch Map of epochEmployeeId → most-recent punch row (pre-built
 *                          by caller from punchesTable rows ordered desc by punchedAt)
 * @param openLedgerSessions Open punch_ledger rows (clockOut IS NULL), ordered desc
 *                           by clockIn so first per employee = most recent
 * @param payPeriodStart    Start of the current pay period for missing-punch detection
 * @param payPeriodLegacyPunchesByEmployee Optional: all pay-period punches grouped by
 *                          epochEmployeeId (ordered asc by punchedAt). When provided,
 *                          enables full pair-sequence validation for missing-punch
 *                          detection (catches consecutive same-direction anomalies and
 *                          orphaned clock-outs in addition to open states). When absent,
 *                          falls back to checking only the most-recent punch per employee.
 */
function computeAttendanceState(
  allEmployees: ResolvedEmployee[],
  latestLegacyPunch: Map<number, typeof punchesTable.$inferSelect>,
  openLedgerSessions: (typeof punchLedger.$inferSelect)[],
  payPeriodStart: Date,
  payPeriodLegacyPunchesByEmployee?: Map<number, (typeof punchesTable.$inferSelect)[]>,
): AttendanceState {
  const now = new Date();

  // Only include employees with a timekeeping anchor (timekeepingId != null).
  // Public-only employees (no timekeeping.employees row) cannot be mapped to the
  // Employee API shape via toApiEmployee() and must be excluded from the board.
  const activeEmployees = allEmployees.filter((e) => e.isActive && e.timekeepingId != null);
  const activeEpochIds = new Set(activeEmployees.map((e) => e.epochEmployeeId));
  const empByEpochId = new Map(activeEmployees.map((e) => [e.epochEmployeeId, e]));

  // Initialize status map: every active employee with a timekeeping anchor starts as clocked_out
  const statusMap = new Map<number, EmployeeStatusEntry>();
  for (const emp of activeEmployees) {
    statusMap.set(emp.epochEmployeeId, {
      employee: toApiEmployee(emp),
      status: "clocked_out",
    });
  }

  // --- Legacy path: timekeeping.punches ---
  // punchesTable.employeeId == public.employees.id (epochEmployeeId)
  const legacyCountedEpochIds = new Set<number>();
  let clockedInNow = 0;
  let onBreakNow = 0;

  for (const [epochId, punch] of latestLegacyPunch) {
    if (!activeEpochIds.has(epochId)) continue;

    let status: "clocked_in" | "on_break" | null = null;
    if (punch.type === "clock_in" || punch.type === "break_end") {
      status = "clocked_in";
      clockedInNow++;
    } else if (punch.type === "break_start") {
      status = "on_break";
      onBreakNow++;
    }

    if (status) {
      legacyCountedEpochIds.add(epochId);
      const emp = empByEpochId.get(epochId);
      if (emp) {
        statusMap.set(epochId, {
          employee: toApiEmployee(emp),
          status,
          clockedInAt: new Date(punch.punchedAt).toISOString(),
          hoursToday: 0, // updated by caller if needed
        });
      }
    }
  }

  // --- punch_ledger path ---
  // punchLedger.employeeId == public.employees.id (epochEmployeeId)
  // Take only the most-recent open session per employee (sessions are desc by clockIn)
  const mostRecentOpenByEpochId = new Map<number, (typeof openLedgerSessions)[number]>();
  for (const session of openLedgerSessions) {
    if (!mostRecentOpenByEpochId.has(session.employeeId)) {
      mostRecentOpenByEpochId.set(session.employeeId, session);
    }
  }

  const staleSessionEpochIds = new Set<number>();

  for (const [epochId, session] of mostRecentOpenByEpochId) {
    // Stale check: sessions older than threshold are flagged for Missing Punches
    // but the employee IS still clocked in — do not hide them from the board.
    const sessionAgeMs = now.getTime() - new Date(session.clockIn).getTime();
    if (sessionAgeMs > STALE_SESSION_THRESHOLD_MS) {
      staleSessionEpochIds.add(epochId);
    }

    // Skip if already accounted for by the legacy path
    if (legacyCountedEpochIds.has(epochId)) continue;
    if (!activeEpochIds.has(epochId)) continue;

    const status: "clocked_in" | "on_break" =
      session.laborClass === "BREAK" ? "on_break" : "clocked_in";
    if (status === "on_break") {
      onBreakNow++;
    } else {
      clockedInNow++;
    }
    legacyCountedEpochIds.add(epochId);

    const emp = empByEpochId.get(epochId);
    if (emp) {
      statusMap.set(epochId, {
        employee: toApiEmployee(emp),
        status,
        clockedInAt: new Date(session.clockIn).toISOString(),
        hoursToday: 0, // updated by caller if needed
      });
    }
  }

  // --- Missing punch detection ---
  const missingPunchEpochIds = new Set<number>();

  // Legacy path: detect incomplete punch pairs within the pay period.
  // When full pay-period punches are provided, run pair-sequence validation to catch
  // consecutive same-direction punches (in→in, out→out) and orphaned clock-outs in
  // addition to unclosed clock-in states.
  // When only the latest punch is available, fall back to checking for open states.
  if (payPeriodLegacyPunchesByEmployee && payPeriodLegacyPunchesByEmployee.size > 0) {
    for (const [epochId, punches] of payPeriodLegacyPunchesByEmployee) {
      if (!activeEpochIds.has(epochId)) continue;
      // Punches are already asc-sorted by caller; validate clock_in/clock_out alternation.
      // break_start / break_end do not affect the clock_in→clock_out pairing.
      let expectNextClockOut = false; // true = employee is clocked in, expecting clock_out
      let anomaly = false;
      for (const punch of punches) {
        if (punch.type === "clock_in") {
          if (expectNextClockOut) { anomaly = true; break; } // consecutive clock_in
          expectNextClockOut = true;
        } else if (punch.type === "clock_out") {
          if (!expectNextClockOut) { anomaly = true; break; } // orphaned clock_out
          expectNextClockOut = false;
        }
        // break_start / break_end: no change to in/out state
      }
      if (anomaly || expectNextClockOut) {
        missingPunchEpochIds.add(epochId);
      }
    }
  } else {
    // Fallback: check only the most-recent punch per employee for an open state.
    for (const [epochId, punch] of latestLegacyPunch) {
      if (!activeEpochIds.has(epochId)) continue;
      if (new Date(punch.punchedAt) < payPeriodStart) continue;
      const lastType = punch.type;
      if (lastType === "clock_in" || lastType === "break_start") {
        missingPunchEpochIds.add(epochId);
      }
    }
  }

  // punch_ledger path: open sessions within the pay period = incomplete pair
  for (const [epochId, session] of mostRecentOpenByEpochId) {
    if (!activeEpochIds.has(epochId)) continue;
    if (session.laborClass === "BREAK") continue;
    if (new Date(session.clockIn) < payPeriodStart) continue;
    missingPunchEpochIds.add(epochId);
  }

  // Stale sessions are always flagged as missing punches regardless of pay period
  for (const epochId of staleSessionEpochIds) {
    if (activeEpochIds.has(epochId)) {
      missingPunchEpochIds.add(epochId);
    }
  }

  return { clockedInNow, onBreakNow, missingPunchEpochIds, staleSessionEpochIds, statusMap };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const settings = await getOrCreateSettings();
  const tz = settings.timezone;
  const weekStart = startOfWeekInTZ(tz, settings.workweekStartDay);

  // Resolve employees from public.employees via epoch_employee_id
  const allEmployees = await listResolvedEmployees();

  // Limit legacy-punch fetch to current pay period plus a 60-day lookback window.
  // This prevents an unbounded full-table scan as the punches table grows over time.
  const { start: currentPayPeriodStart } = getPayPeriodDates(undefined, tz);
  const punchLookbackCutoff = new Date(currentPayPeriodStart);
  punchLookbackCutoff.setDate(punchLookbackCutoff.getDate() - 60);

  const [allPunches, allTimesheets, allCerts, openLedgerSessions, weekLedgerSessions, pendingTimeOffRows] =
    await Promise.all([
      db
        .select()
        .from(punchesTable)
        .where(gte(punchesTable.punchedAt, punchLookbackCutoff))
        .orderBy(desc(punchesTable.punchedAt)),
      db.select().from(timesheetsTable),
      db.select().from(certificationsTable),
      // All currently open punch_ledger sessions (clock_out IS NULL), newest first.
      // Used for clocked-in count and break status.
      db
        .select()
        .from(punchLedger)
        .where(isNull(punchLedger.clockOut))
        .orderBy(desc(punchLedger.clockIn)),
      // Sessions contributing to this week's hours:
      // (a) sessions that started this week, OR
      // (b) still-open sessions that started before the week (cross-boundary, open), OR
      // (c) closed sessions that started before the week but ended within it.
      // For (b) and (c) we clip session-start to weekStart when summing hours.
      db
        .select()
        .from(punchLedger)
        .where(
          or(
            gte(punchLedger.clockIn, weekStart),
            and(isNull(punchLedger.clockOut), lt(punchLedger.clockIn, weekStart)),
            and(gte(punchLedger.clockOut, weekStart), lt(punchLedger.clockIn, weekStart))
          )
        ),
      db.select().from(timeOffRequestsTable).where(eq(timeOffRequestsTable.status, "pending")),
    ]);

  const totalEmployees = allEmployees.length;
  // Count only employees enrolled in timekeeping (timekeepingId != null), consistent
  // with the In/Out Board which excludes public-only employees from its list.
  const activeEmployees = allEmployees.filter((e) => e.isActive && e.timekeepingId != null).length;

  // Build latestLegacyPunch map: epochEmployeeId → most-recent punch row.
  // punchesTable.employeeId references public.employees.id (epochEmployeeId),
  // NOT timekeeping.employees.id. allPunches is ordered desc by punchedAt, so
  // the first occurrence per employeeId is already the most recent.
  const latestLegacyPunch = new Map<number, typeof punchesTable.$inferSelect>();
  for (const p of allPunches) {
    if (!latestLegacyPunch.has(p.employeeId)) {
      latestLegacyPunch.set(p.employeeId, p);
    }
  }

  const { start: payPeriodStart } = getPayPeriodDates(undefined, tz);

  // Build pay-period punch map for full pair-sequence validation.
  // allPunches is ordered desc by punchedAt; we reverse per-employee so the
  // sequence validator sees punches in chronological (asc) order.
  const payPeriodLegacyPunchesByEmployee = new Map<number, (typeof punchesTable.$inferSelect)[]>();
  for (const p of allPunches) {
    if (new Date(p.punchedAt) < payPeriodStart) continue;
    if (!payPeriodLegacyPunchesByEmployee.has(p.employeeId)) {
      payPeriodLegacyPunchesByEmployee.set(p.employeeId, []);
    }
    payPeriodLegacyPunchesByEmployee.get(p.employeeId)!.unshift(p); // unshift reverses desc→asc
  }

  // Use the shared helper so counts are computed identically to getEmployeeStatus()
  const { clockedInNow, onBreakNow, missingPunchEpochIds } = computeAttendanceState(
    allEmployees,
    latestLegacyPunch,
    openLedgerSessions,
    payPeriodStart,
    payPeriodLegacyPunchesByEmployee,
  );

  // --- Hours this week ---

  const pendingTimesheets = allTimesheets.filter(
    (t) => t.status === "submitted"
  ).length;

  let hoursThisWeek = 0;
  let overtimeHoursThisWeek = 0;

  // Split-at-cutover logic — same shape as getWeeklyHours / getEmployeeHoursForPeriod.
  // For weeks that span PUNCH_LEDGER_CUTOVER_DATE, the legacy half covers
  // [weekStart, cutoverBoundary) and the ledger half covers [cutoverBoundary, weekEnd).
  // This keeps the source-of-truth rule consistent across all hour aggregators.
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekStartDateStr = toTZDateStr(weekStart, tz);
  const weekEndDateStr = toTZDateStr(new Date(weekEnd.getTime() - 1), tz);
  const useLedgerStart = weekStartDateStr >= punchLedgerCutoverDate;
  const useLedgerEnd = weekEndDateStr >= punchLedgerCutoverDate;
  const cutoverBoundary = midnightInTZ(punchLedgerCutoverDate, tz);
  const summaryNow = new Date();

  const needsLegacy = !useLedgerStart;
  const needsLedger = useLedgerEnd;
  const legacyEnd = needsLegacy && needsLedger ? cutoverBoundary : weekEnd;
  const ledgerStart = needsLegacy && needsLedger ? cutoverBoundary : weekStart;

  const ledgerHoursByEmp = new Map<number, number>();
  const legacyHoursByEmp = new Map<number, number>();

  if (needsLedger) {
    const activeEpochIdsForHours = new Set(allEmployees.filter((e) => e.isActive).map((e) => e.epochEmployeeId));
    const ledgerStartMs = ledgerStart.getTime();
    // Defensive end clip — for the in-progress current week, summaryNow is the
    // natural upper bound; weekEnd guards the case where the function is ever
    // invoked outside the current week.
    const weekUpperMs = Math.min(weekEnd.getTime(), summaryNow.getTime());

    for (const session of weekLedgerSessions) {
      if (session.laborClass === "BREAK") continue;
      const epochId = session.employeeId;
      if (!activeEpochIdsForHours.has(epochId)) continue;

      const start = Math.max(new Date(session.clockIn).getTime(), ledgerStartMs);
      const rawEnd = session.clockOut ? new Date(session.clockOut).getTime() : summaryNow.getTime();
      const end = Math.min(rawEnd, weekUpperMs);
      if (end <= start) continue; // session entirely outside the active half

      const hrs = (end - start) / 3_600_000;
      ledgerHoursByEmp.set(epochId, (ledgerHoursByEmp.get(epochId) ?? 0) + hrs);
    }
  }

  if (needsLegacy) {
    const weekStartMs = weekStart.getTime();
    const legacyEndMs = legacyEnd.getTime();
    const weekPunches = allPunches.filter((p) => {
      const ts = new Date(p.punchedAt).getTime();
      return ts >= weekStartMs && ts < legacyEndMs;
    });
    const weekPunchesByEmp = new Map<number, Punch[]>();
    for (const p of weekPunches) {
      if (!weekPunchesByEmp.has(p.employeeId))
        weekPunchesByEmp.set(p.employeeId, []);
      weekPunchesByEmp.get(p.employeeId)!.push(p);
    }
    for (const [epochId, empPunches] of Array.from(weekPunchesByEmp.entries())) {
      const { totalHours } = computeTimesheetHours(empPunches, {
        timezone: tz,
        overtimeThresholdDaily: settings.overtimeThresholdDaily,
        overtimeThresholdWeekly: settings.overtimeThresholdWeekly,
        roundingMinutes: settings.roundingRuleMinutes,
      });
      legacyHoursByEmp.set(epochId, totalHours);
    }
  }

  // Combine per-employee totals from both sources before applying weekly OT,
  // so a spanning week is treated as one continuous week of work.
  const allHourEpochIds = new Set<number>([
    ...ledgerHoursByEmp.keys(),
    ...legacyHoursByEmp.keys(),
  ]);
  for (const epochId of allHourEpochIds) {
    const total = (ledgerHoursByEmp.get(epochId) ?? 0) + (legacyHoursByEmp.get(epochId) ?? 0);
    hoursThisWeek += total;
    if (total > settings.overtimeThresholdWeekly) {
      overtimeHoursThisWeek += total - settings.overtimeThresholdWeekly;
    }
  }

  const thirtyDaysOut = new Date();
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  const expiringCertifications = allCerts.filter((c) => {
    if (!c.expiresDate) return false;
    const exp = new Date(c.expiresDate);
    return exp >= summaryNow && exp <= thirtyDaysOut;
  }).length;

  return {
    totalEmployees,
    activeEmployees,
    clockedInNow,
    onBreakNow,
    pendingTimesheets,
    pendingTimeOffRequests: pendingTimeOffRows.length,
    hoursThisWeek: Math.round(hoursThisWeek * 100) / 100,
    overtimeHoursThisWeek: Math.round(overtimeHoursThisWeek * 100) / 100,
    expiringCertifications,
    missingPunchCount: missingPunchEpochIds.size,
  };
}

export interface ClockedInEmployee {
  /** Legacy Employee API shape — PIN hash always redacted */
  employee: Employee;
  clockedInAt: string;
  status: string;
  hoursToday: number;
}

export interface EmployeeStatusEntry {
  employee: Employee;
  status: "clocked_in" | "on_break" | "clocked_out";
  clockedInAt?: string;
  hoursToday?: number;
}

export async function getEmployeeStatus(): Promise<EmployeeStatusEntry[]> {
  const allEmployees = await listResolvedEmployees();
  // Only include employees with a timekeeping anchor — public-only employees
  // cannot be mapped to the Employee API shape via toApiEmployee().
  const activeEmployees = allEmployees.filter((e) => e.isActive && e.timekeepingId != null);
  const empByEpochId = new Map(activeEmployees.map((e) => [e.epochEmployeeId, e]));

  // IMPORTANT — ID namespace:
  // punchesTable.employeeId references public.employees.id (epochEmployeeId),
  // NOT timekeeping.employees.id. All filtering must use epochEmployeeId.
  //
  // Legacy path uses two batched queries processed in memory:
  //   Query A — most recent punch per employee (DISTINCT ON, no time limit):
  //     Status derivation so we never miss an employee who clocked in long ago.
  //   Query B — punches from the last 2 days (date-bounded):
  //     Hours-today and clockedInAt computation.
  const epochIds = activeEmployees.map((e) => e.epochEmployeeId);
  const epochIdToEmp = new Map(activeEmployees.map((e) => [e.epochEmployeeId, e]));

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  // Run all DB queries in parallel: DISTINCT ON latest punch (via ORM selectDistinctOn
  // which avoids raw SQL array binding issues), today's punches, open ledger sessions,
  // and today's ledger sessions.
  //
  // DISTINCT ON: one row per employee — the most recent punch regardless of age.
  // This guarantees we catch employees who clocked in weeks ago and never clocked out.
  const [latestPunchRows, todayPunches, openSessions, todayLedgerSessions] =
    await Promise.all([
      epochIds.length > 0
        ? db
            .selectDistinctOn([punchesTable.employeeId])
            .from(punchesTable)
            .where(inArray(punchesTable.employeeId, epochIds))
            .orderBy(punchesTable.employeeId, desc(punchesTable.punchedAt))
        : Promise.resolve([] as (typeof punchesTable.$inferSelect)[]),
      epochIds.length > 0
        ? db
            .select()
            .from(punchesTable)
            .where(and(inArray(punchesTable.employeeId, epochIds), gte(punchesTable.punchedAt, twoDaysAgo)))
            .orderBy(desc(punchesTable.punchedAt))
        : Promise.resolve([] as (typeof punchesTable.$inferSelect)[]),
      db
        .select()
        .from(punchLedger)
        .where(isNull(punchLedger.clockOut))
        .orderBy(desc(punchLedger.clockIn)),
      epochIds.length > 0
        ? db
            .select()
            .from(punchLedger)
            .where(and(inArray(punchLedger.employeeId, epochIds), gte(punchLedger.clockIn, twoDaysAgo)))
        : Promise.resolve([] as (typeof punchLedger.$inferSelect)[]),
    ]);

  // Build latestLegacyPunch map: epochEmployeeId → most-recent punch row
  // (selectDistinctOn returns typed ORM rows, no manual mapping needed)
  const latestLegacyPunch = new Map<number, typeof punchesTable.$inferSelect>();
  for (const row of latestPunchRows) {
    latestLegacyPunch.set(row.employeeId, row);
  }

  // Use the shared helper for status/count computation — guarantees In/Out Board
  // and summary card counts are always derived from the same logic.
  const statusSettings = await getOrCreateSettings();
  const { start: payPeriodStart } = getPayPeriodDates(undefined, statusSettings.timezone);
  const { statusMap } = computeAttendanceState(
    allEmployees,
    latestLegacyPunch,
    openSessions,
    payPeriodStart,
  );

  // --- Enrich with accurate hoursToday ---
  // The shared helper sets hoursToday=0; now overlay real values from the
  // batched today-punches and today-ledger-sessions queries.

  // Group today's legacy punches by epochEmployeeId
  const todayByEpochId = new Map<number, (typeof todayPunches)>();
  for (const punch of todayPunches) {
    if (!todayByEpochId.has(punch.employeeId)) todayByEpochId.set(punch.employeeId, []);
    todayByEpochId.get(punch.employeeId)!.push(punch);
  }

  // Compute legacy hoursToday per employee using derivePunchStatus
  for (const [epochId, emp] of epochIdToEmp) {
    const entry = statusMap.get(epochId);
    if (!entry || entry.status === "clocked_out") continue;

    const todayList = todayByEpochId.get(epochId) ?? [];
    const latestRow = latestLegacyPunch.get(epochId);

    // Merge: most-recent punch (for status) + today's punches (for hours)
    let mergedPunches: (typeof todayPunches) = todayList;
    if (latestRow && !todayList.some((p) => p.id === latestRow.id)) {
      mergedPunches = [latestRow, ...todayList];
    }

    if (mergedPunches.length > 0) {
      const { clockedInAt, hoursToday } = derivePunchStatus(mergedPunches, emp.timezone ?? "UTC");
      statusMap.set(epochId, {
        ...entry,
        clockedInAt: clockedInAt?.toISOString() ?? entry.clockedInAt,
        hoursToday,
      });
    }
  }

  // Compute ledger hoursToday per epochEmployeeId.
  // todayLedgerSessions covers sessions from the last 2 days.
  // For stale open sessions (started > 2 days ago), we supplement with openSessions
  // and clip to today midnight so only today's portion is counted.
  const now = new Date();
  const ledgerHoursByEmpId = new Map<number, number>();

  // Build a set of session IDs already covered by todayLedgerSessions to avoid double-counting
  const coveredSessionIds = new Set(todayLedgerSessions.map((s) => s.id));

  for (const session of todayLedgerSessions) {
    if (session.laborClass === "BREAK") continue;
    const emp = empByEpochId.get(session.employeeId);
    if (!emp) continue;

    const timezone = emp.timezone ?? "UTC";
    const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone });
    const sessionDateStr = new Date(session.clockIn).toLocaleDateString("en-CA", { timeZone: timezone });
    if (sessionDateStr !== todayStr) continue;

    const end = session.clockOut ? new Date(session.clockOut) : now;
    const hrs = Math.max(0, (end.getTime() - new Date(session.clockIn).getTime()) / 3_600_000);
    ledgerHoursByEmpId.set(session.employeeId, (ledgerHoursByEmpId.get(session.employeeId) ?? 0) + hrs);
  }

  // Second pass: open sessions older than 2 days (stale) that todayLedgerSessions missed.
  // These sessions are still open (clock_out IS NULL), so hours are still accumulating today.
  // Clip the session start to today UTC midnight so only today's hours are counted.
  const todayUTCMidnightMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (const session of openSessions) {
    if (coveredSessionIds.has(session.id)) continue;
    if (session.laborClass === "BREAK") continue;
    const emp = empByEpochId.get(session.employeeId);
    if (!emp) continue;

    // Clip: only count from UTC midnight today forward (session started before today)
    const start = Math.max(new Date(session.clockIn).getTime(), todayUTCMidnightMs);
    const hrs = Math.max(0, (now.getTime() - start) / 3_600_000);
    if (hrs > 0) {
      ledgerHoursByEmpId.set(session.employeeId, (ledgerHoursByEmpId.get(session.employeeId) ?? 0) + hrs);
    }
  }

  // Overlay ledger hoursToday onto status entries for ledger-path employees
  for (const [epochId, ledgerHrs] of ledgerHoursByEmpId) {
    const entry = statusMap.get(epochId);
    if (!entry || entry.status === "clocked_out") continue;
    const existing = entry.hoursToday ?? 0;
    statusMap.set(epochId, {
      ...entry,
      hoursToday: Math.round((existing + ledgerHrs) * 100) / 100,
    });
  }

  // Sort: clocked_in first, on_break second, clocked_out last; alphabetically within each group
  const order: Record<string, number> = { clocked_in: 0, on_break: 1, clocked_out: 2 };
  return Array.from(statusMap.values()).sort((a, b) => {
    const orderDiff = order[a.status] - order[b.status];
    if (orderDiff !== 0) return orderDiff;
    const aName = `${a.employee.lastName} ${a.employee.firstName}`.toLowerCase();
    const bName = `${b.employee.lastName} ${b.employee.firstName}`.toLowerCase();
    return aName.localeCompare(bName);
  });
}

export async function getClockedInEmployees(): Promise<ClockedInEmployee[]> {
  const allStatuses = await getEmployeeStatus();
  return allStatuses
    .filter((entry) => entry.status === "clocked_in" || entry.status === "on_break")
    .map((entry) => ({
      employee: entry.employee,
      clockedInAt: entry.clockedInAt ?? new Date().toISOString(),
      status: entry.status,
      hoursToday: entry.hoursToday ?? 0,
    }));
}

export interface DailyHours {
  date: string;
  hours: number;
  regularHours: number;
  overtimeHours: number;
}

export async function getWeeklyHours(filters?: {
  employeeId?: number | null;
}): Promise<DailyHours[]> {
  const settings = await getOrCreateSettings();
  const tz = settings.timezone;
  const weekStart = startOfWeekInTZ(tz, settings.workweekStartDay);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  let epochIdFilter: number | null = null;
  if (filters?.employeeId != null) {
    const allEmployees = await listResolvedEmployees();
    const match = allEmployees.find((e) => e.timekeepingId === filters.employeeId);
    epochIdFilter = match?.epochEmployeeId ?? -1;
  }

  const dayMap = new Map<string, Punch[]>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const key = toTZDateStr(d, tz);
    dayMap.set(key, []);
  }

  const weekStartDateStr = toTZDateStr(weekStart, tz);
  const weekEndDateStr = toTZDateStr(new Date(weekEnd.getTime() - 1), tz);
  const useLedgerStart = weekStartDateStr >= punchLedgerCutoverDate;
  const useLedgerEnd = weekEndDateStr >= punchLedgerCutoverDate;
  const cutoverBoundary = midnightInTZ(punchLedgerCutoverDate, tz);

  const hoursByDay = new Map<string, number>();
  for (const key of dayMap.keys()) {
    hoursByDay.set(key, 0);
  }

  const needsLegacy = !useLedgerStart;
  const needsLedger = useLedgerEnd;
  const legacyEnd = needsLegacy && needsLedger ? cutoverBoundary : weekEnd;
  const ledgerStart = needsLegacy && needsLedger ? cutoverBoundary : weekStart;

  if (needsLedger) {
    const ledgerEpochIdFilter = epochIdFilter;
    const effectiveLedgerStart = ledgerStart;
    const weekOverlapCondition = or(
      and(gte(punchLedger.clockIn, effectiveLedgerStart), lt(punchLedger.clockIn, weekEnd)),
      and(isNull(punchLedger.clockOut), lt(punchLedger.clockIn, effectiveLedgerStart)),
      and(gte(punchLedger.clockOut, effectiveLedgerStart), lt(punchLedger.clockIn, effectiveLedgerStart))
    );
    const ledgerWhereClause =
      ledgerEpochIdFilter === -1
        ? undefined
        : ledgerEpochIdFilter != null
        ? and(eq(punchLedger.employeeId, ledgerEpochIdFilter), weekOverlapCondition)
        : weekOverlapCondition;

    const now = new Date();
    const ledgerStartMs = effectiveLedgerStart.getTime();
    const weekEndMs = weekEnd.getTime();

    if (ledgerEpochIdFilter !== -1) {
      const ledgerSessions = await db
        .select()
        .from(punchLedger)
        .where(ledgerWhereClause);

      for (const session of ledgerSessions) {
        if (session.laborClass === "BREAK") continue;

        const sessionStart = Math.max(new Date(session.clockIn).getTime(), ledgerStartMs);
        const rawEnd = session.clockOut
          ? new Date(session.clockOut).getTime()
          : now.getTime();
        const sessionEnd = Math.min(rawEnd, weekEndMs);

        if (sessionEnd <= sessionStart) continue;

        let cursor = sessionStart;
        while (cursor < sessionEnd) {
          const dayKey = toTZDateStr(new Date(cursor), tz);
          const [y, m, d] = dayKey.split("-").map(Number);
          const nextDayStr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
          const dayBoundaryMs = midnightInTZ(nextDayStr, tz).getTime();

          const sliceEnd = Math.min(sessionEnd, dayBoundaryMs);
          const hrs = (sliceEnd - cursor) / 3_600_000;
          hoursByDay.set(dayKey, (hoursByDay.get(dayKey) ?? 0) + hrs);
          cursor = sliceEnd;
        }
      }
    }
  }

  if (needsLegacy) {
    const effectiveLegacyEnd = legacyEnd;
    const baseCondition = and(
      gte(punchesTable.punchedAt, weekStart),
      lt(punchesTable.punchedAt, effectiveLegacyEnd)
    );
    const whereClause =
      epochIdFilter != null && epochIdFilter !== -1
        ? and(baseCondition, eq(punchesTable.employeeId, epochIdFilter))
        : baseCondition;

    const punches: (typeof punchesTable.$inferSelect)[] = epochIdFilter === -1
      ? []
      : await db.select().from(punchesTable).where(whereClause);

    for (const p of punches) {
      const key = toTZDateStr(new Date(p.punchedAt), tz);
      if (dayMap.has(key)) {
        dayMap.get(key)!.push(p);
      }
    }

    for (const [day, dayPunches] of dayMap) {
      if (dayPunches.length > 0) {
        hoursByDay.set(day, (hoursByDay.get(day) ?? 0) + computeHoursFromPunches(dayPunches, settings.roundingRuleMinutes));
      }
    }
  }

  const result: DailyHours[] = [];
  for (const [date] of Array.from(dayMap)) {
    const hours = hoursByDay.get(date) ?? 0;
    const regularHours = Math.min(hours, settings.overtimeThresholdDaily);
    const overtimeHours = Math.max(0, hours - settings.overtimeThresholdDaily);
    result.push({ date, hours, regularHours, overtimeHours });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Per-employee hours for a given date range (defaults to current pay period)
// ---------------------------------------------------------------------------

export interface EmployeePeriodHours {
  employeeId: number;
  name: string;
  department: string | null;
  totalHours: number;
  regularHours: number;
}

export async function getEmployeeHoursForPeriod(
  from?: Date,
  to?: Date
): Promise<EmployeePeriodHours[]> {
  const settings = await getOrCreateSettings();
  const tz = settings.timezone;
  const { start: defaultStart, end: defaultEnd } = getPayPeriodDates(undefined, tz);
  const rangeStart = from ?? defaultStart;
  const rangeEnd = to ?? defaultEnd;

  const allEmployees = await listResolvedEmployees();
  const activeEmployees = allEmployees.filter((e) => e.isActive);
  const now = new Date();

  const hoursByEpochId = new Map<number, number>();
  for (const emp of activeEmployees) {
    hoursByEpochId.set(emp.epochEmployeeId, 0);
  }

  const rangeStartDateStr = toTZDateStr(rangeStart, tz);
  const rangeEndDateStr = toTZDateStr(rangeEnd, tz);
  const useLedgerStart = rangeStartDateStr >= punchLedgerCutoverDate;
  const useLedgerEnd = rangeEndDateStr >= punchLedgerCutoverDate;
  const cutoverBoundary = midnightInTZ(punchLedgerCutoverDate, tz);

  const needsLegacy = !useLedgerStart;
  const needsLedger = useLedgerEnd;
  const legacyEnd = needsLegacy && needsLedger ? cutoverBoundary : rangeEnd;
  const effectiveLedgerStart = needsLegacy && needsLedger ? cutoverBoundary : rangeStart;

  if (needsLedger) {
    const ledgerSessions = await db
      .select()
      .from(punchLedger)
      .where(
        or(
          and(gte(punchLedger.clockIn, effectiveLedgerStart), lte(punchLedger.clockIn, rangeEnd)),
          and(isNull(punchLedger.clockOut), lt(punchLedger.clockIn, effectiveLedgerStart)),
          and(
            gte(punchLedger.clockOut, effectiveLedgerStart),
            lt(punchLedger.clockIn, effectiveLedgerStart)
          )
        )
      );

    const ledgerStartMs = effectiveLedgerStart.getTime();
    const rangeEndMs = rangeEnd.getTime();

    for (const session of ledgerSessions) {
      if (session.laborClass === "BREAK") continue;
      const epochId = session.employeeId;
      if (!hoursByEpochId.has(epochId)) continue;

      const start = Math.max(new Date(session.clockIn).getTime(), ledgerStartMs);
      const rawEnd = session.clockOut
        ? new Date(session.clockOut).getTime()
        : now.getTime();
      const end = Math.min(rawEnd, rangeEndMs);

      if (end <= start) continue;
      const hrs = (end - start) / 3_600_000;
      hoursByEpochId.set(epochId, (hoursByEpochId.get(epochId) ?? 0) + hrs);
    }
  }

  if (needsLegacy) {
    if (activeEmployees.length > 0) {
      const legacyPunches = await db
        .select()
        .from(punchesTable)
        .where(
          and(
            gte(punchesTable.punchedAt, rangeStart),
            lt(punchesTable.punchedAt, legacyEnd)
          )
        );

      const punchesByEpochId = new Map<number, Punch[]>();
      for (const p of legacyPunches) {
        if (!punchesByEpochId.has(p.employeeId)) punchesByEpochId.set(p.employeeId, []);
        punchesByEpochId.get(p.employeeId)!.push(p);
      }

      for (const [epochId, punches] of punchesByEpochId) {
        if (!hoursByEpochId.has(epochId)) continue;
        const { totalHours } = computeTimesheetHours(punches, {
          timezone: tz,
          overtimeThresholdDaily: settings.overtimeThresholdDaily,
          overtimeThresholdWeekly: settings.overtimeThresholdWeekly,
          roundingMinutes: settings.roundingRuleMinutes,
        });
        hoursByEpochId.set(epochId, (hoursByEpochId.get(epochId) ?? 0) + totalHours);
      }
    }
  }

  const weeklyOtThreshold = settings.overtimeThresholdWeekly;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const rangeDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS) + 1);
  const numWeeks = Math.max(1, Math.ceil(rangeDays / 7));
  const regularCap = weeklyOtThreshold * numWeeks;

  const result: EmployeePeriodHours[] = [];

  for (const emp of activeEmployees) {
    const totalHours = Math.round((hoursByEpochId.get(emp.epochEmployeeId) ?? 0) * 100) / 100;
    const regularHours = Math.round(Math.min(totalHours, regularCap) * 100) / 100;
    result.push({
      employeeId: emp.epochEmployeeId,
      name: `${emp.firstName} ${emp.lastName}`,
      department: emp.department ?? null,
      totalHours,
      regularHours,
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

// ---------------------------------------------------------------------------
// Recent punch events (for the Time Clock Admin overview sidebar)
// ---------------------------------------------------------------------------

export interface RecentPunch {
  sessionId: number;
  employeeId: number;
  employeeName: string;
  department: string | null;
  punchType: "clock_in" | "clock_out" | "break_start" | "break_end" | "other";
  punchedAt: string;
  source: "kiosk" | "legacy";
}

export interface RecentPunchesResult {
  punches: RecentPunch[];
  /**
   * Number of punch or session records that were omitted because the
   * referenced employee could not be resolved (deleted / deactivated).
   * A non-zero value means data is missing from the sidebar.
   */
  orphanedCount: number;
}

/**
 * Returns the `limit` most recent punch events across all employees.
 *
 * Merges results from two sources:
 *   1. punch_ledger (kiosk/portal sessions) — each session contributes up to
 *      two events: a "clock_in" at session.clockIn and a "clock_out" at
 *      session.clockOut (only for closed sessions).
 *   2. timekeeping.punches (admin-entered / legacy punches) — each row is one
 *      event with its own type and punchedAt timestamp.
 *
 * Events from both sources are merged, deduplicated by employeeId+timestamp,
 * sorted by timestamp descending, and the top `limit` are returned.
 *
 * The result also includes `orphanedCount` — the number of records that were
 * omitted because the referenced employee could not be resolved.
 */
export async function getRecentPunches(limit = 20): Promise<RecentPunchesResult> {
  const allEmployees = await listResolvedEmployees();

  // punch_ledger.employeeId == epochEmployeeId (public.employees.id)
  const empByEpochId = new Map(allEmployees.map((e) => [e.epochEmployeeId, e]));

  // timekeeping.punches.employeeId == public.employees.id (epochEmployeeId), the same
  // namespace as punchLedger.employeeId. Legacy punches resolve via empByEpochId.

  // Fetch enough sessions to reliably produce `limit` events from punch_ledger.
  // Worst case: all sessions are open → 1 event each → need `limit` sessions.
  // Best case: all sessions are closed → 2 events each → need `limit/2` sessions.
  // Fetching `limit` sessions is always sufficient.
  const [sessions, legacyPunches] = await Promise.all([
    db
      .select()
      .from(punchLedger)
      .orderBy(desc(sql`COALESCE(${punchLedger.clockOut}, ${punchLedger.clockIn})`))
      .limit(limit),
    db
      .select()
      .from(punchesTable)
      .orderBy(desc(punchesTable.punchedAt))
      .limit(limit),
  ]);

  type PunchEvent = RecentPunch & { _ts: number };
  const events: PunchEvent[] = [];
  let orphanedCount = 0;

  // Punch-type resolution helpers — defined once, used in the legacy punch loop below
  const knownPunchTypes = ["clock_in", "clock_out", "break_start", "break_end"] as const;
  type KnownPunchType = (typeof knownPunchTypes)[number];
  const isKnownPunchType = (t: string): t is KnownPunchType =>
    (knownPunchTypes as readonly string[]).includes(t);

  // Expand each punch_ledger session into individual punch events.
  // BREAK sessions are excluded — they represent rest periods, not work
  // punches, and cluttering the recent-punches sidebar with them would
  // obscure meaningful clock-in/out activity.
  for (const session of sessions) {
    if (session.laborClass === 'BREAK') continue;
    const emp = empByEpochId.get(session.employeeId);
    if (!emp) {
      console.warn(
        `[getRecentPunches] Kiosk session id=${session.id} references employeeId=${session.employeeId} ` +
          `which is not in the resolved employee list. The session will be omitted from the sidebar. ` +
          `The employee may have been deleted or deactivated after the punch was recorded.`
      );
      orphanedCount++;
      continue;
    }

    const base = {
      sessionId: session.id,
      employeeId: emp.epochEmployeeId,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      department: emp.department ?? null,
    };

    // Always emit the clock-in event
    const clockInTs = new Date(session.clockIn).getTime();
    events.push({ ...base, source: "kiosk", punchType: "clock_in", punchedAt: new Date(session.clockIn).toISOString(), _ts: clockInTs });

    // Emit clock-out event only for closed sessions
    if (session.clockOut != null) {
      const clockOutTs = new Date(session.clockOut).getTime();
      events.push({ ...base, source: "kiosk", punchType: "clock_out", punchedAt: new Date(session.clockOut).toISOString(), _ts: clockOutTs });
    }
  }

  // Add legacy punch records from timekeeping.punches.
  // punchesTable.employeeId references public.employees.id (epochEmployeeId),
  // consistent with punchLedger.employeeId — use empByEpochId for lookup.
  for (const punch of legacyPunches) {
    const emp = empByEpochId.get(punch.employeeId);
    if (!emp) {
      console.warn(
        `[getRecentPunches] Legacy punch id=${punch.id} references epochEmployeeId=${punch.employeeId} ` +
          `which is not in the resolved employee list. The punch will be omitted from the sidebar. ` +
          `The employee may have been deleted or deactivated after the punch was recorded.`
      );
      orphanedCount++;
      continue;
    }

    // Skip rows whose punch type is not one of the recognised values so they
    // never surface in the Recent Punches feed with an ambiguous label.
    if (!isKnownPunchType(punch.type)) {
      console.warn(
        `[getRecentPunches] Unknown punch type "${punch.type}" for punch id=${punch.id} ` +
          `(employeeId=${punch.employeeId}). Skipping.`
      );
      continue;
    }
    const punchType = punch.type;

    const punchedAt = new Date(punch.punchedAt);
    events.push({
      sessionId: punch.id,
      employeeId: emp.epochEmployeeId,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      department: emp.department ?? null,
      source: "legacy",
      punchType,
      punchedAt: punchedAt.toISOString(),
      _ts: punchedAt.getTime(),
    });
  }

  // Sort all events by their actual timestamp, most recent first
  events.sort((a, b) => b._ts - a._ts);

  // Deduplicate by employeeId + timestamp (handles punches that exist in both sources)
  const seen = new Set<string>();
  const deduped: PunchEvent[] = [];
  for (const event of events) {
    const key = `${event.employeeId}:${event._ts}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(event);
    }
  }

  return {
    punches: deduped.slice(0, limit).map(({ _ts: _ignored, ...rest }) => rest),
    orphanedCount,
  };
}

// ---------------------------------------------------------------------------
// Orphaned session cleanup utility
// ---------------------------------------------------------------------------

export interface OrphanedSession {
  sessionId: number;
  epochEmployeeId: number;
  employeeName: string;
  clockInAt: string;
  ageHours: number;
}

/**
 * Lists all punch_ledger sessions with clockOut IS NULL and clockIn older than
 * the stale threshold (default: 24 hours). Intended for admin review so ops can
 * manually close sessions that were never clocked out.
 *
 * This function is read-only — it does not modify any rows.
 */
export async function listOrphanedSessions(
  thresholdMs: number = STALE_SESSION_THRESHOLD_MS
): Promise<OrphanedSession[]> {
  const allEmployees = await listResolvedEmployees();
  const empByEpochId = new Map(allEmployees.map((e) => [e.epochEmployeeId, e]));

  const cutoff = new Date(Date.now() - thresholdMs);

  const staleSessions = await db
    .select()
    .from(punchLedger)
    .where(and(isNull(punchLedger.clockOut), lt(punchLedger.clockIn, cutoff)))
    .orderBy(punchLedger.clockIn);

  const now = new Date();
  const result: OrphanedSession[] = [];

  for (const session of staleSessions) {
    const emp = empByEpochId.get(session.employeeId);
    const employeeName = emp ? `${emp.firstName} ${emp.lastName}` : `Employee #${session.employeeId}`;
    const clockInDate = new Date(session.clockIn);
    const ageHours = Math.round(((now.getTime() - clockInDate.getTime()) / 3_600_000) * 10) / 10;

    result.push({
      sessionId: session.id,
      epochEmployeeId: session.employeeId,
      employeeName,
      clockInAt: clockInDate.toISOString(),
      ageHours,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// COMPLIANCE EXCEPTIONS
// ---------------------------------------------------------------------------

export type ComplianceExceptionType = 'uncertified' | 'correction_pending' | 'admin_override' | 'late_submission';
export type ComplianceSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface ComplianceException {
  id: string;
  exceptionType: ComplianceExceptionType;
  severity: ComplianceSeverity;
  employeeId: number;
  employeeName: string;
  timesheetId?: number;
  correctionId?: number;
  detailLabel: string;
  periodLabel: string;
}

/**
 * Aggregate all open compliance exceptions across four categories:
 *   1. Uncertified timesheets (status not in certified/locked, periodEnd passed) → High
 *   2. Pending correction requests (status = "pending") — stale >7d → High, fresh → Medium
 *   3. Admin override certifications (TIME_CERTIFIED_ADMIN audit log, deduped by timesheet) → Medium
 *   4. Late submissions (draft/submitted past grace window) → Medium or High
 *
 * Severity mapping mirrors edriDomainScorers.ts thresholds.
 */
export async function getComplianceExceptions(filters?: {
  type?: ComplianceExceptionType;
  severity?: ComplianceSeverity;
}): Promise<ComplianceException[]> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const policy = await getOrCreatePolicySettings();
  const graceDays = policy.lateSubmissionGraceDays ?? 7;

  // Build a map of employeeId → name from public.employees
  const empRows = await db
    .select({ id: publicEmployees.id, name: publicEmployees.name })
    .from(publicEmployees);
  const empNameMap = new Map<number, string>();
  for (const e of empRows) {
    empNameMap.set(e.id, e.name || `Employee #${e.id}`);
  }

  const exceptions: ComplianceException[] = [];

  // ── 1. Uncertified timesheets ──────────────────────────────────────────────
  if (!filters?.type || filters.type === 'uncertified') {
    const uncertified = await db
      .select()
      .from(timesheetsTable)
      .where(
        and(
          notInArray(timesheetsTable.status, ['certified', 'locked']),
          lt(timesheetsTable.periodEnd, todayStr)
        )
      );

    for (const ts of uncertified) {
      const severity: ComplianceSeverity = 'High';
      if (filters?.severity && filters.severity !== severity) continue;
      exceptions.push({
        id: `uncertified-${ts.id}`,
        exceptionType: 'uncertified',
        severity,
        employeeId: ts.employeeId,
        employeeName: empNameMap.get(ts.employeeId) ?? `Employee #${ts.employeeId}`,
        timesheetId: ts.id,
        detailLabel: `Timesheet status: ${ts.status}`,
        periodLabel: `${ts.periodStart} – ${ts.periodEnd}`,
      });
    }
  }

  // ── 2. Pending correction requests ────────────────────────────────────────
  if (!filters?.type || filters.type === 'correction_pending') {
    const corrections = await db
      .select()
      .from(timesheetCorrectionsTable)
      .where(eq(timesheetCorrectionsTable.status, 'pending'));

    const correctionTsIds = [...new Set(corrections.map(c => c.timesheetId))];
    const correctionTimesheets = correctionTsIds.length > 0
      ? await db.select().from(timesheetsTable).where(inArray(timesheetsTable.id, correctionTsIds))
      : [];
    const correctionTsMap = new Map(correctionTimesheets.map(ts => [ts.id, ts]));

    const staleThreshold = new Date(today.getTime() - 7 * 86_400_000);

    for (const c of corrections) {
      const ts = correctionTsMap.get(c.timesheetId);
      const isStale = new Date(c.requestedAt) < staleThreshold;
      const severity: ComplianceSeverity = isStale ? 'High' : 'Medium';
      if (filters?.severity && filters.severity !== severity) continue;
      const employeeId = ts?.employeeId ?? c.requestedByEmployeeId;
      const daysOld = Math.floor((today.getTime() - new Date(c.requestedAt).getTime()) / 86_400_000);
      exceptions.push({
        id: `correction-${c.id}`,
        exceptionType: 'correction_pending',
        severity,
        employeeId,
        employeeName: empNameMap.get(employeeId) ?? `Employee #${employeeId}`,
        timesheetId: c.timesheetId,
        correctionId: c.id,
        detailLabel: isStale
          ? `Stale pending correction (${daysOld}d old): ${c.reason.slice(0, 80)}`
          : `Pending correction: ${c.reason.slice(0, 80)}`,
        periodLabel: ts ? `${ts.periodStart} – ${ts.periodEnd}` : `Timesheet #${c.timesheetId}`,
      });
    }
  }

  // ── 3. Admin overrides ────────────────────────────────────────────────────
  if (!filters?.type || filters.type === 'admin_override') {
    const overrides = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.action, 'TIME_CERTIFIED_ADMIN'))
      .orderBy(desc(auditLogTable.createdAt));

    // Deduplicate by timesheet (recordId), keep most recent
    const seenTimesheets = new Set<number>();
    const deduped: typeof overrides = [];
    for (const row of overrides) {
      if (!seenTimesheets.has(row.recordId)) {
        seenTimesheets.add(row.recordId);
        deduped.push(row);
      }
    }

    const overrideTsIds = deduped.map(r => r.recordId);
    const overrideTimesheets = overrideTsIds.length > 0
      ? await db.select().from(timesheetsTable).where(inArray(timesheetsTable.id, overrideTsIds))
      : [];
    const overrideTsMap = new Map(overrideTimesheets.map(ts => [ts.id, ts]));

    for (const row of deduped) {
      const severity: ComplianceSeverity = 'Medium';
      if (filters?.severity && filters.severity !== severity) continue;
      const ts = overrideTsMap.get(row.recordId);
      if (!ts) continue;
      const newVals = (row.newValues ?? {}) as Record<string, unknown>;
      const reason = (newVals.overrideReason as string | undefined) ?? 'Admin certification override';
      exceptions.push({
        id: `admin-override-${row.id}`,
        exceptionType: 'admin_override',
        severity,
        employeeId: ts.employeeId,
        employeeName: empNameMap.get(ts.employeeId) ?? `Employee #${ts.employeeId}`,
        timesheetId: ts.id,
        detailLabel: `Certified by admin: ${row.actorEmail ?? 'unknown'} — ${reason.slice(0, 80)}`,
        periodLabel: `${ts.periodStart} – ${ts.periodEnd}`,
      });
    }
  }

  // ── 4. Late submissions ───────────────────────────────────────────────────
  if (!filters?.type || filters.type === 'late_submission') {
    const graceDeadline = new Date(today.getTime() - graceDays * 86_400_000);
    const graceDeadlineStr = graceDeadline.toISOString().slice(0, 10);

    const lateSubmissions = await db
      .select()
      .from(timesheetsTable)
      .where(
        and(
          inArray(timesheetsTable.status, ['draft', 'submitted']),
          lt(timesheetsTable.periodEnd, graceDeadlineStr)
        )
      );

    for (const ts of lateSubmissions) {
      const daysLate = Math.floor((today.getTime() - new Date(ts.periodEnd).getTime()) / 86_400_000) - graceDays;
      const severity: ComplianceSeverity = daysLate > 14 ? 'High' : 'Medium';
      if (filters?.severity && filters.severity !== severity) continue;
      exceptions.push({
        id: `late-${ts.id}`,
        exceptionType: 'late_submission',
        severity,
        employeeId: ts.employeeId,
        employeeName: empNameMap.get(ts.employeeId) ?? `Employee #${ts.employeeId}`,
        timesheetId: ts.id,
        detailLabel: `${daysLate}d past ${graceDays}-day grace window (status: ${ts.status})`,
        periodLabel: `${ts.periodStart} – ${ts.periodEnd}`,
      });
    }
  }

  // Sort: Critical → High → Medium → Low, then alphabetically by name
  const severityOrder: Record<ComplianceSeverity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  exceptions.sort((a, b) => {
    const sd = severityOrder[a.severity] - severityOrder[b.severity];
    if (sd !== 0) return sd;
    return a.employeeName.localeCompare(b.employeeName);
  });

  return exceptions;
}
