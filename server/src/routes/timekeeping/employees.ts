import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import {
  CreateEmployeeBody,
  UpdateEmployeeBody,
  GetEmployeeParams,
  UpdateEmployeeParams,
  DeleteEmployeeParams,
  UpdateEmployeeStatusParams,
  UpdateEmployeeStatusBody,
  ListEmployeesQueryParams,
} from "../../lib/timekeeping-zod";
import * as svc from "../../services/timekeeping/employees.service";
import { stripPinHash } from "../../services/timekeeping/employees.service";
import { actorFromUser } from "../../services/timekeeping/audit.service";
import { authenticateToken, requireRole } from "../../../middleware/auth";

/** Wraps an async route handler so uncaught errors return 500 instead of crashing the process. */
function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/employees]", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });
}

const router: IRouter = Router();

router.get("/employees", authenticateToken, h(async (req, res): Promise<void> => {
  const q = ListEmployeesQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  res.json(await svc.listEmployees(q.data));
}));

router.post("/employees", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const body = CreateEmployeeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const { timekeepingId, resolved } = await svc.createEmployee(body.data as Parameters<typeof svc.createEmployee>[0], actor);
  if (!resolved) {
    res.status(201).json({ id: timekeepingId, warning: "Employee created but not yet linked to canonical identity. Assign epochEmployeeId to complete setup." });
    return;
  }
  res.status(201).json(stripPinHash(resolved));
}));

router.get("/employees/:id", authenticateToken, h(async (req, res): Promise<void> => {
  const p = GetEmployeeParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const employee = await svc.getEmployee(p.data.id);
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(stripPinHash(employee));
}));

router.patch("/employees/:id", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const p = UpdateEmployeeParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const body = UpdateEmployeeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const employee = await svc.updateEmployee(p.data.id, body.data, actor);
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(stripPinHash(employee));
}));

router.delete("/employees/:id", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const p = DeleteEmployeeParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const employee = await svc.deleteEmployee(p.data.id, actor);
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.sendStatus(204);
}));

router.patch("/employees/:id/status", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const p = UpdateEmployeeStatusParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const body = UpdateEmployeeStatusBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const employee = await svc.updateEmployee(p.data.id, { status: body.data.status }, actor);
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(stripPinHash(employee));
}));

export default router;
