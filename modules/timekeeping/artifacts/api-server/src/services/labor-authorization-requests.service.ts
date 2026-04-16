import { db, laborAuthorizationRequestsTable, laborAuthorizationsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import type { LaborAuthorizationRequest, InsertLaborAuthorizationRequest } from "@workspace/db";
import { logLaborAction } from "./labor-audit.service";
import type { AuditActor } from "./audit.service";

export async function listLaborAuthorizationRequests(filters?: {
  laborAuthorizationId?: number;
  status?: string;
  requestedBy?: number;
}): Promise<LaborAuthorizationRequest[]> {
  const conditions = [
    filters?.laborAuthorizationId != null
      ? eq(laborAuthorizationRequestsTable.laborAuthorizationId, filters.laborAuthorizationId)
      : undefined,
    filters?.status ? eq(laborAuthorizationRequestsTable.status, filters.status) : undefined,
    filters?.requestedBy != null
      ? eq(laborAuthorizationRequestsTable.requestedBy, filters.requestedBy)
      : undefined,
  ].filter(Boolean) as Parameters<typeof and>;

  return conditions.length > 0
    ? db.select().from(laborAuthorizationRequestsTable).where(and(...conditions))
    : db.select().from(laborAuthorizationRequestsTable);
}

export async function getLaborAuthorizationRequest(id: number): Promise<LaborAuthorizationRequest | null> {
  const [row] = await db
    .select()
    .from(laborAuthorizationRequestsTable)
    .where(eq(laborAuthorizationRequestsTable.id, id));
  return row ?? null;
}

export interface SubmitResult {
  request?: LaborAuthorizationRequest;
  error?: string;
  errorCode?: "authorization_not_found";
}

export async function submitExtraHoursRequest(
  data: InsertLaborAuthorizationRequest,
  actor: AuditActor
): Promise<SubmitResult> {
  const [auth] = await db
    .select({ id: laborAuthorizationsTable.id })
    .from(laborAuthorizationsTable)
    .where(eq(laborAuthorizationsTable.id, data.laborAuthorizationId));
  if (!auth) {
    return { error: `Labor authorization ${data.laborAuthorizationId} not found`, errorCode: "authorization_not_found" };
  }

  const request = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(laborAuthorizationRequestsTable)
      .values({ ...data, status: "pending" })
      .returning();
    await logLaborAction(
      { tableName: "labor_authorization_requests", recordId: row!.id, action: "INSERT", newValues: row as Record<string, unknown>, actor },
      tx
    );
    return row!;
  });
  return { request };
}

export type ReviewErrorCode = "not_found" | "invalid_status" | "concurrent_update";

export interface ReviewResult {
  request?: LaborAuthorizationRequest;
  error?: string;
  errorCode?: ReviewErrorCode;
}

export async function approveExtraHoursRequest(
  id: number,
  reviewedBy: number,
  reviewNote: string | undefined,
  actor: AuditActor
): Promise<ReviewResult> {
  const existing = await getLaborAuthorizationRequest(id);
  if (!existing) return { error: "Request not found", errorCode: "not_found" as const };
  if (existing.status !== "pending") return { error: "Request is not in pending status", errorCode: "invalid_status" as const };

  const row = await db.transaction(async (tx) => {
    // WHERE status='pending' prevents concurrent approvals from double-incrementing.
    const updated = await tx
      .update(laborAuthorizationRequestsTable)
      .set({ status: "approved", reviewedBy, reviewedAt: new Date(), reviewNote: reviewNote ?? null })
      .where(and(eq(laborAuthorizationRequestsTable.id, id), eq(laborAuthorizationRequestsTable.status, "pending")))
      .returning();

    if (updated.length === 0) return null;

    const [beforeAuth] = await tx
      .select()
      .from(laborAuthorizationsTable)
      .where(eq(laborAuthorizationsTable.id, existing.laborAuthorizationId));

    const [afterAuth] = await tx
      .update(laborAuthorizationsTable)
      .set({ approvedExtraHours: sql`${laborAuthorizationsTable.approvedExtraHours} + ${existing.requestedHours}` })
      .where(eq(laborAuthorizationsTable.id, existing.laborAuthorizationId))
      .returning();

    await logLaborAction(
      { tableName: "labor_authorization_requests", recordId: id, action: "UPDATE", oldValues: existing as Record<string, unknown>, newValues: updated[0] as Record<string, unknown>, actor },
      tx
    );
    await logLaborAction(
      { tableName: "labor_authorizations", recordId: existing.laborAuthorizationId, action: "UPDATE", oldValues: beforeAuth as Record<string, unknown>, newValues: afterAuth as Record<string, unknown>, actor },
      tx
    );

    return updated[0]!;
  });

  if (!row) return { error: "Request was already reviewed by a concurrent operation", errorCode: "concurrent_update" as const };
  return { request: row };
}

export async function denyExtraHoursRequest(
  id: number,
  reviewedBy: number,
  reviewNote: string | undefined,
  actor: AuditActor
): Promise<ReviewResult> {
  const existing = await getLaborAuthorizationRequest(id);
  if (!existing) return { error: "Request not found", errorCode: "not_found" as const };
  if (existing.status !== "pending") return { error: "Request is not in pending status", errorCode: "invalid_status" as const };

  const row = await db.transaction(async (tx) => {
    const denied = await tx
      .update(laborAuthorizationRequestsTable)
      .set({ status: "denied", reviewedBy, reviewedAt: new Date(), reviewNote: reviewNote ?? null })
      .where(and(eq(laborAuthorizationRequestsTable.id, id), eq(laborAuthorizationRequestsTable.status, "pending")))
      .returning();

    if (denied.length === 0) return null;

    await logLaborAction(
      { tableName: "labor_authorization_requests", recordId: id, action: "UPDATE", oldValues: existing as Record<string, unknown>, newValues: denied[0] as Record<string, unknown>, actor },
      tx
    );
    return denied[0]!;
  });

  if (!row) return { error: "Request was already reviewed by a concurrent operation", errorCode: "concurrent_update" as const };
  return { request: row };
}
