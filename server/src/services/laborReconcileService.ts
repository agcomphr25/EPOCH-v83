/**
 * laborReconcileService — shared helper for labor cost reconciliation.
 *
 * Ports the per-session diff logic from phaseECostReconciliation.ts into
 * a function callable both from the CLI script and the API route
 * POST /api/cost-accounting/reconcile-labor-costs.
 *
 * Compares legacy model (punch_ledger total hours × rate) against the
 * allocation model (per-segment hours × rate) for closed REGULAR sessions
 * in the given date range.
 */

import { db, pgPool } from '../../db';
import { punchLedger, laborAllocations, employees, chargeCodes } from '../../schema';
import { sql, and, gte, lte, isNotNull, eq } from 'drizzle-orm';

// ── Rate resolution ───────────────────────────────────────────────────────────

interface ResolvedRate {
  rate: number;
  rateSource: 'HOURLY_RATE' | 'SALARY' | 'DEFAULT_LABOR_RATE';
}

async function resolveRate(
  employeeId: number,
  employeeCache: Map<number, ResolvedRate>,
  defaultLaborRate: number,
): Promise<ResolvedRate> {
  if (employeeCache.has(employeeId)) {
    return employeeCache.get(employeeId)!;
  }

  const [emp] = await db
    .select({ hourlyRate: employees.hourlyRate, salary: employees.salary })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  let resolved: ResolvedRate;

  if (emp) {
    const hourlyRate = emp.hourlyRate != null ? Number(emp.hourlyRate) : null;
    if (hourlyRate !== null && hourlyRate > 0) {
      resolved = { rate: hourlyRate, rateSource: 'HOURLY_RATE' };
    } else {
      const salary = emp.salary != null ? Number(emp.salary) : null;
      if (salary !== null && salary > 0) {
        resolved = { rate: salary / 2080, rateSource: 'SALARY' };
      } else {
        resolved = { rate: defaultLaborRate, rateSource: 'DEFAULT_LABOR_RATE' };
      }
    }
  } else {
    resolved = { rate: defaultLaborRate, rateSource: 'DEFAULT_LABOR_RATE' };
  }

  employeeCache.set(employeeId, resolved);
  return resolved;
}

// ── Charge code label lookup ──────────────────────────────────────────────────

async function lookupChargeCode(
  chargeCodeId: number | null,
  ccCache: Map<number, string>,
): Promise<string> {
  if (chargeCodeId == null) return '(none)';
  if (ccCache.has(chargeCodeId)) return ccCache.get(chargeCodeId)!;

  const [row] = await db
    .select({ code: chargeCodes.code })
    .from(chargeCodes)
    .where(eq(chargeCodes.id, chargeCodeId))
    .limit(1);

  const label = row?.code ?? `(id:${chargeCodeId})`;
  ccCache.set(chargeCodeId, label);
  return label;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface ChargeAttribution {
  chargeCodeId: number | null;
  chargeCode: string;
  cost: number;
  hours: number;
}

export type SessionStatus = 'OK' | 'ERR' | 'NO_DATA';

export interface SessionReconciliation {
  sessionId: number;
  employeeId: number;
  date: string;
  totalHours: number;
  rateUsed: number;
  rateSource: string;
  legacy: { chargeCode: string; cost: number };
  allocation: { chargeCode: string; hours: number; cost: number }[];
  costSplit: number;
  delta: number | null;
  attributionDiff: { chargeCode: string; delta: number }[];
  status: SessionStatus;
}

export interface ReconcileResult {
  sessions: SessionReconciliation[];
  summary: {
    totalSessions: number;
    matchCount: number;
    mismatchCount: number;
    naCount: number;
    totalCostLegacy: number;
    totalCostAllocation: number;
    grandDelta: number;
  };
}

// ── Core reconciliation function ──────────────────────────────────────────────

/**
 * Reconcile labor costs over a date range by comparing the legacy
 * punch_ledger model against the allocation-segment model.
 *
 * Called by:
 *   - `POST /api/cost-accounting/reconcile-labor-costs` (via reconcileLaborCostsByMonth)
 *   - `server/scripts/phaseECostReconciliation.ts` (directly with date-range args)
 *
 * @param from  Start of date range (inclusive, start of day)
 * @param to    End of date range (inclusive, end of day)
 */
export async function reconcileLaborCostsInRange(
  from: Date,
  to: Date,
): Promise<ReconcileResult> {
  // Load default labor rate
  const defaultRateResult = await db.execute(sql`
    SELECT default_labor_rate
    FROM estimating_defaults
    ORDER BY id
    LIMIT 1
  `);
  const defaultLaborRate =
    defaultRateResult.rows.length > 0
      ? Number(
          (defaultRateResult.rows[0] as Record<string, unknown>).default_labor_rate ?? 0,
        )
      : 0;

  // Load closed REGULAR sessions in range
  const sessions = await db
    .select()
    .from(punchLedger)
    .where(
      and(
        isNotNull(punchLedger.clockOut),
        eq(punchLedger.laborClass, 'REGULAR'),
        gte(punchLedger.clockIn, from),
        lte(punchLedger.clockIn, to),
      ),
    )
    .orderBy(punchLedger.clockIn);

  if (sessions.length === 0) {
    return {
      sessions: [],
      summary: {
        totalSessions: 0,
        matchCount: 0,
        mismatchCount: 0,
        naCount: 0,
        totalCostLegacy: 0,
        totalCostAllocation: 0,
        grandDelta: 0,
      },
    };
  }

  // Load labor_allocations for those sessions
  const sessionIds = sessions.map((s) => s.id);

  type AllocRow = {
    id: number;
    punchLedgerId: number;
    employeeId: number;
    allocationStart: string;
    allocationEnd: string;
    chargeCodeId: number | null;
    laborClass: string;
    status: string;
    sequenceOrder: number;
  };

  const allocRowsResult = await pgPool.query<AllocRow>(
    `SELECT
      la.id,
      la.punch_ledger_id   AS "punchLedgerId",
      la.employee_id       AS "employeeId",
      la.allocation_start  AS "allocationStart",
      la.allocation_end    AS "allocationEnd",
      la.charge_code_id    AS "chargeCodeId",
      la.labor_class       AS "laborClass",
      la.status,
      la.sequence_order    AS "sequenceOrder"
    FROM labor_allocations la
    WHERE la.punch_ledger_id = ANY($1)
      AND la.labor_class = 'REGULAR'
      AND la.allocation_end IS NOT NULL
    ORDER BY la.punch_ledger_id, la.sequence_order`,
    [sessionIds]
  );

  const allocsBySession = new Map<number, AllocRow[]>();
  for (const row of allocRowsResult.rows) {
    if (!allocsBySession.has(row.punchLedgerId)) {
      allocsBySession.set(row.punchLedgerId, []);
    }
    allocsBySession.get(row.punchLedgerId)!.push(row);
  }

  // Caches
  const employeeRateCache = new Map<number, ResolvedRate>();
  const ccCache = new Map<number, string>();

  // Per-session reconciliation
  const results: SessionReconciliation[] = [];
  let totalCostLegacy = 0;
  let totalCostAllocation = 0;
  let matchCount = 0;
  let mismatchCount = 0;
  let naCount = 0;

  for (const session of sessions) {
    const clockIn = new Date(session.clockIn);
    const clockOut = new Date(session.clockOut!);
    const sessionHours = (clockOut.getTime() - clockIn.getTime()) / 3_600_000;

    if (sessionHours <= 0) continue;

    const resolved = await resolveRate(session.employeeId, employeeRateCache, defaultLaborRate);
    const rate = resolved.rate;

    // Legacy model
    const legacyCost = sessionHours * rate;
    const legacyChargeCodeLabel = await lookupChargeCode(session.chargeCodeId ?? null, ccCache);

    // Allocation model
    const sessionAllocs = allocsBySession.get(session.id) ?? [];

    if (sessionAllocs.length === 0) {
      naCount++;
      results.push({
        sessionId: session.id,
        employeeId: session.employeeId,
        date: clockIn.toISOString().slice(0, 10),
        totalHours: parseFloat(sessionHours.toFixed(4)),
        rateUsed: parseFloat(rate.toFixed(4)),
        rateSource: resolved.rateSource,
        legacy: { chargeCode: legacyChargeCodeLabel, cost: parseFloat(legacyCost.toFixed(2)) },
        allocation: [],
        costSplit: 0,
        delta: null,
        attributionDiff: [],
        status: 'NO_DATA',
      });
      continue;
    }

    // Merge allocation segments by chargeCodeId
    const allocationAttribs: ChargeAttribution[] = [];
    for (const alloc of sessionAllocs) {
      const aStart = new Date(alloc.allocationStart);
      const aEnd = new Date(alloc.allocationEnd);
      const segHours = (aEnd.getTime() - aStart.getTime()) / 3_600_000;
      if (segHours <= 0) continue;
      const segCost = segHours * rate;
      const ccLabel = await lookupChargeCode(alloc.chargeCodeId, ccCache);

      const existing = allocationAttribs.find((a) => a.chargeCodeId === alloc.chargeCodeId);
      if (existing) {
        existing.cost += segCost;
        existing.hours += segHours;
      } else {
        allocationAttribs.push({
          chargeCodeId: alloc.chargeCodeId,
          chargeCode: ccLabel,
          cost: segCost,
          hours: segHours,
        });
      }
    }

    const splitTotal = allocationAttribs.reduce((s, a) => s + a.cost, 0);
    const rawDelta = legacyCost - splitTotal;
    const status: SessionStatus = Math.abs(rawDelta) > 0.01 ? 'ERR' : 'OK';

    if (status === 'OK') matchCount++;
    else mismatchCount++;

    totalCostLegacy += legacyCost;
    totalCostAllocation += splitTotal;

    // Attribution diff
    const attributionDiff: { chargeCode: string; delta: number }[] = [];
    const allCodes = Array.from(
      new Set<string>([legacyChargeCodeLabel, ...allocationAttribs.map((a) => a.chargeCode)]),
    );
    for (const code of allCodes) {
      const legacyShare = code === legacyChargeCodeLabel ? legacyCost : 0;
      const allocShare = allocationAttribs
        .filter((a) => a.chargeCode === code)
        .reduce((s, a) => s + a.cost, 0);
      const diff = allocShare - legacyShare;
      if (Math.abs(diff) > 0.001) {
        attributionDiff.push({ chargeCode: code, delta: parseFloat(diff.toFixed(2)) });
      }
    }

    results.push({
      sessionId: session.id,
      employeeId: session.employeeId,
      date: clockIn.toISOString().slice(0, 10),
      totalHours: parseFloat(sessionHours.toFixed(4)),
      rateUsed: parseFloat(rate.toFixed(4)),
      rateSource: resolved.rateSource,
      legacy: { chargeCode: legacyChargeCodeLabel, cost: parseFloat(legacyCost.toFixed(2)) },
      allocation: allocationAttribs.map((a) => ({
        chargeCode: a.chargeCode,
        hours: parseFloat(a.hours.toFixed(4)),
        cost: parseFloat(a.cost.toFixed(2)),
      })),
      costSplit: parseFloat(splitTotal.toFixed(2)),
      delta: parseFloat(rawDelta.toFixed(4)),
      attributionDiff,
      status,
    });
  }

  const grandDelta = totalCostLegacy - totalCostAllocation;

  return {
    sessions: results,
    summary: {
      totalSessions: results.length,
      matchCount,
      mismatchCount,
      naCount,
      totalCostLegacy: parseFloat(totalCostLegacy.toFixed(2)),
      totalCostAllocation: parseFloat(totalCostAllocation.toFixed(2)),
      grandDelta: parseFloat(grandDelta.toFixed(4)),
    },
  };
}

/**
 * Convenience wrapper that converts a calendar month to a date range and
 * delegates to `reconcileLaborCostsInRange`.
 *
 * Used by `POST /api/cost-accounting/reconcile-labor-costs`.
 *
 * @param year   Four-digit year (e.g. 2026)
 * @param month  Calendar month 1–12
 */
export async function reconcileLaborCosts(
  year: number,
  month: number,
): Promise<ReconcileResult> {
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  return reconcileLaborCostsInRange(from, to);
}
