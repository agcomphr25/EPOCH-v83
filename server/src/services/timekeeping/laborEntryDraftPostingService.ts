/**
 * laborEntryDraftPostingService — Phase 4
 *
 * Atomically posts a CONFIRMED labor_entry_draft to punch_ledger + labor_allocations.
 *
 * Architecture (Option A — one synthetic punch_ledger row per employee per day):
 *   - One punch_ledger row: source='SALARIED_ENTRY', clock_in = entry_date 08:00 UTC,
 *     clock_out = clock_in + total_hours, labor_class='REGULAR'.
 *   - One labor_allocations row per segment: source='SALARIED_ENTRY', status='CLOSED',
 *     allocation_start/end derived from entry_date + segment HH:MM times.
 *     labor_class is derived per-segment from laborCategory via mapLaborCategoryToClass
 *     (DIRECT→REGULAR, INDIRECT/ADMIN/etc.→INDIRECT, PTO→PTO).
 *   - Draft updated to status='POSTED', posted_at=now.
 *   - Audit record written to timekeeping.salaried_timesheet_audit.
 *
 * Idempotency:
 *   - If draft is already POSTED, returns AlreadyPostedGuard with the existing
 *     punch_ledger_id recovered from the audit trail.
 *   - No inserts are ever performed for an already-posted draft.
 *
 * Race-condition safety:
 *   - Inside the transaction the draft row is locked with SELECT … FOR UPDATE.
 *     Concurrent post attempts will queue behind the lock and then observe the
 *     POSTED status written by the winner, returning AlreadyPostedGuard instead
 *     of inserting duplicate records.
 *
 * All reads inside the DB transaction use the `tx` handle to stay within the
 * transaction scope and avoid snapshot-isolation inconsistencies.
 */

import { db } from "../../../db";
import { sql } from "drizzle-orm";
import { punchLedger, laborAllocations, users, chargeCodes } from "../../../schema";
import {
  laborEntryDraftsTable,
  employeesTable,
  indirectCodesTable,
  salariedTimesheetAuditTable,
} from "../../schema/timekeeping";
import { eq, and } from "drizzle-orm";
import { findPayrollApprovedSalariedTimesheetForPunch } from "./timesheets.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostingResult {
  punchLedgerId: number;
  allocationIds: number[];
  draftId: number;
  status: "POSTED";
}

export interface AlreadyPostedGuard {
  alreadyPosted: true;
  /** The punch_ledger id created when this draft was originally posted. */
  punchLedgerId: number | null;
  draftId: number;
  message: string;
}

/** Segment shape stored in parsedSegmentsJson */
interface DraftSegment {
  id?: string;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  chargeCodeId?: number | null;
  indirectCodeId?: number | null;
  notes?: string | null;
  laborCategory?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse "HH:MM" into total minutes from midnight.
 */
function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Combine an ISO date string ("YYYY-MM-DD") with an "HH:MM" time string
 * into a UTC Date object.
 */
function toUtcTimestamp(dateStr: string, timeStr: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = timeStr.split(":").map(Number);
  return new Date(Date.UTC(y!, mo! - 1, d!, h!, m!, 0, 0));
}

/**
 * Compute segment duration in hours from HH:MM start/end strings.
 * Returns ≤0 if end ≤ start (invalid).
 */
function segmentDurationHours(seg: DraftSegment): number {
  return (parseTimeToMinutes(seg.endTime) - parseTimeToMinutes(seg.startTime)) / 60;
}

/**
 * Map a segment's laborCategory string to the canonical labor_class value
 * stored in labor_allocations.
 *
 * - DIRECT                                                          → REGULAR
 * - INDIRECT / ADMIN / G&A / MEETING / TRAINING / MAINTENANCE /
 *   QUOTING / CUSTOMER_SERVICE / VENDOR_MANAGEMENT                  → INDIRECT
 * - PTO                                                             → PTO
 * - any unrecognised value                                          → REGULAR (safe default)
 */
function mapLaborCategoryToClass(laborCategory: string): string {
  const upper = laborCategory.toUpperCase();
  if (upper === "PTO") return "PTO";
  const indirectCategories = new Set([
    "INDIRECT", "ADMIN", "G&A", "MEETING", "TRAINING",
    "MAINTENANCE", "QUOTING", "CUSTOMER_SERVICE", "VENDOR_MANAGEMENT",
  ]);
  if (indirectCategories.has(upper)) return "INDIRECT";
  return "REGULAR";
}

/**
 * Resolve the effective chargeCodeId for a segment inside a transaction.
 * - If chargeCodeId is set directly, verify it exists in charge_codes table.
 * - If indirectCodeId is set, look up the mapped chargeCodeId from indirect_codes.
 * - Throws 422 if the resolved code cannot be found (data changed after confirm).
 */
async function resolveAndVerifyChargeCodeInTx(
  seg: DraftSegment,
  segIdx: number,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<number> {
  let resolvedChargeCodeId: number | null = null;

  if (seg.chargeCodeId) {
    // Verify the direct charge code exists
    const [cc] = await tx
      .select({ id: chargeCodes.id })
      .from(chargeCodes)
      .where(eq(chargeCodes.id, seg.chargeCodeId))
      .limit(1);
    if (!cc) {
      throw Object.assign(
        new Error(
          `Segment ${segIdx + 1}: charge code id=${seg.chargeCodeId} no longer exists. ` +
          "Re-confirm the draft with valid charge codes before posting.",
        ),
        { statusCode: 422 },
      );
    }
    resolvedChargeCodeId = cc.id;
  } else if (seg.indirectCodeId) {
    // Resolve via indirect_codes → chargeCodeId
    const [ic] = await tx
      .select({ chargeCodeId: indirectCodesTable.chargeCodeId })
      .from(indirectCodesTable)
      .where(eq(indirectCodesTable.id, seg.indirectCodeId))
      .limit(1);
    if (!ic || ic.chargeCodeId == null) {
      throw Object.assign(
        new Error(
          `Segment ${segIdx + 1}: indirect code id=${seg.indirectCodeId} does not map to a valid charge code. ` +
          "Re-confirm the draft with valid indirect codes before posting.",
        ),
        { statusCode: 422 },
      );
    }
    resolvedChargeCodeId = ic.chargeCodeId;
  }

  if (resolvedChargeCodeId == null) {
    throw Object.assign(
      new Error(
        `Segment ${segIdx + 1} (${seg.startTime}–${seg.endTime}): a charge code or indirect code is required.`,
      ),
      { statusCode: 422 },
    );
  }

  return resolvedChargeCodeId;
}

/**
 * Attempt to recover the existing punch_ledger_id for a previously-posted draft
 * by querying the audit trail.  Returns null if the record is missing.
 */
async function recoverPostedPunchLedgerId(draftId: number): Promise<number | null> {
  const [auditRow] = await db
    .select({ afterState: salariedTimesheetAuditTable.afterState })
    .from(salariedTimesheetAuditTable)
    .where(
      and(
        eq(salariedTimesheetAuditTable.timesheetId, draftId),
        eq(salariedTimesheetAuditTable.action, "SYNTHETIC_SESSION_POSTED"),
      ),
    )
    .limit(1);

  if (!auditRow) return null;
  const afterState = auditRow.afterState as Record<string, unknown> | null;
  const id = afterState?.punchLedgerId;
  return typeof id === "number" ? id : null;
}

// ---------------------------------------------------------------------------
// Re-validation helpers
// ---------------------------------------------------------------------------

/**
 * Re-run posting validation rules on the segments.
 * Throws a 422 error describing all found problems.
 *
 * Rules:
 *   1. Each segment must have a valid startTime < endTime (duration > 0).
 *   2. Each segment must have exactly one of chargeCodeId or indirectCodeId set.
 *   3. Segments must not overlap (sorted by startTime, no consecutive overlap).
 *   4. Sum of segment durations must equal draft.totalHours (within 1-minute tolerance).
 *
 * Note: charge code and indirect code *existence* is verified later inside the
 * transaction via resolveAndVerifyChargeCodeInTx().
 */
function reValidateSegments(segments: DraftSegment[], totalHours: number, draftId: number): void {
  const errors: string[] = [];

  // Rule 1 + 2: per-segment checks
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const dur = segmentDurationHours(seg);
    if (dur <= 0) {
      errors.push(
        `Segment ${i + 1} (${seg.startTime}–${seg.endTime}): endTime must be after startTime.`,
      );
    }
    const hasCharge = Boolean(seg.chargeCodeId);
    const hasIndirect = Boolean(seg.indirectCodeId);
    if (!hasCharge && !hasIndirect) {
      errors.push(
        `Segment ${i + 1} (${seg.startTime}–${seg.endTime}): a charge code or indirect code is required.`,
      );
    }
    if (hasCharge && hasIndirect) {
      errors.push(
        `Segment ${i + 1} (${seg.startTime}–${seg.endTime}): specify either a charge code or an indirect code, not both.`,
      );
    }
  }

  // Rule 3: overlap check (sort a copy by startTime, check consecutive)
  const sorted = [...segments].sort(
    (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime),
  );
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i]!;
    const next = sorted[i + 1]!;
    if (parseTimeToMinutes(curr.endTime) > parseTimeToMinutes(next.startTime)) {
      errors.push(
        `Segment overlap: ${curr.startTime}–${curr.endTime} overlaps with ${next.startTime}–${next.endTime}.`,
      );
    }
  }

  // Rule 4: total duration consistency (allow ±1 minute tolerance for rounding)
  const sumHours = segments.reduce((s, seg) => s + segmentDurationHours(seg), 0);
  const diff = Math.abs(sumHours - totalHours);
  if (diff > 1 / 60) {
    errors.push(
      `Total segment duration (${sumHours.toFixed(4)}h) does not match draft total hours (${totalHours.toFixed(4)}h). ` +
      "Re-save and re-confirm the draft before posting.",
    );
  }

  if (errors.length > 0) {
    throw Object.assign(
      new Error(
        `Draft ${draftId} failed re-validation before posting:\n` +
        errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n"),
      ),
      { statusCode: 422, validationErrors: errors },
    );
  }
}

// ---------------------------------------------------------------------------
// Core posting service
// ---------------------------------------------------------------------------

/**
 * Post a CONFIRMED labor_entry_draft.
 *
 * @param draftId         timekeeping.labor_entry_drafts.id
 * @param postedByUserId  public.users.id of the admin/payroll user triggering posting
 * @returns PostingResult on success, AlreadyPostedGuard if already posted
 * @throws Error if the draft is not found, not CONFIRMED, or fails re-validation
 */
export async function postLaborEntryDraft(
  draftId: number,
  postedByUserId: number,
): Promise<PostingResult | AlreadyPostedGuard> {
  // ── 1. Pre-flight load (outside transaction) for fast idempotency path ───
  // This avoids an unnecessary transaction start when the draft is already POSTED.
  const [preflight] = await db
    .select({
      status: laborEntryDraftsTable.status,
      employeeId: laborEntryDraftsTable.employeeId,
      entryDate: laborEntryDraftsTable.entryDate,
    })
    .from(laborEntryDraftsTable)
    .where(eq(laborEntryDraftsTable.id, draftId))
    .limit(1);

  if (!preflight) {
    throw Object.assign(new Error(`Labor entry draft ${draftId} not found.`), {
      statusCode: 404,
    });
  }

  if (preflight.status === "POSTED") {
    const existingPunchLedgerId = await recoverPostedPunchLedgerId(draftId);
    return {
      alreadyPosted: true,
      punchLedgerId: existingPunchLedgerId,
      draftId,
      message:
        `Draft ${draftId} is already in POSTED status` +
        (existingPunchLedgerId != null ? ` (punch_ledger_id=${existingPunchLedgerId})` : "") +
        ".",
    };
  }

  if (preflight.status !== "CONFIRMED") {
    throw Object.assign(
      new Error(
        `Draft ${draftId} cannot be posted: expected status CONFIRMED but got ${preflight.status}.`,
      ),
      { statusCode: 422 },
    );
  }

  // ── 1b. Payroll-approved period guard (before transaction starts) ────────
  // Resolve the timekeeping employee → public employee id, then check whether
  // the entry date falls inside a PAYROLL_APPROVED salaried timesheet period.
  {
    const [tkEmpPreflight] = await db
      .select({ epochEmployeeId: employeesTable.epochEmployeeId })
      .from(employeesTable)
      .where(eq(employeesTable.id, preflight.employeeId))
      .limit(1);

    if (tkEmpPreflight?.epochEmployeeId != null) {
      const lockedSheet = await findPayrollApprovedSalariedTimesheetForPunch(
        tkEmpPreflight.epochEmployeeId,
        preflight.entryDate as string,
      );
      if (lockedSheet) {
        await db.insert(salariedTimesheetAuditTable).values({
          timesheetId: lockedSheet.id,
          lineId: null,
          action: "POST_BLOCKED_PAYROLL_APPROVED",
          actorId: postedByUserId,
          actorName: null,
          actorRole: null,
          beforeState: null,
          afterState: { draftId, entryDate: preflight.entryDate },
          reason: `Labor entry draft ${draftId} post blocked: timesheet PAYROLL_APPROVED`,
          source: "SALARIED_ENTRY",
          ipAddress: null,
        });
        throw Object.assign(
          new Error(
            `[DCAA TK-003] Draft ${draftId} entry date (${preflight.entryDate}) falls within ` +
            `PAYROLL_APPROVED salaried timesheet #${lockedSheet.id} ` +
            `(${lockedSheet.periodStart}–${lockedSheet.periodEnd}). ` +
            `Submit a correction request via the Corrections workflow for timesheet #${lockedSheet.id}.`,
          ),
          { statusCode: 409 },
        );
      }
    }
  }

  // ── 2. Execute entire posting operation inside a transaction ────────────
  // SELECT FOR UPDATE locks the draft row at the start of the transaction so
  // concurrent posting attempts queue behind this lock and cannot both observe
  // CONFIRMED status simultaneously.
  return db.transaction(async (tx) => {
    // 2a. Lock the draft row and re-read the full record atomically
    await tx.execute(
      sql`SELECT id FROM timekeeping.labor_entry_drafts WHERE id = ${draftId} FOR UPDATE`,
    );

    const [draft] = await tx
      .select()
      .from(laborEntryDraftsTable)
      .where(eq(laborEntryDraftsTable.id, draftId))
      .limit(1);

    // Re-check status inside the transaction after acquiring the lock.
    // A concurrent posting request will have flipped status to POSTED before
    // we get here; return the guard rather than inserting duplicates.
    if (!draft) {
      throw Object.assign(new Error(`Labor entry draft ${draftId} not found.`), {
        statusCode: 404,
      });
    }

    if (draft.status === "POSTED") {
      // Recover the punch_ledger_id from the audit (written by the concurrent winner)
      const [auditRow] = await tx
        .select({ afterState: salariedTimesheetAuditTable.afterState })
        .from(salariedTimesheetAuditTable)
        .where(
          and(
            eq(salariedTimesheetAuditTable.timesheetId, draftId),
            eq(salariedTimesheetAuditTable.action, "SYNTHETIC_SESSION_POSTED"),
          ),
        )
        .limit(1);
      const afterState = auditRow?.afterState as Record<string, unknown> | null;
      const existingId = typeof afterState?.punchLedgerId === "number"
        ? afterState.punchLedgerId
        : null;
      return {
        alreadyPosted: true,
        punchLedgerId: existingId,
        draftId,
        message:
          `Draft ${draftId} is already in POSTED status` +
          (existingId != null ? ` (punch_ledger_id=${existingId})` : "") +
          ".",
      } as AlreadyPostedGuard;
    }

    if (draft.status !== "CONFIRMED") {
      throw Object.assign(
        new Error(
          `Draft ${draftId} cannot be posted: expected status CONFIRMED but got ${draft.status}.`,
        ),
        { statusCode: 422 },
      );
    }

    // 2b. Parse segments and validate (structure, overlap, duration)
    const segments = (draft.parsedSegmentsJson ?? []) as DraftSegment[];

    if (segments.length === 0) {
      throw Object.assign(
        new Error(`Draft ${draftId} has no segments. Cannot post.`),
        { statusCode: 422 },
      );
    }

    const entryDate = draft.entryDate as string;
    const totalHours = Number(draft.totalHours ?? 0);

    if (totalHours <= 0) {
      throw Object.assign(
        new Error(`Draft ${draftId} has zero total hours. Cannot post.`),
        { statusCode: 422 },
      );
    }

    // Re-run structural validation
    reValidateSegments(segments, totalHours, draftId);

    // 2c. Resolve timekeeping employee → public employees.id (via tx)
    const [tkEmp] = await tx
      .select({ epochEmployeeId: employeesTable.epochEmployeeId })
      .from(employeesTable)
      .where(eq(employeesTable.id, draft.employeeId))
      .limit(1);

    if (!tkEmp || tkEmp.epochEmployeeId == null) {
      throw Object.assign(
        new Error(
          `Draft ${draftId}: timekeeping employee ${draft.employeeId} has no linked public employee record.`,
        ),
        { statusCode: 422 },
      );
    }

    const publicEmployeeId = tkEmp.epochEmployeeId;

    // 2d. Resolve posting user's employee ID for DCAA audit fields (via tx)
    const [poster] = await tx
      .select({ employeeId: users.employeeId })
      .from(users)
      .where(eq(users.id, postedByUserId))
      .limit(1);

    const posterEmployeeId: number | null = poster?.employeeId ?? null;

    // 2e. Compute punch_ledger clock_in / clock_out
    const [y, mo, d] = entryDate.split("-").map(Number);
    const clockIn = new Date(Date.UTC(y!, mo! - 1, d!, 8, 0, 0, 0));
    const clockOut = new Date(clockIn.getTime() + totalHours * 3_600_000);

    // 2f. Insert the synthetic punch_ledger row
    const [punchRow] = await tx
      .insert(punchLedger)
      .values({
        employeeId: publicEmployeeId,
        clockIn,
        clockOut,
        source: "SALARIED_ENTRY",
        laborClass: "REGULAR",
        travelerId: null,
        productionWorkOrderId: null,
        chargeCodeId: null,
        chargeCode: null,
        department: null,
        operation: null,
        projectId: null,
        travelerStepId: null,
        certificationStatus: null,
        isOverrun: false,
        overrunReason: null,
        overrideReason: null,
        approvalStatus: "AUTO",
        laborApprovalId: null,
        laborBudgetOverrideId: null,
        createdBy: posterEmployeeId,
        createdByDisplayName: null,
        isEdited: false,
        updatedAt: new Date(),
      })
      .returning({ id: punchLedger.id });

    const punchLedgerId = punchRow!.id;

    // 2g. Insert one labor_allocations row per segment.
    // Charge code existence is verified inside tx via resolveAndVerifyChargeCodeInTx.
    const allocationIds: number[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const sequenceOrder = i + 1;

      const allocationStart = toUtcTimestamp(entryDate, seg.startTime);
      const allocationEnd = toUtcTimestamp(entryDate, seg.endTime);

      // Resolve and verify the charge code atomically (throws 422 if not found)
      const chargeCodeId = await resolveAndVerifyChargeCodeInTx(seg, i, tx);

      const [allocRow] = await tx
        .insert(laborAllocations)
        .values({
          punchLedgerId,
          employeeId: publicEmployeeId,
          allocationStart,
          allocationEnd,
          chargeCodeId,
          travelerId: null,
          travelerStepId: null,
          productionWorkOrderId: null,
          projectId: null,
          department: null,
          operation: null,
          laborClass: mapLaborCategoryToClass(seg.laborCategory ?? "DIRECT"),
          status: "CLOSED",
          certificationStatus: null,
          isOverrun: false,
          overrunReason: null,
          laborApprovalId: null,
          laborBudgetOverrideId: null,
          amendsAllocationId: null,
          source: "SALARIED_ENTRY",
          sequenceOrder,
          createdBy: posterEmployeeId,
          createdByDisplayName: null,
          isEdited: false,
          editNote: null,
          updatedAt: new Date(),
        })
        .returning({ id: laborAllocations.id });

      allocationIds.push(allocRow!.id);
    }

    // 2h. Mark the draft as POSTED
    const postedAt = new Date();
    await tx
      .update(laborEntryDraftsTable)
      .set({
        status: "POSTED",
        postedAt,
        reviewedBy: postedByUserId,
        reviewedAt: postedAt,
      })
      .where(eq(laborEntryDraftsTable.id, draftId));

    // 2i. Write an audit record to salaried_timesheet_audit.
    // timesheetId column holds the draft ID for Phase 4 traceability.
    // afterState.punchLedgerId is the canonical field for idempotency recovery.
    await tx.insert(salariedTimesheetAuditTable).values({
      timesheetId: draftId,
      lineId: null,
      action: "SYNTHETIC_SESSION_POSTED",
      actorId: postedByUserId,
      actorName: null,
      actorRole: null,
      beforeState: null,
      afterState: {
        draftId,
        punchLedgerId,
        allocationIds,
        publicEmployeeId,
        entryDate,
        totalHours,
        segmentCount: segments.length,
        source: "SALARIED_ENTRY",
      },
      reason: `Labor entry draft ${draftId} confirmed and posted as synthetic punch session.`,
      source: "SALARIED_ENTRY",
      ipAddress: null,
    });

    console.log(
      "[laborEntryDraftPostingService] [draft_posted] draft_id=%d punch_ledger_id=%d " +
      "employee_id=%d entry_date=%s total_hours=%s allocation_count=%d",
      draftId,
      punchLedgerId,
      publicEmployeeId,
      entryDate,
      totalHours.toFixed(4),
      allocationIds.length,
    );

    return {
      punchLedgerId,
      allocationIds,
      draftId,
      status: "POSTED" as const,
    };
  });
}

// ---------------------------------------------------------------------------
// Reconciliation: verify every POSTED draft has matching CLOSED allocations
// ---------------------------------------------------------------------------

export interface ReconcileSalariedDraftsResult {
  ok: boolean;
  year: number;
  month: number;
  totalPostedDrafts: number;
  orphanedDraftIds: number[];
  report: {
    draftId: number;
    employeeId: number;
    entryDate: string;
    punchLedgerId: number | null;
    closedAllocationCount: number;
    status: "ok" | "orphaned";
  }[];
}

/**
 * Verifies that every POSTED labor_entry_draft for the given period has at least
 * one matching CLOSED labor_allocation.  Orphaned drafts (posted but allocations
 * missing) indicate data integrity issues that must be resolved before GL posting.
 *
 * Uses the salaried_timesheet_audit trail to recover the punch_ledger_id that was
 * created during draft posting, then checks labor_allocations for CLOSED rows
 * tied to that punch.
 */
export async function reconcileSalariedDrafts(
  year: number,
  month: number,
): Promise<ReconcileSalariedDraftsResult> {
  // 1. Find all POSTED drafts for the period
  const postedDraftsResult = await db.execute(sql`
    SELECT
      ld.id             AS "draftId",
      ld.employee_id    AS "employeeId",
      ld.entry_date     AS "entryDate"
    FROM timekeeping.labor_entry_drafts ld
    WHERE ld.status = 'POSTED'
      AND EXTRACT(YEAR  FROM ld.entry_date) = ${year}
      AND EXTRACT(MONTH FROM ld.entry_date) = ${month}
    ORDER BY ld.id
  `);

  const postedDrafts = postedDraftsResult.rows as {
    draftId: number;
    employeeId: number;
    entryDate: string;
  }[];

  if (postedDrafts.length === 0) {
    return {
      ok: true,
      year,
      month,
      totalPostedDrafts: 0,
      orphanedDraftIds: [],
      report: [],
    };
  }

  // 2. For each posted draft, recover the punchLedgerId from audit trail and
  //    count how many CLOSED allocations are attached.
  const draftIds = postedDrafts.map((d) => d.draftId);

  const auditResult = await db.execute(sql`
    SELECT
      (sta.after_state->>'draftId')::int        AS "draftId",
      (sta.after_state->>'punchLedgerId')::int  AS "punchLedgerId"
    FROM timekeeping.salaried_timesheet_audit sta
    WHERE sta.action = 'SYNTHETIC_SESSION_POSTED'
      AND (sta.after_state->>'draftId')::int = ANY(${draftIds})
    ORDER BY sta.id DESC
  `);

  const auditMap = new Map<number, number | null>();
  for (const row of auditResult.rows as { draftId: number; punchLedgerId: number | null }[]) {
    if (!auditMap.has(row.draftId)) {
      auditMap.set(row.draftId, row.punchLedgerId ?? null);
    }
  }

  // Collect all known punchLedgerIds to batch-query allocations
  const punchLedgerIds = [...auditMap.values()].filter((id): id is number => id != null);

  const allocCountMap = new Map<number, number>();
  if (punchLedgerIds.length > 0) {
    const allocResult = await db.execute(sql`
      SELECT
        la.punch_ledger_id AS "punchLedgerId",
        COUNT(*)::int      AS "closedCount"
      FROM labor_allocations la
      WHERE la.punch_ledger_id = ANY(${punchLedgerIds})
        AND la.status = 'CLOSED'
        AND la.allocation_end IS NOT NULL
      GROUP BY la.punch_ledger_id
    `);

    for (const row of allocResult.rows as { punchLedgerId: number; closedCount: number }[]) {
      allocCountMap.set(row.punchLedgerId, row.closedCount);
    }
  }

  // 3. Build the reconciliation report
  const report: ReconcileSalariedDraftsResult["report"] = [];
  const orphanedDraftIds: number[] = [];

  for (const draft of postedDrafts) {
    const punchLedgerId = auditMap.get(draft.draftId) ?? null;
    const closedAllocationCount = punchLedgerId != null
      ? (allocCountMap.get(punchLedgerId) ?? 0)
      : 0;

    const isOrphaned = closedAllocationCount === 0;
    if (isOrphaned) orphanedDraftIds.push(draft.draftId);

    report.push({
      draftId: draft.draftId,
      employeeId: draft.employeeId,
      entryDate: typeof draft.entryDate === "string"
        ? draft.entryDate
        : (draft.entryDate as Date).toISOString().slice(0, 10),
      punchLedgerId,
      closedAllocationCount,
      status: isOrphaned ? "orphaned" : "ok",
    });
  }

  return {
    ok: orphanedDraftIds.length === 0,
    year,
    month,
    totalPostedDrafts: postedDrafts.length,
    orphanedDraftIds,
    report,
  };
}
