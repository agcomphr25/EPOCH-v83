import { Router, type IRouter } from "express";
import { z } from "zod";
import * as svc from "../services/amendments.service";
import { actorFromUser } from "../services/audit.service";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

const CreateAmendmentBody = z.object({
  justification: z.string().min(1),
  fieldChanged: z.string().min(1),
  newValue: z.string().min(1),
});

router.get("/timesheets/:id/amendments", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid timesheet id" }); return; }
  res.json(await svc.listAmendments(id));
});

router.post("/timesheets/:id/amend", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid timesheet id" }); return; }
  const body = CreateAmendmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.createAmendment({ timesheetId: id, ...body.data }, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.status(201).json(result);
});

router.post("/amendments/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid amendment id" }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.approveAmendment(id, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
});

router.post("/amendments/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid amendment id" }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.rejectAmendment(id, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
});

export default router;
