import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { authenticateToken } from "../../../middleware/auth";
import { pool } from "../../../db";

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/myTasks]", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: err?.message ?? "Internal server error" });
  });
}

const router: IRouter = Router();

async function resolveEmployeeIdForUser(user: any): Promise<number | null> {
  if (!user) return null;
  if (user.employeeId != null) return Number(user.employeeId);

  const username = typeof user.username === "string" ? user.username.trim() : "";
  if (!username) return null;

  const { rows } = await pool.query<{ employee_id: number | null }>(
    `
      SELECT e.id AS employee_id
      FROM employees e
      LEFT JOIN users u ON u.id = $1
      WHERE LOWER(e.employee_code) = LOWER($2)
         OR (u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email))
      ORDER BY
        CASE
          WHEN LOWER(e.employee_code) = LOWER($2) THEN 0
          WHEN u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email) THEN 1
          ELSE 2
        END,
        e.id ASC
      LIMIT 1
    `,
    [user.id ?? null, username],
  );

  return rows[0]?.employee_id ?? null;
}

router.get(
  "/my-tasks/:employeeId",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    const employeeId = Number(req.params.employeeId);
    if (!employeeId) {
      res.status(400).json({ error: "Invalid employee ID" });
      return;
    }

    const user = req.user as any;
    const isElevated = user?.role === "ADMIN" || user?.role === "OWNER";
    const resolvedEmployeeId = await resolveEmployeeIdForUser(user);
    if (!isElevated && resolvedEmployeeId !== employeeId) {
      res.status(403).json({ error: "You can only view your own timekeeping tasks." });
      return;
    }

    const [pto, salaried, hourly] = await Promise.all([
      pool.query(
        `
          SELECT r.id,
                 r.employee_id,
                 e.name AS employee_name,
                 r.start_date,
                 r.end_date,
                 r.request_unit,
                 r.requested_hours,
                 r.status,
                 r.employee_note,
                 r.created_at
          FROM timekeeping.time_off_requests r
          JOIN employees e ON e.id = r.employee_id
          WHERE r.status IN ('pending_supervisor', 'pending')
            AND COALESCE(r.supervisor_id, e.supervisor_employee_id) = $1
          ORDER BY r.created_at ASC
        `,
        [employeeId],
      ),
      pool.query(
        `
          SELECT st.id,
                 st.employee_id,
                 e.name AS employee_name,
                 st.period_start,
                 st.period_end,
                 st.total_actual_hours,
                 st.created_at,
                 st.certified_at
          FROM timekeeping.salaried_timesheets st
          JOIN employees e ON e.id = st.employee_id
          WHERE st.status = 'SUBMITTED'
            AND COALESCE(st.supervisor_employee_id, e.supervisor_employee_id) = $1
          ORDER BY COALESCE(st.certified_at, st.created_at) ASC
        `,
        [employeeId],
      ),
      pool.query(
        `
          SELECT t.id,
                 t.employee_id,
                 e.name AS employee_name,
                 t.period_start,
                 t.period_end,
                 t.total_hours,
                 t.submitted_at,
                 t.created_at
          FROM timekeeping.timesheets t
          JOIN employees e ON e.id = t.employee_id
          WHERE t.status = 'submitted'
            AND e.supervisor_employee_id = $1
          ORDER BY COALESCE(t.submitted_at, t.created_at) ASC
        `,
        [employeeId],
      ),
    ]);

    const ptoTasks = pto.rows.map((r: any) => ({
      id: `pto-${r.id}`,
      type: "pto_approval",
      title: `Review PTO: ${r.employee_name}`,
      description: `${r.start_date} to ${r.end_date}${r.requested_hours ? ` (${r.requested_hours} hours)` : ""}`,
      employeeName: r.employee_name,
      startDate: r.start_date,
      endDate: r.end_date,
      requestUnit: r.request_unit,
      requestedHours: r.requested_hours,
      employeeNote: r.employee_note,
      createdAt: r.created_at,
      priority: "normal",
      actionUrl: "/pto-command-center",
      sourceId: r.id,
    }));

    const salariedTasks = salaried.rows.map((r: any) => ({
      id: `salaried-${r.id}`,
      type: "salaried_timesheet_approval",
      title: `Approve salaried timesheet: ${r.employee_name}`,
      description: `${r.period_start} to ${r.period_end} (${Number(r.total_actual_hours ?? 0).toFixed(2)} hours)`,
      employeeName: r.employee_name,
      createdAt: r.certified_at ?? r.created_at,
      priority: "normal",
      actionUrl: "/time-clock-admin?tab=timesheets",
      sourceId: r.id,
    }));

    const hourlyTasks = hourly.rows.map((r: any) => ({
      id: `hourly-${r.id}`,
      type: "hourly_timesheet_approval",
      title: `Approve hourly timesheet: ${r.employee_name}`,
      description: `${r.period_start} to ${r.period_end} (${Number(r.total_hours ?? 0).toFixed(2)} hours)`,
      employeeName: r.employee_name,
      createdAt: r.submitted_at ?? r.created_at,
      priority: "normal",
      actionUrl: "/time-clock-admin?tab=timesheets",
      sourceId: r.id,
    }));

    const tasks = [...ptoTasks, ...salariedTasks, ...hourlyTasks].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    res.json({
      tasks,
      stats: {
        total: tasks.length,
        pending: tasks.length,
        completed: 0,
        overdue: 0,
      },
    });
  }),
);

export default router;
