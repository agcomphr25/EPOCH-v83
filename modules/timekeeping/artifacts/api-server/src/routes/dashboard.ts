import { Router, type IRouter } from "express";
import { GetWeeklyHoursQueryParams } from "@workspace/api-zod";
import * as svc from "../services/dashboard.service";
import { getPendingTimesheets } from "../services/timesheets.service";
import { stripPinHash } from "../services/employees.service";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  res.json(await svc.getDashboardSummary());
});

router.get("/dashboard/clocked-in", async (_req, res): Promise<void> => {
  const entries = await svc.getClockedInEmployees();
  res.json(entries.map((e) => ({ ...e, employee: stripPinHash(e.employee) })));
});

router.get("/dashboard/weekly-hours", async (req, res): Promise<void> => {
  const q = GetWeeklyHoursQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  res.json(await svc.getWeeklyHours(q.data));
});

router.get("/dashboard/pending-timesheets", async (_req, res): Promise<void> => {
  res.json(await getPendingTimesheets());
});

export default router;
