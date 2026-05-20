import { pool } from "../../../db";
import { notificationManager } from "../notificationManager";

type ApprovalKind = "pto" | "salaried" | "hourly";

type SupervisorRecipient = {
  supervisorEmployeeId: number;
  supervisorName: string | null;
  userId: number | null;
  username: string | null;
  email: string | null;
};

type InboxRecipient = {
  userId: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

type PTORequestNotificationRow = {
  id: number;
  employee_id: number;
  employee_name: string | null;
  employee_user_id: number | null;
  employee_username: string | null;
  start_date: string;
  end_date: string;
  request_unit: string | null;
  requested_hours: number | null;
  employee_note: string | null;
  supervisor_id: number | null;
  status: string;
};

type PunchCorrectionNotificationRow = {
  id: number;
  employee_id: number;
  employee_name: string | null;
  punch_ledger_id: number | null;
  request_type: string;
  source: string;
  status: string;
  reason: string;
  proposed_changes: unknown;
  supervisor_id: number | null;
};

async function findSupervisorRecipient(supervisorEmployeeId: number): Promise<SupervisorRecipient | null> {
  const { rows } = await pool.query<SupervisorRecipient>(
    `
      SELECT e.id AS "supervisorEmployeeId",
             e.name AS "supervisorName",
             u.id AS "userId",
             u.username,
             COALESCE(u.email, e.email) AS email
      FROM employees e
      LEFT JOIN users u ON u.is_active = true
        AND (
          u.employee_id = e.id
          OR LOWER(u.username) = LOWER(e.employee_code)
          OR (u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email))
        )
      WHERE e.id = $1
      ORDER BY
        CASE
          WHEN u.employee_id = e.id THEN 0
          WHEN LOWER(u.username) = LOWER(e.employee_code) THEN 1
          WHEN u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email) THEN 2
          ELSE 3
        END,
        u.id ASC
      LIMIT 1
    `,
    [supervisorEmployeeId],
  );
  return rows[0] ?? null;
}

async function insertCommunicationBoardNotification(params: {
  kind: ApprovalKind;
  supervisor: SupervisorRecipient;
  subject: string;
  message: string;
  referenceId: number;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO communication_logs (
        customer_id,
        order_id,
        message_type,
        type,
        method,
        direction,
        sender,
        recipient,
        subject,
        message,
        status,
        is_read,
        received_at,
        triggered_by
      )
      VALUES (
        'INTERNAL',
        $1,
        'notification',
        $2,
        'email',
        'inbound',
        'EPOCH Timekeeping',
        $3,
        $4,
        $5,
        'received',
        false,
        NOW(),
        'timekeeping_approval'
      )
    `,
    [
      `${params.kind}:${params.referenceId}`,
      `timekeeping-${params.kind}-approval`,
      params.supervisor.email || params.supervisor.username || params.supervisor.supervisorName || `employee:${params.supervisor.supervisorEmployeeId}`,
      params.subject,
      params.message,
    ],
  );
}

function displayName(recipient: InboxRecipient): string {
  const fullName = [recipient.firstName, recipient.lastName].filter(Boolean).join(" ").trim();
  return fullName || recipient.username;
}

async function insertInternalInboxMessage(params: {
  recipient: InboxRecipient;
  subject: string;
  message: string;
  isUrgent?: boolean;
}): Promise<void> {
  const existing = await pool.query<{ id: number }>(
    `
      SELECT im.id
      FROM internal_messages im
      JOIN message_recipients mr ON mr.message_id = im.id
      WHERE mr.user_id = $1
        AND im.subject = $2
      LIMIT 1
    `,
    [params.recipient.userId, params.subject],
  );
  if (existing.rows[0]) return;

  const { rows } = await pool.query<{ id: number }>(
    `
      INSERT INTO internal_messages (
        subject,
        message,
        sender_id,
        sender_name,
        recipient_type,
        recipient_user_id,
        recipient_name,
        is_urgent
      )
      VALUES ($1, $2, NULL, 'EPOCH Timekeeping', 'person', $3, $4, $5)
      RETURNING id
    `,
    [
      params.subject,
      params.message,
      params.recipient.userId,
      displayName(params.recipient),
      params.isUrgent ?? false,
    ],
  );

  const messageId = rows[0]?.id;
  if (!messageId) return;

  await pool.query(
    `
      INSERT INTO message_recipients (
        message_id,
        user_id,
        is_read,
        is_accomplished
      )
      VALUES ($1, $2, false, false)
    `,
    [messageId, params.recipient.userId],
  );
}

async function resolveEmployeeIdForUser(userId: number): Promise<number | null> {
  const { rows } = await pool.query<{ employee_id: number | null }>(
    `
      SELECT COALESCE(u.employee_id, e.id) AS employee_id
      FROM users u
      LEFT JOIN employees e ON (
        LOWER(e.employee_code) = LOWER(u.username)
        OR (u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(e.email) = LOWER(u.email))
      )
      WHERE u.id = $1
        AND u.is_active = true
      ORDER BY
        CASE
          WHEN u.employee_id IS NOT NULL THEN 0
          WHEN LOWER(e.employee_code) = LOWER(u.username) THEN 1
          WHEN u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(e.email) = LOWER(u.email) THEN 2
          ELSE 3
        END,
        e.id ASC
      LIMIT 1
    `,
    [userId],
  );

  return rows[0]?.employee_id ?? null;
}

export async function ensurePendingPTOApprovalNotificationsForUser(userId: number): Promise<void> {
  const supervisorEmployeeId = await resolveEmployeeIdForUser(userId);
  if (!supervisorEmployeeId) return;

  const { rows } = await pool.query<{ id: number }>(
    `
      SELECT id
      FROM timekeeping.time_off_requests
      WHERE status IN ('pending_supervisor', 'pending')
        AND supervisor_id = $1
      ORDER BY created_at ASC
      LIMIT 50
    `,
    [supervisorEmployeeId],
  );

  for (const row of rows) {
    await notifyPTOApprovalNeeded(row.id);
  }
}

async function findUserByEmployeeId(employeeId: number | null | undefined): Promise<InboxRecipient | null> {
  if (!employeeId) return null;

  const { rows } = await pool.query<InboxRecipient>(
    `
      SELECT u.id AS "userId",
             u.username,
             u.first_name AS "firstName",
             u.last_name AS "lastName",
             u.email
      FROM employees e
      JOIN users u ON u.is_active = true
        AND (
          u.employee_id = e.id
          OR LOWER(u.username) = LOWER(e.employee_code)
          OR (u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email))
        )
      WHERE e.id = $1
      ORDER BY
        CASE
          WHEN u.employee_id = e.id THEN 0
          WHEN LOWER(u.username) = LOWER(e.employee_code) THEN 1
          WHEN u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email) THEN 2
          ELSE 3
        END,
        u.id ASC
      LIMIT 1
    `,
    [employeeId],
  );

  return rows[0] ?? null;
}

async function findHrAdminRecipients(): Promise<InboxRecipient[]> {
  const { rows } = await pool.query<InboxRecipient>(
    `
      SELECT id AS "userId",
             username,
             first_name AS "firstName",
             last_name AS "lastName",
             email
      FROM users
      WHERE is_active = true
        AND upper(role) IN ('HR', 'ADMIN', 'OWNER')
      ORDER BY
        CASE upper(role)
          WHEN 'HR' THEN 0
          WHEN 'ADMIN' THEN 1
          WHEN 'OWNER' THEN 2
          ELSE 3
        END,
        id ASC
      LIMIT 10
    `,
  );

  return rows;
}

async function getPTORequestNotificationRow(requestId: number): Promise<PTORequestNotificationRow | null> {
  const { rows } = await pool.query<PTORequestNotificationRow>(
    `
      SELECT r.id,
             r.employee_id,
             e.name AS employee_name,
             eu.id AS employee_user_id,
             eu.username AS employee_username,
             r.start_date,
             r.end_date,
             r.request_unit,
             r.requested_hours,
             r.employee_note,
             r.supervisor_id,
             r.status
      FROM timekeeping.time_off_requests r
      LEFT JOIN employees e ON e.id = r.employee_id
      LEFT JOIN users eu ON eu.employee_id = r.employee_id AND eu.is_active = true
      WHERE r.id = $1
      LIMIT 1
    `,
    [requestId],
  );

  return rows[0] ?? null;
}

function formatPTORequestSummary(row: PTORequestNotificationRow): string {
  const hours = row.requested_hours ? `\nRequested hours: ${row.requested_hours}` : "";
  const note = row.employee_note ? `\nEmployee note: ${row.employee_note}` : "";
  return [
    `Employee: ${row.employee_name || `Employee #${row.employee_id}`}`,
    `Dates: ${row.start_date} to ${row.end_date}`,
    `Request unit: ${row.request_unit || "full_day"}${hours}`,
    note.trim(),
  ].filter(Boolean).join("\n");
}

async function getPunchCorrectionNotificationRow(requestId: number): Promise<PunchCorrectionNotificationRow | null> {
  const { rows } = await pool.query<PunchCorrectionNotificationRow>(
    `
      SELECT r.id,
             r.employee_id,
             e.name AS employee_name,
             r.punch_ledger_id,
             r.request_type,
             r.source,
             r.status,
             r.reason,
             r.proposed_changes,
             r.supervisor_id
      FROM timekeeping.punch_correction_requests r
      LEFT JOIN employees e ON e.id = r.employee_id
      WHERE r.id = $1
      LIMIT 1
    `,
    [requestId],
  );

  return rows[0] ?? null;
}

function formatPunchCorrectionSummary(row: PunchCorrectionNotificationRow): string {
  return [
    `Employee: ${row.employee_name || `Employee #${row.employee_id}`}`,
    `Request type: ${row.request_type.replace(/_/g, " ")}`,
    row.punch_ledger_id ? `Punch/session: #${row.punch_ledger_id}` : "Punch/session: new or missing punch",
    `Source: ${row.source.replace(/_/g, " ")}`,
    `Reason: ${row.reason}`,
    `Requested changes: ${JSON.stringify(row.proposed_changes, null, 2)}`,
  ].join("\n");
}

async function notifySupervisor(params: {
  supervisorEmployeeId: number | null | undefined;
  kind: ApprovalKind;
  referenceId: number;
  subject: string;
  message: string;
  url: string;
}): Promise<void> {
  if (!params.supervisorEmployeeId) return;

  try {
    const supervisor = await findSupervisorRecipient(params.supervisorEmployeeId);
    if (!supervisor) return;

    await insertCommunicationBoardNotification({
      kind: params.kind,
      supervisor,
      subject: params.subject,
      message: `${params.message}\n\nOpen: ${params.url}`,
      referenceId: params.referenceId,
    });

    if (supervisor.userId) {
      notificationManager.sendToUser(supervisor.userId, {
        type: "timekeeping_approval_required",
        title: params.subject,
        message: params.message,
        timestamp: new Date().toISOString(),
        data: {
          kind: params.kind,
          referenceId: params.referenceId,
          url: params.url,
        },
      });
    }
  } catch (err: any) {
    console.warn("[timekeeping approvals] notification failed:", err?.message ?? err);
  }
}

export async function notifyPTOApprovalNeeded(requestId: number): Promise<void> {
  const row = await getPTORequestNotificationRow(requestId);
  if (!row) return;

  if (!["pending_supervisor", "pending"].includes(row.status)) {
    return;
  }

  await notifySupervisor({
    supervisorEmployeeId: row.supervisor_id,
    kind: "pto",
    referenceId: row.id,
    subject: "PTO request needs supervisor review",
    message: `${row.employee_name || "An employee"} requested PTO from ${row.start_date} to ${row.end_date}.`,
    url: "/pto-command-center",
  });

  const supervisorUser = await findUserByEmployeeId(row.supervisor_id);
  if (supervisorUser) {
    await insertInternalInboxMessage({
      recipient: supervisorUser,
      subject: `PTO request #${row.id} needs supervisor approval`,
      message: `${formatPTORequestSummary(row)}\n\nStatus: pending supervisor approval\nReview: /pto-command-center?requestId=${row.id}`,
      isUrgent: false,
    });
    return;
  }

  await notifyPTOHrAdminNeeded(requestId, "No active user account is linked to the assigned supervisor.");
}

export async function notifyPTOHrAdminNeeded(requestId: number, reason?: string): Promise<void> {
  const row = await getPTORequestNotificationRow(requestId);
  if (!row) return;

  const recipients = await findHrAdminRecipients();
  if (recipients.length === 0) return;

  const suffix = reason ? `\nRouting note: ${reason}` : "";
  await Promise.all(
    recipients.map((recipient) =>
      insertInternalInboxMessage({
        recipient,
        subject: `PTO request #${row.id} needs HR/Admin review`,
        message: `${formatPTORequestSummary(row)}\n\nStatus: ${row.status}${suffix}\nReview: /pto-command-center?requestId=${row.id}`,
        isUrgent: !row.supervisor_id,
      }),
    ),
  );
}

export async function notifyPTOEmployeeStatus(requestId: number, subject: string, statusMessage: string): Promise<void> {
  const row = await getPTORequestNotificationRow(requestId);
  if (!row) return;

  const employeeUser = await findUserByEmployeeId(row.employee_id);
  if (!employeeUser) return;

  await insertInternalInboxMessage({
    recipient: employeeUser,
    subject,
    message: `${statusMessage}\n\n${formatPTORequestSummary(row)}\n\nCurrent status: ${row.status}`,
    isUrgent: false,
  });
}

export async function notifyPunchCorrectionApprovalNeeded(requestId: number): Promise<void> {
  const row = await getPunchCorrectionNotificationRow(requestId);
  if (!row || row.status !== "pending_supervisor") return;

  const supervisorUser = await findUserByEmployeeId(row.supervisor_id);
  if (supervisorUser) {
    await insertInternalInboxMessage({
      recipient: supervisorUser,
      subject: `Time punch correction #${row.id} needs supervisor approval`,
      message: `${formatPunchCorrectionSummary(row)}\n\nStatus: pending supervisor approval\nReview: /time-clock-admin?tab=corrections`,
      isUrgent: false,
    });
    return;
  }

  await notifyPunchCorrectionHrAdminNeeded(requestId, "No active user account is linked to the assigned supervisor.");
}

export async function notifyPunchCorrectionHrAdminNeeded(requestId: number, reason?: string): Promise<void> {
  const row = await getPunchCorrectionNotificationRow(requestId);
  if (!row) return;

  const recipients = await findHrAdminRecipients();
  if (recipients.length === 0) return;

  const suffix = reason ? `\nRouting note: ${reason}` : "";
  await Promise.all(
    recipients.map((recipient) =>
      insertInternalInboxMessage({
        recipient,
        subject: `Time punch correction #${row.id} needs HR/Admin approval`,
        message: `${formatPunchCorrectionSummary(row)}\n\nStatus: ${row.status}${suffix}\nReview: /time-clock-admin?tab=corrections`,
        isUrgent: !row.supervisor_id,
      }),
    ),
  );
}

export async function notifyPunchCorrectionEmployeeStatus(requestId: number, subject: string, statusMessage: string): Promise<void> {
  const row = await getPunchCorrectionNotificationRow(requestId);
  if (!row) return;

  const employeeUser = await findUserByEmployeeId(row.employee_id);
  if (!employeeUser) return;

  await insertInternalInboxMessage({
    recipient: employeeUser,
    subject,
    message: `${statusMessage}\n\n${formatPunchCorrectionSummary(row)}\n\nCurrent status: ${row.status}`,
    isUrgent: false,
  });
}

export async function notifySalariedTimesheetApprovalNeeded(timesheetId: number): Promise<void> {
  const { rows } = await pool.query<{
    id: number;
    employee_name: string | null;
    period_start: string;
    period_end: string;
    supervisor_employee_id: number | null;
  }>(
    `
      SELECT st.id,
             e.name AS employee_name,
             st.period_start,
             st.period_end,
             COALESCE(st.supervisor_employee_id, e.supervisor_employee_id) AS supervisor_employee_id
      FROM timekeeping.salaried_timesheets st
      JOIN employees e ON e.id = st.employee_id
      WHERE st.id = $1 AND st.status = 'SUBMITTED'
      LIMIT 1
    `,
    [timesheetId],
  );
  const row = rows[0];
  if (!row) return;

  await notifySupervisor({
    supervisorEmployeeId: row.supervisor_employee_id,
    kind: "salaried",
    referenceId: row.id,
    subject: "Salaried timesheet needs supervisor review",
    message: `${row.employee_name || "An employee"} submitted a salaried timesheet for ${row.period_start} to ${row.period_end}.`,
    url: "/time-clock-admin?tab=timesheets",
  });
}

export async function notifyHourlyTimesheetApprovalNeeded(timesheetId: number): Promise<void> {
  const { rows } = await pool.query<{
    id: number;
    employee_name: string | null;
    period_start: string;
    period_end: string;
    supervisor_employee_id: number | null;
  }>(
    `
      SELECT t.id,
             e.name AS employee_name,
             t.period_start,
             t.period_end,
             e.supervisor_employee_id
      FROM timekeeping.timesheets t
      JOIN employees e ON e.id = t.employee_id
      WHERE t.id = $1 AND t.status = 'submitted'
      LIMIT 1
    `,
    [timesheetId],
  );
  const row = rows[0];
  if (!row) return;

  await notifySupervisor({
    supervisorEmployeeId: row.supervisor_employee_id,
    kind: "hourly",
    referenceId: row.id,
    subject: "Hourly timesheet needs supervisor review",
    message: `${row.employee_name || "An employee"} submitted an hourly timesheet for ${row.period_start} to ${row.period_end}.`,
    url: "/time-clock-admin?tab=timesheets",
  });
}
