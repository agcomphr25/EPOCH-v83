/**
 * seedHourlyRates.ts
 *
 * One-off update script: populates realistic hourly rates for employees that
 * appear in punch_ledger or labor_allocations but currently have a null or zero
 * hourly_rate. Idempotent — existing non-zero rates are never overwritten.
 *
 * Rate assignment is deterministic:
 *   employee_id % 6  →  rate
 *   0  →  $25.00
 *   1  →  $28.00
 *   2  →  $32.00
 *   3  →  $36.00
 *   4  →  $40.00
 *   5  →  $45.00
 *
 * Usage:
 *   npx tsx server/scripts/seedHourlyRates.ts
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

const RATE_TABLE: Record<number, number> = { 0: 25, 1: 28, 2: 32, 3: 36, 4: 40, 5: 45 };

async function seedHourlyRates() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       seedHourlyRates — populate employee rates      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Step 1: Identify target employees
  // Union of: punch_ledger.employee_id (REGULAR sessions) + labor_allocations.employee_id
  const targetResult = await db.execute(sql`
    SELECT DISTINCT e.id, e.hourly_rate
    FROM employees e
    WHERE e.id IN (
      SELECT DISTINCT pl.employee_id
      FROM punch_ledger pl
      WHERE pl.labor_class = 'REGULAR'
        AND pl.employee_id IS NOT NULL

      UNION

      SELECT DISTINCT la.employee_id
      FROM labor_allocations la
      WHERE la.employee_id IS NOT NULL
    )
    ORDER BY e.id
  `);

  const targetEmployees = targetResult.rows as { id: number; hourly_rate: string | null }[];

  console.log(`  Found ${targetEmployees.length} employee(s) referenced by punch_ledger or labor_allocations.`);
  console.log('');

  // Step 2: Filter down to those with null or zero rates
  const toUpdate = targetEmployees.filter((e) => {
    const rate = e.hourly_rate != null ? parseFloat(e.hourly_rate) : null;
    return rate === null || rate === 0 || isNaN(rate);
  });

  const alreadySet = targetEmployees.length - toUpdate.length;

  if (toUpdate.length === 0) {
    console.log(`  All ${targetEmployees.length} employee(s) already have non-zero hourly rates.`);
    console.log('  Nothing to update. Exiting.');
    console.log('');
    process.exit(0);
  }

  console.log(`  ${alreadySet} employee(s) already have non-zero rates (will not be touched).`);
  console.log(`  ${toUpdate.length} employee(s) need hourly_rate populated.`);
  console.log('');

  // Step 3: Execute per-row UPDATEs with idempotency guard
  let updatedCount = 0;
  const updateLog: { id: number; newRate: number }[] = [];

  for (const emp of toUpdate) {
    const newRate = RATE_TABLE[emp.id % 6];
    const result = await db.execute(sql`
      UPDATE employees
      SET hourly_rate = ${newRate}
      WHERE id = ${emp.id}
        AND (hourly_rate IS NULL OR hourly_rate = 0)
    `);

    const rowCount = (result as unknown as { rowCount: number }).rowCount ?? 0;
    if (rowCount > 0) {
      updatedCount++;
      updateLog.push({ id: emp.id, newRate });
    }
  }

  // Step 4: Summary
  console.log('  Update results:');
  for (const entry of updateLog) {
    console.log(`    Employee #${entry.id} → $${entry.newRate.toFixed(2)}/hr`);
  }
  console.log('');
  console.log(`  ✓  Updated ${updatedCount} employee(s) with realistic hourly rates.`);
  console.log('');

  process.exit(0);
}

seedHourlyRates().catch((err) => {
  console.error('[seedHourlyRates] Fatal error:', err);
  process.exit(1);
});
