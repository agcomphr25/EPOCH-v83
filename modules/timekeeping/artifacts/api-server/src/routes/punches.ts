import { Router, type IRouter } from "express";
import {
  CreatePunchBody,
  UpdatePunchBody,
  GetPunchParams,
  UpdatePunchParams,
  DeletePunchParams,
  GetCurrentPunchStatusParams,
  ListPunchesQueryParams,
  KioskPunchBody,
} from "@workspace/api-zod";
import * as svc from "../services/punches.service";
import { getEmployee, authenticateKioskEmployee } from "../services/employees.service";
import { actorFromUser } from "../services/audit.service";

const router: IRouter = Router();

router.get("/punches", async (req, res): Promise<void> => {
  const q = ListPunchesQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  res.json(await svc.listPunches(q.data));
});

router.post("/punches", async (req, res): Promise<void> => {
  const body = CreatePunchBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const { employeeId, type, punchedAt, timezone, note, source, costCode } = body.data;
  const punch = await svc.createPunch(
    {
      employeeId,
      type,
      punchedAt: punchedAt ? new Date(punchedAt as unknown as string) : new Date(),
      timezone: timezone ?? "UTC",
      note: note ?? null,
      source: source ?? "web",
      isEdited: false,
      editNote: null,
      costCode: costCode ?? null,
    },
    actor
  );
  res.status(201).json(punch);
});

router.get("/punches/employee/:employeeId/current", async (req, res): Promise<void> => {
  const p = GetCurrentPunchStatusParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const employee = await getEmployee(p.data.employeeId);
  const tz = employee?.timezone ?? "UTC";
  const { status, lastPunch, clockedInAt, hoursToday } =
    await svc.getEmployeePunchStatus(p.data.employeeId, tz);
  res.json({
    employeeId: p.data.employeeId,
    status,
    lastPunch: lastPunch ?? undefined,
    clockedInAt: clockedInAt?.toISOString() ?? null,
    hoursToday,
  });
});

router.get("/punches/:id", async (req, res): Promise<void> => {
  const p = GetPunchParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const punch = await svc.getPunch(p.data.id);
  if (!punch) { res.status(404).json({ error: "Punch not found" }); return; }
  res.json(punch);
});

router.patch("/punches/:id", async (req, res): Promise<void> => {
  const p = UpdatePunchParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const body = UpdatePunchBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const editNote = (body.data.editNote ?? "").trim();
  if (!editNote) {
    res.status(400).json({ error: "An edit note is required when modifying a punch (DCAA audit trail)" });
    return;
  }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.updatePunch(p.data.id, { ...body.data, editNote }, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.json(result);
});

router.delete("/punches/:id", async (req, res): Promise<void> => {
  const p = DeletePunchParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await svc.deletePunch(p.data.id, actor);
  if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
  res.sendStatus(204);
});

router.get("/kiosk/punches/employee/:employeeId/current", async (req, res): Promise<void> => {
  const id = parseInt(req.params.employeeId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid employee id" }); return; }
  const employee = await getEmployee(id);
  const tz = employee?.timezone ?? "UTC";
  const { status, lastPunch, clockedInAt, hoursToday } = await svc.getEmployeePunchStatus(id, tz);
  res.json({
    employeeId: id,
    status,
    lastPunch: lastPunch ?? undefined,
    clockedInAt: clockedInAt?.toISOString() ?? null,
    hoursToday,
  });
});

router.post("/kiosk/login", async (req, res): Promise<void> => {
  const { identifier, pin } = req.body ?? {};
  if (!identifier || typeof identifier !== "string") {
    res.status(400).json({ error: "Employee ID or last name is required" });
    return;
  }
  if (!pin || typeof pin !== "string") {
    res.status(400).json({ error: "PIN is required" });
    return;
  }

  const employee = await authenticateKioskEmployee(identifier, pin);
  if (!employee) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  res.json({
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    jobTitle: employee.jobTitle ?? null,
  });
});

router.post("/kiosk/punch", async (req, res): Promise<void> => {
  const body = KioskPunchBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const result = await svc.kioskPunch({
    ...body.data,
    requestedAction: body.data.requestedAction as "clock_in" | "clock_out" | "break_start" | "break_end" | undefined,
    costCode: body.data.costCode,
  });
  if ("error" in result) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

export default router;
