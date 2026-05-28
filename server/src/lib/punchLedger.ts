/**
 * punchLedger — Unified Punch Ledger Service
 *
 * Single source of truth for ALL labor events: Kiosk, Traveler scan, Portal.
 * All reads and writes to public.punch_ledger go through this module.
 *
 * Core operations:
 *   openSession       — clock-in: INSERT new open row
 *   closeSession      — clock-out: set clock_out on open row
 *   switchAssignment  — update travelerId/chargeCode on open row WITHOUT closing it
 *   getOpenSession    — find the current open session for an employee
 *   listSessions      — query sessions by employee / date range
 *   getCurrentStatus  — derive clocked_in / on_break / clocked_out from open session
 */

import { db } from '../../db';
import { punchLedger, employees, chargeCodes } from '../../schema';
import type { PunchLedgerEntry, InsertPunchLedger } from '../../schema';
import { type SQL, eq, and, isNull, gte, lte, desc, sql, or } from 'drizzle-orm';
import { laborAllocationsEnabled } from './featureFlags';
import {
  openAllocation,
  closeAllocation,
} from '../services/laborAllocationService';

export type { PunchLedgerEntry };

export type PunchSource = 'KIOSK' | 'TRAVELER' | 'PORTAL' | 'TIMETRAKGO_IMPORT' | 'ADMIN';
export type LaborClass = 'REGULAR' | 'BREAK';
export type LedgerStatus = 'clocked_out' | 'clocked_in' | 'on_break';

export interface OpenSessionParams {
  employeeId: number;
  source: PunchSource;
  laborClass?: LaborClass;
  clockIn?: Date | null; // explicit timestamp for admin/correction flows; defaults to now()
  travelerId?: string | null;
  productionWorkOrderId?: string | null;
  chargeCodeId?: number | null; // FK — chargeCode snapshot derived internally
  department?: string | null;
  operation?: string | null;
  // WAD/project traceability (Task #1235 — always derived server-side)
  projectId?: string | null;
  travelerStepId?: string | null;
  certificationStatus?: string | null; // VALID | EXPIRED | MISSING
  isOverrun?: boolean;
  overrunReason?: string | null;
  overrideReason?: string | null;
  approvalStatus?: string;
  laborApprovalId?: number | null;
  laborBudgetOverrideId?: number | null;
  createdBy?: number | null;
  createdByDisplayName?: string | null;
}

export interface SwitchAssignmentParams {
  entryId: number;
  travelerId?: string | null;
  productionWorkOrderId?: string | null;
  chargeCodeId?: number | null; // FK — chargeCode snapshot derived internally
  department?: string | null;
  operation?: string | null;
  approvalStatus?: string;
  laborApprovalId?: number | null;
  laborBudgetOverrideId?: number | null;
  updatedBy?: number | null;
  updatedByDisplayName?: string | null;
}

export interface CreateClosedHistoricalSessionParams extends Omit<OpenSessionParams, 'clockIn'> {
  source: PunchSource;
  clockIn: Date;
  clockOut: Date;
  editNote: string;
}

/**
 * Derive a chargeCode snapshot string from the chargeCodes FK.
 * Returns null when chargeCodeId is null/undefined.
 */
async function deriveChargeCodeSnapshot(chargeCodeId: number | null | undefined): Promise<string | null> {
  if (chargeCodeId == null) return null;
  const [cc] = await db.select({ code: chargeCodes.code }).from(chargeCodes).where(eq(chargeCodes.id, chargeCodeId)).limit(1);
  return cc?.code ?? null;
}

export interface ListSessionsParams {
  employeeId?: number;
  from?: Date;
  to?: Date;
  includeOverlapping?: boolean;
  openOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Resolve the default approvalStatus for a new session.
 * Per Architecture Constitution §5.2 (Task #77):
 *   - TRAVELER-source punches MUST default to PENDING_APPROVAL (no AUTO).
 *   - Other sources (KIOSK / PORTAL / SALARIED_ENTRY / etc.) may default to AUTO
 *     when no explicit status is supplied — they fall through to the existing
 *     downstream approval gate which only blocks WAD-linked sessions.
 */
function defaultApprovalStatus(source: string, explicit?: string): string {
  if (explicit) return explicit;
  return source === 'TRAVELER' ? 'PENDING_APPROVAL' : 'AUTO';
}

/**
 * Guard: traveler-source punches may never be written with approvalStatus = 'AUTO'.
 * Per Architecture Constitution §5.2 (Task #77).
 */
function assertTravelerNotAuto(source: string, approvalStatus: string, ctx: string): void {
  if (source === 'TRAVELER' && approvalStatus === 'AUTO') {
    throw Object.assign(
      new Error(
        `[DCAA §5.2] ${ctx}: TRAVELER-source punches cannot be written with approvalStatus='AUTO'. ` +
          `Use 'PENDING_APPROVAL' (default), 'APPROVED_OVERRUN' (with explicit override/approval id), or 'FLAGGED'.`,
      ),
      { code: 'TRAVELER_AUTO_APPROVAL_FORBIDDEN' },
    );
  }
}

/**
 * Open a new session (clock-in). Returns the created punch_ledger row.
 */
export async function openSession(params: OpenSessionParams): Promise<PunchLedgerEntry> {
  const now = new Date();
  const effectiveClockIn = params.clockIn ?? now;
  // Derive chargeCode snapshot from FK — never accept free-text from caller
  const chargeCode = await deriveChargeCodeSnapshot(params.chargeCodeId);
  const resolvedApprovalStatus = defaultApprovalStatus(params.source, params.approvalStatus);
  assertTravelerNotAuto(params.source, resolvedApprovalStatus, 'openSession');
  const [entry] = await db
    .insert(punchLedger)
    .values({
      employeeId: params.employeeId,
      clockIn: effectiveClockIn,
      clockOut: null,
      source: params.source,
      laborClass: params.laborClass ?? 'REGULAR',
      travelerId: params.travelerId ?? null,
      productionWorkOrderId: params.productionWorkOrderId ?? null,
      chargeCodeId: params.chargeCodeId ?? null,
      chargeCode,
      department: params.department ?? null,
      operation: params.operation ?? null,
      projectId: params.projectId ?? null,
      travelerStepId: params.travelerStepId ?? null,
      certificationStatus: params.certificationStatus ?? null,
      isOverrun: params.isOverrun ?? false,
      overrunReason: params.overrunReason ?? null,
      overrideReason: params.overrideReason ?? null,
      approvalStatus: resolvedApprovalStatus,
      laborApprovalId: params.laborApprovalId ?? null,
      laborBudgetOverrideId: params.laborBudgetOverrideId ?? null,
      createdBy: params.createdBy ?? null,
      createdByDisplayName: params.createdByDisplayName ?? null,
      isEdited: false,
      updatedAt: now,
    } satisfies Omit<InsertPunchLedger, 'id' | 'createdAt'>)
    .returning();

  // Dual-write: mirror to labor_allocations (LIVE source).
  // Awaited so subsequent close/switch writes always see the inserted row.
  // Failures are non-fatal — punch_ledger remains the source of truth.
  if (laborAllocationsEnabled) {
    try {
      await openAllocation(entry);
    } catch (err: unknown) {
      console.warn('[punchLedger] labor_allocations dual-write (open) failed:', (err as Error)?.message ?? err);
    }
  }

  return entry;
}

/**
 * Create a closed historical session from an external timekeeping source.
 * This is intentionally separate from openSession/closeSession so imports can
 * preserve the original clock-out timestamp instead of closing at "now".
 */
export async function createClosedHistoricalSession(
  params: CreateClosedHistoricalSessionParams,
): Promise<PunchLedgerEntry> {
  if (params.clockOut <= params.clockIn) {
    throw Object.assign(new Error('clockOut must be after clockIn'), { code: 'INVALID_HISTORICAL_SESSION' });
  }

  const now = new Date();
  const chargeCode = await deriveChargeCodeSnapshot(params.chargeCodeId);
  const resolvedApprovalStatus = defaultApprovalStatus(params.source, params.approvalStatus);
  assertTravelerNotAuto(params.source, resolvedApprovalStatus, 'createClosedHistoricalSession');

  const [entry] = await db
    .insert(punchLedger)
    .values({
      employeeId: params.employeeId,
      clockIn: params.clockIn,
      clockOut: params.clockOut,
      source: params.source,
      laborClass: params.laborClass ?? 'REGULAR',
      travelerId: params.travelerId ?? null,
      productionWorkOrderId: params.productionWorkOrderId ?? null,
      chargeCodeId: params.chargeCodeId ?? null,
      chargeCode,
      department: params.department ?? null,
      operation: params.operation ?? null,
      projectId: params.projectId ?? null,
      travelerStepId: params.travelerStepId ?? null,
      certificationStatus: params.certificationStatus ?? null,
      isOverrun: params.isOverrun ?? false,
      overrunReason: params.overrunReason ?? null,
      overrideReason: params.overrideReason ?? null,
      approvalStatus: resolvedApprovalStatus,
      laborApprovalId: params.laborApprovalId ?? null,
      laborBudgetOverrideId: params.laborBudgetOverrideId ?? null,
      createdBy: params.createdBy ?? null,
      createdByDisplayName: params.createdByDisplayName ?? null,
      updatedBy: params.createdBy ?? null,
      updatedByDisplayName: params.createdByDisplayName ?? null,
      isEdited: false,
      editNote: params.editNote,
      updatedAt: now,
    } satisfies Omit<InsertPunchLedger, 'id' | 'createdAt'>)
    .returning();

  if (laborAllocationsEnabled) {
    try {
      await openAllocation(entry);
      await closeAllocation(entry);
    } catch (err: unknown) {
      console.warn('[punchLedger] labor_allocations dual-write (historical) failed:', (err as Error)?.message ?? err);
    }
  }

  return entry;
}

/**
 * Close an open session (clock-out). Resolves the open row by employeeId.
 * Returns the closed row, or null if no open session was found.
 */
export async function closeSession(
  employeeId: number,
  updatedBy?: number | null,
  updatedByDisplayName?: string | null,
  clockOut?: Date | null,
): Promise<PunchLedgerEntry | null> {
  const open = await getOpenSession(employeeId);
  if (!open) return null;

  const now = new Date();
  const effectiveClockOut = clockOut ?? now;
  if (effectiveClockOut <= open.clockIn) {
    throw Object.assign(
      new Error(`Clock-out time (${effectiveClockOut.toISOString()}) must be after the session's clock-in (${open.clockIn.toISOString()}).`),
      { code: 'INVALID_CLOCK_OUT' },
    );
  }

  const [closed] = await db
    .update(punchLedger)
    .set({
      clockOut: effectiveClockOut,
      updatedBy: updatedBy ?? null,
      updatedByDisplayName: updatedByDisplayName ?? null,
      updatedAt: now,
    })
    .where(eq(punchLedger.id, open.id))
    .returning();

  // Dual-write: close the matching labor_allocations row.
  // Awaited to preserve ordering (open must commit before this update runs).
  if (closed && laborAllocationsEnabled) {
    try {
      await closeAllocation(closed);
    } catch (err: unknown) {
      console.warn('[punchLedger] labor_allocations dual-write (close) failed:', (err as Error)?.message ?? err);
    }
  }

  return closed ?? null;
}

/**
 * Close a specific open session by its ID. Used when the caller already has the entry.
 */
export async function closeSessionById(
  entryId: number,
  updatedBy?: number | null,
  updatedByDisplayName?: string | null,
  clockOut?: Date | null,
): Promise<PunchLedgerEntry | null> {
  const now = new Date();
  const effectiveClockOut = clockOut ?? now;
  const [closed] = await db
    .update(punchLedger)
    .set({
      clockOut: effectiveClockOut,
      updatedBy: updatedBy ?? null,
      updatedByDisplayName: updatedByDisplayName ?? null,
      updatedAt: now,
    })
    .where(eq(punchLedger.id, entryId))
    .returning();

  // Dual-write: close the matching labor_allocations row.
  // Awaited to preserve ordering (open must commit before this update runs).
  if (closed && laborAllocationsEnabled) {
    try {
      await closeAllocation(closed);
    } catch (err: unknown) {
      console.warn('[punchLedger] labor_allocations dual-write (closeById) failed:', (err as Error)?.message ?? err);
    }
  }

  return closed ?? null;
}

/**
 * Switch labor assignment on the current open session IN PLACE.
 * Updates travelerId / chargeCode without closing the session.
 * This is the "unified rule" for traveler scan when already clocked in:
 *   operator stays clocked in but labor now charges to the new traveler/code.
 */
export async function switchAssignment(params: SwitchAssignmentParams): Promise<PunchLedgerEntry | null> {
  const now = new Date();
  // Derive chargeCode snapshot from FK — never store free-text from caller
  const chargeCode = await deriveChargeCodeSnapshot(params.chargeCodeId);
  // switchAssignment always sets source = 'TRAVELER', so the resolved approvalStatus
  // must satisfy the §5.2 traveler-AUTO prohibition.
  const resolvedApprovalStatus = params.approvalStatus ?? 'PENDING_APPROVAL';
  assertTravelerNotAuto('TRAVELER', resolvedApprovalStatus, 'switchAssignment');
  const [updated] = await db
    .update(punchLedger)
    .set({
      travelerId: params.travelerId ?? null,
      productionWorkOrderId: params.productionWorkOrderId ?? null,
      chargeCodeId: params.chargeCodeId ?? null,
      chargeCode,
      department: params.department ?? null,
      operation: params.operation ?? null,
      approvalStatus: resolvedApprovalStatus,
      laborApprovalId: params.laborApprovalId ?? null,
      laborBudgetOverrideId: params.laborBudgetOverrideId ?? null,
      updatedBy: params.updatedBy ?? null,
      updatedByDisplayName: params.updatedByDisplayName ?? null,
      source: 'TRAVELER',
      updatedAt: now,
    })
    .where(eq(punchLedger.id, params.entryId))
    .returning();

  // Note: labor_allocations segmentation (close + reopen) for job/traveler switches
  // is handled directly by the callers (travelers.ts, timeClock.ts) via
  // allocationService.switchAllocation(entry, newAssignment) — Phase D.

  return updated ?? null;
}

/**
 * Get the most recent open (clock_out IS NULL) session for an employee.
 * Returns null when the employee is not clocked in.
 */
export async function getOpenSession(employeeId: number): Promise<PunchLedgerEntry | null> {
  const [row] = await db
    .select()
    .from(punchLedger)
    .where(
      and(
        eq(punchLedger.employeeId, employeeId),
        isNull(punchLedger.clockOut)
      )
    )
    .orderBy(desc(punchLedger.clockIn))
    .limit(1);
  return row ?? null;
}

/**
 * List sessions for an employee, optionally filtered by date range.
 */
export async function listSessions(params: ListSessionsParams): Promise<PunchLedgerEntry[]> {
  const conditions: SQL<unknown>[] = [];

  if (params.employeeId != null) {
    conditions.push(eq(punchLedger.employeeId, params.employeeId));
  }
  if (params.openOnly) {
    conditions.push(isNull(punchLedger.clockOut));
  }
  if (params.includeOverlapping && (params.from || params.to)) {
    if (params.to) {
      conditions.push(lte(punchLedger.clockIn, params.to));
    }
    if (params.from) {
      conditions.push(or(gte(punchLedger.clockOut, params.from), isNull(punchLedger.clockOut))!);
    }
  } else {
    if (params.from) {
      conditions.push(gte(punchLedger.clockIn, params.from));
    }
    if (params.to) {
      conditions.push(lte(punchLedger.clockIn, params.to));
    }
  }

  return db
    .select()
    .from(punchLedger)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(punchLedger.clockIn))
    .limit(params.limit ?? 200)
    .offset(params.offset ?? 0);
}

/**
 * Derive the attendance status of an employee from their most recent open session.
 *
 * Status rules:
 *   - No open session → 'clocked_out'
 *   - Open session with laborClass 'BREAK' → 'on_break'
 *   - Open session with laborClass 'REGULAR' → 'clocked_in'
 */
export function deriveStatus(openSession: PunchLedgerEntry | null): LedgerStatus {
  if (!openSession) return 'clocked_out';
  if (openSession.laborClass === 'BREAK') return 'on_break';
  return 'clocked_in';
}

/**
 * Compute hours elapsed for an open session as of now, or total closed hours.
 */
export function computeHours(entry: PunchLedgerEntry): number {
  const end = entry.clockOut ? new Date(entry.clockOut) : new Date();
  const start = new Date(entry.clockIn);
  return (end.getTime() - start.getTime()) / 3_600_000;
}

/**
 * Compute total hours worked today for an employee from punch_ledger.
 */
export async function computeHoursToday(employeeId: number, timezone: string = 'UTC'): Promise<number> {
  // Derive today's date boundaries in the employee's timezone
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  const startOfDay = new Date(`${todayStr}T00:00:00`);
  const endOfDay = new Date(`${todayStr}T23:59:59.999`);

  const sessions = await db
    .select()
    .from(punchLedger)
    .where(
      and(
        eq(punchLedger.employeeId, employeeId),
        gte(punchLedger.clockIn, startOfDay),
        lte(punchLedger.clockIn, endOfDay)
      )
    );

  let total = 0;
  for (const s of sessions) {
    if (s.laborClass === 'BREAK') continue; // Exclude break sessions from work hours
    const end = s.clockOut ? new Date(s.clockOut) : now;
    const start = new Date(s.clockIn);
    total += (end.getTime() - start.getTime()) / 3_600_000;
  }
  return Math.max(0, total);
}

/**
 * Resolve an employee's numeric public.employees.id from a string that may be:
 * - A numeric string ("42")
 * - An employee code (text)
 * - A badge scan code (text)
 * Returns null if no match found.
 */
export async function resolveEmployeeId(rawId: string): Promise<number | null> {
  const trimmed = rawId.trim();
  const isNumeric = /^\d+$/.test(trimmed);

  if (isNumeric) {
    const num = parseInt(trimmed, 10);
    const [row] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, num))
      .limit(1);
    if (row) return row.id;
  }

  // Try employee code
  const [byCode] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.employeeCode, trimmed))
    .limit(1);
  if (byCode) return byCode.id;

  // Try badge scan code — normalize dashes so UUID badges resolve with or without hyphens
  const normalizedBadge = trimmed.replace(/-/g, '');
  const [byBadge] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${normalizedBadge}`)
    .limit(1);
  if (byBadge) return byBadge.id;

  return null;
}

/**
 * Resolve chargeCodeId from a charge code string.
 * Returns null when the code is blank/null (uncodified labor is permitted).
 * Returns -1 when the code is unknown or inactive (caller should validate).
 */
export async function resolveChargeCodeId(code: string | null | undefined): Promise<number | null> {
  if (!code || !code.trim()) return null;
  const [row] = await db
    .select({ id: chargeCodes.id })
    .from(chargeCodes)
    .where(and(eq(chargeCodes.code, code.trim()), eq(chargeCodes.active, true)))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Atomic open-or-switch for traveler scan:
 *   - If no open session → openSession (clock in)
 *   - If open session exists → switchAssignment on the same row (no close)
 *
 * Returns { action: 'opened' | 'switched', entry }
 */
export async function openOrSwitchForTraveler(params: {
  employeeId: number;
  travelerId: string | null;
  productionWorkOrderId: string | null;
  chargeCodeId: number | null;
  department: string | null;
  operation: string | null;
  approvalStatus?: string;
  laborApprovalId?: number | null;
  laborBudgetOverrideId?: number | null;
  actorEmployeeId?: number | null;
  actorDisplayName?: string | null;
}): Promise<{ action: 'opened' | 'switched'; entry: PunchLedgerEntry }> {
  const existing = await getOpenSession(params.employeeId);

  if (existing) {
    const switched = await switchAssignment({
      entryId: existing.id,
      travelerId: params.travelerId,
      productionWorkOrderId: params.productionWorkOrderId,
      chargeCodeId: params.chargeCodeId,
      department: params.department,
      operation: params.operation,
      approvalStatus: params.approvalStatus ?? 'PENDING_APPROVAL',
      laborApprovalId: params.laborApprovalId ?? null,
      laborBudgetOverrideId: params.laborBudgetOverrideId ?? null,
      updatedBy: params.actorEmployeeId ?? null,
      updatedByDisplayName: params.actorDisplayName ?? null,
    });
    return { action: 'switched', entry: switched! };
  }

  const opened = await openSession({
    employeeId: params.employeeId,
    source: 'TRAVELER',
    laborClass: 'REGULAR',
    travelerId: params.travelerId,
    productionWorkOrderId: params.productionWorkOrderId,
    chargeCodeId: params.chargeCodeId,
    department: params.department,
    operation: params.operation,
    approvalStatus: params.approvalStatus ?? 'PENDING_APPROVAL',
    laborApprovalId: params.laborApprovalId ?? null,
    laborBudgetOverrideId: params.laborBudgetOverrideId ?? null,
    createdBy: params.actorEmployeeId ?? null,
    createdByDisplayName: params.actorDisplayName ?? null,
  });
  return { action: 'opened', entry: opened };
}
