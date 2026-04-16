import { Router, type IRouter } from "express";
import { z } from "zod";
import * as svc from "../services/leave.service";
import { actorFromUser } from "../services/audit.service";

const router: IRouter = Router();

const LeaveFilters = z.object({
  employeeId: z.coerce.number().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const CreateLeaveBody = z.object({
  employeeId: z.number(),
  date: z.string().min(1),
  leaveType: z.string().min(1),
  hours: z.number().positive().max(24),
  note: z.string().nullable().optional(),
});

const UpdateLeaveBody = z.object({
  date: z.string().min(1).optional(),
  leaveType: z.string().min(1).optional(),
  hours: z.number().positive().max(24).optional(),
  note: z.string().nullable().optional(),
});

router.get("/leave-entries", async (req, res): Promise<void> => {
  const f = LeaveFilters.safeParse(req.query);
  if (!f.success) { res.status(400).json({ error: f.error.message }); return; }

  const user = req.user as { role?: string; employeeId?: number } | undefined;
  if (user?.role !== "admin") {
    if (!user?.employeeId) { res.status(403).json({ error: "Forbidden" }); return; }
    f.data.employeeId = user.employeeId;
  }

  res.json(await svc.listLeaveEntries(f.data));
});

router.get("/leave-entries/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const entry = await svc.getLeaveEntry(id);
  if (!entry) { res.status(404).json({ error: "Leave entry not found" }); return; }

  const user = req.user as { role?: string; employeeId?: number } | undefined;
  if (user?.role !== "admin" && user?.employeeId !== entry.employeeId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  res.json(entry);
});

router.post("/leave-entries", async (req, res): Promise<void> => {
  const body = CreateLeaveBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const user = req.user as { role?: string; employeeId?: number } | undefined;
  if (user?.role !== "admin" && user?.employeeId !== body.data.employeeId) {
    res.status(403).json({ error: "Employees can only create leave entries for themselves" }); return;
  }

  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.createLeaveEntry(body.data, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.status(201).json(result);
});

router.patch("/leave-entries/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const user = req.user as { role?: string } | undefined;
  if (user?.role !== "admin") { res.status(403).json({ error: "Only admins can update leave entries" }); return; }

  const body = UpdateLeaveBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.updateLeaveEntry(id, body.data, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
});

router.delete("/leave-entries/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const user = req.user as { role?: string } | undefined;
  if (user?.role !== "admin") { res.status(403).json({ error: "Only admins can delete leave entries" }); return; }

  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.deleteLeaveEntry(id, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.status(204).end();
});

export default router;
