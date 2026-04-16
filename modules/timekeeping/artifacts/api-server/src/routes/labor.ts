import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireAdmin } from "../middlewares/auth";
import { actorFromUser } from "../services/audit.service";
import * as chargeCodes from "../services/labor-charge-codes.service";
import * as authorizations from "../services/labor-authorizations.service";
import * as authRequests from "../services/labor-authorization-requests.service";
import * as sessions from "../services/labor-sessions.service";
import * as dailyTimesheets from "../services/labor-daily-timesheets.service";
import * as punches from "../services/labor-punches.service";
import {
  insertLaborChargeCodeSchema,
  insertLaborAuthorizationSchema,
  insertLaborAuthorizationRequestSchema,
  insertLaborWorkSessionSchema,
  insertDailyTimesheetSchema,
  insertLaborTimeClockPunchSchema,
} from "@workspace/db";

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function actingEmployeeId(req: Parameters<Parameters<IRouter["post"]>[1]>[0]): number | null {
  return req.user?.employeeId ?? null;
}

function parseNumericQuery(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? undefined : parsed;
}

// ─── Charge Codes (admin-only write, open read) ───────────────────────────────

// IMPORTANT: /resolve must be declared BEFORE /:id to avoid Express routing it as an id param.
router.get("/labor/charge-codes/resolve", async (req, res): Promise<void> => {
  let manualChargeCodeId: number | undefined;
  if (req.query.chargeCodeId) {
    const parsed = parseInt(req.query.chargeCodeId as string, 10);
    if (isNaN(parsed)) { res.status(400).json({ error: "chargeCodeId must be a valid integer" }); return; }
    manualChargeCodeId = parsed;
  }
  const result = await authorizations.resolveChargeCodeForSession({
    travelerId: req.query.travelerId as string | undefined,
    workOrderId: req.query.workOrderId as string | undefined,
    projectId: req.query.projectId as string | undefined,
    manualChargeCodeId,
  });
  if (!result) {
    res.status(422).json({
      error: "No charge code resolved. Manual selection required.",
      code: "charge_code_required",
    });
    return;
  }
  res.json(result);
});

router.get("/labor/charge-codes", async (req, res): Promise<void> => {
  const activeOnly = req.query.active === "true" ? true : undefined;
  res.json(await chargeCodes.listLaborChargeCodes(activeOnly));
});

router.get("/labor/charge-codes/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await chargeCodes.getLaborChargeCode(id);
  if (!row) { res.status(404).json({ error: "Charge code not found" }); return; }
  res.json(row);
});

router.post("/labor/charge-codes", requireAdmin, async (req, res): Promise<void> => {
  const body = insertLaborChargeCodeSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const row = await chargeCodes.createLaborChargeCode(body.data, actor);
  res.status(201).json(row);
});

router.patch("/labor/charge-codes/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = insertLaborChargeCodeSchema.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const row = await chargeCodes.updateLaborChargeCode(id, body.data, actor);
  if (!row) { res.status(404).json({ error: "Charge code not found" }); return; }
  res.json(row);
});

router.delete("/labor/charge-codes/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const ok = await chargeCodes.deleteLaborChargeCode(id, actor);
  if (!ok) { res.status(404).json({ error: "Charge code not found" }); return; }
  res.sendStatus(204);
});

// ─── Labor Authorizations (admin-only write) ──────────────────────────────────

router.get("/labor/authorizations", async (req, res): Promise<void> => {
  const filters = {
    projectId: req.query.projectId as string | undefined,
    workOrderId: req.query.workOrderId as string | undefined,
    travelerId: req.query.travelerId as string | undefined,
    status: req.query.status as string | undefined,
  };
  res.json(await authorizations.listLaborAuthorizations(filters));
});

// /budget sub-route must be declared before /:id
router.get("/labor/authorizations/:id/budget", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await authorizations.checkBudget(id);
  res.json(result);
});

router.get("/labor/authorizations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await authorizations.getLaborAuthorization(id);
  if (!row) { res.status(404).json({ error: "Authorization not found" }); return; }
  res.json(row);
});

const LaborAuthorizationBody = insertLaborAuthorizationSchema
  .omit({ createdBy: true })
  .extend({ authorizedHours: z.number().positive() });

router.post("/labor/authorizations", requireAdmin, async (req, res): Promise<void> => {
  const body = LaborAuthorizationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const createdBy = actingEmployeeId(req) ?? undefined;
  const row = await authorizations.createLaborAuthorization({ ...body.data, createdBy }, actor);
  res.status(201).json(row);
});

router.patch("/labor/authorizations/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = LaborAuthorizationBody.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const row = await authorizations.updateLaborAuthorization(id, body.data, actor);
  if (!row) { res.status(404).json({ error: "Authorization not found" }); return; }
  res.json(row);
});

router.delete("/labor/authorizations/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const ok = await authorizations.deleteLaborAuthorization(id, actor);
  if (!ok) { res.status(404).json({ error: "Authorization not found" }); return; }
  res.sendStatus(204);
});

// ─── Extra-Hours Requests ─────────────────────────────────────────────────────

router.get("/labor/authorization-requests", async (req, res): Promise<void> => {
  const isAdmin = req.user?.role === "admin";
  const callerEmployeeId = actingEmployeeId(req);

  // Non-admins must have a linked employee record to scope the query; reject otherwise.
  if (!isAdmin && callerEmployeeId == null) {
    res.status(403).json({ error: "A linked employee record is required to list authorization requests" });
    return;
  }

  // Non-admins see only their own requests; admins see all.
  const requestedBy = isAdmin ? undefined : callerEmployeeId!;

  const filters = {
    laborAuthorizationId: parseNumericQuery(req.query.laborAuthorizationId),
    status: req.query.status as string | undefined,
    requestedBy,
  };
  res.json(await authRequests.listLaborAuthorizationRequests(filters));
});

router.get("/labor/authorization-requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await authRequests.getLaborAuthorizationRequest(id);
  if (!row) { res.status(404).json({ error: "Request not found" }); return; }
  // Non-admins can only view requests they submitted.
  const isAdmin = req.user?.role === "admin";
  const callerEmployeeId = actingEmployeeId(req);
  if (!isAdmin && row.requestedBy !== callerEmployeeId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  res.json(row);
});

const ExtraHoursRequestBody = insertLaborAuthorizationRequestSchema
  .pick({ laborAuthorizationId: true, requestedHours: true, reason: true })
  .extend({ requestedHours: z.number().positive() });

router.post("/labor/authorization-requests", async (req, res): Promise<void> => {
  const body = ExtraHoursRequestBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const employeeId = actingEmployeeId(req);
  if (employeeId == null) { res.status(403).json({ error: "Authentication required" }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await authRequests.submitExtraHoursRequest(
    { ...body.data, requestedBy: employeeId, status: "pending" },
    actor
  );
  if (result.error) {
    const status = result.errorCode === "authorization_not_found" ? 404 : 422;
    res.status(status).json({ error: result.error, errorCode: result.errorCode });
    return;
  }
  res.status(201).json(result.request);
});

const ReviewBody = z.object({
  reviewNote: z.string().optional(),
});

router.post("/labor/authorization-requests/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = ReviewBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const reviewerEmployeeId = actingEmployeeId(req);
  if (reviewerEmployeeId == null) { res.status(403).json({ error: "Reviewer identity could not be determined" }); return; }
  const result = await authRequests.approveExtraHoursRequest(id, reviewerEmployeeId, body.data.reviewNote, actor);
  if (result.error) {
    const reviewStatusMap: Record<string, number> = { not_found: 404, invalid_status: 409, concurrent_update: 409 };
    res.status(result.errorCode ? (reviewStatusMap[result.errorCode] ?? 409) : 409).json({ error: result.error });
    return;
  }
  res.json(result.request);
});

router.post("/labor/authorization-requests/:id/deny", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = ReviewBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const reviewerEmployeeId = actingEmployeeId(req);
  if (reviewerEmployeeId == null) { res.status(403).json({ error: "Reviewer identity could not be determined" }); return; }
  const result = await authRequests.denyExtraHoursRequest(id, reviewerEmployeeId, body.data.reviewNote, actor);
  if (result.error) {
    const reviewStatusMap: Record<string, number> = { not_found: 404, invalid_status: 409, concurrent_update: 409 };
    res.status(result.errorCode ? (reviewStatusMap[result.errorCode] ?? 409) : 409).json({ error: result.error });
    return;
  }
  res.json(result.request);
});

// ─── Work Sessions ────────────────────────────────────────────────────────────

// chargeCodeId is optional: cascade resolves from traveler/WO/project; only needed for manual override.
const OpenSessionBody = insertLaborWorkSessionSchema
  .pick({ laborAuthorizationId: true, projectId: true, workOrderId: true, travelerId: true, notes: true })
  .extend({ chargeCodeId: z.number().int().positive().optional().nullable() });

router.get("/labor/sessions", async (req, res): Promise<void> => {
  const isAdmin = req.user?.role === "admin";
  const callerEmployeeId = actingEmployeeId(req);

  // Non-admins must have a linked employee record to scope the query; reject otherwise.
  if (!isAdmin && callerEmployeeId == null) {
    res.status(403).json({ error: "A linked employee record is required to list sessions" });
    return;
  }

  // Non-admins see only their own sessions; admins can filter by any employeeId.
  const employeeId = isAdmin
    ? parseNumericQuery(req.query.employeeId)
    : callerEmployeeId!;

  const filters = {
    employeeId,
    status: req.query.status as string | undefined,
    projectId: req.query.projectId as string | undefined,
    workOrderId: req.query.workOrderId as string | undefined,
    travelerId: req.query.travelerId as string | undefined,
  };
  res.json(await sessions.listSessions(filters));
});

router.get("/labor/sessions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await sessions.getSession(id);
  if (!row) { res.status(404).json({ error: "Session not found" }); return; }
  // Non-admins can only view their own sessions.
  const isAdmin = req.user?.role === "admin";
  const callerEmployeeId = actingEmployeeId(req);
  if (!isAdmin && row.employeeId !== callerEmployeeId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  res.json(row);
});

router.post("/labor/sessions", async (req, res): Promise<void> => {
  const body = OpenSessionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const employeeId = actingEmployeeId(req);
  if (employeeId == null) { res.status(403).json({ error: "Authentication required" }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await sessions.openSession({ ...body.data, employeeId }, actor);
  if (result.error) {
    const statusMap: Record<string, number> = {
      charge_code_required: 422,
      budget_exhausted: 409,
      authorization_not_found: 404,
      authorization_mismatch: 422,
    };
    const status = result.errorCode ? (statusMap[result.errorCode] ?? 422) : 422;
    res.status(status).json({
      error: result.error,
      errorCode: result.errorCode,
      laborAuthorizationId: result.laborAuthorizationId,
    });
    return;
  }
  res.status(201).json(result.session);
});

router.post("/labor/sessions/:id/close", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const employeeId = actingEmployeeId(req);
  if (employeeId == null) { res.status(403).json({ error: "Authentication required" }); return; }
  const isAdmin = req.user?.role === "admin";
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await sessions.closeSession(id, actor, employeeId, isAdmin);
  if (result.error) {
    const statusMap: Record<string, number> = { not_found: 404, access_denied: 403, not_open: 409, concurrent_close: 409 };
    const status = result.errorCode ? (statusMap[result.errorCode] ?? 409) : 409;
    res.status(status).json({ error: result.error });
    return;
  }
  res.json(result.session);
});

// ─── Time Clock Punches ───────────────────────────────────────────────────────

const CreatePunchBody = insertLaborTimeClockPunchSchema
  .omit({ employeeId: true })
  .extend({
    employeeId: z.number().int().positive().optional(),
    sessionId: z.number().int().positive().optional().nullable(),
    type: z.enum(["clock_in", "clock_out"]),
    source: z.enum(["web", "kiosk", "api"]).optional(),
  });

const PUNCH_TYPES = ["clock_in", "clock_out"] as const;

router.get("/labor/punches", async (req, res): Promise<void> => {
  const isAdmin = req.user?.role === "admin";
  const callerEmployeeId = actingEmployeeId(req);

  if (!isAdmin && callerEmployeeId == null) {
    res.status(403).json({ error: "A linked employee record is required to list punches" });
    return;
  }

  let employeeIdFilter: number | undefined;
  if (isAdmin) {
    if (req.query.employeeId !== undefined && req.query.employeeId !== "") {
      const parsed = parseInt(req.query.employeeId as string, 10);
      if (isNaN(parsed)) { res.status(400).json({ error: "employeeId must be a valid integer" }); return; }
      employeeIdFilter = parsed;
    }
  } else {
    employeeIdFilter = callerEmployeeId!;
  }

  let sessionIdFilter: number | undefined;
  if (req.query.sessionId !== undefined && req.query.sessionId !== "") {
    const parsed = parseInt(req.query.sessionId as string, 10);
    if (isNaN(parsed)) { res.status(400).json({ error: "sessionId must be a valid integer" }); return; }
    sessionIdFilter = parsed;
  }

  const rawType = req.query.type as string | undefined;
  if (rawType && !(PUNCH_TYPES as readonly string[]).includes(rawType)) {
    res.status(400).json({ error: `type must be one of: ${PUNCH_TYPES.join(", ")}` });
    return;
  }

  const filters = {
    employeeId: employeeIdFilter,
    sessionId: sessionIdFilter,
    type: rawType,
  };
  res.json(await punches.listPunches(filters));
});

router.get("/labor/punches/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await punches.getPunch(id);
  if (!row) { res.status(404).json({ error: "Punch not found" }); return; }
  const isAdmin = req.user?.role === "admin";
  const callerEmployeeId = actingEmployeeId(req);
  if (!isAdmin && row.employeeId !== callerEmployeeId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  res.json(row);
});

router.post("/labor/punches", async (req, res): Promise<void> => {
  const body = CreatePunchBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const isAdmin = req.user?.role === "admin";
  const callerEmployeeId = actingEmployeeId(req);
  // Admins may submit a punch on behalf of another employee by providing employeeId in the body.
  // Non-admins are always scoped to their own employee record and must have a linked employee.
  if (!isAdmin && callerEmployeeId == null) { res.status(403).json({ error: "A linked employee record is required" }); return; }
  if (isAdmin && body.data.employeeId == null && callerEmployeeId == null) {
    res.status(400).json({ error: "employeeId is required when submitting a punch without a linked employee record" });
    return;
  }
  const employeeId = (isAdmin && body.data.employeeId != null ? body.data.employeeId : callerEmployeeId) as number;
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const result = await punches.createPunch({ ...body.data, employeeId }, actor);
  if (result.error) {
    const statusMap: Record<string, number> = {
      session_not_found: 404,
      session_not_open: 409,
      session_access_denied: 403,
    };
    const status = result.errorCode ? (statusMap[result.errorCode] ?? 422) : 422;
    res.status(status).json({ error: result.error, errorCode: result.errorCode });
    return;
  }
  res.status(201).json(result.punch);
});

// ─── Daily Timesheets ─────────────────────────────────────────────────────────

router.get("/labor/daily-timesheets", async (req, res): Promise<void> => {
  const isAdmin = req.user?.role === "admin";
  const callerEmployeeId = actingEmployeeId(req);

  // Non-admins must have a linked employee record to scope the query; reject otherwise.
  if (!isAdmin && callerEmployeeId == null) {
    res.status(403).json({ error: "A linked employee record is required to list timesheets" });
    return;
  }

  // Non-admins see only their own timesheets; admins can filter by any employeeId.
  const employeeId = isAdmin
    ? parseNumericQuery(req.query.employeeId)
    : callerEmployeeId!;

  const filters = {
    employeeId,
    date: req.query.date as string | undefined,
    status: req.query.status as string | undefined,
  };
  res.json(await dailyTimesheets.listDailyTimesheets(filters));
});

router.get("/labor/daily-timesheets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await dailyTimesheets.getDailyTimesheet(id);
  if (!row) { res.status(404).json({ error: "Timesheet not found" }); return; }
  // Non-admins can only view their own timesheets.
  const isAdmin = req.user?.role === "admin";
  const callerEmployeeId = actingEmployeeId(req);
  if (!isAdmin && row.employeeId !== callerEmployeeId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  res.json(row);
});

const CreateTimesheetBody = insertDailyTimesheetSchema.pick({
  date: true,
  notes: true,
});

router.post("/labor/daily-timesheets", async (req, res): Promise<void> => {
  const body = CreateTimesheetBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const employeeId = actingEmployeeId(req);
  if (employeeId == null) { res.status(403).json({ error: "Authentication required" }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const row = await dailyTimesheets.createDraftTimesheet(
    { employeeId, totalHours: 0, status: "draft", ...body.data },
    actor
  );
  res.status(201).json(row);
});

router.post("/labor/daily-timesheets/:id/certify", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const certifierEmployeeId = actingEmployeeId(req);
  if (certifierEmployeeId == null) { res.status(403).json({ error: "Authentication required" }); return; }
  const result = await dailyTimesheets.certifyTimesheet(id, certifierEmployeeId, actor);
  if (result.error) {
    const timesheetStatusMap: Record<string, number> = { not_found: 404, access_denied: 403, invalid_status: 409, concurrent_update: 409 };
    const status = result.errorCode ? (timesheetStatusMap[result.errorCode] ?? 409) : 409;
    res.status(status).json({ error: result.error });
    return;
  }
  res.json(result.timesheet);
});

router.post("/labor/daily-timesheets/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const approverEmployeeId = actingEmployeeId(req);
  if (approverEmployeeId == null) { res.status(403).json({ error: "Approver identity could not be determined" }); return; }
  const result = await dailyTimesheets.approveTimesheet(id, approverEmployeeId, actor);
  if (result.error) {
    const timesheetStatusMap: Record<string, number> = { not_found: 404, access_denied: 403, invalid_status: 409, concurrent_update: 409 };
    const status = result.errorCode ? (timesheetStatusMap[result.errorCode] ?? 409) : 409;
    res.status(status).json({ error: result.error });
    return;
  }
  res.json(result.timesheet);
});

export default router;
