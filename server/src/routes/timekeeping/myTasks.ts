import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { authenticateToken } from "../../../middleware/auth";
import { pool } from "../../../db";
import { getPayrollReviewBatch } from "../../services/timekeeping/dashboard.service";
import { getAdminReviewQueue } from "../../services/timekeeping/salariedTimesheet.service";

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/myTasks]", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: err?.message ?? "Internal server error" });
  });
}

const router: IRouter = Router();

const INCOMPLETE_HOURLY_ISSUES = new Set([
  "missing_punch",
  "pending_correction",
  "unapproved_labor",
  "missing_timesheet",
]);

let forkliftTablesEnsured = false;
async function ensureForkliftTaskTables() {
  if (forkliftTablesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forklift_written_attempts (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      test_type TEXT NOT NULL DEFAULT 'initial',
      score INTEGER NOT NULL,
      passed BOOLEAN NOT NULL DEFAULT false,
      question_order JSONB NOT NULL DEFAULT '[]'::jsonb,
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      submitted_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS forklift_operator_evaluations (
      id SERIAL PRIMARY KEY,
      written_attempt_id INTEGER REFERENCES forklift_written_attempts(id),
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      evaluator_employee_id INTEGER NOT NULL REFERENCES employees(id),
      test_type TEXT NOT NULL DEFAULT 'initial',
      status TEXT NOT NULL DEFAULT 'pending_evaluation',
      practical_result TEXT,
      evaluator_notes TEXT,
      certified_at TIMESTAMP,
      agc_refresher_due_at TIMESTAMP,
      osha_evaluation_due_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS forklift_evaluation_items (
      id SERIAL PRIMARY KEY,
      evaluation_id INTEGER NOT NULL REFERENCES forklift_operator_evaluations(id) ON DELETE CASCADE,
      item_key TEXT NOT NULL,
      label TEXT NOT NULL,
      required BOOLEAN NOT NULL DEFAULT true,
      result TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(evaluation_id, item_key)
    );
  `);
  forkliftTablesEnsured = true;
}

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
         OR LOWER(CONCAT(
              REGEXP_REPLACE(SPLIT_PART(TRIM(e.name), ' ', 1), '[^[:alnum:]]', '', 'g'),
              LEFT(REGEXP_REPLACE((REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'))[ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'), 1)], '[^[:alnum:]]', '', 'g'), 1)
            )) = LOWER($2)
         OR LOWER(CONCAT(
              LEFT(REGEXP_REPLACE(SPLIT_PART(TRIM(e.name), ' ', 1), '[^[:alnum:]]', '', 'g'), 1),
              REGEXP_REPLACE((REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'))[ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'), 1)], '[^[:alnum:]]', '', 'g')
            )) = LOWER($2)
      ORDER BY
        CASE
          WHEN LOWER(e.employee_code) = LOWER($2) THEN 0
          WHEN u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email) THEN 1
          WHEN LOWER(CONCAT(
                 REGEXP_REPLACE(SPLIT_PART(TRIM(e.name), ' ', 1), '[^[:alnum:]]', '', 'g'),
                 LEFT(REGEXP_REPLACE((REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'))[ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'), 1)], '[^[:alnum:]]', '', 'g'), 1)
               )) = LOWER($2) THEN 2
          WHEN LOWER(CONCAT(
                 LEFT(REGEXP_REPLACE(SPLIT_PART(TRIM(e.name), ' ', 1), '[^[:alnum:]]', '', 'g'), 1),
                 REGEXP_REPLACE((REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'))[ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'), 1)], '[^[:alnum:]]', '', 'g')
               )) = LOWER($2) THEN 3
          ELSE 4
        END,
        e.id ASC
      LIMIT 1
    `,
    [user.id ?? null, username],
  );

  return rows[0]?.employee_id ?? null;
}

router.get(
  "/my-employee-id",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    const employeeId = await resolveEmployeeIdForUser(req.user as any);
    res.json({ employeeId });
  }),
);

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

    await ensureForkliftTaskTables();

    const [pto, punchCorrections, salaried, hourly, forklift, payrollReview, salariedReviewQueue] = await Promise.all([
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
          SELECT r.id,
                 r.employee_id,
                 e.name AS employee_name,
                 r.punch_ledger_id,
                 r.request_type,
                 r.status,
                 r.reason,
                 r.submitted_at,
                 r.created_at
          FROM timekeeping.punch_correction_requests r
          JOIN employees e ON e.id = r.employee_id
          WHERE r.status = 'pending_supervisor'
            AND COALESCE(r.supervisor_id, e.supervisor_employee_id) = $1
          ORDER BY COALESCE(r.submitted_at, r.created_at) ASC
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
      pool.query(
        `
          SELECT ev.id,
                 ev.employee_id,
                 e.name AS employee_name,
                 ev.test_type,
                 ev.created_at,
                 wa.score AS written_score,
                 wa.submitted_at AS written_submitted_at
          FROM forklift_operator_evaluations ev
          JOIN employees e ON e.id = ev.employee_id
          LEFT JOIN forklift_written_attempts wa ON wa.id = ev.written_attempt_id
          WHERE ev.status = 'pending_evaluation'
            AND ev.evaluator_employee_id = $1
          ORDER BY ev.created_at ASC
        `,
        [employeeId],
      ),
      getPayrollReviewBatch(),
      getAdminReviewQueue(),
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

    const needsReviewSalariedIds = new Set(
      salariedReviewQueue
        .filter((row) => row.needsReviewDraftCount > 0)
        .map((row) => row.timesheet.id),
    );

    const salariedTasks = salaried.rows
      .filter((r: any) => !needsReviewSalariedIds.has(Number(r.id)))
      .map((r: any) => ({
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

    const subordinateRows = await pool.query<{ id: number }>(
      `SELECT id FROM employees WHERE supervisor_employee_id = $1`,
      [employeeId],
    );
    const subordinateEpochIds = new Set(subordinateRows.rows.map((row) => Number(row.id)));
    const incompleteHourlyRows = payrollReview.hourly
      .filter((row) => subordinateEpochIds.has(row.employeeId))
      .filter((row) => row.issues.some((issue) => INCOMPLETE_HOURLY_ISSUES.has(issue.code)));
    const incompleteHourlyTimesheetIds = new Set(
      incompleteHourlyRows.map((row) => row.timesheetId).filter((id): id is number => id != null),
    );

    const hourlyTasks = hourly.rows
      .filter((r: any) => !incompleteHourlyTimesheetIds.has(Number(r.id)))
      .map((r: any) => ({
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

    const punchCorrectionTasks = punchCorrections.rows.map((r: any) => ({
      id: `punch-correction-${r.id}`,
      type: "punch_correction_approval",
      title: `Review punch edit: ${r.employee_name}`,
      description: `${String(r.request_type || "correction").replace(/_/g, " ")}${r.punch_ledger_id ? ` for punch #${r.punch_ledger_id}` : ""} - ${r.reason}`,
      employeeName: r.employee_name,
      employeeNote: r.reason,
      createdAt: r.submitted_at ?? r.created_at,
      priority: "normal",
      actionUrl: "/time-clock-admin?tab=corrections",
      sourceId: r.id,
      requestType: r.request_type,
    }));

    const blockedHourlyTasks = incompleteHourlyRows.map((row) => ({
        id: `hourly-blocked-${row.employeeId}-${row.timesheetId ?? "missing"}`,
        type: "hourly_timesheet_blocked",
        title: `Blocked hourly timesheet: ${row.employeeName}`,
        description: `${payrollReview.periodStart} to ${payrollReview.periodEnd} - ${row.issues.map((issue) => issue.label).join(", ")}`,
        employeeName: row.employeeName,
        createdAt: payrollReview.generatedAt,
        priority: "overdue",
        actionUrl: "/time-clock-admin?tab=payroll",
        sourceId: row.timesheetId ?? row.employeeId,
      }));

    const missingSalariedTasks = payrollReview.salaried
      .filter((row) => subordinateEpochIds.has(row.employeeId))
      .filter((row) => row.issues.some((issue) => issue.code === "missing_salaried_timesheet"))
      .filter((row) => row.status !== "SUBMITTED")
      .map((row) => ({
        id: `salaried-blocked-${row.employeeId}-${row.timesheetId ?? "missing"}`,
        type: "salaried_timesheet_blocked",
        title: `Blocked salaried timesheet: ${row.employeeName}`,
        description: `${payrollReview.periodStart} to ${payrollReview.periodEnd} - ${row.issues.map((issue) => issue.label).join(", ")}`,
        employeeName: row.employeeName,
        createdAt: payrollReview.generatedAt,
        priority: "overdue",
        actionUrl: "/time-clock-admin?tab=payroll",
        sourceId: row.timesheetId ?? row.employeeId,
      }));

    const needsReviewSalariedTasks = salariedReviewQueue
      .filter((row) => row.needsReviewDraftCount > 0)
      .filter((row) => subordinateEpochIds.has(row.timesheet.employeeId))
      .map((row) => ({
        id: `salaried-blocked-${row.timesheet.employeeId}-${row.timesheet.id}`,
        type: "salaried_timesheet_blocked",
        title: `Blocked salaried timesheet: ${row.employeeName ?? `Employee #${row.timesheet.employeeId}`}`,
        description: `${row.timesheet.periodStart} to ${row.timesheet.periodEnd} - ${row.needsReviewDraftCount} labor draft${row.needsReviewDraftCount === 1 ? "" : "s"} need review`,
        employeeName: row.employeeName ?? `Employee #${row.timesheet.employeeId}`,
        createdAt: row.timesheet.certifiedAt ?? row.timesheet.createdAt,
        priority: "overdue",
        actionUrl: "/time-clock-admin?tab=timesheets",
        sourceId: row.timesheet.id,
      }));

    const forkliftTasks = forklift.rows.map((r: any) => ({
      id: `forklift-${r.id}`,
      type: "forklift_evaluation",
      title: `Evaluate forklift operator: ${r.employee_name}`,
      description: `Written test passed at ${Number(r.written_score ?? 0)}% - ${String(r.test_type || "initial").replace(/_/g, " ")} evaluation`,
      employeeName: r.employee_name,
      createdAt: r.created_at,
      priority: "normal",
      actionUrl: "/training/my-training",
      sourceId: r.id,
      writtenScore: r.written_score,
      testType: r.test_type,
    }));

    const tasks = [...ptoTasks, ...punchCorrectionTasks, ...salariedTasks, ...hourlyTasks, ...blockedHourlyTasks, ...missingSalariedTasks, ...needsReviewSalariedTasks, ...forkliftTasks].sort(
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
