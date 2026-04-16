import { db, laborTimeClockPunchesTable, laborWorkSessionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { LaborTimeClockPunch, InsertLaborTimeClockPunch } from "@workspace/db";
import { logLaborAction } from "./labor-audit.service";
import type { AuditActor } from "./audit.service";

export async function listPunches(filters?: {
  sessionId?: number;
  employeeId?: number;
  type?: string;
}): Promise<LaborTimeClockPunch[]> {
  const conditions = [
    filters?.sessionId != null ? eq(laborTimeClockPunchesTable.sessionId, filters.sessionId) : undefined,
    filters?.employeeId != null ? eq(laborTimeClockPunchesTable.employeeId, filters.employeeId) : undefined,
    filters?.type ? eq(laborTimeClockPunchesTable.type, filters.type) : undefined,
  ].filter(Boolean) as Parameters<typeof and>;

  return conditions.length > 0
    ? db.select().from(laborTimeClockPunchesTable).where(and(...conditions))
    : db.select().from(laborTimeClockPunchesTable);
}

export async function getPunch(id: number): Promise<LaborTimeClockPunch | null> {
  const [row] = await db
    .select()
    .from(laborTimeClockPunchesTable)
    .where(eq(laborTimeClockPunchesTable.id, id));
  return row ?? null;
}

export type CreatePunchErrorCode = "session_not_found" | "session_not_open" | "session_access_denied";

export interface CreatePunchResult {
  punch?: LaborTimeClockPunch;
  error?: string;
  errorCode?: CreatePunchErrorCode;
}

export async function createPunch(
  data: InsertLaborTimeClockPunch,
  actor: AuditActor
): Promise<CreatePunchResult> {
  if (data.sessionId != null) {
    const [session] = await db
      .select()
      .from(laborWorkSessionsTable)
      .where(eq(laborWorkSessionsTable.id, data.sessionId));

    if (!session) {
      return { error: `Session ${data.sessionId} not found`, errorCode: "session_not_found" };
    }
    if (session.status !== "open") {
      return { error: `Session ${data.sessionId} is ${session.status} and cannot accept new punches`, errorCode: "session_not_open" };
    }
    // Always enforce employee/session consistency regardless of admin status to
    // prevent cross-employee data corruption when a sessionId is provided.
    if (session.employeeId !== data.employeeId) {
      return { error: "Session does not belong to this employee", errorCode: "session_access_denied" };
    }
  }

  const [row] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(laborTimeClockPunchesTable)
      .values(data)
      .returning();
    await logLaborAction(
      {
        tableName: "labor_time_clock_punches",
        recordId: inserted[0]!.id,
        action: "INSERT",
        newValues: inserted[0] as Record<string, unknown>,
        actor,
      },
      tx
    );
    return inserted;
  });
  return { punch: row! };
}
