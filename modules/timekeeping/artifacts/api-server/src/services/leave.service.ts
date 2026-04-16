import { db, leaveEntriesTable, timesheetsTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import type { LeaveEntry } from "@workspace/db";
import { logAction, type AuditActor } from "./audit.service";

export type { LeaveEntry };

const LEAVE_TYPES = ["pto", "sick", "holiday", "bereavement", "other"] as const;
export type LeaveType = typeof LEAVE_TYPES[number];

export function isValidLeaveType(t: string): t is LeaveType {
  return (LEAVE_TYPES as readonly string[]).includes(t);
}

export async function listLeaveEntries(filters?: {
  employeeId?: number;
  from?: string;
  to?: string;
}): Promise<LeaveEntry[]> {
  const conditions = [];
  if (filters?.employeeId != null) {
    conditions.push(eq(leaveEntriesTable.employeeId, filters.employeeId));
  }
  if (filters?.from) {
    conditions.push(gte(leaveEntriesTable.date, filters.from));
  }
  if (filters?.to) {
    conditions.push(lte(leaveEntriesTable.date, filters.to));
  }

  return db
    .select()
    .from(leaveEntriesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(leaveEntriesTable.date);
}

export async function getLeaveEntry(id: number): Promise<LeaveEntry | null> {
  const [row] = await db
    .select()
    .from(leaveEntriesTable)
    .where(eq(leaveEntriesTable.id, id));
  return row ?? null;
}

async function validateLeaveDateMutable(employeeId: number, date: string): Promise<string | null> {
  const timesheets = await db
    .select()
    .from(timesheetsTable)
    .where(
      and(
        eq(timesheetsTable.employeeId, employeeId),
        lte(timesheetsTable.periodStart, date),
        gte(timesheetsTable.periodEnd, date),
      )
    );

  const hasApproved = timesheets.some(t => t.status === "approved");
  if (hasApproved) {
    return "Cannot modify leave in an approved timesheet period.";
  }

  return null;
}

async function validateLeaveDate(employeeId: number, date: string): Promise<string | null> {
  const timesheets = await db
    .select()
    .from(timesheetsTable)
    .where(
      and(
        eq(timesheetsTable.employeeId, employeeId),
        lte(timesheetsTable.periodStart, date),
        gte(timesheetsTable.periodEnd, date),
      )
    );

  if (timesheets.length === 0) {
    return "Leave date must fall within an existing timesheet period.";
  }

  const hasApproved = timesheets.some(t => t.status === "approved");
  if (hasApproved) {
    return "Cannot add leave to an approved timesheet period. Use the amendment workflow instead.";
  }

  const hasMutable = timesheets.some(t => t.status === "draft" || t.status === "submitted");
  if (!hasMutable) {
    return "Leave can only be added to a draft or submitted timesheet period.";
  }

  return null;
}

export async function createLeaveEntry(
  data: {
    employeeId: number;
    date: string;
    leaveType: string;
    hours: number;
    note?: string | null;
  },
  actor: AuditActor
): Promise<LeaveEntry | { error: string; statusCode: number }> {
  if (!isValidLeaveType(data.leaveType)) {
    return { error: `Invalid leave type: ${data.leaveType}. Must be one of: ${LEAVE_TYPES.join(", ")}`, statusCode: 400 };
  }
  if (data.hours <= 0 || data.hours > 24) {
    return { error: "Hours must be between 0 and 24", statusCode: 400 };
  }

  const periodError = await validateLeaveDate(data.employeeId, data.date);
  if (periodError) {
    return { error: periodError, statusCode: 409 };
  }

  const [row] = await db
    .insert(leaveEntriesTable)
    .values({
      employeeId: data.employeeId,
      date: data.date,
      leaveType: data.leaveType,
      hours: data.hours,
      note: data.note ?? null,
    })
    .returning();

  await logAction({
    tableName: "leave_entries",
    recordId: row!.id,
    action: "INSERT",
    newValues: row as Record<string, unknown>,
    actor,
  });

  return row!;
}

export async function updateLeaveEntry(
  id: number,
  data: {
    date?: string;
    leaveType?: string;
    hours?: number;
    note?: string | null;
  },
  actor: AuditActor
): Promise<LeaveEntry | { error: string; statusCode: number }> {
  const existing = await getLeaveEntry(id);
  if (!existing) return { error: "Leave entry not found", statusCode: 404 };

  if (data.leaveType != null && !isValidLeaveType(data.leaveType)) {
    return { error: `Invalid leave type: ${data.leaveType}. Must be one of: ${LEAVE_TYPES.join(", ")}`, statusCode: 400 };
  }
  if (data.hours != null && (data.hours <= 0 || data.hours > 24)) {
    return { error: "Hours must be between 0 and 24", statusCode: 400 };
  }

  const currentPeriodError = await validateLeaveDateMutable(existing.employeeId, existing.date);
  if (currentPeriodError) {
    return { error: currentPeriodError, statusCode: 409 };
  }

  if (data.date !== undefined && data.date !== existing.date) {
    const newPeriodError = await validateLeaveDate(existing.employeeId, data.date);
    if (newPeriodError) {
      return { error: newPeriodError, statusCode: 409 };
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.date !== undefined) updateData.date = data.date;
  if (data.leaveType !== undefined) updateData.leaveType = data.leaveType;
  if (data.hours !== undefined) updateData.hours = data.hours;
  if (data.note !== undefined) updateData.note = data.note;

  const [row] = await db
    .update(leaveEntriesTable)
    .set(updateData)
    .where(eq(leaveEntriesTable.id, id))
    .returning();

  await logAction({
    tableName: "leave_entries",
    recordId: id,
    action: "UPDATE",
    oldValues: existing as Record<string, unknown>,
    newValues: row as Record<string, unknown>,
    actor,
  });

  return row!;
}

export async function deleteLeaveEntry(
  id: number,
  actor: AuditActor
): Promise<{ success: boolean } | { error: string; statusCode: number }> {
  const existing = await getLeaveEntry(id);
  if (!existing) return { error: "Leave entry not found", statusCode: 404 };

  const periodError = await validateLeaveDateMutable(existing.employeeId, existing.date);
  if (periodError) {
    return { error: periodError, statusCode: 409 };
  }

  await db.delete(leaveEntriesTable).where(eq(leaveEntriesTable.id, id));

  await logAction({
    tableName: "leave_entries",
    recordId: id,
    action: "DELETE",
    oldValues: existing as Record<string, unknown>,
    actor,
  });

  return { success: true };
}

export async function getLeaveHoursForPeriod(
  employeeId: number,
  periodStart: string,
  periodEnd: string
): Promise<{ totalLeaveHours: number; entries: LeaveEntry[] }> {
  const entries = await listLeaveEntries({
    employeeId,
    from: periodStart,
    to: periodEnd,
  });
  const totalLeaveHours = entries.reduce((sum, e) => sum + e.hours, 0);
  return { totalLeaveHours, entries };
}
