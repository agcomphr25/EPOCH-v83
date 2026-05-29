import { db } from "../../../db";
import { pool } from "../../../db";
import { timeOffRequestsTable, leaveEntriesTable, salariedTimesheetLinesTable, employeesTable } from "../../schema/timekeeping";
import { eq, desc, and, or, gte, lte, isNull } from "drizzle-orm";
import type { TimeOffRequest, InsertTimeOffRequest } from "../../schema/timekeeping";
import { listResolvedEmployees } from "../../lib/timekeepingEmployeeResolver";
import { logAction, actorFromUser } from "./audit.service";
import type { SafeUser } from "./audit.service";
import { syncPTOAfterApproval } from "./salariedTimesheet.service";
import type { TxClient } from "./salariedTimesheet.service";

type MiniClient = {
  select: typeof db.select;
  insert: typeof db.insert;
  update: typeof db.update;
  delete: typeof db.delete;
};

export type TimeOffRequestWithEmployee = TimeOffRequest & {
  employeeFirstName: string | null;
  employeeLastName: string | null;
};

export type RequestStage = "supervisor" | "hr" | "vp";
export type StageDecision = "approved" | "denied";

// ---------------------------------------------------------------------------
// Stage-label helper
// ---------------------------------------------------------------------------
export function stageLabel(status: string): string {
  const map: Record<string, string> = {
    pending_supervisor: "Pending Supervisor",
    pending_hr: "Pending HR",
    pending_vp: "Pending VP",
    approved: "Approved",
    rejected: "Rejected",
    denied: "Denied",
    pending: "Pending",
  };
  return map[status] ?? status;
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------
export async function submitPTORequest(
  data: InsertTimeOffRequest & {
    submittedByUserId?: number | null;
    actorUser?: SafeUser | null;
    actorIp?: string | null;
  }
): Promise<TimeOffRequest> {
  const { actorUser, actorIp, ...insertData } = data;

  // Determine initial status: pending_supervisor if employee has a supervisor, else pending_hr
  let initialStatus = "pending_supervisor";
  let supervisorId: number | null = null;

  if (insertData.employeeId) {
    const { rows: empRows } = await pool.query<{ supervisor_employee_id: number | null }>(
      `SELECT supervisor_employee_id FROM employees WHERE id = $1 LIMIT 1`,
      [insertData.employeeId]
    );

    if (empRows.length > 0 && empRows[0]?.supervisor_employee_id) {
      supervisorId = empRows[0].supervisor_employee_id;
    } else {
      initialStatus = "pending_hr";
      console.warn(
        `[timeoff] Employee ${insertData.employeeId} has no supervisor assigned — routing PTO directly to HR.`
      );
    }
  }

  const [row] = await db
    .insert(timeOffRequestsTable)
    .values({
      ...insertData,
      leaveType: "pto",
      status: initialStatus,
      supervisorId: supervisorId ?? undefined,
    })
    .returning();

  await logAction(
    {
      tableName: "time_off_requests",
      recordId: row!.id,
      action: "INSERT",
      oldValues: null,
      newValues: {
        status: initialStatus,
        employeeId: insertData.employeeId,
        startDate: insertData.startDate,
        endDate: insertData.endDate,
        requestUnit: insertData.requestUnit,
        submittedOnBehalf: insertData.submittedOnBehalf ?? false,
      },
      actor: actorFromUser(actorUser ?? null, actorIp ?? null),
    }
  );

  // PTO submission notifications are temporarily disabled while the approval
  // notification path is being reviewed. The request still lands in the PTO
  // command center and follows the normal approval workflow.

  return row!;
}

// ---------------------------------------------------------------------------
// Stage review dispatcher
// ---------------------------------------------------------------------------
export async function reviewPTOStage(
  id: number,
  stage: RequestStage,
  decision: StageDecision,
  note: string | undefined,
  reviewerUserId: number,
  actorUser: SafeUser | null,
  actorIp: string | null
): Promise<TimeOffRequest | null> {
  if (decision === "denied" && (!note || note.trim() === "")) {
    throw new Error("A denial reason is required.");
  }

  const existing = await db
    .select()
    .from(timeOffRequestsTable)
    .where(eq(timeOffRequestsTable.id, id))
    .limit(1);

  if (existing.length === 0) return null;
  const req = existing[0]!;

  const now = new Date();

  if (stage === "supervisor") {
    return _supervisorDecision(req, decision, note, reviewerUserId, now, actorUser, actorIp);
  } else if (stage === "hr") {
    return _hrDecision(req, decision, note, reviewerUserId, now, actorUser, actorIp);
  } else if (stage === "vp") {
    return _vpDecision(req, decision, note, reviewerUserId, now, actorUser, actorIp);
  }

  throw new Error(`Unknown stage: ${stage}`);
}

async function _supervisorDecision(
  req: TimeOffRequest,
  decision: StageDecision,
  note: string | undefined,
  reviewerUserId: number,
  now: Date,
  actorUser: SafeUser | null,
  actorIp: string | null
): Promise<TimeOffRequest> {
  if (req.status !== "pending_supervisor") {
    throw new Error(`Request is not at supervisor stage (current: ${req.status})`);
  }

  const nextStatus = decision === "approved" ? "pending_hr" : "rejected";

  const [updated] = await db
    .update(timeOffRequestsTable)
    .set({
      supervisorDecision: decision,
      supervisorNote: note ?? null,
      supervisorReviewedAt: now,
      supervisorReviewedBy: reviewerUserId,
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(timeOffRequestsTable.id, req.id))
    .returning();

  await logAction({
    tableName: "time_off_requests",
    recordId: req.id,
    action: "UPDATE",
    oldValues: { status: req.status },
    newValues: { status: nextStatus, supervisorDecision: decision, supervisorNote: note ?? null },
    actor: actorFromUser(actorUser, actorIp),
  });

  const { notifyPTOEmployeeStatus, notifyPTOHrAdminNeeded } = await import("./approvalNotifications.service");
  if (decision === "approved") {
    void notifyPTOEmployeeStatus(
      req.id,
      `PTO request #${req.id} approved by supervisor`,
      "Your PTO request was approved by your supervisor and is now waiting for HR/Admin review."
    );
    void notifyPTOHrAdminNeeded(req.id, "Supervisor approved; HR/Admin review is now required.");
  } else {
    void notifyPTOEmployeeStatus(
      req.id,
      `PTO request #${req.id} denied by supervisor`,
      `Your PTO request was denied by your supervisor.${note ? `\nReason: ${note}` : ""}`
    );
  }

  return updated!;
}

async function _hrDecision(
  req: TimeOffRequest,
  decision: StageDecision,
  note: string | undefined,
  reviewerUserId: number,
  now: Date,
  actorUser: SafeUser | null,
  actorIp: string | null
): Promise<TimeOffRequest> {
  if (req.status !== "pending_hr") {
    throw new Error(`Request is not at HR stage (current: ${req.status})`);
  }

  const nextStatus = decision === "approved" ? "pending_vp" : "rejected";

  const [updated] = await db
    .update(timeOffRequestsTable)
    .set({
      hrDecision: decision,
      hrNote: note ?? null,
      hrReviewedAt: now,
      hrReviewedBy: reviewerUserId,
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(timeOffRequestsTable.id, req.id))
    .returning();

  await logAction({
    tableName: "time_off_requests",
    recordId: req.id,
    action: "UPDATE",
    oldValues: { status: req.status },
    newValues: { status: nextStatus, hrDecision: decision, hrNote: note ?? null },
    actor: actorFromUser(actorUser, actorIp),
  });

  const { notifyPTOEmployeeStatus } = await import("./approvalNotifications.service");
  if (decision === "approved") {
    void notifyPTOEmployeeStatus(
      req.id,
      `PTO request #${req.id} approved by HR/Admin`,
      "Your PTO request was approved by HR/Admin and is now waiting for final review."
    );
  } else {
    void notifyPTOEmployeeStatus(
      req.id,
      `PTO request #${req.id} denied by HR/Admin`,
      `Your PTO request was denied by HR/Admin.${note ? `\nReason: ${note}` : ""}`
    );
  }

  return updated!;
}

async function _vpDecision(
  req: TimeOffRequest,
  decision: StageDecision,
  note: string | undefined,
  reviewerUserId: number,
  now: Date,
  actorUser: SafeUser | null,
  actorIp: string | null
): Promise<TimeOffRequest> {
  if (req.status !== "pending_vp") {
    throw new Error(`Request is not at VP stage (current: ${req.status})`);
  }

  const nextStatus = decision === "approved" ? "approved" : "rejected";

  // Wrap the ENTIRE approval flow — status update, audit log, leave entry creation,
  // AND salaried timesheet sync — in a single db.transaction() so all effects are
  // atomic.  syncPTOAfterApproval receives the tx client and therefore operates on
  // the same connection, which means it can read the uncommitted leave entries
  // created earlier in the same transaction (PostgreSQL read-your-own-writes within
  // a single transaction).  If any step fails the whole transaction rolls back.
  const updated = await db.transaction(async (tx) => {
    const txClient = tx as unknown as TxClient;

    const [u] = await txClient
      .update(timeOffRequestsTable)
      .set({
        vpDecision: decision,
        vpNote: note ?? null,
        vpReviewedAt: now,
        vpReviewedBy: reviewerUserId,
        status: nextStatus,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(timeOffRequestsTable.id, req.id))
      .returning();

    await logAction(
      {
        tableName: "time_off_requests",
        recordId: req.id,
        action: "UPDATE",
        oldValues: { status: req.status },
        newValues: { status: nextStatus, vpDecision: decision, vpNote: note ?? null },
        actor: actorFromUser(actorUser, actorIp),
      },
      tx as unknown as { insert: typeof db.insert }
    );

    if (decision === "approved") {
      await createLeaveEntriesForApprovedPTO(u!, actorUser, actorIp, txClient as unknown as MiniClient);

      if (u!.requestUnit !== "hourly") {
        const startD = new Date(u!.startDate);
        const endD = new Date(u!.endDate);
        const seenWeeks = new Set<string>();
        for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 7)) {
          const day = d.getDay();
          const monday = new Date(d);
          monday.setDate(d.getDate() - ((day + 6) % 7));
          const weekStart = monday.toISOString().slice(0, 10);
          if (!seenWeeks.has(weekStart)) {
            seenWeeks.add(weekStart);
            await syncPTOAfterApproval(u!.employeeId, weekStart, txClient);
          }
        }
      } else {
        console.info(
          `[timeoff] Hourly PTO request ${u!.id} approved — leave entry created, vacation_hours will appear in next Gusto export for ${u!.partialDayDate ?? u!.startDate}`
        );
      }
    }

    return u!;
  });

  const { notifyPTOEmployeeStatus } = await import("./approvalNotifications.service");
  if (decision === "approved") {
    void notifyPTOEmployeeStatus(
      req.id,
      `PTO request #${req.id} approved`,
      "Your PTO request has received final approval."
    );
  } else {
    void notifyPTOEmployeeStatus(
      req.id,
      `PTO request #${req.id} denied`,
      `Your PTO request was denied during final review.${note ? `\nReason: ${note}` : ""}`
    );
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Legacy single-stage review (backwards compatibility for ADMIN/OWNER)
// ---------------------------------------------------------------------------
export async function reviewTimeOffRequest(
  id: number,
  decision: "approved" | "denied",
  adminNote?: string,
  actorUser?: SafeUser | null,
  actorIp?: string | null
): Promise<TimeOffRequest | null> {
  const existing = await db
    .select()
    .from(timeOffRequestsTable)
    .where(eq(timeOffRequestsTable.id, id))
    .limit(1);

  if (existing.length === 0) return null;
  const req = existing[0]!;

  const now = new Date();
  const nextStatus = decision === "approved" ? "approved" : "rejected";

  const [updated] = await db
    .update(timeOffRequestsTable)
    .set({
      status: nextStatus,
      adminNote: adminNote ?? null,
      reviewedAt: now,
      vpDecision: decision,
      vpNote: adminNote ?? null,
      vpReviewedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(timeOffRequestsTable.id, id),
        or(
          eq(timeOffRequestsTable.status, "pending"),
          eq(timeOffRequestsTable.status, "pending_supervisor"),
          eq(timeOffRequestsTable.status, "pending_hr"),
          eq(timeOffRequestsTable.status, "pending_vp")
        )
      )
    )
    .returning();

  if (!updated) return null;

  await logAction({
    tableName: "time_off_requests",
    recordId: id,
    action: "UPDATE",
    oldValues: { status: req.status },
    newValues: { status: nextStatus, adminNote: adminNote ?? null },
    actor: actorFromUser(actorUser ?? null, actorIp ?? null),
  });

  if (decision === "approved") {
    await createLeaveEntriesForApprovedPTO(updated, actorUser ?? null, actorIp ?? null);
    if (updated.requestUnit !== "hourly") {
      try {
        const startD = new Date(updated.startDate);
        const endD = new Date(updated.endDate);
        const seenWeeks = new Set<string>();
        for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 7)) {
          const day = d.getDay();
          const monday = new Date(d);
          monday.setDate(d.getDate() - ((day + 6) % 7));
          const weekStart = monday.toISOString().slice(0, 10);
          if (!seenWeeks.has(weekStart)) {
            seenWeeks.add(weekStart);
            await syncPTOAfterApproval(updated.employeeId, weekStart);
          }
        }
      } catch (syncErr) {
        console.warn("[timeoff] syncPTOAfterApproval error (non-fatal):", syncErr);
      }
    } else {
      console.info(`[timeoff] Hourly PTO request ${updated.id} approved — payroll sync deferred (hourly path)`);
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Leave entry creation with duplicate guard
// ---------------------------------------------------------------------------
export async function createLeaveEntriesForApprovedPTO(
  request: TimeOffRequest,
  actorUser: SafeUser | null,
  actorIp: string | null,
  tx?: MiniClient
): Promise<void> {
  const client = tx ?? (db as unknown as MiniClient);

  // Resolve timekeeping employee ID from epoch employee ID
  const tkEmployee = await client
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(eq(employeesTable.epochEmployeeId, request.employeeId))
    .limit(1);

  if (tkEmployee.length === 0) {
    console.warn(
      `[timeoff] No timekeeping employee mapping found for epoch employee ${request.employeeId} — skipping leave entry creation.`
    );
    await logAction(
      {
        tableName: "time_off_requests",
        recordId: request.id,
        action: "UPDATE",
        oldValues: null,
        newValues: { warning: "No timekeeping employee mapping found — leave entries not created." },
        actor: actorFromUser(actorUser, actorIp),
      },
      tx as unknown as { insert: typeof db.insert } | undefined
    );
    return;
  }

  const tkEmpId = tkEmployee[0]!.id;
  const hoursPerDay = 8;

  // Build the list of dates covered by this request
  const dates: string[] = [];
  if (request.requestUnit === "hourly" && request.partialDayDate) {
    dates.push(request.partialDayDate);
  } else if (request.requestUnit === "half_day" && request.partialDayDate) {
    dates.push(request.partialDayDate);
  } else {
    // full_day or multi_day: enumerate all dates between startDate and endDate
    const start = new Date(request.startDate);
    const end = new Date(request.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      dates.push(iso);
    }
  }

  for (const date of dates) {
    let hours = hoursPerDay;
    if (request.requestUnit === "hourly" && request.requestedHours != null) {
      hours = request.requestedHours;
    } else if (request.requestUnit === "half_day") {
      hours = hoursPerDay / 2;
    }

    // Duplicate guard: check if a non-voided leave entry already exists for this employee/date/leaveType
    const existing = await client
      .select({ id: leaveEntriesTable.id })
      .from(leaveEntriesTable)
      .where(
        and(
          eq(leaveEntriesTable.employeeId, tkEmpId),
          eq(leaveEntriesTable.date, date),
          eq(leaveEntriesTable.leaveType, "pto"),
          isNull(leaveEntriesTable.voidedAt)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`[timeoff] Leave entry already exists for employee ${tkEmpId} on ${date} — skipping.`);
      continue;
    }

    const [inserted] = await client.insert(leaveEntriesTable).values({
      employeeId: tkEmpId,
      date,
      leaveType: "pto",
      hours,
      note: `PTO approved (request #${request.id})`,
      sourceRequestId: request.id,
    }).returning({ id: leaveEntriesTable.id });

    await logAction(
      {
        tableName: "leave_entries",
        recordId: inserted?.id ?? request.id,
        action: "INSERT",
        oldValues: null,
        newValues: { employeeId: tkEmpId, date, leaveType: "pto", hours, sourceRequestId: request.id },
        actor: actorFromUser(actorUser, actorIp),
      },
      tx as unknown as { insert: typeof db.insert } | undefined
    );
  }
}

// ---------------------------------------------------------------------------
// PTO reversal — soft-void all leave entries for a request (fully atomic)
// ---------------------------------------------------------------------------
export async function reverseApprovedPTO(
  requestId: number,
  actorUserId: number,
  reason: string,
  actorUser: SafeUser | null,
  actorIp: string | null
): Promise<void> {
  // Delegates to _reverseInsideTx inside a single db.transaction so all
  // effects (void, delete salaried lines, re-sync, audit) are atomic.
  await db.transaction(async (tx) => {
    await _reverseInsideTx(
      requestId,
      actorUserId,
      reason,
      actorUser,
      actorIp,
      tx as unknown as TxClient,
      tx as unknown as { insert: typeof db.insert }
    );
  });
}

// ---------------------------------------------------------------------------
// Internal helper: reversal logic that runs inside a given TxClient
// Both reverseApprovedPTO and adminCancelTimeOffRequest use this so
// reversal + status-update can share the same db.transaction.
// ---------------------------------------------------------------------------
async function _reverseInsideTx(
  requestId: number,
  actorUserId: number,
  reason: string,
  actorUser: SafeUser | null,
  actorIp: string | null,
  txClient: TxClient,
  tx: { insert: typeof db.insert }
): Promise<void> {
  const entries = await txClient
    .select()
    .from(leaveEntriesTable)
    .where(
      and(
        eq(leaveEntriesTable.sourceRequestId, requestId),
        isNull(leaveEntriesTable.voidedAt)
      )
    );

  if (entries.length === 0) {
    console.log(`[timeoff] _reverseInsideTx: no active leave entries for request ${requestId}`);
  }

  const now = new Date();

  for (const entry of entries) {
    await txClient
      .update(leaveEntriesTable)
      .set({ voidedAt: now, voidedBy: actorUserId, voidReason: reason })
      .where(eq(leaveEntriesTable.id, entry.id));

    await txClient
      .delete(salariedTimesheetLinesTable)
      .where(eq(salariedTimesheetLinesTable.leaveEntryId, entry.id));

    await logAction(
      {
        tableName: "leave_entries",
        recordId: entry.id,
        action: "UPDATE",
        oldValues: { voidedAt: null, voidedBy: null, voidReason: null },
        newValues: { voidedAt: now.toISOString(), voidedBy: actorUserId, voidReason: reason },
        actor: actorFromUser(actorUser, actorIp),
      },
      tx
    );
  }

  const [reqRow] = await txClient
    .select({
      employeeId: timeOffRequestsTable.employeeId,
      startDate: timeOffRequestsTable.startDate,
      endDate: timeOffRequestsTable.endDate,
      requestUnit: timeOffRequestsTable.requestUnit,
    })
    .from(timeOffRequestsTable)
    .where(eq(timeOffRequestsTable.id, requestId))
    .limit(1);

  if (reqRow && reqRow.requestUnit !== "hourly") {
    const startD = new Date(reqRow.startDate);
    const endD = new Date(reqRow.endDate);
    const seenWeeks = new Set<string>();
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 7)) {
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));
      const weekStart = monday.toISOString().slice(0, 10);
      if (!seenWeeks.has(weekStart)) {
        seenWeeks.add(weekStart);
        await syncPTOAfterApproval(reqRow.employeeId, weekStart, txClient);
      }
    }
  }

  await logAction(
    {
      tableName: "time_off_requests",
      recordId: requestId,
      action: "UPDATE",
      oldValues: null,
      newValues: {
        reversal: "PTO_REVERSED",
        actorUserId,
        reason,
        voidedEntriesCount: entries.length,
        voidedAt: now.toISOString(),
      },
      actor: actorFromUser(actorUser, actorIp),
    },
    tx
  );
}

// ---------------------------------------------------------------------------
// Admin cancel: atomically sets status to 'cancelled' and (if previously
// approved) reverses all PTO leave entries in the same transaction.
// ---------------------------------------------------------------------------
export async function adminCancelTimeOffRequest(
  requestId: number,
  actorUser: SafeUser,
  reason: string,
  actorIp: string | null
): Promise<{ request: TimeOffRequest; reversalTriggered: boolean } | null> {
  return await db.transaction(async (tx) => {
    const txClient = tx as unknown as TxClient;

    const [existing] = await txClient
      .select()
      .from(timeOffRequestsTable)
      .where(eq(timeOffRequestsTable.id, requestId))
      .limit(1);

    if (!existing) {
      return null;
    }

    const wasApproved = existing.status === "approved";
    const now = new Date();

    const [updated] = await txClient
      .update(timeOffRequestsTable)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(timeOffRequestsTable.id, requestId))
      .returning();

    await logAction(
      {
        tableName: "time_off_requests",
        recordId: requestId,
        action: "UPDATE",
        oldValues: { status: existing.status },
        newValues: {
          status: "cancelled",
          cancelledBy: actorUser.id,
          reason,
          cancelledAt: now.toISOString(),
          wasApproved,
          reversalTriggered: wasApproved,
        },
        actor: actorFromUser(actorUser, actorIp),
      },
      tx as unknown as { insert: typeof db.insert }
    );

    if (wasApproved) {
      await _reverseInsideTx(
        requestId,
        actorUser.id,
        reason,
        actorUser,
        actorIp,
        txClient,
        tx as unknown as { insert: typeof db.insert }
      );
    }

    return { request: updated!, reversalTriggered: wasApproved };
  });
}

// ---------------------------------------------------------------------------
// PTO block helper for clock-in gates
// ---------------------------------------------------------------------------
export async function checkActivePTOForEmployee(
  epochEmployeeId: number,
  date: string
): Promise<{ leaveEntryId: number; hours: number } | null> {
  const tkEmployee = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(eq(employeesTable.epochEmployeeId, epochEmployeeId))
    .limit(1);

  if (tkEmployee.length === 0) return null;
  const tkEmpId = tkEmployee[0]!.id;

  const entries = await db
    .select({ id: leaveEntriesTable.id, hours: leaveEntriesTable.hours })
    .from(leaveEntriesTable)
    .where(
      and(
        eq(leaveEntriesTable.employeeId, tkEmpId),
        eq(leaveEntriesTable.date, date),
        eq(leaveEntriesTable.leaveType, "pto"),
        isNull(leaveEntriesTable.voidedAt)
      )
    )
    .limit(1);

  if (entries.length === 0) return null;
  return { leaveEntryId: entries[0]!.id, hours: entries[0]!.hours };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export async function createTimeOffRequest(data: InsertTimeOffRequest): Promise<TimeOffRequest> {
  return submitPTORequest({ ...data, actorUser: null, actorIp: null });
}

export async function getTimeOffRequestsByEmployee(employeeId: number): Promise<TimeOffRequest[]> {
  return db
    .select()
    .from(timeOffRequestsTable)
    .where(eq(timeOffRequestsTable.employeeId, employeeId))
    .orderBy(desc(timeOffRequestsTable.createdAt));
}

export async function getAllTimeOffRequests(
  statusFilter?: string,
  employeeIdFilter?: number,
  startDateFilter?: string,
  endDateFilter?: string
): Promise<TimeOffRequestWithEmployee[]> {
  const validStatuses = [
    "pending",
    "pending_supervisor",
    "pending_hr",
    "pending_vp",
    "approved",
    "rejected",
    "denied",
  ] as const;
  const isValidStatus = (s: string): s is (typeof validStatuses)[number] =>
    (validStatuses as readonly string[]).includes(s);

  let query = db
    .select()
    .from(timeOffRequestsTable)
    .$dynamic();

  const conditions = [];
  if (statusFilter && statusFilter !== "all" && isValidStatus(statusFilter)) {
    conditions.push(eq(timeOffRequestsTable.status, statusFilter));
  }
  if (employeeIdFilter) {
    conditions.push(eq(timeOffRequestsTable.employeeId, employeeIdFilter));
  }
  // Date range: include requests that overlap with the given range
  if (startDateFilter) {
    conditions.push(gte(timeOffRequestsTable.endDate, startDateFilter));
  }
  if (endDateFilter) {
    conditions.push(lte(timeOffRequestsTable.startDate, endDateFilter));
  }

  if (conditions.length > 0) {
    if (conditions.length === 1) {
      query = query.where(conditions[0]!);
    } else {
      query = query.where(and(...conditions));
    }
  }

  const [rows, allEmployees] = await Promise.all([
    query.orderBy(desc(timeOffRequestsTable.createdAt)),
    listResolvedEmployees(),
  ]);

  const epochIdToName = new Map<number, { firstName: string; lastName: string }>();
  for (const emp of allEmployees) {
    epochIdToName.set(emp.epochEmployeeId, {
      firstName: emp.firstName,
      lastName: emp.lastName,
    });
  }

  return rows.map((row) => {
    const name = epochIdToName.get(row.employeeId);
    return {
      ...row,
      employeeFirstName: name?.firstName ?? null,
      employeeLastName: name?.lastName ?? null,
    };
  });
}

export async function getPendingTimeOffCount(): Promise<number> {
  const rows = await db
    .select()
    .from(timeOffRequestsTable)
    .where(
      or(
        eq(timeOffRequestsTable.status, "pending"),
        eq(timeOffRequestsTable.status, "pending_supervisor"),
        eq(timeOffRequestsTable.status, "pending_hr"),
        eq(timeOffRequestsTable.status, "pending_vp")
      )
    );
  return rows.length;
}

export async function getApprovedTimeOffForEmployee(employeeId: number): Promise<TimeOffRequest[]> {
  return db
    .select()
    .from(timeOffRequestsTable)
    .where(
      and(
        eq(timeOffRequestsTable.employeeId, employeeId),
        eq(timeOffRequestsTable.status, "approved")
      )
    );
}

export async function getApprovedTimeOffAll(): Promise<TimeOffRequestWithEmployee[]> {
  return getAllTimeOffRequests("approved");
}
