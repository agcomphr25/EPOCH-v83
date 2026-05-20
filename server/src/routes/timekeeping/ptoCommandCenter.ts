import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { authenticateToken } from "../../../middleware/auth";
import { requirePermission } from "../../../middleware/requirePermission";
import { pool } from "../../../db";
import { db } from "../../../db";
import { auditLogTable } from "../../schema/timekeeping";
import { and, inArray, desc, gte, lte, eq, like } from "drizzle-orm";
import { getPayPeriodDates } from "../../services/payPeriod";
import { getUserPermissions } from "../../services/permissionService";

async function getCallerCapabilities(req: Request): Promise<{ isAdmin: boolean; caps: Set<string> }> {
  const user = req.user as any;
  if (!user) return { isAdmin: false, caps: new Set() };
  const role = user.role?.toUpperCase?.() ?? "";
  if (role === "ADMIN" || role === "OWNER") return { isAdmin: true, caps: new Set() };
  const { permissionSet } = await getUserPermissions(user.id, role);
  return { isAdmin: false, caps: permissionSet };
}

async function resolveCallerEmployeeId(req: Request): Promise<number | null> {
  const user = req.user as any;
  if (!user) return null;
  if (user.employeeId != null) return user.employeeId;

  const username = String(user.username ?? "").trim();
  if (!username) return null;

  const { rows } = await pool.query<{ id: number }>(
    `
      SELECT e.id
      FROM employees e
      WHERE LOWER(e.employee_code) = LOWER($1)
      LIMIT 1
    `,
    [username]
  );
  return rows[0]?.id ?? null;
}

function getVisibleStages(isAdmin: boolean, caps: Set<string>): string[] {
  if (isAdmin) return ["pending_supervisor", "pending_hr", "pending_vp", "pending"];
  const stages: string[] = [];
  if (caps.has("timekeeping.pto.approve_supervisor")) { stages.push("pending_supervisor", "pending"); }
  if (caps.has("timekeeping.pto.approve_hr")) { stages.push("pending_hr"); }
  if (caps.has("timekeeping.pto.approve_vp")) { stages.push("pending_vp"); }
  if (caps.has("timekeeping.pto.view_all")) {
    for (const s of ["pending_supervisor", "pending_hr", "pending_vp", "pending"]) {
      if (!stages.includes(s)) stages.push(s);
    }
  }
  return stages;
}

const requirePTOCommandCenterAccess: RequestHandler = async (req, res, next) => {
  try {
    const { isAdmin, caps } = await getCallerCapabilities(req);
    if (
      isAdmin ||
      caps.has("timekeeping.pto.view_all") ||
      caps.has("timekeeping.pto.approve_supervisor") ||
      caps.has("timekeeping.pto.approve_hr") ||
      caps.has("timekeeping.pto.approve_vp")
    ) {
      next();
      return;
    }
    res.status(403).json({ error: "Missing PTO command center access capability" });
  } catch (err) {
    next(err);
  }
};

function isSchemaNotFound(err: any): boolean {
  const msg = err?.message ?? "";
  return msg.includes("does not exist") && (msg.includes("timekeeping") || msg.includes("relation"));
}

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    if (isSchemaNotFound(err)) {
      console.warn("[pto-command-center] timekeeping schema not available — returning empty data");
      if (!res.headersSent) {
        res.json({ _schemaUnavailable: true });
      }
      return;
    }
    console.error("[pto-command-center]", err?.message ?? err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  });
}

const STAGE_THRESHOLDS: Record<string, { hours: number; label: string }> = {
  pending_supervisor: { hours: 16, label: "Supervisor >2 business days" },
  pending: { hours: 16, label: "Supervisor >2 business days" },
  pending_hr: { hours: 8, label: "HR >1 business day" },
  pending_vp: { hours: 8, label: "VP >1 business day" },
};

function getStuckThresholdHours(status: string): number {
  return STAGE_THRESHOLDS[status]?.hours ?? 48;
}

function countBusinessHours(fromDate: Date, toDate: Date): number {
  let hours = 0;
  const cursor = new Date(fromDate);
  while (cursor < toDate) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const remaining = (toDate.getTime() - cursor.getTime()) / (1000 * 60 * 60);
      if (remaining >= 8) {
        hours += 8;
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(fromDate.getHours(), fromDate.getMinutes(), 0, 0);
      } else {
        hours += remaining;
        break;
      }
    } else {
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return hours;
}

const router: IRouter = Router();

router.get(
  "/pto-command-center/summary",
  authenticateToken,
  requirePTOCommandCenterAccess,
  h(async (req, res): Promise<void> => {
    const { isAdmin, caps } = await getCallerCapabilities(req);
    const callerCaps = isAdmin
      ? ["timekeeping.pto.approve_supervisor", "timekeeping.pto.approve_hr", "timekeeping.pto.approve_vp", "timekeeping.pto.view_all"]
      : Array.from(caps).filter((c: string) => c.startsWith("timekeeping.pto."));

    const today = new Date().toISOString().slice(0, 10);
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const in7DaysStr = in7Days.toISOString().slice(0, 10);
    const in14Days = new Date();
    in14Days.setDate(in14Days.getDate() + 14);
    const in14DaysStr = in14Days.toISOString().slice(0, 10);

    const { rows } = await pool.query(`
      WITH status_counts AS (
        SELECT
          COUNT(*) FILTER (WHERE status IN ('pending_supervisor','pending_hr','pending_vp','pending')) AS total_pending,
          COUNT(*) FILTER (WHERE status = 'pending_supervisor') AS pending_supervisor,
          COUNT(*) FILTER (WHERE status = 'pending_hr') AS pending_hr,
          COUNT(*) FILTER (WHERE status = 'pending_vp') AS pending_vp,
          COUNT(*) FILTER (WHERE status = 'approved' AND updated_at >= NOW() - INTERVAL '14 days') AS approved_this_period,
          COUNT(*) FILTER (WHERE status IN ('rejected','denied','cancelled')) AS denied_cancelled,
          COUNT(*) FILTER (WHERE status = 'approved' AND start_date <= $1 AND end_date >= $1) AS on_pto_today,
          COUNT(*) FILTER (WHERE status = 'approved' AND start_date <= $2 AND end_date >= $1 AND start_date > $1) AS upcoming_7_days,
          COUNT(*) FILTER (WHERE status = 'approved' AND start_date <= $3 AND end_date >= $1 AND start_date > $1) AS upcoming_14_days
        FROM timekeeping.time_off_requests
      )
      SELECT * FROM status_counts
    `, [today, in7DaysStr, in14DaysStr]);

    const summary = rows[0] || {};
    res.json({
      totalPending: Number(summary.total_pending || 0),
      pendingSupervisor: Number(summary.pending_supervisor || 0),
      pendingHr: Number(summary.pending_hr || 0),
      pendingVp: Number(summary.pending_vp || 0),
      approvedThisPeriod: Number(summary.approved_this_period || 0),
      deniedCancelled: Number(summary.denied_cancelled || 0),
      onPtoToday: Number(summary.on_pto_today || 0),
      upcoming7Days: Number(summary.upcoming_7_days || 0),
      upcoming14Days: Number(summary.upcoming_14_days || 0),
      callerCapabilities: callerCaps,
      isAdmin,
    });
  })
);

router.get(
  "/pto-command-center/pipeline",
  authenticateToken,
  requirePTOCommandCenterAccess,
  h(async (req, res): Promise<void> => {
    const { isAdmin, caps } = await getCallerCapabilities(req);
    const visibleStages = getVisibleStages(isAdmin, caps);

    const { rows } = await pool.query(`
      SELECT
        r.id,
        r.employee_id,
        r.start_date,
        r.end_date,
        r.request_unit,
        r.requested_hours,
        r.status,
        r.employee_note,
        r.supervisor_id,
        r.supervisor_decision,
        r.supervisor_note,
        r.supervisor_reviewed_at,
        r.hr_decision,
        r.hr_note,
        r.hr_reviewed_at,
        r.vp_decision,
        r.vp_note,
        r.vp_reviewed_at,
        r.submitted_on_behalf,
        r.submitted_by_user_id,
        r.created_at,
        r.updated_at,
        e.name AS employee_name,
        e.department AS employee_department,
        sup.name AS supervisor_name,
        EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600 AS age_hours,
        CASE
          WHEN r.status = 'pending_supervisor' THEN EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600
          WHEN r.status = 'pending_hr' AND r.supervisor_reviewed_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (NOW() - r.supervisor_reviewed_at)) / 3600
          WHEN r.status = 'pending_vp' AND r.hr_reviewed_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (NOW() - r.hr_reviewed_at)) / 3600
          ELSE EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600
        END AS stage_age_hours
      FROM timekeeping.time_off_requests r
      LEFT JOIN employees e ON e.id = r.employee_id
      LEFT JOIN employees sup ON sup.id = r.supervisor_id
      WHERE r.status IN ('pending_supervisor', 'pending_hr', 'pending_vp', 'pending')
      ORDER BY r.created_at ASC
    `);

    const currentPeriod = getPayPeriodDates();
    const periodStartStr = currentPeriod.start.toISOString().slice(0, 10);
    const periodEndStr = currentPeriod.end.toISOString().slice(0, 10);
    const periodEnd = currentPeriod.end;
    const now = new Date();
    const daysToFreeze = Math.ceil((periodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const nearPayrollFreeze = daysToFreeze >= 0 && daysToFreeze <= 3;

    const callerEmployeeId = await resolveCallerEmployeeId(req);
    const isSupervisorOnly = !isAdmin && caps.has("timekeeping.pto.approve_supervisor") && !caps.has("timekeeping.pto.approve_hr") && !caps.has("timekeeping.pto.approve_vp");

    const pipeline: Record<string, any[]> = {
      pending_supervisor: [],
      pending_hr: [],
      pending_vp: [],
    };

    for (const row of rows) {
      const stage = row.status === "pending" ? "pending_supervisor" : row.status;
      if (!visibleStages.includes(row.status) && !visibleStages.includes(stage)) continue;
      if (isSupervisorOnly && (stage === "pending_supervisor" || stage === "pending") && (!callerEmployeeId || row.supervisor_id !== callerEmployeeId)) continue;
      if (!pipeline[stage]) pipeline[stage] = [];

      const stageStartDate =
        (row.status === "pending_supervisor" || row.status === "pending")
          ? new Date(row.created_at)
          : row.status === "pending_hr" && row.supervisor_reviewed_at
            ? new Date(row.supervisor_reviewed_at)
            : row.status === "pending_vp" && row.hr_reviewed_at
              ? new Date(row.hr_reviewed_at)
              : new Date(row.created_at);
      const stageAgeHours = Math.round(countBusinessHours(stageStartDate, new Date()) * 10) / 10;
      const threshold = getStuckThresholdHours(row.status);

      let nextApprover = "—";
      if (row.status === "pending_supervisor" || row.status === "pending") {
        nextApprover = row.supervisor_name ? `${row.supervisor_name} (Supervisor)` : "Unassigned Supervisor";
      } else if (row.status === "pending_hr") {
        nextApprover = "HR Reviewer";
      } else if (row.status === "pending_vp") {
        nextApprover = "VP Reviewer";
      }

      pipeline[stage].push({
        id: row.id,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        employeeDepartment: row.employee_department,
        startDate: row.start_date,
        endDate: row.end_date,
        requestUnit: row.request_unit,
        requestedHours: row.requested_hours,
        status: row.status,
        employeeNote: row.employee_note,
        supervisorId: row.supervisor_id,
        supervisorName: row.supervisor_name,
        supervisorDecision: row.supervisor_decision,
        supervisorNote: row.supervisor_note,
        supervisorReviewedAt: row.supervisor_reviewed_at,
        hrDecision: row.hr_decision,
        hrNote: row.hr_note,
        hrReviewedAt: row.hr_reviewed_at,
        vpDecision: row.vp_decision,
        vpNote: row.vp_note,
        vpReviewedAt: row.vp_reviewed_at,
        submittedOnBehalf: row.submitted_on_behalf,
        submittedByUserId: row.submitted_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ageHours: Math.round(Number(row.age_hours) * 10) / 10,
        stageAgeHours,
        isStuck: stageAgeHours > threshold,
        stuckThresholdHours: threshold,
        nextApprover,
        overlapsPayPeriod: row.start_date <= periodEndStr && row.end_date >= periodStartStr,
        nearPayrollFreeze: nearPayrollFreeze && row.start_date <= periodEndStr && row.end_date >= periodStartStr,
      });
    }

    const callerCaps = isAdmin
      ? ["timekeeping.pto.approve_supervisor", "timekeeping.pto.approve_hr", "timekeeping.pto.approve_vp", "timekeeping.pto.view_all"]
      : Array.from(caps).filter((c: string) => c.startsWith("timekeeping.pto."));

    const stuckCount = Object.values(pipeline).flat().filter((r: any) => r.isStuck).length;

    res.json({
      pipeline,
      counts: {
        pending_supervisor: pipeline.pending_supervisor.length,
        pending_hr: pipeline.pending_hr.length,
        pending_vp: pipeline.pending_vp.length,
      },
      stuckCount,
      callerCapabilities: callerCaps,
      isAdmin,
    });
  })
);

router.get(
  "/pto-command-center/payroll-exposure",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (_req, res): Promise<void> => {
    const currentPeriod = getPayPeriodDates();
    const nextPeriodRef = new Date(currentPeriod.end);
    nextPeriodRef.setDate(nextPeriodRef.getDate() + 1);
    const nextPeriod = getPayPeriodDates(nextPeriodRef);

    const periods = [
      { label: "Current Period", start: currentPeriod.start, end: currentPeriod.end },
      { label: "Next Period", start: nextPeriod.start, end: nextPeriod.end },
    ];

    const result = [];

    for (const period of periods) {
      const startStr = period.start.toISOString().slice(0, 10);
      const endStr = period.end.toISOString().slice(0, 10);

      const { rows } = await pool.query(`
        SELECT
          r.id,
          r.employee_id,
          r.start_date,
          r.end_date,
          r.request_unit,
          r.requested_hours,
          r.status,
          e.name AS employee_name,
          e.pay_type
        FROM timekeeping.time_off_requests r
        LEFT JOIN employees e ON e.id = r.employee_id
        WHERE r.status = 'approved'
          AND r.start_date <= $2
          AND r.end_date >= $1
      `, [startStr, endStr]);

      let totalHours = 0;
      const requests = rows.map((r: any) => {
        let hours = 0;
        if (r.request_unit === "hourly" && r.requested_hours) {
          hours = Number(r.requested_hours);
        } else if (r.request_unit === "half_day") {
          hours = 4;
        } else {
          const start = new Date(Math.max(new Date(r.start_date).getTime(), period.start.getTime()));
          const end = new Date(Math.min(new Date(r.end_date).getTime(), period.end.getTime()));
          const days = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
          hours = days * 8;
        }
        totalHours += hours;
        return {
          id: r.id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          startDate: r.start_date,
          endDate: r.end_date,
          requestUnit: r.request_unit,
          payType: r.pay_type,
          hours,
        };
      });

      result.push({
        label: period.label,
        periodStart: startStr,
        periodEnd: endStr,
        totalHours,
        requestCount: requests.length,
        requests,
      });
    }

    res.json({ periods: result });
  })
);

router.get(
  "/pto-command-center/staffing-impact",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (_req, res): Promise<void> => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const in14Days = new Date();
    in14Days.setDate(in14Days.getDate() + 14);
    const in14DaysStr = in14Days.toISOString().slice(0, 10);

    const { rows } = await pool.query(`
      SELECT
        r.id,
        r.employee_id,
        r.start_date,
        r.end_date,
        r.request_unit,
        r.status,
        e.name AS employee_name,
        e.department
      FROM timekeeping.time_off_requests r
      LEFT JOIN employees e ON e.id = r.employee_id
      WHERE r.status IN ('approved', 'pending_supervisor', 'pending_hr', 'pending_vp', 'pending')
        AND r.start_date <= $2
        AND r.end_date >= $1
      ORDER BY r.start_date ASC
    `, [todayStr, in14DaysStr]);

    const calendar: Record<string, any[]> = {};
    for (let d = new Date(today); d <= in14Days; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      calendar[dateStr] = [];
    }

    for (const row of rows) {
      const start = new Date(Math.max(new Date(row.start_date).getTime(), today.getTime()));
      const end = new Date(Math.min(new Date(row.end_date).getTime(), in14Days.getTime()));
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        if (calendar[dateStr]) {
          calendar[dateStr].push({
            requestId: row.id,
            employeeId: row.employee_id,
            employeeName: row.employee_name,
            department: row.department,
            status: row.status,
            requestUnit: row.request_unit,
          });
        }
      }
    }

    const calendarArray = Object.entries(calendar).map(([date, entries]) => ({
      date,
      totalOut: entries.length,
      departments: [...new Set(entries.map((e: any) => e.department).filter(Boolean))],
      entries,
      isHighImpact: entries.length >= 3,
    }));

    res.json({ calendar: calendarArray });
  })
);

router.get(
  "/pto-command-center/alerts",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (_req, res): Promise<void> => {
    const [missingSupervisor, stuckRequestsResult, orphanedRequests] = await Promise.all([
      pool.query(`
        SELECT DISTINCT r.employee_id, e.name AS employee_name
        FROM timekeeping.time_off_requests r
        LEFT JOIN employees e ON e.id = r.employee_id
        WHERE r.status IN ('pending_supervisor','pending_hr','pending_vp','pending')
          AND (e.supervisor_employee_id IS NULL)
      `),
      pool.query(`
        SELECT * FROM (
          SELECT
            r.id,
            r.employee_id,
            e.name AS employee_name,
            r.status,
            r.start_date,
            r.end_date,
            r.created_at,
            r.supervisor_reviewed_at,
            r.hr_reviewed_at,
            CASE
              WHEN r.status = 'pending_supervisor' THEN EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600
              WHEN r.status = 'pending_hr' AND r.supervisor_reviewed_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (NOW() - r.supervisor_reviewed_at)) / 3600
              WHEN r.status = 'pending_vp' AND r.hr_reviewed_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (NOW() - r.hr_reviewed_at)) / 3600
              ELSE EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600
            END AS stage_age_hours
          FROM timekeeping.time_off_requests r
          LEFT JOIN employees e ON e.id = r.employee_id
          WHERE r.status IN ('pending_supervisor','pending_hr','pending_vp','pending')
        ) sub
        WHERE sub.stage_age_hours > 8
      `),
      pool.query(`
        SELECT r.id, r.employee_id, e.name AS employee_name, r.status
        FROM timekeeping.time_off_requests r
        LEFT JOIN employees e ON e.id = r.employee_id
        WHERE r.status = 'cancelled'
          AND EXISTS (
            SELECT 1 FROM timekeeping.leave_entries le
            WHERE le.source_request_id = r.id
              AND le.voided_at IS NULL
          )
      `),
    ]);

    const currentPeriod = getPayPeriodDates();
    const periodStartStr = currentPeriod.start.toISOString().slice(0, 10);
    const periodEndStr = currentPeriod.end.toISOString().slice(0, 10);
    const periodEnd = currentPeriod.end;
    const now = new Date();
    const daysToFreeze = Math.ceil((periodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const nearPayrollFreeze = daysToFreeze >= 0 && daysToFreeze <= 3;

    const stuckRequests = stuckRequestsResult.rows
      .map((r: any) => {
        const stageStart =
          (r.status === "pending_supervisor" || r.status === "pending")
            ? new Date(r.created_at)
            : r.status === "pending_hr" && r.supervisor_reviewed_at
              ? new Date(r.supervisor_reviewed_at)
              : r.status === "pending_vp" && r.hr_reviewed_at
                ? new Date(r.hr_reviewed_at)
                : new Date(r.created_at);
        const bizHours = countBusinessHours(stageStart, new Date());
        const threshold = STAGE_THRESHOLDS[r.status];
        const thresholdHours = threshold?.hours ?? 48;
        const overlapsPayPeriod = r.start_date <= periodEndStr && r.end_date >= periodStartStr;
        return {
          id: r.id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          status: r.status,
          startDate: r.start_date,
          endDate: r.end_date,
          stageAgeHours: Math.round(bizHours * 10) / 10,
          createdAt: r.created_at,
          thresholdLabel: threshold?.label ?? "Exceeded threshold",
          thresholdHours,
          overlapsPayPeriod,
          nearPayrollFreeze: nearPayrollFreeze && overlapsPayPeriod,
          _isStuck: bizHours > thresholdHours,
        };
      })
      .filter((r: any) => r._isStuck);

    const payrollFreezeRequests = nearPayrollFreeze
      ? stuckRequestsResult.rows
          .filter((r: any) => r.start_date <= periodEndStr && r.end_date >= periodStartStr)
          .map((r: any) => ({
            id: r.id,
            employeeId: r.employee_id,
            employeeName: r.employee_name,
            status: r.status,
            startDate: r.start_date,
            endDate: r.end_date,
          }))
      : [];

    res.json({
      missingSupervisor: missingSupervisor.rows.map((r: any) => ({
        employeeId: r.employee_id,
        employeeName: r.employee_name,
      })),
      stuckRequests,
      orphanedRequests: orphanedRequests.rows.map((r: any) => ({
        id: r.id,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        status: r.status,
      })),
      payrollFreezeWarning: nearPayrollFreeze ? {
        daysToFreeze,
        periodEnd: periodEndStr,
        pendingRequestsInPeriod: payrollFreezeRequests.length,
        requests: payrollFreezeRequests,
      } : null,
    });
  })
);

router.get(
  "/pto-command-center/all-requests",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (req, res): Promise<void> => {
    const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
    const departmentFilter = typeof req.query.department === "string" ? req.query.department.toLowerCase() : undefined;
    const supervisorFilter = typeof req.query.supervisor === "string" ? req.query.supervisor.toLowerCase() : undefined;
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.toLowerCase() : undefined;

    let conditions = `WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (statusFilter && statusFilter !== "all") {
      conditions += ` AND r.status = $${paramIdx++}`;
      params.push(statusFilter);
    }
    if (startDate) {
      conditions += ` AND r.end_date >= $${paramIdx++}`;
      params.push(startDate);
    }
    if (endDate) {
      conditions += ` AND r.start_date <= $${paramIdx++}`;
      params.push(endDate);
    }
    if (departmentFilter) {
      conditions += ` AND LOWER(e.department) LIKE $${paramIdx++}`;
      params.push(`%${departmentFilter}%`);
    }
    if (supervisorFilter) {
      conditions += ` AND LOWER(sup.name) LIKE $${paramIdx++}`;
      params.push(`%${supervisorFilter}%`);
    }
    if (search) {
      conditions += ` AND (LOWER(e.name) LIKE $${paramIdx} OR CAST(r.id AS TEXT) LIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const currentPeriod = getPayPeriodDates();
    const periodStartStr = currentPeriod.start.toISOString().slice(0, 10);
    const periodEndStr = currentPeriod.end.toISOString().slice(0, 10);

    const { rows } = await pool.query(`
      SELECT
        r.id,
        r.employee_id,
        r.start_date,
        r.end_date,
        r.request_unit,
        r.requested_hours,
        r.status,
        r.employee_note,
        r.supervisor_id,
        r.supervisor_decision,
        r.supervisor_note,
        r.supervisor_reviewed_at,
        r.hr_decision,
        r.hr_note,
        r.hr_reviewed_at,
        r.vp_decision,
        r.vp_note,
        r.vp_reviewed_at,
        r.submitted_on_behalf,
        r.submitted_by_user_id,
        r.created_at,
        r.updated_at,
        e.name AS employee_name,
        e.department AS employee_department,
        e.pay_type AS employee_pay_type,
        sup.name AS supervisor_name
      FROM timekeeping.time_off_requests r
      LEFT JOIN employees e ON e.id = r.employee_id
      LEFT JOIN employees sup ON sup.id = r.supervisor_id
      ${conditions}
      ORDER BY r.created_at DESC
      LIMIT 500
    `, params);

    const requests = rows.map((r: any) => {
      const overlapsPayPeriod = r.start_date <= periodEndStr && r.end_date >= periodStartStr;
      return {
        id: r.id,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        employeeDepartment: r.employee_department,
        employeePayType: r.employee_pay_type,
        startDate: r.start_date,
        endDate: r.end_date,
        requestUnit: r.request_unit,
        requestedHours: r.requested_hours,
        status: r.status,
        employeeNote: r.employee_note,
        supervisorId: r.supervisor_id,
        supervisorName: r.supervisor_name,
        supervisorDecision: r.supervisor_decision,
        supervisorNote: r.supervisor_note,
        supervisorReviewedAt: r.supervisor_reviewed_at,
        hrDecision: r.hr_decision,
        hrNote: r.hr_note,
        hrReviewedAt: r.hr_reviewed_at,
        vpDecision: r.vp_decision,
        vpNote: r.vp_note,
        vpReviewedAt: r.vp_reviewed_at,
        submittedOnBehalf: r.submitted_on_behalf,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        overlapsPayPeriod,
      };
    });

    res.json({ requests, payPeriod: { start: periodStartStr, end: periodEndStr } });
  })
);

router.get(
  "/pto-command-center/payroll-readiness",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (_req, res): Promise<void> => {
    const currentPeriod = getPayPeriodDates();
    const startStr = currentPeriod.start.toISOString().slice(0, 10);
    const endStr = currentPeriod.end.toISOString().slice(0, 10);

    const [approvedResult, leaveEntriesResult, reversedResult, pendingResult, missingLeaveResult] = await Promise.all([
      pool.query(`
        SELECT
          r.id, r.employee_id, r.start_date, r.end_date, r.request_unit, r.requested_hours,
          e.name AS employee_name, e.pay_type
        FROM timekeeping.time_off_requests r
        LEFT JOIN employees e ON e.id = r.employee_id
        WHERE r.status = 'approved'
          AND r.start_date <= $2 AND r.end_date >= $1
      `, [startStr, endStr]),
      pool.query(`
        SELECT
          le.id, le.employee_id, le.date, le.hours, le.leave_type,
          le.source_request_id, le.voided_at,
          te.epoch_employee_id
        FROM timekeeping.leave_entries le
        LEFT JOIN timekeeping.employees te ON te.id = le.employee_id
        WHERE le.date >= $1 AND le.date <= $2
          AND le.voided_at IS NULL
      `, [startStr, endStr]),
      pool.query(`
        SELECT
          le.id, le.employee_id, le.date, le.hours, le.voided_at, le.void_reason,
          le.source_request_id, le.voided_by,
          te.epoch_employee_id,
          e.name AS employee_name
        FROM timekeeping.leave_entries le
        LEFT JOIN timekeeping.employees te ON te.id = le.employee_id
        LEFT JOIN employees e ON e.id = te.epoch_employee_id
        WHERE le.date >= $1 AND le.date <= $2
          AND le.voided_at IS NOT NULL
      `, [startStr, endStr]),
      pool.query(`
        SELECT
          r.id, r.employee_id, r.start_date, r.end_date, r.status,
          r.request_unit, r.requested_hours,
          e.name AS employee_name
        FROM timekeeping.time_off_requests r
        LEFT JOIN employees e ON e.id = r.employee_id
        WHERE r.status IN ('pending_supervisor','pending_hr','pending_vp','pending')
          AND r.start_date <= $2 AND r.end_date >= $1
      `, [startStr, endStr]),
      pool.query(`
        SELECT r.id, r.employee_id, r.start_date, r.end_date,
          e.name AS employee_name
        FROM timekeeping.time_off_requests r
        LEFT JOIN employees e ON e.id = r.employee_id
        WHERE r.status = 'approved'
          AND r.start_date <= $2 AND r.end_date >= $1
          AND NOT EXISTS (
            SELECT 1 FROM timekeeping.employees te
            JOIN timekeeping.leave_entries le ON le.employee_id = te.id
              AND le.source_request_id = r.id AND le.voided_at IS NULL
            WHERE te.epoch_employee_id = r.employee_id
          )
      `, [startStr, endStr]),
    ]);

    let salariedInjectionStatus: any[] = [];
    try {
      const { rows: injectionRows } = await pool.query(`
        SELECT
          st.employee_id AS epoch_employee_id,
          e.name AS employee_name,
          stl.line_type,
          stl.hours,
          stl.date,
          stl.source,
          st.status AS timesheet_status,
          le.id AS leave_entry_id,
          CASE
            WHEN le.id IS NOT NULL AND le.voided_at IS NULL THEN 'synced'
            WHEN le.id IS NOT NULL AND le.voided_at IS NOT NULL THEN 'voided'
            ELSE 'missing'
          END AS injection_sync_status
        FROM timekeeping.salaried_timesheet_lines stl
        JOIN timekeeping.salaried_timesheets st ON st.id = stl.timesheet_id
        LEFT JOIN employees e ON e.id = st.employee_id
        LEFT JOIN timekeeping.leave_entries le ON le.id = stl.leave_entry_id
        WHERE stl.line_type = 'PTO'
          AND stl.date >= $1 AND stl.date <= $2
      `, [startStr, endStr]);
      salariedInjectionStatus = injectionRows;
    } catch (err: any) {
      console.warn("[pto-command-center] salaried injection query failed:", err?.message);
    }

    let hourlyTotal = 0;
    let salariedTotal = 0;
    for (const r of approvedResult.rows) {
      let hours = 0;
      if (r.request_unit === "hourly" && r.requested_hours) hours = Number(r.requested_hours);
      else if (r.request_unit === "half_day") hours = 4;
      else {
        const s = new Date(Math.max(new Date(r.start_date).getTime(), currentPeriod.start.getTime()));
        const en = new Date(Math.min(new Date(r.end_date).getTime(), currentPeriod.end.getTime()));
        hours = (Math.floor((en.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1) * 8;
      }
      if (r.pay_type === "salary" || r.pay_type === "salaried") salariedTotal += hours;
      else hourlyTotal += hours;
    }

    const warnings: { type: string; message: string; requestId?: number }[] = [];
    for (const r of missingLeaveResult.rows) {
      warnings.push({
        type: "missing_leave_entry",
        message: `Approved PTO for ${r.employee_name || `#${r.employee_id}`} (${r.start_date} – ${r.end_date}) has no corresponding leave entry`,
        requestId: r.id,
      });
    }
    for (const r of pendingResult.rows) {
      warnings.push({
        type: "pending_in_period",
        message: `Pending request for ${r.employee_name || `#${r.employee_id}`} (${r.start_date} – ${r.end_date}) falls in current pay period`,
        requestId: r.id,
      });
    }

    res.json({
      periodStart: startStr,
      periodEnd: endStr,
      hourlyPtoHours: hourlyTotal,
      salariedPtoHours: salariedTotal,
      totalApprovedHours: hourlyTotal + salariedTotal,
      activeLeaveEntries: leaveEntriesResult.rows.length,
      salariedInjections: {
        total: salariedInjectionStatus.length,
        synced: salariedInjectionStatus.filter((r: any) => r.injection_sync_status === "synced").length,
        pending: salariedInjectionStatus.filter((r: any) => r.injection_sync_status === "missing").length,
        voided: salariedInjectionStatus.filter((r: any) => r.injection_sync_status === "voided").length,
        details: salariedInjectionStatus.map((r: any) => ({
          employeeName: r.employee_name,
          date: r.date,
          hours: r.hours,
          source: r.source,
          timesheetStatus: r.timesheet_status,
          syncStatus: r.injection_sync_status,
        })),
      },
      reversedEntries: reversedResult.rows.map((r: any) => ({
        id: r.id,
        employeeName: r.employee_name,
        date: r.date,
        hours: r.hours,
        voidReason: r.void_reason,
        sourceRequestId: r.source_request_id,
      })),
      warnings,
      pendingInPeriod: pendingResult.rows.length,
    });
  })
);

router.get(
  "/pto-command-center/reversal-log",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (req, res): Promise<void> => {
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    const employeeSearch = typeof req.query.employee === "string" ? req.query.employee.toLowerCase() : undefined;

    let conditions = `WHERE (r.status = 'cancelled' OR le_voided.id IS NOT NULL)`;
    const params: any[] = [];
    let paramIdx = 1;

    if (startDate) {
      conditions += ` AND r.updated_at >= $${paramIdx++}`;
      params.push(new Date(startDate));
    }
    if (endDate) {
      const ed = new Date(endDate);
      ed.setDate(ed.getDate() + 1);
      conditions += ` AND r.updated_at <= $${paramIdx++}`;
      params.push(ed);
    }
    if (employeeSearch) {
      conditions += ` AND LOWER(e.name) LIKE $${paramIdx++}`;
      params.push(`%${employeeSearch}%`);
    }

    const { rows } = await pool.query(`
      SELECT DISTINCT ON (r.id)
        r.id,
        r.employee_id,
        r.start_date,
        r.end_date,
        r.status,
        r.request_unit,
        r.requested_hours,
        r.updated_at,
        r.created_at,
        e.name AS employee_name,
        (SELECT COUNT(*) FROM timekeeping.leave_entries le
         WHERE le.source_request_id = r.id AND le.voided_at IS NOT NULL) AS voided_entry_count,
        (SELECT COUNT(*) FROM timekeeping.leave_entries le
         WHERE le.source_request_id = r.id AND le.voided_at IS NULL) AS active_entry_count
      FROM timekeeping.time_off_requests r
      LEFT JOIN employees e ON e.id = r.employee_id
      LEFT JOIN timekeeping.leave_entries le_voided
        ON le_voided.source_request_id = r.id AND le_voided.voided_at IS NOT NULL
      ${conditions}
      ORDER BY r.id, r.updated_at DESC
      LIMIT 200
    `, params);

    const requestIds = rows.map((r: any) => r.id);

    let auditActions: any[] = [];
    if (requestIds.length > 0) {
      const placeholders = requestIds.map((_: any, i: number) => `$${i + 1}`).join(",");
      const { rows: auditRows } = await pool.query(`
        SELECT al.record_id, al.action, al.actor_email, al.actor_role,
               al.old_values, al.new_values, al.created_at
        FROM timekeeping.audit_log al
        WHERE al.table_name = 'time_off_requests'
          AND al.record_id IN (${placeholders})
          AND (
            (al.new_values::text ILIKE '%cancelled%')
            OR (al.new_values::text ILIKE '%reversal%')
            OR (al.new_values::text ILIKE '%voided%')
          )
        ORDER BY al.created_at DESC
      `, requestIds);
      auditActions = auditRows;
    }

    const auditByRequest = new Map<number, any[]>();
    for (const a of auditActions) {
      if (!auditByRequest.has(a.record_id)) auditByRequest.set(a.record_id, []);
      auditByRequest.get(a.record_id)!.push({
        action: a.action,
        actorEmail: a.actor_email,
        actorRole: a.actor_role,
        reason: a.new_values?.reason ?? a.new_values?.voidReason ?? null,
        occurredAt: a.created_at,
      });
    }

    let affectedTimesheetLines: any[] = [];
    if (requestIds.length > 0) {
      try {
        const placeholders = requestIds.map((_: any, i: number) => `$${i + 1}`).join(",");
        const { rows: tsRows } = await pool.query(`
          SELECT
            le.source_request_id,
            stl.id AS line_id,
            stl.date,
            stl.line_type,
            stl.hours,
            stl.source,
            stl.note,
            st.status AS timesheet_status,
            st.period_start,
            st.period_end,
            e.name AS employee_name
          FROM timekeeping.leave_entries le
          JOIN timekeeping.salaried_timesheet_lines stl ON stl.leave_entry_id = le.id
          JOIN timekeeping.salaried_timesheets st ON st.id = stl.timesheet_id
          LEFT JOIN employees e ON e.id = st.employee_id
          WHERE le.source_request_id IN (${placeholders})
          ORDER BY stl.date ASC
        `, requestIds);
        affectedTimesheetLines = tsRows;
      } catch (err: any) {
        console.warn("[pto-command-center] reversal affected timesheet lines query failed:", err?.message);
      }
    }

    const timesheetLinesByRequest = new Map<number, any[]>();
    for (const tl of affectedTimesheetLines) {
      if (!timesheetLinesByRequest.has(tl.source_request_id)) timesheetLinesByRequest.set(tl.source_request_id, []);
      timesheetLinesByRequest.get(tl.source_request_id)!.push({
        lineId: tl.line_id,
        date: tl.date,
        lineType: tl.line_type,
        hours: tl.hours,
        source: tl.source,
        note: tl.note,
        timesheetStatus: tl.timesheet_status,
        periodStart: tl.period_start,
        periodEnd: tl.period_end,
        employeeName: tl.employee_name,
      });
    }

    const entries = rows.map((r: any) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      requestUnit: r.request_unit,
      requestedHours: r.requested_hours,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
      voidedEntryCount: Number(r.voided_entry_count || 0),
      activeEntryCount: Number(r.active_entry_count || 0),
      auditActions: auditByRequest.get(r.id) || [],
      affectedTimesheetLines: timesheetLinesByRequest.get(r.id) || [],
    }));

    res.json({ entries });
  })
);

router.get(
  "/pto-command-center/override-log",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (req, res): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;

    let conditions = `WHERE al.actor_role IN ('ADMIN','OWNER')
      AND al.table_name IN ('time_off_requests','leave_entries','timesheets','punches','salaried_timesheets')`;
    const params: any[] = [];
    let paramIdx = 1;

    if (startDate) {
      conditions += ` AND al.created_at >= $${paramIdx++}`;
      params.push(new Date(startDate));
    }
    if (endDate) {
      const ed = new Date(endDate);
      ed.setDate(ed.getDate() + 1);
      conditions += ` AND al.created_at <= $${paramIdx++}`;
      params.push(ed);
    }

    params.push(limit);

    const { rows } = await pool.query(`
      SELECT al.id, al.table_name, al.record_id, al.action,
             al.actor_email, al.actor_role, al.old_values, al.new_values,
             al.created_at
      FROM timekeeping.audit_log al
      ${conditions}
      ORDER BY al.created_at DESC
      LIMIT $${paramIdx++}
    `, params);

    const entries = rows.map((r: any) => {
      let category = "admin_intervention";
      const nv = r.new_values as Record<string, any> | null;
      if (r.table_name === "punches" && r.action === "INSERT") category = "clock_override";
      if (r.table_name === "punches" && r.action === "UPDATE") category = "clock_override";
      if (nv?.reversal || nv?.voidedAt) category = "pto_reversal";
      if (nv?.status === "cancelled") category = "cancellation";
      if (r.table_name === "timesheets" && nv?.status === "approved") category = "timesheet_override";
      if (r.table_name === "salaried_timesheets") category = "payroll_override";

      return {
        id: r.id,
        tableName: r.table_name,
        recordId: r.record_id,
        action: r.action,
        actorEmail: r.actor_email,
        actorRole: r.actor_role,
        oldValues: r.old_values,
        newValues: r.new_values,
        createdAt: r.created_at,
        category,
      };
    });

    res.json({ entries });
  })
);

router.get(
  "/pto-command-center/missing-setup",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (_req, res): Promise<void> => {
    const [noSupervisor, incompleteRouting] = await Promise.all([
      pool.query(`
        SELECT e.id, e.name, e.department
        FROM employees e
        WHERE e.supervisor_employee_id IS NULL
          AND e.is_active = true
        ORDER BY e.name
        LIMIT 100
      `),
      pool.query(`
        SELECT r.id, r.employee_id, r.status, r.start_date, r.end_date,
               e.name AS employee_name, e.supervisor_employee_id
        FROM timekeeping.time_off_requests r
        LEFT JOIN employees e ON e.id = r.employee_id
        WHERE r.status IN ('pending_supervisor','pending_hr','pending_vp','pending')
          AND e.supervisor_employee_id IS NULL
      `),
    ]);

    let missingPtoCapabilities: any[] = [];
    try {
      const { rows: capRows } = await pool.query(`
        SELECT u.id AS user_id, u.username, u.first_name, u.last_name, u.role,
               ARRAY_AGG(pc.key) AS granted_keys
        FROM users u
        LEFT JOIN perm_role_capabilities prc
          ON prc.role_id = (SELECT pr.id FROM perm_roles pr WHERE pr.name = u.role LIMIT 1)
        LEFT JOIN perm_capabilities pc ON pc.id = prc.capability_id
        WHERE u.is_active = true
          AND u.role IN ('SUPERVISOR','MANAGER')
        GROUP BY u.id, u.username, u.first_name, u.last_name, u.role
      `);
      const ptoApprovalKeys = [
        "timekeeping.pto.approve_supervisor",
        "timekeeping.pto.approve_hr",
        "timekeeping.pto.approve_vp",
      ];
      for (const row of capRows) {
        const granted = row.granted_keys?.filter(Boolean) ?? [];
        const missing = ptoApprovalKeys.filter(k => !granted.includes(k));
        if (missing.length > 0 && (row.role === "SUPERVISOR" || row.role === "MANAGER")) {
          const relevant = row.role === "SUPERVISOR"
            ? missing.filter((k: string) => k.includes("supervisor"))
            : missing;
          if (relevant.length > 0) {
            missingPtoCapabilities.push({
              userId: row.user_id,
              username: row.username,
              name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
              role: row.role,
              missingKeys: relevant,
            });
          }
        }
      }
    } catch (err: any) {
      console.warn("[pto-command-center] missing PTO capabilities query failed:", err?.message);
    }

    let vpCapabilityIssues: any[] = [];
    try {
      const { rows: vpRows } = await pool.query(`
        SELECT u.id AS user_id, u.username, u.first_name, u.last_name
        FROM users u
        LEFT JOIN perm_user_overrides puo ON puo.user_id = u.id
        LEFT JOIN perm_capabilities pc ON pc.id = puo.capability_id AND pc.key = 'timekeeping.pto.approve_vp'
        LEFT JOIN perm_role_capabilities prc ON prc.role_id = (SELECT pr.id FROM perm_roles pr WHERE pr.name = u.role LIMIT 1)
        LEFT JOIN perm_capabilities pc2 ON pc2.id = prc.capability_id AND pc2.key = 'timekeeping.pto.approve_vp'
        WHERE u.is_active = true
          AND u.role NOT IN ('ADMIN','OWNER')
          AND (puo.id IS NOT NULL OR pc2.id IS NOT NULL)
          AND u.employee_id IS NULL
      `);
      vpCapabilityIssues = vpRows.map((r: any) => ({
        userId: r.user_id,
        username: r.username,
        name: `${r.first_name || ""} ${r.last_name || ""}`.trim(),
        issue: "VP approval capability granted but user has no linked employee record",
      }));
    } catch (err: any) {
      console.warn("[pto-command-center] VP capability issues query failed:", err?.message);
    }

    res.json({
      employeesWithoutSupervisor: noSupervisor.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        department: r.department,
      })),
      missingPtoCapabilities,
      vpCapabilityIssues,
      incompleteRouting: incompleteRouting.rows.map((r: any) => ({
        requestId: r.id,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        status: r.status,
        startDate: r.start_date,
        endDate: r.end_date,
      })),
    });
  })
);

router.get(
  "/pto-command-center/audit-trail",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (req, res): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const actionFilter = typeof req.query.action === "string" ? req.query.action : undefined;
    const employeeFilter = typeof req.query.employee === "string" ? req.query.employee.toLowerCase() : undefined;

    const conditions = [
      inArray(auditLogTable.tableName, ["time_off_requests", "leave_entries"]),
    ];

    if (actionFilter) {
      conditions.push(eq(auditLogTable.action, actionFilter));
    }

    if (req.query.startDate && typeof req.query.startDate === "string") {
      conditions.push(gte(auditLogTable.createdAt, new Date(req.query.startDate as string)));
    }
    if (req.query.endDate && typeof req.query.endDate === "string") {
      const endDate = new Date(req.query.endDate as string);
      endDate.setDate(endDate.getDate() + 1);
      conditions.push(lte(auditLogTable.createdAt, endDate));
    }

    if (employeeFilter && employeeFilter.trim()) {
      const safeTerm = `%${employeeFilter}%`;
      const dateConditions: string[] = [];
      const dateParams: any[] = [];
      let paramIdx = 1;

      dateConditions.push(`al.table_name IN ('time_off_requests', 'leave_entries')`);

      if (actionFilter) {
        dateConditions.push(`al.action = $${paramIdx++}`);
        dateParams.push(actionFilter);
      }
      if (req.query.startDate && typeof req.query.startDate === "string") {
        dateConditions.push(`al.created_at >= $${paramIdx++}`);
        dateParams.push(new Date(req.query.startDate as string));
      }
      if (req.query.endDate && typeof req.query.endDate === "string") {
        const endDate = new Date(req.query.endDate as string);
        endDate.setDate(endDate.getDate() + 1);
        dateConditions.push(`al.created_at <= $${paramIdx++}`);
        dateParams.push(endDate);
      }

      dateConditions.push(`(al.actor_email ILIKE $${paramIdx} OR e.name ILIKE $${paramIdx} OR e2.name ILIKE $${paramIdx})`);
      dateParams.push(safeTerm);
      paramIdx++;

      dateParams.push(limit, offset);

      const sqlQuery = `
        SELECT al.*,
               COALESCE(e.name, e2.name) AS resolved_employee_name
        FROM timekeeping.audit_log al
        LEFT JOIN timekeeping.time_off_requests tor
          ON al.table_name = 'time_off_requests' AND al.record_id = tor.id
        LEFT JOIN employees e ON tor.employee_id = e.id
        LEFT JOIN timekeeping.leave_entries le
          ON al.table_name = 'leave_entries' AND al.record_id = le.id
        LEFT JOIN timekeeping.time_off_requests tor2
          ON le.source_request_id = tor2.id
        LEFT JOIN employees e2 ON tor2.employee_id = e2.id
        WHERE ${dateConditions.join(" AND ")}
        ORDER BY al.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}
      `;

      const { rows: rawRows } = await pool.query(sqlQuery, dateParams);
      const entries = rawRows.map((r: any) => ({
        id: r.id,
        tableName: r.table_name,
        recordId: r.record_id,
        action: r.action,
        actorEmail: r.actor_email,
        actorRole: r.actor_role,
        oldValues: r.old_values,
        newValues: r.new_values,
        createdAt: r.created_at,
        resolvedEmployeeName: r.resolved_employee_name,
      }));
      res.json({ entries, limit, offset });
      return;
    }

    let query = db
      .select()
      .from(auditLogTable)
      .where(and(...conditions))
      .orderBy(desc(auditLogTable.createdAt))
      .limit(limit)
      .offset(offset);

    const rows = await query;

    const entries = rows
      .map((r) => ({
        id: r.id,
        tableName: r.tableName,
        recordId: r.recordId,
        action: r.action,
        actorEmail: r.actorEmail,
        actorRole: r.actorRole,
        oldValues: r.oldValues,
        newValues: r.newValues,
        createdAt: r.createdAt,
      }));

    res.json({ entries, limit, offset });
  })
);

router.get(
  "/pto-command-center/:requestId",
  authenticateToken,
  requirePTOCommandCenterAccess,
  h(async (req, res): Promise<void> => {
    const requestId = parseInt(req.params.requestId, 10);
    if (isNaN(requestId)) { res.status(400).json({ error: "Invalid request ID" }); return; }

    const { rows: reqRows } = await pool.query(`
      SELECT
        r.*,
        e.name AS employee_name,
        e.department AS employee_department,
        e.pay_type AS employee_pay_type,
        sup.name AS supervisor_name,
        sub_u.username AS submitted_by_username
      FROM timekeeping.time_off_requests r
      LEFT JOIN employees e ON e.id = r.employee_id
      LEFT JOIN employees sup ON sup.id = r.supervisor_id
      LEFT JOIN users sub_u ON sub_u.id = r.submitted_by_user_id
      WHERE r.id = $1
    `, [requestId]);

    if (reqRows.length === 0) {
      res.status(404).json({ error: "Request not found" }); return;
    }

    const request = reqRows[0];
    const { isAdmin, caps } = await getCallerCapabilities(req);
    if (!isAdmin && !caps.has("timekeeping.pto.view_all")) {
      const callerEmployeeId = await resolveCallerEmployeeId(req);
      const isAssignedSupervisor =
        caps.has("timekeeping.pto.approve_supervisor") &&
        callerEmployeeId != null &&
        request.supervisor_id === callerEmployeeId;
      const canSeeStage =
        (request.status === "pending_hr" && caps.has("timekeeping.pto.approve_hr")) ||
        (request.status === "pending_vp" && caps.has("timekeeping.pto.approve_vp"));
      if (!isAssignedSupervisor && !canSeeStage) {
        res.status(403).json({ error: "You are not assigned to this PTO request." });
        return;
      }
    }

    const [leaveResult, auditResult] = await Promise.all([
      pool.query(`
        SELECT le.id, le.employee_id, le.date, le.leave_type, le.hours, le.note,
               le.voided_at, le.voided_by, le.void_reason, le.created_at,
               vu.username AS voided_by_username
        FROM timekeeping.leave_entries le
        LEFT JOIN users vu ON vu.id = le.voided_by
        WHERE le.source_request_id = $1
        ORDER BY le.date ASC
      `, [requestId]),
      pool.query(`
        SELECT al.id, al.table_name, al.record_id, al.action,
               al.actor_email, al.actor_role, al.old_values, al.new_values,
               al.created_at
        FROM timekeeping.audit_log al
        WHERE (al.table_name = 'time_off_requests' AND al.record_id = $1)
           OR (al.table_name = 'leave_entries' AND al.record_id IN (
                SELECT le.id FROM timekeeping.leave_entries le WHERE le.source_request_id = $1
              ))
        ORDER BY al.created_at ASC
      `, [requestId]),
    ]);

    let salariedLines: any[] = [];
    try {
      const { rows: slRows } = await pool.query(`
        SELECT stl.id, stl.date, stl.line_type, stl.hours, stl.source, stl.note,
               st.period_start, st.period_end, st.status AS timesheet_status
        FROM timekeeping.salaried_timesheet_lines stl
        JOIN timekeeping.salaried_timesheets st ON st.id = stl.timesheet_id
        WHERE stl.leave_entry_id IN (
          SELECT le.id FROM timekeeping.leave_entries le WHERE le.source_request_id = $1
        )
        ORDER BY stl.date ASC
      `, [requestId]);
      salariedLines = slRows;
    } catch (err: any) {
      console.warn("[pto-command-center] salaried timesheet lines query failed:", err?.message);
    }

    const currentPeriod = getPayPeriodDates();
    const periodStartStr = currentPeriod.start.toISOString().slice(0, 10);
    const periodEndStr = currentPeriod.end.toISOString().slice(0, 10);
    const reqStart = request.start_date;
    const reqEnd = request.end_date;
    const overlapsCurrentPeriod = reqStart <= periodEndStr && reqEnd >= periodStartStr;
    const payrollRelevance = {
      overlapsCurrentPeriod,
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      employeePayType: request.employee_pay_type,
      hasLeaveEntries: leaveResult.rows.length > 0,
      hasVoidedEntries: leaveResult.rows.some((le: any) => le.voided_at),
      hasSalariedLines: salariedLines.length > 0,
    };

    const timeline: any[] = [];

    timeline.push({
      type: "submission",
      label: "Request Submitted",
      timestamp: request.created_at,
      details: {
        startDate: request.start_date,
        endDate: request.end_date,
        requestUnit: request.request_unit,
        requestedHours: request.requested_hours,
        employeeNote: request.employee_note,
        submittedOnBehalf: request.submitted_on_behalf,
        submittedByUsername: request.submitted_by_username,
      },
    });

    if (request.supervisor_decision) {
      timeline.push({
        type: "supervisor_review",
        label: `Supervisor ${request.supervisor_decision === "approved" ? "Approved" : "Denied"}`,
        timestamp: request.supervisor_reviewed_at,
        details: {
          decision: request.supervisor_decision,
          note: request.supervisor_note,
          reviewerName: request.supervisor_name,
        },
      });
    }

    if (request.hr_decision) {
      timeline.push({
        type: "hr_review",
        label: `HR ${request.hr_decision === "approved" ? "Approved" : "Denied"}`,
        timestamp: request.hr_reviewed_at,
        details: {
          decision: request.hr_decision,
          note: request.hr_note,
        },
      });
    }

    if (request.vp_decision) {
      timeline.push({
        type: "vp_review",
        label: `VP ${request.vp_decision === "approved" ? "Approved" : "Denied"}`,
        timestamp: request.vp_reviewed_at,
        details: {
          decision: request.vp_decision,
          note: request.vp_note,
        },
      });
    }

    if (request.status === "cancelled") {
      const cancelAudit = auditResult.rows.find(
        (a: any) => a.table_name === "time_off_requests" && a.new_values?.status === "cancelled"
      );
      timeline.push({
        type: "cancellation",
        label: "Request Cancelled",
        timestamp: cancelAudit?.created_at ?? request.updated_at,
        details: {
          actorEmail: cancelAudit?.actor_email,
          reason: cancelAudit?.new_values?.reason,
          wasApproved: cancelAudit?.new_values?.wasApproved,
        },
      });
    }

    for (const le of leaveResult.rows) {
      timeline.push({
        type: "leave_entry_created",
        label: `Leave Entry Created (${le.date})`,
        timestamp: le.created_at,
        details: { leaveEntryId: le.id, date: le.date, hours: le.hours, leaveType: le.leave_type },
      });
      if (le.voided_at) {
        timeline.push({
          type: "leave_entry_voided",
          label: `Leave Entry Voided (${le.date})`,
          timestamp: le.voided_at,
          details: { leaveEntryId: le.id, voidReason: le.void_reason, voidedByUsername: le.voided_by_username },
        });
      }
    }

    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.json({
      request: {
        id: request.id,
        employeeId: request.employee_id,
        employeeName: request.employee_name,
        employeeDepartment: request.employee_department,
        employeePayType: request.employee_pay_type,
        startDate: request.start_date,
        endDate: request.end_date,
        requestUnit: request.request_unit,
        requestedHours: request.requested_hours,
        status: request.status,
        employeeNote: request.employee_note,
        adminNote: request.admin_note,
        supervisorId: request.supervisor_id,
        supervisorName: request.supervisor_name,
        supervisorDecision: request.supervisor_decision,
        supervisorNote: request.supervisor_note,
        supervisorReviewedAt: request.supervisor_reviewed_at,
        hrDecision: request.hr_decision,
        hrNote: request.hr_note,
        hrReviewedAt: request.hr_reviewed_at,
        vpDecision: request.vp_decision,
        vpNote: request.vp_note,
        vpReviewedAt: request.vp_reviewed_at,
        submittedOnBehalf: request.submitted_on_behalf,
        submittedByUsername: request.submitted_by_username,
        createdAt: request.created_at,
        updatedAt: request.updated_at,
      },
      leaveEntries: leaveResult.rows.map((le: any) => ({
        id: le.id,
        date: le.date,
        hours: le.hours,
        leaveType: le.leave_type,
        note: le.note,
        voidedAt: le.voided_at,
        voidReason: le.void_reason,
        voidedByUsername: le.voided_by_username,
        createdAt: le.created_at,
      })),
      salariedTimesheetLines: salariedLines.map((sl: any) => ({
        id: sl.id,
        date: sl.date,
        lineType: sl.line_type,
        hours: sl.hours,
        source: sl.source,
        note: sl.note,
        periodStart: sl.period_start,
        periodEnd: sl.period_end,
        timesheetStatus: sl.timesheet_status,
      })),
      auditTrail: auditResult.rows.map((a: any) => ({
        id: a.id,
        tableName: a.table_name,
        recordId: a.record_id,
        action: a.action,
        actorEmail: a.actor_email,
        actorRole: a.actor_role,
        oldValues: a.old_values,
        newValues: a.new_values,
        createdAt: a.created_at,
      })),
      payrollRelevance,
      timeline,
    });
  })
);

export default router;
