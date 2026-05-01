/**
 * Labor Entry Drafts Routes — Phase 3 (Manual draft UI and API for salaried time entry)
 *
 * Feature-flag gated by SALARIED_DRAFT_ENTRY_ENABLED.
 * All endpoints are portal-authenticated.
 *
 * Mounted at: /api/timekeeping (via routes/index.ts)
 *
 * Portal routes:
 *   POST   /labor-entry-drafts/portal/:portalId                     create draft
 *   GET    /labor-entry-drafts/portal/:portalId                     list drafts (by date range)
 *   GET    /labor-entry-drafts/portal/:portalId/:id                 single draft
 *   PATCH  /labor-entry-drafts/portal/:portalId/:id                 update segments
 *   POST   /labor-entry-drafts/portal/:portalId/:id/confirm         confirm (DRAFT→CONFIRMED)
 *   GET    /labor-entry-drafts/portal/:portalId/charge-codes        list active direct charge codes
 *   GET    /labor-entry-drafts/portal/:portalId/indirect-codes      list active indirect codes
 *
 * Admin routes (session-auth, ADMIN/OWNER/SUPERVISOR only):
 *   POST   /portal/:portalId/labor-entry-drafts/:id/post            post CONFIRMED draft as synthetic punch session
 */

import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from "express";
import { z } from "zod";
import { db } from "../../../db";
import { eq, and, gte, lte, desc, isNull } from "drizzle-orm";
import { authenticatePortalToken, authenticateToken, requireRole } from "../../../middleware/auth";
import { salariedDraftEntryEnabled } from "../../lib/featureFlags";
import {
  postLaborEntryDraft,
} from "../../services/timekeeping/laborEntryDraftPostingService";
import {
  laborEntryDraftsTable,
  indirectCodesTable,
  salariedTimesheetsTable,
  salariedTimesheetLinesTable,
  employeesTable,
} from "../../schema/timekeeping";
import { employees as publicEmployeesTable, users } from "../../../schema";
import { chargeCodes } from "../../../schema";
import {
  parseSalariedNarrative,
  type ConversationalSegment,
} from "../../services/timekeeping/salariedLaborCaptureAI.service";

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/laborEntryDrafts]", err?.message ?? err);
    const statusCode: number =
      typeof err?.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;
    if (!res.headersSent) res.status(statusCode).json({ error: err?.message ?? "Internal server error" });
  });
}

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Feature-flag guard
// ---------------------------------------------------------------------------
function requireFlag(res: Response): boolean {
  if (!salariedDraftEntryEnabled) {
    res.status(404).json({ error: "Labor entry draft feature is not enabled" });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /labor-entry-drafts/feature-enabled
// Public endpoint (no auth) — returns whether the feature flag is on.
// Used by the portal UI to conditionally show/hide the time-entry nav buttons.
// ---------------------------------------------------------------------------
router.get(
  "/labor-entry-drafts/feature-enabled",
  h(async (_req, res): Promise<void> => {
    res.json({ enabled: salariedDraftEntryEnabled });
  }),
);

// ---------------------------------------------------------------------------
// Verify the portal employee has pay_type = SALARY.
// Returns null + sends 403 if the employee is not salaried.
// ---------------------------------------------------------------------------
async function requireSalaryPayType(epochEmployeeId: number, res: Response): Promise<boolean> {
  const [emp] = await db
    .select({ payType: publicEmployeesTable.payType })
    .from(publicEmployeesTable)
    .where(eq(publicEmployeesTable.id, epochEmployeeId))
    .limit(1);

  if (!emp || emp.payType?.toUpperCase() !== "SALARY") {
    res.status(403).json({
      error: "Manual time entry is only available to salaried employees.",
    });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Resolve the timekeeping.employees.id from a public employees.id.
// Returns null + sends 403 if the employee has no timekeeping profile.
// ---------------------------------------------------------------------------
async function resolveTimekeepingEmployee(
  epochEmployeeId: number,
  res: Response,
): Promise<{ tkEmployeeId: number } | null> {
  const [tkEmp] = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(eq(employeesTable.epochEmployeeId, epochEmployeeId))
    .limit(1);

  if (!tkEmp) {
    res.status(403).json({
      error:
        "Your employee record does not have a timekeeping profile. " +
        "Please contact your administrator to enable salaried time entry.",
    });
    return null;
  }
  return { tkEmployeeId: tkEmp.id };
}

// ---------------------------------------------------------------------------
// Resolve the users.id for a portal employee (needed for createdBy FK).
// Returns null + sends 403 if no matching user account exists.
// ---------------------------------------------------------------------------
async function resolveUserId(epochEmployeeId: number, res: Response): Promise<number | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.employeeId, epochEmployeeId))
    .limit(1);

  if (!user) {
    res.status(403).json({
      error:
        "Your employee account does not have a user login. " +
        "Manual time entry requires a linked user account. " +
        "Please contact your administrator.",
    });
    return null;
  }
  return user.id;
}

// ---------------------------------------------------------------------------
// Segment schema — used both for create and update.
// ---------------------------------------------------------------------------
const segmentSchema = z.object({
  id: z.string().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "startTime must be HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "endTime must be HH:MM"),
  chargeCodeId: z.number().int().positive().nullable().optional(),
  indirectCodeId: z.number().int().positive().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

type Segment = z.infer<typeof segmentSchema>;

const createDraftSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "entryDate must be YYYY-MM-DD"),
  segments: z.array(segmentSchema).min(1, "At least one segment is required"),
  rawInputText: z.string().max(5000).optional().nullable(),
});

const updateDraftSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  segments: z.array(segmentSchema).optional(),
  rawInputText: z.string().max(5000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function computeSegmentDurationHours(seg: Segment): number {
  const startMins = parseTimeToMinutes(seg.startTime);
  const endMins = parseTimeToMinutes(seg.endTime);
  return Math.max(0, (endMins - startMins) / 60);
}

function computeTotalHours(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + computeSegmentDurationHours(s), 0);
}

function segmentsOverlap(segs: Segment[]): { overlaps: boolean; details: string[] } {
  const details: string[] = [];
  const sorted = [...segs].sort(
    (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime),
  );
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i]!;
    const next = sorted[i + 1]!;
    if (parseTimeToMinutes(curr.endTime) > parseTimeToMinutes(next.startTime)) {
      details.push(
        `Segment ${curr.startTime}–${curr.endTime} overlaps with ${next.startTime}–${next.endTime}`,
      );
    }
  }
  return { overlaps: details.length > 0, details };
}

// ---------------------------------------------------------------------------
// GET /labor-entry-drafts/portal/:portalId/charge-codes
// Returns active DIRECT charge codes for the charge-code selector.
// ---------------------------------------------------------------------------
router.get(
  "/labor-entry-drafts/portal/:portalId/charge-codes",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!requireFlag(res)) return;
    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }
    const isSalaried = await requireSalaryPayType(epochEmployeeId, res);
    if (!isSalaried) return;
    const codes = await db
      .select()
      .from(chargeCodes)
      .where(and(eq(chargeCodes.active, true), eq(chargeCodes.type, "DIRECT")));
    res.json(codes);
  }),
);

// ---------------------------------------------------------------------------
// GET /labor-entry-drafts/portal/:portalId/indirect-codes
// Returns active indirect codes (with their charge_code_id).
// ---------------------------------------------------------------------------
router.get(
  "/labor-entry-drafts/portal/:portalId/indirect-codes",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!requireFlag(res)) return;
    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }
    const isSalaried = await requireSalaryPayType(epochEmployeeId, res);
    if (!isSalaried) return;
    const codes = await db
      .select()
      .from(indirectCodesTable)
      .where(eq(indirectCodesTable.isActive, true));
    res.json(codes);
  }),
);

// ---------------------------------------------------------------------------
// POST /labor-entry-drafts/portal/:portalId
// Create a new DRAFT record for the given date.
// ---------------------------------------------------------------------------
router.post(
  "/labor-entry-drafts/portal/:portalId",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!requireFlag(res)) return;

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }

    const isSalaried = await requireSalaryPayType(epochEmployeeId, res);
    if (!isSalaried) return;

    const tkEmpResult = await resolveTimekeepingEmployee(epochEmployeeId, res);
    if (!tkEmpResult) return;

    const userId = await resolveUserId(epochEmployeeId, res);
    if (userId === null) return;

    const parsed = createDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const { entryDate, segments, rawInputText } = parsed.data;
    const totalHours = computeTotalHours(segments);

    const [draft] = await db
      .insert(laborEntryDraftsTable)
      .values({
        employeeId: tkEmpResult.tkEmployeeId,
        entryDate,
        rawInputText: rawInputText ?? null,
        parsedSegmentsJson: segments,
        status: "DRAFT",
        source: "MANUAL",
        totalHours: String(totalHours),
        createdBy: userId,
      })
      .returning();

    res.status(201).json(draft);
  }),
);

// ---------------------------------------------------------------------------
// GET /labor-entry-drafts/portal/:portalId
// List drafts for the authenticated employee, optionally filtered by date range.
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: current week)
// ---------------------------------------------------------------------------
router.get(
  "/labor-entry-drafts/portal/:portalId",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!requireFlag(res)) return;

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }

    const isSalaried = await requireSalaryPayType(epochEmployeeId, res);
    if (!isSalaried) return;

    const tkEmpResult = await resolveTimekeepingEmployee(epochEmployeeId, res);
    if (!tkEmpResult) return;

    const { from, to } = req.query as { from?: string; to?: string };

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    let fromDate = from && dateRe.test(from) ? from : null;
    let toDate = to && dateRe.test(to) ? to : null;

    if (!fromDate || !toDate) {
      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      fromDate = fromDate ?? fmt(monday);
      toDate = toDate ?? fmt(sunday);
    }

    const conditions = and(
      eq(laborEntryDraftsTable.employeeId, tkEmpResult.tkEmployeeId),
      gte(laborEntryDraftsTable.entryDate, fromDate),
      lte(laborEntryDraftsTable.entryDate, toDate),
    );

    const drafts = await db
      .select()
      .from(laborEntryDraftsTable)
      .where(conditions)
      .orderBy(desc(laborEntryDraftsTable.entryDate));

    res.json(drafts);
  }),
);

// ---------------------------------------------------------------------------
// GET /labor-entry-drafts/portal/:portalId/:id
// Fetch a single draft by ID (ownership-checked).
// ---------------------------------------------------------------------------
router.get(
  "/labor-entry-drafts/portal/:portalId/:id",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!requireFlag(res)) return;

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }

    const isSalaried = await requireSalaryPayType(epochEmployeeId, res);
    if (!isSalaried) return;

    const tkEmpResult = await resolveTimekeepingEmployee(epochEmployeeId, res);
    if (!tkEmpResult) return;

    const draftId = Number(req.params.id);
    if (!draftId) { res.status(400).json({ error: "Invalid draft ID" }); return; }

    const [draft] = await db
      .select()
      .from(laborEntryDraftsTable)
      .where(
        and(
          eq(laborEntryDraftsTable.id, draftId),
          eq(laborEntryDraftsTable.employeeId, tkEmpResult.tkEmployeeId),
        ),
      )
      .limit(1);

    if (!draft) { res.status(404).json({ error: `Draft ${draftId} not found` }); return; }

    res.json(draft);
  }),
);

// ---------------------------------------------------------------------------
// PATCH /labor-entry-drafts/portal/:portalId/:id
// Update segments (and optionally date/rawInputText) on a DRAFT or NEEDS_REVIEW draft.
// ---------------------------------------------------------------------------
router.patch(
  "/labor-entry-drafts/portal/:portalId/:id",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!requireFlag(res)) return;

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }

    const isSalaried = await requireSalaryPayType(epochEmployeeId, res);
    if (!isSalaried) return;

    const tkEmpResult = await resolveTimekeepingEmployee(epochEmployeeId, res);
    if (!tkEmpResult) return;

    const draftId = Number(req.params.id);
    if (!draftId) { res.status(400).json({ error: "Invalid draft ID" }); return; }

    const [existing] = await db
      .select()
      .from(laborEntryDraftsTable)
      .where(
        and(
          eq(laborEntryDraftsTable.id, draftId),
          eq(laborEntryDraftsTable.employeeId, tkEmpResult.tkEmployeeId),
        ),
      )
      .limit(1);

    if (!existing) { res.status(404).json({ error: `Draft ${draftId} not found` }); return; }

    if (!["DRAFT", "NEEDS_REVIEW"].includes(existing.status)) {
      res.status(409).json({
        error: `Draft is in status '${existing.status}' and cannot be edited. Only DRAFT and NEEDS_REVIEW drafts can be updated.`,
        currentStatus: existing.status,
      });
      return;
    }

    const parsed = updateDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const update: Partial<typeof laborEntryDraftsTable.$inferInsert> = {};
    if (parsed.data.entryDate !== undefined) update.entryDate = parsed.data.entryDate;
    if (parsed.data.rawInputText !== undefined) update.rawInputText = parsed.data.rawInputText;
    if (parsed.data.segments !== undefined) {
      if (existing.source === "CONVERSATIONAL" && Array.isArray(existing.parsedSegmentsJson)) {
        // For conversational drafts, merge user's code-selection edits into the stored
        // segments while preserving all AI-generated metadata (confidence, needsReview,
        // explanation, durationHours, date, laborCategory, description) for DCAA traceability.
        const stored = existing.parsedSegmentsJson as ConversationalSegment[];
        const merged: ConversationalSegment[] = stored.map((storedSeg) => {
          const edit = parsed.data.segments!.find((u) => u.id === storedSeg.id);
          if (!edit) return storedSeg;
          return {
            ...storedSeg,
            chargeCodeId: edit.chargeCodeId !== undefined ? edit.chargeCodeId : storedSeg.chargeCodeId,
            indirectCodeId: edit.indirectCodeId !== undefined ? edit.indirectCodeId : storedSeg.indirectCodeId,
            description: edit.notes ?? storedSeg.description,
          };
        });
        update.parsedSegmentsJson = merged;
        update.totalHours = String(merged.reduce((sum, s) => sum + s.durationHours, 0));
      } else {
        update.parsedSegmentsJson = parsed.data.segments;
        update.totalHours = String(computeTotalHours(parsed.data.segments));
      }
    }
    update.status = "DRAFT";
    update.validationErrorsJson = null;

    const [updated] = await db
      .update(laborEntryDraftsTable)
      .set(update)
      .where(eq(laborEntryDraftsTable.id, draftId))
      .returning();

    res.json(updated);
  }),
);

// ---------------------------------------------------------------------------
// POST /labor-entry-drafts/portal/:portalId/:id/confirm
// Run server-side validation and move DRAFT/NEEDS_REVIEW → CONFIRMED.
// On failure: sets status to NEEDS_REVIEW with validation_errors_json.
// ---------------------------------------------------------------------------
router.post(
  "/labor-entry-drafts/portal/:portalId/:id/confirm",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!requireFlag(res)) return;

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }

    const isSalaried = await requireSalaryPayType(epochEmployeeId, res);
    if (!isSalaried) return;

    const tkEmpResult = await resolveTimekeepingEmployee(epochEmployeeId, res);
    if (!tkEmpResult) return;

    const draftId = Number(req.params.id);
    if (!draftId) { res.status(400).json({ error: "Invalid draft ID" }); return; }

    const [draft] = await db
      .select()
      .from(laborEntryDraftsTable)
      .where(
        and(
          eq(laborEntryDraftsTable.id, draftId),
          eq(laborEntryDraftsTable.employeeId, tkEmpResult.tkEmployeeId),
        ),
      )
      .limit(1);

    if (!draft) { res.status(404).json({ error: `Draft ${draftId} not found` }); return; }

    if (!["DRAFT", "NEEDS_REVIEW"].includes(draft.status)) {
      res.status(409).json({
        error: `Draft is in status '${draft.status}' and cannot be confirmed.`,
        currentStatus: draft.status,
      });
      return;
    }

    const segments = (draft.parsedSegmentsJson ?? []) as Segment[];
    const errors: Record<string, string[]> = {};
    const globalErrors: string[] = [];

    // ── 1. Validate each segment ────────────────────────────────────────────
    if (segments.length === 0) {
      globalErrors.push("At least one time segment is required.");
    }

    const activeIndirectCodes = await db
      .select()
      .from(indirectCodesTable)
      .where(eq(indirectCodesTable.isActive, true));
    const indirectCodeMap = new Map(activeIndirectCodes.map((c) => [c.id, c]));

    const activeDirectCodes = await db
      .select({ id: chargeCodes.id, code: chargeCodes.code, active: chargeCodes.active })
      .from(chargeCodes)
      .where(and(eq(chargeCodes.active, true), eq(chargeCodes.type, "DIRECT")));
    const directCodeSet = new Set(activeDirectCodes.map((c) => c.id));
    const directCodeById = new Map(activeDirectCodes.map((c) => [c.id, c]));

    segments.forEach((seg, idx) => {
      const segErrors: string[] = [];

      const durationHours = computeSegmentDurationHours(seg);
      if (durationHours <= 0) {
        segErrors.push("End time must be after start time.");
      }
      if (parseTimeToMinutes(seg.startTime) >= parseTimeToMinutes(seg.endTime)) {
        segErrors.push("Start time must be before end time.");
      }

      const hasDirectCode = Boolean(seg.chargeCodeId);
      const hasIndirectCode = Boolean(seg.indirectCodeId);

      if (!hasDirectCode && !hasIndirectCode) {
        segErrors.push("A charge code or indirect code is required.");
      }
      if (hasDirectCode && hasIndirectCode) {
        segErrors.push("Specify either a charge code or an indirect code, not both.");
      }
      if (hasDirectCode && seg.chargeCodeId) {
        if (!directCodeSet.has(seg.chargeCodeId)) {
          const code = directCodeById.get(seg.chargeCodeId);
          segErrors.push(
            code
              ? `Charge code '${code.code}' is no longer active. Please select a different code.`
              : `Charge code ID ${seg.chargeCodeId} does not exist or is not an active direct charge code.`,
          );
        }
      }
      if (hasIndirectCode && seg.indirectCodeId) {
        const ic = indirectCodeMap.get(seg.indirectCodeId);
        if (!ic) {
          segErrors.push(`Indirect code ID ${seg.indirectCodeId} is not active or does not exist.`);
        } else if (!ic.chargeCodeId) {
          segErrors.push(`Indirect code '${ic.code}' has no charge code mapping. Contact your administrator.`);
        }
      }

      if (segErrors.length > 0) {
        errors[`segment_${idx}`] = segErrors;
      }
    });

    // ── 2. Overlap check within draft ──────────────────────────────────────
    if (segments.length > 1) {
      const { overlaps, details } = segmentsOverlap(segments);
      if (overlaps) {
        globalErrors.push(...details.map((d) => `Overlap detected: ${d}`));
      }
    }

    // ── 3. Check for PAYROLL_APPROVED period collision ─────────────────────
    const entryDate = draft.entryDate;
    const approvedTimesheets = await db
      .select({
        id: salariedTimesheetsTable.id,
        periodStart: salariedTimesheetsTable.periodStart,
        periodEnd: salariedTimesheetsTable.periodEnd,
        status: salariedTimesheetsTable.status,
      })
      .from(salariedTimesheetsTable)
      .where(
        and(
          eq(salariedTimesheetsTable.employeeId, epochEmployeeId),
          eq(salariedTimesheetsTable.status, "PAYROLL_APPROVED"),
          lte(salariedTimesheetsTable.periodStart, entryDate),
          gte(salariedTimesheetsTable.periodEnd, entryDate),
        ),
      );

    if (approvedTimesheets.length > 0) {
      const ts = approvedTimesheets[0]!;
      globalErrors.push(
        `The date ${entryDate} falls within a payroll-approved timesheet period ` +
        `(${ts.periodStart} – ${ts.periodEnd}). This period is locked and cannot accept new entries.`,
      );
    }

    // ── 4. Check for locked salaried_timesheet_line collisions ─────────────
    // Join through salariedTimesheetsTable to scope to this employee only.
    const lockedLines = await db
      .select({
        id: salariedTimesheetLinesTable.id,
        date: salariedTimesheetLinesTable.date,
        lineType: salariedTimesheetLinesTable.lineType,
        hours: salariedTimesheetLinesTable.hours,
      })
      .from(salariedTimesheetLinesTable)
      .innerJoin(
        salariedTimesheetsTable,
        eq(salariedTimesheetLinesTable.timesheetId, salariedTimesheetsTable.id),
      )
      .where(
        and(
          eq(salariedTimesheetsTable.employeeId, epochEmployeeId),
          eq(salariedTimesheetLinesTable.date, entryDate),
          eq(salariedTimesheetLinesTable.isLocked, true),
        ),
      );

    if (lockedLines.length > 0) {
      const lineTypes = lockedLines.map((l) => l.lineType).join(", ");
      globalErrors.push(
        `The date ${entryDate} has locked timesheet entries (${lineTypes}). ` +
        `Contact your administrator if you believe this is incorrect.`,
      );
    }

    // ── Persist result ──────────────────────────────────────────────────────
    const hasErrors = globalErrors.length > 0 || Object.keys(errors).length > 0;

    if (hasErrors) {
      const validationErrorsJson = { global: globalErrors, segments: errors };
      const [updated] = await db
        .update(laborEntryDraftsTable)
        .set({ status: "NEEDS_REVIEW", validationErrorsJson })
        .where(eq(laborEntryDraftsTable.id, draftId))
        .returning();

      res.status(422).json({
        status: "NEEDS_REVIEW",
        validationErrors: validationErrorsJson,
        draft: updated,
        message: "Validation failed. Please correct the errors and try again.",
      });
      return;
    }

    const totalHours = computeTotalHours(segments);
    const [confirmed] = await db
      .update(laborEntryDraftsTable)
      .set({
        status: "CONFIRMED",
        totalHours: String(totalHours),
        validationErrorsJson: null,
      })
      .where(eq(laborEntryDraftsTable.id, draftId))
      .returning();

    res.json({
      status: "CONFIRMED",
      draft: confirmed,
      message: "Draft confirmed and queued for posting.",
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /portal/:portalId/labor-entry-drafts/:id/post
// Post a CONFIRMED draft as a synthetic punch session + allocations.
// Requires session auth with ADMIN, OWNER, or SUPERVISOR role (payroll/admin gated).
// Returns 409 if already posted (idempotent — includes existing punch_ledger_id).
// ---------------------------------------------------------------------------
router.post(
  "/portal/:portalId/labor-entry-drafts/:id/post",
  authenticateToken,
  requireRole("ADMIN", "OWNER", "SUPERVISOR"),
  h(async (req, res): Promise<void> => {
    if (!requireFlag(res)) return;

    const draftId = Number(req.params.id);
    if (!draftId || isNaN(draftId)) {
      res.status(400).json({ error: "Invalid draft ID" });
      return;
    }

    const postedByUserId: number | null = req.user?.id ?? null;
    if (!postedByUserId) {
      res.status(401).json({ error: "Authenticated user required" });
      return;
    }

    const result = await postLaborEntryDraft(draftId, postedByUserId);

    if ("alreadyPosted" in result && result.alreadyPosted) {
      res.status(409).json({
        error: result.message,
        draftId: result.draftId,
        punchLedgerId: result.punchLedgerId,
      });
      return;
    }

    res.status(200).json(result);
  }),
);

// ---------------------------------------------------------------------------
// POST /labor-entry-drafts/portal/:portalId/conversational
// Parse a natural-language narrative via AI, create a labor_entry_drafts row
// with source='CONVERSATIONAL', and return the draft + parsed segments.
//
// Body: { narrative: string, referenceDate?: string }
// Returns: { draft, segments, validationErrors, overallConfidence, hasNeedsReview }
// ---------------------------------------------------------------------------

const conversationalBodySchema = z.object({
  narrative: z
    .string()
    .min(1, "narrative is required")
    .max(2000, "narrative must be 2000 characters or fewer"),
  referenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "referenceDate must be YYYY-MM-DD")
    .optional(),
});

router.post(
  "/labor-entry-drafts/portal/:portalId/conversational",
  authenticatePortalToken,
  h(async (req, res): Promise<void> => {
    if (!requireFlag(res)) return;

    const epochEmployeeId = req.portalEmployeeId;
    if (!epochEmployeeId) { res.status(401).json({ error: "Portal auth required" }); return; }

    const isSalaried = await requireSalaryPayType(epochEmployeeId, res);
    if (!isSalaried) return;

    const tkEmpResult = await resolveTimekeepingEmployee(epochEmployeeId, res);
    if (!tkEmpResult) return;

    const userId = await resolveUserId(epochEmployeeId, res);
    if (userId === null) return;

    const parsed = conversationalBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const { narrative, referenceDate } = parsed.data;
    const resolvedDate = referenceDate ?? new Date().toISOString().slice(0, 10);

    let parseResult: Awaited<ReturnType<typeof parseSalariedNarrative>>;
    try {
      parseResult = await parseSalariedNarrative(
        tkEmpResult.tkEmployeeId,
        narrative,
        resolvedDate,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Parse failed";
      const statusCode =
        err instanceof Error && typeof (err as Record<string, unknown>)["statusCode"] === "number"
          ? ((err as Record<string, unknown>)["statusCode"] as number)
          : 500;
      res.status(statusCode).json({ error: msg });
      return;
    }

    const { segments, validationErrors, overallConfidence, hasNeedsReview, totalHours } = parseResult;

    const draftStatus: "DRAFT" | "NEEDS_REVIEW" = hasNeedsReview ? "NEEDS_REVIEW" : "DRAFT";

    const validationErrorsJson =
      validationErrors.length > 0
        ? {
            global: validationErrors
              .filter((e) => e.segmentIndex === -1)
              .map((e) => e.reason),
            segments: Object.fromEntries(
              validationErrors
                .filter((e) => e.segmentIndex >= 0)
                .map((e) => [`segment_${e.segmentIndex}`, [e.reason]]),
            ),
          }
        : null;

    const [draft] = await db
      .insert(laborEntryDraftsTable)
      .values({
        employeeId: tkEmpResult.tkEmployeeId,
        entryDate: resolvedDate,
        rawInputText: narrative,
        parsedSegmentsJson: segments,
        status: draftStatus,
        source: "CONVERSATIONAL",
        totalHours: totalHours > 0 ? String(totalHours.toFixed(4)) : null,
        confidenceScore: String(overallConfidence.toFixed(4)),
        validationErrorsJson,
        createdBy: userId,
      })
      .returning();

    if (!draft) {
      res.status(500).json({ error: "Failed to create draft record." });
      return;
    }

    res.status(201).json({
      draft,
      segments,
      validationErrors,
      overallConfidence,
      hasNeedsReview,
      totalHours,
    });
  }),
);

export default router;
