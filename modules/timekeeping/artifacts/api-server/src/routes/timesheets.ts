import { Router, type IRouter } from "express";
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
} from "@workspace/api-zod";
import * as svc from "../services/timesheets.service";
import * as punchSvc from "../services/punches.service";
import * as leaveSvc from "../services/leave.service";
import * as settingsSvc from "../services/settings.service";
import { actorFromUser } from "../services/audit.service";
import { requireAdmin } from "../middlewares/auth";

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

const router: IRouter = Router();

router.get("/timesheets", async (req, res): Promise<void> => {
  const q = ListTimesheetsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  res.json(await svc.listTimesheets(q.data));
});

router.post("/timesheets", async (req, res): Promise<void> => {
  const body = CreateTimesheetBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const ts = await svc.createTimesheet(body.data, actor);
  res.status(201).json(ts);
});

router.get("/timesheets/:id", async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const ts = await svc.getTimesheet(p.data.id);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
  res.json(ts);
});

router.patch("/timesheets/:id", async (req, res): Promise<void> => {
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
});

router.post("/timesheets/:id/attest", async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.attestTimesheet(p.data.id, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
});

router.post("/timesheets/:id/submit", async (req, res): Promise<void> => {
  const p = SubmitTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.submitTimesheet(p.data.id, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
});

router.post("/timesheets/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const p = ApproveTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.approveTimesheet(p.data.id, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
});

router.post("/timesheets/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const p = RejectTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const body = RejectTimesheetBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.rejectTimesheet(p.data.id, body.data.rejectionNote, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
});

router.get("/timesheets/:id/leave-summary", async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const ts = await svc.getTimesheet(p.data.id);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }

  const user = req.user as { role?: string; employeeId?: number } | undefined;
  const isAdmin = user?.role === "admin";
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
});

router.get("/timesheets/:id/gaps", async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const ts = await svc.getTimesheet(p.data.id);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }

  const user = req.user as { role?: string; employeeId?: number } | undefined;
  const isAdmin = user?.role === "admin";
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
});

router.get("/timesheets/:id/punches", async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const ts = await svc.getTimesheet(p.data.id);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }

  const user = req.user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const isAdmin = user.role === "admin";
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
});

router.post("/timesheets/:id/recalculate", async (req, res): Promise<void> => {
  const p = GetTimesheetParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.recalculateTimesheetHours(p.data.id, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result.timesheet);
});

export default router;
