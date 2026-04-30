/**
 * Labor Capture AI Suggestion Routes — Phase B Prompt 1
 *
 * Mounted at: /api/timekeeping  (via routes/index.ts)
 *
 * Portal-authenticated routes (employee portal):
 *   POST /labor-capture/portal/:portalId/suggest
 *     — Submit narrative, call OpenAI, validate, persist, return suggestion.
 *
 *   GET  /labor-capture/portal/:portalId/suggest/:id
 *     — Retrieve suggestion by ID (only if owned by authenticated employee).
 *       EXPIRED suggestions are clearly marked.
 *
 *   POST /labor-capture/portal/:portalId/reject/:id
 *     — Mark DRAFT suggestion as REJECTED.
 *
 * Security hardening (all applied in POST /suggest before reaching service):
 *   - Narrative stripped/rejected if HTML tags or script-like patterns detected.
 *   - 2,000-character cap enforced at the route level (service also enforces).
 *   - No OpenAI response, system prompt, or raw narrative echoed in errors.
 *   - Security rejections logged as warnings without logging narrative content.
 */

import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from "express";
import { authenticatePortalToken } from "../../../middleware/auth";
import { z } from "zod";
import * as aiSvc from "../../services/timekeeping/laborCaptureAI.service";
import { laborCaptureSuggestionsTable } from "../../schema/timekeeping";
import { db } from "../../../db";
import { eq } from "drizzle-orm";
import { employees } from "../../../schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extracts statusCode and message from an unknown caught error. */
function extractError(err: unknown): { statusCode: number; message: string } {
  if (err instanceof Error) {
    const statusCode =
      typeof (err as Record<string, unknown>)["statusCode"] === "number"
        ? ((err as Record<string, unknown>)["statusCode"] as number)
        : 500;
    return { statusCode, message: err.message };
  }
  return { statusCode: 500, message: "Internal server error" };
}

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) =>
    fn(req, res, next).catch((err: unknown) => {
      const { statusCode, message } = extractError(err);
      console.error("[timekeeping/laborCapture]", message);
      if (!res.headersSent) {
        res.status(statusCode).json({ error: message });
      }
    });
}

// ---------------------------------------------------------------------------
// Security constants — must match laborCaptureAI.service.ts
// ---------------------------------------------------------------------------
const MAX_NARRATIVE_CHARS = 2000;
const HTML_TAG_RE = /<[^>]*>/g;
const SCRIPT_LIKE_RE = /<script|javascript:|onerror=|onload=|data:/i;

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const suggestBodySchema = z.object({
  timesheetId: z.number().int().positive("timesheetId must be a positive integer"),
  narrative: z.string().min(1, "narrative is required").max(MAX_NARRATIVE_CHARS),
});

// ---------------------------------------------------------------------------
// Salaried pay-type guard — rejects non-salary employees before any service call
// ---------------------------------------------------------------------------
async function requireSalaryPayType(
  epochEmployeeId: number,
  res: Response,
): Promise<boolean> {
  const [emp] = await db
    .select({ payType: employees.payType })
    .from(employees)
    .where(eq(employees.id, epochEmployeeId))
    .limit(1);

  if (!emp || emp.payType?.toUpperCase() !== "SALARY") {
    res.status(403).json({ error: "AI labor capture is only available to salaried employees." });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const router: IRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/timekeeping/labor-capture/portal/:portalId/suggest
// ---------------------------------------------------------------------------
router.post(
  "/labor-capture/portal/:portalId/suggest",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) {
      res.status(401).json({ error: "Portal auth required" });
      return;
    }

    if (!(await requireSalaryPayType(epochEmployeeId, res))) return;

    const parsed = suggestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const { timesheetId, narrative } = parsed.data;

    // Security checks — performed before the service call so no raw content
    // is forwarded or logged.
    if (SCRIPT_LIKE_RE.test(narrative)) {
      console.warn(
        "[laborCapture] Security: script-like pattern rejected from employee",
        epochEmployeeId,
      );
      res.status(400).json({ error: "Narrative contains disallowed content." });
      return;
    }

    if (HTML_TAG_RE.test(narrative)) {
      console.warn(
        "[laborCapture] Security: HTML content rejected from employee",
        epochEmployeeId,
      );
      res.status(400).json({ error: "Narrative contains disallowed HTML content." });
      return;
    }

    let suggestion: Awaited<ReturnType<typeof aiSvc.generateSuggestions>>;
    try {
      suggestion = await aiSvc.generateSuggestions(epochEmployeeId, timesheetId, narrative);
    } catch (err: unknown) {
      const { statusCode, message } = extractError(err);
      res.status(statusCode).json({ error: message });
      return;
    }

    // Respond with the suggestion record.
    // originalNarrative is intentionally included so the employee can see
    // what they submitted; raw parsedJson (AI raw output) is excluded.
    res.status(201).json({
      id: suggestion.id,
      timesheetId: suggestion.timesheetId,
      originalNarrative: suggestion.originalNarrative,
      suggestedLines: suggestion.suggestedLines,
      overallConfidence: suggestion.overallConfidence,
      lowConfidenceFlagged: suggestion.lowConfidenceFlagged,
      status: suggestion.status,
      createdAt: suggestion.createdAt,
      expiresAt: suggestion.expiresAt,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /api/timekeeping/labor-capture/portal/:portalId/suggest/:id
// ---------------------------------------------------------------------------
router.get(
  "/labor-capture/portal/:portalId/suggest/:id",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) {
      res.status(401).json({ error: "Portal auth required" });
      return;
    }

    if (!(await requireSalaryPayType(epochEmployeeId, res))) return;

    const suggestionId = Number(req.params.id);
    if (!suggestionId || !Number.isInteger(suggestionId)) {
      res.status(400).json({ error: "Invalid suggestion ID." });
      return;
    }

    const [suggestion] = await db
      .select()
      .from(laborCaptureSuggestionsTable)
      .where(eq(laborCaptureSuggestionsTable.id, suggestionId))
      .limit(1);

    if (!suggestion) {
      res.status(404).json({ error: "Suggestion not found." });
      return;
    }

    if (suggestion.employeeId !== epochEmployeeId) {
      res.status(403).json({ error: "Forbidden: suggestion does not belong to this employee." });
      return;
    }

    // Determine effective status: mark expired in memory if past TTL
    const now = new Date();
    const effectiveStatus =
      suggestion.status === "DRAFT" && suggestion.expiresAt && new Date(suggestion.expiresAt) < now
        ? "EXPIRED"
        : suggestion.status;

    res.json({
      id: suggestion.id,
      timesheetId: suggestion.timesheetId,
      originalNarrative: suggestion.originalNarrative,
      suggestedLines: suggestion.suggestedLines,
      overallConfidence: suggestion.overallConfidence,
      lowConfidenceFlagged: suggestion.lowConfidenceFlagged,
      status: effectiveStatus,
      createdAt: suggestion.createdAt,
      rejectedAt: suggestion.rejectedAt,
      expiresAt: suggestion.expiresAt,
      isExpired: effectiveStatus === "EXPIRED",
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/timekeeping/labor-capture/portal/:portalId/reject/:id
// ---------------------------------------------------------------------------
router.post(
  "/labor-capture/portal/:portalId/reject/:id",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) {
      res.status(401).json({ error: "Portal auth required" });
      return;
    }

    if (!(await requireSalaryPayType(epochEmployeeId, res))) return;

    const suggestionId = Number(req.params.id);
    if (!suggestionId || !Number.isInteger(suggestionId)) {
      res.status(400).json({ error: "Invalid suggestion ID." });
      return;
    }

    let updated: Awaited<ReturnType<typeof aiSvc.rejectSuggestion>>;
    try {
      updated = await aiSvc.rejectSuggestion(suggestionId, epochEmployeeId);
    } catch (err: unknown) {
      const { statusCode, message } = extractError(err);
      res.status(statusCode).json({ error: message });
      return;
    }

    res.json({
      id: updated.id,
      status: updated.status,
      rejectedAt: updated.rejectedAt,
      message: "Suggestion rejected.",
    });
  }),
);

export default router;
