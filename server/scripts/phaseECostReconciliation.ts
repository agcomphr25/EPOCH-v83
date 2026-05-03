/**
 * Phase E Labor Cost Reconciliation Script
 *
 * Runs both costing models against real data and produces a side-by-side
 * reconciliation report so finance can see exactly where cost attribution
 * differs before Phase F flips the live reads over.
 *
 * Legacy model:    total session hours × rate → entire cost → punch_ledger chargeCodeId
 * Allocation model: per-segment hours × rate → cost → that segment's chargeCodeId
 *
 * Core reconciliation logic is shared with the API route via
 * server/src/services/laborReconcileService.ts so both paths stay in sync.
 *
 * Usage:
 *   npx tsx server/scripts/phaseECostReconciliation.ts [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--output path/to/results.json]
 *
 * Defaults (when no flags given): current bi-weekly pay period.
 *
 * Exit codes:
 *   0 — all sessions with allocation data reconcile between models
 *   1 — one or more sessions have a cost discrepancy (data integrity problem)
 *
 * Note: sessions with no labor_allocations rows (pre-dual-write historical data)
 * are flagged as "N/A" and are NOT counted as integrity errors. Run
 * backfillLaborAllocations.ts first to cover those sessions.
 */

import { getPayPeriod } from '../src/services/payPeriod';
import { reconcileLaborCostsInRange } from '../src/services/laborReconcileService';
import type { SessionReconciliation } from '../src/services/laborReconcileService';
import * as fs from 'fs';
import * as path from 'path';

// ── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let fromArg: string | null = null;
  let toArg: string | null = null;
  let outputArg: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      fromArg = args[++i];
    } else if (args[i] === '--to' && args[i + 1]) {
      toArg = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      outputArg = args[++i];
    }
  }

  // Default: current bi-weekly pay period (anchored to 2024-01-01)
  const currentPeriod = getPayPeriod(new Date());

  const from = fromArg ? new Date(`${fromArg}T00:00:00`) : currentPeriod.start;
  const to = toArg ? new Date(`${toArg}T23:59:59.999`) : currentPeriod.end;

  // Guard against malformed date strings
  if (isNaN(from.getTime())) {
    console.error(`[phaseECostReconciliation] Invalid --from date: "${fromArg}". Expected YYYY-MM-DD.`);
    process.exit(1);
  }
  if (isNaN(to.getTime())) {
    console.error(`[phaseECostReconciliation] Invalid --to date: "${toArg}". Expected YYYY-MM-DD.`);
    process.exit(1);
  }
  if (from > to) {
    console.error(`[phaseECostReconciliation] --from (${fromArg}) must not be after --to (${toArg}).`);
    process.exit(1);
  }

  return { from, to, outputPath: outputArg };
}

// ── Table formatting helpers ─────────────────────────────────────────────────

function pad(s: string, w: number, right = false): string {
  const str = s.length > w ? s.slice(0, w - 1) + '…' : s;
  return right ? str.padStart(w) : str.padEnd(w);
}

function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function reconcile() {
  const { from, to, outputPath } = parseArgs();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║       Phase E — Labor Cost Reconciliation Report                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Date range : ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`);
  console.log('');

  // Delegate core reconciliation to the shared helper (also used by the API route)
  const { sessions: results, summary } = await reconcileLaborCostsInRange(from, to);

  const { totalSessions, matchCount, mismatchCount, naCount, totalCostLegacy, totalCostAllocation, grandDelta } = summary;

  console.log(`  Found ${totalSessions} closed REGULAR session(s) in range.`);
  console.log('');

  if (results.length === 0) {
    console.log('  No sessions to reconcile. Exiting with code 0.');
    process.exit(0);
  }

  // ── Print reconciliation table ─────────────────────────────────────────────
  const COL = {
    sessionId: 10,
    empId: 7,
    date: 12,
    hours: 8,
    rate: 8,
    ccLegacy: 16,
    costLegacy: 12,
    ccSplit: 20,
    costSplit: 12,
    delta: 10,
    flag: 7,
  };

  const header = [
    pad('SessionID', COL.sessionId),
    pad('EmpID', COL.empId),
    pad('Date', COL.date),
    pad('Hours', COL.hours, true),
    pad('Rate', COL.rate, true),
    pad('CC (Legacy)', COL.ccLegacy),
    pad('Cost(Legacy)', COL.costLegacy, true),
    pad('CC (Split)', COL.ccSplit),
    pad('Cost(Split)', COL.costSplit, true),
    pad('Delta', COL.delta, true),
    pad('Status', COL.flag),
  ].join(' | ');

  const divider = '─'.repeat(header.length);

  console.log('═'.repeat(header.length));
  console.log('  Session-Level Reconciliation');
  console.log('═'.repeat(header.length));
  console.log(header);
  console.log(divider);

  for (const r of results) {
    let flag: string;
    if (r.status === 'NO_DATA') flag = ' N/A  ';
    else if (r.status === 'ERR') flag = '⚠ ERR ';
    else flag = '  OK  ';

    if (r.status === 'NO_DATA') {
      const row = [
        pad(String(r.sessionId), COL.sessionId),
        pad(String(r.employeeId), COL.empId),
        pad(r.date, COL.date),
        pad(r.totalHours.toFixed(2), COL.hours, true),
        pad(`$${r.rateUsed.toFixed(2)}`, COL.rate, true),
        pad(r.legacy.chargeCode, COL.ccLegacy),
        pad(formatCurrency(r.legacy.cost), COL.costLegacy, true),
        pad('(no allocations)', COL.ccSplit),
        pad('—', COL.costSplit, true),
        pad('—', COL.delta, true),
        pad(flag, COL.flag),
      ].join(' | ');
      console.log(row);
      continue;
    }

    // One row per allocation segment; session-level fields only on first row
    const displayAllocs =
      r.allocation.length > 0
        ? r.allocation
        : [{ chargeCode: '(no segments)', cost: 0, hours: 0 }];

    for (let i = 0; i < displayAllocs.length; i++) {
      const alloc = displayAllocs[i];
      const row = [
        i === 0 ? pad(String(r.sessionId), COL.sessionId) : pad('', COL.sessionId),
        i === 0 ? pad(String(r.employeeId), COL.empId) : pad('', COL.empId),
        i === 0 ? pad(r.date, COL.date) : pad('', COL.date),
        i === 0 ? pad(r.totalHours.toFixed(2), COL.hours, true) : pad('', COL.hours),
        i === 0 ? pad(`$${r.rateUsed.toFixed(2)}`, COL.rate, true) : pad('', COL.rate),
        i === 0 ? pad(r.legacy.chargeCode, COL.ccLegacy) : pad('', COL.ccLegacy),
        i === 0 ? pad(formatCurrency(r.legacy.cost), COL.costLegacy, true) : pad('', COL.costLegacy),
        pad(alloc.chargeCode, COL.ccSplit),
        pad(formatCurrency(alloc.cost), COL.costSplit, true),
        i === 0 ? pad(r.delta != null ? formatCurrency(r.delta) : '—', COL.delta, true) : pad('', COL.delta),
        i === 0 ? pad(flag, COL.flag) : pad('', COL.flag),
      ].join(' | ');
      console.log(row);
    }
  }

  console.log(divider);
  console.log('');

  // ── Summary ────────────────────────────────────────────────────────────────
  const coveredSessions = matchCount + mismatchCount;
  const grandReconciled = Math.abs(grandDelta) <= 0.01;

  console.log('═'.repeat(60));
  console.log('  Summary');
  console.log('═'.repeat(60));
  console.log(`  Sessions processed                : ${results.length}`);
  console.log(`  Sessions with allocation data     : ${coveredSessions}`);
  console.log(`  Sessions without allocations (N/A): ${naCount}`);
  console.log(`  Sessions with cost mismatch (ERR) : ${mismatchCount}`);
  console.log('');
  console.log(`  Total cost — legacy model         : ${formatCurrency(totalCostLegacy)}`);
  console.log(`  Total cost — allocation model     : ${formatCurrency(totalCostAllocation)}`);
  console.log(`  Grand delta (legacy − alloc)      : ${formatCurrency(grandDelta)}`);
  console.log('');

  if (naCount > 0) {
    console.log(`  ℹ  ${naCount} session(s) have no allocation rows (pre-dual-write data).`);
    console.log('     Run backfillLaborAllocations.ts to generate allocation rows for them.');
    console.log('');
  }

  if (mismatchCount > 0) {
    console.error(`  ⚠ RECONCILIATION FAILED — ${mismatchCount} session(s) have a cost discrepancy between models.`);
    console.error('    This indicates a DATA INTEGRITY problem, not just reattribution.');
    console.error('    Investigate the ERR-flagged sessions before proceeding to Phase F.');
    console.error('');
  } else if (coveredSessions > 0) {
    console.log(`  ✓  All ${coveredSessions} session(s) with allocation data reconcile correctly.`);
    if (grandReconciled) {
      console.log('  ✓  Grand total reconciles: legacy model === allocation model.');
    } else {
      console.error(`  ⚠  Grand total delta is ${formatCurrency(grandDelta)} (>${formatCurrency(0.01)} threshold).`);
    }
    console.log('');
  } else {
    console.log('  ℹ  No sessions with allocation data found in this range.');
    console.log('');
  }

  console.log('═'.repeat(60));
  console.log('');

  // ── Optional JSON output ───────────────────────────────────────────────────
  if (outputPath) {
    const outputData = {
      generatedAt: new Date().toISOString(),
      dateRange: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      },
      summary: {
        sessionsProcessed: results.length,
        sessionsWithAllocationData: coveredSessions,
        sessionsWithoutAllocations: naCount,
        sessionCostMismatches: mismatchCount,
        totalCostLegacy,
        totalCostAllocation,
        grandDelta,
        grandReconciled,
      },
      sessions: results.map((r: SessionReconciliation) => ({
        sessionId: r.sessionId,
        employeeId: r.employeeId,
        date: r.date,
        totalHours: r.totalHours,
        rateUsed: r.rateUsed,
        rateSource: r.rateSource,
        status: r.status,
        legacy: r.legacy,
        allocation: r.allocation,
        costSplit: r.costSplit,
        delta: r.delta,
        attributionDiff: r.attributionDiff,
      })),
    };

    const absPath = path.resolve(outputPath);
    fs.writeFileSync(absPath, JSON.stringify(outputData, null, 2));
    console.log(`  JSON output written to: ${absPath}`);
    console.log('');
  }

  // Exit 1 when:
  //   (a) any covered session has a per-session cost mismatch (ERR), OR
  //   (b) the grand totals do not reconcile (accumulation of small same-direction deltas).
  // NO_DATA sessions do not trigger exit 1 — they are coverage gaps, not integrity failures.
  process.exit((mismatchCount > 0 || !grandReconciled) ? 1 : 0);
}

reconcile().catch((err) => {
  console.error('[phaseECostReconciliation] Fatal error:', err);
  process.exit(1);
});
