import { db } from '../../db';
import { storage } from '../../storage';
import { journalEntries, journalLines, laborCostRecords, laborPostingRuns } from '../../schema';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { CostType } from './laborCostingService';

/**
 * Post labor costs for a period to the GL.
 * - Aggregates labor_cost_records by cost_type
 * - Validates labor_account_config is set
 * - Wraps all DB writes in a single transaction
 * - Creates one journal_entry per cost_type with activity
 * - Each entry has two lines: debit cost-type account, credit accrued payroll
 * - Returns 409 if period is already posted
 */
export async function postLaborToGL(year: number, month: number, postedBy: string): Promise<{
  runId: number;
  journalEntryIds: number[];
}> {
  // Verify there's a calculated run to post
  const run = await storage.getLaborPostingRunByPeriod(year, month);
  if (!run) {
    throw new Error(`No calculated labor costs found for period ${year}-${month}. Run calculate-labor-costs first.`);
  }
  if (run.status === 'POSTED') {
    const err: any = new Error(`Period ${year}-${month} has already been posted.`);
    err.statusCode = 409;
    throw err;
  }

  // Validate account config
  const config = await storage.getLaborAccountConfig();
  if (!config) {
    throw new Error('Labor account configuration is not set up. Please configure laborAccountConfig first.');
  }

  // Load cost records for the period
  const records = await storage.getLaborCostRecordsByPeriod(year, month);
  if (records.length === 0) {
    throw new Error(`No labor cost records found for period ${year}-${month}.`);
  }

  // Aggregate totals by cost type
  const totals: Record<string, number> = {};
  for (const rec of records) {
    const ct = rec.costType;
    totals[ct] = (totals[ct] ?? 0) + Number(rec.dollarCost);
  }

  const costTypeToAccountId: Record<string, number> = {
    DIRECT: config.directLaborAccountId,
    OVERHEAD: config.overheadLaborAccountId,
    G_AND_A: config.gaLaborAccountId,
  };

  const effectiveDate = new Date(year, month - 1, 1);
  const journalEntryIds: number[] = [];

  // Execute all writes in a single transaction
  await db.transaction(async (tx) => {
    for (const [costType, totalAmount] of Object.entries(totals)) {
      if (totalAmount <= 0) continue;

      const debitAccountId = costTypeToAccountId[costType];
      if (!debitAccountId) continue;

      // Create journal entry
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

      // Debit the cost-type expense account
      await tx.insert(journalLines).values({
        journalEntryId: entry.id,
        accountId: debitAccountId,
        debitAmount: totalAmount,
        creditAmount: 0,
      });

      // Credit accrued payroll
      await tx.insert(journalLines).values({
        journalEntryId: entry.id,
        accountId: config.accruedPayrollAccountId,
        debitAmount: 0,
        creditAmount: totalAmount,
      });

      // Stamp journal_entry_id on matching cost records for this run + costType
      await tx
        .update(laborCostRecords)
        .set({ journalEntryId: entry.id })
        .where(
          and(
            eq(laborCostRecords.postingRunId, run.id),
            eq(laborCostRecords.costType, costType),
          ),
        );
    }

    // Mark the run as POSTED within the same transaction
    await tx.update(laborPostingRuns)
      .set({ status: 'POSTED', postedBy, postedAt: new Date() })
      .where(eq(laborPostingRuns.id, run.id));
  });

  return { runId: run.id, journalEntryIds };
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
      const err: any = new Error(`Period ${year}-${month} cannot be voided: run is in status '${run.status}', expected 'POSTED'.`);
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
