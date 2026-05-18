import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { GetWeeklyHoursQueryParams } from "../../lib/timekeeping-zod";
import * as svc from "../../services/timekeeping/dashboard.service";
import type { ComplianceExceptionType, ComplianceSeverity } from "../../services/timekeeping/dashboard.service";
import { getPendingTimesheets } from "../../services/timekeeping/timesheets.service";
import { authenticateToken, requireRole } from "../../../middleware/auth";
import { z } from "zod";

const EmployeeHoursQueryParams = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const PayrollReviewQueryParams = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Wraps an async route handler so uncaught errors return 500 instead of crashing the process. */
function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/dashboard]", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });
}

const router: IRouter = Router();

router.get("/dashboard/summary", authenticateToken, h(async (_req, res): Promise<void> => {
  console.info("[timekeeping/dashboard] GET /summary — entered");
  const result = await svc.getDashboardSummary();
  console.info("[timekeeping/dashboard] GET /summary — completed");
  res.json(result);
}));

router.get("/dashboard/clocked-in", authenticateToken, h(async (_req, res): Promise<void> => {
  console.info("[timekeeping/dashboard] GET /clocked-in — entered");
  const result = await svc.getClockedInEmployees();
  console.info("[timekeeping/dashboard] GET /clocked-in — completed");
  res.json(result);
}));

router.get("/dashboard/employee-status", authenticateToken, h(async (_req, res): Promise<void> => {
  console.info("[timekeeping/dashboard] GET /employee-status — entered");
  const result = await svc.getEmployeeStatus();
  console.info("[timekeeping/dashboard] GET /employee-status — completed");
  res.json(result);
}));

router.get("/dashboard/weekly-hours", authenticateToken, h(async (req, res): Promise<void> => {
  console.info("[timekeeping/dashboard] GET /weekly-hours — entered");
  const q = GetWeeklyHoursQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  const result = await svc.getWeeklyHours(q.data);
  console.info("[timekeeping/dashboard] GET /weekly-hours — completed");
  res.json(result);
}));

router.get("/dashboard/pending-timesheets", authenticateToken, h(async (_req, res): Promise<void> => {
  console.info("[timekeeping/dashboard] GET /pending-timesheets — entered");
  const result = await getPendingTimesheets();
  console.info("[timekeeping/dashboard] GET /pending-timesheets — completed");
  res.json(result);
}));

router.get("/dashboard/employee-hours", authenticateToken, h(async (req, res): Promise<void> => {
  console.info("[timekeeping/dashboard] GET /employee-hours — entered");
  const q = EmployeeHoursQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  if (q.data.from && q.data.to && q.data.from > q.data.to) {
    res.status(400).json({ error: "from must not be after to" });
    return;
  }
  const from = q.data.from ? new Date(`${q.data.from}T00:00:00`) : undefined;
  const to = q.data.to ? new Date(`${q.data.to}T23:59:59.999`) : undefined;
  const result = await svc.getEmployeeHoursForPeriod(from, to);
  console.info("[timekeeping/dashboard] GET /employee-hours — completed");
  res.json(result);
}));

router.get("/dashboard/pay-period-review", authenticateToken, requireRole("ADMIN", "OWNER", "HR"), h(async (req, res): Promise<void> => {
  console.info("[timekeeping/dashboard] GET /pay-period-review - entered");
  const q = PayrollReviewQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.errors.map((e) => e.message).join("; ") }); return; }
  if ((q.data.periodStart && !q.data.periodEnd) || (!q.data.periodStart && q.data.periodEnd)) {
    res.status(400).json({ error: "periodStart and periodEnd must be provided together" });
    return;
  }
  if (q.data.periodStart && q.data.periodEnd && q.data.periodStart > q.data.periodEnd) {
    res.status(400).json({ error: "periodStart must not be after periodEnd" });
    return;
  }
  const result = await svc.getPayrollReviewBatch(q.data.periodStart, q.data.periodEnd);
  console.info("[timekeeping/dashboard] GET /pay-period-review - completed");
  res.json(result);
}));

router.get("/dashboard/recent-punches", authenticateToken, h(async (_req, res): Promise<void> => {
  console.info("[timekeeping/dashboard] GET /recent-punches — entered");
  const result = await svc.getRecentPunches(20);
  console.info("[timekeeping/dashboard] GET /recent-punches — completed");
  res.json(result);
}));

router.get("/dashboard/orphaned-sessions", authenticateToken, h(async (_req, res): Promise<void> => {
  console.info("[timekeeping/dashboard] GET /orphaned-sessions — entered");
  const result = await svc.listOrphanedSessions();
  console.info("[timekeeping/dashboard] GET /orphaned-sessions — completed");
  res.json(result);
}));

const ComplianceExceptionsQuery = z.object({
  type: z.enum(["uncertified", "correction_pending", "admin_override", "late_submission"]).optional(),
  severity: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
});

router.get(
  "/compliance-exceptions",
  authenticateToken,
  requireRole("ADMIN", "OWNER", "MANAGER", "SUPERVISOR"),
  h(async (req, res): Promise<void> => {
    console.info("[timekeeping/dashboard] GET /compliance-exceptions — entered");
    const q = ComplianceExceptionsQuery.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: q.error.errors.map(e => e.message).join("; ") });
      return;
    }
    const result = await svc.getComplianceExceptions({
      type: q.data.type as ComplianceExceptionType | undefined,
      severity: q.data.severity as ComplianceSeverity | undefined,
    });
    console.info(`[timekeeping/dashboard] GET /compliance-exceptions — ${result.length} exceptions`);
    res.json(result);
  })
);

export default router;
