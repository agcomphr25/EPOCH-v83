/**
 * Salaried Labor Costing Service — Blocker 2 Phase B
 *
 * Creates labor_cost_records from payroll-approved salaried timesheet lines,
 * feeding the same laborPostingService → journal_entries pipeline that
 * traveler direct labor uses.
 *
 * Accounting discipline:
 *   - chargeCodeId → charge_codes.type is the authoritative cost classification.
 *     No text-label routing.  Same standard as Task #305 WAD labor.
 *   - canonical_id = 'stl-{timesheetId}-{lineId}' — deterministic, globally
 *     unique per line, used for duplicate prevention and DCAA traceability.
 *   - clock_in / clock_out are synthesized (NOT NULL constraint) from the line
 *     date at 08:00 UTC + hours.  Explicitly documented in source = 'SALARIED'.
 *   - No productionWorkOrderId / projectId — salaried indirect labor is non-WAD.
 *     Routes through the non-WAD (cost-type aggregation) path in postLaborToGL.
 *
 * Fail-closed guarantees:
 *   - Any line without a valid chargeCodeId aborts the entire approval.
 *   - Any line where getChargeCodeById returns null aborts the approval.
 *   - Any existing GL-posted (journalEntryId IS NOT NULL) STL records block
 *     re-approval — GL entries must be voided first.
 *
 * DCAA traceability answer for every audit question:
 *   "Why was this PTO posted?"
 *     → labor_cost_records.canonical_id = 'stl-{ts}-{line}'
 *     → salaried_timesheet_lines.id = {line}
 *       → line.leave_entry_id → leave_entries (approved PTO)
 *       → line.charge_code_id → charge_codes.code / type (OVERHEAD pool)
 *     → salaried_timesheets.id = {ts}
 *       → ts.employee_id → employees.name
 *       → ts.period_start / period_end (which week)
 *       → ts.payroll_approved_at / payroll_approved_by (who approved)
 *     → labor_cost_records.journal_entry_id → journal_entries (GL entry)
 */

import { db } from "../../../db";
import { laborCostRecords, employees, punchLedger, laborAllocations } from "../../../schema";
import { and, eq, gte, lte, like, isNull, isNotNull, inArray, desc, sql } from "drizzle-orm";
import {
  salariedTimesheetsTable,
  salariedTimesheetLinesTable,
  laborEntryDraftsTable,
  employeesTable,
  salariedTimesheetAuditTable,
} from "../../schema/timekeeping";
import { storage } from "../../../storage";
import { resolveEmployeeRate, classifyLaborCost } from "../laborCostingService";
import { postLaborEntryDraft } from "./laborEntryDraftPostingService";
import type { InsertLaborCostRecord } from "../../../schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SalariedCostRecordSummary {
  timesheetId: number;
  employeeId: number;
  lineCount: number;
  totalHours: number;
  totalDollarCost: number;
  recordIds: number[];
  byType: Record<string, { hours: number; dollarCost: number }>;
  draftsPosted: number;
  draftPostingResults: { draftId: number; punchLedgerId: number; allocationIds: number[] }[];
}

/**
 * Structured error thrown when NEEDS_REVIEW drafts block payroll approval.
 * The route catches this and returns a 422 with the draft IDs listed.
 */
export class DraftNeedsReviewError extends Error {
  readonly code = "DRAFT_NEEDS_REVIEW" as const;
  readonly draftIds: number[];
  constructor(draftIds: number[]) {
    super(
      `Payroll approval blocked: ${draftIds.length} labor entry draft(s) require review before approval. ` +
      `Resolve all validation errors then re-confirm the draft(s) before approving. ` +
      `Affected draft IDs: ${draftIds.join(", ")}.`,
    );
    this.draftIds = draftIds;
    this.name = "DraftNeedsReviewError";
  }
}

export interface SalariedCostAuditRow {
  lineId: number;
  date: string;
  lineType: string;
  hours: number;
  chargeCodeId: number | null;
  chargeCodeCode: string | null;
  chargeCodeType: string | null;
  indirectCodeId: number | null;
  leaveEntryId: number | null;
  source: string;
  canonicalId: string;
  dollarCost: string;
  costType: string;
  rateUsed: string;
  rateSource: string;
  journalEntryId: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive period year and month from a line date string ('YYYY-MM-DD').
 * Handles the case where a line date comes back as a Date object from the
 * pg driver (DATE columns without explicit text() mapping).
 */
function periodFromDate(dateStr: string | Date): { year: number; month: number } {
  const s = typeof dateStr === "string" ? dateStr : (dateStr as Date).toISOString().slice(0, 10);
  const [y, m] = s.split("-").map(Number);
  return { year: y!, month: m! };
}

/**
 * Synthesize clock_in / clock_out timestamps from a date and hours.
 * labor_cost_records.clock_in / clock_out are NOT NULL.
 * For salaried labor there are no punch times — we anchor at 08:00 UTC
 * and add the hours worked.  All consumers of these fields for salaried
 * records must use hours_worked directly, not derive it from timestamps.
 */
function synthesizeClockTimes(
  dateStr: string | Date,
  hours: number,
): { clockIn: Date; clockOut: Date } {
  const s = typeof dateStr === "string" ? dateStr : (dateStr as Date).toISOString().slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  const clockIn = new Date(Date.UTC(y!, m! - 1, d!, 8, 0, 0));
  const clockOut = new Date(clockIn.getTime() + hours * 3_600_000);
  return { clockIn, clockOut };
}

/**
 * Canonical ID for a salaried timesheet line — deterministic and globally
 * unique within labor_cost_records.  Prefix 'stl-' distinguishes these from
 * punch records ('pl-') and enables targeted queries.
 */
function canonicalId(timesheetId: number, lineId: number): string {
  return `stl-${timesheetId}-${lineId}`;
}

// ---------------------------------------------------------------------------
// Core: Create labor_cost_records from payroll-approved timesheet lines
// ---------------------------------------------------------------------------

/**
 * Creates labor_cost_records for all lines on a payroll-approved salaried
 * timesheet.  Designed to be called atomically with the payroll approval
 * status update (the caller holds the approval transaction).
 *
 * Duplicate prevention strategy:
 *   1. Any existing STL records that have already been posted to GL
 *      (journalEntryId IS NOT NULL) block execution — GL entries must
 *      be voided before reapproval is possible.
 *   2. Non-posted STL records for the timesheet are deleted and recreated.
 *      This handles the reopen → reapprove cycle safely.
 *
 * Fail-closed:
 *   - Any line with chargeCodeId = null → throws immediately.
 *   - Any line where charge_codes row cannot be found → throws immediately.
 *   - Throws before any insert if ANY line would fail.
 */
export async function createSalariedLaborCostRecords(
  timesheetId: number,
  approvedByUserId: number,
): Promise<SalariedCostRecordSummary> {
  // ── 1. Load the timesheet header ──────────────────────────────────────────
  const [timesheet] = await db
    .select()
    .from(salariedTimesheetsTable)
    .where(eq(salariedTimesheetsTable.id, timesheetId))
    .limit(1);

  if (!timesheet) {
    throw new Error(`Salaried timesheet ${timesheetId} not found.`);
  }

  const epochEmployeeId = timesheet.employeeId;

  // ── 2. Load all lines for the timesheet ──────────────────────────────────
  const lines = await db
    .select()
    .from(salariedTimesheetLinesTable)
    .where(eq(salariedTimesheetLinesTable.timesheetId, timesheetId));

  if (lines.length === 0) {
    throw new Error(
      `Salaried timesheet ${timesheetId} has no lines. ` +
      `Inject holiday and PTO lines before payroll approval.`,
    );
  }

  // ── 3. Fail-closed: all lines must have a valid chargeCodeId ─────────────
  const missingChargeCode = lines.filter((l) => !l.chargeCodeId);
  if (missingChargeCode.length > 0) {
    throw new Error(
      `Payroll approval blocked: ${missingChargeCode.length} line(s) on timesheet ` +
      `${timesheetId} have no chargeCodeId. ` +
      `Affected line IDs: ${missingChargeCode.map((l) => l.id).join(", ")}. ` +
      `Ensure all lines were injected via Blocker 2 Phase A service methods.`,
    );
  }

  // ── 4. Validate all charge codes exist before any writes ─────────────────
  const chargeCodeCache = new Map<number, { id: number; code: string; type: string }>();
  for (const line of lines) {
    const ccId = line.chargeCodeId!;
    if (!chargeCodeCache.has(ccId)) {
      const cc = await storage.getChargeCodeById(ccId);
      if (!cc) {
        throw new Error(
          `Payroll approval blocked: charge code ID ${ccId} referenced by line ${line.id} ` +
          `does not exist in charge_codes. Resolve this invalid reference before approving.`,
        );
      }
      chargeCodeCache.set(ccId, { id: cc.id, code: cc.code, type: cc.type });
    }
  }

  // ── 5. Block if any existing STL records are already GL-posted ────────────
  const postedPattern = `stl-${timesheetId}-%`;
  const existingPosted = await db
    .select({ id: laborCostRecords.id, canonicalId: laborCostRecords.canonicalId })
    .from(laborCostRecords)
    .where(
      and(
        like(laborCostRecords.canonicalId, postedPattern),
        isNotNull(laborCostRecords.journalEntryId),
      ),
    );

  if (existingPosted.length > 0) {
    throw new Error(
      `Payroll approval blocked: ${existingPosted.length} labor cost record(s) for ` +
      `timesheet ${timesheetId} have already been posted to GL ` +
      `(journal_entry_id IS NOT NULL). ` +
      `Void the GL journal entries before reapproving this timesheet. ` +
      `Affected canonical IDs: ${existingPosted.map((r) => r.canonicalId).join(", ")}.`,
    );
  }

  // ── 6. Delete any non-posted STL records (idempotent re-approval path) ────
  await db
    .delete(laborCostRecords)
    .where(
      and(
        like(laborCostRecords.canonicalId, postedPattern),
        isNull(laborCostRecords.journalEntryId),
      ),
    );

  // ── 7. Resolve employee rate once for all lines ───────────────────────────
  const resolvedRate = await resolveEmployeeRate(epochEmployeeId);

  // ── 7b. Pre-check: block if any in-scope labor_entry_drafts are NEEDS_REVIEW ─
  // This check happens BEFORE any inserts so we fail without any partial writes.
  const [tkEmpRow] = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(eq(employeesTable.epochEmployeeId, epochEmployeeId))
    .limit(1);

  let inScopeDrafts: { id: number; status: string; reviewedBy: number | null }[] = [];
  if (tkEmpRow) {
    inScopeDrafts = await db
      .select({
        id: laborEntryDraftsTable.id,
        status: laborEntryDraftsTable.status,
        reviewedBy: laborEntryDraftsTable.reviewedBy,
      })
      .from(laborEntryDraftsTable)
      .where(
        and(
          eq(laborEntryDraftsTable.employeeId, tkEmpRow.id),
          gte(laborEntryDraftsTable.entryDate, timesheet.periodStart),
          lte(laborEntryDraftsTable.entryDate, timesheet.periodEnd),
        ),
      );

    const needsReview = inScopeDrafts.filter((d) => d.status === "NEEDS_REVIEW");
    if (needsReview.length > 0) {
      throw new DraftNeedsReviewError(needsReview.map((d) => d.id));
    }
  }

  // ── 8. Build labor_cost_record rows — fail-closed per line ───────────────
  const toInsert: InsertLaborCostRecord[] = [];
  const totalsByType: Record<string, { hours: number; dollarCost: number }> = {};

  for (const line of lines) {
    const ccId = line.chargeCodeId!;
    const cc = chargeCodeCache.get(ccId)!;

    // Classify cost type via charge_codes.type — no text-label routing
    const costType = await classifyLaborCost(ccId, null, null);

    const hours = Number(line.hours ?? 0);
    if (hours <= 0) continue; // skip zero-hour lines (e.g., placeholder lines not yet filled)

    const dollarCost = hours * resolvedRate.rate;

    const { year, month } = periodFromDate(line.date as string | Date);
    const { clockIn, clockOut } = synthesizeClockTimes(line.date as string | Date, hours);

    toInsert.push({
      postingRunId: null,
      epochEmployeeId,
      canonicalId: canonicalId(timesheetId, line.id),
      jobCode: cc.code,
      departmentCode: null,
      periodYear: year,
      periodMonth: month,
      sourcePunchCanonicalId: null,
      clockIn,
      clockOut,
      hoursWorked: hours.toFixed(4),
      rateUsed: resolvedRate.rate.toFixed(2),
      dollarCost: dollarCost.toFixed(2),
      costType,
      rateSource: resolvedRate.rateSource,
      productionWorkOrderId: null,
      projectId: null,
      travelerId: null,
      chargeCodeId: ccId,
    });

    if (!totalsByType[costType]) totalsByType[costType] = { hours: 0, dollarCost: 0 };
    totalsByType[costType]!.hours += hours;
    totalsByType[costType]!.dollarCost += dollarCost;
  }

  // ── 9. Insert all records ─────────────────────────────────────────────────
  if (toInsert.length === 0) {
    throw new Error(
      `Salaried timesheet ${timesheetId} has no lines with hours > 0. ` +
      `Cannot generate labor cost records.`,
    );
  }

  const inserted = await db.insert(laborCostRecords).values(toInsert).returning();

  // ── 10. Post any CONFIRMED labor_entry_drafts for this employee/week ─────
  // inScopeDrafts was already loaded in step 7b (NEEDS_REVIEW already blocked above).
  // Only CONFIRMED drafts are posted here; POSTED/VOIDED are skipped.
  const draftPostingResults: { draftId: number; punchLedgerId: number; allocationIds: number[] }[] = [];

  const confirmedDrafts = inScopeDrafts.filter((d) => d.status === "CONFIRMED");
  // Wrap draft posting in a compensating rollback: if any draft post fails,
  // delete the STL records we just inserted so the system is left in a clean
  // state and payroll approval can be retried safely.  Already-posted drafts
  // (those that succeeded before the failure) are handled idempotently by
  // postLaborEntryDraft's AlreadyPostedGuard on the next retry.
  try {
    for (const draft of confirmedDrafts) {
      const result = await postLaborEntryDraft(draft.id, approvedByUserId);
      const isNew = !("alreadyPosted" in result);
      const punchLedgerId = result.punchLedgerId ?? 0;
      const allocationIds = isNew ? result.allocationIds : [];

      draftPostingResults.push({ draftId: result.draftId, punchLedgerId, allocationIds });

      // Write a Phase-6 audit record under the REAL salaried timesheet ID.
      // Uses action=SYNTHETIC_SESSION_POSTED (same as Phase-4) but with
      // timesheetId=realTimesheetId (not draftId) so the reopen path can query
      // by real timesheet context.  Includes reviewer + approver for traceability.
      await db.insert(salariedTimesheetAuditTable).values({
        timesheetId,
        lineId: null,
        action: "SYNTHETIC_SESSION_POSTED",
        actorId: approvedByUserId,
        actorName: null,
        actorRole: null,
        beforeState: null,
        afterState: {
          draftId: result.draftId,
          punchLedgerId,
          allocationIds,
          reviewer: draft.reviewedBy ?? null,
          approver: approvedByUserId,
          isNew,
        },
        reason: `Draft ${result.draftId} posted as part of payroll approval for timesheet ${timesheetId}.`,
        source: "PAYROLL_APPROVAL",
        ipAddress: null,
      });
    }
  } catch (postingErr) {
    // Compensating rollback — restore all side effects so the payroll-approve
    // route is fully atomic.  Any draft that was posted before the failure
    // must be voided and reset to CONFIRMED so it can be re-posted on retry.
    // 1. Void/reset drafts that were already posted in this run.
    for (const posted of draftPostingResults) {
      if (posted.punchLedgerId > 0) {
        const rollbackNote = `VOIDED: compensating rollback — payroll approval for timesheet ${timesheetId} failed after posting draft ${posted.draftId}`;
        await db
          .update(laborAllocations)
          .set({ status: "VOIDED", isEdited: true, editNote: rollbackNote })
          .where(eq(laborAllocations.punchLedgerId, posted.punchLedgerId));
        await db
          .update(punchLedger)
          .set({ isEdited: true, editNote: rollbackNote })
          .where(eq(punchLedger.id, posted.punchLedgerId));
      }
      await db
        .update(laborEntryDraftsTable)
        .set({ status: "CONFIRMED", postedAt: null, reviewedAt: null, reviewedBy: null })
        .where(eq(laborEntryDraftsTable.id, posted.draftId));
    }
    // 2. Delete the STL records we just inserted.
    await db
      .delete(laborCostRecords)
      .where(inArray(laborCostRecords.id, inserted.map((r) => r.id)));
    throw postingErr;
  }

  return {
    timesheetId,
    employeeId: epochEmployeeId,
    lineCount: inserted.length,
    totalHours: Object.values(totalsByType).reduce((s, t) => s + t.hours, 0),
    totalDollarCost: Object.values(totalsByType).reduce((s, t) => s + t.dollarCost, 0),
    recordIds: inserted.map((r) => r.id),
    byType: totalsByType,
    draftsPosted: draftPostingResults.length,
    draftPostingResults,
  };
}

// ---------------------------------------------------------------------------
// Reopen helper — delete non-posted STL records for the timesheet
// ---------------------------------------------------------------------------

/**
 * Called when a timesheet is reopened.  Deletes any non-posted labor cost
 * records so that reapproval creates a fresh, authoritative set.
 *
 * Also voids any synthetic punch_ledger rows + labor_allocations created from
 * POSTED labor_entry_drafts for the same employee/week, and resets those
 * drafts to CONFIRMED so they can be re-posted on re-approval.
 *
 * Throws if any records are already GL-posted — caller must void GL entries
 * first (those cannot be deleted without a separate void transaction).
 */
export async function deleteSalariedLaborCostRecordsForReopen(
  timesheetId: number,
): Promise<{ deleted: number; draftsReset: number }> {
  const postedPattern = `stl-${timesheetId}-%`;

  // Block reopen if any records are GL-posted
  const postedRows = await db
    .select({ id: laborCostRecords.id })
    .from(laborCostRecords)
    .where(
      and(
        like(laborCostRecords.canonicalId, postedPattern),
        isNotNull(laborCostRecords.journalEntryId),
      ),
    );

  if (postedRows.length > 0) {
    throw new Error(
      `Cannot reopen timesheet ${timesheetId}: ${postedRows.length} labor cost record(s) ` +
      `have already been posted to GL. Void the GL journal entries before reopening.`,
    );
  }

  // ── READ PHASE (outside transaction) ─────────────────────────────────────
  // Load everything we need to compute the reversal plan before starting writes.

  const [timesheet] = await db
    .select({
      employeeId: salariedTimesheetsTable.employeeId,
      periodStart: salariedTimesheetsTable.periodStart,
      periodEnd: salariedTimesheetsTable.periodEnd,
    })
    .from(salariedTimesheetsTable)
    .where(eq(salariedTimesheetsTable.id, timesheetId))
    .limit(1);

  // Collect drafts that can be reversed: POSTED drafts with recoverable punchLedgerId.
  type ReversibleDraft = { draftId: number; punchLedgerId: number };
  const reversibleDrafts: ReversibleDraft[] = [];

  if (timesheet) {
    const [tkEmpRow] = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(eq(employeesTable.epochEmployeeId, timesheet.employeeId))
      .limit(1);

    if (tkEmpRow) {
      const postedDrafts = await db
        .select({ id: laborEntryDraftsTable.id })
        .from(laborEntryDraftsTable)
        .where(
          and(
            eq(laborEntryDraftsTable.employeeId, tkEmpRow.id),
            gte(laborEntryDraftsTable.entryDate, timesheet.periodStart),
            lte(laborEntryDraftsTable.entryDate, timesheet.periodEnd),
            eq(laborEntryDraftsTable.status, "POSTED"),
          ),
        );

      // Load Phase-6 SYNTHETIC_SESSION_POSTED audit records for this real timesheetId.
      // (Phase-4 records use timesheetId=draftId; Phase-6 uses timesheetId=realId.)
      // Ordered desc so in-memory find() returns the most recent posting per draft.
      const auditRows = await db
        .select({ id: salariedTimesheetAuditTable.id, afterState: salariedTimesheetAuditTable.afterState })
        .from(salariedTimesheetAuditTable)
        .where(
          and(
            eq(salariedTimesheetAuditTable.timesheetId, timesheetId),
            eq(salariedTimesheetAuditTable.action, "SYNTHETIC_SESSION_POSTED"),
          ),
        )
        .orderBy(desc(salariedTimesheetAuditTable.id));

      for (const draft of postedDrafts) {
        const auditRow = auditRows.find(
          (r) => (r.afterState as Record<string, unknown> | null)?.draftId === draft.id,
        );
        const punchLedgerId = typeof (auditRow?.afterState as Record<string, unknown> | null)?.punchLedgerId === "number"
          ? ((auditRow!.afterState as Record<string, unknown>).punchLedgerId as number)
          : null;

        // Fail closed: skip drafts with no recoverable punch_ledger linkage.
        if (punchLedgerId != null) {
          reversibleDrafts.push({ draftId: draft.id, punchLedgerId });
        }
      }
    }
  }

  // ── WRITE PHASE (inside transaction for atomicity) ─────────────────────────
  let deletedCount = 0;
  let draftsReset = 0;

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(laborCostRecords)
      .where(
        and(
          like(laborCostRecords.canonicalId, postedPattern),
          isNull(laborCostRecords.journalEntryId),
        ),
      )
      .returning({ id: laborCostRecords.id });
    deletedCount = deleted.length;

    for (const { draftId, punchLedgerId } of reversibleDrafts) {
      const voidNote = `VOIDED: synthetic session from draft ${draftId} voided on timesheet ${timesheetId} reopen`;

      await tx
        .update(laborAllocations)
        .set({ status: "VOIDED", isEdited: true, editNote: voidNote })
        .where(eq(laborAllocations.punchLedgerId, punchLedgerId));

      await tx
        .update(punchLedger)
        .set({ isEdited: true, editNote: voidNote })
        .where(eq(punchLedger.id, punchLedgerId));

      await tx
        .update(laborEntryDraftsTable)
        .set({ status: "CONFIRMED", postedAt: null, reviewedAt: null, reviewedBy: null })
        .where(eq(laborEntryDraftsTable.id, draftId));

      await tx.insert(salariedTimesheetAuditTable).values({
        timesheetId,
        lineId: null,
        action: "SYNTHETIC_SESSION_VOIDED",
        actorId: null,
        actorName: null,
        actorRole: null,
        beforeState: { draftId, draftStatus: "POSTED", punchLedgerId },
        afterState: { draftId, draftStatus: "CONFIRMED", punchLedgerId, allocationsVoided: true },
        reason: `Timesheet ${timesheetId} reopened — synthetic session from draft ${draftId} voided and draft reset to CONFIRMED for re-approval.`,
        source: "REOPEN",
        ipAddress: null,
      });

      draftsReset++;
    }
  });

  return { deleted: deletedCount, draftsReset };
}

// ---------------------------------------------------------------------------
// Minimum-hours payroll approval blocker (TK-002 completeness check)
// ---------------------------------------------------------------------------

/**
 * Validates that a salaried timesheet has sufficient accounted hours before
 * payroll approval.  Throws a 422-style error if hours are insufficient.
 *
 * Logic:
 *   expectedMinHours = (non-weekend work days in period × 8)
 *                     - (sum of hours on locked HOLIDAY lines)
 *                     - (sum of hours on locked PTO/leave lines)
 *
 * Exemptions:
 *   - If the employee was hired during the period, only count days from hireDate.
 *   - Partial weeks at start/end of period due to hire date are excluded.
 */
export async function validateTimesheetCompleteness(
  timesheetId: number,
): Promise<void> {
  const [ts] = await db
    .select()
    .from(salariedTimesheetsTable)
    .where(eq(salariedTimesheetsTable.id, timesheetId))
    .limit(1);

  if (!ts) throw new Error(`Timesheet ${timesheetId} not found.`);

  const lines = await db
    .select()
    .from(salariedTimesheetLinesTable)
    .where(eq(salariedTimesheetLinesTable.timesheetId, timesheetId));

  const [emp] = await db
    .select({ hireDate: employees.hireDate })
    .from(employees)
    .where(eq(employees.id, ts.employeeId))
    .limit(1);

  // All date arithmetic is done in UTC to prevent local-timezone drift.
  // ISO date strings (YYYY-MM-DD) are midnight UTC, so UTC accessors are authoritative.
  function utcDateFromIso(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function isoFromUtcDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  const periodStart = utcDateFromIso(ts.periodStart);
  const periodEnd = utcDateFromIso(ts.periodEnd);
  const hireDateUtc = emp?.hireDate ? utcDateFromIso(emp.hireDate) : null;

  let effectiveStart = periodStart;
  if (hireDateUtc && hireDateUtc > periodStart) {
    if (hireDateUtc > periodEnd) {
      return;
    }
    effectiveStart = hireDateUtc;
  }

  let expectedWorkDays = 0;
  const cursor = new Date(effectiveStart.getTime());
  while (cursor <= periodEnd) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) expectedWorkDays++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const expectedMinHours = expectedWorkDays * 8;

  const lockedHolidayHours = lines
    .filter((l) => l.isLocked && l.lineType === "HOLIDAY")
    .reduce((sum, l) => sum + Number(l.hours ?? 0), 0);

  const lockedLeaveHours = lines
    .filter((l) => l.isLocked && l.lineType !== "HOLIDAY")
    .reduce((sum, l) => sum + Number(l.hours ?? 0), 0);

  const adjustedMin = Math.max(0, expectedMinHours - lockedHolidayHours - lockedLeaveHours);

  const totalAccountedHours = lines.reduce((sum, l) => sum + Number(l.hours ?? 0), 0);

  if (totalAccountedHours < adjustedMin) {
    const shortfall = adjustedMin - totalAccountedHours;

    const datesWithHours = new Set(
      lines.filter((l) => Number(l.hours ?? 0) > 0).map((l) => l.date),
    );
    const unaccountedDays: string[] = [];
    const dayCursor = new Date(effectiveStart.getTime());
    while (dayCursor <= periodEnd) {
      const dow = dayCursor.getUTCDay();
      if (dow !== 0 && dow !== 6) {
        const iso = isoFromUtcDate(dayCursor);
        if (!datesWithHours.has(iso)) unaccountedDays.push(iso);
      }
      dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
    }

    const unaccountedRange =
      unaccountedDays.length === 0
        ? "no specific days identified"
        : unaccountedDays.length === 1
        ? unaccountedDays[0]
        : `${unaccountedDays[0]} through ${unaccountedDays[unaccountedDays.length - 1]} (${unaccountedDays.length} day${unaccountedDays.length > 1 ? "s" : ""})`;

    const err = new Error(
      `Payroll approval blocked: timesheet ${timesheetId} has ${totalAccountedHours.toFixed(2)} hours ` +
      `but requires at least ${adjustedMin.toFixed(2)} hours ` +
      `(${expectedWorkDays} work days × 8h, minus ${lockedHolidayHours}h holidays, minus ${lockedLeaveHours}h leave). ` +
      `Shortfall: ${shortfall.toFixed(2)} hours. ` +
      `Unaccounted work day range: ${unaccountedRange} (period ${ts.periodStart} → ${ts.periodEnd}).`,
    );
    (err as any).statusCode = 422;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// DCAA audit query — returns full traceability row for each line
// ---------------------------------------------------------------------------

/**
 * Returns a fully-joined view of every labor_cost_record for a timesheet,
 * cross-referenced with charge_codes for DCAA auditor queries.
 *
 * Answers: "Why was this PTO posted? Which charge code? Which GL entry?"
 */
export async function getSalariedLaborCostAudit(
  timesheetId: number,
): Promise<SalariedCostAuditRow[]> {
  // ── Part A: Traditional STL records (canonical_id like 'stl-{timesheetId}-*') ──
  const postedPattern = `stl-${timesheetId}-%`;
  const stlRecords = await db
    .select()
    .from(laborCostRecords)
    .where(like(laborCostRecords.canonicalId, postedPattern));

  const results: SalariedCostAuditRow[] = [];

  for (const rec of stlRecords) {
    const canonicalParts = (rec.canonicalId ?? "").split("-");
    const lineId = canonicalParts.length === 3 ? Number(canonicalParts[2]) : null;

    let lineData: typeof salariedTimesheetLinesTable.$inferSelect | null = null;
    if (lineId) {
      const [l] = await db
        .select()
        .from(salariedTimesheetLinesTable)
        .where(eq(salariedTimesheetLinesTable.id, lineId))
        .limit(1);
      lineData = l ?? null;
    }

    let ccData: { code: string; type: string } | null = null;
    if (rec.chargeCodeId) {
      const cc = await storage.getChargeCodeById(rec.chargeCodeId);
      if (cc) ccData = { code: cc.code, type: cc.type };
    }

    results.push({
      lineId: lineId ?? 0,
      date: lineData ? String(lineData.date) : "",
      lineType: lineData?.lineType ?? "",
      hours: Number(rec.hoursWorked),
      chargeCodeId: rec.chargeCodeId ?? null,
      chargeCodeCode: ccData?.code ?? null,
      chargeCodeType: ccData?.type ?? null,
      indirectCodeId: lineData?.indirectCodeId ?? null,
      leaveEntryId: lineData?.leaveEntryId ?? null,
      source: lineData?.source ?? "UNKNOWN",
      canonicalId: rec.canonicalId ?? "",
      dollarCost: String(rec.dollarCost),
      costType: rec.costType,
      rateUsed: String(rec.rateUsed),
      rateSource: rec.rateSource,
      journalEntryId: rec.journalEntryId ?? null,
    });
  }

  // ── Part B: Draft-sourced records (labor_entry_drafts posted during payroll approval) ──
  // When createSalariedLaborCostRecords() runs payroll approval, CONFIRMED drafts are
  // posted via postLaborEntryDraft(), creating synthetic punch_ledger rows with
  // source='SALARIED_ENTRY'.  The cost records for those punches have
  // source_punch_canonical_id='pl-{punchLedgerId}'.  We recover the punchLedgerId
  // from the SYNTHETIC_SESSION_POSTED audit records written under this timesheetId.
  // Filter to PAYROLL_APPROVAL source only:
  //   Phase-4 audit rows use timesheetId=draftId, source='SALARIED_ENTRY'
  //   Phase-6 audit rows use timesheetId=realTimesheetId, source='PAYROLL_APPROVAL'
  // Without the source filter, an ID collision between a draftId and a real
  // timesheetId could inject unrelated punch/cost records into the audit report.
  const draftAuditResult = await db.execute(sql`
    SELECT DISTINCT
      (after_state->>'punchLedgerId')::int  AS "punchLedgerId",
      (after_state->>'draftId')::int        AS "draftId",
      (after_state->>'entryDate')           AS "entryDate"
    FROM timekeeping.salaried_timesheet_audit
    WHERE timesheet_id = ${timesheetId}
      AND action = 'SYNTHETIC_SESSION_POSTED'
      AND source = 'PAYROLL_APPROVAL'
      AND after_state->>'punchLedgerId' IS NOT NULL
  `);

  const draftAuditRows = draftAuditResult.rows as {
    punchLedgerId: number;
    draftId: number;
    entryDate: string | null;
  }[];

  for (const auditRow of draftAuditRows) {
    const sourcePunchCanonical = `pl-${auditRow.punchLedgerId}`;

    // Fetch cost records linked to this draft's synthetic punch
    const draftCostRecords = await db
      .select()
      .from(laborCostRecords)
      .where(eq(laborCostRecords.sourcePunchCanonicalId, sourcePunchCanonical));

    for (const rec of draftCostRecords) {
      let ccData: { code: string; type: string } | null = null;
      if (rec.chargeCodeId) {
        const cc = await storage.getChargeCodeById(rec.chargeCodeId);
        if (cc) ccData = { code: cc.code, type: cc.type };
      }

      results.push({
        lineId: 0,
        date: auditRow.entryDate ?? "",
        lineType: "DRAFT_ALLOCATION",
        hours: Number(rec.hoursWorked),
        chargeCodeId: rec.chargeCodeId ?? null,
        chargeCodeCode: ccData?.code ?? null,
        chargeCodeType: ccData?.type ?? null,
        indirectCodeId: null,
        leaveEntryId: null,
        source: "SALARIED_ENTRY",
        canonicalId: rec.canonicalId ?? "",
        dollarCost: String(rec.dollarCost),
        costType: rec.costType,
        rateUsed: String(rec.rateUsed),
        rateSource: rec.rateSource,
        journalEntryId: rec.journalEntryId ?? null,
      });
    }
  }

  return results;
}
