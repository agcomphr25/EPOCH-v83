import { db } from "../../../db";
import { auditEvents, employees as epochEmployees } from "../../../schema";
import { punchCorrectionRequestsTable } from "../../schema/timekeeping";
import { eq, and } from "drizzle-orm";
import { storage } from "../../../storage";
import { dualWriteUpdateAllocation } from "../../lib/laborAllocationDualWrite";
import * as ledger from "../../lib/punchLedger";
import { actorFromUser, logAction } from "./audit.service";
import type { SafeUser } from "./audit.service";

export type PunchCorrectionRequestType = "edit_session" | "add_session" | "delete_session";
export type PunchCorrectionDecision = "approved" | "denied";

export type PunchCorrectionChanges = {
  clockIn?: string | null;
  clockOut?: string | null;
  chargeCodeId?: number | null;
  travelerId?: string | null;
  laborClass?: "REGULAR" | "BREAK";
  note?: string | null;
};

type SubmitPunchCorrectionInput = {
  employeeId: number;
  punchLedgerId?: number | null;
  requestType: PunchCorrectionRequestType;
  source: "employee_portal" | "kiosk";
  reason: string;
  proposedChanges: PunchCorrectionChanges;
  submittedByUserId?: number | null;
  actorUser?: SafeUser | null;
  actorIp?: string | null;
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function snapshotPunch(row: any | null): Record<string, unknown> | null {
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employeeId,
    clockIn: toIso(row.clockIn),
    clockOut: toIso(row.clockOut),
    source: row.source,
    travelerId: row.travelerId ?? null,
    productionWorkOrderId: row.productionWorkOrderId ?? null,
    chargeCodeId: row.chargeCodeId ?? null,
    chargeCode: row.chargeCode ?? null,
    department: row.department ?? null,
    operation: row.operation ?? null,
    laborClass: row.laborClass ?? null,
    approvalStatus: row.approvalStatus ?? null,
    isEdited: row.isEdited ?? false,
    editNote: row.editNote ?? null,
  };
}

async function resolveSupervisor(employeeId: number): Promise<{ supervisorId: number | null; status: string }> {
  const [emp] = await db
    .select({ supervisorEmployeeId: epochEmployees.supervisorEmployeeId })
    .from(epochEmployees)
    .where(eq(epochEmployees.id, employeeId))
    .limit(1);

  const supervisorId = emp?.supervisorEmployeeId ?? null;
  return {
    supervisorId,
    status: supervisorId ? "pending_supervisor" : "pending_hr",
  };
}

export async function submitPunchCorrectionRequest(input: SubmitPunchCorrectionInput) {
  if (!input.reason || input.reason.trim().length < 5) {
    return { error: "A correction reason of at least 5 characters is required.", statusCode: 400 };
  }

  let existing: any | null = null;
  if (input.requestType !== "add_session") {
    if (!input.punchLedgerId) {
      return { error: "punchLedgerId is required for edit and delete requests.", statusCode: 400 };
    }
    existing = await storage.getPunchLedgerEntryById(input.punchLedgerId);
    if (!existing) return { error: "Punch/session not found.", statusCode: 404 };
    if (existing.employeeId !== input.employeeId) {
      return { error: "You can only request corrections for your own punches.", statusCode: 403 };
    }
  }

  const targetDate = new Date(
    input.proposedChanges.clockIn ||
      existing?.clockIn ||
      input.proposedChanges.clockOut ||
      new Date()
  );
  if (Number.isNaN(targetDate.getTime())) {
    return { error: "A valid target punch date/time is required.", statusCode: 400 };
  }

  const proposedClockIn = input.proposedChanges.clockIn
    ? new Date(input.proposedChanges.clockIn)
    : existing?.clockIn
      ? new Date(existing.clockIn)
      : null;
  const proposedClockOut = input.proposedChanges.clockOut
    ? new Date(input.proposedChanges.clockOut)
    : existing?.clockOut
      ? new Date(existing.clockOut)
      : null;
  if (proposedClockIn && Number.isNaN(proposedClockIn.getTime())) {
    return { error: "clockIn must be a valid date/time.", statusCode: 400 };
  }
  if (proposedClockOut && Number.isNaN(proposedClockOut.getTime())) {
    return { error: "clockOut must be a valid date/time.", statusCode: 400 };
  }
  if (proposedClockIn && proposedClockOut && proposedClockOut <= proposedClockIn) {
    return { error: "Clock-out must be after clock-in.", statusCode: 422 };
  }

  // Employees may request corrections for locked/submitted/approved periods; the
  // supervisor and HR/Admin approval path is the control that decides whether
  // the change is allowed and applied.

  const { supervisorId, status } = await resolveSupervisor(input.employeeId);
  const [row] = await db
    .insert(punchCorrectionRequestsTable)
    .values({
      employeeId: input.employeeId,
      punchLedgerId: input.punchLedgerId ?? null,
      requestType: input.requestType,
      source: input.source,
      status,
      reason: input.reason.trim(),
      originalSnapshot: snapshotPunch(existing),
      proposedChanges: input.proposedChanges as Record<string, unknown>,
      supervisorId: supervisorId ?? undefined,
      submittedByUserId: input.submittedByUserId ?? null,
    })
    .returning();

  await logAction({
    tableName: "punch_correction_requests",
    recordId: row!.id,
    action: "INSERT",
    oldValues: null,
    newValues: {
      status,
      employeeId: input.employeeId,
      punchLedgerId: input.punchLedgerId ?? null,
      requestType: input.requestType,
      source: input.source,
      proposedChanges: input.proposedChanges,
    },
    actor: actorFromUser(input.actorUser ?? null, input.actorIp ?? null),
  });

  if (status === "pending_supervisor") {
    const { notifyPunchCorrectionApprovalNeeded } = await import("./approvalNotifications.service");
    void notifyPunchCorrectionApprovalNeeded(row!.id);
  } else {
    const { notifyPunchCorrectionHrAdminNeeded } = await import("./approvalNotifications.service");
    void notifyPunchCorrectionHrAdminNeeded(row!.id, "Employee has no supervisor assigned; routed directly to HR/Admin.");
  }

  return row!;
}

export async function reviewPunchCorrectionSupervisor(
  id: number,
  decision: PunchCorrectionDecision,
  note: string,
  reviewerUser: SafeUser,
  actorIp: string | null,
) {
  if (!note || note.trim().length < 3) {
    return { error: "A supervisor review note is required.", statusCode: 400 };
  }

  const [existing] = await db.select().from(punchCorrectionRequestsTable).where(eq(punchCorrectionRequestsTable.id, id)).limit(1);
  if (!existing) return { error: "Correction request not found.", statusCode: 404 };
  if (existing.status !== "pending_supervisor") {
    return { error: `Request is not pending supervisor approval (current: ${existing.status}).`, statusCode: 409 };
  }
  if (reviewerUser.role !== "ADMIN" && reviewerUser.role !== "OWNER" && existing.supervisorId && reviewerUser.employeeId !== existing.supervisorId) {
    return { error: "You are not the assigned supervisor for this correction request.", statusCode: 403 };
  }

  const now = new Date();
  const nextStatus = decision === "approved" ? "pending_hr" : "rejected";
  const [updated] = await db
    .update(punchCorrectionRequestsTable)
    .set({
      supervisorDecision: decision,
      supervisorNote: note.trim(),
      supervisorReviewedAt: now,
      supervisorReviewedBy: reviewerUser.id,
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(punchCorrectionRequestsTable.id, id))
    .returning();

  await logAction({
    tableName: "punch_correction_requests",
    recordId: id,
    action: "UPDATE",
    oldValues: { status: existing.status },
    newValues: { status: nextStatus, supervisorDecision: decision, supervisorNote: note.trim() },
    actor: actorFromUser(reviewerUser, actorIp),
  });

  const { notifyPunchCorrectionEmployeeStatus, notifyPunchCorrectionHrAdminNeeded } = await import("./approvalNotifications.service");
  if (decision === "approved") {
    void notifyPunchCorrectionEmployeeStatus(id, `Time punch correction #${id} approved by supervisor`, "Your punch correction was approved by your supervisor and is now waiting for HR/Admin approval.");
    void notifyPunchCorrectionHrAdminNeeded(id, "Supervisor approved; HR/Admin approval is now required before any punch changes are applied.");
  } else {
    void notifyPunchCorrectionEmployeeStatus(id, `Time punch correction #${id} denied by supervisor`, `Your punch correction was denied by your supervisor.\nReason: ${note.trim()}`);
  }

  return updated!;
}

async function applyPunchCorrection(existing: any, actorUser: SafeUser, note: string) {
  const changes = existing.proposedChanges as PunchCorrectionChanges;
  const actorId = actorUser.employeeId ?? null;
  const actorName = actorUser.username ?? actorUser.email ?? null;
  const editNote = `Correction #${existing.id} approved by HR/Admin: ${note.trim()}`;

  if (existing.requestType === "delete_session") {
    if (!existing.punchLedgerId) throw new Error("punchLedgerId is required for delete_session");
    const before = await storage.getPunchLedgerEntryById(existing.punchLedgerId);
    await storage.deletePunchLedgerEntry(existing.punchLedgerId);
    return { before: snapshotPunch(before), after: null };
  }

  if (existing.requestType === "add_session") {
    if (!changes.clockIn) throw new Error("clockIn is required to add a missing session");
    const clockIn = new Date(changes.clockIn);
    const opened = await ledger.openSession({
      employeeId: existing.employeeId,
      source: "PORTAL",
      laborClass: changes.laborClass ?? "REGULAR",
      clockIn,
      chargeCodeId: changes.chargeCodeId ?? null,
      travelerId: changes.travelerId ?? null,
      createdBy: actorId,
      createdByDisplayName: actorName,
    });
    let final = opened;
    if (changes.clockOut) {
      const updated = await storage.updatePunchLedgerEntry(opened.id, {
        clockOut: new Date(changes.clockOut),
        isEdited: true,
        editNote,
        updatedBy: actorId,
        updatedByDisplayName: actorName,
      });
      final = updated ?? opened;
    }
    return { before: null, after: snapshotPunch(final) };
  }

  if (!existing.punchLedgerId) throw new Error("punchLedgerId is required for edit_session");
  const before = await storage.getPunchLedgerEntryById(existing.punchLedgerId);
  if (!before) throw new Error("Punch/session not found.");

  const patch: Parameters<typeof storage.updatePunchLedgerEntry>[1] = {
    ...(changes.clockIn ? { clockIn: new Date(changes.clockIn) } : {}),
    ...(changes.clockOut !== undefined ? { clockOut: changes.clockOut ? new Date(changes.clockOut) : null } : {}),
    ...(changes.chargeCodeId !== undefined ? { chargeCodeId: changes.chargeCodeId } : {}),
    ...(changes.travelerId !== undefined ? { travelerId: changes.travelerId } : {}),
    ...(changes.laborClass !== undefined ? { laborClass: changes.laborClass } : {}),
    isEdited: true,
    editNote,
    updatedBy: actorId,
    updatedByDisplayName: actorName,
  };

  const updated = await storage.updatePunchLedgerEntry(existing.punchLedgerId, patch);
  if (updated) {
    await dualWriteUpdateAllocation(updated).catch((err) => {
      console.warn("[punch correction] labor allocation sync failed:", err);
    });
  }
  return { before: snapshotPunch(before), after: snapshotPunch(updated) };
}

export async function reviewPunchCorrectionHr(
  id: number,
  decision: PunchCorrectionDecision,
  note: string,
  reviewerUser: SafeUser,
  actorIp: string | null,
) {
  if (!note || note.trim().length < 3) {
    return { error: "An HR/Admin review note is required.", statusCode: 400 };
  }
  if (!["ADMIN", "OWNER", "HR"].includes(reviewerUser.role)) {
    return { error: "Only HR/Admin can perform final punch correction approval.", statusCode: 403 };
  }

  const [existing] = await db.select().from(punchCorrectionRequestsTable).where(eq(punchCorrectionRequestsTable.id, id)).limit(1);
  if (!existing) return { error: "Correction request not found.", statusCode: 404 };
  if (existing.status !== "pending_hr") {
    return { error: `Request is not pending HR/Admin approval (current: ${existing.status}).`, statusCode: 409 };
  }

  const now = new Date();
  let applyResult: { before: Record<string, unknown> | null; after: Record<string, unknown> | null } | null = null;
  if (decision === "approved") {
    applyResult = await applyPunchCorrection(existing, reviewerUser, note);
  }

  const nextStatus = decision === "approved" ? "approved" : "rejected";
  const [updated] = await db
    .update(punchCorrectionRequestsTable)
    .set({
      hrDecision: decision,
      hrNote: note.trim(),
      hrReviewedAt: now,
      hrReviewedBy: reviewerUser.id,
      status: nextStatus,
      appliedAt: decision === "approved" ? now : null,
      appliedBy: decision === "approved" ? reviewerUser.id : null,
      afterSnapshot: applyResult?.after ?? null,
      updatedAt: now,
    })
    .where(eq(punchCorrectionRequestsTable.id, id))
    .returning();

  await db.insert(auditEvents).values({
    entityType: "time_punch_correction",
    entityId: String(id),
    action: decision === "approved" ? "PUNCH_CORRECTION_APPLIED" : "PUNCH_CORRECTION_REJECTED",
    actorId: reviewerUser.id,
    actorName: reviewerUser.username ?? reviewerUser.email ?? null,
    actorRole: reviewerUser.role,
    reason: note.trim(),
    fieldsChanged: applyResult,
    meta: {
      requestType: existing.requestType,
      employeeId: existing.employeeId,
      punchLedgerId: existing.punchLedgerId,
      proposedChanges: existing.proposedChanges,
    },
    ipAddress: actorIp,
  });

  await logAction({
    tableName: "punch_correction_requests",
    recordId: id,
    action: "UPDATE",
    oldValues: { status: existing.status, originalSnapshot: existing.originalSnapshot },
    newValues: { status: nextStatus, hrDecision: decision, hrNote: note.trim(), afterSnapshot: applyResult?.after ?? null },
    actor: actorFromUser(reviewerUser, actorIp),
  });

  const { notifyPunchCorrectionEmployeeStatus } = await import("./approvalNotifications.service");
  if (decision === "approved") {
    void notifyPunchCorrectionEmployeeStatus(id, `Time punch correction #${id} approved`, "Your punch correction received HR/Admin approval and has been applied.");
  } else {
    void notifyPunchCorrectionEmployeeStatus(id, `Time punch correction #${id} denied by HR/Admin`, `Your punch correction was denied by HR/Admin.\nReason: ${note.trim()}`);
  }

  return updated!;
}

export async function listPunchCorrections(filters?: { employeeId?: number; status?: string; supervisorId?: number }) {
  const conditions = [];
  if (filters?.employeeId != null) conditions.push(eq(punchCorrectionRequestsTable.employeeId, filters.employeeId));
  if (filters?.status) conditions.push(eq(punchCorrectionRequestsTable.status, filters.status));
  if (filters?.supervisorId != null) conditions.push(eq(punchCorrectionRequestsTable.supervisorId, filters.supervisorId));

  return db
    .select()
    .from(punchCorrectionRequestsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(punchCorrectionRequestsTable.createdAt);
}

export async function getPunchCorrection(id: number) {
  const [row] = await db.select().from(punchCorrectionRequestsTable).where(eq(punchCorrectionRequestsTable.id, id)).limit(1);
  return row ?? null;
}
