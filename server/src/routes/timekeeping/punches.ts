// timekeeping/punches.ts
// Live punch flows (Kiosk, Employee Portal) write exclusively to public.punch_ledger.
// employeeId values are public.employees.id integers throughout.

import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import {
  GetCurrentPunchStatusParams,
  ListPunchesQueryParams,
  KioskPunchBody,
} from "../../lib/timekeeping-zod";
import { db as nativeDb, pool } from "../../../db";
import { chargeCodes, employees, auditEvents, users, kioskPinRateLimits } from "../../../schema";
import { salariedTimesheetAuditTable } from "../../schema/timekeeping";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { actorFromUser, logAction } from "../../services/timekeeping/audit.service";
import type { SafeUser } from "../../services/timekeeping/audit.service";
import { certifyDailyTimeOnPunchOut, findFinalizedTimesheetForPunch, isInFinalizedTimesheetPeriod, findPayrollApprovedSalariedTimesheetForPunch } from "../../services/timekeeping/timesheets.service";
import { checkActivePTOForEmployee } from "../../services/timekeeping/timeoff.service";
import { authenticateToken, requireRole, optionalAuth } from "../../../middleware/auth";
import * as ledger from "../../lib/punchLedger";
import { dualWriteUpdateAllocation } from "../../lib/laborAllocationDualWrite";
import { resolveTravelerBarcode } from "../../helpers/travelerBarcodeResolver";
import { storage } from "../../../storage";
import { notificationManager } from "../../services/notificationManager";
import * as punchCorrections from "../../services/timekeeping/punchCorrections.service";

const router: IRouter = Router();

let chargeCodeAssignmentTableReady: Promise<void> | null = null;

function ensureChargeCodeAssignmentTable(): Promise<void> {
  if (!chargeCodeAssignmentTableReady) {
    chargeCodeAssignmentTableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS charge_code_employee_assignments (
          id SERIAL PRIMARY KEY,
          charge_code_id INTEGER NOT NULL REFERENCES charge_codes(id) ON DELETE CASCADE,
          employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (charge_code_id, employee_id)
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS charge_code_employee_assignments_charge_code_idx ON charge_code_employee_assignments(charge_code_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS charge_code_employee_assignments_employee_idx ON charge_code_employee_assignments(employee_id)`);
    })().catch((error) => {
      chargeCodeAssignmentTableReady = null;
      throw error;
    });
  }
  return chargeCodeAssignmentTableReady;
}

function rowsOf<T = any>(result: any): T[] {
  return Array.isArray(result) ? result : result?.rows || [];
}

async function listVisibleChargeCodes(employeeId: number | null, includeDepartment = false) {
  await ensureChargeCodeAssignmentTable();
  const rows = rowsOf(await pool.query(
    `SELECT
       cc.id,
       cc.code,
       cc.description,
       ${includeDepartment ? 'cc.department,' : ''}
       cc.type
     FROM charge_codes cc
     WHERE cc.active = true
       AND (
         $1::int IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM charge_code_employee_assignments cca_any
           WHERE cca_any.charge_code_id = cc.id
         )
         OR EXISTS (
           SELECT 1
           FROM charge_code_employee_assignments cca_emp
           WHERE cca_emp.charge_code_id = cc.id
             AND cca_emp.employee_id = $1::int
         )
       )
     ORDER BY cc.code`,
    [employeeId]
  ));
  return rows;
}

const PunchCorrectionChangesSchema = z.object({
  clockIn: z.string().datetime().nullable().optional(),
  clockOut: z.string().datetime().nullable().optional(),
  chargeCodeId: z.number().int().positive().nullable().optional(),
  travelerId: z.string().nullable().optional(),
  laborClass: z.enum(["REGULAR", "BREAK"]).optional(),
  punchType: z.enum(["clock_in", "clock_out", "break_start", "break_end"]).optional(),
  note: z.string().max(1000).nullable().optional(),
});

const PunchCorrectionSubmitSchema = z.object({
  punchLedgerId: z.number().int().positive().nullable().optional(),
  requestType: z.enum(["edit_session", "add_session", "delete_session"]),
  reason: z.string().min(5),
  proposedChanges: PunchCorrectionChangesSchema,
});

const KioskPunchCorrectionSubmitSchema = PunchCorrectionSubmitSchema.extend({
  employeeId: z.number().int().positive(),
  pin: z.string().regex(/^\d{4}$/),
});

const AdminPunchCorrectionSubmitSchema = PunchCorrectionSubmitSchema.extend({
  employeeId: z.number().int().positive(),
});

const PunchCorrectionReviewSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  note: z.string().min(3),
});

// ---------------------------------------------------------------------------
// PIN brute-force protection — DB-backed rate limiter for /kiosk/identify
// State is persisted to kiosk_pin_rate_limits so lockouts survive restarts.
// ---------------------------------------------------------------------------

function safeEnvInt(name: string, defaultValue: number): number {
  const parsed = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

const IDENTIFY_MAX_FAILURES = safeEnvInt("KIOSK_PIN_MAX_FAILURES", 10);
const IDENTIFY_WINDOW_MS    = safeEnvInt("KIOSK_PIN_WINDOW_MS",    60_000);   // 1 minute
const IDENTIFY_LOCKOUT_MS   = safeEnvInt("KIOSK_PIN_LOCKOUT_MS",   300_000);  // 5 minutes

function getClientIp(req: Request): string {
  return req.ip ?? "unknown";
}

async function checkPinRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const now = Date.now();
  const [entry] = await nativeDb
    .select()
    .from(kioskPinRateLimits)
    .where(eq(kioskPinRateLimits.ip, ip))
    .limit(1);

  if (!entry) return { allowed: true, retryAfterMs: 0 };

  const windowStartMs = entry.windowStart.getTime();
  const lockedUntilMs = entry.lockedUntil?.getTime() ?? null;

  // Still within lockout period?
  if (lockedUntilMs !== null && now < lockedUntilMs) {
    return { allowed: false, retryAfterMs: lockedUntilMs - now };
  }

  // Window expired — delete stale row and treat as fresh slate
  if (now - windowStartMs > IDENTIFY_WINDOW_MS) {
    await nativeDb.delete(kioskPinRateLimits).where(eq(kioskPinRateLimits.ip, ip));
    return { allowed: true, retryAfterMs: 0 };
  }

  // Within window — check failure count.
  // Lockout triggers when failures EXCEED the configured maximum so that
  // exactly IDENTIFY_MAX_FAILURES bad attempts are allowed before the
  // (N+1)-th attempt is blocked.
  // Only write a new lockedUntil when transitioning into lockout for the first
  // time (lockedUntil is null). If the lockout already expired while the window
  // is still open we do NOT re-extend, so we let the request through and allow
  // recordPinFailure to start fresh accumulation on the next failure.
  if (entry.failures > IDENTIFY_MAX_FAILURES && entry.lockedUntil === null) {
    const lockedUntil = new Date(now + IDENTIFY_LOCKOUT_MS);
    await nativeDb
      .update(kioskPinRateLimits)
      .set({ lockedUntil })
      .where(eq(kioskPinRateLimits.ip, ip));
    return { allowed: false, retryAfterMs: IDENTIFY_LOCKOUT_MS };
  }

  return { allowed: true, retryAfterMs: 0 };
}

async function recordPinFailure(ip: string): Promise<{ failures: number; lockedUntil: Date | null }> {
  const now = new Date();
  const nowMs = now.getTime();

  const [existing] = await nativeDb
    .select()
    .from(kioskPinRateLimits)
    .where(eq(kioskPinRateLimits.ip, ip))
    .limit(1);

  let failures: number;
  let lockedUntil: Date | null = null;

  if (!existing || nowMs - existing.windowStart.getTime() > IDENTIFY_WINDOW_MS) {
    // Start a fresh window
    failures = 1;
    await nativeDb
      .insert(kioskPinRateLimits)
      .values({ ip, failures: 1, windowStart: now, lockedUntil: null })
      .onConflictDoUpdate({
        target: kioskPinRateLimits.ip,
        set: { failures: 1, windowStart: now, lockedUntil: null },
      });
  } else {
    failures = existing.failures + 1;
    if (failures >= IDENTIFY_MAX_FAILURES) {
      lockedUntil = new Date(nowMs + IDENTIFY_LOCKOUT_MS);
    }
    await nativeDb
      .update(kioskPinRateLimits)
      .set({ failures, lockedUntil })
      .where(eq(kioskPinRateLimits.ip, ip));
  }

  return { failures, lockedUntil };
}

async function resetPinFailures(ip: string): Promise<void> {
  await nativeDb.delete(kioskPinRateLimits).where(eq(kioskPinRateLimits.ip, ip));
}

/** Wraps an async route handler so uncaught errors return 500 instead of crashing the process. */
function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/punches]", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });
}

type PunchSessionEvent = {
  id: number;
  sessionId: number;
  employeeId: number;
  type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
  punchedAt: string;
  source: string;
  isEdited: boolean;
  editNote: string | null;
  costCode: string | null;
  note: string | null;
  hasMissingClockOut: boolean;
  hasMissingClockIn: boolean;
  reviewReason: string | null;
};

function sessionsToPunchEvents(sessions: any[]): PunchSessionEvent[] {
  const events: PunchSessionEvent[] = [];
  for (const s of sessions) {
    const inType: PunchSessionEvent['type'] = s.laborClass === 'BREAK' ? 'break_start' : 'clock_in';
    const outType: PunchSessionEvent['type'] = s.laborClass === 'BREAK' ? 'break_end' : 'clock_out';
    const missingOut = s.clockOut == null;
    const sessionNote = [s.editNote, s.overrideReason].filter(Boolean).join(' | ');
    const missingIn = /missing[_\s-]?in|missing IN punch|clockIn inferred/i.test(sessionNote);
    const reviewReason = missingOut
      ? 'Missing clock-out'
      : missingIn
        ? 'Missing clock-in was inferred from TimeTrakGO hours'
        : null;

    const rawNote = s.editNote ?? null;
    let inNote: string | null = null;
    let outNote: string | null = null;
    let inEdited = false;
    let outEdited = false;

    if (rawNote && s.isEdited) {
      const inMatch = rawNote.match(/\[clockIn\]\s([^|]+?)(?:\s*\|\||$)/);
      const outMatch = rawNote.match(/\[clockOut\]\s([^|]+?)(?:\s*\|\||$)/);
      if (inMatch || outMatch) {
        if (inMatch) { inEdited = true; inNote = inMatch[1].trim(); }
        if (outMatch) { outEdited = true; outNote = outMatch[1].trim(); }
      } else {
        inEdited = true;
        outEdited = true;
        inNote = rawNote;
        outNote = rawNote;
      }
    }

    events.push({
      id: s.id,
      sessionId: s.id,
      employeeId: s.employeeId,
      type: inType,
      punchedAt: (s.clockIn instanceof Date ? s.clockIn : new Date(s.clockIn)).toISOString(),
      source: s.source,
      isEdited: inEdited,
      editNote: inNote,
      costCode: s.chargeCode ?? null,
      note: null,
      hasMissingClockOut: missingOut,
      hasMissingClockIn: missingIn,
      reviewReason,
    });

    if (!missingOut && s.clockOut != null) {
      events.push({
        id: s.id,
        sessionId: s.id,
        employeeId: s.employeeId,
        type: outType,
        punchedAt: (s.clockOut instanceof Date ? s.clockOut : new Date(s.clockOut)).toISOString(),
        source: s.source,
        isEdited: outEdited,
        editNote: outNote,
        costCode: s.chargeCode ?? null,
        note: null,
        hasMissingClockOut: false,
        hasMissingClockIn: false,
        reviewReason: null,
      });
    }
  }
  events.sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));
  return events;
}

// ---------------------------------------------------------------------------
// Kiosk endpoints — intentionally public (PIN auth handled in business logic)
// Rewired to punch_ledger — employeeId is now public.employees.id
// ---------------------------------------------------------------------------

/**
 * GET /api/timekeeping/kiosk/punches/employee/:employeeId/current
 *
 * Returns the current punch-ledger status for a kiosk employee.
 * :employeeId is public.employees.id (returned from /kiosk/login).
 */
router.get("/kiosk/punches/employee/:employeeId/current", h(async (req, res): Promise<void> => {
  const id = parseInt(req.params.employeeId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid employee id" }); return; }

  const openSession = await ledger.getOpenSession(id);
  const status = ledger.deriveStatus(openSession);
  const hoursToday = await ledger.computeHoursToday(id);

  res.json({
    employeeId: id,
    status,
    clockedInAt: openSession?.clockIn?.toISOString() ?? null,
    hoursToday,
    openEntry: openSession ?? null,
  });
}));

router.post("/kiosk/punches/employee/:employeeId/active-shift", h(async (req, res): Promise<void> => {
  const employeeId = parseInt(req.params.employeeId, 10);
  if (isNaN(employeeId)) { res.status(400).json({ error: "Invalid employee id" }); return; }

  const { pin } = req.body ?? {};
  if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "A 4-digit PIN is required" });
    return;
  }

  const [emp] = await nativeDb
    .select({
      id: employees.id,
      isActive: employees.isActive,
      timekeeperPin: employees.timekeeperPin,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!emp || !emp.isActive || !emp.timekeeperPin || !(await bcrypt.compare(pin, emp.timekeeperPin))) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  const bodyFrom = typeof req.body?.from === "string" ? new Date(req.body.from) : null;
  const bodyTo = typeof req.body?.to === "string" ? new Date(req.body.to) : null;
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const from = bodyFrom && !Number.isNaN(bodyFrom.getTime()) ? bodyFrom : todayStart;
  const to = bodyTo && !Number.isNaN(bodyTo.getTime()) ? bodyTo : todayEnd;
  const sessions = await ledger.listSessions({ employeeId, from, to });
  res.json({
    employeeId,
    from: from.toISOString(),
    to: to.toISOString(),
    punches: sessionsToPunchEvents(sessions),
  });
}));

// GET /api/timekeeping/kiosk/employees — returns active employees with linked active user accounts.
// Intentionally public (no auth required — kiosk terminal is unauthenticated at HTTP level).
router.get("/kiosk/employees", h(async (req, res): Promise<void> => {
  const rows = await nativeDb
    .select({
      id: employees.id,
      name: employees.name,
      jobTitle: employees.jobTitle,
    })
    .from(employees)
    .innerJoin(users, and(eq(users.employeeId, employees.id), eq(users.isActive, true)))
    .where(eq(employees.isActive, true));

  const result = rows.map(row => {
    const nameParts = (row.name ?? "Employee").trim().split(/\s+/);
    return {
      id: row.id,
      firstName: nameParts[0] ?? "Employee",
      lastName: nameParts.slice(1).join(" "),
      jobTitle: row.jobTitle ?? null,
    };
  });

  result.sort((a, b) => {
    const lastCmp = (a.lastName || "").localeCompare(b.lastName || "");
    return lastCmp !== 0 ? lastCmp : a.firstName.localeCompare(b.firstName);
  });

  res.json(result);
}));

// POST /api/timekeeping/kiosk/login — authenticates via employeeId + PIN (EPOCH password hash).
// Returns public.employees.id which punch_ledger uses as its employee FK.
router.post("/kiosk/login", h(async (req, res): Promise<void> => {
  const { employeeId, pin } = req.body ?? {};
  if (!employeeId || typeof employeeId !== "number") {
    res.status(400).json({ error: "employeeId is required" });
    return;
  }
  if (!pin || typeof pin !== "string") {
    res.status(400).json({ error: "PIN is required" });
    return;
  }

  // Fetch employee first to confirm they're active
  const [emp] = await nativeDb
    .select({
      id: employees.id,
      name: employees.name,
      jobTitle: employees.jobTitle,
      isActive: employees.isActive,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!emp || !emp.isActive) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  // Look up the linked active user account
  const [userRow] = await nativeDb
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(eq(users.employeeId, employeeId), eq(users.isActive, true)))
    .limit(1);

  if (!userRow) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  const pinValid = await bcrypt.compare(pin, userRow.passwordHash);
  if (!pinValid) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  const nameParts = (emp.name ?? "Employee").trim().split(/\s+/);
  res.json({
    id: emp.id,
    firstName: nameParts[0] ?? "Employee",
    lastName: nameParts.slice(1).join(" "),
    jobTitle: emp.jobTitle ?? null,
  });
}));

// POST /api/timekeeping/kiosk/identify — PIN-only kiosk identification.
// Accepts a raw 4-digit PIN, iterates all active employees who have timekeeper_pin set,
// bcrypt-compares against each stored hash, and returns the matched employee or 401.
// Rate-limited: returns 429 after KIOSK_PIN_MAX_FAILURES failures within KIOSK_PIN_WINDOW_MS.
router.post("/kiosk/identify", h(async (req, res): Promise<void> => {
  const clientIp = getClientIp(req);

  // --- Rate-limit check (before any PIN comparison) ---
  const rl = await checkPinRateLimit(clientIp);
  if (!rl.allowed) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);

    // Audit-log each lockout-blocked attempt for complete abuse traceability
    logAction({
      tableName: "kiosk_pin_attempts",
      recordId: 0,
      action: "INSERT",
      oldValues: null,
      newValues: {
        event: "KIOSK_PIN_BLOCKED",
        ip: clientIp,
        retryAfterSeconds: retryAfterSec,
      },
      actor: { id: null, email: null, role: null, ip: clientIp },
    }).catch((err) => {
      console.warn("[kiosk/identify] audit log write failed:", err?.message ?? err);
    });

    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({
      error: "Too many failed PIN attempts. Please wait before trying again.",
      retryAfterSeconds: retryAfterSec,
    });
    return;
  }

  const { pin } = req.body ?? {};
  if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "A 4-digit PIN is required" });
    return;
  }

  // Fetch all active employees that have a timekeeper_pin set
  const candidates = await nativeDb
    .select({
      id: employees.id,
      name: employees.name,
      jobTitle: employees.jobTitle,
      timekeeperPin: employees.timekeeperPin,
    })
    .from(employees)
    .where(and(eq(employees.isActive, true)));

  // bcrypt-compare each hash — short-circuit on first match
  for (const emp of candidates) {
    if (!emp.timekeeperPin) continue;
    const match = await bcrypt.compare(pin, emp.timekeeperPin);
    if (match) {
      // Successful identification — clear accumulated failures for this IP
      await resetPinFailures(clientIp);

      const nameParts = (emp.name ?? "Employee").trim().split(/\s+/);

      // Resolve current punch status so the confirm screen can render immediately
      const openSession = await ledger.getOpenSession(emp.id);
      const status = ledger.deriveStatus(openSession);
      const hoursToday = await ledger.computeHoursToday(emp.id);

      res.json({
        id: emp.id,
        firstName: nameParts[0] ?? "Employee",
        lastName: nameParts.slice(1).join(" "),
        jobTitle: emp.jobTitle ?? null,
        punchStatus: {
          employeeId: emp.id,
          status,
          clockedInAt: openSession?.clockIn?.toISOString() ?? null,
          hoursToday,
        },
      });
      return;
    }
  }

  // No match — record the failure and write to audit trail
  const { failures: totalFailures, lockedUntil: newLockedUntil } = await recordPinFailure(clientIp);
  // Lockout after the (N+1)-th bad attempt — IDENTIFY_MAX_FAILURES bad
  // attempts are permitted before the first block.
  const isNowLocked = totalFailures > IDENTIFY_MAX_FAILURES;

  logAction({
    tableName: "kiosk_pin_attempts",
    recordId: 0,
    action: "INSERT",
    oldValues: null,
    newValues: {
      event: isNowLocked ? "KIOSK_PIN_LOCKOUT" : "KIOSK_PIN_FAILURE",
      ip: clientIp,
      failureCount: totalFailures,
      maxAllowed: IDENTIFY_MAX_FAILURES,
      windowMs: IDENTIFY_WINDOW_MS,
      lockedUntil: newLockedUntil?.toISOString() ?? null,
    },
    actor: { id: null, email: null, role: null, ip: clientIp },
  }).catch((err) => {
    console.warn("[kiosk/identify] audit log write failed:", err?.message ?? err);
  });

  if (isNowLocked) {
    const retryAfterSec = Math.ceil(IDENTIFY_LOCKOUT_MS / 1000);
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({
      error: "Too many failed PIN attempts. Please wait before trying again.",
      retryAfterSeconds: retryAfterSec,
    });
    return;
  }

  res.status(401).json({ error: "PIN not recognised. Please try again." });
}));

router.post("/kiosk/punch-corrections", h(async (req, res): Promise<void> => {
  const body = KioskPunchCorrectionSubmitSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { employeeId, pin, requestType, punchLedgerId, reason, proposedChanges } = body.data;
  const [emp] = await nativeDb
    .select({
      id: employees.id,
      isActive: employees.isActive,
      timekeeperPin: employees.timekeeperPin,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!emp || !emp.isActive || !emp.timekeeperPin) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  const pinValid = await bcrypt.compare(pin, emp.timekeeperPin);
  if (!pinValid) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  const result = await punchCorrections.submitPunchCorrectionRequest({
    employeeId,
    punchLedgerId: punchLedgerId ?? null,
    requestType,
    reason,
    proposedChanges,
    source: "kiosk",
    actorUser: null,
    actorIp: req.ip ?? null,
    requireSupervisor: true,
  });

  if ("error" in result) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }

  res.status(201).json(result);
}));

// GET /api/timekeeping/kiosk/charge-codes — returns active charge codes for kiosk dropdown.
// Intentionally public (no auth required — kiosk terminal is unauthenticated at HTTP level).
router.get("/kiosk/charge-codes", h(async (req, res): Promise<void> => {
  const rawEmployeeId = typeof req.query.employeeId === 'string' ? Number(req.query.employeeId) : null;
  const employeeId = Number.isInteger(rawEmployeeId) && rawEmployeeId > 0 ? rawEmployeeId : null;
  const codes = await listVisibleChargeCodes(employeeId);
  res.json(codes);
}));

// POST /api/timekeeping/kiosk/punch — records kiosk clock_in/out/break events into punch_ledger.
// employeeId in body is public.employees.id.
router.post("/kiosk/punch", optionalAuth, h(async (req, res): Promise<void> => {
  const body = KioskPunchBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { employeeId, timezone, requestedAction, costCode, travelerId, dailyCertificationConfirmed } = body.data;

  // Resolve employee identity — employeeId is public.employees.id (resolved at login step)
  if (employeeId == null) {
    res.status(400).json({ error: "employeeId is required" });
    return;
  }

  let resolvedEmployeeId: number;
  let firstName = "Employee";
  let lastName = "";

  const [row] = await nativeDb
    .select({ id: employees.id, name: employees.name, isActive: employees.isActive })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Employee not found" }); return; }
  if (!row.isActive) { res.status(403).json({ error: "Employee is not active" }); return; }
  resolvedEmployeeId = row.id;
  const nameParts = (row.name ?? "Employee").trim().split(/\s+/);
  firstName = nameParts[0] ?? "Employee";
  lastName = nameParts.slice(1).join(" ");

  // Resolve charge context from traveler barcode if provided
  let chargeCodeId: number | null = null;
  let chargeCodeStr: string | null = null;
  let travellerIdResolved: string | null = null;
  let productionWorkOrderId: string | null = null;
  let department: string | null = null;
  let operation: string | null = null;
  let laborApprovalId: number | null = null;
  let laborBudgetOverrideId: number | null = null;
  // §5.2 (Task #77): kiosk path may produce a TRAVELER-source punch when a traveler
  // barcode is supplied. Default to PENDING_APPROVAL in that case; non-traveler kiosk
  // punches keep AUTO (no WAD link → not subject to the WAD approval gate).
  let approvalStatus = "AUTO";

  if (travelerId) {
    const chargeCtx = await resolveTravelerBarcode(travelerId);
    if (!chargeCtx.ok) { res.status(422).json({ error: `Could not resolve charge code from traveler: ${chargeCtx.error.message}` }); return; }
    const ctx = chargeCtx.context;
    travellerIdResolved = ctx.travelerId ?? null;
    productionWorkOrderId = ctx.productionWorkOrderId ?? null;
    chargeCodeStr = ctx.chargeCode ?? null;
    department = ctx.department ?? null;
    operation = ctx.operation ?? null;
    laborApprovalId = ctx.laborApprovalId ?? null;
    laborBudgetOverrideId = ctx.laborBudgetOverrideId ?? null;
    approvalStatus = ctx.approvalStatus ?? "PENDING_APPROVAL";
    // Resolve chargeCodeId from chargeCodeStr
    if (chargeCodeStr) {
      const [ccRow] = await nativeDb
        .select({ id: chargeCodes.id })
        .from(chargeCodes)
        .where(and(eq(chargeCodes.code, chargeCodeStr), eq(chargeCodes.active, true)))
        .limit(1);
      chargeCodeId = ccRow?.id ?? null;
    }
  } else if (costCode) {
    const normalized = costCode.trim();
    if (normalized) {
      const [ccRow] = await nativeDb
        .select({ id: chargeCodes.id })
        .from(chargeCodes)
        .where(and(eq(chargeCodes.code, normalized), eq(chargeCodes.active, true)))
        .limit(1);
      if (!ccRow) { res.status(400).json({ error: `Charge code '${normalized}' is not in the active charge code registry.` }); return; }
      chargeCodeId = ccRow.id;
      chargeCodeStr = normalized;
    }
  }

  // Determine the action to take
  const openSession = await ledger.getOpenSession(resolvedEmployeeId);
  const currentStatus = ledger.deriveStatus(openSession);

  // Resolve action: use requestedAction if provided, otherwise infer from status.
  let action = requestedAction;
  if (!action) {
    if (currentStatus === "clocked_out") action = "clock_in";
    else if (currentStatus === "on_break") action = "break_end";
    else action = "clock_out";
  }

  if (action === "clock_out" && dailyCertificationConfirmed !== true) {
    res.status(400).json({
      error: "Daily employee certification is required when punching out for the day.",
      certificationRequired: true,
    });
    return;
  }

  // Normalise on_break punches to clock_out
  if (action === "clock_out" && currentStatus === "on_break") {
    // fall through — closeSession handles open break sessions correctly
  }

  let entry;
  let message = "";

  switch (action) {
    case "clock_in": {
      if (currentStatus !== "clocked_out") {
        res.status(409).json({ error: `Employee is already ${currentStatus === "clocked_in" ? "clocked in" : "on break"}. Clock out first.` });
        return;
      }
      // PTO block: refuse clock-in on approved PTO days (kiosk path).
      // Admin override is possible when an ADMIN/OWNER user supplies their JWT in the
      // Authorization header along with adminPtoOverride=true and adminOverrideReason.
      // optionalAuth middleware (applied to this route) populates req.user when a valid
      // token is present; unauthenticated kiosk sessions leave req.user undefined.
      const kioskToday = new Date().toISOString().slice(0, 10);
      const kioskPtoBlock = await checkActivePTOForEmployee(resolvedEmployeeId, kioskToday);
      if (kioskPtoBlock) {
        const kioskAdminOverride = req.body?.adminPtoOverride === true;
        const kioskOverrideReason = typeof req.body?.adminOverrideReason === "string" ? req.body.adminOverrideReason.trim() : null;
        const kioskIsAdmin = req.user?.role === "ADMIN" || req.user?.role === "OWNER";
        if (kioskAdminOverride && kioskIsAdmin && kioskOverrideReason) {
          await logAction({
            tableName: "leave_entries",
            recordId: kioskPtoBlock.leaveEntryId,
            action: "UPDATE",
            oldValues: null,
            newValues: {
              ptoClockInOverride: true,
              overrideActorId: req.user?.id ?? null,
              overrideReason: kioskOverrideReason,
              overrideTimestamp: new Date().toISOString(),
              source: "KIOSK",
            },
            actor: actorFromUser(req.user ?? null, req.ip ?? null),
          });
        } else {
          res.status(422).json({
            error: "PTO_DAY_BLOCK",
            message: "This employee has approved PTO for today. Clock-in is not permitted.",
            leaveEntryId: kioskPtoBlock.leaveEntryId,
          });
          return;
        }
      }
      entry = await ledger.openSession({
        employeeId: resolvedEmployeeId,
        source: "KIOSK",
        laborClass: "REGULAR",
        travelerId: travellerIdResolved,
        productionWorkOrderId,
        chargeCodeId,
        department,
        operation,
        approvalStatus,
        laborApprovalId,
        laborBudgetOverrideId,
      });
      message = `Welcome, ${firstName}! You are now clocked in.`;
      break;
    }
    case "clock_out": {
      if (currentStatus === "clocked_out") {
        res.status(409).json({ error: "Employee is not clocked in." });
        return;
      }
      if (currentStatus === "on_break") {
        res.status(409).json({ error: "End break before clocking out for the day." });
        return;
      }
      entry = await ledger.closeSession(resolvedEmployeeId);
      const dailyCertification = await certifyDailyTimeOnPunchOut(
        resolvedEmployeeId,
        entry?.clockOut ?? new Date(),
        actorFromUser(req.user ?? null, req.ip ?? null),
        { certificationConfirmed: true, source: "kiosk_punch_out" },
      );
      if (dailyCertification && "error" in dailyCertification) {
        res.status(dailyCertification.statusCode).json({
          error: dailyCertification.error,
          punchRecorded: true,
        });
        return;
      }
      message = `Goodbye, ${firstName}! You have clocked out.`;
      break;
    }
    case "break_start": {
      if (currentStatus !== "clocked_in" || !openSession) {
        res.status(409).json({ error: currentStatus === "on_break" ? "Employee is already on break." : "Employee is not clocked in." });
        return;
      }
      const closedWork = await ledger.closeSession(resolvedEmployeeId);
      entry = await ledger.openSession({
        employeeId: resolvedEmployeeId,
        source: "KIOSK",
        laborClass: "BREAK",
        travelerId: closedWork?.travelerId ?? openSession.travelerId ?? null,
        productionWorkOrderId: closedWork?.productionWorkOrderId ?? openSession.productionWorkOrderId ?? null,
        chargeCodeId: closedWork?.chargeCodeId ?? openSession.chargeCodeId ?? null,
        department: closedWork?.department ?? openSession.department ?? null,
        operation: closedWork?.operation ?? openSession.operation ?? null,
        projectId: closedWork?.projectId ?? openSession.projectId ?? null,
        travelerStepId: closedWork?.travelerStepId ?? openSession.travelerStepId ?? null,
        certificationStatus: closedWork?.certificationStatus ?? openSession.certificationStatus ?? null,
        isOverrun: closedWork?.isOverrun ?? openSession.isOverrun ?? false,
        overrunReason: closedWork?.overrunReason ?? openSession.overrunReason ?? null,
        overrideReason: closedWork?.overrideReason ?? openSession.overrideReason ?? null,
        approvalStatus: closedWork?.approvalStatus ?? openSession.approvalStatus ?? "AUTO",
        laborApprovalId: closedWork?.laborApprovalId ?? openSession.laborApprovalId ?? null,
        laborBudgetOverrideId: closedWork?.laborBudgetOverrideId ?? openSession.laborBudgetOverrideId ?? null,
      });
      message = `${firstName}, you are clocked out for break.`;
      break;
    }
    case "break_end": {
      if (currentStatus !== "on_break" || !openSession) {
        res.status(409).json({ error: "Employee is not on break." });
        return;
      }
      const closedBreak = await ledger.closeSession(resolvedEmployeeId);
      entry = await ledger.openSession({
        employeeId: resolvedEmployeeId,
        source: "KIOSK",
        laborClass: "REGULAR",
        travelerId: closedBreak?.travelerId ?? openSession.travelerId ?? travellerIdResolved,
        productionWorkOrderId: closedBreak?.productionWorkOrderId ?? openSession.productionWorkOrderId ?? productionWorkOrderId,
        chargeCodeId: chargeCodeId ?? closedBreak?.chargeCodeId ?? openSession.chargeCodeId,
        department: closedBreak?.department ?? openSession.department ?? department,
        operation: closedBreak?.operation ?? openSession.operation ?? operation,
        projectId: closedBreak?.projectId ?? openSession.projectId ?? null,
        travelerStepId: closedBreak?.travelerStepId ?? openSession.travelerStepId ?? null,
        certificationStatus: closedBreak?.certificationStatus ?? openSession.certificationStatus ?? null,
        isOverrun: closedBreak?.isOverrun ?? openSession.isOverrun ?? false,
        overrunReason: closedBreak?.overrunReason ?? openSession.overrunReason ?? null,
        overrideReason: closedBreak?.overrideReason ?? openSession.overrideReason ?? null,
        approvalStatus: closedBreak?.approvalStatus ?? openSession.approvalStatus ?? approvalStatus,
        laborApprovalId: closedBreak?.laborApprovalId ?? openSession.laborApprovalId ?? laborApprovalId,
        laborBudgetOverrideId: closedBreak?.laborBudgetOverrideId ?? openSession.laborBudgetOverrideId ?? laborBudgetOverrideId,
      });
      message = `Welcome back, ${firstName}! You are clocked in from break.`;
      break;
    }
    default: {
      res.status(400).json({ error: `Invalid punch action for kiosk: ${action}.` });
      return;
    }
  }

  notificationManager.broadcast({
    type: 'punch_recorded',
    title: 'Punch recorded',
    message: `${firstName} ${lastName}`.trim(),
    data: { employeeId: resolvedEmployeeId, action },
    timestamp: new Date().toISOString(),
  });

  res.status(201).json({
    entry,
    action,
    employeeId: resolvedEmployeeId,
    message,
    dailyCertificationRecorded: action === "clock_out",
    status: ledger.deriveStatus(action === "clock_out" ? null : entry),
  });
}));

// ---------------------------------------------------------------------------
// Session-scoped "my" endpoints — employee self-service via Employee Portal
// Rewired to punch_ledger — uses req.user.employeeId (public.employees.id) directly.
// ---------------------------------------------------------------------------

/**
 * GET /api/timekeeping/punches/my/current
 *
 * Returns punch_ledger status for the authenticated employee.
 * No timekeepingId resolution needed — req.user.employeeId is epochEmployeeId.
 */
router.get("/punches/my/current", authenticateToken, h(async (req, res): Promise<void> => {
  const epochEmployeeId = req.user?.employeeId ?? null;
  if (!epochEmployeeId) {
    res.status(403).json({ error: "Your account is not linked to an employee record" });
    return;
  }

  const openSession = await ledger.getOpenSession(epochEmployeeId);
  const status = ledger.deriveStatus(openSession);
  const hoursToday = await ledger.computeHoursToday(epochEmployeeId);
  const openSessionAgeHours = openSession
    ? Math.max(0, (Date.now() - new Date(openSession.clockIn).getTime()) / 3_600_000)
    : 0;
  const openSessionRequiresReview = openSessionAgeHours >= 18;

  res.json({
    employeeId: epochEmployeeId,
    status,
    clockedInAt: openSession?.clockIn?.toISOString() ?? null,
    hoursToday,
    openSessionAgeHours,
    openSessionRequiresReview,
    openEntry: openSession ?? null,
  });
}));

/**
 * POST /api/timekeeping/punches/my
 *
 * Records a portal punch into punch_ledger.
 * Supports clock_in / clock_out / break_start / break_end.
 */
router.post("/punches/my", authenticateToken, h(async (req, res): Promise<void> => {
  const epochEmployeeId = req.user?.employeeId ?? null;
  if (!epochEmployeeId) {
    res.status(403).json({ error: "Your account is not linked to an employee record" });
    return;
  }

  const { type, costCode, travelerId, dailyCertificationConfirmed } = req.body ?? {};
  const validTypes = ["clock_in", "clock_out", "break_start", "break_end"];
  if (!type || !validTypes.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
    return;
  }

  if (type === "clock_out" && dailyCertificationConfirmed !== true) {
    res.status(400).json({
      error: "Daily employee certification is required when punching out for the day.",
      certificationRequired: true,
    });
    return;
  }

  const nowLockCheck = new Date();
  const periodLockedPortal = await isInFinalizedTimesheetPeriod(epochEmployeeId, nowLockCheck);
  if (periodLockedPortal) {
    res.status(409).json({
      error: "This date falls within a finalized (certified, locked, or under active correction) timesheet period. Punch cannot be recorded via portal.",
    });
    return;
  }

  // Resolve charge context from traveler barcode if provided
  let chargeCodeId: number | null = null;
  let chargeCodeStr: string | null = null;
  let travellerIdResolved: string | null = null;
  let productionWorkOrderId: string | null = null;
  let department: string | null = null;
  let operation: string | null = null;
  let laborApprovalId: number | null = null;
  let laborBudgetOverrideId: number | null = null;
  // §5.2 (Task #77): portal path may produce a TRAVELER-source punch when a
  // traveler barcode is supplied. Default to PENDING_APPROVAL in that case.
  let approvalStatus = "AUTO";

  if (travelerId) {
    const chargeCtx = await resolveTravelerBarcode(travelerId);
    if (!chargeCtx.ok) { res.status(422).json({ error: `Could not resolve charge code from traveler: ${chargeCtx.error.message}` }); return; }
    const ctx = chargeCtx.context;
    travellerIdResolved = ctx.travelerId ?? null;
    productionWorkOrderId = ctx.productionWorkOrderId ?? null;
    chargeCodeStr = ctx.chargeCode ?? null;
    department = ctx.department ?? null;
    operation = ctx.operation ?? null;
    laborApprovalId = ctx.laborApprovalId ?? null;
    laborBudgetOverrideId = ctx.laborBudgetOverrideId ?? null;
    approvalStatus = ctx.approvalStatus ?? "PENDING_APPROVAL";
    if (chargeCodeStr) {
      const [ccRow] = await nativeDb
        .select({ id: chargeCodes.id })
        .from(chargeCodes)
        .where(and(eq(chargeCodes.code, chargeCodeStr), eq(chargeCodes.active, true)))
        .limit(1);
      chargeCodeId = ccRow?.id ?? null;
    }
  } else if (costCode) {
    const normalized = costCode.trim();
    if (normalized) {
      const [ccRow] = await nativeDb
        .select({ id: chargeCodes.id })
        .from(chargeCodes)
        .where(and(eq(chargeCodes.code, normalized), eq(chargeCodes.active, true)))
        .limit(1);
      if (!ccRow) { res.status(400).json({ error: `Charge code '${normalized}' is not in the active charge code registry.` }); return; }
      chargeCodeId = ccRow.id;
      chargeCodeStr = normalized;
    }
  }

  const openSession = await ledger.getOpenSession(epochEmployeeId);
  const currentStatus = ledger.deriveStatus(openSession);

  let entry;

  switch (type as string) {
    case "clock_in": {
      if (currentStatus !== "clocked_out") {
        res.status(409).json({ error: `Already ${currentStatus === "clocked_in" ? "clocked in" : "on break"}` });
        return;
      }
      // PTO block: refuse clock-in on approved PTO days (portal path)
      // ADMIN/OWNER callers may bypass with adminPtoOverride=true + adminOverrideReason
      const portalToday = new Date().toISOString().slice(0, 10);
      const portalPtoBlock = await checkActivePTOForEmployee(epochEmployeeId, portalToday);
      if (portalPtoBlock) {
        const adminPtoOverride = req.body?.adminPtoOverride === true;
        const adminOverrideReason = typeof req.body?.adminOverrideReason === "string" ? req.body.adminOverrideReason : null;
        const isAdminOrOwner = req.user?.role === "ADMIN" || req.user?.role === "OWNER";
        if (adminPtoOverride && isAdminOrOwner && adminOverrideReason) {
          await logAction({
            tableName: "leave_entries",
            recordId: portalPtoBlock.leaveEntryId,
            action: "UPDATE",
            oldValues: null,
            newValues: {
              ptoClockInOverride: true,
              overrideActorId: req.user?.id ?? null,
              overrideReason: adminOverrideReason,
              overrideTimestamp: new Date().toISOString(),
            },
            actor: actorFromUser(req.user ?? null, req.ip ?? null),
          });
        } else {
          res.status(422).json({
            error: "PTO_DAY_BLOCK",
            message: "This employee has approved PTO for today. Clock-in is not permitted.",
            leaveEntryId: portalPtoBlock.leaveEntryId,
          });
          return;
        }
      }
      entry = await ledger.openSession({
        employeeId: epochEmployeeId,
        source: "PORTAL",
        laborClass: "REGULAR",
        travelerId: travellerIdResolved,
        productionWorkOrderId,
        chargeCodeId,
        department,
        operation,
        approvalStatus,
        laborApprovalId,
        laborBudgetOverrideId,
      });
      break;
    }
    case "clock_out": {
      if (currentStatus === "clocked_out") {
        res.status(409).json({ error: "Not clocked in" });
        return;
      }
      entry = await ledger.closeSession(epochEmployeeId);
      const dailyCertification = await certifyDailyTimeOnPunchOut(
        epochEmployeeId,
        entry?.clockOut ?? new Date(),
        actorFromUser(req.user ?? null, req.ip ?? null),
        { certificationConfirmed: true, source: "portal_punch_out" },
      );
      if (dailyCertification && "error" in dailyCertification) {
        res.status(dailyCertification.statusCode).json({
          error: dailyCertification.error,
          punchRecorded: true,
        });
        return;
      }
      break;
    }
    case "break_start": {
      if (currentStatus !== "clocked_in") {
        res.status(409).json({ error: currentStatus === "on_break" ? "Already on break" : "Not clocked in" });
        return;
      }
      await ledger.closeSession(epochEmployeeId);
      entry = await ledger.openSession({ employeeId: epochEmployeeId, source: "PORTAL", laborClass: "BREAK" });
      break;
    }
    case "break_end": {
      if (currentStatus !== "on_break") {
        res.status(409).json({ error: "Not on break" });
        return;
      }
      await ledger.closeSession(epochEmployeeId);
      entry = await ledger.openSession({
        employeeId: epochEmployeeId,
        source: "PORTAL",
        laborClass: "REGULAR",
        travelerId: travellerIdResolved,
        productionWorkOrderId,
        chargeCodeId,
        department,
        operation,
        approvalStatus,
        laborApprovalId,
        laborBudgetOverrideId,
      });
      break;
    }
    default:
      res.status(400).json({ error: "Invalid type" });
      return;
  }

  notificationManager.broadcast({
    type: 'punch_recorded',
    title: 'Punch recorded',
    message: `Employee ${epochEmployeeId} — ${type}`,
    data: { employeeId: epochEmployeeId, action: type },
    timestamp: new Date().toISOString(),
  });

  res.status(201).json({ entry, type, dailyCertificationRecorded: type === "clock_out" });
}));

// ---------------------------------------------------------------------------
// Admin punch_ledger endpoints
// All writes target public.punch_ledger exclusively.
// GETs also query punch_ledger. The legacy timekeeping.punches table is
// read-only archive; no new data is written to it.
// ---------------------------------------------------------------------------

// Zod schemas for admin punch_ledger routes
const AdminPunchIdParams = z.object({ id: z.coerce.number().int().positive() });

const AdminCreatePunchBody = z.object({
  employeeId: z.string(), // public.employees.id (numeric string) or employee code
  type: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end']),
  punchedAt: z.string().datetime().optional(),
  costCode: z.string().optional().nullable(),
  chargeCodeId: z.number().int().optional().nullable(), // FK-safe; takes precedence over costCode
  travelerId: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

const AdminUpdatePunchBody = z.object({
  which: z.enum(['clockIn', 'clockOut']),
  punchedAt: z.string().datetime({ message: "punchedAt must be an ISO-8601 datetime" }),
  chargeCodeId: z.number().int().optional().nullable(),
  travelerId: z.string().optional().nullable(),
  editNote: z.string().min(1, "[DCAA TK-004] editNote is required for all punch edits"),
});

// GET /punches — list punch_ledger entries with optional employee/date filters
// Returns event-shaped rows (one per clock-in/out event) so the Punch Review UI
// can render a human-readable "Punched At" timestamp and punch type badge.
router.get("/punches", authenticateToken, h(async (req, res): Promise<void> => {
  const q = ListPunchesQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  const sessions = await ledger.listSessions({
    employeeId: q.data.employeeId ?? undefined,
    from: q.data.from ? new Date(q.data.from) : undefined,
    to: q.data.to ? new Date(q.data.to) : undefined,
  });

  res.json(sessionsToPunchEvents(sessions));
}));

router.get("/punches/my", authenticateToken, h(async (req, res): Promise<void> => {
  const employeeId = req.user?.employeeId ?? null;
  if (!employeeId) { res.status(403).json({ error: "Your account is not linked to an employee record" }); return; }

  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    res.status(400).json({ error: "from/to must be valid ISO date strings" });
    return;
  }

  const sessions = await ledger.listSessions({ employeeId, from, to });
  res.json(sessionsToPunchEvents(sessions));
}));

router.get("/punches/my/active-shift", authenticateToken, h(async (req, res): Promise<void> => {
  const employeeId = req.user?.employeeId ?? null;
  if (!employeeId) { res.status(403).json({ error: "Your account is not linked to an employee record" }); return; }

  const openSession = await ledger.getOpenSession(employeeId);
  const to = new Date();
  const from = openSession?.clockIn
    ? new Date(new Date(openSession.clockIn).getTime() - 2 * 60 * 60 * 1000)
    : new Date(to.getTime() - 18 * 60 * 60 * 1000);
  const sessions = await ledger.listSessions({ employeeId, from, to });

  res.json({
    employeeId,
    from: from.toISOString(),
    to: to.toISOString(),
    punches: sessionsToPunchEvents(sessions),
  });
}));

// POST /punches — admin creates a punch_ledger entry (admin correction / manual punch)
// employeeId must resolve to public.employees.id; clock-in opens a session, clock-out closes it.
router.post("/punches", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const body = AdminCreatePunchBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { employeeId: rawEmpId, type, punchedAt, costCode, travelerId } = body.data;
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);

  // Resolve to public.employees.id integer
  const resolvedId = await ledger.resolveEmployeeId(rawEmpId);
  if (!resolvedId) {
    res.status(404).json({ error: `Employee '${rawEmpId}' not found in public.employees` });
    return;
  }

  const punchTime = punchedAt ? new Date(punchedAt) : new Date();
  const lockedSheetForCreate = await findFinalizedTimesheetForPunch(resolvedId, punchTime);
  if (lockedSheetForCreate) {
    res.status(409).json({
      error: `[DCAA TK-001] The requested punch time falls within ${lockedSheetForCreate.status} timesheet #${lockedSheetForCreate.id} ` +
        `(${lockedSheetForCreate.periodStart}–${lockedSheetForCreate.periodEnd}) and cannot be added directly. ` +
        `Submit a correction request via the Corrections workflow for timesheet #${lockedSheetForCreate.id}.`,
    });
    return;
  }

  // Resolve chargeCodeId FK: explicit chargeCodeId takes precedence; fallback to text lookup
  let resolvedChargeCodeId = body.data.chargeCodeId !== undefined ? body.data.chargeCodeId : undefined;
  if (resolvedChargeCodeId === undefined && costCode) {
    const [cc] = await nativeDb
      .select({ id: chargeCodes.id })
      .from(chargeCodes)
      .where(and(eq(chargeCodes.code, costCode), eq(chargeCodes.active, true)))
      .limit(1);
    if (!cc) {
      res.status(422).json({ error: `Charge code '${costCode}' is not active or does not exist` });
      return;
    }
    resolvedChargeCodeId = cc.id;
  }

  let entry;

  const clockInTs = punchedAt ? new Date(punchedAt) : undefined;
  const actorEmployeeId = req.user?.employeeId ?? null;
  const actorLabel = actor.email ?? null;

  if (type === 'clock_in') {
    entry = await ledger.openSession({
      employeeId: resolvedId,
      source: 'PORTAL',
      laborClass: 'REGULAR',
      clockIn: clockInTs,
      chargeCodeId: resolvedChargeCodeId ?? null,
      travelerId: travelerId ?? null,
      createdBy: actorEmployeeId,
      createdByDisplayName: actorLabel,
    });
  } else if (type === 'clock_out') {
    try {
      entry = await ledger.closeSession(resolvedId, actorEmployeeId, actorLabel, punchTime);
    } catch (err: any) {
      if (err?.code === 'INVALID_CLOCK_OUT') {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
    if (!entry) { res.status(409).json({ error: 'No open session found for this employee' }); return; }
  } else if (type === 'break_start') {
    try {
      await ledger.closeSession(resolvedId, actorEmployeeId, actorLabel, punchTime);
    } catch (err: any) {
      if (err?.code === 'INVALID_CLOCK_OUT') {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
    entry = await ledger.openSession({
      employeeId: resolvedId,
      source: 'PORTAL',
      laborClass: 'BREAK',
      clockIn: clockInTs,
      createdBy: actorEmployeeId,
      createdByDisplayName: actorLabel,
    });
  } else {
    try {
      await ledger.closeSession(resolvedId, actorEmployeeId, actorLabel, punchTime);
    } catch (err: any) {
      if (err?.code === 'INVALID_CLOCK_OUT') {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
    entry = await ledger.openSession({
      employeeId: resolvedId,
      source: 'PORTAL',
      laborClass: 'REGULAR',
      clockIn: clockInTs,
      chargeCodeId: resolvedChargeCodeId ?? null,
      travelerId: travelerId ?? null,
      createdBy: actorEmployeeId,
      createdByDisplayName: actorLabel,
    });
  }

  res.status(201).json(entry);
}));

// GET /punches/employee/:employeeId/current — current punch status from punch_ledger
router.get("/punches/employee/:employeeId/current", authenticateToken, h(async (req, res): Promise<void> => {
  const p = GetCurrentPunchStatusParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  // employeeId is already a coerced integer (public.employees.id) — no further resolution needed
  const resolvedId = p.data.employeeId;
  const openSession = await ledger.getOpenSession(resolvedId);
  const status = ledger.deriveStatus(openSession);
  const hoursToday = await ledger.computeHoursToday(resolvedId);
  res.json({
    employeeId: resolvedId,
    status: status === 'clocked_in' ? 'clocked_in' : status === 'on_break' ? 'on_break' : 'clocked_out',
    clockedInAt: openSession?.clockIn?.toISOString() ?? null,
    hoursToday,
    openEntry: openSession ?? null,
  });
}));

// GET /punches/:id — fetch single punch_ledger entry by integer ID
router.get("/punches/:id", authenticateToken, h(async (req, res): Promise<void> => {
  const p = AdminPunchIdParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const row = await storage.getPunchLedgerEntryById(p.data.id);
  if (!row) { res.status(404).json({ error: "Punch not found" }); return; }
  res.json(row);
}));

router.post("/punch-corrections/my", authenticateToken, h(async (req, res): Promise<void> => {
  const body = PunchCorrectionSubmitSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const user = req.user as SafeUser | undefined;
  if (!user || !user.employeeId) {
    res.status(403).json({ error: "Your account is not linked to an employee record" });
    return;
  }

  const result = await punchCorrections.submitPunchCorrectionRequest({
    employeeId: user.employeeId,
    punchLedgerId: body.data.punchLedgerId ?? null,
    requestType: body.data.requestType,
    reason: body.data.reason,
    proposedChanges: body.data.proposedChanges,
    source: "employee_portal",
    submittedByUserId: user.id,
    actorUser: user,
    actorIp: req.ip ?? null,
  });

  if ("error" in result) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }

  res.status(201).json(result);
}));

router.get("/punch-corrections/my", authenticateToken, h(async (req, res): Promise<void> => {
  const employeeId = req.user?.employeeId ?? null;
  if (!employeeId) { res.json([]); return; }
  const rows = await punchCorrections.listPunchCorrections({ employeeId });
  res.json(rows);
}));

router.post("/punch-corrections", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const body = AdminPunchCorrectionSubmitSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const user = req.user as SafeUser | undefined;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await punchCorrections.submitPunchCorrectionRequest({
    employeeId: body.data.employeeId,
    punchLedgerId: body.data.punchLedgerId ?? null,
    requestType: body.data.requestType,
    reason: body.data.reason,
    proposedChanges: body.data.proposedChanges,
    source: "admin",
    submittedByUserId: user.id,
    actorUser: user,
    actorIp: req.ip ?? null,
    requireSupervisor: true,
  });

  if ("error" in result) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }

  res.status(201).json(result);
}));

router.get("/punch-corrections", authenticateToken, h(async (req, res): Promise<void> => {
  const user = req.user as SafeUser | undefined;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const isAdmin = ["ADMIN", "OWNER", "HR"].includes(user.role);
  const rows = await punchCorrections.listPunchCorrections({
    status,
    supervisorId: isAdmin ? undefined : user.employeeId ?? -1,
  });
  res.json(rows);
}));

router.post("/punch-corrections/:id/supervisor-review", authenticateToken, h(async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid correction id" }); return; }
  const body = PunchCorrectionReviewSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const user = req.user as SafeUser | undefined;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await punchCorrections.reviewPunchCorrectionSupervisor(
    id,
    body.data.decision,
    body.data.note,
    user,
    req.ip ?? null,
  );

  if ("error" in result) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }
  res.json(result);
}));

router.post("/punch-corrections/:id/hr-review", authenticateToken, h(async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid correction id" }); return; }
  const body = PunchCorrectionReviewSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const user = req.user as SafeUser | undefined;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await punchCorrections.reviewPunchCorrectionHr(
    id,
    body.data.decision,
    body.data.note,
    user,
    req.ip ?? null,
  );

  if ("error" in result) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }
  res.json(result);
}));

// PATCH/PUT /punches/:id — admin edit of punch_ledger entry (DCAA-audited, FK-enforced)
const handleAdminPunchUpdate = h(async (req: Request, res: Response): Promise<void> => {
  const p = AdminPunchIdParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const body = AdminUpdatePunchBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  const existing = await storage.getPunchLedgerEntryById(p.data.id);
  if (!existing) { res.status(404).json({ error: "Punch not found" }); return; }

  const lockedSheet = await findFinalizedTimesheetForPunch(
    existing.employeeId,
    new Date(existing.clockIn)
  );
  if (lockedSheet) {
    res.status(409).json({
      error: `[DCAA TK-001] This session falls within ${lockedSheet.status} timesheet #${lockedSheet.id} ` +
        `(${lockedSheet.periodStart}–${lockedSheet.periodEnd}) and cannot be edited directly. ` +
        `Submit a correction request via the Corrections workflow for timesheet #${lockedSheet.id}.`,
    });
    return;
  }

  if (existing.source === "SALARIED_ENTRY") {
    const salariedLockedSheet = await findPayrollApprovedSalariedTimesheetForPunch(
      existing.employeeId,
      new Date(existing.clockIn),
    );
    if (salariedLockedSheet) {
      await nativeDb.insert(salariedTimesheetAuditTable).values({
        timesheetId: salariedLockedSheet.id,
        lineId: null,
        action: "EDIT_BLOCKED_PAYROLL_APPROVED",
        actorId: (req.user as { id?: number } | undefined)?.id ?? null,
        actorName: actorFromUser(req.user ?? null, req.ip ?? null).email ?? null,
        actorRole: actorFromUser(req.user ?? null, req.ip ?? null).role ?? null,
        beforeState: null,
        afterState: { punchLedgerId: p.data.id },
        reason: "Admin punch edit blocked: timesheet PAYROLL_APPROVED",
        source: "ADMIN_PUNCH_EDIT",
        ipAddress: req.ip ?? null,
      });
      res.status(409).json({
        error: `[DCAA TK-002] This salaried entry falls within PAYROLL_APPROVED timesheet #${salariedLockedSheet.id} ` +
          `(${salariedLockedSheet.periodStart}–${salariedLockedSheet.periodEnd}) and cannot be edited directly. ` +
          `Submit a correction request via the Corrections workflow for timesheet #${salariedLockedSheet.id}.`,
      });
      return;
    }
  }

  const resolvedChargeCodeId = body.data.chargeCodeId !== undefined ? body.data.chargeCodeId : undefined;
  const ts = new Date(body.data.punchedAt);

  // Guard: clock-out must not be set to a time before the session's clock-in.
  if (body.data.which === 'clockOut' && existing.clockIn && ts <= existing.clockIn) {
    res.status(422).json({
      error: `Clock-out time (${ts.toISOString()}) must be after the session's clock-in (${existing.clockIn.toISOString()}).`,
    });
    return;
  }

  // Use `which` as the authoritative discriminator — only the specified timestamp
  // column is touched regardless of what else appears in the body.
  const timestampPatch = body.data.which === 'clockIn'
    ? { clockIn: ts }
    : { clockOut: ts };

  const otherField = body.data.which === 'clockIn' ? 'clockOut' : 'clockIn';
  const existingNote = existing.editNote ?? '';
  const otherMatch = existingNote.match(new RegExp(`\\[${otherField}\\]\\s([^|]+?)(?:\\s*\\|\\||$)`));
  const otherPart = otherMatch ? `[${otherField}] ${otherMatch[1].trim()}` : null;
  const thisPart = `[${body.data.which}] ${body.data.editNote}`;
  const mergedEditNote = otherPart
    ? (body.data.which === 'clockIn' ? `${thisPart} || ${otherPart}` : `${otherPart} || ${thisPart}`)
    : thisPart;

  const updated = await storage.updatePunchLedgerEntry(p.data.id, {
    ...timestampPatch,
    ...(resolvedChargeCodeId !== undefined ? { chargeCodeId: resolvedChargeCodeId } : {}),
    ...(body.data.travelerId !== undefined ? { travelerId: body.data.travelerId ?? null } : {}),
    isEdited: true,
    editNote: mergedEditNote,
    updatedBy: (req.user as { employeeId?: number | null } | undefined)?.employeeId ?? null,
    updatedByDisplayName: actor.email ?? null,
  });

  // DCAA audit trail — written only after successful punch_ledger update
  const fieldsChanged: Record<string, { from: unknown; to: unknown }> = {
    [body.data.which]: {
      from: body.data.which === 'clockIn' ? existing.clockIn : existing.clockOut,
      to: body.data.punchedAt,
    },
  };
  if (resolvedChargeCodeId !== undefined) {
    fieldsChanged.chargeCodeId = { from: existing.chargeCodeId, to: resolvedChargeCodeId };
  }
  if (body.data.travelerId !== undefined) {
    fieldsChanged.travelerId = { from: existing.travelerId, to: body.data.travelerId ?? null };
  }
  await nativeDb.insert(auditEvents).values({
    entityType: 'time_entry',
    entityId: String(p.data.id),
    action: 'ENTRY_UPDATED',
    actorId: actor.id ?? null,
    actorName: actor.email ?? null,
    actorRole: actor.role ?? null,
    reason: body.data.editNote,
    fieldsChanged,
    meta: {
      source: 'punch_ledger',
      correctionRoute: '/api/timekeeping/punches/:id',
      previousIsEdited: existing.isEdited,
      newIsEdited: true,
    },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });

  // Mirror the edit into labor_allocations — warn-only, never blocks the admin operation
  try {
    await dualWriteUpdateAllocation(updated);
  } catch (err) {
    console.warn('[dualWrite] Failed to update labor_allocations after admin punch edit', err);
  }

  res.json(updated);
});

router.patch("/punches/:id", authenticateToken, requireRole('ADMIN', 'OWNER'), handleAdminPunchUpdate);
router.put("/punches/:id", authenticateToken, requireRole('ADMIN', 'OWNER'), handleAdminPunchUpdate);

// DELETE /punches/:id — admin removes a punch_ledger entry (DCAA: editNote required)
router.delete("/punches/:id", authenticateToken, requireRole('ADMIN', 'OWNER'), h(async (req, res): Promise<void> => {
  const p = AdminPunchIdParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const { editNote } = req.body ?? {};
  if (!editNote || !String(editNote).trim()) {
    res.status(400).json({ error: "[DCAA TK-004] An edit reason (editNote) is required when deleting a punch record." });
    return;
  }
  const existing = await storage.getPunchLedgerEntryById(p.data.id);
  if (!existing) { res.status(404).json({ error: "Punch not found" }); return; }

  const lockedSheet = await findFinalizedTimesheetForPunch(
    existing.employeeId,
    new Date(existing.clockIn)
  );
  if (lockedSheet) {
    res.status(409).json({
      error: `[DCAA TK-001] This session falls within ${lockedSheet.status} timesheet #${lockedSheet.id} ` +
        `(${lockedSheet.periodStart}–${lockedSheet.periodEnd}) and cannot be deleted directly. ` +
        `Submit a correction request via the Corrections workflow for timesheet #${lockedSheet.id}.`,
    });
    return;
  }

  if (existing.source === "SALARIED_ENTRY") {
    const salariedLockedSheet = await findPayrollApprovedSalariedTimesheetForPunch(
      existing.employeeId,
      new Date(existing.clockIn),
    );
    if (salariedLockedSheet) {
      const actor = actorFromUser(req.user ?? null, req.ip ?? null);
      await nativeDb.insert(salariedTimesheetAuditTable).values({
        timesheetId: salariedLockedSheet.id,
        lineId: null,
        action: "EDIT_BLOCKED_PAYROLL_APPROVED",
        actorId: (req.user as { id?: number } | undefined)?.id ?? null,
        actorName: actor.email ?? null,
        actorRole: actor.role ?? null,
        beforeState: null,
        afterState: { punchLedgerId: p.data.id },
        reason: "Admin punch edit blocked: timesheet PAYROLL_APPROVED",
        source: "ADMIN_PUNCH_DELETE",
        ipAddress: req.ip ?? null,
      });
      res.status(409).json({
        error: `[DCAA TK-002] This salaried entry falls within PAYROLL_APPROVED timesheet #${salariedLockedSheet.id} ` +
          `(${salariedLockedSheet.periodStart}–${salariedLockedSheet.periodEnd}) and cannot be deleted directly. ` +
          `Submit a correction request via the Corrections workflow for timesheet #${salariedLockedSheet.id}.`,
      });
      return;
    }
  }

  await storage.deletePunchLedgerEntry(p.data.id);
  const actor = actorFromUser(req.user ?? null, req.ip ?? null);
  await nativeDb.insert(auditEvents).values({
    entityType: 'time_entry',
    entityId: String(p.data.id),
    action: 'ENTRY_DELETED',
    actorId: actor.id ?? null,
    actorName: actor.email ?? null,
    actorRole: actor.role ?? null,
    reason: String(editNote).trim(),
    fieldsChanged: null,
    meta: {
      source: 'punch_ledger',
      correctionRoute: '/api/timekeeping/punches/:id',
      deletedSessionId: existing.id,
      deletedEmployeeId: existing.employeeId,
      deletedClockIn: existing.clockIn ?? null,
      deletedClockOut: existing.clockOut ?? null,
      deletedTravelerId: existing.travelerId ?? null,
      deletedChargeCodeId: existing.chargeCodeId ?? null,
    },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });
  res.sendStatus(204);
}));

// ---------------------------------------------------------------------------
// Active charge codes — used by supervisor and admin forms to show valid options
// ---------------------------------------------------------------------------

router.get("/charge-codes", authenticateToken, h(async (req, res): Promise<void> => {
  const queryEmployeeId = typeof req.query.employeeId === 'string' ? Number(req.query.employeeId) : NaN;
  const shouldUseSessionEmployee = (req as any).portalEmployeeId != null || String(req.user?.role || '').toUpperCase() === 'EMPLOYEE';
  const userEmployeeId = Number(
    Number.isInteger(queryEmployeeId) && queryEmployeeId > 0
      ? queryEmployeeId
      : shouldUseSessionEmployee
        ? ((req as any).portalEmployeeId ?? req.user?.employeeId ?? NaN)
        : NaN
  );
  const employeeId = Number.isInteger(userEmployeeId) && userEmployeeId > 0 ? userEmployeeId : null;
  const codes = await listVisibleChargeCodes(employeeId, true);
  res.json(codes);
}));

export default router;
