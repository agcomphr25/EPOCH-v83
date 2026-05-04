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

const router: IRouter = Router();

router.get(
  "/pto-command-center/summary",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (req, res): Promise<void> => {
    const { isAdmin, caps } = await getCallerCapabilities(req);
    const callerCaps = isAdmin
      ? ["timekeeping.pto.approve_supervisor", "timekeeping.pto.approve_hr", "timekeeping.pto.approve_vp", "timekeeping.pto.view_all"]
      : Array.from(caps).filter((c: string) => c.startsWith("timekeeping.pto."));

    const today = new Date().toISOString().slice(0, 10);
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const in7DaysStr = in7Days.toISOString().slice(0, 10);

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
          COUNT(*) FILTER (WHERE status = 'approved' AND start_date <= $2 AND end_date >= $1 AND start_date > $1) AS upcoming_7_days
        FROM timekeeping.time_off_requests
      )
      SELECT * FROM status_counts
    `, [today, in7DaysStr]);

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
      callerCapabilities: callerCaps,
      isAdmin,
    });
  })
);

router.get(
  "/pto-command-center/pipeline",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
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
      WHERE r.status IN ('pending_supervisor', 'pending_hr', 'pending_vp', 'pending')
      ORDER BY r.created_at ASC
    `);

    const callerEmployeeId = (req.user as any)?.employeeId ?? null;
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
        stageAgeHours: Math.round(Number(row.stage_age_hours) * 10) / 10,
        isStuck: Number(row.stage_age_hours) > 48,
      });
    }

    const callerCaps = isAdmin
      ? ["timekeeping.pto.approve_supervisor", "timekeeping.pto.approve_hr", "timekeeping.pto.approve_vp", "timekeeping.pto.view_all"]
      : Array.from(caps).filter((c: string) => c.startsWith("timekeeping.pto."));

    res.json({
      pipeline,
      counts: {
        pending_supervisor: pipeline.pending_supervisor.length,
        pending_hr: pipeline.pending_hr.length,
        pending_vp: pipeline.pending_vp.length,
      },
      stuckCount: rows.filter((r: any) => Number(r.stage_age_hours) > 48).length,
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
    const [missingSupervisor, stuckRequests, orphanedRequests] = await Promise.all([
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
            r.created_at,
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
        WHERE sub.stage_age_hours > 48
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

    res.json({
      missingSupervisor: missingSupervisor.rows.map((r: any) => ({
        employeeId: r.employee_id,
        employeeName: r.employee_name,
      })),
      stuckRequests: stuckRequests.rows.map((r: any) => ({
        id: r.id,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        status: r.status,
        stageAgeHours: Math.round(Number(r.stage_age_hours) * 10) / 10,
        createdAt: r.created_at,
      })),
      orphanedRequests: orphanedRequests.rows.map((r: any) => ({
        id: r.id,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        status: r.status,
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

export default router;
