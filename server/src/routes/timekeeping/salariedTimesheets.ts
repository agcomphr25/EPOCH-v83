/**
 * Salaried Timesheet Routes — Phase 1 (read) + Phase B (approval + accounting)
 *
 * All mutating endpoints check the feature flag before serving.
 *
 * Mounted at: /api/timekeeping  (via routes/index.ts)
 *
 * Read routes (session-authenticated):
 *   GET  /salaried-timesheet/indirect-codes
 *   GET  /salaried-timesheet/admin/review
 *   GET  /salaried-timesheet/:id/cost-audit
 *
 * Read routes (portal-authenticated):
 *   GET  /salaried-timesheet/portal/:portalId/my/list
 *   GET  /salaried-timesheet/portal/:portalId/my/:weekStart
 *
 * Approval workflow routes (session-authenticated, Phase B):
 *   POST /salaried-timesheet/:id/certify           OPEN|REOPENED → SUBMITTED
 *   POST /salaried-timesheet/:id/supervisor-approve SUBMITTED → SUPERVISOR_APPROVED
 *   POST /salaried-timesheet/:id/payroll-approve   SUPERVISOR_APPROVED → PAYROLL_APPROVED
 *                                                  → triggers labor_cost_record creation
 *   POST /salaried-timesheet/:id/reopen            PAYROLL_APPROVED → REOPENED
 *                                                  → blocks if GL-posted
 */

import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from "express";
import { authenticateToken, authenticatePortalToken } from "../../../middleware/auth";
import { requirePermission } from "../../../middleware/requirePermission";
import { getOrCreateSettings } from "../../services/timekeeping/settings.service";
import * as svc from "../../services/timekeeping/salariedTimesheet.service";
import * as costSvc from "../../services/timekeeping/salariedLaborCostingService";
import { DraftNeedsReviewError } from "../../services/timekeeping/salariedLaborCostingService";
import { z } from "zod";
import { db } from "../../../db";
import { employees } from "../../../schema";
import {
  salariedTimesheetsTable,
  salariedTimesheetLinesTable,
  salariedTimesheetAuditTable,
  laborEntryDraftsTable,
  employeesTable,
} from "../../schema/timekeeping";
import { eq, and, gte, lte, inArray } from "drizzle-orm";

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/salariedTimesheets]", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: err?.message ?? "Internal server error" });
  });
}

const router: IRouter = Router();

const WEEK_START_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Feature-flag guard — returns 404 if salaried_timesheet_enabled = false.
// ---------------------------------------------------------------------------
async function requireFeatureFlag(req: Request, res: Response): Promise<boolean> {
  try {
    const settings = await getOrCreateSettings();
    if (!(settings as any).salariedTimesheetEnabled) {
      res.status(404).json({ error: "Salaried timesheet feature is not enabled" });
      return false;
    }
  } catch {
    res.status(404).json({ error: "Salaried timesheet feature is not enabled" });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Verify that the portal employee is a SALARY employee.
// ---------------------------------------------------------------------------
async function requireSalaryPayType(
  epochEmployeeId: number,
  res: Response,
): Promise<{ name: string } | null> {
  const [emp] = await db
    .select({ payType: employees.payType, name: employees.name })
    .from(employees)
    .where(eq(employees.id, epochEmployeeId));

  if (!emp || emp.payType?.toUpperCase() !== "SALARY") {
    res.status(403).json({ error: "Salaried timesheets are only available to salaried employees" });
    return null;
  }
  return { name: emp.name };
}

async function requireSessionSalaryEmployee(
  req: Request,
  res: Response,
): Promise<{ employeeId: number; name: string } | null> {
  const epochEmployeeId = (req as any).user?.employeeId ?? null;
  if (!epochEmployeeId) {
    res.status(403).json({ error: "Your account is not linked to an employee record" });
    return null;
  }
  const emp = await requireSalaryPayType(epochEmployeeId, res);
  if (!emp) return null;
  return { employeeId: epochEmployeeId, name: emp.name };
}

// ---------------------------------------------------------------------------
// Load timesheet by ID — 404 if not found.
// ---------------------------------------------------------------------------
async function loadTimesheet(
  id: number,
  res: Response,
): Promise<typeof salariedTimesheetsTable.$inferSelect | null> {
  const [ts] = await db
    .select()
    .from(salariedTimesheetsTable)
    .where(eq(salariedTimesheetsTable.id, id))
    .limit(1);

  if (!ts) {
    res.status(404).json({ error: `Salaried timesheet ${id} not found` });
    return null;
  }
  return ts;
}

// ---------------------------------------------------------------------------
// Write an immutable audit record.
// ---------------------------------------------------------------------------
async function writeAudit(params: {
  timesheetId: number;
  lineId?: number | null;
  action: string;
  actorId?: number | null;
  actorName?: string | null;
  actorRole?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  reason?: string | null;
  source?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  await db.insert(salariedTimesheetAuditTable).values({
    timesheetId: params.timesheetId,
    lineId: params.lineId ?? null,
    action: params.action,
    actorId: params.actorId ?? null,
    actorName: params.actorName ?? null,
    actorRole: params.actorRole ?? null,
    beforeState: params.beforeState ?? null,
    afterState: params.afterState ?? null,
    reason: params.reason ?? null,
    source: params.source ?? "API",
    ipAddress: params.ipAddress ?? null,
  });
}

// ---------------------------------------------------------------------------
// GET /api/timekeeping/salaried-timesheet/indirect-codes
// ---------------------------------------------------------------------------
router.get(
  "/salaried-timesheet/indirect-codes",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;
    const codes = await svc.getIndirectCodes();
    res.json(codes);
  }),
);

// ---------------------------------------------------------------------------
// GET /api/timekeeping/salaried-timesheet/admin/review
// ---------------------------------------------------------------------------
router.get(
  "/salaried-timesheet/admin/review",
  authenticateToken,
  requirePermission("timekeeping.salaried.view_review_queue"),
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;
    const queue = await svc.getAdminReviewQueue();
    const user = (req as any).user;
    if (user?.role === "ADMIN" || user?.role === "OWNER") {
      res.json(queue);
      return;
    }

    const callerEmployeeId: number | null = user?.employeeId ?? null;
    if (!callerEmployeeId) {
      res.json([]);
      return;
    }

    const employeeIds = [...new Set(queue.map((row) => row.timesheet.employeeId))];
    if (employeeIds.length === 0) {
      res.json([]);
      return;
    }

    const employeeRows = await db
      .select({ id: employees.id, supervisorEmployeeId: employees.supervisorEmployeeId })
      .from(employees)
      .where(inArray(employees.id, employeeIds));
    const supervisorByEmployee = new Map(employeeRows.map((row) => [row.id, row.supervisorEmployeeId ?? null]));

    res.json(queue.filter((row) => {
      const assigned = row.timesheet.supervisorEmployeeId ?? supervisorByEmployee.get(row.timesheet.employeeId) ?? null;
      return assigned === callerEmployeeId;
    }));
  }),
);

// ---------------------------------------------------------------------------
// GET /api/timekeeping/salaried-timesheet/:id/cost-audit
// DCAA audit view — full traceability for every labor cost record on a timesheet.
// ---------------------------------------------------------------------------
router.get(
  "/salaried-timesheet/:id/cost-audit",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;
    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid timesheet ID" }); return; }
    const audit = await costSvc.getSalariedLaborCostAudit(id);
    res.json(audit);
  }),
);

// ---------------------------------------------------------------------------
// Portal routes
// ---------------------------------------------------------------------------

router.get(
  "/salaried-timesheet/portal/:portalId/my/list",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }

    const emp = await requireSalaryPayType(epochEmployeeId, res);
    if (!emp) return;

    const sheets = await svc.getSalariedTimesheetList(epochEmployeeId);
    res.json(sheets);
  }),
);

router.get(
  "/salaried-timesheet/portal/:portalId/my/:weekStart",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }

    const { weekStart } = req.params;
    if (!weekStart || !WEEK_START_RE.test(weekStart)) {
      res.status(400).json({ error: "weekStart must be YYYY-MM-DD" });
      return;
    }

    const emp = await requireSalaryPayType(epochEmployeeId, res);
    if (!emp) return;

    const view = await svc.getSalariedTimesheetView(epochEmployeeId, weekStart);
    res.json(view);
  }),
);

// ===========================================================================
// PHASE B — Approval Workflow Routes
// All routes are session-authenticated and feature-flag-gated.
// State machine: OPEN → SUBMITTED → SUPERVISOR_APPROVED → PAYROLL_APPROVED
//                PAYROLL_APPROVED → REOPENED → SUBMITTED (recertify)
// ===========================================================================

const DCAA_CERTIFICATION_STATEMENT =
  "I certify that the time recorded for this period is complete, accurate, and represents work I actually performed.";
const DCAA_CERTIFICATION_VERSION = 1;

const certifyBodySchema = z.object({
  certificationConfirmed: z.literal(true),
});

const supervisorApproveBodySchema = z.object({
  note: z.string().max(2000).optional(),
});

const supervisorRejectBodySchema = z.object({
  note: z.string().min(3, "A rejection note is required.").max(2000),
});

// ---------------------------------------------------------------------------
// Session-authenticated employee portal routes.
// These mirror the portal-token routes for normal logged-in employee portal use.
// ---------------------------------------------------------------------------

router.get(
  "/salaried-timesheet/my/indirect-codes",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;
    const emp = await requireSessionSalaryEmployee(req, res);
    if (!emp) return;
    const codes = await svc.getIndirectCodes();
    res.json(codes);
  }),
);

router.get(
  "/salaried-timesheet/my/travelers/all",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;
    const emp = await requireSessionSalaryEmployee(req, res);
    if (!emp) return;
    const travelers = await svc.getAllActiveTravelers();
    res.json(travelers);
  }),
);

router.get(
  "/salaried-timesheet/my/:weekStart",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;
    const emp = await requireSessionSalaryEmployee(req, res);
    if (!emp) return;

    const { weekStart } = req.params;
    if (!weekStart || !WEEK_START_RE.test(weekStart)) {
      res.status(400).json({ error: "weekStart must be YYYY-MM-DD" });
      return;
    }

    const view = await svc.getSalariedTimesheetView(emp.employeeId, weekStart);
    res.json(view);
  }),
);

// ---------------------------------------------------------------------------
// POST /api/timekeeping/salaried-timesheet/:id/certify
// Employee self-certifies the timesheet (attestation).
// Valid from: OPEN, REOPENED
// Transitions to: SUBMITTED
// ---------------------------------------------------------------------------
router.post(
  "/salaried-timesheet/:id/certify",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid timesheet ID" }); return; }

    const bodyParsed = certifyBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({
        error: "certificationConfirmed must be explicitly true. The employee must check the certification checkbox before submitting.",
      });
      return;
    }

    const ts = await loadTimesheet(id, res);
    if (!ts) return;
    if (!(await requireSalaryPayType(ts.employeeId, res))) return;

    const user = (req as any).user;
    const userId: number | null = user?.id ?? null;
    const userName: string | null = user?.name ?? user?.username ?? null;

    // Ownership check: this endpoint is employee self-certification only.
    // Privileged roles may not bypass this — use the admin override endpoint instead.
    const PRIVILEGED_ROLES = new Set(["ADMIN", "OWNER", "SUPERVISOR", "MANAGER"]);
    const callerEmployeeId: number | null = user?.employeeId ?? null;
    if (callerEmployeeId === null || ts.employeeId !== callerEmployeeId) {
      if (!PRIVILEGED_ROLES.has(user?.role ?? "")) {
        res.status(403).json({ error: "You may only certify your own timesheet." });
        return;
      }
      // Privileged user attempting to self-certify via this endpoint is also disallowed —
      // they must use the explicit admin-override path.
      res.status(403).json({
        error: "Privileged users must certify via the admin-override endpoint, not the self-certification endpoint.",
      });
      return;
    }

    // Validate state transition
    if (ts.status !== "OPEN" && ts.status !== "REOPENED") {
      res.status(409).json({
        error: `Cannot certify timesheet in status '${ts.status}'. Expected OPEN or REOPENED.`,
        currentStatus: ts.status,
      });
      return;
    }

    const [employeeRow] = await db
      .select({ supervisorEmployeeId: employees.supervisorEmployeeId })
      .from(employees)
      .where(eq(employees.id, ts.employeeId))
      .limit(1);
    const supervisorEmployeeId = employeeRow?.supervisorEmployeeId ?? null;
    if (!supervisorEmployeeId) {
      res.status(409).json({
        error: "This salaried employee has no supervisor assigned. Assign a supervisor on the employee profile before submitting.",
      });
      return;
    }

    const previousStatus = ts.status;
    const now = new Date();
    const totalActualHours = await svc.recalculateTimesheetTotal(id);

    // Update timesheet — write certification fields atomically
    const [updated] = await db
      .update(salariedTimesheetsTable)
      .set({
        status: "SUBMITTED",
        certifiedAt: now,
        certifiedBy: userId,
        certificationStatement: DCAA_CERTIFICATION_STATEMENT,
        certificationVersion: DCAA_CERTIFICATION_VERSION,
        supervisorEmployeeId,
        supervisorApprovedAt: null,
        supervisorApprovedBy: null,
        supervisorApprovalNote: null,
      })
      .where(eq(salariedTimesheetsTable.id, id))
      .returning();

    // Fetch line-hours snapshot for immutable audit evidence
    const lines = await db
      .select()
      .from(salariedTimesheetLinesTable)
      .where(eq(salariedTimesheetLinesTable.timesheetId, id));

    // Immutable audit record — TIME_CERTIFIED event
    await writeAudit({
      timesheetId: id,
      action: "TIME_CERTIFIED",
      actorId: userId,
      actorName: userName,
      actorRole: user?.role ?? null,
      beforeState: { status: previousStatus },
      afterState: {
        status: "SUBMITTED",
        certifiedAt: updated?.certifiedAt,
        certificationStatement: DCAA_CERTIFICATION_STATEMENT,
        certificationVersion: DCAA_CERTIFICATION_VERSION,
        certifiedByUserId: userId,
        supervisorEmployeeId,
        periodStart: ts.periodStart,
        periodEnd: ts.periodEnd,
        totalActualHours,
        linesSnapshot: lines.map((l) => ({
          id: l.id,
          date: l.date,
          hours: l.hours,
          chargeCodeId: l.chargeCodeId,
          travelerId: l.travelerId,
          note: l.note,
        })),
      },
      ipAddress: req.ip,
    });

    const { notifySalariedTimesheetApprovalNeeded } = await import("../../services/timekeeping/approvalNotifications.service");
    void notifySalariedTimesheetApprovalNeeded(id);

    res.json({
      timesheetId: id,
      status: "SUBMITTED",
      certifiedAt: updated?.certifiedAt,
      message: "Timesheet certified and submitted for supervisor review.",
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/timekeeping/salaried-timesheet/:id/supervisor-approve
// Supervisor approves the submitted timesheet.
// Valid from: SUBMITTED
// Transitions to: SUPERVISOR_APPROVED
// ---------------------------------------------------------------------------
router.post(
  "/salaried-timesheet/:id/supervisor-approve",
  authenticateToken,
  requirePermission("timekeeping.salaried.approve_supervisor"),
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid timesheet ID" }); return; }

    const ts = await loadTimesheet(id, res);
    if (!ts) return;
    if (!(await requireSalaryPayType(ts.employeeId, res))) return;

    const user = (req as any).user;
    const userId: number | null = user?.id ?? null;
    const userName: string | null = user?.name ?? user?.username ?? null;
    const parsedBody = supervisorApproveBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({ error: "Validation failed", details: parsedBody.error.flatten() });
      return;
    }
    const note = parsedBody.data.note?.trim() || null;

    if (ts.status !== "SUBMITTED") {
      res.status(409).json({
        error: `Cannot supervisor-approve timesheet in status '${ts.status}'. Expected SUBMITTED.`,
        currentStatus: ts.status,
      });
      return;
    }

    const callerEmployeeId: number | null = user?.employeeId ?? null;
    const isAdminOwner = user?.role === "ADMIN" || user?.role === "OWNER";
    if (!callerEmployeeId && !isAdminOwner) {
      res.status(403).json({ error: "Your account is not linked to an employee record and cannot approve salaried timesheets." });
      return;
    }
    if (callerEmployeeId && ts.employeeId === callerEmployeeId) {
      res.status(403).json({ error: "You cannot supervisor-approve your own salaried timesheet." });
      return;
    }

    let assignedSupervisorId: number | null = ts.supervisorEmployeeId ?? null;
    if (!assignedSupervisorId) {
      const [employeeRow] = await db
        .select({ supervisorEmployeeId: employees.supervisorEmployeeId })
        .from(employees)
        .where(eq(employees.id, ts.employeeId))
        .limit(1);
      assignedSupervisorId = employeeRow?.supervisorEmployeeId ?? null;
    }
    if (!assignedSupervisorId) {
      res.status(409).json({ error: "This salaried employee has no supervisor assigned. Assign one before approval." });
      return;
    }
    if (assignedSupervisorId !== callerEmployeeId && !isAdminOwner) {
      res.status(403).json({ error: "You are not the assigned supervisor for this salaried timesheet." });
      return;
    }

    // ── WARNING BADGE: check for NEEDS_REVIEW drafts (non-blocking) ──────────
    // Resolve timekeeping employee ID from the timesheet's epoch employee ID
    let needsReviewDraftCount = 0;
    let needsReviewDraftIds: number[] = [];
    try {
      const [tkEmpRow] = await db
        .select({ id: employeesTable.id })
        .from(employeesTable)
        .where(eq(employeesTable.epochEmployeeId, ts.employeeId))
        .limit(1);
      if (tkEmpRow) {
        const nrDrafts = await db
          .select({ id: laborEntryDraftsTable.id })
          .from(laborEntryDraftsTable)
          .where(
            and(
              eq(laborEntryDraftsTable.employeeId, tkEmpRow.id),
              eq(laborEntryDraftsTable.status, "NEEDS_REVIEW"),
              gte(laborEntryDraftsTable.entryDate, ts.periodStart),
              lte(laborEntryDraftsTable.entryDate, ts.periodEnd),
            ),
          );
        needsReviewDraftCount = nrDrafts.length;
        needsReviewDraftIds = nrDrafts.map((d) => d.id);
      }
    } catch (warnLookupErr: any) {
      // Non-blocking — warning badge query failure does not block approval,
      // but log for observability so silently missing badges are detectable.
      console.warn(
        "[salariedTimesheets] supervisor-approve: NEEDS_REVIEW draft lookup failed " +
        `for timesheet ${id} — warning badge suppressed. Error: ${warnLookupErr?.message ?? String(warnLookupErr)}`,
      );
    }

    const [updated] = await db
      .update(salariedTimesheetsTable)
      .set({
        status: "SUPERVISOR_APPROVED",
        supervisorApprovedAt: new Date(),
        supervisorApprovedBy: userId,
        supervisorEmployeeId: assignedSupervisorId,
        supervisorApprovalNote: note,
      })
      .where(and(eq(salariedTimesheetsTable.id, id), eq(salariedTimesheetsTable.status, "SUBMITTED")))
      .returning();
    if (!updated) {
      res.status(409).json({ error: "Timesheet was already reviewed by another session. Refresh and try again." });
      return;
    }

    await writeAudit({
      timesheetId: id,
      action: "SUPERVISOR_APPROVED",
      actorId: userId,
      actorName: userName,
      actorRole: user?.role ?? null,
      beforeState: { status: "SUBMITTED" },
      afterState: {
        status: "SUPERVISOR_APPROVED",
        supervisorApprovedAt: updated?.supervisorApprovedAt,
        supervisorApprovedBy: userId,
        supervisorEmployeeId: assignedSupervisorId,
        supervisorApprovalNote: note,
        needsReviewDraftCount,
        needsReviewDraftIds,
      },
      ipAddress: req.ip,
    });

    res.json({
      timesheetId: id,
      status: "SUPERVISOR_APPROVED",
      supervisorApprovedAt: updated?.supervisorApprovedAt,
      ...(needsReviewDraftCount > 0 && {
        warning: {
          code: "DRAFT_NEEDS_REVIEW",
          message: `${needsReviewDraftCount} labor entry draft(s) for this week have unresolved validation errors. Resolve them before payroll approval or they will block the final step.`,
          needsReviewDraftCount,
          needsReviewDraftIds,
        },
      }),
      message: "Timesheet approved by supervisor and queued for payroll approval.",
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/timekeeping/salaried-timesheet/:id/supervisor-reject
// Supervisor returns a submitted timesheet to the employee for correction.
// Valid from: SUBMITTED
// Transitions to: REOPENED
// ---------------------------------------------------------------------------
router.post(
  "/salaried-timesheet/:id/supervisor-reject",
  authenticateToken,
  requirePermission("timekeeping.salaried.approve_supervisor"),
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid timesheet ID" }); return; }

    const parsedBody = supervisorRejectBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.flatten().fieldErrors.note?.[0] ?? "A rejection note is required." });
      return;
    }
    const note = parsedBody.data.note.trim();

    const ts = await loadTimesheet(id, res);
    if (!ts) return;
    if (!(await requireSalaryPayType(ts.employeeId, res))) return;

    if (ts.status !== "SUBMITTED") {
      res.status(409).json({
        error: `Cannot reject timesheet in status '${ts.status}'. Expected SUBMITTED.`,
        currentStatus: ts.status,
      });
      return;
    }

    const user = (req as any).user;
    const userId: number | null = user?.id ?? null;
    const userName: string | null = user?.name ?? user?.username ?? null;
    const callerEmployeeId: number | null = user?.employeeId ?? null;
    const isAdminOwner = user?.role === "ADMIN" || user?.role === "OWNER";
    if (!callerEmployeeId && !isAdminOwner) {
      res.status(403).json({ error: "Your account is not linked to an employee record and cannot reject salaried timesheets." });
      return;
    }
    if (callerEmployeeId && ts.employeeId === callerEmployeeId) {
      res.status(403).json({ error: "You cannot reject your own salaried timesheet." });
      return;
    }

    let assignedSupervisorId: number | null = ts.supervisorEmployeeId ?? null;
    if (!assignedSupervisorId) {
      const [employeeRow] = await db
        .select({ supervisorEmployeeId: employees.supervisorEmployeeId })
        .from(employees)
        .where(eq(employees.id, ts.employeeId))
        .limit(1);
      assignedSupervisorId = employeeRow?.supervisorEmployeeId ?? null;
    }
    if (assignedSupervisorId !== callerEmployeeId && !isAdminOwner) {
      res.status(403).json({ error: "You are not the assigned supervisor for this salaried timesheet." });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(salariedTimesheetsTable)
      .set({
        status: "REOPENED",
        reopenedAt: now,
        reopenReason: note,
        supervisorApprovalNote: note,
      })
      .where(and(eq(salariedTimesheetsTable.id, id), eq(salariedTimesheetsTable.status, "SUBMITTED")))
      .returning();

    if (!updated) {
      res.status(409).json({ error: "Timesheet was already reviewed by another session. Refresh and try again." });
      return;
    }

    await writeAudit({
      timesheetId: id,
      action: "SUPERVISOR_REJECTED",
      actorId: userId,
      actorName: userName,
      actorRole: user?.role ?? null,
      beforeState: { status: "SUBMITTED" },
      afterState: {
        status: "REOPENED",
        reopenedAt: updated.reopenedAt,
        supervisorEmployeeId: assignedSupervisorId,
        rejectionNote: note,
      },
      reason: note,
      ipAddress: req.ip,
    });

    res.json({
      timesheetId: id,
      status: "REOPENED",
      reopenedAt: updated.reopenedAt,
      message: "Timesheet returned to the employee for correction.",
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/timekeeping/salaried-timesheet/:id/payroll-approve
// Payroll final approval — terminal approval state.
// Valid from: SUPERVISOR_APPROVED
// Transitions to: PAYROLL_APPROVED
// ACCOUNTING TRIGGER: creates labor_cost_records for all lines.
// Fail-closed: any line without chargeCodeId → 422, nothing is written.
// ---------------------------------------------------------------------------
router.post(
  "/salaried-timesheet/:id/payroll-approve",
  authenticateToken,
  requirePermission("timekeeping.salaried.approve_payroll"),
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid timesheet ID" }); return; }

    const ts = await loadTimesheet(id, res);
    if (!ts) return;
    if (!(await requireSalaryPayType(ts.employeeId, res))) return;

    const user = (req as any).user;
    const userId: number | null = user?.id ?? null;
    const userName: string | null = user?.name ?? user?.username ?? null;

    if (ts.status !== "SUPERVISOR_APPROVED") {
      res.status(409).json({
        error: `Cannot payroll-approve timesheet in status '${ts.status}'. Expected SUPERVISOR_APPROVED.`,
        currentStatus: ts.status,
      });
      return;
    }

    // ── COMPLETENESS VALIDATION (minimum-hours check) ─────────────────────
    try {
      await costSvc.validateTimesheetCompleteness(id);
    } catch (completenessErr: any) {
      res.status(422).json({
        error: completenessErr.message,
        timesheetId: id,
      });
      return;
    }

    // ── ACCOUNTING TRIGGER ──────────────────────────────────────────────────
    // createSalariedLaborCostRecords is fail-closed:
    //   - throws if any line lacks chargeCodeId
    //   - throws if any existing STL records are already GL-posted
    //   - deletes non-posted STL records then inserts fresh ones
    // If this throws, the timesheet status is NOT updated — atomically safe
    // because status update is sequenced AFTER the accounting call.
    let costSummary: Awaited<ReturnType<typeof costSvc.createSalariedLaborCostRecords>>;
    try {
      costSummary = await costSvc.createSalariedLaborCostRecords(id, userId ?? 0);
    } catch (accountingErr: any) {
      if (accountingErr instanceof DraftNeedsReviewError) {
        res.status(422).json({
          error: accountingErr.message,
          code: accountingErr.code,
          draftIds: accountingErr.draftIds,
          timesheetId: id,
        });
        return;
      }
      res.status(422).json({
        error: `Payroll approval blocked by accounting validation: ${accountingErr.message}`,
        timesheetId: id,
      });
      return;
    }

    // ── UPDATE STATUS — only after accounting records are safely written ─────
    const now = new Date();
    const [updated] = await db
      .update(salariedTimesheetsTable)
      .set({
        status: "PAYROLL_APPROVED",
        payrollApprovedAt: now,
        payrollApprovedBy: userId,
      })
      .where(eq(salariedTimesheetsTable.id, id))
      .returning();

    // Immutable audit record — includes full accounting summary for DCAA
    await writeAudit({
      timesheetId: id,
      action: "PAYROLL_APPROVED",
      actorId: userId,
      actorName: userName,
      actorRole: user?.role ?? null,
      beforeState: { status: "SUPERVISOR_APPROVED" },
      afterState: {
        status: "PAYROLL_APPROVED",
        payrollApprovedAt: updated?.payrollApprovedAt,
        payrollApprovedBy: userId,
        laborCostRecordsCreated: costSummary.lineCount,
        totalHours: costSummary.totalHours,
        totalDollarCost: costSummary.totalDollarCost,
        costBreakdownByType: costSummary.byType,
        laborCostRecordIds: costSummary.recordIds,
        draftsPosted: costSummary.draftsPosted,
        draftPostingResults: costSummary.draftPostingResults,
      },
      source: "PAYROLL_APPROVAL",
      ipAddress: req.ip,
    });

    res.json({
      timesheetId: id,
      status: "PAYROLL_APPROVED",
      payrollApprovedAt: updated?.payrollApprovedAt,
      accounting: {
        laborCostRecordsCreated: costSummary.lineCount,
        totalHours: costSummary.totalHours,
        totalDollarCost: costSummary.totalDollarCost,
        byType: costSummary.byType,
        recordIds: costSummary.recordIds,
      },
      message:
        "Timesheet payroll-approved. Labor cost records created and queued for GL posting.",
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/timekeeping/salaried-timesheet/:id/reopen
// Reopens a timesheet for correction.
// Valid from: PAYROLL_APPROVED, SUPERVISOR_APPROVED
// Transitions to: REOPENED
// Fail-closed: blocks if any labor_cost_records are already GL-posted.
// Body: { reason: string } (required)
// ---------------------------------------------------------------------------
router.post(
  "/salaried-timesheet/:id/reopen",
  authenticateToken,
  requirePermission("timekeeping.salaried.reopen"),
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid timesheet ID" }); return; }

    const ts = await loadTimesheet(id, res);
    if (!ts) return;
    if (!(await requireSalaryPayType(ts.employeeId, res))) return;

    const user = (req as any).user;
    const userId: number | null = user?.id ?? null;
    const userName: string | null = user?.name ?? user?.username ?? null;

    const { reason } = req.body as { reason?: string };
    if (!reason || String(reason).trim().length === 0) {
      res.status(400).json({ error: "A reopen reason is required." });
      return;
    }

    const reopenableStatuses = ["PAYROLL_APPROVED", "SUPERVISOR_APPROVED"];
    if (!reopenableStatuses.includes(ts.status)) {
      res.status(409).json({
        error: `Cannot reopen timesheet in status '${ts.status}'. Expected one of: ${reopenableStatuses.join(", ")}.`,
        currentStatus: ts.status,
      });
      return;
    }

    const previousStatus = ts.status;

    // ── FAIL-CLOSED: check for GL-posted labor cost records ─────────────────
    // deleteSalariedLaborCostRecordsForReopen throws if any records are posted.
    // On throw, no status update happens — atomically safe.
    let deleteResult: { deleted: number; draftsReset: number };
    try {
      deleteResult = await costSvc.deleteSalariedLaborCostRecordsForReopen(id);
    } catch (reopenErr: any) {
      res.status(422).json({
        error: `Reopen blocked: ${reopenErr.message}`,
        timesheetId: id,
      });
      return;
    }

    // ── UPDATE STATUS — clear certification fields so re-certification is required
    const now = new Date();
    const [updated] = await db
      .update(salariedTimesheetsTable)
      .set({
        status: "REOPENED",
        reopenedAt: now,
        reopenReason: String(reason).trim(),
        certifiedAt: null,
        certifiedBy: null,
        certificationStatement: null,
        certificationVersion: null,
        supervisorApprovedAt: null,
        supervisorApprovedBy: null,
        supervisorApprovalNote: null,
      })
      .where(eq(salariedTimesheetsTable.id, id))
      .returning();

    await writeAudit({
      timesheetId: id,
      action: "REOPENED",
      actorId: userId,
      actorName: userName,
      actorRole: user?.role ?? null,
      beforeState: { status: previousStatus },
      afterState: {
        status: "REOPENED",
        reopenedAt: updated?.reopenedAt,
        reason: String(reason).trim(),
        nonPostedCostRecordsDeleted: deleteResult.deleted,
        draftsReset: deleteResult.draftsReset,
      },
      reason: String(reason).trim(),
      ipAddress: req.ip,
    });

    res.json({
      timesheetId: id,
      status: "REOPENED",
      reopenedAt: updated?.reopenedAt,
      nonPostedCostRecordsDeleted: deleteResult.deleted,
      draftsReset: deleteResult.draftsReset,
      message:
        "Timesheet reopened for correction. Employee must recertify before resubmission.",
    });
  }),
);

// ===========================================================================
// PHASE A — Line-level CRUD
// Portal-authenticated. Returns updated timesheet view after each mutation.
// ===========================================================================

const addLineSchema = z.object({
  lineType: z.enum(["DIRECT", "INDIRECT"]),
  chargeCodeId: z.number().int().positive().optional().nullable(),
  travelerId: z.string().optional().nullable(),
  indirectCodeId: z.number().int().positive().optional().nullable(),
  hours: z.number().gt(0, "Hours must be greater than 0").max(24),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  note: z.string().max(500).optional().nullable(),
  originalNarrative: z.string().max(2000).optional().nullable(),
});

const updateLineSchema = z.object({
  lineType: z.enum(["DIRECT", "INDIRECT"]).optional(),
  chargeCodeId: z.number().int().positive().nullable().optional(),
  travelerId: z.string().nullable().optional(),
  indirectCodeId: z.number().int().positive().nullable().optional(),
  hours: z.number().gt(0, "Hours must be greater than 0").max(24).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).nullable().optional(),
  originalNarrative: z.string().max(2000).nullable().optional(),
});

router.post(
  "/salaried-timesheet/my/timesheets/:id/lines",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;
    const emp = await requireSessionSalaryEmployee(req, res);
    if (!emp) return;

    const timesheetId = Number(req.params.id);
    if (!timesheetId) { res.status(400).json({ error: "Invalid timesheet ID" }); return; }

    const parsed = addLineSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const ts = await loadTimesheet(timesheetId, res);
    if (!ts) return;
    if (ts.employeeId !== emp.employeeId) {
      res.status(403).json({ error: "Forbidden: timesheet does not belong to this employee" });
      return;
    }

    try {
      await svc.addLine(timesheetId, emp.employeeId, emp.name, parsed.data);
      const view = await svc.getSalariedTimesheetView(emp.employeeId, ts.periodStart);
      res.status(201).json(view);
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      res.status(status).json({ error: err.message });
    }
  }),
);

router.patch(
  "/salaried-timesheet/my/timesheets/:id/lines/:lineId",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;
    const emp = await requireSessionSalaryEmployee(req, res);
    if (!emp) return;

    const timesheetId = Number(req.params.id);
    const lineId = Number(req.params.lineId);
    if (!timesheetId || !lineId) { res.status(400).json({ error: "Invalid ID" }); return; }

    const parsed = updateLineSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const ts = await loadTimesheet(timesheetId, res);
    if (!ts) return;
    if (ts.employeeId !== emp.employeeId) {
      res.status(403).json({ error: "Forbidden: timesheet does not belong to this employee" });
      return;
    }

    try {
      await svc.updateLine(timesheetId, lineId, emp.employeeId, emp.name, parsed.data);
      const view = await svc.getSalariedTimesheetView(emp.employeeId, ts.periodStart);
      res.json(view);
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      res.status(status).json({ error: err.message });
    }
  }),
);

router.delete(
  "/salaried-timesheet/my/timesheets/:id/lines/:lineId",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;
    const emp = await requireSessionSalaryEmployee(req, res);
    if (!emp) return;

    const timesheetId = Number(req.params.id);
    const lineId = Number(req.params.lineId);
    if (!timesheetId || !lineId) { res.status(400).json({ error: "Invalid ID" }); return; }

    const ts = await loadTimesheet(timesheetId, res);
    if (!ts) return;
    if (ts.employeeId !== emp.employeeId) {
      res.status(403).json({ error: "Forbidden: timesheet does not belong to this employee" });
      return;
    }

    try {
      await svc.deleteLine(timesheetId, lineId, emp.employeeId, emp.name);
      const view = await svc.getSalariedTimesheetView(emp.employeeId, ts.periodStart);
      res.json(view);
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      res.status(status).json({ error: err.message });
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /api/timekeeping/salaried-timesheet/portal/:portalId/timesheets/:id/lines
// ---------------------------------------------------------------------------
router.post(
  "/salaried-timesheet/portal/:portalId/timesheets/:id/lines",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const timesheetId = Number(req.params.id);
    if (!timesheetId) { res.status(400).json({ error: "Invalid timesheet ID" }); return; }

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }
    if (!(await requireSalaryPayType(epochEmployeeId, res))) return;

    const parsed = addLineSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const ts = await loadTimesheet(timesheetId, res);
    if (!ts) return;

    if (ts.employeeId !== epochEmployeeId) {
      res.status(403).json({ error: "Forbidden: timesheet does not belong to this portal user" });
      return;
    }

    if (ts.certificationStatement && ts.status !== "OPEN" && ts.status !== "REOPENED") {
      res.status(403).json({
        error: "This timesheet has been certified and locked. A formal reopen is required before making corrections.",
      });
      return;
    }

    const empRow = await db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, epochEmployeeId))
      .limit(1);

    try {
      await svc.addLine(timesheetId, epochEmployeeId, empRow[0]?.name ?? null, parsed.data);
      const view = await svc.getSalariedTimesheetView(epochEmployeeId, ts.periodStart);
      res.status(201).json(view);
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      res.status(status).json({ error: err.message });
    }
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/timekeeping/salaried-timesheet/portal/:portalId/timesheets/:id/lines/:lineId
// ---------------------------------------------------------------------------
router.patch(
  "/salaried-timesheet/portal/:portalId/timesheets/:id/lines/:lineId",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const timesheetId = Number(req.params.id);
    const lineId = Number(req.params.lineId);
    if (!timesheetId || !lineId) { res.status(400).json({ error: "Invalid ID" }); return; }

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }
    if (!(await requireSalaryPayType(epochEmployeeId, res))) return;

    const parsed = updateLineSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const ts = await loadTimesheet(timesheetId, res);
    if (!ts) return;

    if (ts.employeeId !== epochEmployeeId) {
      res.status(403).json({ error: "Forbidden: timesheet does not belong to this portal user" });
      return;
    }

    if (ts.certificationStatement && ts.status !== "OPEN" && ts.status !== "REOPENED") {
      res.status(403).json({
        error: "This timesheet has been certified and locked. A formal reopen is required before making corrections.",
      });
      return;
    }

    const empRow = await db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, epochEmployeeId))
      .limit(1);

    try {
      await svc.updateLine(timesheetId, lineId, epochEmployeeId, empRow[0]?.name ?? null, parsed.data);
      const view = await svc.getSalariedTimesheetView(epochEmployeeId, ts.periodStart);
      res.json(view);
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      res.status(status).json({ error: err.message });
    }
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/timekeeping/salaried-timesheet/portal/:portalId/timesheets/:id/lines/:lineId
// ---------------------------------------------------------------------------
router.delete(
  "/salaried-timesheet/portal/:portalId/timesheets/:id/lines/:lineId",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const timesheetId = Number(req.params.id);
    const lineId = Number(req.params.lineId);
    if (!timesheetId || !lineId) { res.status(400).json({ error: "Invalid ID" }); return; }

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }
    if (!(await requireSalaryPayType(epochEmployeeId, res))) return;

    const ts = await loadTimesheet(timesheetId, res);
    if (!ts) return;

    if (ts.employeeId !== epochEmployeeId) {
      res.status(403).json({ error: "Forbidden: timesheet does not belong to this portal user" });
      return;
    }

    if (ts.certificationStatement && ts.status !== "OPEN" && ts.status !== "REOPENED") {
      res.status(403).json({
        error: "This timesheet has been certified and locked. A formal reopen is required before making corrections.",
      });
      return;
    }

    const empRow = await db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, epochEmployeeId))
      .limit(1);

    try {
      await svc.deleteLine(timesheetId, lineId, epochEmployeeId, empRow[0]?.name ?? null);
      const view = await svc.getSalariedTimesheetView(epochEmployeeId, ts.periodStart);
      res.json(view);
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      res.status(status).json({ error: err.message });
    }
  }),
);

// ===========================================================================
// PHASE A — Traveler suggestion + indirect code portal endpoints
// Portal-authenticated.
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /api/timekeeping/salaried-timesheet/portal/:portalId/indirect-codes
// ---------------------------------------------------------------------------
router.get(
  "/salaried-timesheet/portal/:portalId/indirect-codes",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;
    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }
    if (!(await requireSalaryPayType(epochEmployeeId, res))) return;
    const codes = await svc.getIndirectCodes();
    res.json(codes);
  }),
);

// ---------------------------------------------------------------------------
// GET /api/timekeeping/salaried-timesheet/portal/:portalId/travelers/suggest
// ---------------------------------------------------------------------------
router.get(
  "/salaried-timesheet/portal/:portalId/travelers/suggest",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }
    if (!(await requireSalaryPayType(epochEmployeeId, res))) return;

    const result = await svc.getSuggestedTravelers(epochEmployeeId, 5);
    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
// GET /api/timekeeping/salaried-timesheet/portal/:portalId/travelers/all
// ---------------------------------------------------------------------------
router.get(
  "/salaried-timesheet/portal/:portalId/travelers/all",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }
    if (!(await requireSalaryPayType(epochEmployeeId, res))) return;

    const travelers = await svc.getAllActiveTravelers();
    res.json(travelers);
  }),
);

// ---------------------------------------------------------------------------
// POST /api/timekeeping/salaried-timesheet/portal/:portalId/certify/:timesheetId
// Portal-authenticated certify endpoint for the employee portal.
// ---------------------------------------------------------------------------
router.post(
  "/salaried-timesheet/portal/:portalId/certify/:timesheetId",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }
    if (!(await requireSalaryPayType(epochEmployeeId, res))) return;

    const timesheetId = Number(req.params.timesheetId);
    if (!timesheetId) { res.status(400).json({ error: "Invalid timesheet ID" }); return; }

    const bodyParsed = certifyBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({
        error: "certificationConfirmed must be explicitly true. Please check the certification checkbox before submitting.",
      });
      return;
    }

    const ts = await loadTimesheet(timesheetId, res);
    if (!ts) return;

    if (ts.employeeId !== epochEmployeeId) {
      res.status(403).json({ error: "Timesheet does not belong to this employee." });
      return;
    }

    if (ts.status !== "OPEN" && ts.status !== "REOPENED") {
      res.status(409).json({
        error: `Cannot certify timesheet in status '${ts.status}'. Expected OPEN or REOPENED.`,
        currentStatus: ts.status,
      });
      return;
    }

    const empRow = await db.select({ name: employees.name, supervisorEmployeeId: employees.supervisorEmployeeId }).from(employees)
      .where(eq(employees.id, epochEmployeeId)).limit(1);
    const supervisorEmployeeId = empRow[0]?.supervisorEmployeeId ?? null;
    if (!supervisorEmployeeId) {
      res.status(409).json({
        error: "This salaried employee has no supervisor assigned. Assign a supervisor on the employee profile before submitting.",
      });
      return;
    }

    const now = new Date();
    const totalActualHours = await svc.recalculateTimesheetTotal(timesheetId);
    const [updated] = await db
      .update(salariedTimesheetsTable)
      .set({
        status: "SUBMITTED",
        certifiedAt: now,
        certifiedBy: epochEmployeeId,
        certificationStatement: DCAA_CERTIFICATION_STATEMENT,
        certificationVersion: DCAA_CERTIFICATION_VERSION,
        supervisorEmployeeId,
        supervisorApprovedAt: null,
        supervisorApprovedBy: null,
        supervisorApprovalNote: null,
      })
      .where(eq(salariedTimesheetsTable.id, timesheetId))
      .returning();

    // Fetch line-hours snapshot for immutable audit evidence
    const certLines = await db
      .select()
      .from(salariedTimesheetLinesTable)
      .where(eq(salariedTimesheetLinesTable.timesheetId, timesheetId));

    await writeAudit({
      timesheetId,
      action: "TIME_CERTIFIED",
      actorId: epochEmployeeId,
      actorName: empRow[0]?.name ?? null,
      actorRole: "EMPLOYEE",
      beforeState: { status: ts.status },
      afterState: {
        status: "SUBMITTED",
        certifiedAt: updated?.certifiedAt,
        certificationStatement: DCAA_CERTIFICATION_STATEMENT,
        certificationVersion: DCAA_CERTIFICATION_VERSION,
        certifiedByEmployeeId: epochEmployeeId,
        supervisorEmployeeId,
        periodStart: ts.periodStart,
        periodEnd: ts.periodEnd,
        totalActualHours,
        linesSnapshot: certLines.map((l) => ({
          id: l.id,
          date: l.date,
          hours: l.hours,
          chargeCodeId: l.chargeCodeId,
          travelerId: l.travelerId,
          note: l.note,
        })),
      },
      ipAddress: req.ip,
    });

    const view = await svc.getSalariedTimesheetView(epochEmployeeId, ts.periodStart);
    res.json(view);
  }),
);

router.post(
  "/salaried-timesheet/my/certify/:timesheetId",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    if (!(await requireFeatureFlag(req, res))) return;
    const emp = await requireSessionSalaryEmployee(req, res);
    if (!emp) return;

    const timesheetId = Number(req.params.timesheetId);
    if (!timesheetId) { res.status(400).json({ error: "Invalid timesheet ID" }); return; }

    const bodyParsed = certifyBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({
        error: "certificationConfirmed must be explicitly true. Please check the certification checkbox before submitting.",
      });
      return;
    }

    const ts = await loadTimesheet(timesheetId, res);
    if (!ts) return;
    if (ts.employeeId !== emp.employeeId) {
      res.status(403).json({ error: "Timesheet does not belong to this employee." });
      return;
    }
    if (ts.status !== "OPEN" && ts.status !== "REOPENED") {
      res.status(409).json({
        error: `Cannot certify timesheet in status '${ts.status}'. Expected OPEN or REOPENED.`,
        currentStatus: ts.status,
      });
      return;
    }

    const [employeeRow] = await db
      .select({ supervisorEmployeeId: employees.supervisorEmployeeId })
      .from(employees)
      .where(eq(employees.id, emp.employeeId))
      .limit(1);
    const supervisorEmployeeId = employeeRow?.supervisorEmployeeId ?? null;
    if (!supervisorEmployeeId) {
      res.status(409).json({
        error: "This salaried employee has no supervisor assigned. Assign a supervisor on the employee profile before submitting.",
      });
      return;
    }

    const now = new Date();
    const totalActualHours = await svc.recalculateTimesheetTotal(timesheetId);
    const [updated] = await db
      .update(salariedTimesheetsTable)
      .set({
        status: "SUBMITTED",
        certifiedAt: now,
        certifiedBy: emp.employeeId,
        certificationStatement: DCAA_CERTIFICATION_STATEMENT,
        certificationVersion: DCAA_CERTIFICATION_VERSION,
        supervisorEmployeeId,
        supervisorApprovedAt: null,
        supervisorApprovedBy: null,
        supervisorApprovalNote: null,
      })
      .where(eq(salariedTimesheetsTable.id, timesheetId))
      .returning();

    const certLines = await db
      .select()
      .from(salariedTimesheetLinesTable)
      .where(eq(salariedTimesheetLinesTable.timesheetId, timesheetId));

    await writeAudit({
      timesheetId,
      action: "TIME_CERTIFIED",
      actorId: emp.employeeId,
      actorName: emp.name,
      actorRole: "EMPLOYEE",
      beforeState: { status: ts.status },
      afterState: {
        status: "SUBMITTED",
        certifiedAt: updated?.certifiedAt,
        certificationStatement: DCAA_CERTIFICATION_STATEMENT,
        certificationVersion: DCAA_CERTIFICATION_VERSION,
        certifiedByEmployeeId: emp.employeeId,
        supervisorEmployeeId,
        periodStart: ts.periodStart,
        periodEnd: ts.periodEnd,
        totalActualHours,
        linesSnapshot: certLines.map((l) => ({
          id: l.id,
          date: l.date,
          hours: l.hours,
          chargeCodeId: l.chargeCodeId,
          travelerId: l.travelerId,
          note: l.note,
        })),
      },
      ipAddress: req.ip,
    });

    const view = await svc.getSalariedTimesheetView(emp.employeeId, ts.periodStart);
    res.json(view);
  }),
);

export default router;
