import { db } from "../../../db";
import { timesheetCorrectionsTable, timesheetsTable, punchesTable } from "../../schema/timekeeping";
import { eq, and, inArray, isNull, lte, gte, or } from "drizzle-orm";
import type { TimesheetCorrection } from "../../schema/timekeeping";
import { logAction, type AuditActor } from "./audit.service";
import { getTimesheet } from "./timesheets.service";
import { getOrCreatePolicySettings } from "./policySettings.service";
import { punchLedger } from "../../../schema";
import { resolveByTimekeepingId } from "../../lib/timekeepingEmployeeResolver";
import { assertTransition, InvalidTransitionError } from "./timesheetStateMachine";

export type { TimesheetCorrection };

export interface PunchEdit {
  punchId: number;
  field: "costCode" | "note";
  oldValue?: string | null;
  newValue?: string | null;
}

export interface StructuredProposedChanges {
  description: string;
  mode?: "reopen" | "apply-edits";
  punchEdits?: PunchEdit[];
}

type DbOrTx = {
  select: typeof db.select;
};

async function capturePunchSnapshot(
  executor: DbOrTx,
  timesheetId: number,
  employeeId: number,
  periodStart: string,
  periodEnd: string
): Promise<Record<string, unknown>> {
  const periodStartDate = new Date(`${periodStart}T00:00:00Z`);
  const periodEndDate = new Date(`${periodEnd}T23:59:59Z`);

  const legacyPunches = await executor
    .select()
    .from(punchesTable)
    .where(
      and(
        eq(punchesTable.employeeId, employeeId),
        gte(punchesTable.punchedAt, periodStartDate),
        lte(punchesTable.punchedAt, periodEndDate)
      )
    );

  return {
    capturedAt: new Date().toISOString(),
    timesheetId,
    employeeId,
    periodStart,
    periodEnd,
    legacyPunches: legacyPunches.map(p => ({
      id: p.id,
      type: p.type,
      punchedAt: p.punchedAt,
      costCode: p.costCode ?? null,
      note: p.note ?? null,
    })),
  };
}

async function captureFullSnapshot(
  timesheetId: number,
  employeeId: number,
  periodStart: string,
  periodEnd: string
): Promise<Record<string, unknown>> {
  const periodStartDate = new Date(`${periodStart}T00:00:00Z`);
  const periodEndDate = new Date(`${periodEnd}T23:59:59Z`);

  const legacyPunches = await db
    .select()
    .from(punchesTable)
    .where(
      and(
        eq(punchesTable.employeeId, employeeId),
        gte(punchesTable.punchedAt, periodStartDate),
        lte(punchesTable.punchedAt, periodEndDate)
      )
    );

  let ledgerSessions: unknown[] = [];
  const resolved = await resolveByTimekeepingId(employeeId);
  if (resolved != null) {
    ledgerSessions = await db
      .select()
      .from(punchLedger)
      .where(
        and(
          eq(punchLedger.employeeId, resolved.epochEmployeeId),
          lte(punchLedger.clockIn, periodEndDate),
          or(
            gte(punchLedger.clockOut, periodStartDate),
            isNull(punchLedger.clockOut)
          )
        )
      );
  }

  return {
    capturedAt: new Date().toISOString(),
    timesheetId,
    employeeId,
    periodStart,
    periodEnd,
    legacyPunches: legacyPunches.map(p => ({
      id: p.id,
      type: p.type,
      punchedAt: p.punchedAt,
      costCode: p.costCode ?? null,
      note: p.note ?? null,
    })),
    ledgerSessions,
  };
}

export async function requestCorrection(
  timesheetId: number,
  data: { reason: string; proposedChanges: StructuredProposedChanges },
  actor: AuditActor,
  requestedByEmployeeId: number
): Promise<TimesheetCorrection & { autoApplied?: boolean } | { error: string; statusCode: number }> {
  const ts = await getTimesheet(timesheetId);
  if (!ts) return { error: "Timesheet not found", statusCode: 404 };

  try {
    assertTransition(ts.status, "correction_requested", actor.role);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return {
        error: "Corrections can only be requested on locked timesheets. This timesheet can still be edited directly or must be locked first.",
        statusCode: err.statusCode,
      };
    }
    throw err;
  }

  if (!data.reason || data.reason.trim().length < 5) {
    return { error: "A reason of at least 5 characters is required.", statusCode: 400 };
  }

  const policy = await getOrCreatePolicySettings();
  const originalSnapshot = await captureFullSnapshot(
    timesheetId,
    ts.employeeId,
    ts.periodStart,
    ts.periodEnd
  );

  const proposedChanges: StructuredProposedChanges = {
    mode: data.proposedChanges.mode ?? "reopen",
    description: data.proposedChanges.description ?? data.reason.trim(),
    punchEdits: data.proposedChanges.punchEdits ?? [],
  };

  // ---------------------------------------------------------------------------
  // BYPASS PATH — when correctionApprovalRequired is false, apply the correction
  // immediately without the multi-step approval workflow. The correction record
  // is still created for audit trail purposes but starts and ends in "approved".
  // ---------------------------------------------------------------------------
  if (!policy.correctionApprovalRequired) {
    const correctionMode = proposedChanges.mode ?? "reopen";
    const finalStatus: "draft" | "certified" = correctionMode === "apply-edits" ? "certified" : "draft";
    const punchEdits: PunchEdit[] = Array.isArray(proposedChanges.punchEdits)
      ? (proposedChanges.punchEdits as PunchEdit[])
      : [];
    const periodStartDate = new Date(`${ts.periodStart}T00:00:00Z`);
    const periodEndDate = new Date(`${ts.periodEnd}T23:59:59Z`);
    const now = new Date();

    return await db.transaction(async (tx) => {
      for (const edit of punchEdits) {
        if (!edit.punchId || !edit.field) continue;
        const punchGuard = and(
          eq(punchesTable.id, edit.punchId),
          eq(punchesTable.employeeId, ts.employeeId),
          gte(punchesTable.punchedAt, periodStartDate),
          lte(punchesTable.punchedAt, periodEndDate)
        );
        if (edit.field === "costCode") {
          await tx
            .update(punchesTable)
            .set({ costCode: edit.newValue, isEdited: true, editNote: `Auto-applied correction (approval not required): ${data.reason.trim()}` })
            .where(punchGuard);
        } else if (edit.field === "note") {
          await tx
            .update(punchesTable)
            .set({ note: edit.newValue, isEdited: true, editNote: `Auto-applied correction (approval not required): ${data.reason.trim()}` })
            .where(punchGuard);
        }
      }

      const [correction] = await tx
        .insert(timesheetCorrectionsTable)
        .values({
          timesheetId,
          requestedByEmployeeId,
          reason: data.reason.trim(),
          originalSnapshot,
          proposedChanges: proposedChanges as unknown as Record<string, unknown>,
        })
        .returning();

      const finalFields =
        finalStatus === "draft"
          ? {
              status: "draft" as const,
              certificationStatement: null,
              certifiedByUserId: null,
              certificationVersion: null,
              employeeAttested: false,
              attestedAt: null,
            }
          : { status: "certified" as const };

      await tx
        .update(timesheetsTable)
        .set(finalFields)
        .where(eq(timesheetsTable.id, timesheetId));

      const afterLegacyPunches = await tx
        .select()
        .from(punchesTable)
        .where(
          and(
            eq(punchesTable.employeeId, ts.employeeId),
            gte(punchesTable.punchedAt, periodStartDate),
            lte(punchesTable.punchedAt, periodEndDate)
          )
        );

      const afterSnapshot: Record<string, unknown> = {
        capturedAt: now.toISOString(),
        timesheetId,
        timesheetStatus: finalStatus,
        certificationCleared: finalStatus === "draft",
        correctionMode,
        employeeId: ts.employeeId,
        periodStart: ts.periodStart,
        periodEnd: ts.periodEnd,
        punchEditsApplied: punchEdits.length,
        autoApplied: true,
        approvalBypassed: true,
        legacyPunches: afterLegacyPunches.map(p => ({
          id: p.id,
          type: p.type,
          punchedAt: p.punchedAt,
          costCode: p.costCode ?? null,
          note: p.note ?? null,
          isEdited: p.isEdited,
        })),
      };

      const [updated] = await tx
        .update(timesheetCorrectionsTable)
        .set({
          status: "approved",
          reviewedByUserId: actor.id ?? undefined,
          reviewedAt: now,
          reviewerNote: "(Auto-approved — correction approval is disabled by policy)",
          afterSnapshot,
        })
        .where(eq(timesheetCorrectionsTable.id, correction!.id))
        .returning();

      await logAction(
        {
          tableName: "timesheet_corrections",
          recordId: correction!.id,
          action: "TIME_CORRECTION_APPROVED",
          oldValues: {
            timesheetStatus: ts.status,
            timesheetId,
            employeeId: ts.employeeId,
            correctionStatus: "pending",
          },
          newValues: {
            correctionId: correction!.id,
            correctionStatus: "approved",
            reason: data.reason.trim(),
            proposedChanges,
            requestedByEmployeeId,
            originalSnapshot,
            timesheetStatus: finalStatus,
            correctionMode,
            punchEditsApplied: punchEdits.length,
            autoApplied: true,
            approvalBypassed: true,
            bypassReason: "correctionApprovalRequired is false in policy settings",
            afterSnapshot,
          },
          actor,
        },
        tx
      );

      return { ...updated!, autoApplied: true };
    });
  }

  // ---------------------------------------------------------------------------
  // STANDARD PATH — multi-step approval workflow
  // ---------------------------------------------------------------------------
  return await db.transaction(async (tx) => {
    const [correction] = await tx
      .insert(timesheetCorrectionsTable)
      .values({
        timesheetId,
        requestedByEmployeeId,
        reason: data.reason.trim(),
        originalSnapshot,
        proposedChanges: proposedChanges as unknown as Record<string, unknown>,
      })
      .returning();

    await tx
      .update(timesheetsTable)
      .set({ status: "correction_requested" })
      .where(eq(timesheetsTable.id, timesheetId));

    await logAction(
      {
        tableName: "timesheets",
        recordId: timesheetId,
        action: "TIME_TIMESHEET_STATUS_CHANGED",
        oldValues: { timesheetStatus: ts.status },
        newValues: { timesheetStatus: "correction_requested", correctionId: correction!.id },
        actor,
      },
      tx
    );

    await logAction(
      {
        tableName: "timesheet_corrections",
        recordId: correction!.id,
        action: "TIME_CORRECTION_REQUESTED",
        oldValues: {
          timesheetStatus: ts.status,
          timesheetId,
          employeeId: ts.employeeId,
        },
        newValues: {
          correctionId: correction!.id,
          reason: data.reason.trim(),
          proposedChanges,
          requestedByEmployeeId,
          originalSnapshot,
          timesheetStatus: "correction_requested",
        },
        actor,
      },
      tx
    );

    return correction!;
  });
}

export async function approveCorrection(
  correctionId: number,
  reviewerNote: string,
  actor: AuditActor
): Promise<TimesheetCorrection | { error: string; statusCode: number }> {
  const [correction] = await db
    .select()
    .from(timesheetCorrectionsTable)
    .where(eq(timesheetCorrectionsTable.id, correctionId));

  if (!correction) return { error: "Correction request not found", statusCode: 404 };
  if (correction.status !== "pending") {
    return {
      error: `This correction request has already been ${correction.status}.`,
      statusCode: 409,
    };
  }

  if (!reviewerNote || reviewerNote.trim().length < 3) {
    return { error: "A reviewer note is required to approve a correction.", statusCode: 400 };
  }

  const ts = await getTimesheet(correction.timesheetId);
  if (!ts) return { error: "Timesheet not found", statusCode: 404 };

  // Validate both hops through the state machine before touching the DB.
  // correction_requested → correction_approved (intermediate audit state)
  try {
    assertTransition(ts.status, "correction_approved", actor.role);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return { error: err.message, statusCode: err.statusCode };
    }
    throw err;
  }

  const proposedChanges = correction.proposedChanges as unknown as StructuredProposedChanges;
  const correctionMode = proposedChanges?.mode ?? "reopen";

  // Determine the final status:
  // - "apply-edits" with only metadata changes (note/costCode) stays certified
  // - anything that requires full re-entry reopens to draft
  const finalStatus: "draft" | "certified" = correctionMode === "apply-edits" ? "certified" : "draft";

  try {
    assertTransition("correction_approved", finalStatus, actor.role);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return { error: err.message, statusCode: err.statusCode };
    }
    throw err;
  }

  const beforeSnapshot = correction.originalSnapshot as Record<string, unknown>;
  const punchEdits: PunchEdit[] = Array.isArray(proposedChanges?.punchEdits)
    ? (proposedChanges.punchEdits as PunchEdit[])
    : [];

  const now = new Date();
  const periodStartDate = new Date(`${ts.periodStart}T00:00:00Z`);
  const periodEndDate = new Date(`${ts.periodEnd}T23:59:59Z`);

  return await db.transaction(async (tx) => {
    for (const edit of punchEdits) {
      if (!edit.punchId || !edit.field) continue;

      const punchGuard = and(
        eq(punchesTable.id, edit.punchId),
        eq(punchesTable.employeeId, ts.employeeId),
        gte(punchesTable.punchedAt, periodStartDate),
        lte(punchesTable.punchedAt, periodEndDate)
      );

      if (edit.field === "costCode") {
        await tx
          .update(punchesTable)
          .set({ costCode: edit.newValue, isEdited: true, editNote: `Correction approved: ${reviewerNote.trim()}` })
          .where(punchGuard);
      } else if (edit.field === "note") {
        await tx
          .update(punchesTable)
          .set({ note: edit.newValue, isEdited: true, editNote: `Correction approved: ${reviewerNote.trim()}` })
          .where(punchGuard);
      }
    }

    // Step 1: intermediate audit state — correction_approved
    await tx
      .update(timesheetsTable)
      .set({ status: "correction_approved" })
      .where(eq(timesheetsTable.id, correction.timesheetId));

    await logAction(
      {
        tableName: "timesheets",
        recordId: correction.timesheetId,
        action: "TIME_CORRECTION_STATUS_INTERMEDIATE",
        oldValues: { timesheetStatus: ts.status, correctionId },
        newValues: {
          timesheetStatus: "correction_approved",
          correctionMode,
          note: "Intermediate correction_approved state before final status resolution",
          reviewedByUserId: actor.id,
        },
        actor,
      },
      tx
    );

    // Step 2: final state — draft (full reopen) or certified (apply-edits only)
    const finalFields =
      finalStatus === "draft"
        ? {
            status: "draft" as const,
            certificationStatement: null,
            certifiedByUserId: null,
            certificationVersion: null,
            employeeAttested: false,
            attestedAt: null,
          }
        : { status: "certified" as const };

    await tx
      .update(timesheetsTable)
      .set(finalFields)
      .where(eq(timesheetsTable.id, correction.timesheetId));

    const afterLegacyPunches = await tx
      .select()
      .from(punchesTable)
      .where(
        and(
          eq(punchesTable.employeeId, ts.employeeId),
          gte(punchesTable.punchedAt, periodStartDate),
          lte(punchesTable.punchedAt, periodEndDate)
        )
      );

    const afterSnapshot: Record<string, unknown> = {
      capturedAt: now.toISOString(),
      timesheetId: correction.timesheetId,
      timesheetStatus: finalStatus,
      certificationCleared: finalStatus === "draft",
      correctionMode,
      employeeId: ts.employeeId,
      periodStart: ts.periodStart,
      periodEnd: ts.periodEnd,
      punchEditsApplied: punchEdits.length,
      legacyPunches: afterLegacyPunches.map(p => ({
        id: p.id,
        type: p.type,
        punchedAt: p.punchedAt,
        costCode: p.costCode ?? null,
        note: p.note ?? null,
        isEdited: p.isEdited,
      })),
    };

    const [updated] = await tx
      .update(timesheetCorrectionsTable)
      .set({
        status: "approved",
        reviewedByUserId: actor.id ?? undefined,
        reviewedAt: now,
        reviewerNote: reviewerNote.trim(),
        afterSnapshot,
      })
      .where(eq(timesheetCorrectionsTable.id, correctionId))
      .returning();

    await logAction(
      {
        tableName: "timesheet_corrections",
        recordId: correctionId,
        action: "TIME_CORRECTION_APPROVED",
        oldValues: {
          correctionStatus: "pending",
          timesheetId: correction.timesheetId,
          timesheetStatus: ts.status,
          originalSnapshot: beforeSnapshot,
        },
        newValues: {
          correctionStatus: "approved",
          timesheetStatus: finalStatus,
          certificationCleared: finalStatus === "draft",
          correctionMode,
          punchEditsApplied: punchEdits.length,
          reviewedByUserId: actor.id,
          reviewedAt: now.toISOString(),
          reviewerNote: reviewerNote.trim(),
          proposedChanges,
          afterSnapshot,
        },
        actor,
      },
      tx
    );

    return updated!;
  });
}

export async function rejectCorrection(
  correctionId: number,
  reviewerNote: string,
  actor: AuditActor
): Promise<TimesheetCorrection | { error: string; statusCode: number }> {
  const [correction] = await db
    .select()
    .from(timesheetCorrectionsTable)
    .where(eq(timesheetCorrectionsTable.id, correctionId));

  if (!correction) return { error: "Correction request not found", statusCode: 404 };
  if (correction.status !== "pending") {
    return {
      error: `This correction request has already been ${correction.status}.`,
      statusCode: 409,
    };
  }

  if (!reviewerNote || reviewerNote.trim().length < 3) {
    return { error: "A reviewer note is required to reject a correction.", statusCode: 400 };
  }

  const ts = await getTimesheet(correction.timesheetId);
  if (!ts) return { error: "Timesheet not found", statusCode: 404 };

  // Enforce state machine: correction_requested → locked (rejection)
  try {
    assertTransition(ts.status, "locked", actor.role);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return { error: err.message, statusCode: err.statusCode };
    }
    throw err;
  }

  const now = new Date();

  return await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(timesheetCorrectionsTable)
      .set({
        status: "rejected",
        reviewedByUserId: actor.id ?? undefined,
        reviewedAt: now,
        reviewerNote: reviewerNote.trim(),
      })
      .where(eq(timesheetCorrectionsTable.id, correctionId))
      .returning();

    await tx
      .update(timesheetsTable)
      .set({ status: "locked" })
      .where(eq(timesheetsTable.id, correction.timesheetId));

    await logAction(
      {
        tableName: "timesheet_corrections",
        recordId: correctionId,
        action: "TIME_CORRECTION_REJECTED",
        oldValues: {
          correctionStatus: "pending",
          timesheetId: correction.timesheetId,
          timesheetStatus: ts?.status ?? null,
          originalSnapshot: correction.originalSnapshot,
        },
        newValues: {
          correctionStatus: "rejected",
          timesheetStatus: "locked",
          reviewedByUserId: actor.id,
          reviewedAt: now.toISOString(),
          reviewerNote: reviewerNote.trim(),
        },
        actor,
      },
      tx
    );

    return updated!;
  });
}

export async function listCorrections(filters?: {
  timesheetId?: number;
  status?: string;
  requestedByEmployeeId?: number;
}): Promise<TimesheetCorrection[]> {
  const conditions = [];
  if (filters?.timesheetId != null) {
    conditions.push(eq(timesheetCorrectionsTable.timesheetId, filters.timesheetId));
  }
  if (filters?.status) {
    conditions.push(eq(timesheetCorrectionsTable.status, filters.status));
  }
  if (filters?.requestedByEmployeeId != null) {
    conditions.push(eq(timesheetCorrectionsTable.requestedByEmployeeId, filters.requestedByEmployeeId));
  }

  return db
    .select()
    .from(timesheetCorrectionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(timesheetCorrectionsTable.requestedAt);
}

export async function getCorrection(id: number): Promise<TimesheetCorrection | null> {
  const [row] = await db
    .select()
    .from(timesheetCorrectionsTable)
    .where(eq(timesheetCorrectionsTable.id, id));
  return row ?? null;
}

export async function listCorrectionsForTimesheets(timesheetIds: number[]): Promise<TimesheetCorrection[]> {
  if (timesheetIds.length === 0) return [];
  return db
    .select()
    .from(timesheetCorrectionsTable)
    .where(inArray(timesheetCorrectionsTable.timesheetId, timesheetIds))
    .orderBy(timesheetCorrectionsTable.requestedAt);
}
