import { db } from "../../../db";
import { punchesTable, laborEntryAuditTable } from "../../schema/timekeeping";
import type { Punch, InsertPunch } from "../../schema/timekeeping";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import {
  resolveByTimekeepingId,
} from "../../lib/timekeepingEmployeeResolver";
import { chargeCodes } from "../../../schema";
import { type Employee } from "./employees.service";
import {
  derivePunchStatus,
  type PunchStatus,
} from "../../lib/timekeeping";
import { logAction, type AuditActor } from "./audit.service";
import { findFinalizedTimesheetForPunch } from "./timesheets.service";
import { resolveTravelerBarcode, type ChargeContext } from "../../helpers/travelerBarcodeResolver";

export type { PunchStatus };

/**
 * Resolves a ChargeContext from a traveler ID (UUID or traveler number).
 * Returns the context on success, or an error string on failure.
 * This is the shared resolver used by all labor entry paths so charge code
 * derivation is consistent regardless of how the punch was initiated.
 */
export async function resolveChargeContextFromTraveler(
  travelerId: string
): Promise<{ ok: true; context: ChargeContext } | { ok: false; error: string }> {
  const result = await resolveTravelerBarcode(travelerId);
  if (!result.ok) {
    return {
      ok: false,
      error: `Could not resolve charge code from traveler: ${result.error.message}`,
    };
  }
  return { ok: true, context: result.context };
}

/**
 * Returns true when `code` exists and is active in the native public.charge_codes registry.
 * Returns false when `code` is null/blank (no validation needed — punches without a
 * charge code are allowed).
 * Returns an error string when the code is present but not in the registry.
 */
async function validateChargeCode(code: string | null | undefined): Promise<{ valid: true } | { valid: false; error: string }> {
  const normalized = normalizeChargeCode(code);
  if (!normalized) return { valid: true };

  const [row] = await db
    .select({ id: chargeCodes.id })
    .from(chargeCodes)
    .where(and(eq(chargeCodes.code, normalized), eq(chargeCodes.active, true)))
    .limit(1);

  if (!row) {
    return {
      valid: false,
      error: `Charge code '${normalized}' is not in the active charge code registry. Add it to the Labor Charge Codes list before recording labor against it.`,
    };
  }
  return { valid: true };
}

/** Trims whitespace and converts blank/empty strings to null for consistent storage. */
function normalizeChargeCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface PunchStatusResult {
  status: PunchStatus;
  lastPunch: Punch | null;
  clockedInAt: Date | null;
  hoursToday: number;
}

export async function getEmployeePunchStatus(
  employeeId: number,
  timezone: string = "UTC"
): Promise<PunchStatusResult> {
  const punches = await db
    .select()
    .from(punchesTable)
    .where(eq(punchesTable.employeeId, employeeId))
    .orderBy(desc(punchesTable.punchedAt))
    .limit(50);

  const result = derivePunchStatus(punches, timezone);
  return {
    status: result.status,
    lastPunch: result.lastPunch as Punch | null,
    clockedInAt: result.clockedInAt,
    hoursToday: result.hoursToday,
  };
}

export async function listPunches(filters?: {
  employeeId?: number;
  type?: string;
  from?: string;
  to?: string;
}): Promise<Punch[]> {
  const conditions = [];
  if (filters?.employeeId != null) {
    conditions.push(eq(punchesTable.employeeId, filters.employeeId));
  }
  if (filters?.type) {
    conditions.push(eq(punchesTable.type, filters.type));
  }
  if (filters?.from) {
    conditions.push(gte(punchesTable.punchedAt, new Date(filters.from)));
  }
  if (filters?.to) {
    const toDate = new Date(filters.to);
    toDate.setDate(toDate.getDate() + 1);
    conditions.push(lte(punchesTable.punchedAt, toDate));
  }

  return db
    .select()
    .from(punchesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(punchesTable.punchedAt);
}

export async function getPunch(id: number): Promise<Punch | null> {
  const [row] = await db
    .select()
    .from(punchesTable)
    .where(eq(punchesTable.id, id));
  return row ?? null;
}

export async function createPunch(
  data: InsertPunch,
  actor: AuditActor,
  options?: { travelerId?: string | null }
): Promise<Punch | { error: string; statusCode: number }> {
  let resolvedCostCode = normalizeChargeCode(data.costCode);

  if (options?.travelerId) {
    const chargeCtx = await resolveChargeContextFromTraveler(options.travelerId);
    if (!chargeCtx.ok) {
      return { error: chargeCtx.error, statusCode: 422 };
    }
    resolvedCostCode = normalizeChargeCode(chargeCtx.context.chargeCode) ?? resolvedCostCode;
  }

  const chargeValidation = await validateChargeCode(resolvedCostCode);
  if (!chargeValidation.valid) {
    return { error: chargeValidation.error, statusCode: 400 };
  }

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(punchesTable).values({ ...data, costCode: resolvedCostCode }).returning();
    // TK-005: audit log entry must succeed within the same transaction or the punch write rolls back
    await logAction({
      tableName: "punches",
      recordId: inserted!.id,
      action: "INSERT",
      newValues: inserted as Record<string, unknown>,
      actor,
    }, tx);
    await tx.insert(laborEntryAuditTable).values({
      tableName: "punches",
      recordId: inserted!.id,
      action: "PUNCH_CREATED",
      newValues: inserted as Record<string, unknown>,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      ipAddress: actor.ip,
    });
    return inserted!;
  });

  return row;
}

export async function updatePunch(
  id: number,
  data: { punchedAt?: string; note?: string; editNote?: string; costCode?: string | null },
  actor: AuditActor
): Promise<Punch | { error: string; statusCode: number }> {
  const existing = await getPunch(id);
  if (!existing) return { error: "Punch not found", statusCode: 404 };

  // TK-004 service-level gate: editNote is mandatory for all edits (defense-in-depth — routes also enforce this)
  const editNote = (data.editNote ?? "").trim();
  if (!editNote) {
    return {
      error: "[DCAA TK-004] An edit reason (editNote) is required when modifying a punch. All punch edits must be documented for DCAA audit trail compliance.",
      statusCode: 400,
    };
  }

  const approvedSheet = await findFinalizedTimesheetForPunch(
    existing.employeeId,
    new Date(existing.punchedAt)
  );
  if (approvedSheet) {
    return {
      error:
        `[DCAA TK-001] This punch falls within ${approvedSheet.status} timesheet #${approvedSheet.id} ` +
        `(${approvedSheet.periodStart}–${approvedSheet.periodEnd}) and cannot be edited directly. ` +
        `Submit a correction request via the Corrections workflow for timesheet #${approvedSheet.id}.`,
      statusCode: 409,
    };
  }

  if (data.costCode !== undefined) {
    const normalizedCode = normalizeChargeCode(data.costCode);
    const chargeValidation = await validateChargeCode(normalizedCode);
    if (!chargeValidation.valid) {
      return { error: chargeValidation.error, statusCode: 400 };
    }
    data = { ...data, costCode: normalizedCode };
  }

  const updateData: Record<string, unknown> = { isEdited: true };
  if (data.punchedAt) updateData.punchedAt = new Date(data.punchedAt);
  if (data.note !== undefined) updateData.note = data.note;
  if (data.editNote !== undefined) updateData.editNote = data.editNote;
  if (data.costCode !== undefined) updateData.costCode = data.costCode;

  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(punchesTable)
      .set(updateData)
      .where(eq(punchesTable.id, id))
      .returning();

    await logAction({
      tableName: "punches",
      recordId: id,
      action: "UPDATE",
      oldValues: existing as Record<string, unknown>,
      newValues: updated as Record<string, unknown>,
      actor,
    }, tx);

    // Write to labor_entry_audit so TK-005 (DCAA forensic rule) can confirm that
    // every punch marked is_edited=true has a corresponding audit trail entry.
    // TK-005 checks: table_name='punches', record_id=punch.id,
    // action IN ('UPDATE','EDIT','PUNCH_EDITED','PUNCH_MODIFIED').
    await tx.insert(laborEntryAuditTable).values({
      tableName: "punches",
      recordId: id,
      action: "PUNCH_EDITED",
      oldValues: existing as Record<string, unknown>,
      newValues: updated as Record<string, unknown>,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      ipAddress: actor.ip,
    });

    return updated!;
  });

  return row;
}

export async function deletePunch(
  id: number,
  actor: AuditActor
): Promise<Punch | { error: string; statusCode: number }> {
  const existing = await getPunch(id);
  if (!existing) return { error: "Punch not found", statusCode: 404 };

  const approvedSheet = await findFinalizedTimesheetForPunch(
    existing.employeeId,
    new Date(existing.punchedAt)
  );
  if (approvedSheet) {
    return {
      error:
        `[DCAA TK-001] This punch falls within ${approvedSheet.status} timesheet #${approvedSheet.id} ` +
        `(${approvedSheet.periodStart}–${approvedSheet.periodEnd}) and cannot be deleted directly. ` +
        `Submit a correction request via the Corrections workflow for timesheet #${approvedSheet.id}.`,
      statusCode: 409,
    };
  }

  const row = await db.transaction(async (tx) => {
    // TK-005: write audit entries first — if either fails the delete rolls back
    await logAction({
      tableName: "punches",
      recordId: id,
      action: "DELETE",
      oldValues: existing as Record<string, unknown>,
      actor,
    }, tx);
    await tx.insert(laborEntryAuditTable).values({
      tableName: "punches",
      recordId: id,
      action: "PUNCH_DELETED",
      oldValues: existing as Record<string, unknown>,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      ipAddress: actor.ip,
    });
    const [deleted] = await tx
      .delete(punchesTable)
      .where(eq(punchesTable.id, id))
      .returning();
    return deleted!;
  });

  return row;
}

