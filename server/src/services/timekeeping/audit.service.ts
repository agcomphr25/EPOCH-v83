import { db } from "../../../db";
import { auditLogTable, timesheetCorrectionsTable } from "../../schema/timekeeping";
import { eq, and, inArray, asc } from "drizzle-orm";

export interface AuditActor {
  id: number | null;
  email: string | null;
  role: string | null;
  ip: string | null;
}

// Minimal user shape accepted by actorFromUser — matches EPOCH's req.user
// (which has username instead of email) and the standalone's SafeUser.
export interface SafeUser {
  id: number;
  username?: string;
  email?: string;
  role: string;
  employeeId?: number | null;
}

export interface LogActionParams {
  tableName: string;
  recordId: number;
  action:
    | "INSERT"
    | "UPDATE"
    | "DELETE"
    | "TIME_CERTIFIED"
    | "TIME_CERTIFIED_ADMIN"
    | "TIME_CORRECTION_REQUESTED"
    | "TIME_CORRECTION_APPROVED"
    | "TIME_CORRECTION_REJECTED";
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  actor: AuditActor;
}

export async function logAction(params: LogActionParams, tx?: { insert: typeof db.insert }): Promise<void> {
  const client = tx ?? db;
  await client.insert(auditLogTable).values({
    tableName: params.tableName,
    recordId: params.recordId,
    action: params.action,
    oldValues: params.oldValues ?? null,
    newValues: params.newValues ?? null,
    actorId: params.actor.id,
    actorEmail: params.actor.email,
    actorRole: params.actor.role,
    ipAddress: params.actor.ip,
  });
}

export function actorFromUser(user: SafeUser | null, ip: string | null): AuditActor {
  return {
    id: user?.id ?? null,
    // EPOCH users have username rather than email — use whichever is present
    email: user?.email ?? user?.username ?? null,
    role: user?.role ?? null,
    ip,
  };
}

// ---------------------------------------------------------------------------
// Audit trail reader
// ---------------------------------------------------------------------------

export interface AuditEvent {
  id: string;
  eventType: string;
  eventTypeLabel: string;
  actorEmail: string | null;
  actorRole: string | null;
  occurredAt: Date;
  details: Record<string, unknown>;
  punchSnapshot?: Record<string, unknown> | null;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  INSERT: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  TIME_CERTIFIED: "Certified (Employee)",
  TIME_CERTIFIED_ADMIN: "Certified (Admin Override)",
  TIME_CORRECTION_REQUESTED: "Correction Requested",
  TIME_CORRECTION_APPROVED: "Correction Approved",
  TIME_CORRECTION_REJECTED: "Correction Rejected",
  TIME_TIMESHEET_STATUS_CHANGED: "Status Changed",
  TIME_CORRECTION_STATUS_INTERMEDIATE: "Correction Status Intermediate",
};

function deriveEventLabel(action: string, newValues: Record<string, unknown> | null): string {
  if (action === "UPDATE" && newValues) {
    if (newValues.status === "submitted") return "Submitted";
    if (newValues.status === "certified") return "Certified";
    if (newValues.status === "locked") return "Locked";
    if (newValues.status === "draft") return "Returned to Draft";
    if (newValues.status === "correction_requested") return "Correction Requested";
    if (newValues.status === "correction_approved") return "Correction Approved";
  }
  return EVENT_TYPE_LABELS[action] ?? action;
}

/**
 * Return the complete audit timeline for a single timesheet.
 * Merges:
 *  1. audit_log rows for the timesheet row itself (table_name='timesheets', record_id=timesheetId)
 *  2. audit_log rows for all timesheet_corrections that belong to this timesheet
 *  3. Directly-read timesheet_corrections table rows (request + review events) so the timeline
 *     is complete even when audit_log rows are missing or were not written.
 * All events are normalized into AuditEvent and sorted ascending by occurredAt.
 */
export async function getTimesheetAuditTrail(timesheetId: number): Promise<AuditEvent[]> {
  // 1. Fetch direct timesheet audit log entries
  const directLogs = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.tableName, "timesheets"),
        eq(auditLogTable.recordId, timesheetId)
      )
    )
    .orderBy(asc(auditLogTable.createdAt));

  // 2. Fetch all corrections for this timesheet (full rows for direct normalization)
  const corrections = await db
    .select()
    .from(timesheetCorrectionsTable)
    .where(eq(timesheetCorrectionsTable.timesheetId, timesheetId))
    .orderBy(asc(timesheetCorrectionsTable.requestedAt));

  const correctionIds = corrections.map(c => c.id);

  // 3. Fetch audit_log rows for those corrections (supplement the correction table data)
  let correctionLogs: typeof directLogs = [];
  if (correctionIds.length > 0) {
    correctionLogs = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.tableName, "timesheet_corrections"),
          inArray(auditLogTable.recordId, correctionIds)
        )
      )
      .orderBy(asc(auditLogTable.createdAt));
  }

  // 4. Normalize audit_log rows
  const seenLogIds = new Set<number>();
  const logEvents: AuditEvent[] = [];

  for (const log of [...directLogs, ...correctionLogs]) {
    if (seenLogIds.has(log.id)) continue;
    seenLogIds.add(log.id);

    const newValues = (log.newValues ?? null) as Record<string, unknown> | null;
    const oldValues = (log.oldValues ?? null) as Record<string, unknown> | null;

    let punchSnapshot: Record<string, unknown> | null = null;
    if (
      (log.action === "TIME_CERTIFIED" || log.action === "TIME_CERTIFIED_ADMIN") &&
      newValues?.linesSnapshot
    ) {
      punchSnapshot = newValues.linesSnapshot as Record<string, unknown>;
    }

    const details: Record<string, unknown> = {};
    if (newValues?.status) details.status = newValues.status;
    if (newValues?.correctionId) details.correctionId = newValues.correctionId;
    if (newValues?.reason) details.reason = newValues.reason;
    if (newValues?.reviewerNote) details.reviewerNote = newValues.reviewerNote;
    if (newValues?.certificationStatement) details.certificationStatement = newValues.certificationStatement;
    if (newValues?.certificationVersion) details.certificationVersion = newValues.certificationVersion;
    if (newValues?.adminOverride) details.adminOverride = newValues.adminOverride;
    if (newValues?.overrideReason) details.overrideReason = newValues.overrideReason;
    if (newValues?.correctionMode) details.correctionMode = newValues.correctionMode;
    if (newValues?.correctionStatus) details.correctionStatus = newValues.correctionStatus;
    if (newValues?.timesheetStatus) details.timesheetStatus = newValues.timesheetStatus;
    if (oldValues?.status) details.previousStatus = oldValues.status;
    if (oldValues?.timesheetStatus) details.previousStatus = oldValues.timesheetStatus;

    logEvents.push({
      id: `log-${log.id}`,
      eventType: log.action,
      eventTypeLabel: deriveEventLabel(log.action, newValues),
      actorEmail: log.actorEmail,
      actorRole: log.actorRole,
      occurredAt: new Date(log.createdAt),
      details,
      punchSnapshot,
    });
  }

  // 5. Normalize correction table rows directly — ensures events exist even when audit_log is sparse
  const correctionRowEvents: AuditEvent[] = [];

  for (const c of corrections) {
    // Synthesize a Correction Requested event from the row itself
    // Only add if there's no existing audit_log entry for this correction + REQUEST action
    const hasRequestLog = correctionLogs.some(
      l => l.recordId === c.id && (
        l.action === "TIME_CORRECTION_REQUESTED" ||
        l.action === "INSERT"
      )
    );
    if (!hasRequestLog) {
      correctionRowEvents.push({
        id: `correction-req-${c.id}`,
        eventType: "TIME_CORRECTION_REQUESTED",
        eventTypeLabel: "Correction Requested",
        actorEmail: null,
        actorRole: null,
        occurredAt: new Date(c.requestedAt),
        details: {
          correctionId: c.id,
          reason: c.reason,
          mode: (c.proposedChanges as Record<string, unknown> | null)?.mode ?? "reopen",
        },
      });
    }

    // Synthesize a review event (approve/reject) from the row itself when reviewed
    if (c.reviewedAt && c.status !== "pending") {
      const reviewAction =
        c.status === "approved" ? "TIME_CORRECTION_APPROVED" : "TIME_CORRECTION_REJECTED";
      const hasReviewLog = correctionLogs.some(
        l => l.recordId === c.id && l.action === reviewAction
      );
      if (!hasReviewLog) {
        correctionRowEvents.push({
          id: `correction-review-${c.id}`,
          eventType: reviewAction,
          eventTypeLabel:
            c.status === "approved" ? "Correction Approved" : "Correction Rejected",
          actorEmail: null,
          actorRole: null,
          occurredAt: new Date(c.reviewedAt),
          details: {
            correctionId: c.id,
            correctionStatus: c.status,
            reviewerNote: c.reviewerNote ?? undefined,
          },
        });
      }
    }
  }

  // 6. Merge all event sources and sort ascending
  const allEvents = [...logEvents, ...correctionRowEvents];
  allEvents.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  return allEvents;
}
