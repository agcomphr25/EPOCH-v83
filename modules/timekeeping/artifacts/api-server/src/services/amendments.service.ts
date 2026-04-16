import { db, amendmentsTable, timesheetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Amendment } from "@workspace/db";
import { logAction, type AuditActor } from "./audit.service";

export type { Amendment };

const AMENDABLE_FIELDS = ["totalHours", "regularHours", "overtimeHours", "periodStart", "periodEnd"] as const;
type AmendableField = typeof AMENDABLE_FIELDS[number];

function isAmendableField(f: string): f is AmendableField {
  return (AMENDABLE_FIELDS as readonly string[]).includes(f);
}

function validateNewValue(field: AmendableField, value: string): string | null {
  if (["totalHours", "regularHours", "overtimeHours"].includes(field)) {
    const n = parseFloat(value);
    if (isNaN(n) || n < 0) return `Invalid numeric value for ${field}`;
  }
  if (["periodStart", "periodEnd"].includes(field)) {
    const d = new Date(value);
    if (isNaN(d.getTime())) return `Invalid date value for ${field}`;
  }
  return null;
}

export async function listAmendments(timesheetId: number): Promise<Amendment[]> {
  return db
    .select()
    .from(amendmentsTable)
    .where(eq(amendmentsTable.timesheetId, timesheetId))
    .orderBy(amendmentsTable.createdAt);
}

export async function getAmendment(id: number): Promise<Amendment | null> {
  const [row] = await db
    .select()
    .from(amendmentsTable)
    .where(eq(amendmentsTable.id, id));
  return row ?? null;
}

export async function createAmendment(
  data: {
    timesheetId: number;
    justification: string;
    fieldChanged: string;
    newValue?: string | null;
  },
  actor: AuditActor
): Promise<Amendment | { error: string; statusCode: number }> {
  const [ts] = await db
    .select()
    .from(timesheetsTable)
    .where(eq(timesheetsTable.id, data.timesheetId));

  if (!ts) return { error: "Timesheet not found", statusCode: 404 };
  if (ts.status !== "approved") {
    return { error: "Only approved timesheets can be amended", statusCode: 409 };
  }

  if (!isAmendableField(data.fieldChanged)) {
    return { error: `Invalid field: ${data.fieldChanged}. Must be one of: ${AMENDABLE_FIELDS.join(", ")}`, statusCode: 400 };
  }

  if (data.newValue == null || data.newValue === "") {
    return { error: "newValue is required for amendments", statusCode: 400 };
  }

  const valErr = validateNewValue(data.fieldChanged, data.newValue);
  if (valErr) return { error: valErr, statusCode: 400 };

  const serverOldValue = String((ts as Record<string, unknown>)[data.fieldChanged] ?? "");

  if (serverOldValue === data.newValue) {
    return { error: "New value is the same as the current value", statusCode: 400 };
  }

  const [row] = await db
    .insert(amendmentsTable)
    .values({
      timesheetId: data.timesheetId,
      justification: data.justification,
      fieldChanged: data.fieldChanged,
      oldValue: serverOldValue,
      newValue: data.newValue,
      status: "pending",
      createdBy: actor.id,
      createdByEmail: actor.email,
    })
    .returning();

  await logAction({
    tableName: "amendments",
    recordId: row!.id,
    action: "INSERT",
    newValues: row as Record<string, unknown>,
    actor,
  });

  return row!;
}

export async function approveAmendment(
  id: number,
  actor: AuditActor
): Promise<Amendment | { error: string; statusCode: number }> {
  const existing = await getAmendment(id);
  if (!existing) return { error: "Amendment not found", statusCode: 404 };
  if (existing.status !== "pending") {
    return { error: `Only pending amendments can be approved (current: ${existing.status})`, statusCode: 409 };
  }

  if (!actor.id) return { error: "Approver identity required", statusCode: 401 };
  if (existing.createdBy === actor.id) {
    return { error: "The creator of an amendment cannot approve it", statusCode: 403 };
  }

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .update(amendmentsTable)
      .set({
        status: "approved",
        approvedBy: actor.id,
        approvedByEmail: actor.email,
        approvedAt: new Date(),
      })
      .where(eq(amendmentsTable.id, id))
      .returning();

    await logAction({
      tableName: "amendments",
      recordId: id,
      action: "UPDATE",
      oldValues: { status: existing.status },
      newValues: { status: "approved", approvedBy: actor.id, approvedByEmail: actor.email },
      actor,
    });

    if (row && existing.fieldChanged && existing.newValue != null) {
      await applyAmendmentToTimesheet(tx, existing.timesheetId, existing.fieldChanged, existing.newValue, actor);
    }

    return row!;
  });
}

export async function rejectAmendment(
  id: number,
  actor: AuditActor
): Promise<Amendment | { error: string; statusCode: number }> {
  const existing = await getAmendment(id);
  if (!existing) return { error: "Amendment not found", statusCode: 404 };
  if (existing.status !== "pending") {
    return { error: `Only pending amendments can be rejected (current: ${existing.status})`, statusCode: 409 };
  }

  const [row] = await db
    .update(amendmentsTable)
    .set({ status: "rejected" })
    .where(eq(amendmentsTable.id, id))
    .returning();

  await logAction({
    tableName: "amendments",
    recordId: id,
    action: "UPDATE",
    oldValues: { status: existing.status },
    newValues: { status: "rejected" },
    actor,
  });

  return row!;
}

async function applyAmendmentToTimesheet(
  txOrDb: typeof db,
  timesheetId: number,
  fieldChanged: string,
  newValue: string,
  actor: AuditActor
): Promise<void> {
  if (!isAmendableField(fieldChanged)) return;

  const [ts] = await txOrDb
    .select()
    .from(timesheetsTable)
    .where(eq(timesheetsTable.id, timesheetId));
  if (!ts) return;

  const update: Record<string, unknown> = {};
  if (["totalHours", "regularHours", "overtimeHours"].includes(fieldChanged)) {
    update[fieldChanged] = parseFloat(newValue);
  } else {
    update[fieldChanged] = newValue;
  }

  await txOrDb
    .update(timesheetsTable)
    .set(update)
    .where(eq(timesheetsTable.id, timesheetId));

  await logAction({
    tableName: "timesheets",
    recordId: timesheetId,
    action: "UPDATE",
    oldValues: { [fieldChanged]: (ts as Record<string, unknown>)[fieldChanged] },
    newValues: update,
    actor,
  });
}
