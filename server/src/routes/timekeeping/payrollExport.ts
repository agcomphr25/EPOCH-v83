/**
 * Payroll Export — Phase 1 routes.
 *
 * All routes are gated by authenticateToken + requireRole('ADMIN', 'OWNER').
 * Phase 1 only supports export_type = 'regular_full_period'.  Off-cycle
 * adjustment exports and payroll_adjustments CRUD arrive in Phase 3.
 *
 * Endpoints (mounted under /api/timekeeping):
 *   POST /admin/payroll/batches               → create + auto-supersede (with reason)
 *   GET  /admin/payroll/batches?periodStart=…&periodEnd=…
 *   GET  /admin/payroll/batches/:id           → batch metadata + rows
 *   GET  /admin/payroll/batches/:id/download  → stored CSV (no recalculation)
 *                                              ?evidenceOnly=true to download
 *                                              superseded/voided batches as
 *                                              audit evidence only.
 *   POST /admin/payroll/batches/:id/process   → terminal mark-as-processed
 */

import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { z } from "zod";
import * as svc from "../../services/timekeeping/payrollExport.service";
import { actorFromUser } from "../../services/timekeeping/audit.service";
import { authenticateToken, requireRole } from "../../../middleware/auth";

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) =>
    fn(req, res, next).catch((err) => {
      const status = (err && typeof err === "object" && typeof (err as any).httpStatus === "number")
        ? (err as any).httpStatus
        : 500;
      const message = (err as Error)?.message ?? "Internal server error";
      console.error("[timekeeping/payrollExport]", message);
      if (!res.headersSent) {
        res.status(status).json({
          error: message,
          errorCode: (err as Error)?.name ?? "Error",
        });
      }
    });
}

const router: IRouter = Router();

const PeriodBody = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodStart must be YYYY-MM-DD"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodEnd must be YYYY-MM-DD"),
  // Required when superseding an existing active batch.  When no prior active
  // batch exists, this field is ignored.  See SupersedeReasonRequiredError.
  supersedeReason: z.string().min(3).max(2000).optional(),
});

const PeriodQuery = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const BatchIdParam = z.object({
  id: z.string().regex(/^\d+$/, "id must be a positive integer"),
});

const ProcessBody = z.object({
  confirmationNote: z.string().min(1, "confirmationNote is required").max(2000),
});

const DownloadQuery = z.object({
  evidenceOnly: z.enum(["true", "false"]).optional(),
});

/**
 * POST /admin/payroll/batches
 * Create a new regular_full_period export batch.  If an active batch exists
 * for the same period, supersedeReason is REQUIRED and the prior batch is
 * superseded with that reason.  If a processed batch exists, returns 409.
 * Concurrent active-batch insert conflicts surface as 409
 * ConcurrentExportConflictError — clients should refetch and decide explicitly.
 */
router.post(
  "/admin/payroll/batches",
  authenticateToken,
  requireRole("ADMIN", "OWNER"),
  h(async (req, res) => {
    const body = PeriodBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.errors.map((e) => e.message).join("; ") });
      return;
    }
    if (body.data.periodStart > body.data.periodEnd) {
      res.status(400).json({ error: "periodStart must not be after periodEnd" });
      return;
    }
    const actor = actorFromUser(req.user ?? null, req.ip ?? null);
    const result = await svc.createRegularFullPeriodBatch({
      periodStart: body.data.periodStart,
      periodEnd: body.data.periodEnd,
      actor,
      supersedeReason: body.data.supersedeReason,
    });
    res.status(201).json({
      ...result,
      downloadUrl: `/api/timekeeping/admin/payroll/batches/${result.batchId}/download`,
    });
  }),
);

/**
 * GET /admin/payroll/batches?periodStart=&periodEnd=
 * List all batches (any status) for a period, newest first.
 */
router.get(
  "/admin/payroll/batches",
  authenticateToken,
  requireRole("ADMIN", "OWNER"),
  h(async (req, res) => {
    const q = PeriodQuery.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: q.error.errors.map((e) => e.message).join("; ") });
      return;
    }
    const batches = await svc.listBatchesForPeriod(q.data.periodStart, q.data.periodEnd);
    res.status(200).json({ batches });
  }),
);

/**
 * GET /admin/payroll/batches/:id
 * Batch metadata + rows.  Read-only; safe for any status.
 */
router.get(
  "/admin/payroll/batches/:id",
  authenticateToken,
  requireRole("ADMIN", "OWNER"),
  h(async (req, res) => {
    const p = BatchIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.errors.map((e) => e.message).join("; ") });
      return;
    }
    const batch = await svc.getBatch(parseInt(p.data.id, 10));
    if (!batch) {
      res.status(404).json({ error: "Batch not found" });
      return;
    }
    res.status(200).json(batch);
  }),
);

/**
 * GET /admin/payroll/batches/:id/download[?evidenceOnly=true]
 * Returns the stored csv_content exactly as it was at export time.  Verifies
 * SHA-256 checksum before serving.  Logs BATCH_DOWNLOADED.
 *
 * For batches in status `superseded` or `voided`, the request must include
 * `evidenceOnly=true`; otherwise the response is 409 BatchNotDownloadableError.
 * Evidence-only downloads use a distinct filename and X-Evidence-Only header
 * so the file is not mistaken for a current payroll export.
 */
router.get(
  "/admin/payroll/batches/:id/download",
  authenticateToken,
  requireRole("ADMIN", "OWNER"),
  h(async (req, res) => {
    const p = BatchIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.errors.map((e) => e.message).join("; ") });
      return;
    }
    const q = DownloadQuery.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: q.error.errors.map((e) => e.message).join("; ") });
      return;
    }
    const evidenceOnly = q.data.evidenceOnly === "true";
    const actor = actorFromUser(req.user ?? null, req.ip ?? null);
    const { batch, csvContent } = await svc.downloadBatchCsv({
      batchId: parseInt(p.data.id, 10),
      actor,
      evidenceOnly,
    });
    const evidenceSuffix = evidenceOnly && (batch.status === "superseded" || batch.status === "voided")
      ? `-${batch.status.toUpperCase()}-EVIDENCE-ONLY`
      : "";
    const filename = `gusto-export-${batch.periodStart}-to-${batch.periodEnd}-rev${batch.revisionNumber}${evidenceSuffix}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Batch-Id", String(batch.id));
    res.setHeader("X-Batch-Revision", String(batch.revisionNumber));
    res.setHeader("X-Batch-Status", batch.status);
    res.setHeader("X-Batch-Checksum", batch.csvChecksum);
    if (evidenceOnly) {
      res.setHeader("X-Evidence-Only", "true");
    }
    res.send(csvContent);
  }),
);

/**
 * POST /admin/payroll/batches/:id/process
 * Terminal transition — marks batch as processed.  Requires a confirmation note.
 * Processed batches are immutable.
 */
router.post(
  "/admin/payroll/batches/:id/process",
  authenticateToken,
  requireRole("ADMIN", "OWNER"),
  h(async (req, res) => {
    const p = BatchIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.errors.map((e) => e.message).join("; ") });
      return;
    }
    const body = ProcessBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.errors.map((e) => e.message).join("; ") });
      return;
    }
    const actor = actorFromUser(req.user ?? null, req.ip ?? null);
    const updated = await svc.markBatchProcessed({
      batchId: parseInt(p.data.id, 10),
      confirmationNote: body.data.confirmationNote,
      actor,
    });
    res.status(200).json(updated);
  }),
);

export default router;
