/**
 * Daily Certification Routes (DCAA TK-006 — Contemporaneous Recording)
 *
 * Implements the DCAA-required daily time certification flow using the native
 * punch_ledger (for activity checks) and audit_events (for certification state).
 *
 * Mounted at /api/timekeeping in EPOCH; paths are relative to that prefix.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { z } from "zod";
import { authenticateToken, requireRole } from "../../../middleware/auth";
import { db } from "../../../db";
import { pool } from "../../../db";
import { auditEvents, employees } from "../../../schema";
import { eq, and } from "drizzle-orm";
import { listSessions } from "../../lib/punchLedger";

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/daily-certification]", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });
}

const router: IRouter = Router();

/** Build the canonical entity_id for a daily certification audit event. */
function dailyCertEntityId(epochEmployeeId: number, date: string): string {
  return `daily-cert-${epochEmployeeId}-${date}`;
}

/** Check whether an employee has any punch_ledger session activity on a given date. */
async function hasSessionActivity(epochEmployeeId: number, date: string): Promise<boolean> {
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);
  const sessions = await listSessions({
    employeeId: epochEmployeeId,
    from: startOfDay,
    to: endOfDay,
    limit: 1,
  });
  return sessions.length > 0;
}

/** Retrieve the DAILY_CERTIFIED audit event for a given employee+date, if any. */
async function getCertificationEvent(epochEmployeeId: number, date: string) {
  const entityId = dailyCertEntityId(epochEmployeeId, date);
  const rows = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entityType, 'time_entry'),
        eq(auditEvents.entityId, entityId),
        eq(auditEvents.action, 'DAILY_CERTIFIED'),
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * GET /api/timekeeping/daily-sign-off-status?date=YYYY-MM-DD
 * Returns whether the calling employee has punch activity and/or a daily certification for the given date.
 */
router.get("/daily-sign-off-status", authenticateToken, h(async (req, res): Promise<void> => {
  const date = (req.query.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "date must be YYYY-MM-DD" }); return; }

  const epochEmployeeId = req.user?.employeeId;
  if (epochEmployeeId == null) { res.status(403).json({ error: "Authentication required" }); return; }

  const [activityFound, certEvent] = await Promise.all([
    hasSessionActivity(epochEmployeeId, date),
    getCertificationEvent(epochEmployeeId, date),
  ]);

  const isCertified = certEvent != null;

  res.json({
    date,
    hasActivity: activityFound,
    isCertified,
    timesheetStatus: isCertified ? "certified" : null,
    certifiedAt: certEvent?.timestamp ?? null,
  });
}));

const DailySignOffBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

/**
 * POST /api/timekeeping/daily-sign-off
 * Records the daily certification for the authenticated employee for a specific date.
 * Persists to audit_events with action='DAILY_CERTIFIED'. Idempotent.
 */
router.post("/daily-sign-off", authenticateToken, h(async (req, res): Promise<void> => {
  const body = DailySignOffBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const epochEmployeeId = req.user?.employeeId;
  if (epochEmployeeId == null) { res.status(403).json({ error: "Authentication required" }); return; }

  const { date } = body.data;
  const entityId = dailyCertEntityId(epochEmployeeId, date);

  // Idempotent: return existing if already certified
  const existing = await getCertificationEvent(epochEmployeeId, date);
  if (existing) {
    const timesheetCompat = {
      id: existing.id,
      employeeId: epochEmployeeId,
      date,
      status: 'certified',
      certifiedAt: existing.timestamp,
      certifiedBy: existing.actorId,
    };
    res.json({
      timesheet: timesheetCompat,
      certification: {
        entityId: existing.entityId,
        certifiedAt: existing.timestamp,
        employeeId: epochEmployeeId,
        date,
      },
      alreadyCertified: true,
    });
    return;
  }

  // Resolve actor name for the audit record
  const empRows = await db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.id, epochEmployeeId))
    .limit(1);
  const actorName = empRows[0]?.name ?? null;

  const [created] = await db
    .insert(auditEvents)
    .values({
      entityType: 'time_entry',
      entityId,
      action: 'DAILY_CERTIFIED',
      actorId: epochEmployeeId,
      actorName,
      reason: `Employee daily time certification for ${date}`,
      meta: {
        workDate: date,
        employeeId: epochEmployeeId,
      },
    })
    .returning();

  // Maintain backward-compatible `timesheet` key shape for existing consumers
  const timesheetCompat = {
    id: created.id,
    employeeId: epochEmployeeId,
    date,
    status: 'certified',
    certifiedAt: created.timestamp,
    certifiedBy: created.actorId,
  };

  res.status(201).json({
    timesheet: timesheetCompat,
    certification: {
      entityId: created.entityId,
      certifiedAt: created.timestamp,
      employeeId: epochEmployeeId,
      date,
    },
    alreadyCertified: false,
  });
}));

/**
 * GET /api/timekeeping/daily-certification-status?date=YYYY-MM-DD
 * Admin-only. Returns all active employees with their certification status for the given date.
 * Status: "certified" | "not_yet_certified" | "no_activity"
 * Activity is inferred from punch_ledger sessions.
 */
router.get("/daily-certification-status", authenticateToken, requireRole('ADMIN', 'OWNER', 'HR'), h(async (req, res): Promise<void> => {
  const date = (req.query.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }

  // Load all active employees from the native public.employees table
  const activeEmployees = await db
    .select({ id: employees.id, name: employees.name, email: employees.email })
    .from(employees)
    .where(eq(employees.isActive, true));

  if (activeEmployees.length === 0) { res.json([]); return; }

  const epochIds = activeEmployees.map(e => e.id);

  // Batch-check which employees have punch_ledger activity on the given date
  const activityRows: { employee_id: number }[] = await pool.query(
    `SELECT DISTINCT pl.employee_id
     FROM punch_ledger pl
     WHERE pl.employee_id = ANY($1::int[])
       AND (pl.clock_in AT TIME ZONE 'UTC')::date = $2::date`,
    [epochIds, date]
  );
  const epochIdsWithActivity = new Set(activityRows.map(r => r.employee_id));

  // Batch-check daily certifications from audit_events
  const entityIds = epochIds.map(id => dailyCertEntityId(id, date));
  const certRows: { entity_id: string; timestamp: string | null; actor_id: number | null }[] = await pool.query(
    `SELECT entity_id, timestamp, actor_id
     FROM audit_events
     WHERE entity_type = 'time_entry'
       AND action = 'DAILY_CERTIFIED'
       AND entity_id = ANY($1::text[])`,
    [entityIds]
  );

  const certByEntityId = new Map(certRows.map(r => [r.entity_id, r]));

  const result = activeEmployees.map(emp => {
    const entityId = dailyCertEntityId(emp.id, date);
    const cert = certByEntityId.get(entityId) ?? null;
    const hasActivity = epochIdsWithActivity.has(emp.id);

    let certificationStatus: "certified" | "not_yet_certified" | "no_activity";
    if (cert) {
      certificationStatus = "certified";
    } else if (hasActivity) {
      certificationStatus = "not_yet_certified";
    } else {
      certificationStatus = "no_activity";
    }

    return {
      employeeId: emp.id,
      epochEmployeeId: emp.id,
      name: emp.name ?? `Employee #${emp.id}`,
      email: emp.email ?? null,
      certificationStatus,
      certifiedAt: cert?.timestamp ?? null,
      timesheetId: cert?.entity_id ?? null,
    };
  });

  res.json(result);
}));

export default router;
