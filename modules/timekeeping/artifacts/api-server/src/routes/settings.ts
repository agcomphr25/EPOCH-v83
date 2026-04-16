import { Router, type IRouter } from "express";
import { UpdateSettingsBody } from "@workspace/api-zod";
import * as svc from "../services/settings.service";
import { actorFromUser } from "../services/audit.service";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/settings", async (_req, res): Promise<void> => {
  res.json(await svc.getOrCreateSettings());
});

router.patch("/settings", requireAdmin, async (req, res): Promise<void> => {
  const body = UpdateSettingsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.updateSettings(body.data, actor);
  if ("error" in result) { res.status(400).json({ error: result.error }); return; }
  res.json(result);
});

export default router;
