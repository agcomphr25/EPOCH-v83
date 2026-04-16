import { Router, type IRouter } from "express";
import {
  ListCostCodesQueryParams,
  CreateCostCodeBody,
  UpdateCostCodeBody,
} from "@workspace/api-zod";
import * as svc from "../services/cost-codes.service";
import { actorFromUser } from "../services/audit.service";

const router: IRouter = Router();

router.get("/cost-codes", async (req, res): Promise<void> => {
  const q = ListCostCodesQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  const activeOnly = q.data.active === true ? true : undefined;
  res.json(await svc.listCostCodes(activeOnly));
});

router.post("/cost-codes", async (req, res): Promise<void> => {
  const body = CreateCostCodeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const row = await svc.createCostCode(body.data, actor);
  res.status(201).json(row);
});

router.patch("/cost-codes/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = UpdateCostCodeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const row = await svc.updateCostCode(id, body.data, actor);
  if (!row) { res.status(404).json({ error: "Cost code not found" }); return; }
  res.json(row);
});

router.delete("/cost-codes/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const ok = await svc.deleteCostCode(id, actor);
  if (!ok) { res.status(404).json({ error: "Cost code not found" }); return; }
  res.sendStatus(204);
});

router.get("/kiosk/cost-codes", async (_req, res): Promise<void> => {
  res.json(await svc.listCostCodes(true));
});

export default router;
