import { db } from '../../db';
import { storage } from '../../storage';
import { journalEntries, journalLines, laborPostingRuns } from '../../schema';
import { eq } from 'drizzle-orm';
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
    }

    // Mark the run as POSTED within the same transaction
    await tx.update(laborPostingRuns)
      .set({ status: 'POSTED', postedBy, postedAt: new Date() })
      .where(eq(laborPostingRuns.id, run.id));
  });

  return { runId: run.id, journalEntryIds };
}
