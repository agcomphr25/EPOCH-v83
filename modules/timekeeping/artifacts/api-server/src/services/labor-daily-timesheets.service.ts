import { db, dailyTimesheetsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { DailyTimesheet, InsertDailyTimesheet } from "@workspace/db";
import { logLaborAction } from "./labor-audit.service";
import type { AuditActor } from "./audit.service";

export async function listDailyTimesheets(filters?: {
  employeeId?: number;
  date?: string;
  status?: string;
}): Promise<DailyTimesheet[]> {
  const conditions = [
    filters?.employeeId != null ? eq(dailyTimesheetsTable.employeeId, filters.employeeId) : undefined,
    filters?.date ? eq(dailyTimesheetsTable.date, filters.date) : undefined,
    filters?.status ? eq(dailyTimesheetsTable.status, filters.status) : undefined,
  ].filter(Boolean) as Parameters<typeof and>;

  return conditions.length > 0
    ? db.select().from(dailyTimesheetsTable).where(and(...conditions))
    : db.select().from(dailyTimesheetsTable);
}

export async function getDailyTimesheet(id: number): Promise<DailyTimesheet | null> {
  const [row] = await db
    .select()
    .from(dailyTimesheetsTable)
    .where(eq(dailyTimesheetsTable.id, id));
  return row ?? null;
}

export async function createDraftTimesheet(
  data: InsertDailyTimesheet,
  actor: AuditActor
): Promise<DailyTimesheet> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(dailyTimesheetsTable)
      .values({ ...data, status: "draft" })
      .returning();
    await logLaborAction(
      { tableName: "daily_timesheets", recordId: row!.id, action: "INSERT", newValues: row as Record<string, unknown>, actor },
      tx
    );
    return row!;
  });
}

export type TimesheetErrorCode = "not_found" | "invalid_status" | "access_denied" | "concurrent_update";

export interface TimesheetActionResult {
  timesheet?: DailyTimesheet;
  error?: string;
  errorCode?: TimesheetErrorCode;
}

export async function certifyTimesheet(
  id: number,
  certifiedBy: number,
  actor: AuditActor
): Promise<TimesheetActionResult> {
  const existing = await getDailyTimesheet(id);
  if (!existing) return { error: "Timesheet not found", errorCode: "not_found" };
  if (existing.status !== "draft") return { error: "Only draft timesheets can be certified", errorCode: "invalid_status" };

  if (existing.employeeId !== certifiedBy) {
    return { error: "You can only certify your own timesheet", errorCode: "access_denied" };
  }

  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(dailyTimesheetsTable)
      .set({ status: "certified", certifiedAt: new Date(), certifiedBy })
      .where(and(eq(dailyTimesheetsTable.id, id), eq(dailyTimesheetsTable.status, "draft")))
      .returning();

    if (updated.length === 0) return null;

    await logLaborAction(
      { tableName: "daily_timesheets", recordId: id, action: "UPDATE", oldValues: existing as Record<string, unknown>, newValues: updated[0] as Record<string, unknown>, actor },
      tx
    );
    return updated[0]!;
  });

  if (!result) return { error: "Timesheet was already certified by a concurrent operation", errorCode: "concurrent_update" };
  return { timesheet: result };
}

export async function approveTimesheet(
  id: number,
  approvedBy: number,
  actor: AuditActor
): Promise<TimesheetActionResult> {
  const existing = await getDailyTimesheet(id);
  if (!existing) return { error: "Timesheet not found", errorCode: "not_found" };
  if (existing.status !== "certified") return { error: "Only certified timesheets can be approved", errorCode: "invalid_status" };

  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(dailyTimesheetsTable)
      .set({ status: "approved", approvedAt: new Date(), approvedBy })
      .where(and(eq(dailyTimesheetsTable.id, id), eq(dailyTimesheetsTable.status, "certified")))
      .returning();

    if (updated.length === 0) return null;

    await logLaborAction(
      { tableName: "daily_timesheets", recordId: id, action: "UPDATE", oldValues: existing as Record<string, unknown>, newValues: updated[0] as Record<string, unknown>, actor },
      tx
    );
    return updated[0]!;
  });

  if (!result) return { error: "Timesheet was already approved by a concurrent operation", errorCode: "concurrent_update" };
  return { timesheet: result };
}
