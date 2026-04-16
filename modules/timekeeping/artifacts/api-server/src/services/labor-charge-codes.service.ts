import { db, laborChargeCodesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { LaborChargeCode, InsertLaborChargeCode } from "@workspace/db";
import { logLaborAction } from "./labor-audit.service";
import type { AuditActor } from "./audit.service";

export async function listLaborChargeCodes(activeOnly?: boolean): Promise<LaborChargeCode[]> {
  if (activeOnly) {
    return db
      .select()
      .from(laborChargeCodesTable)
      .where(eq(laborChargeCodesTable.active, true))
      .orderBy(laborChargeCodesTable.code);
  }
  return db.select().from(laborChargeCodesTable).orderBy(laborChargeCodesTable.code);
}

export async function getLaborChargeCode(id: number): Promise<LaborChargeCode | null> {
  const [row] = await db
    .select()
    .from(laborChargeCodesTable)
    .where(eq(laborChargeCodesTable.id, id));
  return row ?? null;
}

export async function createLaborChargeCode(
  data: InsertLaborChargeCode,
  actor: AuditActor
): Promise<LaborChargeCode> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(laborChargeCodesTable).values(data).returning();
    await logLaborAction(
      { tableName: "labor_charge_codes", recordId: row!.id, action: "INSERT", newValues: row as Record<string, unknown>, actor },
      tx
    );
    return row!;
  });
}

export async function updateLaborChargeCode(
  id: number,
  data: Partial<InsertLaborChargeCode>,
  actor: AuditActor
): Promise<LaborChargeCode | null> {
  const existing = await getLaborChargeCode(id);
  if (!existing) return null;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(laborChargeCodesTable)
      .set(data)
      .where(eq(laborChargeCodesTable.id, id))
      .returning();
    await logLaborAction(
      { tableName: "labor_charge_codes", recordId: id, action: "UPDATE", oldValues: existing as Record<string, unknown>, newValues: row as Record<string, unknown>, actor },
      tx
    );
    return row!;
  });
}

export async function deleteLaborChargeCode(id: number, actor: AuditActor): Promise<boolean> {
  const existing = await getLaborChargeCode(id);
  if (!existing) return false;

  await db.transaction(async (tx) => {
    await tx.delete(laborChargeCodesTable).where(eq(laborChargeCodesTable.id, id));
    await logLaborAction(
      { tableName: "labor_charge_codes", recordId: id, action: "DELETE", oldValues: existing as Record<string, unknown>, actor },
      tx
    );
  });

  return true;
}
