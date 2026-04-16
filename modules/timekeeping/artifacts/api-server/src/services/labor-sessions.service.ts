import { db, laborWorkSessionsTable, laborAuthorizationsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import type { LaborWorkSession } from "@workspace/db";
import { logLaborAction } from "./labor-audit.service";
import { checkBudget, getLaborAuthorization, resolveChargeCodeForSession } from "./labor-authorizations.service";
import { syncTimesheetHours } from "./labor-daily-timesheets.service";
import type { AuditActor } from "./audit.service";

export interface OpenSessionParams {
  employeeId: number;
  chargeCodeId?: number | null;
  laborAuthorizationId?: number | null;
  projectId?: string | null;
  workOrderId?: string | null;
  travelerId?: string | null;
  notes?: string | null;
}

export interface OpenSessionResult {
  session?: LaborWorkSession;
  error?: string;
  errorCode?: "budget_exhausted" | "charge_code_required" | "authorization_not_found" | "authorization_mismatch";
  laborAuthorizationId?: number;
}

export async function openSession(
  params: OpenSessionParams,
  actor: AuditActor
): Promise<OpenSessionResult> {
  const resolved = await resolveChargeCodeForSession({
    travelerId: params.travelerId,
    workOrderId: params.workOrderId,
    projectId: params.projectId,
    manualChargeCodeId: params.chargeCodeId ?? null,
  });

  if (!resolved) {
    return {
      error: "No charge code could be resolved for this session. Please select a charge code manually.",
      errorCode: "charge_code_required",
    };
  }

  if (params.laborAuthorizationId != null) {
    const auth = await getLaborAuthorization(params.laborAuthorizationId);
    if (!auth) {
      return {
        error: `Labor authorization ${params.laborAuthorizationId} not found`,
        errorCode: "authorization_not_found",
      };
    }
    if (auth.status !== "active") {
      return {
        error: `Labor authorization ${params.laborAuthorizationId} is ${auth.status} and cannot accept new sessions`,
        errorCode: "authorization_mismatch",
      };
    }
    // Verify resolved charge code matches the authorization's designated charge code.
    if (resolved.chargeCodeId !== auth.chargeCodeId) {
      return {
        error: `Session charge code (${resolved.chargeCodeId}) does not match authorization charge code (${auth.chargeCodeId})`,
        errorCode: "authorization_mismatch",
      };
    }
    // If the authorization has scoped context IDs, verify the session's context IDs don't conflict.
    if (
      (auth.projectId && params.projectId && auth.projectId !== params.projectId) ||
      (auth.workOrderId && params.workOrderId && auth.workOrderId !== params.workOrderId) ||
      (auth.travelerId && params.travelerId && auth.travelerId !== params.travelerId)
    ) {
      return {
        error: "Labor authorization context does not match the provided project/work order/traveler",
        errorCode: "authorization_mismatch",
      };
    }
    const budget = await checkBudget(params.laborAuthorizationId);
    if (!budget.allowed) {
      return {
        error: "Budget exhausted. An extra-hours request is required before starting a new session.",
        errorCode: "budget_exhausted",
        laborAuthorizationId: budget.laborAuthorizationId,
      };
    }
  }

  const session = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(laborWorkSessionsTable)
      .values({
        employeeId: params.employeeId,
        chargeCodeId: resolved.chargeCodeId,
        laborAuthorizationId: params.laborAuthorizationId ?? null,
        projectId: params.projectId ?? null,
        workOrderId: params.workOrderId ?? null,
        travelerId: params.travelerId ?? null,
        startedAt: new Date(),
        status: "open",
        notes: params.notes ?? null,
      })
      .returning();
    await logLaborAction(
      { tableName: "labor_work_sessions", recordId: row!.id, action: "INSERT", newValues: row as Record<string, unknown>, actor },
      tx
    );
    return row!;
  });

  return { session };
}

export type CloseSessionErrorCode = "not_found" | "not_open" | "access_denied" | "concurrent_close";

export interface CloseSessionResult {
  session?: LaborWorkSession;
  error?: string;
  errorCode?: CloseSessionErrorCode;
}

export async function closeSession(
  sessionId: number,
  actor: AuditActor,
  actingEmployeeId: number,
  isAdmin: boolean
): Promise<CloseSessionResult> {
  const [existing] = await db
    .select()
    .from(laborWorkSessionsTable)
    .where(eq(laborWorkSessionsTable.id, sessionId));

  if (!existing) return { error: "Session not found", errorCode: "not_found" };
  if (existing.status !== "open") return { error: "Session is not open", errorCode: "not_open" };

  if (!isAdmin && existing.employeeId !== actingEmployeeId) {
    return { error: "You can only close your own work sessions", errorCode: "access_denied" };
  }

  const endedAt = new Date();
  const totalHours =
    (endedAt.getTime() - new Date(existing.startedAt).getTime()) / (1000 * 60 * 60);

  const row = await db.transaction(async (tx) => {
    const closed = await tx
      .update(laborWorkSessionsTable)
      .set({ endedAt, totalHours, status: "closed" })
      .where(and(eq(laborWorkSessionsTable.id, sessionId), eq(laborWorkSessionsTable.status, "open")))
      .returning();

    if (closed.length === 0) return null;

    if (existing.laborAuthorizationId != null) {
      // Capture before-state for full before/after audit snapshot.
      const [beforeAuth] = await tx
        .select()
        .from(laborAuthorizationsTable)
        .where(eq(laborAuthorizationsTable.id, existing.laborAuthorizationId));

      const [afterAuth] = await tx
        .update(laborAuthorizationsTable)
        .set({ consumedHours: sql`${laborAuthorizationsTable.consumedHours} + ${totalHours}` })
        .where(eq(laborAuthorizationsTable.id, existing.laborAuthorizationId))
        .returning();

      await logLaborAction(
        { tableName: "labor_authorizations", recordId: existing.laborAuthorizationId, action: "UPDATE", oldValues: beforeAuth as Record<string, unknown>, newValues: afterAuth as Record<string, unknown>, actor },
        tx
      );
    }

    await logLaborAction(
      { tableName: "labor_work_sessions", recordId: sessionId, action: "UPDATE", oldValues: existing as Record<string, unknown>, newValues: closed[0] as Record<string, unknown>, actor },
      tx
    );

    const sessionDate = new Date(existing.startedAt).toISOString().slice(0, 10);
    await syncTimesheetHours(existing.employeeId, sessionDate, tx);

    return closed[0]!;
  });

  if (!row) return { error: "Session was already closed by a concurrent operation", errorCode: "concurrent_close" };

  return { session: row };
}

export async function listSessions(filters?: {
  employeeId?: number;
  status?: string;
  projectId?: string;
  workOrderId?: string;
  travelerId?: string;
}): Promise<LaborWorkSession[]> {
  const conditions = [
    filters?.employeeId != null ? eq(laborWorkSessionsTable.employeeId, filters.employeeId) : undefined,
    filters?.status ? eq(laborWorkSessionsTable.status, filters.status) : undefined,
    filters?.projectId ? eq(laborWorkSessionsTable.projectId, filters.projectId) : undefined,
    filters?.workOrderId ? eq(laborWorkSessionsTable.workOrderId, filters.workOrderId) : undefined,
    filters?.travelerId ? eq(laborWorkSessionsTable.travelerId, filters.travelerId) : undefined,
  ].filter(Boolean) as Parameters<typeof and>;

  return conditions.length > 0
    ? db.select().from(laborWorkSessionsTable).where(and(...conditions))
    : db.select().from(laborWorkSessionsTable);
}

export async function getSession(id: number): Promise<LaborWorkSession | null> {
  const [row] = await db
    .select()
    .from(laborWorkSessionsTable)
    .where(eq(laborWorkSessionsTable.id, id));
  return row ?? null;
}
