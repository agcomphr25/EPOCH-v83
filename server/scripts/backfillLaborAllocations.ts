/**
 * Backfill Labor Allocations
 *
 * For each punch_ledger row, seeds exactly one labor_allocations row derived
 * from the session's current attribution fields. Idempotent — repeated runs
 * produce no duplicates. Sessions that already have a labor_allocations row
 * are skipped.
 *
 * Run with: npx tsx server/scripts/backfillLaborAllocations.ts
 */

import { db } from '../db';
import { punchLedger, laborAllocations } from '../schema';
import { inArray } from 'drizzle-orm';

const BATCH_SIZE = 100;

async function backfill() {
  console.log('Starting labor allocations backfill...\n');

  let processed = 0;
  let skipped = 0;
  let inserted = 0;
  let errors = 0;
  let offset = 0;

  while (true) {
    const batch = await db
      .select()
      .from(punchLedger)
      .orderBy(punchLedger.id)
      .limit(BATCH_SIZE)
      .offset(offset);

    if (batch.length === 0) break;

    const batchIds = batch.map((r) => r.id);

    // Find which punch_ledger IDs already have an allocation
    const existing = await db
      .select({ punchLedgerId: laborAllocations.punchLedgerId })
      .from(laborAllocations)
      .where(inArray(laborAllocations.punchLedgerId, batchIds));

    const existingSet = new Set(existing.map((r) => r.punchLedgerId));

    for (const session of batch) {
      processed++;
      if (existingSet.has(session.id)) {
        skipped++;
        continue;
      }

      try {
        const status = session.clockOut == null ? 'OPEN' : 'CLOSED';
        await db.insert(laborAllocations).values({
          punchLedgerId: session.id,
          employeeId: session.employeeId,
          allocationStart: session.clockIn,
          allocationEnd: session.clockOut ?? undefined,
          chargeCodeId: session.chargeCodeId ?? null,
          travelerId: session.travelerId ?? null,
          travelerStepId: session.travelerStepId ?? null,
          productionWorkOrderId: session.productionWorkOrderId ?? null,
          projectId: session.projectId ?? null,
          department: session.department ?? null,
          operation: session.operation ?? null,
          laborClass: session.laborClass ?? 'REGULAR',
          status,
          certificationStatus: session.certificationStatus ?? null,
          isOverrun: session.isOverrun ?? false,
          overrunReason: session.overrunReason ?? null,
          laborApprovalId: session.laborApprovalId ?? null,
          laborBudgetOverrideId: session.laborBudgetOverrideId ?? null,
          source: 'BACKFILL',
          sequenceOrder: 1,
          createdBy: session.createdBy ?? null,
          createdByDisplayName: session.createdByDisplayName ?? null,
        });
        inserted++;
      } catch (err) {
        errors++;
        console.error(`  ERROR on punch_ledger id=${session.id}:`, err);
      }
    }

    const batchEnd = offset + batch.length;
    console.log(`  Processed ${batchEnd} sessions — inserted: ${inserted}, skipped: ${skipped}, errors: ${errors}`);

    if (batch.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log('\n--- Backfill Summary ---');
  console.log(`  Total processed : ${processed}`);
  console.log(`  Skipped         : ${skipped}`);
  console.log(`  Inserted        : ${inserted}`);
  console.log(`  Errors          : ${errors}`);

  if (errors > 0) {
    console.error('\nBackfill completed with errors.');
    process.exit(1);
  } else {
    console.log('\nBackfill completed successfully.');
  }
}

if (require.main === module) {
  backfill()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { backfill };
