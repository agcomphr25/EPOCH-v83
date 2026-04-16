import { Router, type IRouter } from "express";
import {
  CreateEmployeeBody,
  UpdateEmployeeBody,
  GetEmployeeParams,
  UpdateEmployeeParams,
  DeleteEmployeeParams,
  UpdateEmployeeStatusParams,
  UpdateEmployeeStatusBody,
  ListEmployeesQueryParams,
} from "@workspace/api-zod";
import * as svc from "../services/employees.service";
import { stripPinHash } from "../services/employees.service";
import { actorFromUser } from "../services/audit.service";

const router: IRouter = Router();

router.get("/employees", async (req, res): Promise<void> => {
  const q = ListEmployeesQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  res.json(await svc.listEmployees(q.data));
});

router.post("/employees", async (req, res): Promise<void> => {
  const body = CreateEmployeeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const created = await svc.createEmployee(body.data as Parameters<typeof svc.createEmployee>[0], actor);
  res.status(201).json(stripPinHash(created));
});

router.get("/employees/:id", async (req, res): Promise<void> => {
  const p = GetEmployeeParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const employee = await svc.getEmployee(p.data.id);
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(stripPinHash(employee));
});

router.patch("/employees/:id", async (req, res): Promise<void> => {
  const p = UpdateEmployeeParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const body = UpdateEmployeeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const employee = await svc.updateEmployee(p.data.id, body.data, actor);
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(stripPinHash(employee));
});

router.delete("/employees/:id", async (req, res): Promise<void> => {
  const p = DeleteEmployeeParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const employee = await svc.deleteEmployee(p.data.id, actor);
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.sendStatus(204);
});

router.patch("/employees/:id/status", async (req, res): Promise<void> => {
  const p = UpdateEmployeeStatusParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const body = UpdateEmployeeStatusBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const employee = await svc.updateEmployee(p.data.id, { status: body.data.status }, actor);
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(stripPinHash(employee));
});

export default router;
