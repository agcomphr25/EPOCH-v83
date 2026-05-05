import { db } from "../../../db";
import { pool } from "../../../db";
import { timesheetsTable, punchesTable, salariedTimesheetsTable } from "../../schema/timekeeping";
import { eq, and, gte, lte, isNull, isNotNull, or } from "drizzle-orm";
import type { Timesheet, SalariedTimesheet } from "../../schema/timekeeping";
import { listResolvedEmployees, resolveByTimekeepingId } from "../../lib/timekeepingEmployeeResolver";
import {
  computeHoursFromPunches,
  toTZDateStr,
  midnightInTZ,
  type TimesheetHours,
} from "../../lib/timekeeping";
import { punchLedger, type PunchLedgerEntry } from "../../../schema";
import { getOrCreateSettings } from "./settings.service";
import { getOrCreatePolicySettings } from "./policySettings.service";
import { logAction, type AuditActor } from "./audit.service";
import { assertTransition, isEditable, InvalidTransitionError } from "./timesheetStateMachine";
import { punchLedgerCutoverDate } from "../../lib/featureFlags";

export type { Timesheet };

export async function listTimesheets(filters?: {
  employeeId?: number | null;
  status?: string | null;
}): Promise<Timesheet[]> {
  const conditions = [];
  if (filters?.employeeId != null) {
    conditions.push(eq(timesheetsTable.employeeId, filters.employeeId));
  }
  if (filters?.status) {
    conditions.push(eq(timesheetsTable.status, filters.status));
  }

  return db
    .select()
    .from(timesheetsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(timesheetsTable.periodStart);
}

export async function getTimesheet(id: number): Promise<Timesheet | null> {
  const [row] = await db
    .select()
    .from(timesheetsTable)
    .where(eq(timesheetsTable.id, id));
  return row ?? null;
}

export function useLedgerForPeriod(periodStart: string): boolean {
  return periodStart >= punchLedgerCutoverDate;
}

interface LegacyEventInsideLedgerRow {
  epoch_employee_id: string;
  legacy_count: string;
  ledger_count: string;
  overlap_start: string;
  overlap_end: string;
}

interface LegacyEventInsideLedgerDetail {
  epochEmployeeId: number;
  name: string;
  legacyCount: number;
  ledgerCount: number;
  overlapStart: string;
  overlapEnd: string;
}

/**
 * Detects employees whose individual `timekeeping.punches` events fall INSIDE
 * a `public.punch_ledger` session window.
 *
 * --- LIMITATION (read before relying on this for cutover go/no-go) ---
 * timekeeping.punches is an EVENT table (one row per clock_in / clock_out /
 * break_start / break_end). public.punch_ledger is a SESSION table (one row
 * per [clockIn, clockOut] interval).
 *
 * This function does NOT pair legacy events into intervals before comparing.
 * It only matches a single legacy event timestamp against ledger session
 * windows. As a consequence, it MISSES the case where a long legacy interval
 * fully contains a ledger session:
 *
 *   Legacy: clock_in @ 09:00, clock_out @ 17:00     (interval [09:00, 17:00])
 *   Ledger: session  10:00 → 16:00                  (interval [10:00, 16:00])
 *
 *   Neither 09:00 nor 17:00 falls between 10:00 and 16:00, so the join
 *   produces zero rows even though the intervals fully overlap.
 *
 * Use this function for a fast "are there any legacy event punches that
 * landed inside a ledger session?" sanity check (a strong overlap signal).
 * Do NOT treat a zero result as proof of zero interval overlap.
 *
 * For full interval-overlap auditing, a future implementation would need to
 * (a) pair legacy events into intervals via window functions, then (b) join
 * those intervals to punch_ledger with a real interval-overlap predicate
 * (`tstzrange(p_in, p_out, '[]') && tstzrange(pl.clock_in, pl.clock_out, '[]')`).
 * Tracked as a follow-up (see #40).
 */
export async function auditLegacyPunchEventsInsideLedgerSessions(): Promise<{
  overlapCount: number;
  details: LegacyEventInsideLedgerDetail[];
}> {
  const result = await pool.query<LegacyEventInsideLedgerRow>(`
    SELECT
      p.employee_id AS epoch_employee_id,
      COUNT(DISTINCT p.id) AS legacy_count,
      COUNT(DISTINCT pl.id) AS ledger_count,
      MIN(GREATEST(p.punched_at, pl.clock_in))::text AS overlap_start,
      MAX(LEAST(p.punched_at, COALESCE(pl.clock_out, NOW())))::text AS overlap_end
    FROM timekeeping.punches p
    JOIN public.punch_ledger pl
      ON pl.employee_id = p.employee_id
      AND p.punched_at BETWEEN pl.clock_in AND COALESCE(pl.clock_out, NOW())
    GROUP BY p.employee_id
    ORDER BY legacy_count DESC
  `);

  const allResolved = await listResolvedEmployees();
  const nameMap = new Map(allResolved.map(e => [e.epochEmployeeId, e.name]));

  const details: LegacyEventInsideLedgerDetail[] = result.rows.map(r => ({
    epochEmployeeId: Number(r.epoch_employee_id),
    name: nameMap.get(Number(r.epoch_employee_id)) ?? 'Unknown',
    legacyCount: Number(r.legacy_count),
    ledgerCount: Number(r.ledger_count),
    overlapStart: r.overlap_start,
    overlapEnd: r.overlap_end,
  }));

  console.log(
    `[auditLegacyPunchEventsInsideLedgerSessions] Found ${details.length} employee(s) ` +
    `with legacy events inside ledger sessions ` +
    `(NOTE: does not detect interval-spanning overlaps — see JSDoc)`
  );
  for (const d of details) {
    console.log(`  Employee ${d.epochEmployeeId} (${d.name}): ${d.legacyCount} legacy events inside ${d.ledgerCount} ledger sessions, span ${d.overlapStart} - ${d.overlapEnd}`);
  }

  return { overlapCount: details.length, details };
}

export async function computeHoursForPeriod(
  employeeId: number,
  periodStart: string,
  periodEnd: string
): Promise<TimesheetHours> {
  const settings = await getOrCreateSettings();
  const tz = settings.timezone;

  const periodStartDate = midnightInTZ(periodStart, tz);
  const nextDayAfterEnd = new Date(new Date(`${periodEnd}T12:00:00Z`).getTime() + 86_400_000)
    .toISOString().slice(0, 10);
  const periodEndDate = new Date(midnightInTZ(nextDayAfterEnd, tz).getTime() - 1);

  const hoursByDay = new Map<string, number>();

  const useLedgerStart = useLedgerForPeriod(periodStart);
  const useLedgerEnd = useLedgerForPeriod(periodEnd);
  const cutoverBoundary = midnightInTZ(punchLedgerCutoverDate, tz);

  const needsLegacy = !useLedgerStart;
  const needsLedger = useLedgerEnd;
  const legacyEndDate = needsLegacy && needsLedger
    ? new Date(cutoverBoundary.getTime() - 1)
    : periodEndDate;
  const ledgerStartDate = needsLegacy && needsLedger
    ? cutoverBoundary
    : periodStartDate;

  if (needsLedger) {
    const resolved = await resolveByTimekeepingId(employeeId);
    if (resolved != null) {
      const ledgerSessions = await db
        .select()
        .from(punchLedger)
        .where(
          and(
            eq(punchLedger.employeeId, resolved.epochEmployeeId),
            lte(punchLedger.clockIn, periodEndDate),
            or(
              gte(punchLedger.clockOut, ledgerStartDate),
              isNull(punchLedger.clockOut)
            )
          )
        );

      const now = new Date();
      for (const session of ledgerSessions) {
        if (session.laborClass === "BREAK") continue;

        const sessionStart = Math.max(new Date(session.clockIn).getTime(), ledgerStartDate.getTime());
        const rawEnd = session.clockOut ? new Date(session.clockOut).getTime() : now.getTime();
        const sessionEnd = Math.min(rawEnd, periodEndDate.getTime());
        if (sessionEnd <= sessionStart) continue;

        let cursor = sessionStart;
        while (cursor < sessionEnd) {
          const dayKey = toTZDateStr(new Date(cursor), tz);

          const [y, m, d] = dayKey.split("-").map(Number);
          const nextDayStr = new Date(Date.UTC(y, m - 1, d + 1))
            .toISOString()
            .slice(0, 10);
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
    const punches = await db
      .select()
      .from(punchesTable)
      .where(
        and(
          eq(punchesTable.employeeId, employeeId),
          gte(punchesTable.punchedAt, periodStartDate),
          lte(punchesTable.punchedAt, legacyEndDate)
        )
      );

    const punchesByDay = new Map<string, typeof punches>();
    for (const p of punches) {
      const day = toTZDateStr(new Date(p.punchedAt), tz);
      if (!punchesByDay.has(day)) punchesByDay.set(day, []);
      punchesByDay.get(day)!.push(p);
    }
    for (const [day, dayPunches] of punchesByDay) {
      hoursByDay.set(day, (hoursByDay.get(day) ?? 0) + computeHoursFromPunches(dayPunches, settings.roundingRuleMinutes));
    }
  }

  let totalHours = 0;
  let overtimeHours = 0;
  for (const dayHours of hoursByDay.values()) {
    totalHours += dayHours;
    if (dayHours > settings.overtimeThresholdDaily) {
      overtimeHours += dayHours - settings.overtimeThresholdDaily;
    }
  }
  const weeklyOvertime = Math.max(0, totalHours - settings.overtimeThresholdWeekly);
  overtimeHours = Math.max(overtimeHours, weeklyOvertime);
  const regularHours = Math.max(0, totalHours - overtimeHours);

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    regularHours: Math.round(regularHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
  };
}

export async function createTimesheet(
  data: { employeeId: number; periodStart: string; periodEnd: string },
  actor: AuditActor
): Promise<Timesheet> {
  const hours = await computeHoursForPeriod(
    data.employeeId,
    data.periodStart,
    data.periodEnd
  );

  const [row] = await db
    .insert(timesheetsTable)
    .values({ ...data, ...hours, status: "draft" })
    .returning();

  await logAction({
    tableName: "timesheets",
    recordId: row!.id,
    action: "INSERT",
    newValues: row as Record<string, unknown>,
    actor,
  });

  return row!;
}

export async function updateTimesheet(
  id: number,
  data: Partial<Omit<Timesheet, "id" | "createdAt" | "updatedAt">>,
  actor: AuditActor
): Promise<Timesheet | { error: string; statusCode: number }> {
  const existing = await getTimesheet(id);
  if (!existing) return { error: "Timesheet not found", statusCode: 404 };

  if (!isEditable(existing.status)) {
    return {
      error: `Timesheets in "${existing.status}" status cannot be directly edited. Use the correction workflow to request changes.`,
      statusCode: 409,
    };
  }

  const [row] = await db
    .update(timesheetsTable)
    .set(data)
    .where(eq(timesheetsTable.id, id))
    .returning();

  await logAction({
    tableName: "timesheets",
    recordId: id,
    action: "UPDATE",
    oldValues: existing as Record<string, unknown>,
    newValues: row as Record<string, unknown>,
    actor,
  });

  return row!;
}

/**
 * Submit a timesheet for review.
 * Requires: status must be "draft".
 * When certificationRequired is true (default), employee must also have attested.
 * Enforces minimumHoursPerWeek and lateSubmissionGraceDays when configured.
 */
export async function submitTimesheet(
  id: number,
  actor: AuditActor
): Promise<Timesheet & { lateSubmissionWarning?: string } | { error: string; statusCode: number }> {
  const existing = await getTimesheet(id);
  if (!existing) return { error: "Timesheet not found", statusCode: 404 };

  try {
    assertTransition(existing.status, "submitted", actor.role);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return { error: err.message, statusCode: err.statusCode };
    }
    throw err;
  }

  const policy = await getOrCreatePolicySettings();

  if (policy.certificationRequired && !existing.employeeAttested) {
    return {
      error: "Employee must attest to the accuracy of this timesheet before submitting",
      statusCode: 422,
    };
  }

  if (policy.minimumHoursPerWeek != null && existing.totalHours < policy.minimumHoursPerWeek) {
    return {
      error: `This timesheet has ${existing.totalHours.toFixed(2)} hours but the minimum required is ${policy.minimumHoursPerWeek} hours per week. Please record all hours before submitting.`,
      statusCode: 422,
    };
  }

  let lateSubmissionWarning: string | undefined;
  if (policy.lateSubmissionGraceDays != null) {
    const periodEnd = new Date(`${existing.periodEnd}T23:59:59Z`);
    const graceDeadline = new Date();
    graceDeadline.setUTCDate(graceDeadline.getUTCDate() - policy.lateSubmissionGraceDays);
    if (periodEnd < graceDeadline) {
      const daysLate = Math.floor(
        (graceDeadline.getTime() - periodEnd.getTime()) / 86_400_000
      );
      if (policy.lateSubmissionBlock) {
        return {
          error: `This timesheet covers a period ending ${existing.periodEnd}, which is ${daysLate} day(s) past the ${policy.lateSubmissionGraceDays}-day late submission window. Contact your administrator to submit late timesheets.`,
          statusCode: 422,
        };
      }
      lateSubmissionWarning = `This timesheet is ${daysLate} day(s) past the ${policy.lateSubmissionGraceDays}-day submission window (period ended ${existing.periodEnd}).`;
    }
  }

  const [row] = await db
    .update(timesheetsTable)
    .set({
      status: "submitted",
      submittedAt: new Date(),
      submittedBy: actor.id,
    })
    .where(eq(timesheetsTable.id, id))
    .returning();

  await logAction({
    tableName: "timesheets",
    recordId: id,
    action: "UPDATE",
    oldValues: { status: existing.status },
    newValues: {
      status: "submitted",
      submittedBy: actor.id,
      ...(lateSubmissionWarning ? { lateSubmissionWarning } : {}),
    },
    actor,
  });

  if (lateSubmissionWarning) {
    return { ...row!, lateSubmissionWarning };
  }
  return row!;
}

/**
 * Record employee attestation on a draft timesheet.
 * DCAA-compliant: requires explicit checkbox confirmation from the employee.
 * Stores the canonical certification statement, version, and certifying user ID.
 * The statement and version are read from the policy settings table so they
 * can be updated by administrators without a code deploy.
 */
export async function attestTimesheet(
  id: number,
  actor: AuditActor,
  options: {
    certificationConfirmed?: boolean;
    adminOverride?: boolean;
    overrideReason?: string;
  } = {}
): Promise<Timesheet | { error: string; statusCode: number }> {
  const existing = await getTimesheet(id);
  if (!existing) return { error: "Timesheet not found", statusCode: 404 };

  if (!isEditable(existing.status)) {
    return {
      error: `Only draft timesheets can be attested (current status: ${existing.status})`,
      statusCode: 409,
    };
  }

  if (options.certificationConfirmed !== true) {
    return {
      error: "Certification checkbox must be explicitly confirmed. The employee must check the certification box before submitting.",
      statusCode: 400,
    };
  }

  const policy = await getOrCreatePolicySettings();
  const certStatement = policy.certificationStatement;
  const certVersion = policy.certificationVersion;

  const now = new Date();
  const [row] = await db
    .update(timesheetsTable)
    .set({
      employeeAttested: true,
      attestedAt: now,
      certifiedByUserId: actor.id,
      certificationStatement: certStatement,
      certificationVersion: certVersion,
    })
    .where(eq(timesheetsTable.id, id))
    .returning();

  const settings = await getOrCreateSettings();
  const snapshotTz = settings.timezone;
  const periodStartDate = midnightInTZ(existing.periodStart, snapshotTz);
  const nextDayAfterEnd = new Date(new Date(`${existing.periodEnd}T12:00:00Z`).getTime() + 86_400_000)
    .toISOString().slice(0, 10);
  const periodEndDate = new Date(midnightInTZ(nextDayAfterEnd, snapshotTz).getTime() - 1);

  let legacyPunches: (typeof punchesTable.$inferSelect)[] = [];
  let ledgerSessions: PunchLedgerEntry[] = [];

  const snapUseLedgerStart = useLedgerForPeriod(existing.periodStart);
  const snapUseLedgerEnd = useLedgerForPeriod(existing.periodEnd);
  const snapCutover = midnightInTZ(punchLedgerCutoverDate, snapshotTz);
  const snapNeedsLegacy = !snapUseLedgerStart;
  const snapNeedsLedger = snapUseLedgerEnd;
  const snapLegacyEnd = snapNeedsLegacy && snapNeedsLedger
    ? new Date(snapCutover.getTime() - 1)
    : periodEndDate;
  const snapLedgerStart = snapNeedsLegacy && snapNeedsLedger
    ? snapCutover
    : periodStartDate;

  if (snapNeedsLedger) {
    const resolved = await resolveByTimekeepingId(existing.employeeId);
    if (resolved != null) {
      ledgerSessions = await db
        .select()
        .from(punchLedger)
        .where(
          and(
            eq(punchLedger.employeeId, resolved.epochEmployeeId),
            lte(punchLedger.clockIn, periodEndDate),
            or(
              gte(punchLedger.clockOut, snapLedgerStart),
              isNull(punchLedger.clockOut)
            )
          )
        );
    }
  }

  if (snapNeedsLegacy) {
    legacyPunches = await db
      .select()
      .from(punchesTable)
      .where(
        and(
          eq(punchesTable.employeeId, existing.employeeId),
          gte(punchesTable.punchedAt, periodStartDate),
          lte(punchesTable.punchedAt, snapLegacyEnd)
        )
      );
  }

  const auditAction = options.adminOverride ? "TIME_CERTIFIED_ADMIN" : "TIME_CERTIFIED";
  await logAction({
    tableName: "timesheets",
    recordId: id,
    action: auditAction,
    oldValues: { employeeAttested: false, certificationStatement: null },
    newValues: {
      employeeAttested: true,
      attestedAt: row!.attestedAt,
      certifiedByUserId: actor.id,
      certificationStatement: certStatement,
      certificationVersion: certVersion,
      actorRole: actor.role ?? "UNKNOWN",
      actorEmail: actor.email ?? null,
      ...(options.adminOverride && { adminOverride: true, overrideReason: options.overrideReason ?? null }),
      linesSnapshot: {
        capturedAt: now.toISOString(),
        periodStart: existing.periodStart,
        periodEnd: existing.periodEnd,
        employeeId: existing.employeeId,
        totalHours: existing.totalHours,
        regularHours: existing.regularHours,
        overtimeHours: existing.overtimeHours,
        legacyPunches: legacyPunches.map(p => ({
          id: p.id,
          type: p.type,
          punchedAt: p.punchedAt,
          costCode: p.costCode ?? null,
        })),
        ledgerSessions: ledgerSessions.map((s) => ({
          id: s.id,
          clockIn: s.clockIn,
          clockOut: s.clockOut,
          laborClass: s.laborClass,
          chargeCode: s.chargeCode ?? null,
        })),
      },
    },
    actor,
  });

  return row!;
}

/**
 * Certify (approve) a submitted timesheet.
 * Requires: status must be "submitted", actor must be supervisor/admin.
 * Captures reviewer identity from actor.
 * After certification the timesheet is read-only unless explicitly locked and
 * then a correction is requested.
 */
export async function approveTimesheet(
  id: number,
  actor: AuditActor
): Promise<Timesheet | { error: string; statusCode: number }> {
  const existing = await getTimesheet(id);
  if (!existing) return { error: "Timesheet not found", statusCode: 404 };

  try {
    assertTransition(existing.status, "certified", actor.role);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return { error: err.message, statusCode: err.statusCode };
    }
    throw err;
  }

  if (!actor.id) {
    return { error: "Approver identity is required", statusCode: 401 };
  }

  if (!existing.submittedBy) {
    return {
      error: "Timesheet has no recorded submitter. Approval requires a verified submission identity.",
      statusCode: 422,
    };
  }

  if (existing.submittedBy === actor.id) {
    return {
      error: "The same user cannot submit and approve a timesheet",
      statusCode: 403,
    };
  }

  const [row] = await db
    .update(timesheetsTable)
    .set({
      status: "certified",
      reviewedAt: new Date(),
      reviewedBy: actor.id,
      reviewerEmail: actor.email,
    })
    .where(eq(timesheetsTable.id, id))
    .returning();

  await logAction({
    tableName: "timesheets",
    recordId: id,
    action: "UPDATE",
    oldValues: { status: existing.status },
    newValues: { status: "certified", reviewedBy: actor.id, reviewerEmail: actor.email },
    actor,
  });

  return row!;
}

/**
 * Lock a certified timesheet.
 * Requires: status must be "certified", actor must be admin/owner.
 * Once locked the timesheet can only be changed via the correction workflow.
 */
export async function lockTimesheet(
  id: number,
  actor: AuditActor
): Promise<Timesheet | { error: string; statusCode: number }> {
  const existing = await getTimesheet(id);
  if (!existing) return { error: "Timesheet not found", statusCode: 404 };

  try {
    assertTransition(existing.status, "locked", actor.role);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return { error: err.message, statusCode: err.statusCode };
    }
    throw err;
  }

  const [row] = await db
    .update(timesheetsTable)
    .set({ status: "locked" })
    .where(eq(timesheetsTable.id, id))
    .returning();

  await logAction({
    tableName: "timesheets",
    recordId: id,
    action: "UPDATE",
    oldValues: { status: existing.status },
    newValues: { status: "locked", lockedBy: actor.id },
    actor,
  });

  return row!;
}

/**
 * Reject a submitted timesheet.
 * Requires: status must be "submitted".
 * Returns it to draft so the employee can correct and re-attest.
 */
export async function rejectTimesheet(
  id: number,
  rejectionNote: string,
  actor: AuditActor
): Promise<Timesheet | { error: string; statusCode: number }> {
  const existing = await getTimesheet(id);
  if (!existing) return { error: "Timesheet not found", statusCode: 404 };

  try {
    assertTransition(existing.status, "draft", actor.role);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return { error: `Only submitted timesheets can be rejected (current status: ${existing.status})`, statusCode: err.statusCode };
    }
    throw err;
  }

  if (!actor.id) {
    return { error: "Reviewer identity is required", statusCode: 401 };
  }

  const [row] = await db
    .update(timesheetsTable)
    .set({
      status: "draft",
      rejectionReason: rejectionNote,
      reviewedAt: new Date(),
      reviewedBy: actor.id,
      reviewerEmail: actor.email,
      employeeAttested: false,
      attestedAt: null,
      certifiedByUserId: null,
      certificationStatement: null,
      certificationVersion: null,
    })
    .where(eq(timesheetsTable.id, id))
    .returning();

  await logAction({
    tableName: "timesheets",
    recordId: id,
    action: "UPDATE",
    oldValues: { status: existing.status },
    newValues: {
      status: "draft",
      rejectionNote,
      reviewedBy: actor.id,
      reviewerEmail: actor.email,
    },
    actor,
  });

  return row!;
}

/**
 * Recalculate hours from current punch data.
 * Only allowed on draft timesheets.
 */
export async function recalculateTimesheetHours(
  id: number,
  actor: AuditActor
): Promise<{ timesheet: Timesheet } | { error: string; statusCode: number }> {
  const timesheet = await getTimesheet(id);
  if (!timesheet) return { error: "Timesheet not found", statusCode: 404 };
  if (!isEditable(timesheet.status)) {
    return {
      error: `Only draft timesheets can be recalculated (current status: ${timesheet.status})`,
      statusCode: 409,
    };
  }
  if (timesheet.employeeAttested) {
    return {
      error: "Cannot recalculate a certified timesheet. The timesheet has been certified by the employee and is now immutable.",
      statusCode: 409,
    };
  }

  const hours = await computeHoursForPeriod(
    timesheet.employeeId,
    timesheet.periodStart,
    timesheet.periodEnd
  );

  const [updated] = await db
    .update(timesheetsTable)
    .set(hours)
    .where(eq(timesheetsTable.id, id))
    .returning();

  await logAction({
    tableName: "timesheets",
    recordId: id,
    action: "UPDATE",
    oldValues: {
      totalHours: timesheet.totalHours,
      regularHours: timesheet.regularHours,
      overtimeHours: timesheet.overtimeHours,
    },
    newValues: hours as unknown as Record<string, unknown>,
    actor,
  });

  return { timesheet: updated! };
}

/**
 * Lazy auto-create: return an existing timesheet for the employee+period if one
 * already exists, or compute hours and create a new draft if there are punches.
 * Returns null (without writing any row) when the period has zero punch hours.
 */
export async function getOrAutoCreateTimesheet(
  employeeId: number,
  periodStart: string,
  periodEnd: string,
  actor: AuditActor
): Promise<Timesheet | null> {
  // Return existing timesheet if one already exists for this period
  const [existing] = await db
    .select()
    .from(timesheetsTable)
    .where(
      and(
        eq(timesheetsTable.employeeId, employeeId),
        eq(timesheetsTable.periodStart, periodStart),
        eq(timesheetsTable.periodEnd, periodEnd)
      )
    )
    .limit(1);

  if (existing) return existing;

  // Compute hours; only create if there is at least some labor recorded
  const hours = await computeHoursForPeriod(employeeId, periodStart, periodEnd);
  if (hours.totalHours <= 0) return null;

  return createTimesheet({ employeeId, periodStart, periodEnd }, actor);
}

export interface BulkGenerateResult {
  periodStart: string;
  periodEnd: string;
  created: Array<{ employeeId: number; timesheetId: number }>;
  skipped: Array<{ employeeId: number; reason: string }>;
  failed: Array<{ employeeId: number; reason: string }>;
}

/**
 * Bulk-generate draft timesheets for all active employees for a given period.
 * Uses createTimesheet (which calls computeHoursForPeriod) for every employee,
 * ensuring both timekeeping.punches (legacy) and punch_ledger (portal/kiosk) hours
 * are included in the generated totals.
 *
 * Employees who already have any timesheet (regardless of status) for the period
 * are skipped rather than duplicated.
 */
export async function generateTimesheetsForAllEmployees(
  periodStart: string,
  periodEnd: string,
  actor: AuditActor
): Promise<BulkGenerateResult> {
  const result: BulkGenerateResult = {
    periodStart,
    periodEnd,
    created: [],
    skipped: [],
    failed: [],
  };

  const allEmployees = await listResolvedEmployees();
  const activeWithTimekeeping = allEmployees.filter(
    (e) => e.isActive && e.timekeepingId != null
  );

  for (const emp of activeWithTimekeeping) {
    const employeeId = emp.timekeepingId!;

    // Skip if a timesheet already exists for this employee and period
    const existing = await db
      .select({ id: timesheetsTable.id })
      .from(timesheetsTable)
      .where(
        and(
          eq(timesheetsTable.employeeId, employeeId),
          eq(timesheetsTable.periodStart, periodStart),
          eq(timesheetsTable.periodEnd, periodEnd)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      result.skipped.push({
        employeeId,
        reason: `Timesheet already exists (id=${existing[0]!.id})`,
      });
      continue;
    }

    try {
      const ts = await createTimesheet({ employeeId, periodStart, periodEnd }, actor);
      result.created.push({ employeeId, timesheetId: ts.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push({ employeeId, reason: message });
    }
  }

  return result;
}

export async function getPendingTimesheets(): Promise<Timesheet[]> {
  return db
    .select()
    .from(timesheetsTable)
    .where(eq(timesheetsTable.status, "submitted"));
}

/**
 * Check if any certified/locked timesheet exists for an employee that covers the given timestamp.
 * Used to lock punches that belong to finalized timesheets.
 */
export async function isInFinalizedTimesheetPeriod(
  employeeId: number,
  punchedAt: Date
): Promise<boolean> {
  const dateStr = punchedAt.toISOString().slice(0, 10);

  try {
    const rows = await db
      .select()
      .from(timesheetsTable)
      .where(
        and(
          eq(timesheetsTable.employeeId, employeeId),
          or(
            eq(timesheetsTable.status, "certified"),
            eq(timesheetsTable.status, "locked"),
            eq(timesheetsTable.status, "correction_requested"),
            eq(timesheetsTable.status, "correction_approved")
          ),
          lte(timesheetsTable.periodStart, dateStr),
          gte(timesheetsTable.periodEnd, dateStr)
        )
      );

    return rows.length > 0;
  } catch (err: any) {
    if (err?.code === '42P01') return false;
    throw err;
  }
}

export async function findFinalizedTimesheetForPunch(
  employeeId: number,
  punchedAt: Date
): Promise<Timesheet | null> {
  const dateStr = punchedAt.toISOString().slice(0, 10);

  try {
    const [row] = await db
      .select()
      .from(timesheetsTable)
      .where(
        and(
          eq(timesheetsTable.employeeId, employeeId),
          or(
            eq(timesheetsTable.status, "certified"),
            eq(timesheetsTable.status, "locked"),
            eq(timesheetsTable.status, "correction_requested"),
            eq(timesheetsTable.status, "correction_approved")
          ),
          lte(timesheetsTable.periodStart, dateStr),
          gte(timesheetsTable.periodEnd, dateStr)
        )
      )
      .limit(1);

    return row ?? null;
  } catch (err: any) {
    if (err?.code === '42P01') return null;
    throw err;
  }
}

/**
 * Check whether the given entry date falls inside a PAYROLL_APPROVED salaried timesheet
 * for the given public employee id.  A salaried timesheet is payroll-approved when
 * payroll_approved_at IS NOT NULL.
 *
 * Used to block admin edits/deletes of SALARIED_ENTRY punch_ledger rows and to block
 * retroactive posting of labor entry drafts into already-approved periods.
 *
 * @param publicEmployeeId  public.employees.id
 * @param entryDate         any value that can be converted to a YYYY-MM-DD string
 */
export async function findPayrollApprovedSalariedTimesheetForPunch(
  publicEmployeeId: number,
  entryDate: Date | string,
): Promise<SalariedTimesheet | null> {
  const dateStr =
    entryDate instanceof Date
      ? entryDate.toISOString().slice(0, 10)
      : String(entryDate).slice(0, 10);

  try {
    const [row] = await db
      .select()
      .from(salariedTimesheetsTable)
      .where(
        and(
          eq(salariedTimesheetsTable.employeeId, publicEmployeeId),
          isNotNull(salariedTimesheetsTable.payrollApprovedAt),
          lte(salariedTimesheetsTable.periodStart, dateStr),
          gte(salariedTimesheetsTable.periodEnd, dateStr),
        ),
      )
      .limit(1);

    return row ?? null;
  } catch (err: any) {
    if (err?.code === '42P01') return null;
    throw err;
  }
}

export interface GustoExportRow {
  first_name: string;
  last_name: string;
  regular_hours: number;
  overtime_hours: number;
  double_overtime_hours: number;
  sick_hours: number;
  vacation_hours: number;
}

/**
 * Export approved timesheets for a given date range in Gusto-compatible format.
 * Includes:
 *  - regular_hours / overtime_hours from approved timesheets in the period
 *  - vacation_hours from approved PTO leave_entries (leaveType='pto') in the period
 *  - sick_hours from approved sick leave_entries (leaveType='sick') in the period
 *
 * PTO hours are sourced exclusively from leave_entries linked (via source_request_id)
 * to approved time_off_requests.  Manual entries without a source_request_id and
 * voided entries are both excluded.  PTO hours are NEVER added to regular_hours —
 * they appear in their own columns.
 */
export async function exportFinalizedTimesheetsForGusto(
  periodStart: string,
  periodEnd: string
): Promise<GustoExportRow[]> {
  const timesheets = await db
    .select()
    .from(timesheetsTable)
    .where(
      and(
        or(
          eq(timesheetsTable.status, "certified"),
          eq(timesheetsTable.status, "locked")
        ),
        gte(timesheetsTable.periodStart, periodStart),
        lte(timesheetsTable.periodEnd, periodEnd)
      )
    );

  // Build worked-hours map keyed by timekeeping.employees.id
  const byEmployee = new Map<number, { regularHours: number; overtimeHours: number }>();
  for (const ts of timesheets) {
    const existing = byEmployee.get(ts.employeeId) ?? { regularHours: 0, overtimeHours: 0 };
    byEmployee.set(ts.employeeId, {
      regularHours: existing.regularHours + ts.regularHours,
      overtimeHours: existing.overtimeHours + ts.overtimeHours,
    });
  }

  // Query leave_entries for PTO/sick hours in the period.
  // Only entries linked via source_request_id to an approved time_off_request are
  // included (INNER JOIN ensures this).  Manual leave entries without a
  // source_request_id are intentionally excluded — they have not gone through the
  // approval workflow and must not appear in payroll.  Voided entries are excluded.
  const leaveRows = await pool.query(
    `SELECT le.employee_id, le.leave_type, SUM(le.hours) AS total_hours
     FROM timekeeping.leave_entries le
     INNER JOIN timekeeping.time_off_requests tor
       ON tor.id = le.source_request_id AND tor.status = 'approved'
     WHERE le.date >= $1
       AND le.date <= $2
       AND le.voided_at IS NULL
       AND le.leave_type IN ('pto', 'sick')
     GROUP BY le.employee_id, le.leave_type`,
    [periodStart, periodEnd]
  );

  // pool.query returns the rows array directly (see server/db.ts — it returns [...result.rows])
  // Build leave map keyed by timekeeping.employees.id
  const ptoByEmployee = new Map<number, { vacationHours: number; sickHours: number }>();
  for (const row of leaveRows) {
    const empId = Number(row.employee_id);
    const hours = Number(row.total_hours);
    const existing = ptoByEmployee.get(empId) ?? { vacationHours: 0, sickHours: 0 };
    if (row.leave_type === "pto") {
      existing.vacationHours += hours;
    } else if (row.leave_type === "sick") {
      existing.sickHours += hours;
    }
    ptoByEmployee.set(empId, existing);
  }

  // Build the set of all employee IDs that appear in either map
  const allEmployeeIds = new Set([...byEmployee.keys(), ...ptoByEmployee.keys()]);

  if (allEmployeeIds.size === 0) return [];

  const allResolved = await listResolvedEmployees();
  const resolved = allResolved.filter(
    (e) => e.timekeepingId != null && allEmployeeIds.has(e.timekeepingId)
  );

  return resolved.map((emp) => {
    const worked = byEmployee.get(emp.timekeepingId!) ?? { regularHours: 0, overtimeHours: 0 };
    const leave = ptoByEmployee.get(emp.timekeepingId!) ?? { vacationHours: 0, sickHours: 0 };
    return {
      first_name: emp.firstName,
      last_name: emp.lastName,
      regular_hours: worked.regularHours,
      overtime_hours: worked.overtimeHours,
      double_overtime_hours: 0,
      sick_hours: leave.sickHours,
      vacation_hours: leave.vacationHours,
    };
  });
}
