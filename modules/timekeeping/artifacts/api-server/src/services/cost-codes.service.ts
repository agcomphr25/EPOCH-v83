import { db, costCodesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { CostCode, InsertCostCode } from "@workspace/db";
import { logAction, type AuditActor } from "./audit.service";

export async function listCostCodes(activeOnly?: boolean): Promise<CostCode[]> {
  if (activeOnly) {
    return db.select().from(costCodesTable).where(eq(costCodesTable.active, true)).orderBy(costCodesTable.code);
  }
  return db.select().from(costCodesTable).orderBy(costCodesTable.code);
}

export async function getCostCode(id: number): Promise<CostCode | null> {
  const [row] = await db.select().from(costCodesTable).where(eq(costCodesTable.id, id));
  return row ?? null;
}

export async function createCostCode(data: InsertCostCode, actor: AuditActor): Promise<CostCode> {
  const [row] = await db.insert(costCodesTable).values(data).returning();
  await logAction({
    tableName: "cost_codes",
    recordId: row!.id,
    action: "INSERT",
    newValues: row as Record<string, unknown>,
    actor,
  });
  return row!;
}

export async function updateCostCode(
  id: number,
  data: Partial<InsertCostCode>,
  actor: AuditActor
): Promise<CostCode | null> {
  const existing = await getCostCode(id);
  if (!existing) return null;

  const [row] = await db
    .update(costCodesTable)
    .set(data)
    .where(eq(costCodesTable.id, id))
    .returning();

  await logAction({
    tableName: "cost_codes",
    recordId: id,
    action: "UPDATE",
    oldValues: existing as Record<string, unknown>,
    newValues: row as Record<string, unknown>,
    actor,
  });

  return row!;
}

export async function deleteCostCode(id: number, actor: AuditActor): Promise<boolean> {
  const existing = await getCostCode(id);
  if (!existing) return false;

  await db.delete(costCodesTable).where(eq(costCodesTable.id, id));

  await logAction({
    tableName: "cost_codes",
    recordId: id,
    action: "DELETE",
    oldValues: existing as Record<string, unknown>,
    actor,
  });

  return true;
}
