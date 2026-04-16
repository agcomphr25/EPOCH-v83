import { db, laborAuthorizationsTable, laborChargeCodesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import type { LaborAuthorization, InsertLaborAuthorization } from "@workspace/db";
import { logLaborAction } from "./labor-audit.service";
import type { AuditActor } from "./audit.service";

export interface ResolvedChargeCode {
  chargeCodeId: number;
  source: "traveler" | "work_order" | "project" | "manual";
}

export interface BudgetCheckResult {
  allowed: boolean;
  remainingHours: number;
  laborAuthorizationId?: number;
}

interface TableDefaultRow {
  default_charge_code_id: number | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchDefaultChargeCodeId(
  table: "travelers" | "production_work_orders" | "projects",
  idColumn: "id",
  idValue: string
): Promise<number | null> {
  // Guard against DB cast errors: these tables use UUID primary keys.
  if (!UUID_RE.test(idValue)) return null;
  const result = await db.execute<TableDefaultRow>(
    sql`SELECT default_charge_code_id FROM ${sql.raw(table)} WHERE ${sql.raw(idColumn)} = ${idValue} LIMIT 1`
  );
  const rows: TableDefaultRow[] = Array.isArray(result) ? result : ((result as unknown as { rows: TableDefaultRow[] }).rows ?? []);
  return rows[0]?.default_charge_code_id ?? null;
}

async function isChargeCodeActive(id: number): Promise<boolean> {
  const [code] = await db
    .select()
    .from(laborChargeCodesTable)
    .where(eq(laborChargeCodesTable.id, id));
  return !!(code && code.active);
}

// Cascade uses caller-provided context IDs only (no relational derivation from traveler linkage).
// Precedence: traveler default → work order default → project default → manual selection.
// Callers supply whichever IDs are relevant; resolver picks the most-specific one with an active default.
export async function resolveChargeCodeForSession(params: {
  travelerId?: string | null;
  workOrderId?: string | null;
  projectId?: string | null;
  manualChargeCodeId?: number | null;
}): Promise<ResolvedChargeCode | null> {
  const candidates: Array<{ getId: () => Promise<number | null>; source: ResolvedChargeCode["source"] }> = [];

  if (params.travelerId) {
    candidates.push({ getId: () => fetchDefaultChargeCodeId("travelers", "id", params.travelerId!), source: "traveler" });
  }
  if (params.workOrderId) {
    candidates.push({ getId: () => fetchDefaultChargeCodeId("production_work_orders", "id", params.workOrderId!), source: "work_order" });
  }
  if (params.projectId) {
    candidates.push({ getId: () => fetchDefaultChargeCodeId("projects", "id", params.projectId!), source: "project" });
  }
  if (params.manualChargeCodeId != null) {
    candidates.push({ getId: async () => params.manualChargeCodeId!, source: "manual" });
  }

  for (const candidate of candidates) {
    const id = await candidate.getId();
    if (id != null && (await isChargeCodeActive(id))) {
      return { chargeCodeId: id, source: candidate.source };
    }
  }

  return null;
}

export async function checkBudget(laborAuthorizationId: number): Promise<BudgetCheckResult> {
  const [auth] = await db
    .select()
    .from(laborAuthorizationsTable)
    .where(eq(laborAuthorizationsTable.id, laborAuthorizationId));

  if (!auth) return { allowed: false, remainingHours: 0 };

  const remaining = auth.authorizedHours + auth.approvedExtraHours - auth.consumedHours;
  return { allowed: remaining > 0, remainingHours: remaining, laborAuthorizationId: auth.id };
}

export async function listLaborAuthorizations(filters?: {
  projectId?: string;
  workOrderId?: string;
  travelerId?: string;
  status?: string;
}): Promise<LaborAuthorization[]> {
  const conditions = [
    filters?.projectId ? eq(laborAuthorizationsTable.projectId, filters.projectId) : undefined,
    filters?.workOrderId ? eq(laborAuthorizationsTable.workOrderId, filters.workOrderId) : undefined,
    filters?.travelerId ? eq(laborAuthorizationsTable.travelerId, filters.travelerId) : undefined,
    filters?.status ? eq(laborAuthorizationsTable.status, filters.status) : undefined,
  ].filter(Boolean) as Parameters<typeof and>;

  return conditions.length > 0
    ? db.select().from(laborAuthorizationsTable).where(and(...conditions))
    : db.select().from(laborAuthorizationsTable);
}

export async function getLaborAuthorization(id: number): Promise<LaborAuthorization | null> {
  const [row] = await db
    .select()
    .from(laborAuthorizationsTable)
    .where(eq(laborAuthorizationsTable.id, id));
  return row ?? null;
}

export async function createLaborAuthorization(
  data: InsertLaborAuthorization,
  actor: AuditActor
): Promise<LaborAuthorization> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(laborAuthorizationsTable).values(data).returning();
    await logLaborAction(
      { tableName: "labor_authorizations", recordId: row!.id, action: "INSERT", newValues: row as Record<string, unknown>, actor },
      tx
    );
    return row!;
  });
}

export async function updateLaborAuthorization(
  id: number,
  data: Partial<InsertLaborAuthorization>,
  actor: AuditActor
): Promise<LaborAuthorization | null> {
  const existing = await getLaborAuthorization(id);
  if (!existing) return null;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(laborAuthorizationsTable)
      .set(data)
      .where(eq(laborAuthorizationsTable.id, id))
      .returning();
    await logLaborAction(
      { tableName: "labor_authorizations", recordId: id, action: "UPDATE", oldValues: existing as Record<string, unknown>, newValues: row as Record<string, unknown>, actor },
      tx
    );
    return row!;
  });
}

export async function deleteLaborAuthorization(id: number, actor: AuditActor): Promise<boolean> {
  const existing = await getLaborAuthorization(id);
  if (!existing) return false;

  await db.transaction(async (tx) => {
    await tx.delete(laborAuthorizationsTable).where(eq(laborAuthorizationsTable.id, id));
    await logLaborAction(
      { tableName: "labor_authorizations", recordId: id, action: "DELETE", oldValues: existing as Record<string, unknown>, actor },
      tx
    );
  });

  return true;
}

export async function incrementConsumedHours(
  id: number,
  hours: number,
  actor: AuditActor
): Promise<LaborAuthorization | null> {
  const existing = await getLaborAuthorization(id);
  if (!existing) return null;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(laborAuthorizationsTable)
      .set({ consumedHours: sql`${laborAuthorizationsTable.consumedHours} + ${hours}` })
      .where(eq(laborAuthorizationsTable.id, id))
      .returning();
    await logLaborAction(
      { tableName: "labor_authorizations", recordId: id, action: "UPDATE", oldValues: existing as Record<string, unknown>, newValues: row as Record<string, unknown>, actor },
      tx
    );
    return row!;
  });
}
