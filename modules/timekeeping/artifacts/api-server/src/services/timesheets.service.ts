import { db, timesheetsTable, punchesTable, employeesTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { computeTimesheetHours } from "../lib/timekeeping";
import { getOrCreateSettings } from "./settings.service";
import { logAction, type AuditActor } from "./audit.service";
import type { Timesheet } from "@workspace/db";

export type { Timesheet };

export async function listTimesheets(filters?: {
  employeeId?: number;
  status?: string;
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

async function computeHoursForPeriod(
  employeeId: number,
  periodStart: string,
  periodEnd: string
) {
  const settings = await getOrCreateSettings();

  const punches = await db
    .select()
    .from(punchesTable)
    .where(
      and(
        eq(punchesTable.employeeId, employeeId),
        gte(punchesTable.punchedAt, new Date(periodStart)),
        lte(punchesTable.punchedAt, new Date(`${periodEnd}T23:59:59Z`))
      )
    );

  return computeTimesheetHours(punches, {
    timezone: settings.timezone,
    overtimeThresholdDaily: settings.overtimeThresholdDaily,
    overtimeThresholdWeekly: settings.overtimeThresholdWeekly,
    roundingMinutes: settings.roundingRuleMinutes,
  });
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

  if (existing.status === "approved") {
    return { error: "Approved timesheets cannot be edited", statusCode: 409 };
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
 * Requires: status must be "draft", employee must have attested.
 */
export async function submitTimesheet(
  id: number,
  actor: AuditActor
): Promise<Timesheet | { error: string; statusCode: number }> {
  const existing = await getTimesheet(id);
  if (!existing) return { error: "Timesheet not found", statusCode: 404 };

  if (existing.status !== "draft") {
    return {
      error: `Only draft timesheets can be submitted (current status: ${existing.status})`,
      statusCode: 409,
    };
  }

  if (!existing.employeeAttested) {
    return {
      error: "Employee must attest to the accuracy of this timesheet before submitting",
      statusCode: 422,
    };
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
    newValues: { status: "submitted", submittedBy: actor.id },
    actor,
  });

  return row!;
}

/**
 * Record employee attestation on a draft timesheet.
 * This is a prerequisite for submission.
 */
export async function attestTimesheet(
  id: number,
  actor: AuditActor
): Promise<Timesheet | { error: string; statusCode: number }> {
  const existing = await getTimesheet(id);
  if (!existing) return { error: "Timesheet not found", statusCode: 404 };

  if (existing.status !== "draft") {
    return {
      error: "Only draft timesheets can be attested",
      statusCode: 409,
    };
  }

  const [row] = await db
    .update(timesheetsTable)
    .set({ employeeAttested: true, attestedAt: new Date() })
    .where(eq(timesheetsTable.id, id))
    .returning();

  await logAction({
    tableName: "timesheets",
    recordId: id,
    action: "UPDATE",
    oldValues: { employeeAttested: false },
    newValues: { employeeAttested: true, attestedAt: row!.attestedAt, attestedByUserId: actor.id },
    actor,
  });

  return row!;
}

/**
 * Approve a submitted timesheet.
 * Requires: status must be "submitted".
 * Captures reviewer identity from actor.
 * Locks the timesheet — no further edits permitted.
 */
export async function approveTimesheet(
  id: number,
  actor: AuditActor
): Promise<Timesheet | { error: string; statusCode: number }> {
  const existing = await getTimesheet(id);
  if (!existing) return { error: "Timesheet not found", statusCode: 404 };

  if (existing.status !== "submitted") {
    return {
      error: `Only submitted timesheets can be approved (current status: ${existing.status})`,
      statusCode: 409,
    };
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
      status: "approved",
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
    newValues: { status: "approved", reviewedBy: actor.id, reviewerEmail: actor.email },
    actor,
  });

  return row!;
}

/**
 * Reject a submitted timesheet.
 * Requires: status must be "submitted".
 * Returns it to a state where the employee can correct and re-attest.
 */
export async function rejectTimesheet(
  id: number,
  rejectionNote: string,
  actor: AuditActor
): Promise<Timesheet | { error: string; statusCode: number }> {
  const existing = await getTimesheet(id);
  if (!existing) return { error: "Timesheet not found", statusCode: 404 };

  if (existing.status !== "submitted") {
    return {
      error: `Only submitted timesheets can be rejected (current status: ${existing.status})`,
      statusCode: 409,
    };
  }

  if (!actor.id) {
    return { error: "Reviewer identity is required", statusCode: 401 };
  }

  const [row] = await db
    .update(timesheetsTable)
    .set({
      status: "draft",
      rejectionNote,
      reviewedAt: new Date(),
      reviewedBy: actor.id,
      reviewerEmail: actor.email,
      employeeAttested: false,
      attestedAt: null,
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
  if (timesheet.status !== "draft") {
    return {
      error: "Only draft timesheets can be recalculated",
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
    newValues: hours as Record<string, unknown>,
    actor,
  });

  return { timesheet: updated! };
}

export async function getPendingTimesheets(): Promise<Timesheet[]> {
  return db
    .select()
    .from(timesheetsTable)
    .where(eq(timesheetsTable.status, "submitted"));
}

/**
 * Check if any approved timesheet exists for an employee that covers the given timestamp.
 * Used to lock punches that belong to approved timesheets.
 */
export async function isInApprovedTimesheetPeriod(
  employeeId: number,
  punchedAt: Date
): Promise<boolean> {
  const dateStr = punchedAt.toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(timesheetsTable)
    .where(
      and(
        eq(timesheetsTable.employeeId, employeeId),
        eq(timesheetsTable.status, "approved"),
        lte(timesheetsTable.periodStart, dateStr),
        gte(timesheetsTable.periodEnd, dateStr)
      )
    );

  return rows.length > 0;
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
 * Only timesheets fully within the date range (periodStart >= start, periodEnd <= end) are included.
 * Hours are summed per employee across all matching approved timesheets.
 */
export async function exportApprovedTimesheetsForGusto(
  periodStart: string,
  periodEnd: string
): Promise<GustoExportRow[]> {
  const timesheets = await db
    .select()
    .from(timesheetsTable)
    .where(
      and(
        eq(timesheetsTable.status, "approved"),
        gte(timesheetsTable.periodStart, periodStart),
        lte(timesheetsTable.periodEnd, periodEnd)
      )
    );

  if (timesheets.length === 0) return [];

  const byEmployee = new Map<number, { regularHours: number; overtimeHours: number }>();
  for (const ts of timesheets) {
    const existing = byEmployee.get(ts.employeeId) ?? { regularHours: 0, overtimeHours: 0 };
    byEmployee.set(ts.employeeId, {
      regularHours: existing.regularHours + ts.regularHours,
      overtimeHours: existing.overtimeHours + ts.overtimeHours,
    });
  }

  const employeeIds = Array.from(byEmployee.keys());
  const employees = await db
    .select()
    .from(employeesTable)
    .where(inArray(employeesTable.id, employeeIds));

  return employees.map((emp) => {
    const hours = byEmployee.get(emp.id) ?? { regularHours: 0, overtimeHours: 0 };
    return {
      first_name: emp.firstName,
      last_name: emp.lastName,
      regular_hours: hours.regularHours,
      overtime_hours: hours.overtimeHours,
      double_overtime_hours: 0,
      sick_hours: 0,
      vacation_hours: 0,
    };
  });
}
