import { storage } from '../../storage';
import { listSessions } from '../lib/punchLedger';
import type { PunchLedgerEntry } from '../lib/punchLedger';
import type { InsertLaborCostRecord } from '../../schema';
import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { useAllocationCostingRead } from '../lib/featureFlags';

export type CostType = 'DIRECT' | 'OVERHEAD' | 'G_AND_A';
export type RateSource = 'HOURLY_RATE' | 'SALARY' | 'DEFAULT_LABOR_RATE';
export type ReadModel = 'LEGACY' | 'ALLOCATION' | 'LEGACY_FALLBACK';

export interface ResolvedRate {
  rate: number;
  rateSource: RateSource;
}

/**
 * Resolve the effective hourly rate for an employee.
 * Priority: hourlyRate → salary / 2080 → defaultLaborRate fallback
 */
export async function resolveEmployeeRate(employeeId: number): Promise<ResolvedRate> {
  const employee = await storage.getEmployee(employeeId);

  if (employee) {
    const hourlyRate = employee.hourlyRate != null ? Number(employee.hourlyRate) : null;
    if (hourlyRate !== null && hourlyRate > 0) {
      return { rate: hourlyRate, rateSource: 'HOURLY_RATE' };
    }

    const salary = employee.salary != null ? Number(employee.salary) : null;
    if (salary !== null && salary > 0) {
      return { rate: salary / 2080, rateSource: 'SALARY' };
    }
  }

  const defaults = await storage.getEstimatingDefaultsFirst();
  const defaultRate = defaults ? Number(defaults.defaultLaborRate) : 0;
  return { rate: defaultRate, rateSource: 'DEFAULT_LABOR_RATE' };
}

/**
 * Determine cost type for an interval.
 *
 * When chargeCodeId is supplied (WAD-linked sessions):
 *   - Looks up charge_codes by ID and uses its authoritative type field.
 *   - If the charge code does not exist (deleted or invalid), throws an error
 *     rather than silently falling back to OVERHEAD.  This is fail-closed
 *     behaviour: WAD labor must never mis-classify due to a stale text snapshot.
 *
 * When chargeCodeId is null (non-WAD / legacy sessions):
 *   - Falls back to the chargeCode text snapshot: present → DIRECT.
 *   - Then departmentCode → cost_center.type → OVERHEAD | G_AND_A.
 *   - Final fallback → OVERHEAD.
 */
export async function classifyLaborCost(
  chargeCodeId: number | null,
  chargeCode: string | null,
  departmentCode: string | null,
): Promise<CostType> {
  if (chargeCodeId != null) {
    const cc = await storage.getChargeCodeById(chargeCodeId);
    if (!cc) {
      throw new Error(
        `Cannot classify labor cost: charge code ID ${chargeCodeId} does not exist. ` +
        `Resolve the invalid charge code reference before recalculating.`,
      );
    }
    const t = cc.type.toUpperCase();
    if (t === 'DIRECT') return 'DIRECT';
    if (t === 'G_AND_A') return 'G_AND_A';
    return 'OVERHEAD';
  }

  // Non-WAD path: text snapshot is the only signal available.
  if (chargeCode) return 'DIRECT';

  if (departmentCode) {
    const costCenter = await storage.getCostCenterByCode(departmentCode);
    if (costCenter) {
      const t = costCenter.type.toUpperCase();
      if (t === 'ADMINISTRATIVE') return 'G_AND_A';
      if (t === 'OVERHEAD') return 'OVERHEAD';
    }
  }

  return 'OVERHEAD';
}

// ── Business-rule error guard ─────────────────────────────────────────────────

/**
 * Returns true when an error originates from a business-rule enforcement
 * (approval gate, invalid charge code reference, etc.) rather than a
 * transient read/query failure.  Business-rule errors must surface to the
 * caller rather than being swallowed by the allocation-path fallback.
 */
function isBusinessRuleError(err: unknown): boolean {
  if (err != null && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (code === 'APPROVAL_BYPASS_IN_POSTING_PIPELINE') return true;
    if (code === 'SALARIED_ALLOCATION_MISSING_CHARGE_CODE') return true;
  }
  return false;
}

// ── Shared approval-set loader ────────────────────────────────────────────────

async function loadApprovedSet(): Promise<Set<string>> {
  const approvedResult = await db.execute(sql`
    SELECT DISTINCT
      employee_id    AS "employeeId",
      production_work_order_id AS "productionWorkOrderId"
    FROM labor_approvals
  `);
  return new Set<string>(
    (approvedResult.rows as { employeeId: string; productionWorkOrderId: string }[])
      .map((r) => `${r.employeeId}::${r.productionWorkOrderId}`),
  );
}

// ── Allocation row type ───────────────────────────────────────────────────────

interface AllocationRow {
  id: number;
  punchLedgerId: number;
  employeeId: number;
  allocationStart: string;
  allocationEnd: string;
  chargeCodeId: number | null;
  department: string | null;
  productionWorkOrderId: string | null;
  projectId: string | null;
  travelerId: string | null;
  laborClass: string;
  status: string;
  sequenceOrder: number;
  source: string;
}

// ── Allocation-based costing path ─────────────────────────────────────────────

/**
 * Reads labor cost data from labor_allocations (CLOSED REGULAR segments) instead
 * of punch_ledger sessions.  Called by processLaborCosts when the
 * USE_ALLOCATION_COSTING_READ flag is ON.
 *
 * @param year          Period year
 * @param month         Period month (1-12)
 * @param postingRunId  The posting run ID to link records to
 * @returns { recordCount, totalsByType }
 */
export async function processLaborCostsFromAllocations(
  year: number,
  month: number,
  postingRunId: number,
): Promise<{ recordCount: number; totalsByType: Record<CostType, number> }> {
  const periodStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

  // Load CLOSED REGULAR allocation segments whose allocationStart falls in the period
  const allocResult = await db.execute(sql`
    SELECT
      la.id,
      la.punch_ledger_id        AS "punchLedgerId",
      la.employee_id            AS "employeeId",
      la.allocation_start       AS "allocationStart",
      la.allocation_end         AS "allocationEnd",
      la.charge_code_id         AS "chargeCodeId",
      la.department,
      la.production_work_order_id AS "productionWorkOrderId",
      la.project_id             AS "projectId",
      la.traveler_id            AS "travelerId",
      la.labor_class            AS "laborClass",
      la.status,
      la.sequence_order         AS "sequenceOrder",
      la.source
    FROM labor_allocations la
    WHERE la.labor_class = 'REGULAR'
      AND la.status = 'CLOSED'
      AND la.allocation_end IS NOT NULL
      AND la.allocation_start >= ${periodStart}
      AND la.allocation_start <= ${periodEnd}
    ORDER BY la.employee_id, la.allocation_start
  `);

  const allocRows = allocResult.rows as AllocationRow[];

  // ── FAIL-CLOSED: SALARIED_ENTRY allocations must have a charge_code_id ─────
  // A SALARIED_ENTRY allocation without a charge code would either produce a
  // zero-cost entry (silent data loss) or be mis-classified as OVERHEAD.
  // Both are unacceptable for DCAA compliance — throw before processing any rows.
  const salariedMissingChargeCode = allocRows.filter(
    (r) => (r.source === 'SALARIED_ENTRY' || r.source === 'CONVERSATIONAL_ENTRY') &&
      r.chargeCodeId == null,
  );

  if (salariedMissingChargeCode.length > 0) {
    const ids = salariedMissingChargeCode.map((r) => r.id).join(', ');
    throw Object.assign(
      new Error(
        `Labor costing blocked: ${salariedMissingChargeCode.length} SALARIED_ENTRY / ` +
        `CONVERSATIONAL_ENTRY allocation(s) have charge_code_id = null. ` +
        `Resolve the missing charge codes before running costing. ` +
        `Affected allocation IDs: ${ids}.`,
      ),
      { code: 'SALARIED_ALLOCATION_MISSING_CHARGE_CODE', affectedAllocationIds: salariedMissingChargeCode.map((r) => r.id) },
    );
  }
  // ── END FAIL-CLOSED GUARD ──────────────────────────────────────────────────

  // ── APPROVAL GATE ──────────────────────────────────────────────────────────
  // WAD-linked allocations (productionWorkOrderId IS NOT NULL) must have a
  // matching labor_approvals row before they can be costed.
  const wadAllocs = allocRows.filter((r) => r.productionWorkOrderId != null);

  if (wadAllocs.length > 0) {
    const approvedSet = await loadApprovedSet();

    const unapproved = wadAllocs.filter(
      (r) => !approvedSet.has(`${String(r.employeeId)}::${r.productionWorkOrderId}`),
    );

    if (unapproved.length > 0) {
      const groups = new Map<string, {
        employeeId: number;
        productionWorkOrderId: string;
        allocationIds: number[];
        totalHours: number;
      }>();

      for (const r of unapproved) {
        const key = `${r.employeeId}::${r.productionWorkOrderId}`;
        if (!groups.has(key)) {
          groups.set(key, {
            employeeId: r.employeeId,
            productionWorkOrderId: r.productionWorkOrderId!,
            allocationIds: [],
            totalHours: 0,
          });
        }
        const g = groups.get(key)!;
        g.allocationIds.push(r.id);
        g.totalHours +=
          (new Date(r.allocationEnd).getTime() - new Date(r.allocationStart).getTime()) / 3_600_000;
      }

      const groupList = [...groups.values()];
      const totalUnapprovedSessions = unapproved.length;
      const totalUnapprovedHours = groupList.reduce((acc, g) => acc + g.totalHours, 0);

      const groupLines = groupList
        .map(
          (g) =>
            `  • Employee ${g.employeeId} / WO ${g.productionWorkOrderId}: ` +
            `${g.allocationIds.length} allocation(s), ${g.totalHours.toFixed(2)}h`,
        )
        .join('\n');

      throw Object.assign(
        new Error(
          `Labor posting blocked: ${totalUnapprovedSessions} WAD-linked REGULAR allocation(s) ` +
          `(${totalUnapprovedHours.toFixed(2)}h total) lack supervisor approval.\n` +
          `Resolve in Time Clock Admin → Labor Approvals tab before posting.\n\n` +
          `Unapproved groups (${groupList.length}):\n${groupLines}`,
        ),
        {
          code: 'APPROVAL_BYPASS_IN_POSTING_PIPELINE',
          unapprovedGroups: groupList.map((g) => ({
            employeeId: g.employeeId,
            productionWorkOrderId: g.productionWorkOrderId,
            sessionCount: g.allocationIds.length,
            totalHours: parseFloat(g.totalHours.toFixed(2)),
          })),
          totalUnapprovedSessions,
          totalUnapprovedHours: parseFloat(totalUnapprovedHours.toFixed(2)),
        },
      );
    }
  }
  // ── END APPROVAL GATE ──────────────────────────────────────────────────────

  const toInsert: InsertLaborCostRecord[] = [];
  const totalsByType: Record<CostType, number> = { DIRECT: 0, OVERHEAD: 0, G_AND_A: 0 };

  for (const alloc of allocRows) {
    const aStart = new Date(alloc.allocationStart);
    const aEnd = new Date(alloc.allocationEnd);
    const hoursWorked = (aEnd.getTime() - aStart.getTime()) / 3_600_000;

    if (hoursWorked <= 0) continue;

    const resolvedRate = await resolveEmployeeRate(alloc.employeeId);
    const costType = await classifyLaborCost(
      alloc.chargeCodeId ?? null,
      null,
      alloc.department ?? null,
    );
    const dollarCost = hoursWorked * resolvedRate.rate;

    totalsByType[costType] += dollarCost;

    toInsert.push({
      postingRunId,
      epochEmployeeId: alloc.employeeId,
      canonicalId: `la-${alloc.id}`,
      jobCode: null,
      departmentCode: alloc.department ?? null,
      periodYear: year,
      periodMonth: month,
      sourcePunchCanonicalId: `pl-${alloc.punchLedgerId}`,
      clockIn: aStart,
      clockOut: aEnd,
      hoursWorked: hoursWorked.toFixed(4),
      rateUsed: resolvedRate.rate.toFixed(2),
      dollarCost: dollarCost.toFixed(2),
      costType,
      rateSource: resolvedRate.rateSource,
      productionWorkOrderId: alloc.productionWorkOrderId ?? null,
      projectId: alloc.projectId ?? null,
      travelerId: alloc.travelerId ?? null,
      chargeCodeId: alloc.chargeCodeId ?? null,
    });
  }

  await storage.bulkInsertLaborCostRecords(toInsert);

  return { recordCount: toInsert.length, totalsByType };
}

// ── Legacy costing path (extracted for reuse) ─────────────────────────────────

async function runLegacyPath(
  year: number,
  month: number,
  postingRunId: number,
  closedSessions: PunchLedgerEntry[],
): Promise<{ recordCount: number; totalsByType: Record<CostType, number> }> {
  // ── APPROVAL GATE ──────────────────────────────────────────────────────────
  const wadSessions = closedSessions.filter(
    (s: PunchLedgerEntry) => s.productionWorkOrderId != null,
  );

  if (wadSessions.length > 0) {
    const approvedSet = await loadApprovedSet();

    const unapproved = wadSessions.filter(
      (s: PunchLedgerEntry) =>
        !approvedSet.has(`${String(s.employeeId)}::${s.productionWorkOrderId}`),
    );

    if (unapproved.length > 0) {
      const groups = new Map<string, {
        employeeId: number;
        productionWorkOrderId: string;
        sessionIds: number[];
        totalHours: number;
      }>();

      for (const s of unapproved) {
        const key = `${s.employeeId}::${s.productionWorkOrderId}`;
        if (!groups.has(key)) {
          groups.set(key, {
            employeeId: s.employeeId,
            productionWorkOrderId: s.productionWorkOrderId!,
            sessionIds: [],
            totalHours: 0,
          });
        }
        const g = groups.get(key)!;
        g.sessionIds.push(s.id);
        g.totalHours +=
          (new Date(s.clockOut!).getTime() - new Date(s.clockIn).getTime()) / 3_600_000;
      }

      const groupList = [...groups.values()];
      const totalUnapprovedSessions = unapproved.length;
      const totalUnapprovedHours = groupList.reduce((acc, g) => acc + g.totalHours, 0);

      const groupLines = groupList
        .map(
          (g) =>
            `  • Employee ${g.employeeId} / WO ${g.productionWorkOrderId}: ` +
            `${g.sessionIds.length} session(s), ${g.totalHours.toFixed(2)}h`,
        )
        .join('\n');

      throw Object.assign(
        new Error(
          `Labor posting blocked: ${totalUnapprovedSessions} WAD-linked REGULAR session(s) ` +
          `(${totalUnapprovedHours.toFixed(2)}h total) lack supervisor approval.\n` +
          `Resolve in Time Clock Admin → Labor Approvals tab before posting.\n\n` +
          `Unapproved groups (${groupList.length}):\n${groupLines}`,
        ),
        {
          code: 'APPROVAL_BYPASS_IN_POSTING_PIPELINE',
          unapprovedGroups: groupList.map((g) => ({
            employeeId: g.employeeId,
            productionWorkOrderId: g.productionWorkOrderId,
            sessionCount: g.sessionIds.length,
            totalHours: parseFloat(g.totalHours.toFixed(2)),
          })),
          totalUnapprovedSessions,
          totalUnapprovedHours: parseFloat(totalUnapprovedHours.toFixed(2)),
        },
      );
    }
  }
  // ── END APPROVAL GATE ──────────────────────────────────────────────────────

  // Group sessions by employeeId
  const byEmployee = new Map<number, PunchLedgerEntry[]>();
  for (const session of closedSessions) {
    if (!byEmployee.has(session.employeeId)) byEmployee.set(session.employeeId, []);
    byEmployee.get(session.employeeId)!.push(session);
  }

  const toInsert: InsertLaborCostRecord[] = [];
  const totalsByType: Record<CostType, number> = { DIRECT: 0, OVERHEAD: 0, G_AND_A: 0 };

  for (const [employeeId, sessions] of byEmployee) {
    for (const session of sessions) {
      const clockOutTime = new Date(session.clockOut!).getTime();
      const clockInTime = new Date(session.clockIn).getTime();
      const hoursWorked = (clockOutTime - clockInTime) / 3_600_000;

      if (hoursWorked <= 0) continue;

      const resolvedRate = await resolveEmployeeRate(employeeId);
      const costType = await classifyLaborCost(
        session.chargeCodeId ?? null,
        session.chargeCode ?? null,
        session.department ?? null,
      );
      const dollarCost = hoursWorked * resolvedRate.rate;

      totalsByType[costType] += dollarCost;

      toInsert.push({
        postingRunId,
        epochEmployeeId: employeeId,
        canonicalId: `pl-${session.id}`,
        jobCode: session.chargeCode ?? null,
        departmentCode: session.department ?? null,
        periodYear: year,
        periodMonth: month,
        sourcePunchCanonicalId: `pl-${session.id}`,
        clockIn: new Date(session.clockIn),
        clockOut: new Date(session.clockOut!),
        hoursWorked: hoursWorked.toFixed(4),
        rateUsed: resolvedRate.rate.toFixed(2),
        dollarCost: dollarCost.toFixed(2),
        costType,
        rateSource: resolvedRate.rateSource,
        productionWorkOrderId: session.productionWorkOrderId ?? null,
        projectId: session.projectId ?? null,
        travelerId: session.travelerId ?? null,
        chargeCodeId: session.chargeCodeId ?? null,
      });
    }
  }

  await storage.bulkInsertLaborCostRecords(toInsert);

  return { recordCount: toInsert.length, totalsByType };
}

/**
 * Process labor costs for a period (year, month).
 * - Loads all closed REGULAR sessions from punch_ledger in the period
 * - When USE_ALLOCATION_COSTING_READ is ON, reads from labor_allocations instead;
 *   falls back to punch_ledger automatically on failure or zero records.
 * - Computes dollar costs and persists labor_cost_records
 * - Blocks if a POSTED run already exists for the period
 */
export async function processLaborCosts(year: number, month: number): Promise<{
  recordCount: number;
  totalsByType: Record<CostType, number>;
  runId: number;
  readModel: ReadModel;
  fallbackReason?: string;
}> {
  // Block if period is already posted
  const existingRun = await storage.getLaborPostingRunByPeriod(year, month);
  if (existingRun && existingRun.status === 'POSTED') {
    throw new Error(`Period ${year}-${month} is already posted. Re-calculation is not allowed.`);
  }

  // Define period date range
  const periodStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

  // Load all sessions from the native punch ledger for the period (always needed
  // for the legacy path and as the fallback-trigger comparison in allocation mode).
  const allSessions = await listSessions({
    from: periodStart,
    to: periodEnd,
    limit: 50000,
  });

  // Filter to closed REGULAR sessions only
  const closedSessions = allSessions.filter(
    (s: PunchLedgerEntry) => s.clockOut !== null && s.laborClass === 'REGULAR'
  );

  // Delete existing non-posted cost records for this period (idempotent re-calculation)
  if (existingRun) {
    await storage.deleteLaborCostRecordsByPeriod(year, month);
  }

  // Create or update the posting run
  let postingRun = existingRun;
  if (!postingRun) {
    postingRun = await storage.createLaborPostingRun({
      periodYear: year,
      periodMonth: month,
      status: 'CALCULATED',
    });
  }

  // ── Feature-flagged read-path switch ──────────────────────────────────────
  if (useAllocationCostingRead) {
    let fallbackReason: string | undefined;

    try {
      const allocResult = await processLaborCostsFromAllocations(year, month, postingRun.id);

      if (allocResult.recordCount === 0 && closedSessions.length > 0) {
        fallbackReason =
          'allocation path returned 0 records for a period with closed punch sessions';
        console.warn('[laborCostingService] ALLOCATION_READ_FALLBACK', {
          reason: fallbackReason,
          year,
          month,
          closedSessionCount: closedSessions.length,
        });
      } else {
        return {
          recordCount: allocResult.recordCount,
          totalsByType: allocResult.totalsByType,
          runId: postingRun.id,
          readModel: 'ALLOCATION',
        };
      }
    } catch (err: unknown) {
      // Business-rule errors (approval gate, classification) must surface to the caller
      // rather than silently falling back to the legacy model.  Only true read/query
      // failures (connection errors, unexpected result shapes, etc.) trigger the fallback.
      if (isBusinessRuleError(err)) throw err;

      fallbackReason =
        err instanceof Error ? err.message : String(err) || 'unknown error in allocation read path';
      console.warn('[laborCostingService] ALLOCATION_READ_FALLBACK', {
        reason: fallbackReason,
        year,
        month,
      });
    }

    // Clear any partial inserts from the failed allocation path before falling back
    await storage.deleteLaborCostRecordsByPeriod(year, month);

    const legacyResult = await runLegacyPath(year, month, postingRun.id, closedSessions);
    return {
      recordCount: legacyResult.recordCount,
      totalsByType: legacyResult.totalsByType,
      runId: postingRun.id,
      readModel: 'LEGACY_FALLBACK',
      fallbackReason,
    };
  }

  // Legacy path (flag OFF)
  const legacyResult = await runLegacyPath(year, month, postingRun.id, closedSessions);
  return {
    recordCount: legacyResult.recordCount,
    totalsByType: legacyResult.totalsByType,
    runId: postingRun.id,
    readModel: 'LEGACY',
  };
}
