/**
 * burdenRatesService — DCAA-compliant indirect cost burden engine.
 *
 * Pipeline:
 *   labor_cost_records (calculated, period locked) →
 *     resolveRateStack(date) →
 *     applyBurdenForPeriod() writes immutable applied_burden_amounts →
 *     laborPostingService refuses to GL-post any record missing a complete stack.
 *
 * Reproducibility: given a source record id and a rate version (rate_id),
 * recomputeBurdenForRecord() returns the same burden amount that was stored.
 *
 * Out of scope (per Task #80): actual indirect-pool expense feeds, applying
 * burden to non-labor cost categories (schema permits it; engine targets
 * source_table = 'labor_cost_records' only).
 */
import { db } from '../../db';
import {
  appliedBurdenAmounts,
  burdenApplicationRuns,
  indirectCostPools,
  indirectRates,
  laborCostRecords,
  type IndirectCostPool,
  type IndirectRate,
} from '../../schema';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';

export type RateType = 'PROVISIONAL' | 'BILLING' | 'FINAL';
export type RunType = 'INITIAL' | 'TRUE_UP';

export interface ResolvedPoolRate {
  pool: IndirectCostPool;
  rate: IndirectRate;
}

/**
 * Resolve the full active-pool rate stack at a given date for a rate type.
 * Throws if any active pool is missing a rate effective on/before the date.
 */
export async function resolveRateStack(
  asOf: Date,
  rateType: RateType,
): Promise<ResolvedPoolRate[]> {
  const pools = await db
    .select()
    .from(indirectCostPools)
    .where(eq(indirectCostPools.isActive, true))
    .orderBy(asc(indirectCostPools.applyOrder));

  if (pools.length === 0) {
    throw Object.assign(
      new Error('No active indirect cost pools configured. Activate at least one pool before applying burden.'),
      { code: 'NO_ACTIVE_POOLS' },
    );
  }

  const stack: ResolvedPoolRate[] = [];
  const missing: string[] = [];

  for (const pool of pools) {
    const [rate] = await db
      .select()
      .from(indirectRates)
      .where(
        and(
          eq(indirectRates.poolId, pool.id),
          eq(indirectRates.rateType, rateType),
          lte(indirectRates.effectiveFrom, sql`${asOf.toISOString().slice(0, 10)}::date`),
        ),
      )
      .orderBy(desc(indirectRates.effectiveFrom), desc(indirectRates.id))
      .limit(1);

    if (!rate) {
      missing.push(`${pool.code} (${rateType})`);
      continue;
    }
    stack.push({ pool, rate });
  }

  if (missing.length > 0) {
    throw Object.assign(
      new Error(
        `Incomplete rate stack at ${asOf.toISOString().slice(0, 10)}: missing ${rateType} rate for pool(s): ${missing.join(', ')}.`,
      ),
      { code: 'INCOMPLETE_RATE_STACK', missingPools: missing },
    );
  }

  return stack;
}

interface CostRecordForBurden {
  id: number;
  costType: string;
  hoursWorked: string;
  dollarCost: string;
}

/**
 * Compute the base amount for a single cost record under a given pool.
 *
 * The base depends on the pool's allocation_base_id resolverKind:
 *   DIRECT_LABOR_DOLLARS → record.dollarCost iff record is DIRECT, else 0
 *   DIRECT_LABOR_HOURS   → record.hoursWorked iff record is DIRECT, else 0
 *   TOTAL_COST_INPUT     → record.dollarCost (DIRECT-only) + sum of already-
 *                          applied burden amounts on the same record from
 *                          earlier-applied (lower apply_order) pools in this
 *                          run.  Used by G&A.
 */
function baseAmountFor(
  resolverKind: string,
  record: CostRecordForBurden,
  priorBurdenForRecord: number,
): number {
  const isDirect = record.costType === 'DIRECT';
  switch (resolverKind) {
    case 'DIRECT_LABOR_DOLLARS':
      return isDirect ? Number(record.dollarCost) : 0;
    case 'DIRECT_LABOR_HOURS':
      return isDirect ? Number(record.hoursWorked) : 0;
    case 'TOTAL_COST_INPUT':
      return (isDirect ? Number(record.dollarCost) : 0) + priorBurdenForRecord;
    default:
      throw new Error(`Unknown allocation base resolver kind: ${resolverKind}`);
  }
}

function periodBounds(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}

export interface ApplyBurdenResult {
  runId: number;
  recordCount: number;
  poolBurdenTotals: Record<string, number>;
  totalBurden: number;
  rateType: RateType;
  runType: RunType;
}

/**
 * Idempotent "apply burden" for a period.
 *
 * For run_type=INITIAL: deletes any existing INITIAL run rows for the period
 * (re-runnable until GL post) and writes a fresh set.  For run_type=TRUE_UP:
 * does NOT delete prior data — supersedes the latest COMPLETED run, writes
 * addendum rows whose burden_amount is the DELTA vs the most recent applied
 * amount for the same (source_record, pool); prior_amount captures the prior.
 */
export async function applyBurdenForPeriod(
  year: number,
  month: number,
  options: {
    runType?: RunType;
    rateType?: RateType;
    appliedBy: string;
  },
): Promise<ApplyBurdenResult> {
  const runType: RunType = options.runType ?? 'INITIAL';
  const rateType: RateType = options.rateType ?? (runType === 'TRUE_UP' ? 'FINAL' : 'PROVISIONAL');
  const appliedBy = options.appliedBy;

  const { start: periodStart } = periodBounds(year, month);

  const records = await db
    .select({
      id: laborCostRecords.id,
      costType: laborCostRecords.costType,
      hoursWorked: laborCostRecords.hoursWorked,
      dollarCost: laborCostRecords.dollarCost,
      journalEntryId: laborCostRecords.journalEntryId,
    })
    .from(laborCostRecords)
    .where(
      and(
        eq(laborCostRecords.periodYear, year),
        eq(laborCostRecords.periodMonth, month),
      ),
    );

  if (records.length === 0) {
    throw Object.assign(
      new Error(`No labor cost records found for period ${year}-${String(month).padStart(2, '0')}. Run calculate-labor-costs first.`),
      { code: 'NO_COST_RECORDS' },
    );
  }

  if (runType === 'INITIAL' && records.some((r) => r.journalEntryId != null)) {
    throw Object.assign(
      new Error(`Period ${year}-${String(month).padStart(2, '0')} has GL-posted records. Use TRUE_UP run type to apply rate changes.`),
      { code: 'PERIOD_ALREADY_POSTED' },
    );
  }

  // Resolve rate stack at period START — single rate version per pool per run.
  const stack = await resolveRateStack(periodStart, rateType);

  // Find prior COMPLETED run if true-up
  let supersedesRunId: number | null = null;
  if (runType === 'TRUE_UP') {
    const [prior] = await db
      .select()
      .from(burdenApplicationRuns)
      .where(
        and(
          eq(burdenApplicationRuns.periodYear, year),
          eq(burdenApplicationRuns.periodMonth, month),
          eq(burdenApplicationRuns.status, 'COMPLETED'),
        ),
      )
      .orderBy(desc(burdenApplicationRuns.id))
      .limit(1);
    if (!prior) {
      throw Object.assign(
        new Error(`Cannot run TRUE_UP for ${year}-${String(month).padStart(2, '0')}: no prior COMPLETED burden run exists.`),
        { code: 'NO_PRIOR_RUN' },
      );
    }
    supersedesRunId = prior.id;
  }

  // Pre-load base resolver kinds to avoid per-record DB lookups inside the txn.
  const baseIds = Array.from(new Set(stack.map((s) => s.pool.allocationBaseId)));
  const baseRows = await db.execute<{ id: number; resolver_kind: string }>(sql`
    SELECT id, resolver_kind FROM allocation_bases WHERE id IN (${sql.join(baseIds.map((id) => sql`${id}`), sql`, `)})
  `).then((r) => r.rows as { id: number; resolver_kind: string }[]);
  const baseResolverByPoolBaseId = new Map<number, string>();
  for (const b of baseRows) baseResolverByPoolBaseId.set(b.id, b.resolver_kind);

  return await db.transaction(async (tx) => {
    // For INITIAL re-runs, blow away prior INITIAL runs for the period (idempotent).
    if (runType === 'INITIAL') {
      await tx.delete(burdenApplicationRuns).where(
        and(
          eq(burdenApplicationRuns.periodYear, year),
          eq(burdenApplicationRuns.periodMonth, month),
          eq(burdenApplicationRuns.runType, 'INITIAL'),
        ),
      );
    }

    const [run] = await tx.insert(burdenApplicationRuns).values({
      periodYear: year,
      periodMonth: month,
      runType,
      rateType,
      status: 'PENDING',
      supersedesRunId,
      appliedBy,
    }).returning();

    // For TRUE_UP we need the prior amounts per (record, pool) to compute deltas.
    const priorByKey = new Map<string, number>();
    if (runType === 'TRUE_UP' && supersedesRunId !== null) {
      const prior = await tx
        .select({
          sourceRecordId: appliedBurdenAmounts.sourceRecordId,
          poolId: appliedBurdenAmounts.poolId,
          burdenAmount: appliedBurdenAmounts.burdenAmount,
        })
        .from(appliedBurdenAmounts)
        .where(eq(appliedBurdenAmounts.applicationRunId, supersedesRunId));
      for (const p of prior) {
        priorByKey.set(`${p.sourceRecordId}::${p.poolId}`, Number(p.burdenAmount));
      }
    }

    const poolBurdenTotals: Record<string, number> = {};
    let totalBurden = 0;
    let recordCount = 0;
    const inserts: Array<typeof appliedBurdenAmounts.$inferInsert> = [];

    for (const rec of records) {
      // Pools applied in apply_order; TOTAL_COST_INPUT bases use prior burden in same run.
      let priorBurdenThisRecord = 0;
      let recordTouched = false;
      for (const { pool, rate } of stack) {
        const kind = baseResolverByPoolBaseId.get(pool.allocationBaseId);
        if (!kind) throw new Error(`Allocation base resolver kind not loaded for pool ${pool.code}`);

        const baseAmt = baseAmountFor(kind, rec, priorBurdenThisRecord);
        const rateNum = Number(rate.rate);
        const burdenAmt = round4(baseAmt * rateNum);

        // For TRUE_UP, store the delta vs prior amount; INITIAL stores the absolute amount.
        const key = `${rec.id}::${pool.id}`;
        const priorAmt = priorByKey.get(key) ?? null;
        const writeAmount = runType === 'TRUE_UP' && priorAmt !== null
          ? round4(burdenAmt - priorAmt)
          : burdenAmt;

        // Skip zero-amount rows for non-DIRECT records on labor-only bases — we
        // still record a row when the pool actually applies, so absence of a
        // row means "pool not applicable" rather than "missing apply".
        if (baseAmt === 0 && writeAmount === 0 && runType === 'INITIAL') {
          continue;
        }

        inserts.push({
          applicationRunId: run.id,
          sourceTable: 'labor_cost_records',
          sourceRecordId: rec.id,
          poolId: pool.id,
          rateId: rate.id,
          baseAmount: baseAmt.toFixed(4),
          rateUsed: rateNum.toFixed(6),
          burdenAmount: writeAmount.toFixed(4),
          isTrueUp: runType === 'TRUE_UP',
          priorAmount: priorAmt !== null ? priorAmt.toFixed(4) : null,
        });

        priorBurdenThisRecord += burdenAmt;
        poolBurdenTotals[pool.code] = round4((poolBurdenTotals[pool.code] ?? 0) + writeAmount);
        totalBurden = round4(totalBurden + writeAmount);
        recordTouched = true;
      }
      if (recordTouched) recordCount += 1;
    }

    if (inserts.length > 0) {
      // Chunk to avoid parameter limits on large periods.
      const CHUNK = 500;
      for (let i = 0; i < inserts.length; i += CHUNK) {
        await tx.insert(appliedBurdenAmounts).values(inserts.slice(i, i + CHUNK));
      }
    }

    await tx.update(burdenApplicationRuns)
      .set({
        status: 'COMPLETED',
        recordCount,
        totalBurden: totalBurden.toFixed(2),
        completedAt: new Date(),
      })
      .where(eq(burdenApplicationRuns.id, run.id));

    return {
      runId: run.id,
      recordCount,
      poolBurdenTotals,
      totalBurden,
      rateType,
      runType,
    };
  });
}

/**
 * Verify every labor cost record in the period has a complete burden stack
 * (one applied_burden_amounts row per ACTIVE pool whose base would apply to
 * the record).  Returns the list of records that fail the check.
 *
 * Used by laborPostingService as the GL pre-post gate.
 */
export async function verifyPeriodBurdenComplete(
  year: number,
  month: number,
): Promise<{
  ok: boolean;
  missing: Array<{ recordId: number; missingPoolCodes: string[] }>;
  activePoolCodes: string[];
}> {
  const pools = await db
    .select()
    .from(indirectCostPools)
    .where(eq(indirectCostPools.isActive, true))
    .orderBy(asc(indirectCostPools.applyOrder));

  const activePoolCodes = pools.map((p) => p.code);
  if (pools.length === 0) {
    // No active pools configured — gate is open (but this is itself a config error
    // that should be flagged at apply time, not here).
    return { ok: true, missing: [], activePoolCodes };
  }

  const records = await db
    .select({
      id: laborCostRecords.id,
      costType: laborCostRecords.costType,
    })
    .from(laborCostRecords)
    .where(
      and(
        eq(laborCostRecords.periodYear, year),
        eq(laborCostRecords.periodMonth, month),
      ),
    );

  if (records.length === 0) return { ok: true, missing: [], activePoolCodes };

  // Latest COMPLETED run for the period (initial or true-up — true-up rows
  // count toward presence even though they are deltas, because a true-up
  // implies the initial run also exists).
  const recordIds = records.map((r) => r.id);

  const applied = await db
    .select({
      sourceRecordId: appliedBurdenAmounts.sourceRecordId,
      poolId: appliedBurdenAmounts.poolId,
    })
    .from(appliedBurdenAmounts)
    .innerJoin(burdenApplicationRuns, eq(burdenApplicationRuns.id, appliedBurdenAmounts.applicationRunId))
    .where(
      and(
        eq(burdenApplicationRuns.periodYear, year),
        eq(burdenApplicationRuns.periodMonth, month),
        eq(burdenApplicationRuns.status, 'COMPLETED'),
        eq(appliedBurdenAmounts.sourceTable, 'labor_cost_records'),
        inArray(appliedBurdenAmounts.sourceRecordId, recordIds),
      ),
    );

  const appliedMap = new Map<number, Set<number>>();
  for (const a of applied) {
    if (!appliedMap.has(a.sourceRecordId)) appliedMap.set(a.sourceRecordId, new Set());
    appliedMap.get(a.sourceRecordId)!.add(a.poolId);
  }

  const missing: Array<{ recordId: number; missingPoolCodes: string[] }> = [];
  for (const rec of records) {
    const haveSet = appliedMap.get(rec.id) ?? new Set<number>();
    const missingPools: string[] = [];
    for (const pool of pools) {
      // A pool "must apply" if it would produce a base > 0 for this record.
      // For DIRECT records all pools must apply (DIRECT_LABOR_* and
      // TOTAL_COST_INPUT bases all yield non-zero).  For non-DIRECT records,
      // labor-only bases yield zero so the pool legitimately does not apply.
      const mustApply = rec.costType === 'DIRECT';
      if (mustApply && !haveSet.has(pool.id)) {
        missingPools.push(pool.code);
      }
    }
    if (missingPools.length > 0) {
      missing.push({ recordId: rec.id, missingPoolCodes: missingPools });
    }
  }

  return { ok: missing.length === 0, missing, activePoolCodes };
}

/**
 * Reproduce a single applied-burden row from stored inputs.
 * Returns the recomputed amount; callers can compare against the stored value.
 */
export async function recomputeBurdenForApplied(appliedId: number): Promise<{
  appliedId: number;
  storedBurden: number;
  recomputed: number;
  match: boolean;
}> {
  const [row] = await db
    .select()
    .from(appliedBurdenAmounts)
    .where(eq(appliedBurdenAmounts.id, appliedId))
    .limit(1);
  if (!row) throw new Error(`applied_burden_amounts row ${appliedId} not found`);

  const recomputed = round4(Number(row.baseAmount) * Number(row.rateUsed));
  const stored = Number(row.burdenAmount);
  // For TRUE_UP rows the stored amount is base*rate − prior_amount.
  const expected = row.isTrueUp && row.priorAmount != null
    ? round4(recomputed - Number(row.priorAmount))
    : recomputed;
  return {
    appliedId,
    storedBurden: stored,
    recomputed: expected,
    match: Math.abs(stored - expected) < 0.0001,
  };
}

/**
 * Preview the impact of a proposed rate change for a sample period without
 * writing any data.  Resolves the would-be rate stack and computes burden
 * totals using the existing labor cost records.
 */
export async function previewRateChange(input: {
  poolId: number;
  newRate: number;
  newRateType: RateType;
  effectiveFrom: string; // YYYY-MM-DD
  samplePeriodYear: number;
  samplePeriodMonth: number;
}): Promise<{
  poolCode: string;
  before: { totalBurden: number; recordCount: number };
  after: { totalBurden: number; recordCount: number };
  delta: number;
}> {
  const [pool] = await db.select().from(indirectCostPools).where(eq(indirectCostPools.id, input.poolId)).limit(1);
  if (!pool) throw new Error(`Pool ${input.poolId} not found`);
  if (!pool.isActive) throw new Error(`Pool ${pool.code} is inactive`);

  const { start: periodStart } = periodBounds(input.samplePeriodYear, input.samplePeriodMonth);

  const records = await db
    .select({
      id: laborCostRecords.id,
      costType: laborCostRecords.costType,
      hoursWorked: laborCostRecords.hoursWorked,
      dollarCost: laborCostRecords.dollarCost,
    })
    .from(laborCostRecords)
    .where(
      and(
        eq(laborCostRecords.periodYear, input.samplePeriodYear),
        eq(laborCostRecords.periodMonth, input.samplePeriodMonth),
      ),
    );

  // Use existing rate stack for "before"
  const beforeStack = await resolveRateStack(periodStart, input.newRateType);

  // Build "after" stack: replace this pool's rate with the proposed value
  const afterStack = beforeStack.map((s) => {
    if (s.pool.id !== input.poolId) return s;
    return {
      pool: s.pool,
      rate: { ...s.rate, rate: String(input.newRate) } as IndirectRate,
    };
  });

  // Pre-load resolver kinds for all bases referenced by the stack.
  const baseIds = Array.from(new Set(beforeStack.map((s) => s.pool.allocationBaseId)));
  const baseResolverCache = new Map<number, string>();
  if (baseIds.length > 0) {
    const baseRows = await db.execute<{ id: number; resolver_kind: string }>(sql`
      SELECT id, resolver_kind FROM allocation_bases WHERE id IN (${sql.join(baseIds.map((id) => sql`${id}`), sql`, `)})
    `).then((r) => r.rows as { id: number; resolver_kind: string }[]);
    for (const b of baseRows) baseResolverCache.set(b.id, b.resolver_kind);
  }

  function totalFor(stack: ResolvedPoolRate[]): { total: number; count: number } {
    let total = 0;
    let count = 0;
    for (const rec of records) {
      let prior = 0;
      let touched = false;
      for (const { pool: p, rate: r } of stack) {
        const kind = baseResolverCache.get(p.allocationBaseId)!;
        const baseAmt = baseAmountFor(kind, rec, prior);
        const burden = round4(baseAmt * Number(r.rate));
        prior += burden;
        if (burden !== 0) {
          total = round4(total + burden);
          touched = true;
        }
      }
      if (touched) count += 1;
    }
    return { total, count };
  }

  const before = totalFor(beforeStack);
  const after = totalFor(afterStack);

  return {
    poolCode: pool.code,
    before: { totalBurden: before.total, recordCount: before.count },
    after: { totalBurden: after.total, recordCount: after.count },
    delta: round4(after.total - before.total),
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ── Read helpers used by the admin UI ───────────────────────────────────────

export async function listPools() {
  return await db.select().from(indirectCostPools).orderBy(asc(indirectCostPools.applyOrder));
}

export async function listBases() {
  return await db.execute<{
    id: number; code: string; name: string; description: string | null;
    resolver_kind: string; is_active: boolean;
  }>(sql`SELECT id, code, name, description, resolver_kind, is_active FROM allocation_bases ORDER BY id`)
    .then((r) => r.rows);
}

export async function listRatesForPool(poolId: number) {
  return await db
    .select()
    .from(indirectRates)
    .where(eq(indirectRates.poolId, poolId))
    .orderBy(desc(indirectRates.effectiveFrom), desc(indirectRates.id));
}

export async function listApplicationRuns(limit = 50) {
  return await db
    .select()
    .from(burdenApplicationRuns)
    .orderBy(desc(burdenApplicationRuns.id))
    .limit(limit);
}

export async function getRunBreakdown(runId: number) {
  const [run] = await db
    .select()
    .from(burdenApplicationRuns)
    .where(eq(burdenApplicationRuns.id, runId))
    .limit(1);
  if (!run) return null;

  const rows = await db
    .select()
    .from(appliedBurdenAmounts)
    .where(eq(appliedBurdenAmounts.applicationRunId, runId))
    .orderBy(asc(appliedBurdenAmounts.sourceRecordId), asc(appliedBurdenAmounts.poolId));

  return { run, rows };
}
