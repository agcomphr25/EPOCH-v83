import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { authenticateToken, requireRole } from "../../../middleware/auth";
import { actorFromUser } from "../../services/timekeeping/audit.service";
import * as svc from "../../services/timekeeping/corrections.service";
import { getTimesheet } from "../../services/timekeeping/timesheets.service";
import { timesheetsTable } from "../../schema/timekeeping";
import { employees } from "../../../schema";
import { db } from "../../../db";
import type { TimesheetCorrection } from "../../services/timekeeping/corrections.service";

async function enrichCorrections(
  corrections: TimesheetCorrection[]
): Promise<(TimesheetCorrection & { employeeName: string | null; periodStart: string | null; periodEnd: string | null })[]> {
  if (corrections.length === 0) return [];

  const timesheetIds = [...new Set(corrections.map(c => c.timesheetId))];
  const sheets = await db
    .select({
      id: timesheetsTable.id,
      employeeId: timesheetsTable.employeeId,
      periodStart: timesheetsTable.periodStart,
      periodEnd: timesheetsTable.periodEnd,
    })
    .from(timesheetsTable)
    .where(inArray(timesheetsTable.id, timesheetIds));

  const employeeIds = [...new Set(sheets.map(s => s.employeeId))];
  const emps = employeeIds.length > 0
    ? await db
        .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(inArray(employees.id, employeeIds))
    : [];

  const sheetMap = new Map(sheets.map(s => [s.id, s]));
  const empMap = new Map(emps.map(e => [e.id, e]));

  return corrections.map(c => {
    const sheet = sheetMap.get(c.timesheetId);
    const emp = sheet ? empMap.get(sheet.employeeId) : undefined;
    return {
      ...c,
      employeeName: emp ? `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() || null : null,
      periodStart: sheet?.periodStart ?? null,
      periodEnd: sheet?.periodEnd ?? null,
    };
  });
}

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/corrections]", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });
}

const router: IRouter = Router();

const PunchEditSchema = z.object({
  punchId: z.number().int().positive(),
  field: z.enum(["costCode", "note"]),
  oldValue: z.string().nullable().optional(),
  newValue: z.string().nullable().optional(),
});

const ProposedChangesSchema = z.object({
  mode: z.enum(["reopen", "apply-edits"]).optional().default("reopen"),
  description: z.string().min(1, "Proposed changes description is required"),
  punchEdits: z.array(PunchEditSchema).optional().default([]),
});

const RequestCorrectionBody = z.object({
  timesheetId: z.number().int().positive(),
  reason: z.string().min(5, "Reason must be at least 5 characters"),
  proposedChanges: ProposedChangesSchema,
});

const ListCorrectionsQuery = z.object({
  timesheetId: z.string().regex(/^\d+$/).optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

const ReviewCorrectionBody = z.object({
  reviewerNote: z.string().min(3, "Reviewer note must be at least 3 characters"),
});

router.post("/corrections", authenticateToken, h(async (req, res): Promise<void> => {
  const body = RequestCorrectionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.errors.map(e => e.message).join("; ") });
    return;
  }

  const user = req.user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const ts = await getTimesheet(body.data.timesheetId);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }

  const isAdmin = user.role === "ADMIN" || user.role === "OWNER" || user.role === "MANAGER" || user.role === "SUPERVISOR";
  const isOwner = user.employeeId != null && user.employeeId === ts.employeeId;
  if (!isAdmin && !isOwner) {
    res.status(403).json({ error: "You can only request corrections for your own timesheets" });
    return;
  }

  const requestedByEmployeeId = user.employeeId ?? ts.employeeId;
  const actor = actorFromUser(user, req.ip ?? null);

  const result = await svc.requestCorrection(
    body.data.timesheetId,
    { reason: body.data.reason, proposedChanges: body.data.proposedChanges },
    actor,
    requestedByEmployeeId
  );

  if ("error" in result) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }

  res.status(201).json(result);
}));

router.get("/my-corrections", authenticateToken, h(async (req, res): Promise<void> => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const employeeId = user.employeeId;
  if (!employeeId) {
    res.json([]);
    return;
  }

  const corrections = await svc.listCorrections({ requestedByEmployeeId: employeeId });
  const enriched = await enrichCorrections(corrections);
  res.json(enriched);
}));

router.get("/corrections", authenticateToken, requireRole("ADMIN", "OWNER", "MANAGER", "SUPERVISOR"), h(async (req, res): Promise<void> => {
  const q = ListCorrectionsQuery.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.errors.map(e => e.message).join("; ") });
    return;
  }

  const corrections = await svc.listCorrections({
    timesheetId: q.data.timesheetId ? parseInt(q.data.timesheetId, 10) : undefined,
    status: q.data.status,
  });

  const enriched = await enrichCorrections(corrections);
  res.json(enriched);
}));

router.get("/corrections/:id", authenticateToken, h(async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid correction id" }); return; }

  const correction = await svc.getCorrection(id);
  if (!correction) { res.status(404).json({ error: "Correction request not found" }); return; }

  const user = req.user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const isAdmin = user.role === "ADMIN" || user.role === "OWNER" || user.role === "MANAGER" || user.role === "SUPERVISOR";
  const ts = await getTimesheet(correction.timesheetId);
  const isOwner = ts && user.employeeId != null && user.employeeId === ts.employeeId;

  if (!isAdmin && !isOwner) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(correction);
}));

router.post("/corrections/:id/approve", authenticateToken, requireRole("ADMIN", "OWNER", "MANAGER", "SUPERVISOR"), h(async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid correction id" }); return; }

  const body = ReviewCorrectionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.errors.map(e => e.message).join("; ") });
    return;
  }

  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.approveCorrection(id, body.data.reviewerNote, actor);

  if ("error" in result) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }

  res.json(result);
}));

router.post("/corrections/:id/reject", authenticateToken, requireRole("ADMIN", "OWNER", "MANAGER", "SUPERVISOR"), h(async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid correction id" }); return; }

  const body = ReviewCorrectionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.errors.map(e => e.message).join("; ") });
    return;
  }

  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.rejectCorrection(id, body.data.reviewerNote, actor);

  if ("error" in result) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }

  res.json(result);
}));

export default router;
