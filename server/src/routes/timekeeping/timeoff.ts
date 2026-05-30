import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { z } from "zod";
import { authenticateToken, authenticatePortalToken, requireRole } from "../../../middleware/auth";
import { requirePermission } from "../../../middleware/requirePermission";
import * as svc from "../../services/timekeeping/timeoff.service";
import {
  addManualPtoBalanceEvent,
  getPtoBalanceSummary,
  restorePtoForRequest,
  setPtoSchedule,
  normalizeWeeklyHours,
} from "../../services/timekeeping/ptoBalance.service";
import { actorFromUser, logAction } from "../../services/timekeeping/audit.service";
import type { SafeUser } from "../../services/timekeeping/audit.service";

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/timeoff]", err?.message ?? err);
    if (!res.headersSent) {
      const message = String(err?.message ?? "");
      const status = message.includes("required") || message.includes("not at") || message.includes("Insufficient PTO") || message.includes("PTO schedule") || message.includes("Selected dates")
        ? 400
        : 500;
      res.status(status).json({ error: err?.message ?? "Internal server error" });
    }
  });
}

const router: IRouter = Router();

async function resolveUserEmployeeId(user: SafeUser | undefined | null): Promise<number | null> {
  if (!user) return null;

  const username = String(user.username ?? "").trim();
  if (!username && user.id == null) return user.employeeId ?? null;

  const { pool } = await import("../../../db");
  const { rows } = await pool.query<{ id: number }>(
    `
      SELECT e.id
      FROM employees e
      LEFT JOIN users u ON u.id = $2
      WHERE e.id = u.employee_id
         OR e.id = $3
         OR LOWER(e.employee_code) = LOWER($1)
         OR (u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email))
         OR LOWER(CONCAT(
              REGEXP_REPLACE(SPLIT_PART(TRIM(e.name), ' ', 1), '[^[:alnum:]]', '', 'g'),
              LEFT(REGEXP_REPLACE((REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'))[ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'), 1)], '[^[:alnum:]]', '', 'g'), 1)
            )) = LOWER($1)
         OR LOWER(CONCAT(
              LEFT(REGEXP_REPLACE(SPLIT_PART(TRIM(e.name), ' ', 1), '[^[:alnum:]]', '', 'g'), 1),
              REGEXP_REPLACE((REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'))[ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'), 1)], '[^[:alnum:]]', '', 'g')
            )) = LOWER($1)
      ORDER BY
        CASE
          WHEN e.id = u.employee_id THEN 0
          WHEN LOWER(e.employee_code) = LOWER($1) THEN 1
          WHEN u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email) THEN 2
          WHEN LOWER(CONCAT(
                 REGEXP_REPLACE(SPLIT_PART(TRIM(e.name), ' ', 1), '[^[:alnum:]]', '', 'g'),
                 LEFT(REGEXP_REPLACE((REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'))[ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'), 1)], '[^[:alnum:]]', '', 'g'), 1)
               )) = LOWER($1) THEN 3
          WHEN LOWER(CONCAT(
                 LEFT(REGEXP_REPLACE(SPLIT_PART(TRIM(e.name), ' ', 1), '[^[:alnum:]]', '', 'g'), 1),
                 REGEXP_REPLACE((REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'))[ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'), 1)], '[^[:alnum:]]', '', 'g')
               )) = LOWER($1) THEN 4
          WHEN e.id = $3 THEN 5
          ELSE 6
        END,
        e.id ASC
      LIMIT 1
    `,
    [username, user.id ?? null, user.employeeId ?? null]
  );
  return rows[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const RequestUnitEnum = z.enum(["full_day", "half_day", "hourly", "multi_day"]);

const PortalCreateRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
  leaveType: z.enum(["pto", "sick", "unpaid", "other"]).default("pto"),
  requestUnit: RequestUnitEnum.default("full_day"),
  requestedHours: z.number().positive().optional(),
  partialDayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  employeeNote: z.string().max(1000).optional(),
});

const AdminCreateRequestSchema = z.object({
  employeeId: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leaveType: z.enum(["pto", "sick", "unpaid", "other"]).default("pto"),
  requestUnit: RequestUnitEnum.default("full_day"),
  requestedHours: z.number().positive().optional(),
  partialDayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  employeeNote: z.string().max(1000).optional(),
});

const StageReviewSchema = z.object({
  stage: z.enum(["supervisor", "hr", "vp"]).optional(),
  decision: z.enum(["approved", "denied"]),
  note: z.string().max(2000).optional(),
  // Legacy field
  adminNote: z.string().max(2000).optional(),
});

const PtoBalanceAdjustmentSchema = z.object({
  hours: z.number(),
  note: z.string().max(1000).optional(),
});

const WeeklyPtoScheduleSchema = z.object({
  weeklyHours: z.object({
    mon: z.number().min(0).max(24),
    tue: z.number().min(0).max(24),
    wed: z.number().min(0).max(24),
    thu: z.number().min(0).max(24),
    fri: z.number().min(0).max(24),
    sat: z.number().min(0).max(24),
    sun: z.number().min(0).max(24),
  }),
  effectiveStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Logged-in employee portal — submit/read own PTO
// ---------------------------------------------------------------------------
router.post(
  "/time-off/my",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    const user = req.user as SafeUser | undefined;
    const employeeId = user?.employeeId ?? null;
    if (!user || !employeeId) { res.status(403).json({ error: "Your account is not linked to an employee record" }); return; }

    const parse = PortalCreateRequestSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }
    const { startDate, endDate, requestUnit, requestedHours, partialDayDate, employeeNote } = parse.data;
    if (startDate > endDate) { res.status(400).json({ error: "startDate must not be after endDate" }); return; }
    if (requestUnit === "hourly" && !requestedHours) {
      res.status(400).json({ error: "requestedHours is required when requestUnit is 'hourly'" }); return;
    }

    const request = await svc.submitPTORequest({
      employeeId,
      startDate,
      endDate,
      leaveType: "pto",
      requestUnit,
      requestedHours: requestedHours ?? null,
      partialDayDate: partialDayDate ?? null,
      employeeNote,
      submittedByUserId: user.id,
      submittedOnBehalf: false,
      actorUser: user,
      actorIp: req.ip ?? null,
    });
    res.status(201).json(request);
  })
);

router.get(
  "/time-off/my",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    const employeeId = req.user?.employeeId ?? null;
    if (!employeeId) { res.status(403).json({ error: "Your account is not linked to an employee record" }); return; }

    const requests = await svc.getTimeOffRequestsByEmployee(employeeId);
    res.json(requests);
  })
);

router.get(
  "/time-off/my/balance",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    const employeeId = req.user?.employeeId ?? null;
    if (!employeeId) { res.status(403).json({ error: "Your account is not linked to an employee record" }); return; }

    const summary = await getPtoBalanceSummary(employeeId, { includeEvents: true });
    res.json(summary);
  })
);

// ---------------------------------------------------------------------------
// Employee portal — submit PTO
// ---------------------------------------------------------------------------
router.post(
  "/time-off/portal/:portalId",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    const employeeId = req.portalEmployeeId;
    if (!employeeId) { res.status(401).json({ error: "Portal auth required" }); return; }
    const parse = PortalCreateRequestSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }
    const { startDate, endDate, leaveType, requestUnit, requestedHours, partialDayDate, employeeNote } = parse.data;
    if (startDate > endDate) { res.status(400).json({ error: "startDate must not be after endDate" }); return; }
    if (requestUnit === "hourly" && !requestedHours) {
      res.status(400).json({ error: "requestedHours is required when requestUnit is 'hourly'" }); return;
    }
    const request = await svc.submitPTORequest({
      employeeId,
      startDate,
      endDate,
      leaveType: "pto",
      requestUnit,
      requestedHours: requestedHours ?? null,
      partialDayDate: partialDayDate ?? null,
      employeeNote,
      submittedOnBehalf: false,
      actorUser: null,
      actorIp: req.ip ?? null,
    });
    res.status(201).json(request);
  })
);

// ---------------------------------------------------------------------------
// Employee portal — read own requests
// ---------------------------------------------------------------------------
router.get(
  "/time-off/portal/:portalId",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    const employeeId = req.portalEmployeeId;
    if (!employeeId) { res.status(401).json({ error: "Portal auth required" }); return; }
    const requests = await svc.getTimeOffRequestsByEmployee(employeeId);
    res.json(requests);
  })
);

// ---------------------------------------------------------------------------
// Clock-in check (existing — unchanged)
// ---------------------------------------------------------------------------
router.get(
  "/time-off/clock-in-check/:employeeId",
  authenticateToken,
  requireRole("ADMIN", "OWNER"),
  h(async (req, res): Promise<void> => {
    const employeeId = parseInt(req.params.employeeId, 10);
    if (isNaN(employeeId)) { res.status(400).json({ error: "Invalid employee ID" }); return; }
    const today = new Date().toISOString().slice(0, 10);
    const approved = await svc.getApprovedTimeOffForEmployee(employeeId);
    const onLeaveToday = approved.some((r) => r.startDate <= today && r.endDate >= today);
    res.json({ onLeaveToday, today });
  })
);

// ---------------------------------------------------------------------------
// Admin — list all requests with optional filters
// ---------------------------------------------------------------------------
router.get(
  "/time-off",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (req, res): Promise<void> => {
    const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
    const employeeIdRaw = typeof req.query.employeeId === "string" ? parseInt(req.query.employeeId, 10) : undefined;
    const employeeIdFilter = employeeIdRaw && !isNaN(employeeIdRaw) ? employeeIdRaw : undefined;
    const startDateFilter = typeof req.query.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate) ? req.query.startDate : undefined;
    const endDateFilter = typeof req.query.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate) ? req.query.endDate : undefined;
    const requests = await svc.getAllTimeOffRequests(statusFilter, employeeIdFilter, startDateFilter, endDateFilter);
    res.json(requests);
  })
);

router.get(
  "/time-off/:employeeId/balance",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (req, res): Promise<void> => {
    const employeeId = parseInt(req.params.employeeId, 10);
    if (isNaN(employeeId)) { res.status(400).json({ error: "Invalid employee ID" }); return; }
    const summary = await getPtoBalanceSummary(employeeId, { includeEvents: true });
    res.json(summary);
  })
);

router.post(
  "/time-off/:employeeId/balance-adjustment",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (req, res): Promise<void> => {
    const employeeId = parseInt(req.params.employeeId, 10);
    if (isNaN(employeeId)) { res.status(400).json({ error: "Invalid employee ID" }); return; }
    const parse = PtoBalanceAdjustmentSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }
    const user = req.user as SafeUser | undefined;
    const summary = await addManualPtoBalanceEvent({
      employeeId,
      hours: parse.data.hours,
      note: parse.data.note,
      actorUserId: user?.id ?? null,
    });
    res.json(summary);
  })
);

router.put(
  "/time-off/:employeeId/schedule",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (req, res): Promise<void> => {
    const employeeId = parseInt(req.params.employeeId, 10);
    if (isNaN(employeeId)) { res.status(400).json({ error: "Invalid employee ID" }); return; }
    const parse = WeeklyPtoScheduleSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }
    const user = req.user as SafeUser | undefined;
    const schedule = await setPtoSchedule({
      employeeId,
      weeklyHours: normalizeWeeklyHours(parse.data.weeklyHours),
      effectiveStart: parse.data.effectiveStart,
      note: parse.data.note,
      actorUserId: user?.id ?? null,
    });
    res.json({ employeeId, schedule });
  })
);

// ---------------------------------------------------------------------------
// Admin — get approved PTO for calendar / scheduling visibility
// ---------------------------------------------------------------------------
router.get(
  "/time-off/approved",
  authenticateToken,
  requirePermission("timekeeping.pto.view_all"),
  h(async (req, res): Promise<void> => {
    const requests = await svc.getApprovedTimeOffAll();
    res.json(requests);
  })
);

// ---------------------------------------------------------------------------
// Admin — pending requests visible to the current user's capability
// ---------------------------------------------------------------------------
router.get(
  "/time-off/pending-for-me",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    const user = req.user as SafeUser | undefined;
    if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

    const isAdminOwner = user.role === "ADMIN" || user.role === "OWNER";

    // Capability → stage mapping
    const { getUserPermissions } = await import("../../services/permissionService");
    const perms = isAdminOwner
      ? null
      : (await getUserPermissions(user.id, user.role)).permissionSet;

    // Determine which stages the caller can act on
    const stageStatuses: string[] = [];
    if (isAdminOwner) {
      stageStatuses.push("pending_supervisor", "pending_hr", "pending_vp");
    } else {
      if (perms?.has("timekeeping.pto.approve_supervisor")) stageStatuses.push("pending_supervisor");
      if (perms?.has("timekeeping.pto.approve_hr")) stageStatuses.push("pending_hr");
      if (perms?.has("timekeeping.pto.approve_vp")) stageStatuses.push("pending_vp");
    }

    if (stageStatuses.length === 0) {
      res.json([]);
      return;
    }

    // Fetch all matching stages (union)
    const results = await Promise.all(
      stageStatuses.map((s) => svc.getAllTimeOffRequests(s))
    );
    const seen = new Set<number>();
    const merged = results.flat().filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    res.json(merged);
  })
);

// ---------------------------------------------------------------------------
// Admin — on-behalf submission
// ---------------------------------------------------------------------------
router.post(
  "/time-off",
  authenticateToken,
  requirePermission("timekeeping.pto.submit_on_behalf"),
  h(async (req, res): Promise<void> => {
    const parse = AdminCreateRequestSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }
    const { employeeId, startDate, endDate, requestUnit, requestedHours, partialDayDate, employeeNote } = parse.data;
    if (startDate > endDate) { res.status(400).json({ error: "startDate must not be after endDate" }); return; }
    if (requestUnit === "hourly" && !requestedHours) {
      res.status(400).json({ error: "requestedHours is required when requestUnit is 'hourly'" }); return;
    }
    const user = req.user as SafeUser;
    const request = await svc.submitPTORequest({
      employeeId,
      startDate,
      endDate,
      leaveType: "pto",
      requestUnit,
      requestedHours: requestedHours ?? null,
      partialDayDate: partialDayDate ?? null,
      employeeNote,
      submittedByUserId: user.id,
      submittedOnBehalf: true,
      actorUser: user,
      actorIp: req.ip ?? null,
    });
    res.status(201).json(request);
  })
);

// ---------------------------------------------------------------------------
// Stage review endpoint
// ---------------------------------------------------------------------------
router.post(
  "/time-off/:id/review",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid request ID" }); return; }

    const parse = StageReviewSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }

    const { stage, decision, note, adminNote } = parse.data;
    const user = req.user as SafeUser | undefined;
    if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

    const resolvedNote = note ?? adminNote;
    const isAdminOrOwner = user.role === "ADMIN" || user.role === "OWNER";

    // Legacy path: no stage provided and caller is ADMIN/OWNER
    if (!stage && isAdminOrOwner) {
      if (decision === "denied" && (!resolvedNote || resolvedNote.trim() === "")) {
        res.status(400).json({ error: "A denial reason is required." }); return;
      }
      const updated = await svc.reviewTimeOffRequest(id, decision, resolvedNote, user, req.ip ?? null);
      if (!updated) { res.status(404).json({ error: "Time-off request not found or not in a reviewable state" }); return; }
      res.json(updated);
      return;
    }

    // Staged path
    if (!stage) {
      res.status(400).json({ error: "stage is required (supervisor | hr | vp)" }); return;
    }

    // Gate each stage behind matching capability
    const stageCapMap: Record<string, string> = {
      supervisor: "timekeeping.pto.approve_supervisor",
      hr: "timekeeping.pto.approve_hr",
      vp: "timekeeping.pto.approve_vp",
    };

    // ADMIN/OWNER bypass capability check
    if (!isAdminOrOwner) {
      let isAssignedSupervisorReviewer = false;

      // Supervisor stage: assigned supervisors can review their own direct reports
      // even if they do not carry the broader PTO supervisor capability.
      if (stage === "supervisor") {
        const reviewerEpochEmployeeId: number | null = await resolveUserEmployeeId(user);
        if (reviewerEpochEmployeeId === null) {
          res.status(403).json({ error: "Your account is not linked to an employee record and cannot perform supervisor reviews." }); return;
        }
        const { pool } = await import("../../../db");
        const { rows } = await pool.query<{ supervisor_id: number | null }>(
          `
            SELECT COALESCE(r.supervisor_id, e.supervisor_employee_id) AS supervisor_id
            FROM timekeeping.time_off_requests r
            LEFT JOIN employees e ON e.id = r.employee_id
            WHERE r.id = $1
            LIMIT 1
          `,
          [id],
        );
        const assignedSupervisorId = rows[0]?.supervisor_id ?? null;
        if (assignedSupervisorId !== null && assignedSupervisorId !== reviewerEpochEmployeeId) {
          res.status(403).json({ error: "You are not the assigned supervisor for this request." }); return;
        }
        isAssignedSupervisorReviewer = assignedSupervisorId === reviewerEpochEmployeeId;
      }

      const requiredCap = stageCapMap[stage];
      if (requiredCap) {
        const { getUserPermissions } = await import("../../services/permissionService");
        const { permissionSet } = await getUserPermissions(user.id, user.role);
        if (!permissionSet.has(requiredCap) && !isAssignedSupervisorReviewer) {
          res.status(403).json({ error: `Missing capability: ${requiredCap}` }); return;
        }
      }
    }

    if (decision === "denied" && (!resolvedNote || resolvedNote.trim() === "")) {
      res.status(400).json({ error: "A denial reason is required." }); return;
    }

    try {
      const updated = await svc.reviewPTOStage(
        id,
        stage,
        decision,
        resolvedNote,
        user.id,
        user,
        req.ip ?? null
      );
      if (!updated) { res.status(404).json({ error: "Time-off request not found" }); return; }
      res.json(updated);
    } catch (err: any) {
      if (err?.message?.includes("not at")) {
        res.status(409).json({ error: err.message }); return;
      }
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// Employee self-cancel — only allowed before final approval.
// Restricted to the request owner; ADMIN/OWNER users must use the
// /admin/time-off/:id/cancel route (which enforces a mandatory reason).
// ---------------------------------------------------------------------------
const EmployeeCancelSchema = z.object({
  reason: z.string().max(1000).optional(),
});

router.post(
  "/time-off/:id/cancel",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid request ID" }); return; }

    const user = req.user as SafeUser | undefined;
    if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

    const parse = EmployeeCancelSchema.safeParse(req.body);
    const reason = parse.success ? (parse.data.reason ?? "") : "";

    const { db } = await import("../../../db");
    const { timeOffRequestsTable } = await import("../../schema/timekeeping");
    const { eq } = await import("drizzle-orm");

    const [existing] = await db
      .select()
      .from(timeOffRequestsTable)
      .where(eq(timeOffRequestsTable.id, id))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Time-off request not found" }); return; }

    // Only the employee who submitted the request may use this route.
    // Admins/Owners must use POST /admin/time-off/:id/cancel which requires a reason.
    const isOwner = existing.submittedByUserId === user.id || existing.employeeId === user.employeeId;
    if (!isOwner) {
      res.status(403).json({ error: "You can only cancel your own PTO requests. Admins must use the admin cancel endpoint." });
      return;
    }

    const cancellableStatuses = ["pending_supervisor", "pending_hr", "pending_vp", "pending"];
    if (!cancellableStatuses.includes(existing.status)) {
      res.status(409).json({
        error: `Cannot self-cancel a request with status '${existing.status}'. Use the admin cancel route for approved requests.`,
      });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(timeOffRequestsTable)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(timeOffRequestsTable.id, id))
      .returning();

    await logAction({
      tableName: "time_off_requests",
      recordId: id,
      action: "UPDATE",
      oldValues: { status: existing.status },
      newValues: { status: "cancelled", cancelledBy: user.id, reason: reason || null, cancelledAt: now.toISOString() },
      actor: actorFromUser(user, req.ip ?? null),
    });

    await restorePtoForRequest({
      employeeId: existing.employeeId,
      requestId: id,
      reason: "cancelled",
      actorUserId: user.id,
    });

    res.json(updated);
  })
);

// ---------------------------------------------------------------------------
// Admin cancel — any stage including post-approval, triggers reversal if approved
// ---------------------------------------------------------------------------
const AdminCancelSchema = z.object({
  reason: z.string().min(1, "reason is required").max(2000),
});

router.post(
  "/admin/time-off/:id/cancel",
  authenticateToken,
  requireRole("ADMIN", "OWNER"),
  h(async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid request ID" }); return; }

    const parse = AdminCancelSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.errors[0]?.message ?? "reason is required" }); return; }

    const { reason } = parse.data;
    const user = req.user as SafeUser | undefined;
    if (!user) { res.status(401).json({ error: "Authentication required" }); return; }

    // Delegates to service: status update + optional reversal happen in ONE transaction
    const result = await svc.adminCancelTimeOffRequest(id, user, reason, req.ip ?? null);

    if (!result) { res.status(404).json({ error: "Time-off request not found" }); return; }

    res.json({
      ...result.request,
      reversalTriggered: result.reversalTriggered,
    });
  })
);

export default router;
