import { Router, type IRouter } from "express";
import {
  CreateCertificationBody,
  UpdateCertificationBody,
  GetCertificationParams,
  UpdateCertificationParams,
  DeleteCertificationParams,
  ListCertificationsQueryParams,
} from "@workspace/api-zod";
import * as svc from "../services/certifications.service";

const router: IRouter = Router();

router.get("/certifications", async (req, res): Promise<void> => {
  const q = ListCertificationsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  res.json(await svc.listCertifications(q.data));
});

router.post("/certifications", async (req, res): Promise<void> => {
  const body = CreateCertificationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  res.status(201).json(await svc.createCertification(body.data as Parameters<typeof svc.createCertification>[0]));
});

router.get("/certifications/:id", async (req, res): Promise<void> => {
  const p = GetCertificationParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const cert = await svc.getCertification(p.data.id);
  if (!cert) { res.status(404).json({ error: "Certification not found" }); return; }
  res.json(cert);
});

router.patch("/certifications/:id", async (req, res): Promise<void> => {
  const p = UpdateCertificationParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const body = UpdateCertificationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const cert = await svc.updateCertification(p.data.id, body.data);
  if (!cert) { res.status(404).json({ error: "Certification not found" }); return; }
  res.json(cert);
});

router.delete("/certifications/:id", async (req, res): Promise<void> => {
  const p = DeleteCertificationParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const cert = await svc.deleteCertification(p.data.id);
  if (!cert) { res.status(404).json({ error: "Certification not found" }); return; }
  res.sendStatus(204);
});

export default router;
