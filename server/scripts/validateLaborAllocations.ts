/**
 * Validate Labor Allocations
 *
 * Runs integrity checks against the labor_allocations table and reports:
 *   (a) punch_ledger rows with zero matching labor_allocations (missing coverage)
 *   (b) Duration mismatches between closed sessions and their allocations (>1s threshold)
 *   (c) labor_allocations rows whose punch_ledger_id no longer exists (orphans)
 *   (d) Sessions with more than one OPEN allocation
 *   (e) Summary table: total sessions, total allocations, coverage %
 *
 * Exits with code 1 if any check fails (suitable for CI).
 *
 * Run with: npx tsx server/scripts/validateLaborAllocations.ts
 */

import { db } from '../db';
import { punchLedger, laborAllocations } from '../schema';
import { sql } from 'drizzle-orm';

async function validate() {
  console.log('Starting labor allocations validation...\n');

  let failures = 0;

  // ── (e) Totals first ─────────────────────────────────────────────────────────
  const [sessionCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(punchLedger);

  const [allocationCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(laborAllocations);

  const totalSessions = sessionCount.count;
  const totalAllocations = allocationCount.count;

  // Sessions that have at least one allocation
  const [coveredCount] = await db
    .select({ count: sql<number>`COUNT(DISTINCT punch_ledger_id)::int` })
    .from(laborAllocations);

  const coveragePct = totalSessions > 0
    ? ((coveredCount.count / totalSessions) * 100).toFixed(2)
    : '100.00';

  console.log('=== Summary ===');
  console.log(`  Total sessions    : ${totalSessions}`);
  console.log(`  Total allocations : ${totalAllocations}`);
  console.log(`  Covered sessions  : ${coveredCount.count}`);
  console.log(`  Coverage          : ${coveragePct}%\n`);

  // ── (a) Missing coverage ──────────────────────────────────────────────────────
  const missing = await db.execute(sql`
    SELECT pl.id
    FROM punch_ledger pl
    LEFT JOIN labor_allocations la ON la.punch_ledger_id = pl.id
    WHERE la.id IS NULL
    ORDER BY pl.id
  `);

  const missingRows = missing.rows as { id: number }[];
  if (missingRows.length > 0) {
    failures++;
    console.error(`FAIL [missing coverage] ${missingRows.length} punch_ledger row(s) have no allocation:`);
    missingRows.slice(0, 20).forEach((r) => console.error(`  punch_ledger.id = ${r.id}`));
    if (missingRows.length > 20) console.error(`  ... and ${missingRows.length - 20} more`);
  } else {
    console.log('PASS [missing coverage] All sessions have at least one allocation.');
  }

  // ── (b) Duration mismatches ───────────────────────────────────────────────────
  const durationMismatches = await db.execute(sql`
    SELECT
      pl.id AS session_id,
      EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) AS session_seconds,
      COALESCE(
        SUM(EXTRACT(EPOCH FROM (COALESCE(la.allocation_end, NOW()) - la.allocation_start))),
        0
      ) AS alloc_seconds
    FROM punch_ledger pl
    LEFT JOIN labor_allocations la ON la.punch_ledger_id = pl.id
    WHERE pl.clock_out IS NOT NULL
    GROUP BY pl.id
    HAVING ABS(
      EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) -
      COALESCE(
        SUM(EXTRACT(EPOCH FROM (COALESCE(la.allocation_end, NOW()) - la.allocation_start))),
        0
      )
    ) > 1
    ORDER BY pl.id
  `);

  const mismatchRows = durationMismatches.rows as { session_id: number; session_seconds: number; alloc_seconds: number }[];
  if (mismatchRows.length > 0) {
    failures++;
    console.error(`\nFAIL [duration mismatch] ${mismatchRows.length} closed session(s) have allocation duration mismatch (>1s):`);
    mismatchRows.slice(0, 20).forEach((r) =>
      console.error(`  session ${r.session_id}: session=${Number(r.session_seconds).toFixed(1)}s allocs=${Number(r.alloc_seconds).toFixed(1)}s`)
    );
    if (mismatchRows.length > 20) console.error(`  ... and ${mismatchRows.length - 20} more`);
  } else {
    console.log('PASS [duration mismatch] No closed-session duration mismatches found.');
  }

  // ── (c) Orphan allocations ────────────────────────────────────────────────────
  const orphans = await db.execute(sql`
    SELECT la.id, la.punch_ledger_id
    FROM labor_allocations la
    LEFT JOIN punch_ledger pl ON pl.id = la.punch_ledger_id
    WHERE pl.id IS NULL
    ORDER BY la.id
  `);

  const orphanRows = orphans.rows as { id: number; punch_ledger_id: number }[];
  if (orphanRows.length > 0) {
    failures++;
    console.error(`\nFAIL [orphan allocations] ${orphanRows.length} labor_allocations row(s) have no matching punch_ledger:`);
    orphanRows.slice(0, 20).forEach((r) =>
      console.error(`  labor_allocations.id=${r.id} punch_ledger_id=${r.punch_ledger_id}`)
    );
    if (orphanRows.length > 20) console.error(`  ... and ${orphanRows.length - 20} more`);
  } else {
    console.log('PASS [orphan allocations] No orphan allocations found.');
  }

  // ── (d) Multiple OPEN allocations per session ─────────────────────────────────
  const multiOpen = await db.execute(sql`
    SELECT punch_ledger_id, COUNT(*)::int AS open_count
    FROM labor_allocations
    WHERE status = 'OPEN'
    GROUP BY punch_ledger_id
    HAVING COUNT(*) > 1
    ORDER BY punch_ledger_id
  `);

  const multiOpenRows = multiOpen.rows as { punch_ledger_id: number; open_count: number }[];
  if (multiOpenRows.length > 0) {
    failures++;
    console.error(`\nFAIL [multiple OPEN] ${multiOpenRows.length} session(s) have more than one OPEN allocation:`);
    multiOpenRows.slice(0, 20).forEach((r) =>
      console.error(`  punch_ledger_id=${r.punch_ledger_id} open_count=${r.open_count}`)
    );
    if (multiOpenRows.length > 20) console.error(`  ... and ${multiOpenRows.length - 20} more`);
  } else {
    console.log('PASS [multiple OPEN] No sessions have multiple OPEN allocations.');
  }

  // ── Result ────────────────────────────────────────────────────────────────────
  console.log('\n=== Validation Result ===');
  if (failures > 0) {
    console.error(`FAILED — ${failures} check(s) did not pass.`);
    process.exit(1);
  } else {
    console.log('All checks passed.');
  }
}

if (require.main === module) {
  validate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { validate };
