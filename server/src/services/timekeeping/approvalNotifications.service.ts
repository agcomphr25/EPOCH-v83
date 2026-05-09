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

async function findSupervisorRecipient(supervisorEmployeeId: number): Promise<SupervisorRecipient | null> {
  const { rows } = await pool.query<SupervisorRecipient>(
    `
      SELECT e.id AS "supervisorEmployeeId",
             e.name AS "supervisorName",
             u.id AS "userId",
             u.username,
             COALESCE(u.email, e.email) AS email
      FROM employees e
      LEFT JOIN users u ON u.employee_id = e.id AND u.is_active = true
      WHERE e.id = $1
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
  const { rows } = await pool.query<{
    id: number;
    employee_name: string | null;
    start_date: string;
    end_date: string;
    supervisor_id: number | null;
  }>(
    `
      SELECT r.id, e.name AS employee_name, r.start_date, r.end_date, r.supervisor_id
      FROM timekeeping.time_off_requests r
      LEFT JOIN employees e ON e.id = r.employee_id
      WHERE r.id = $1 AND r.status IN ('pending_supervisor', 'pending')
      LIMIT 1
    `,
    [requestId],
  );
  const row = rows[0];
  if (!row) return;

  await notifySupervisor({
    supervisorEmployeeId: row.supervisor_id,
    kind: "pto",
    referenceId: row.id,
    subject: "PTO request needs supervisor review",
    message: `${row.employee_name || "An employee"} requested PTO from ${row.start_date} to ${row.end_date}.`,
    url: "/pto-command-center",
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
