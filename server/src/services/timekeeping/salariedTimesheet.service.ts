/**
 * Salaried Timesheet Service — Phase 1
 *
 * Responsibilities (Phase 1 only — read-only safe):
 *   - getOrCreateWeeklyTimesheet()   auto-creates the shell header record
 *   - injectHolidayLines()           locks placeholder rows for US holidays
 *   - injectApprovedPTO()            locks placeholder rows from leave_entries
 *   - getIndirectCodes()             returns active indirect cost codes with chargeCodeId
 *   - getAdminReviewQueue()          returns all salaried timesheets for review
 *
 * NON-NEGOTIABLE:
 *   - No writes to punch_ledger or hourly timesheet tables
 *   - All new writes go to timekeeping.salaried_* tables only
 *   - Feature flag salariedTimesheetEnabled must be checked by callers
 *   - Every injected line MUST carry a valid chargeCodeId — fail-closed, no silent fallback
 */

import { db } from "../../../db";
import { pool } from "../../../db";
import {
  salariedTimesheetsTable,
  salariedTimesheetLinesTable,
  salariedTimesheetAuditTable,
  indirectCodesTable,
  employeesTable,
  leaveEntriesTable,
} from "../../schema/timekeeping";
import { employees, travelers } from "../../../schema";
import { eq, and, gte, lte, asc, desc, isNull } from "drizzle-orm";

/**
 * Minimal interface for a Drizzle transaction client (or the db itself).
 * Used so functions can be called both within a transaction and standalone.
 */
export type TxClient = {
  select: typeof db.select;
  insert: typeof db.insert;
  update: typeof db.update;
  delete: typeof db.delete;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeekBounds {
  weekStart: string;
  weekEnd: string;
}

export interface SalariedTimesheetWithLines {
  timesheet: typeof salariedTimesheetsTable.$inferSelect;
  lines: (typeof salariedTimesheetLinesTable.$inferSelect)[];
}

// ---------------------------------------------------------------------------
// Week helpers
// ---------------------------------------------------------------------------

/**
 * Parse a YYYY-MM-DD string as a local Date (no timezone shift).
 */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/**
 * Format a Date as YYYY-MM-DD using local calendar.
 */
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Given a week-start string (Monday), compute the week-end (Sunday).
 */
export function computeWeekEnd(weekStart: string): string {
  const d = parseLocalDate(weekStart);
  d.setDate(d.getDate() + 6);
  return toDateStr(d);
}

/**
 * Returns the Monday of the current week as YYYY-MM-DD.
 */
export function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return toDateStr(monday);
}

/**
 * Returns YYYY-MM-DD strings for each calendar day in [weekStart, weekEnd].
 */
function weekDays(weekStart: string, weekEnd: string): string[] {
  const days: string[] = [];
  const cursor = parseLocalDate(weekStart);
  const end = parseLocalDate(weekEnd);
  while (cursor <= end) {
    days.push(toDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// ---------------------------------------------------------------------------
// US Federal Holiday list  (Phase 1 — static, Phase 3+ can replace with DB)
// Returns YYYY-MM-DD strings for the given calendar year.
// ---------------------------------------------------------------------------

function usHolidaysForYear(year: number): { date: string; name: string }[] {
  const holidays: { date: string; name: string }[] = [];

  // Helper: nth weekday in month (1-indexed, 0=Sun)
  function nthWeekday(y: number, month: number, weekday: number, n: number): Date {
    const d = new Date(y, month - 1, 1);
    let count = 0;
    while (true) {
      if (d.getDay() === weekday) {
        count++;
        if (count === n) return new Date(d);
      }
      d.setDate(d.getDate() + 1);
    }
  }

  // Helper: last weekday in month
  function lastWeekday(y: number, month: number, weekday: number): Date {
    const d = new Date(y, month, 0); // last day of month
    while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
    return d;
  }

  const fmt = (d: Date) => toDateStr(d);

  holidays.push({ date: `${year}-01-01`, name: "New Year's Day" });
  holidays.push({ date: fmt(nthWeekday(year, 1, 1, 3)), name: "Martin Luther King Jr. Day" });
  holidays.push({ date: fmt(nthWeekday(year, 2, 1, 3)), name: "Presidents' Day" });
  holidays.push({ date: fmt(lastWeekday(year, 5, 1)), name: "Memorial Day" });
  holidays.push({ date: `${year}-06-19`, name: "Juneteenth" });
  holidays.push({ date: `${year}-07-04`, name: "Independence Day" });
  holidays.push({ date: fmt(nthWeekday(year, 9, 1, 1)), name: "Labor Day" });
  holidays.push({ date: fmt(nthWeekday(year, 11, 4, 4)), name: "Thanksgiving Day" });
  holidays.push({ date: `${year}-12-25`, name: "Christmas Day" });

  return holidays;
}

// ---------------------------------------------------------------------------
// Indirect code lookup — fail-closed helpers
// ---------------------------------------------------------------------------

/**
 * Maps a leave_entries.leaveType to the canonical indirect_codes.code.
 * This is the authoritative table — it determines which charge code pool
 * receives each leave type.
 */
const LEAVE_TYPE_TO_INDIRECT_CODE: Record<string, string> = {
  pto:         "PTO",
  sick:        "SICK",
  holiday:     "HOLIDAY",
  bereavement: "SICK",     // no BEREAVEMENT code yet; closest pool is SICK
  other:       "INDIRECT",
};

interface ResolvedIndirectCode {
  id: number;
  code: string;
  chargeCodeId: number;
}

/**
 * Load all active indirect codes as a map keyed by code.
 * Used by injection functions to avoid repeated DB lookups per line.
 * Fail-closed: throws if any active code lacks a chargeCodeId.
 */
async function loadIndirectCodeMap(): Promise<Map<string, ResolvedIndirectCode>> {
  const rows = await db
    .select()
    .from(indirectCodesTable)
    .where(eq(indirectCodesTable.isActive, true));

  const map = new Map<string, ResolvedIndirectCode>();
  const missing: string[] = [];

  for (const row of rows) {
    if (!row.chargeCodeId) {
      missing.push(row.code);
      continue;
    }
    map.set(row.code, {
      id: row.id,
      code: row.code,
      chargeCodeId: row.chargeCodeId,
    });
  }

  if (missing.length > 0) {
    throw new Error(
      `Indirect codes missing chargeCodeId mapping: ${missing.join(", ")}. ` +
      `Run the Blocker 2 Phase A migration before enabling salaried timesheets.`
    );
  }

  return map;
}

/**
 * Resolve indirect code + chargeCodeId for a given code.
 * Throws hard if not found — never silently falls back.
 */
function requireIndirectCode(
  map: Map<string, ResolvedIndirectCode>,
  code: string,
  context: string,
): ResolvedIndirectCode {
  const resolved = map.get(code);
  if (!resolved) {
    throw new Error(
      `Cannot inject ${context}: indirect code '${code}' not found or has no chargeCodeId mapping. ` +
      `Ensure the Blocker 2 Phase A migration has run and the code is active.`
    );
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Core service functions
// ---------------------------------------------------------------------------

/**
 * Returns or creates the weekly salaried timesheet header for the given
 * epoch employee + week.  Does NOT inject lines — call injectHolidayLines
 * and injectApprovedPTO after this.
 */
export async function getOrCreateWeeklyTimesheet(
  epochEmployeeId: number,
  weekStart: string,
  tx?: TxClient,
): Promise<typeof salariedTimesheetsTable.$inferSelect> {
  const client = tx ?? (db as unknown as TxClient);
  const weekEnd = computeWeekEnd(weekStart);

  const existing = await client
    .select()
    .from(salariedTimesheetsTable)
    .where(
      and(
        eq(salariedTimesheetsTable.employeeId, epochEmployeeId),
        eq(salariedTimesheetsTable.periodStart, weekStart),
      ),
    )
    .limit(1);

  if (existing.length > 0) return existing[0]!;

  const [created] = await client
    .insert(salariedTimesheetsTable)
    .values({
      employeeId: epochEmployeeId,
      periodStart: weekStart,
      periodEnd: weekEnd,
      status: "OPEN",
      totalActualHours: 0,
    })
    .returning();

  return created!;
}

/**
 * For each US holiday that falls within the week, upsert a locked HOLIDAY
 * line (8 hours placeholder) if one does not already exist.
 *
 * Fail-closed: throws if the HOLIDAY indirect code has no chargeCodeId.
 * Returns the lines that were created (or already existed).
 */
export async function injectHolidayLines(
  timesheetId: number,
  weekStart: string,
  weekEnd: string,
): Promise<(typeof salariedTimesheetLinesTable.$inferSelect)[]> {
  // Resolve HOLIDAY indirect code — fail-closed
  const indirectMap = await loadIndirectCodeMap();
  const holidayCode = requireIndirectCode(indirectMap, "HOLIDAY", "holiday line");

  const days = weekDays(weekStart, weekEnd);
  const years = [...new Set(days.map((d) => Number(d.slice(0, 4))))];
  const holidays = years.flatMap(usHolidaysForYear);
  const holidayMap = new Map(holidays.map((h) => [h.date, h.name]));

  const created: (typeof salariedTimesheetLinesTable.$inferSelect)[] = [];

  for (const day of days) {
    const holidayName = holidayMap.get(day);
    if (!holidayName) continue;

    // Check if a HOLIDAY line already exists for this date
    const existing = await db
      .select()
      .from(salariedTimesheetLinesTable)
      .where(
        and(
          eq(salariedTimesheetLinesTable.timesheetId, timesheetId),
          eq(salariedTimesheetLinesTable.date, day),
          eq(salariedTimesheetLinesTable.lineType, "HOLIDAY"),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      created.push(existing[0]!);
      continue;
    }

    const [line] = await db
      .insert(salariedTimesheetLinesTable)
      .values({
        timesheetId,
        date: day,
        lineType: "HOLIDAY",
        indirectCodeId: holidayCode.id,
        chargeCodeId: holidayCode.chargeCodeId,
        hours: 8,
        source: "HOLIDAY_AUTO",
        note: holidayName,
        isLocked: true,
      })
      .returning();

    created.push(line!);
  }

  return created;
}

/**
 * Injects approved PTO leave_entries for this week as locked lines.
 * Each line carries the chargeCodeId derived from the leave type via
 * the indirect code mapping — no text-label-only classification.
 *
 * Fail-closed: throws if any required indirect code has no chargeCodeId.
 *
 * Bridges via timekeeping.employees.epochEmployeeId to resolve the
 * timekeeping employee ID from the public employee ID.
 */
export async function injectApprovedPTO(
  timesheetId: number,
  epochEmployeeId: number,
  weekStart: string,
  weekEnd: string,
  tx?: TxClient,
): Promise<(typeof salariedTimesheetLinesTable.$inferSelect)[]> {
  const client = tx ?? (db as unknown as TxClient);

  // Pre-load all indirect codes — fail-closed if any lack chargeCodeId
  const indirectMap = await loadIndirectCodeMap();

  // Resolve timekeeping employee ID from epoch employee ID
  const tkEmployee = await client
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(eq(employeesTable.epochEmployeeId, epochEmployeeId))
    .limit(1);

  if (tkEmployee.length === 0) return [];

  const tkEmpId = tkEmployee[0]!.id;

  // Find non-voided leave_entries in this week (uses tx so uncommitted entries are visible)
  const leaveEntries = await client
    .select()
    .from(leaveEntriesTable)
    .where(
      and(
        eq(leaveEntriesTable.employeeId, tkEmpId),
        gte(leaveEntriesTable.date, weekStart),
        lte(leaveEntriesTable.date, weekEnd),
        isNull(leaveEntriesTable.voidedAt),
      ),
    );

  const created: (typeof salariedTimesheetLinesTable.$inferSelect)[] = [];

  for (const entry of leaveEntries) {
    // Check if a line already exists for this leave_entry
    const existing = await client
      .select()
      .from(salariedTimesheetLinesTable)
      .where(
        and(
          eq(salariedTimesheetLinesTable.timesheetId, timesheetId),
          eq(salariedTimesheetLinesTable.leaveEntryId, entry.id),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      created.push(existing[0]!);
      continue;
    }

    // Resolve indirect code for this leave type — fail-closed
    const indirectCodeKey = LEAVE_TYPE_TO_INDIRECT_CODE[entry.leaveType] ?? "INDIRECT";
    const resolved = requireIndirectCode(indirectMap, indirectCodeKey, `leave entry ${entry.id} (${entry.leaveType})`);

    // lineType reflects the actual leave type for display/reporting
    const lineType = entry.leaveType === "holiday" ? "HOLIDAY" : "PTO";

    const [line] = await client
      .insert(salariedTimesheetLinesTable)
      .values({
        timesheetId,
        date: entry.date,
        lineType,
        indirectCodeId: resolved.id,
        chargeCodeId: resolved.chargeCodeId,
        leaveEntryId: entry.id,
        hours: entry.hours,
        source: "PTO_IMPORT",
        note: entry.note ?? entry.leaveType,
        isLocked: true,
      })
      .returning();

    created.push(line!);
  }

  return created;
}

/**
 * Returns all active indirect codes ordered by sort_order.
 * chargeCodeId is included in the response — the UI must display
 * it for DCAA transparency.
 */
export async function getIndirectCodes(): Promise<(typeof indirectCodesTable.$inferSelect)[]> {
  return db
    .select()
    .from(indirectCodesTable)
    .where(eq(indirectCodesTable.isActive, true))
    .orderBy(asc(indirectCodesTable.sortOrder), asc(indirectCodesTable.label));
}

/**
 * Returns all salaried timesheets with basic employee info for admin review.
 * Phase 1 — read-only, no filtering by status.
 */
export async function getAdminReviewQueue(): Promise<
  {
    timesheet: typeof salariedTimesheetsTable.$inferSelect;
    employeeName: string | null;
  }[]
> {
  const rows = await db
    .select({
      timesheet: salariedTimesheetsTable,
      employeeName: employees.name,
    })
    .from(salariedTimesheetsTable)
    .leftJoin(employees, eq(employees.id, salariedTimesheetsTable.employeeId))
    .orderBy(
      asc(salariedTimesheetsTable.periodStart),
      asc(employees.name),
    );

  return rows.map((r) => ({
    timesheet: r.timesheet,
    employeeName: r.employeeName ?? null,
  }));
}

/**
 * Builds the full view of a salaried timesheet: header + auto-injected lines.
 * This is the main read path for both the employee portal and admin review.
 */
export async function getSalariedTimesheetView(
  epochEmployeeId: number,
  weekStart: string,
): Promise<SalariedTimesheetWithLines> {
  const weekEnd = computeWeekEnd(weekStart);

  const timesheet = await getOrCreateWeeklyTimesheet(epochEmployeeId, weekStart);

  // Inject locked rows (idempotent — skips if already present)
  await injectHolidayLines(timesheet.id, weekStart, weekEnd);
  await injectApprovedPTO(timesheet.id, epochEmployeeId, weekStart, weekEnd);

  const lines = await db
    .select()
    .from(salariedTimesheetLinesTable)
    .where(eq(salariedTimesheetLinesTable.timesheetId, timesheet.id))
    .orderBy(asc(salariedTimesheetLinesTable.date), asc(salariedTimesheetLinesTable.id));

  return { timesheet, lines };
}

/**
 * Returns the last N weeks of timesheet headers for an employee.
 */
export async function getSalariedTimesheetList(
  epochEmployeeId: number,
  limit = 12,
): Promise<(typeof salariedTimesheetsTable.$inferSelect)[]> {
  const rows = await db
    .select()
    .from(salariedTimesheetsTable)
    .where(eq(salariedTimesheetsTable.employeeId, epochEmployeeId))
    .orderBy(asc(salariedTimesheetsTable.periodStart))
    .limit(limit);

  return rows;
}

// ---------------------------------------------------------------------------
// Line-level CRUD — Phase 2
// All writes are wrapped in a single DB transaction (TK-005).
// ---------------------------------------------------------------------------

export interface AddLinePayload {
  lineType: "DIRECT" | "INDIRECT";
  travelerId?: string | null;
  indirectCodeId?: number | null;
  hours: number;
  date: string;
  note?: string | null;
  originalNarrative?: string | null;
}

export interface UpdateLinePayload {
  hours?: number;
  date?: string;
  note?: string | null;
  originalNarrative?: string | null;
}

/**
 * Validates that the timesheet is in an editable state.
 * Throws a 409-style error if not.
 */
export function requireEditableState(ts: typeof salariedTimesheetsTable.$inferSelect): void {
  if (ts.status !== "OPEN" && ts.status !== "REOPENED") {
    const err = new Error(
      `Cannot modify lines on a timesheet in status '${ts.status}'. Expected OPEN or REOPENED.`,
    );
    (err as any).statusCode = 409;
    throw err;
  }
}

/**
 * Adds a new labor line to a salaried timesheet.
 * - Direct labor: resolves chargeCodeId from the traveler's defaultChargeCodeId (fail-closed).
 * - Indirect labor: resolves chargeCodeId from the indirect code's chargeCodeId (fail-closed).
 * - Wraps line insert + audit insert in a single transaction (TK-005).
 * - Requires actorId (TK-004).
 */
export async function addLine(
  timesheetId: number,
  actorId: number,
  actorName: string | null,
  payload: AddLinePayload,
): Promise<typeof salariedTimesheetLinesTable.$inferSelect> {
  const [ts] = await db
    .select()
    .from(salariedTimesheetsTable)
    .where(eq(salariedTimesheetsTable.id, timesheetId))
    .limit(1);

  if (!ts) {
    const err = new Error(`Timesheet ${timesheetId} not found.`);
    (err as any).statusCode = 404;
    throw err;
  }

  if (ts.employeeId !== actorId) {
    const err = new Error("Forbidden: timesheet does not belong to the requesting employee.");
    (err as any).statusCode = 403;
    throw err;
  }

  requireEditableState(ts);

  if (!Number.isFinite(payload.hours) || payload.hours <= 0) {
    const err = new Error("Hours must be a positive number greater than 0.");
    (err as any).statusCode = 400;
    throw err;
  }

  let chargeCodeId: number | null = null;
  let resolvedIndirectCodeId: number | null = null;
  let resolvedTravelerId: string | null = null;

  if (payload.lineType === "DIRECT") {
    if (!payload.travelerId) {
      const err = new Error("Direct labor lines require a travelerId.");
      (err as any).statusCode = 400;
      throw err;
    }
    const [traveler] = await db
      .select({ id: travelers.id, defaultChargeCodeId: travelers.defaultChargeCodeId })
      .from(travelers)
      .where(eq(travelers.id, payload.travelerId))
      .limit(1);

    if (!traveler) {
      const err = new Error(`Traveler '${payload.travelerId}' not found.`);
      (err as any).statusCode = 400;
      throw err;
    }
    if (!traveler.defaultChargeCodeId) {
      const err = new Error(
        `Traveler '${payload.travelerId}' has no default charge code. Set a WAD charge code before adding direct labor.`,
      );
      (err as any).statusCode = 422;
      throw err;
    }
    chargeCodeId = traveler.defaultChargeCodeId;
    resolvedTravelerId = traveler.id;
  } else {
    if (!payload.indirectCodeId) {
      const err = new Error("Indirect labor lines require an indirectCodeId.");
      (err as any).statusCode = 400;
      throw err;
    }
    const [ic] = await db
      .select({ id: indirectCodesTable.id, chargeCodeId: indirectCodesTable.chargeCodeId, isActive: indirectCodesTable.isActive })
      .from(indirectCodesTable)
      .where(eq(indirectCodesTable.id, payload.indirectCodeId))
      .limit(1);

    if (!ic || !ic.isActive) {
      const err = new Error(`Indirect code ${payload.indirectCodeId} not found or inactive.`);
      (err as any).statusCode = 400;
      throw err;
    }
    if (!ic.chargeCodeId) {
      const err = new Error(`Indirect code ${payload.indirectCodeId} has no charge code mapping.`);
      (err as any).statusCode = 422;
      throw err;
    }
    chargeCodeId = ic.chargeCodeId;
    resolvedIndirectCodeId = ic.id;
  }

  return db.transaction(async (tx) => {
    const [line] = await tx
      .insert(salariedTimesheetLinesTable)
      .values({
        timesheetId,
        date: payload.date,
        lineType: payload.lineType,
        chargeCodeId,
        indirectCodeId: resolvedIndirectCodeId,
        travelerId: resolvedTravelerId,
        hours: payload.hours,
        source: "MANUAL",
        note: payload.note ?? null,
        originalNarrative: payload.originalNarrative ?? null,
        isLocked: false,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning();

    await tx.insert(salariedTimesheetAuditTable).values({
      timesheetId,
      lineId: line!.id,
      action: "LINE_ADDED",
      actorId,
      actorName,
      actorRole: null,
      afterState: {
        lineType: payload.lineType,
        hours: payload.hours,
        date: payload.date,
        chargeCodeId,
      },
      source: "API",
    });

    return line!;
  });
}

/**
 * Updates an existing labor line.
 * - Same state guard as addLine.
 * - Never overwrites originalNarrative once set (preserves DCAA-required field).
 * - Wraps update + audit in a single transaction (TK-005).
 */
export async function updateLine(
  timesheetId: number,
  lineId: number,
  actorId: number,
  actorName: string | null,
  payload: UpdateLinePayload,
): Promise<typeof salariedTimesheetLinesTable.$inferSelect> {
  const [ts] = await db
    .select()
    .from(salariedTimesheetsTable)
    .where(eq(salariedTimesheetsTable.id, timesheetId))
    .limit(1);

  if (!ts) {
    const err = new Error(`Timesheet ${timesheetId} not found.`);
    (err as any).statusCode = 404;
    throw err;
  }

  if (ts.employeeId !== actorId) {
    const err = new Error("Forbidden: timesheet does not belong to the requesting employee.");
    (err as any).statusCode = 403;
    throw err;
  }

  requireEditableState(ts);

  const [existing] = await db
    .select()
    .from(salariedTimesheetLinesTable)
    .where(
      and(
        eq(salariedTimesheetLinesTable.id, lineId),
        eq(salariedTimesheetLinesTable.timesheetId, timesheetId),
      ),
    )
    .limit(1);

  if (!existing) {
    const err = new Error(`Line ${lineId} not found on timesheet ${timesheetId}.`);
    (err as any).statusCode = 404;
    throw err;
  }

  if (existing.isLocked) {
    const err = new Error(`Line ${lineId} is locked and cannot be edited.`);
    (err as any).statusCode = 409;
    throw err;
  }

  if (payload.hours !== undefined && (!Number.isFinite(payload.hours) || payload.hours <= 0)) {
    const err = new Error("Hours must be a positive number greater than 0.");
    (err as any).statusCode = 400;
    throw err;
  }

  const updates: Partial<typeof salariedTimesheetLinesTable.$inferInsert> = {
    updatedBy: actorId,
  };
  if (payload.hours !== undefined) updates.hours = payload.hours;
  if (payload.date !== undefined) updates.date = payload.date;
  if (payload.note !== undefined) updates.note = payload.note;

  if (payload.originalNarrative !== undefined && payload.originalNarrative !== null) {
    if (!existing.originalNarrative) {
      updates.originalNarrative = payload.originalNarrative;
    }
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(salariedTimesheetLinesTable)
      .set(updates)
      .where(eq(salariedTimesheetLinesTable.id, lineId))
      .returning();

    await tx.insert(salariedTimesheetAuditTable).values({
      timesheetId,
      lineId,
      action: "LINE_UPDATED",
      actorId,
      actorName,
      actorRole: null,
      beforeState: { hours: existing.hours, date: existing.date, note: existing.note },
      afterState: { hours: updated!.hours, date: updated!.date, note: updated!.note },
      source: "API",
    });

    return updated!;
  });
}

/**
 * Deletes an unlocked labor line.
 * - Blocks deletion of locked lines (HOLIDAY/PTO auto-injected).
 * - State guard: OPEN or REOPENED only.
 * - Wraps delete + audit in a single transaction (TK-005).
 */
export async function deleteLine(
  timesheetId: number,
  lineId: number,
  actorId: number,
  actorName: string | null,
): Promise<void> {
  const [ts] = await db
    .select()
    .from(salariedTimesheetsTable)
    .where(eq(salariedTimesheetsTable.id, timesheetId))
    .limit(1);

  if (!ts) {
    const err = new Error(`Timesheet ${timesheetId} not found.`);
    (err as any).statusCode = 404;
    throw err;
  }

  if (ts.employeeId !== actorId) {
    const err = new Error("Forbidden: timesheet does not belong to the requesting employee.");
    (err as any).statusCode = 403;
    throw err;
  }

  requireEditableState(ts);

  const [existing] = await db
    .select()
    .from(salariedTimesheetLinesTable)
    .where(
      and(
        eq(salariedTimesheetLinesTable.id, lineId),
        eq(salariedTimesheetLinesTable.timesheetId, timesheetId),
      ),
    )
    .limit(1);

  if (!existing) {
    const err = new Error(`Line ${lineId} not found on timesheet ${timesheetId}.`);
    (err as any).statusCode = 404;
    throw err;
  }

  if (existing.isLocked) {
    const err = new Error(
      `Line ${lineId} is locked (${existing.lineType}) and cannot be deleted.`,
    );
    (err as any).statusCode = 409;
    throw err;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(salariedTimesheetLinesTable)
      .where(eq(salariedTimesheetLinesTable.id, lineId));

    await tx.insert(salariedTimesheetAuditTable).values({
      timesheetId,
      lineId,
      action: "LINE_DELETED",
      actorId,
      actorName,
      actorRole: null,
      beforeState: {
        lineType: existing.lineType,
        hours: existing.hours,
        date: existing.date,
      },
      source: "API",
    });
  });
}

// ---------------------------------------------------------------------------
// Traveler suggestions — Phase 2
// ---------------------------------------------------------------------------

export interface TravelerSuggestion {
  travelerId: string;
  travelerNumber: string;
  chargeCodeId: number | null;
  chargeCodeLabel: string | null;
  projectName: string | null;
}

/**
 * Returns up to 5 "likely" travelers for the employee based on recent
 * punch_ledger entries, sorted by recency.
 */
export async function getSuggestedTravelers(
  epochEmployeeId: number,
  limit = 5,
): Promise<{ suggestions: TravelerSuggestion[]; hasMore: boolean }> {
  const { punchLedger, chargeCodes: chargeCodesTable, projects } = await import("../../../schema");

  const recentPunches = await db
    .select({
      travelerId: punchLedger.travelerId,
      chargeCodeId: punchLedger.chargeCodeId,
      clockIn: punchLedger.clockIn,
    })
    .from(punchLedger)
    .where(
      and(
        eq(punchLedger.employeeId, epochEmployeeId),
      ),
    )
    .orderBy(desc(punchLedger.clockIn))
    .limit(50);

  const seen = new Set<string>();
  const uniqueTravelerIds: string[] = [];
  for (const punch of recentPunches) {
    if (punch.travelerId && !seen.has(punch.travelerId)) {
      seen.add(punch.travelerId);
      uniqueTravelerIds.push(punch.travelerId);
      if (uniqueTravelerIds.length >= limit + 1) break;
    }
  }

  const hasMore = uniqueTravelerIds.length > limit;
  const topIds = uniqueTravelerIds.slice(0, limit);

  if (topIds.length === 0) {
    return { suggestions: [], hasMore: false };
  }

  const { inArray } = await import("drizzle-orm");
  const travelerRows = await db
    .select({
      id: travelers.id,
      travelerNumber: travelers.travelerNumber,
      defaultChargeCodeId: travelers.defaultChargeCodeId,
      projectId: travelers.projectId,
    })
    .from(travelers)
    .where(inArray(travelers.id, topIds));

  const ccIds = travelerRows
    .map((t) => t.defaultChargeCodeId)
    .filter((id): id is number => id !== null);

  let ccMap = new Map<number, string>();
  if (ccIds.length > 0) {
    const ccRows = await db
      .select({ id: chargeCodesTable.id, code: chargeCodesTable.code })
      .from(chargeCodesTable)
      .where(inArray(chargeCodesTable.id, ccIds));
    for (const cc of ccRows) ccMap.set(cc.id, cc.code);
  }

  const projectIds = travelerRows
    .map((t) => t.projectId)
    .filter((id): id is string => id !== null);

  let projMap = new Map<string, string>();
  if (projectIds.length > 0) {
    const projRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, projectIds));
    for (const p of projRows) projMap.set(p.id, p.name);
  }

  const travelerMap = new Map(travelerRows.map((t) => [t.id, t]));
  const suggestions: TravelerSuggestion[] = topIds
    .map((id) => {
      const t = travelerMap.get(id);
      if (!t) return null;
      return {
        travelerId: t.id,
        travelerNumber: t.travelerNumber,
        chargeCodeId: t.defaultChargeCodeId ?? null,
        chargeCodeLabel: t.defaultChargeCodeId ? (ccMap.get(t.defaultChargeCodeId) ?? null) : null,
        projectName: t.projectId ? (projMap.get(t.projectId) ?? null) : null,
      };
    })
    .filter((s): s is TravelerSuggestion => s !== null);

  return { suggestions, hasMore };
}

/**
 * Returns all active travelers with basic attribution info for the "show more" path.
 */
export async function getAllActiveTravelers(): Promise<TravelerSuggestion[]> {
  const { chargeCodes: chargeCodesTable, projects } = await import("../../../schema");
  const { inArray } = await import("drizzle-orm");

  const travelerRows = await db
    .select({
      id: travelers.id,
      travelerNumber: travelers.travelerNumber,
      defaultChargeCodeId: travelers.defaultChargeCodeId,
      projectId: travelers.projectId,
      status: travelers.status,
    })
    .from(travelers)
    .where(
      and(
        eq(travelers.status, "IN_PROGRESS"),
      ),
    )
    .orderBy(asc(travelers.travelerNumber));

  const ccIds = travelerRows
    .map((t) => t.defaultChargeCodeId)
    .filter((id): id is number => id !== null);

  let ccMap = new Map<number, string>();
  if (ccIds.length > 0) {
    const ccRows = await db
      .select({ id: chargeCodesTable.id, code: chargeCodesTable.code })
      .from(chargeCodesTable)
      .where(inArray(chargeCodesTable.id, ccIds));
    for (const cc of ccRows) ccMap.set(cc.id, cc.code);
  }

  const projectIds = travelerRows
    .map((t) => t.projectId)
    .filter((id): id is string => id !== null);

  let projMap = new Map<string, string>();
  if (projectIds.length > 0) {
    const projRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, projectIds));
    for (const p of projRows) projMap.set(p.id, p.name);
  }

  return travelerRows.map((t) => ({
    travelerId: t.id,
    travelerNumber: t.travelerNumber,
    chargeCodeId: t.defaultChargeCodeId ?? null,
    chargeCodeLabel: t.defaultChargeCodeId ? (ccMap.get(t.defaultChargeCodeId) ?? null) : null,
    projectName: t.projectId ? (projMap.get(t.projectId) ?? null) : null,
  }));
}

// ---------------------------------------------------------------------------
// PTO sync after approval (called from timeoff.service after VP approval)
//
// NOTE: approved PTO uses lineType "PTO" and indirectCode "PTO".
// When exporting to Gusto, these lines map to vacation_hours (NOT sick_hours).
// The Gusto payload builder must check lineType === "PTO" → vacation_hours.
//
// TODO (hourly PTO): For employees submitting hourly PTO requests,
// automatic payroll line injection is intentionally disabled pending
// payroll policy review. When ready, call injectApprovedPTO here
// conditioned on entry.leaveType === 'pto' && entry.hours < 8.
// ---------------------------------------------------------------------------
export async function syncPTOAfterApproval(
  epochEmployeeId: number,
  weekStart: string,
  tx?: TxClient,
): Promise<void> {
  const weekEnd = computeWeekEnd(weekStart);
  const timesheet = await getOrCreateWeeklyTimesheet(epochEmployeeId, weekStart, tx);

  // Only sync if the timesheet is still open (not approved/locked)
  if (timesheet.status === "APPROVED" || timesheet.status === "LOCKED") {
    console.warn(
      `[syncPTOAfterApproval] Timesheet ${timesheet.id} is ${timesheet.status} — skipping PTO injection to avoid modifying a locked period.`
    );
    return;
  }

  await injectApprovedPTO(timesheet.id, epochEmployeeId, weekStart, weekEnd, tx);
}
