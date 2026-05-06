import { db } from '../../db';
import { journalEntries, journalLines, laborAccountConfig, laborCostRecords, laborPostingRuns } from '../../schema';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { verifyPeriodBurdenComplete } from './burdenRatesService';

// Compound grouping key for WAD-linked labor cost records.
// Every WAD record must resolve to exactly one journal entry.
// All five dimensions are used so that two records differing on any single
// field produce separate GL lines — costing stays attributable.
interface WadGroupKey {
  costType: string;
  chargeCodeId: number;
  productionWorkOrderId: string;
  projectId: string;
  departmentCode: string | null;
}

function wadGroupMapKey(k: WadGroupKey): string {
  return [
    k.costType,
    k.chargeCodeId,
    k.productionWorkOrderId,
    k.projectId,
    k.departmentCode ?? '__null__',
  ].join('\x00');
}

/**
 * Post labor costs for a period to the GL.
 *
 * Grouping rules
 * ──────────────
 * Non-WAD records (no productionWorkOrderId):
 *   Group by costType only → one journal entry per cost type.
 *   This preserves the legacy behaviour for indirect / overhead hours.
 *
 * WAD-linked records (productionWorkOrderId IS NOT NULL):
 *   Group by the full compound key:
 *     (costType, chargeCodeId, productionWorkOrderId, projectId, departmentCode)
 *   → one journal entry per unique combination.
 *   Reason: two punch sessions on the same WAD but different charge codes,
 *   or the same charge code on different WADs, must never be collapsed into
 *   a single GL line — that would destroy attribution.
 *
 * Fail-closed rules
 * ─────────────────
 * A WAD-linked record that is missing chargeCodeId OR projectId is an
 * incomplete attribution record.  Posting is aborted BEFORE any DB writes
 * until those records are remediated (charge code and project must be
 * assigned at punch-in time).
 *
 * Duplicate prevention
 * ────────────────────
 * Records that already carry a journalEntryId are silently skipped.
 * This guards against partial-run recovery scenarios; the run-level
 * POSTED status check is the primary guard.
 *
 * Returns 409 if the period run is already fully POSTED.
 */
export async function postLaborToGL(year: number, month: number, postedBy: string): Promise<{
  runId: number;
  journalEntryIds: number[];
  skippedAlreadyPosted: number;
}> {
  let runId = 0;
  const journalEntryIds: number[] = [];
  let skippedAlreadyPosted = 0;

  // All reads and writes are performed inside a single atomic transaction.
  // The posting run row is locked with SELECT ... FOR UPDATE at the start so
  // that a second concurrent caller blocks on that lock rather than racing past
  // the status check and creating duplicate journal entries.
  await db.transaction(async (tx) => {

    // ── 1. Lock the posting run row — blocks any concurrent posting for this period
    const [run] = await tx
      .select()
      .from(laborPostingRuns)
      .where(
        and(
          eq(laborPostingRuns.periodYear, year),
          eq(laborPostingRuns.periodMonth, month),
        ),
      )
      .for('update')
      .limit(1);

    if (!run) {
      throw new Error(
        `No calculated labor costs found for period ${year}-${month}. ` +
        `Run calculate-labor-costs first.`,
      );
    }
    if (run.status === 'POSTED') {
      const err: any = new Error(`Period ${year}-${month} has already been posted.`);
      err.statusCode = 409;
      throw err;
    }

    runId = run.id;

    // ── 2. Validate account config ────────────────────────────────────────────
    const [config] = await tx.select().from(laborAccountConfig).limit(1);
    if (!config) {
      throw new Error(
        'Labor account configuration is not set up. ' +
        'Please configure laborAccountConfig first.',
      );
    }

    // ── 2b. Adopt unlinked salaried records into this posting run ─────────────
    // Salaried labor_cost_records are created at payroll approval with
    // posting_run_id = null (no posting run exists at approval time).
    // Adopting them here — inside the same transaction, after the run is
    // locked — ensures they receive a journalEntryId stamp in step 8a
    // and are correctly marked as posted.
    // Filter: period matches AND posting_run_id IS NULL AND not yet posted.
    // This is idempotent: re-running postLaborToGL on a fully-stamped period
    // returns 409 before reaching here.
    await tx
      .update(laborCostRecords)
      .set({ postingRunId: run.id })
      .where(
        and(
          eq(laborCostRecords.periodYear, year),
          eq(laborCostRecords.periodMonth, month),
          isNull(laborCostRecords.postingRunId),
          isNull(laborCostRecords.journalEntryId),
        ),
      );

    // ── 3. Load cost records for the period ──────────────────────────────────
    const allRecords = await tx
      .select()
      .from(laborCostRecords)
      .where(
        and(
          eq(laborCostRecords.periodYear, year),
          eq(laborCostRecords.periodMonth, month),
        ),
      );

    if (allRecords.length === 0) {
      throw new Error(`No labor cost records found for period ${year}-${month}.`);
    }

    // ── 4. Duplicate prevention — skip already-stamped records ───────────────
    skippedAlreadyPosted = allRecords.filter((r) => r.journalEntryId != null).length;
    const records = allRecords.filter((r) => r.journalEntryId == null);

    if (records.length === 0) {
      throw new Error(
        `All ${allRecords.length} labor cost record(s) for period ${year}-${month} ` +
        `are already stamped with a journal entry. Nothing to post.`,
      );
    }

    // ── 5. Split WAD-linked vs non-WAD records ────────────────────────────────
    const wadRecords = records.filter((r) => r.productionWorkOrderId != null);
    const nonWadRecords = records.filter((r) => r.productionWorkOrderId == null);

    // ── 6. Fail-closed: WAD records must have chargeCodeId AND projectId ──────
    const missingAttribution = wadRecords.filter(
      (r) => r.chargeCodeId == null || r.projectId == null,
    );
    if (missingAttribution.length > 0) {
      const details = missingAttribution
        .map((r) => {
          const missing: string[] = [];
          if (r.chargeCodeId == null) missing.push('chargeCodeId');
          if (r.projectId == null) missing.push('projectId');
          return `  record ${r.id} (punch ${r.sourcePunchCanonicalId}): missing ${missing.join(', ')}`;
        })
        .join('\n');
      throw new Error(
        `Cannot post labor for ${year}-${month}: ` +
        `${missingAttribution.length} WAD-linked cost record(s) have incomplete GL attribution.\n` +
        `Resolve the missing fields at punch-in time before posting:\n${details}`,
      );
    }

    // ── 6b. Burden gate — every DIRECT cost record must have applied burden ──
    // EPOCH Constitution §5.6: indirect burden (fringe / overhead / G&A) must be
    // applied via the Burden Rates Engine BEFORE labor posts to GL.  See
    // docs/burden-rates-methodology.md and Task #80.
    const burdenStatus = await verifyPeriodBurdenComplete(year, month);
    if (!burdenStatus.ok) {
      const missing = burdenStatus.missing
        .slice(0, 25)
        .map((m) => `  record ${m.recordId}: missing pools ${m.missingPoolCodes.join(', ')}`)
        .join('\n');
      const more = burdenStatus.missing.length > 25
        ? `\n  ... and ${burdenStatus.missing.length - 25} more record(s)`
        : '';
      const err: any = new Error(
        `Cannot post labor for ${year}-${month}: ` +
        `${burdenStatus.missing.length} cost record(s) are missing applied burden. ` +
        `Run the Burden Rates Engine for this period first.\n${missing}${more}`,
      );
      err.code = 'MISSING_BURDEN';
      err.statusCode = 422;
      err.missingBurden = burdenStatus.missing;
      throw err;
    }

    // ── 7. Build aggregation buckets ──────────────────────────────────────────
    const costTypeToAccountId: Record<string, number> = {
      DIRECT: config.directLaborAccountId,
      OVERHEAD: config.overheadLaborAccountId,
      G_AND_A: config.gaLaborAccountId,
    };

    // Non-WAD: group by costType only (legacy behaviour)
    const nonWadTotals: Record<string, number> = {};
    for (const rec of nonWadRecords) {
      const ct = rec.costType;
      nonWadTotals[ct] = (nonWadTotals[ct] ?? 0) + Number(rec.dollarCost);
    }

    // WAD: group by full compound key
    const wadGroups = new Map<string, { key: WadGroupKey; total: number }>();
    for (const rec of wadRecords) {
      const key: WadGroupKey = {
        costType: rec.costType,
        chargeCodeId: rec.chargeCodeId as number,
        productionWorkOrderId: rec.productionWorkOrderId as string,
        projectId: rec.projectId as string,
        departmentCode: rec.departmentCode ?? null,
      };
      const mk = wadGroupMapKey(key);
      const existing = wadGroups.get(mk);
      if (existing) {
        existing.total += Number(rec.dollarCost);
      } else {
        wadGroups.set(mk, { key, total: Number(rec.dollarCost) });
      }
    }

    const effectiveDate = new Date(year, month - 1, 1);

    // ── 8a. Non-WAD records — one journal entry per costType ─────────────────
    for (const [costType, totalAmount] of Object.entries(nonWadTotals)) {
      if (totalAmount <= 0) continue;

      const debitAccountId = costTypeToAccountId[costType];
      if (!debitAccountId) continue;

      const [entry] = await tx.insert(journalEntries).values({
        transactionType: 'LABOR_COST',
        referenceType: 'labor_posting_run',
        referenceId: run.id,
        effectiveDate,
        status: 'DRAFT',
        memo: `Labor cost posting: ${costType} — ${year}-${String(month).padStart(2, '0')}`,
        createdBy: postedBy,
      }).returning();

      journalEntryIds.push(entry.id);

      await tx.insert(journalLines).values({
        journalEntryId: entry.id,
        accountId: debitAccountId,
        debitAmount: totalAmount,
        creditAmount: 0,
      });
      await tx.insert(journalLines).values({
        journalEntryId: entry.id,
        accountId: config.accruedPayrollAccountId,
        debitAmount: 0,
        creditAmount: totalAmount,
      });

      // Stamp matching non-WAD records (IS NULL guard excludes WAD records)
      await tx
        .update(laborCostRecords)
        .set({ journalEntryId: entry.id })
        .where(
          and(
            eq(laborCostRecords.postingRunId, run.id),
            eq(laborCostRecords.costType, costType),
            isNull(laborCostRecords.productionWorkOrderId),
            isNull(laborCostRecords.journalEntryId),
          ),
        );
    }

    // ── 8b. WAD records — one journal entry per compound grouping key ─────────
    for (const { key, total: totalAmount } of wadGroups.values()) {
      if (totalAmount <= 0) continue;

      const debitAccountId = costTypeToAccountId[key.costType];
      if (!debitAccountId) continue;

      const periodStr = `${year}-${String(month).padStart(2, '0')}`;
      const memo = [
        `Labor cost posting: WAD`,
        `cc=${key.chargeCodeId}`,
        `wad=${key.productionWorkOrderId}`,
        `proj=${key.projectId}`,
        key.departmentCode ? `dept=${key.departmentCode}` : null,
        `${key.costType}`,
        periodStr,
      ].filter(Boolean).join(' | ');

      const [entry] = await tx.insert(journalEntries).values({
        transactionType: 'LABOR_COST',
        referenceType: 'labor_posting_run',
        referenceId: run.id,
        effectiveDate,
        status: 'DRAFT',
        memo,
        createdBy: postedBy,
      }).returning();

      journalEntryIds.push(entry.id);

      await tx.insert(journalLines).values({
        journalEntryId: entry.id,
        accountId: debitAccountId,
        debitAmount: totalAmount,
        creditAmount: 0,
      });
      await tx.insert(journalLines).values({
        journalEntryId: entry.id,
        accountId: config.accruedPayrollAccountId,
        debitAmount: 0,
        creditAmount: totalAmount,
      });

      // Stamp only the exact bucket — all five key fields must match.
      // departmentCode may be null, requiring isNull() instead of eq().
      const deptCondition = key.departmentCode !== null
        ? eq(laborCostRecords.departmentCode, key.departmentCode)
        : isNull(laborCostRecords.departmentCode);

      await tx
        .update(laborCostRecords)
        .set({ journalEntryId: entry.id })
        .where(
          and(
            eq(laborCostRecords.postingRunId, run.id),
            isNotNull(laborCostRecords.productionWorkOrderId),
            eq(laborCostRecords.productionWorkOrderId, key.productionWorkOrderId),
            eq(laborCostRecords.projectId, key.projectId),
            eq(laborCostRecords.chargeCodeId, key.chargeCodeId),
            eq(laborCostRecords.costType, key.costType),
            deptCondition,
            isNull(laborCostRecords.journalEntryId),
          ),
        );
    }

    // ── 8c. Mark the run POSTED — inside the same transaction ─────────────────
    await tx.update(laborPostingRuns)
      .set({ status: 'POSTED', postedBy, postedAt: new Date() })
      .where(eq(laborPostingRuns.id, run.id));
  });

  return { runId, journalEntryIds, skippedAlreadyPosted };
}

/**
 * Void a POSTED labor period.
 * - Marks all linked journal entries VOIDED
 * - Clears journalEntryId and postingRunId back-links on cost records
 * - Marks the posting run VOIDED
 * - All changes are atomic (single DB transaction), including the run lookup and status checks
 * - Returns 404 if no posting run found, 409 if already VOIDED
 */
export async function voidLaborPosting(year: number, month: number): Promise<{
  runId: number;
  voidedEntryIds: number[];
}> {
  let runId: number | null = null;
  const voidedEntryIds: number[] = [];

  await db.transaction(async (tx) => {
    // Load the posting run inside the transaction so lookup and writes are atomic
    const [run] = await tx
      .select()
      .from(laborPostingRuns)
      .where(
        and(
          eq(laborPostingRuns.periodYear, year),
          eq(laborPostingRuns.periodMonth, month),
        ),
      )
      .limit(1);

    if (!run) {
      const err: any = new Error(`No labor posting run found for period ${year}-${month}.`);
      err.statusCode = 404;
      throw err;
    }
    if (run.status === 'VOIDED') {
      const err: any = new Error(`Period ${year}-${month} has already been voided.`);
      err.statusCode = 409;
      throw err;
    }
    if (run.status !== 'POSTED') {
      const err: any = new Error(
        `Period ${year}-${month} cannot be voided: ` +
        `run is in status '${run.status}', expected 'POSTED'.`,
      );
      err.statusCode = 409;
      throw err;
    }

    runId = run.id;

    // Collect distinct journal entry IDs linked to cost records for this run
    const linkedRows = await tx
      .select({ journalEntryId: laborCostRecords.journalEntryId })
      .from(laborCostRecords)
      .where(
        and(
          eq(laborCostRecords.postingRunId, run.id),
          isNotNull(laborCostRecords.journalEntryId),
        ),
      );

    const entryIds = [...new Set(
      linkedRows
        .map((r) => r.journalEntryId)
        .filter((id): id is number => id !== null),
    )];

    if (entryIds.length > 0) {
      // Mark all linked journal entries as VOIDED
      await tx
        .update(journalEntries)
        .set({ status: 'VOIDED' })
        .where(inArray(journalEntries.id, entryIds));

      voidedEntryIds.push(...entryIds);
    }

    // Clear journalEntryId and postingRunId back-links on cost records for the period
    await tx
      .update(laborCostRecords)
      .set({ journalEntryId: null, postingRunId: null })
      .where(
        and(
          eq(laborCostRecords.periodYear, year),
          eq(laborCostRecords.periodMonth, month),
        ),
      );

    // Mark the posting run as VOIDED
    await tx
      .update(laborPostingRuns)
      .set({ status: 'VOIDED' })
      .where(eq(laborPostingRuns.id, run.id));
  });

  return { runId: runId!, voidedEntryIds };
}
