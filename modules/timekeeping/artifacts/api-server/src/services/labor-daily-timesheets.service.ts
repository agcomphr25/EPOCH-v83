import { db, dailyTimesheetsTable, laborWorkSessionsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import type { DailyTimesheet, InsertDailyTimesheet } from "@workspace/db";
import { logLaborAction } from "./labor-audit.service";
import type { AuditActor } from "./audit.service";

/**
 * All date bucketing uses UTC explicitly so JS (`toISOString()`) and SQL
 * (`AT TIME ZONE 'UTC'`) agree even when the database server clock differs.
 */

async function computeTotalHoursForDate(employeeId: number, date: string): Promise<number> {
  const result = await db
    .select({
      total: sql<number>`coalesce(sum(${laborWorkSessionsTable.totalHours}), 0)`,
    })
    .from(laborWorkSessionsTable)
    .where(
      and(
        eq(laborWorkSessionsTable.employeeId, employeeId),
        eq(laborWorkSessionsTable.status, "closed"),
        sql`(${laborWorkSessionsTable.startedAt} AT TIME ZONE 'UTC')::date = ${date}::date`
      )
    );
  return Number(result[0]?.total ?? 0);
}

/**
 * Batch-fetches computed totalHours for a list of timesheets in a single query
 * (one GROUP BY instead of N individual aggregates).
 */
async function batchComputeTotalHours(
  timesheets: DailyTimesheet[]
): Promise<Map<string, number>> {
  if (timesheets.length === 0) return new Map();

  const employeeIds = [...new Set(timesheets.map((t) => t.employeeId))];
  const dates = [...new Set(timesheets.map((t) => t.date))];

  const rows = await db
    .select({
      employeeId: laborWorkSessionsTable.employeeId,
      sessionDate: sql<string>`(${laborWorkSessionsTable.startedAt} AT TIME ZONE 'UTC')::date::text`,
      total: sql<number>`coalesce(sum(${laborWorkSessionsTable.totalHours}), 0)`,
    })
    .from(laborWorkSessionsTable)
    .where(
      and(
        inArray(laborWorkSessionsTable.employeeId, employeeIds),
        eq(laborWorkSessionsTable.status, "closed"),
        sql`(${laborWorkSessionsTable.startedAt} AT TIME ZONE 'UTC')::date::text = ANY(${dates})`
      )
    )
    .groupBy(
      laborWorkSessionsTable.employeeId,
      sql`(${laborWorkSessionsTable.startedAt} AT TIME ZONE 'UTC')::date`
    );

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(`${row.employeeId}:${row.sessionDate}`, Number(row.total));
  }
  return map;
}

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

  const rows = conditions.length > 0
    ? await db.select().from(dailyTimesheetsTable).where(and(...conditions))
    : await db.select().from(dailyTimesheetsTable);

  const hoursMap = await batchComputeTotalHours(rows);
  return rows.map((row) => ({
    ...row,
    totalHours: hoursMap.get(`${row.employeeId}:${row.date}`) ?? 0,
  }));
}

export async function getDailyTimesheet(id: number): Promise<DailyTimesheet | null> {
  const [row] = await db
    .select()
    .from(dailyTimesheetsTable)
    .where(eq(dailyTimesheetsTable.id, id));
  if (!row) return null;
  const totalHours = await computeTotalHoursForDate(row.employeeId, row.date);
  return { ...row, totalHours };
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
    const totalHours = await computeTotalHoursForDate(row!.employeeId, row!.date);
    return { ...row!, totalHours };
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
      .set({ status: "certified", certifiedAt: new Date(), certifiedBy, totalHours: existing.totalHours })
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
  return { timesheet: { ...result, totalHours: existing.totalHours } };
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
  return { timesheet: { ...result, totalHours: existing.totalHours } };
}

type SyncClient = Pick<typeof db, "select" | "update">;

/**
 * Re-computes and stores totalHours for the daily_timesheets row matching
 * (employeeId, date). Silently no-ops if no timesheet exists for that day.
 * Accepts a transaction client or the root db instance.
 *
 * Date must be a YYYY-MM-DD UTC string (use `toISOString().slice(0,10)`).
 */
export async function syncTimesheetHours(
  employeeId: number,
  date: string,
  client: SyncClient = db
): Promise<void> {
  const result = await client
    .select({
      total: sql<number>`coalesce(sum(${laborWorkSessionsTable.totalHours}), 0)`,
    })
    .from(laborWorkSessionsTable)
    .where(
      and(
        eq(laborWorkSessionsTable.employeeId, employeeId),
        eq(laborWorkSessionsTable.status, "closed"),
        sql`(${laborWorkSessionsTable.startedAt} AT TIME ZONE 'UTC')::date = ${date}::date`
      )
    );
  const totalHours = Number(result[0]?.total ?? 0);

  await client
    .update(dailyTimesheetsTable)
    .set({ totalHours })
    .where(
      and(
        eq(dailyTimesheetsTable.employeeId, employeeId),
        eq(dailyTimesheetsTable.date, date)
      )
    );
}
