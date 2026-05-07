import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { z } from "zod";
import {
  CreateTimesheetBody,
  GetTimesheetParams,
  UpdateTimesheetParams,
  SubmitTimesheetParams,
  ApproveTimesheetParams,
  RejectTimesheetParams,
  RejectTimesheetBody,
  ListTimesheetsQueryParams,
} from "../../lib/timekeeping-zod";
import * as svc from "../../services/timekeeping/timesheets.service";
import * as payrollExportSvc from "../../services/timekeeping/payrollExport.service";
import type { BulkGenerateResult } from "../../services/timekeeping/timesheets.service";
import { getTimesheetAuditTrail } from "../../services/timekeeping/audit.service";
import * as punchSvc from "../../services/timekeeping/punches.service";
import * as leaveSvc from "../../services/timekeeping/leave.service";
import * as settingsSvc from "../../services/timekeeping/settings.service";
import { actorFromUser } from "../../services/timekeeping/audit.service";
import { authenticateToken, requireRole } from "../../../middleware/auth";

/**
 * Strict whitelist for direct PATCH updates.
 * Protected lifecycle fields (status, employeeAttested, reviewedBy, etc.)
 * must ONLY be mutated through their dedicated lifecycle verbs:
 * /attest, /submit, /approve, /reject, /recalculate.
 */
const PatchTimesheetBody = z.object({
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

const GustoExportQuery = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodStart must be YYYY-MM-DD"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodEnd must be YYYY-MM-DD"),
});

const BulkGenerateBody = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodStart must be YYYY-MM-DD"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodEnd must be YYYY-MM-DD"),
});

function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Wraps an async route handler so uncaught errors return 500 instead of crashing the process. */
function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/timesheets]", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });
}

const router: IRouter = Router();

const ByPeriodQuery = z.object({
  employeeId: z.string().regex(/^\d+$/, "employeeId must be a positive integer"),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodStart must be YYYY-MM-DD"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodEnd must be YYYY-MM-DD"),
});

const RunningTimesheetQuery = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodStart must be YYYY-MM-DD").optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodEnd must be YYYY-MM-DD").optional(),
});

const MyTimesheetPrepareBody = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodStart must be YYYY-MM-DD"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodEnd must be YYYY-MM-DD"),
});

/**
 * GET /api/timekeeping/timesheets/by-period
 * Lazy auto-create: returns existing or newly-created draft timesheet for the
 * given employee + period. Returns { created: false, reason: "no_punches" } when
 * the period has zero punch hours so no phantom zero-hour row is written.
 */
router.get("/timesheets/by-period", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const q = ByPeriodQuery.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.errors.map((e) => e.message).join("; ") });
    return;
  }
  if (q.data.periodStart > q.data.periodEnd) {
    res.status(400).json({ error: "periodStart must not be after periodEnd" });
    return;
  }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const timesheet = await svc.getOrAutoCreateTimesheet(
    parseInt(q.data.employeeId, 10),
    q.data.periodStart,
    q.data.periodEnd,
    actor
  );
  if (timesheet === null) {
    res.status(200).json({ created: false, reason: "no_punches" });
    return;
  }
  res.status(200).json(timesheet);
}));

router.get("/timesheets", authenticateToken, h(async (req, res): Promise<void> => {
  const q = ListTimesheetsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  res.json(await svc.listTimesheets(q.data));
}));

router.get("/timesheets/my", authenticateToken, h(async (req, res): Promise<void> => {
  const employeeId = req.user?.employeeId ?? null;
  if (!employeeId) {
    res.status(403).json({ error: "Your account is not linked to an employee record" });
    return;
  }
  res.json(await svc.listTimesheets({ employeeId }));
}));

router.get("/timesheets/my/running", authenticateToken, h(async (req, res): Promise<void> => {
  const employeeId = req.user?.employeeId ?? null;
  if (!employeeId) {
    res.status(403).json({ error: "Your account is not linked to an employee record" });
    return;
  }

  const q = RunningTimesheetQuery.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.errors.map((e) => e.message).join("; ") });
    return;
  }
  if (q.data.periodStart && q.data.periodEnd && q.data.periodStart > q.data.periodEnd) {
    res.status(400).json({ error: "periodStart must not be after periodEnd" });
    return;
  }

  res.json(await svc.getRunningTimesheetForEmployee(employeeId, q.data.periodStart, q.data.periodEnd));
}));

router.post("/timesheets/my/prepare", authenticateToken, h(async (req, res): Promise<void> => {
  const employeeId = req.user?.employeeId ?? null;
  if (!employeeId) {
    res.status(403).json({ error: "Your account is not linked to an employee record" });
    return;
  }

  const body = MyTimesheetPrepareBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.errors.map((e) => e.message).join("; ") });
    return;
  }
  if (body.data.periodStart > body.data.periodEnd) {
    res.status(400).json({ error: "periodStart must not be after periodEnd" });
    return;
  }

  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const timesheet = await svc.getOrAutoCreateTimesheet(
    employeeId,
    body.data.periodStart,
    body.data.periodEnd,
    actor,
  );

  if (timesheet === null) {
    res.status(422).json({
      error: "No recorded hours were found for this pay period, so no timesheet was created.",
    });
    return;
  }

  res.json(timesheet);
}));

// Gusto export — DEPRECATED read-only delegate.
// Phase 1 of the revised payroll export design (docs/payroll-export-design.md)
// requires that every CSV exported to Gusto be a stored, immutable, checksummed
// payroll_export_batch.  This GET MUST NOT mutate DB state aside from logging
// an explicit BATCH_DOWNLOADED event for the existing batch — it never creates
// or supersedes batches (which would violate HTTP GET safety semantics and
// pollute the audit trail with no-op revisions on every page reload).
//
// Behavior:
//   - If an active (or processed) batch exists for the period → serve its
//     stored csv_content with checksum verification.
//   - Otherwise → 404 with a hint pointing at the new POST endpoint.
//
// Clients should migrate to:
//   POST /api/timekeeping/admin/payroll/batches              (create batch)
//   GET  /api/timekeeping/admin/payroll/batches/:id/download (re-download)
router.get("/admin/export/gusto", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const q = GustoExportQuery.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.errors.map((e) => e.message).join("; ") });
    return;
  }
  if (q.data.periodStart > q.data.periodEnd) {
    res.status(400).json({ error: "periodStart must not be after periodEnd" });
    return;
  }

  const existing = await payrollExportSvc.getActiveBatchForPeriod(
    q.data.periodStart,
    q.data.periodEnd,
  );
  if (!existing) {
    res.status(404).json({
      error: `No payroll export batch exists for period ${q.data.periodStart}..${q.data.periodEnd}.`,
      errorCode: "NoActiveBatchError",
      hint: "Create one via POST /api/timekeeping/admin/payroll/batches with {periodStart, periodEnd}, then re-download via GET /api/timekeeping/admin/payroll/batches/:id/download.",
    });
    return;
  }

  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const downloaded = await payrollExportSvc.downloadBatchCsv({
    batchId: existing.id,
    actor,
  });
  const filename = `gusto-export-${q.data.periodStart}-to-${q.data.periodEnd}-rev${downloaded.batch.revisionNumber}.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Deprecated", "Use POST /api/timekeeping/admin/payroll/batches and GET /admin/payroll/batches/:id/download");
  res.setHeader("X-Batch-Id", String(downloaded.batch.id));
  res.setHeader("X-Batch-Revision", String(downloaded.batch.revisionNumber));
  res.setHeader("X-Batch-Status", downloaded.batch.status);
  res.setHeader("X-Batch-Checksum", downloaded.batch.csvChecksum);
  res.send(downloaded.csvContent);
}));

/**
 * POST /api/timekeeping/admin/timesheets/generate
 * Admin-only. Bulk-generate draft timesheets for all active employees for a given period.
 * Each timesheet is computed via computeHoursForPeriod, so both timekeeping.punches
 * (legacy clock) and punch_ledger (portal/kiosk) hours are included in the totals.
 * Employees who already have a timesheet for the period are skipped without error.
 */
router.post("/admin/timesheets/generate", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const body = BulkGenerateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.errors.map((e) => e.message).join("; ") });
    return;
  }
  if (body.data.periodStart > body.data.periodEnd) {
    res.status(400).json({ error: "periodStart must not be after periodEnd" });
    return;
  }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result: BulkGenerateResult = await svc.generateTimesheetsForAllEmployees(
    body.data.periodStart,
    body.data.periodEnd,
    actor
  );
  res.status(200).json(result);
}));

router.post("/timesheets", authenticateToken, h(async (req, res): Promise<void> => {
  const body = CreateTimesheetBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const ts = await svc.createTimesheet(body.data, actor);
  res.status(201).json(ts);
}));

router.get("/timesheets/:id", authenticateToken, h(async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const ts = await svc.getTimesheet(p.data.id);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
  res.json(ts);
}));

router.patch("/timesheets/:id", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const p = UpdateTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const body = PatchTimesheetBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const allowed = Object.fromEntries(
    Object.entries(body.data).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(allowed).length === 0) {
    res.status(400).json({
      error: "No editable fields provided. Only periodStart and periodEnd may be updated directly. Use dedicated lifecycle endpoints for status, attestation, and review fields.",
    });
    return;
  }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.updateTimesheet(p.data.id, allowed, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
}));

const AttestBody = z.object({
  certificationConfirmed: z.literal(true, {
    errorMap: () => ({ message: "certificationConfirmed must be explicitly true — the employee must check the certification box before submitting." }),
  }),
});

// Employee self-certification — requires the requesting user to own the timesheet.
router.post("/timesheets/:id/attest", authenticateToken, h(async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const body = AttestBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  // Strict ownership check: this endpoint is for employee self-certification only.
  const actorUser = req.user;
  const ts = await svc.getTimesheet(p.data.id);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
  if (!actorUser?.employeeId || ts.employeeId !== actorUser.employeeId) {
    res.status(403).json({ error: "This endpoint is for employee self-certification only. Admins must use the admin override endpoint." });
    return;
  }

  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.attestTimesheet(p.data.id, actor, { certificationConfirmed: body.data.certificationConfirmed });
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
}));

const AttestAdminBody = z.object({
  certificationConfirmed: z.literal(true, {
    errorMap: () => ({ message: "certificationConfirmed must be explicitly true." }),
  }),
  overrideReason: z.string().min(5, "A reason of at least 5 characters is required for admin override certification."),
});

// Admin override certification — requires a privileged role and a written reason.
// Creates a distinct TIME_CERTIFIED_ADMIN audit event so auditors can distinguish
// self-certification from admin-driven certification.
router.post("/timesheets/:id/certify-admin", authenticateToken, requireRole("ADMIN", "OWNER", "SUPERVISOR", "MANAGER"), h(async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const body = AttestAdminBody.safeParse(req.body);
  if (!body.success) {
    const flat = body.error.flatten();
    res.status(400).json({ error: flat.fieldErrors?.certificationConfirmed?.[0] ?? flat.fieldErrors?.overrideReason?.[0] ?? body.error.message });
    return;
  }

  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.attestTimesheet(p.data.id, actor, {
    certificationConfirmed: body.data.certificationConfirmed,
    adminOverride: true,
    overrideReason: body.data.overrideReason,
  });
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
}));

router.post("/timesheets/:id/submit", authenticateToken, h(async (req, res): Promise<void> => {
  const p = SubmitTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.submitTimesheet(p.data.id, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
}));

router.post("/timesheets/:id/approve", authenticateToken, requireRole('ADMIN', 'OWNER', 'SUPERVISOR', 'MANAGER'), h(async (req, res): Promise<void> => {
  const p = ApproveTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.approveTimesheet(p.data.id, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
}));

router.post("/timesheets/:id/reject", authenticateToken, requireRole('ADMIN', 'OWNER', 'SUPERVISOR', 'MANAGER'), h(async (req, res): Promise<void> => {
  const p = RejectTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const body = RejectTimesheetBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.rejectTimesheet(p.data.id, body.data.rejectionNote, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
}));

router.get("/timesheets/:id/leave-summary", authenticateToken, h(async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const ts = await svc.getTimesheet(p.data.id);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }

  const user = req.user;
  const isAdmin = user?.role === "ADMIN" || user?.role === "OWNER";
  const isOwner = user?.employeeId != null && user.employeeId === ts.employeeId;
  if (!isAdmin && !isOwner) { res.status(403).json({ error: "Forbidden" }); return; }

  const { totalLeaveHours, entries } = await leaveSvc.getLeaveHoursForPeriod(
    ts.employeeId,
    ts.periodStart,
    ts.periodEnd
  );

  res.json({
    workedHours: ts.totalHours,
    leaveHours: totalLeaveHours,
    totalAccountedHours: ts.totalHours + totalLeaveHours,
    leaveEntries: entries,
  });
}));

router.get("/timesheets/:id/gaps", authenticateToken, h(async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const ts = await svc.getTimesheet(p.data.id);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }

  const user = req.user;
  const isAdmin = user?.role === "ADMIN" || user?.role === "OWNER";
  const isOwner = user?.employeeId != null && user.employeeId === ts.employeeId;
  if (!isAdmin && !isOwner) { res.status(403).json({ error: "Forbidden" }); return; }

  const punches = await punchSvc.listPunches({
    employeeId: ts.employeeId,
    from: ts.periodStart,
    to: ts.periodEnd,
  });

  const leaveData = await leaveSvc.getLeaveHoursForPeriod(ts.employeeId, ts.periodStart, ts.periodEnd);
  const leaveDates = new Set(leaveData.entries.map(e => e.date));

  const start = new Date(ts.periodStart);
  const end = new Date(ts.periodEnd);
  const gapDays: string[] = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    if (leaveDates.has(dateStr)) continue;
    const dayStart = new Date(dateStr + "T00:00:00Z");
    const dayEnd = new Date(dateStr + "T23:59:59.999Z");
    const hasPunches = punches.some(
      (p) => new Date(p.punchedAt) >= dayStart && new Date(p.punchedAt) <= dayEnd
    );
    if (!hasPunches) gapDays.push(dateStr);
  }

  const settings = await settingsSvc.getOrCreateSettings();
  const standardHours = settings.standardWorkWeekHours ?? 40;
  const totalAccountedHours = ts.totalHours + leaveData.totalLeaveHours;
  const shortfallHours = Math.max(0, standardHours - totalAccountedHours);

  res.json({ gapDays, totalGaps: gapDays.length, standardWorkWeekHours: standardHours, totalAccountedHours, shortfallHours });
}));

router.get("/timesheets/:id/punches", authenticateToken, h(async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const ts = await svc.getTimesheet(p.data.id);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }

  const user = req.user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const isAdmin = user.role === "ADMIN" || user.role === "OWNER";
  const isOwner = user.employeeId != null && user.employeeId === ts.employeeId;
  if (!isAdmin && !isOwner) {
    res.status(403).json({ error: "You can only view punches for your own timesheets" });
    return;
  }

  const punches = await punchSvc.listPunches({
    employeeId: ts.employeeId,
    from: ts.periodStart,
    to: ts.periodEnd,
  });
  res.json(punches);
}));

router.post("/timesheets/:id/recalculate", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.recalculateTimesheetHours(p.data.id, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result.timesheet);
}));

/**
 * POST /timesheets/:id/lock
 * Admin/owner only. Seals a certified timesheet — after this no direct edits are
 * possible; changes must go through the correction workflow.
 */
router.post("/timesheets/:id/lock", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.lockTimesheet(p.data.id, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
}));

/**
 * GET /timesheets/:id/audit-trail
 * Admin/owner/HR only. Returns the complete, read-only audit event timeline for
 * a single timesheet — including all audit_log entries and correction-level events.
 */
router.get("/timesheets/:id/audit-trail", authenticateToken, requireRole('ADMIN', 'OWNER', 'HR'), h(async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }

  const ts = await svc.getTimesheet(p.data.id);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }

  const events = await getTimesheetAuditTrail(p.data.id);
  res.json(events);
}));

export default router;
