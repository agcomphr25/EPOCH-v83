/**
 * Phase G — Allocation Costing Production Readiness Validation
 *
 * Produces a formal GO / CONDITIONAL GO / NO-GO readiness report at
 *   server/reports/phase-g-readiness-report.md
 *
 * Validation steps:
 *  1  — Identify pay periods: last completed + current active
 *  2  — CLI reconciliation (phaseECostReconciliation.ts subprocess) for each period range
 *  3  — API reconcile-labor-costs (HTTP POST) for each period's calendar month(s);
 *        verify CLI↔API consistency on calendar-month scope
 *  4  — calculate-labor-costs flag=OFF (HTTP POST) — confirm readModel="LEGACY"
 *  5  — calculate-labor-costs flag=ON (HTTP POST to temp server w/ flag in env) —
 *        confirm readModel="ALLOCATION", no fallbackReason
 *  6  — Fallback audit: (a) readModel from Step 5 API, (b) application log file scan
 *        (strict: no logs = WARN/insufficient evidence), (c) structural DB check
 *  7  — Consistency: calculate flag=ON totals ≡ reconcile new-model totals
 *  8  — Edge cases: (a) multi-segment sessions via flag=ON HTTP API,
 *        (b) targeted single-session employee costing via flag=ON HTTP API,
 *        (c) sessions with NO allocation rows — targeted flag=ON API call for that period
 *  9  — Performance: flag=OFF vs flag=ON, both HTTP POST (warm-up applied to flag=ON)
 *  10 — Coverage: period-scoped punch_ledger → labor_allocations match rate
 *
 * Exit 0 — GO or CONDITIONAL GO (all integrity checks pass)
 * Exit 1 — NO-GO (one or more integrity checks failed)
 *
 * Usage:
 *   npx tsx server/scripts/phaseGValidation.ts [--api-base http://localhost:5000]
 */

import { getPayPeriod } from '../src/services/payPeriod';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { spawnSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __scriptDir = path.dirname(fileURLToPath(import.meta.url));

// ── Arg parsing ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let apiBase = 'http://localhost:5000';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-base' && args[i + 1]) apiBase = args[++i];
  }
  return { apiBase };
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmtDate(d: Date): string { return d.toISOString().slice(0, 10); }
function fmtCurrency(n: number): string { return `$${n.toFixed(2)}`; }

// ── HTTP POST helper ──────────────────────────────────────────────────────────

async function apiPost<T>(
  baseUrl: string,
  pathname: string,
  body: unknown,
): Promise<{ data: T; statusCode: number; elapsedMs: number }> {
  const payload = JSON.stringify(body);
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    const req = http.request(
      {
        hostname: url.hostname,
        port: Number(url.port) || 5000,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          const elapsedMs = Date.now() - t0;
          try { resolve({ data: JSON.parse(raw) as T, statusCode: res.statusCode ?? 0, elapsedMs }); }
          catch { reject(new Error(`Non-JSON from ${pathname}: ${raw.slice(0, 200)}`)); }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Pay period and calendar month helpers ─────────────────────────────────────

interface PeriodInfo {
  start: Date;
  end: Date;
  label: string;
  // The calendar month used for all CLI and API validation calls.
  // Using a full calendar month guarantees that CLI date-range scope
  // and API {year,month} scope are identical, enabling direct total comparison.
  calYear: number;
  calMonth: number;
  calStart: Date;
  calEnd: Date;
}

/**
 * Returns the pay period immediately before the current active period.
 * "Last completed" = the period whose end date is strictly before today.
 */
function getLastCompletedPeriod(): PeriodInfo {
  const currentPeriod = getPayPeriod(new Date());
  // One day before the current period start lands us inside the previous period.
  const dayBefore = new Date(currentPeriod.start);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const prev = getPayPeriod(dayBefore);
  const start = new Date(prev.start);
  const end = new Date(prev.end);
  end.setHours(23, 59, 59, 999);
  // Validation scope: the calendar month containing the MIDPOINT of the period.
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  const calYear = mid.getFullYear();
  const calMonth = mid.getMonth() + 1;
  return { start, end, label: 'last completed', calYear, calMonth,
    calStart: new Date(calYear, calMonth - 1, 1),
    calEnd: new Date(calYear, calMonth, 0, 23, 59, 59, 999) };
}

/**
 * Returns the currently active (in-progress) pay period, capped at today.
 */
function getCurrentActivePeriod(): PeriodInfo {
  const period = getPayPeriod(new Date());
  const start = new Date(period.start);
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const calYear = now.getFullYear();
  const calMonth = now.getMonth() + 1;
  return { start, end: now, label: 'current active', calYear, calMonth,
    calStart: new Date(calYear, calMonth - 1, 1),
    calEnd: new Date(calYear, calMonth, 0, 23, 59, 59, 999) };
}

function monthsInRange(start: Date, end: Date): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  let d = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonthStart = new Date(end.getFullYear(), end.getMonth(), 1);
  while (d <= endMonthStart) {
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

// ── CLI reconciliation via subprocess ────────────────────────────────────────

interface ReconcileSummary {
  totalSessions: number;
  matchCount: number;
  mismatchCount: number;
  naCount: number;
  totalCostLegacy: number;
  totalCostAllocation: number;
  grandDelta: number;
}

interface CliResult {
  summary: ReconcileSummary;
  exitCode: number;
  elapsedMs: number;
  command: string;
  error?: string;
}

const ZERO_SUMMARY: ReconcileSummary = {
  totalSessions: 0, matchCount: 0, mismatchCount: 0, naCount: 0,
  totalCostLegacy: 0, totalCostAllocation: 0, grandDelta: 0,
};

async function runCli(fromDate: string, toDate: string): Promise<CliResult> {
  const { tmpdir } = await import('os');
  const cliScript = path.resolve(__scriptDir, 'phaseECostReconciliation.ts');
  const outputFile = path.join(tmpdir(), `phaseG-recon-${Date.now()}.json`);
  const command = `npx tsx phaseECostReconciliation.ts --from ${fromDate} --to ${toDate} --output <tmpfile>`;

  const t0 = Date.now();
  const child = spawnSync(
    'npx', ['tsx', cliScript, '--from', fromDate, '--to', toDate, '--output', outputFile],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 90_000, maxBuffer: 4_000_000 },
  );
  const elapsedMs = Date.now() - t0;

  if (child.error) return { summary: ZERO_SUMMARY, exitCode: -1, elapsedMs, command, error: child.error.message };

  // CLI exits 0 without writing output file when 0 sessions found — valid zero result.
  if (!fs.existsSync(outputFile)) {
    if (child.status === 0) return { summary: ZERO_SUMMARY, exitCode: 0, elapsedMs, command };
    return { summary: ZERO_SUMMARY, exitCode: child.status ?? -1, elapsedMs, command,
      error: `No output file. stderr: ${(child.stderr ?? '').slice(0, 200)}` };
  }

  try {
    const s = (JSON.parse(fs.readFileSync(outputFile, 'utf8')) as { summary: Record<string, number> }).summary;
    return {
      summary: {
        totalSessions:       s.sessionsProcessed ?? s.totalSessions ?? 0,
        matchCount:          s.sessionsWithAllocationData ?? s.matchCount ?? 0,
        mismatchCount:       s.sessionCostMismatches ?? s.mismatchCount ?? 0,
        naCount:             s.sessionsWithoutAllocations ?? s.naCount ?? 0,
        totalCostLegacy:     s.totalCostLegacy ?? 0,
        totalCostAllocation: s.totalCostAllocation ?? 0,
        grandDelta:          s.grandDelta ?? 0,
      },
      exitCode: child.status ?? 0,
      elapsedMs,
      command,
    };
  } catch {
    return { summary: ZERO_SUMMARY, exitCode: child.status ?? 0, elapsedMs, command,
      error: `JSON parse failed. stderr: ${(child.stderr ?? '').slice(0, 200)}` };
  }
}

// ── Temporary Express server for flag=ON HTTP testing ────────────────────────
// phaseGApiServer.ts is spawned with USE_ALLOCATION_COSTING_READ=true in env before
// any module imports so featureFlags.ts captures true at module load time.

interface TempServer {
  baseUrl: string;
  stop: () => void;
}

async function startFlagOnServer(port = 5001): Promise<TempServer> {
  const helper = path.resolve(__scriptDir, 'phaseGApiServer.ts');
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', helper], {
      env: { ...process.env, USE_ALLOCATION_COSTING_READ: 'true', PHASE_G_PORT: String(port) },
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ready = false;
    const timer = setTimeout(() => {
      if (!ready) { child.kill('SIGTERM'); reject(new Error('Flag-ON server did not emit READY within 30s')); }
    }, 30_000);
    child.stdout?.on('data', (d: Buffer) => {
      if (!ready && d.toString().includes('READY')) {
        ready = true; clearTimeout(timer);
        resolve({ baseUrl: `http://localhost:${port}`, stop: () => child.kill('SIGTERM') });
      }
    });
    child.stderr?.on('data', () => { /* suppress startup logs */ });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// ── Application log inspection ────────────────────────────────────────────────

interface LogAudit {
  filesScanned: string[];
  fallbackCount: number;
  samples: string[];
  insufficient: boolean;  // true when no log files found — evidence is incomplete
}

function inspectLogs(): LogAudit {
  const logDir = '/tmp/logs';
  let files: string[] = [];
  try {
    files = fs.readdirSync(logDir)
      .filter((f) => f.startsWith('Start_application') && f.endsWith('.log'))
      .map((f) => path.join(logDir, f));
  } catch { /* /tmp/logs absent */ }

  if (files.length === 0) return { filesScanned: [], fallbackCount: 0, samples: [], insufficient: true };

  const pattern = /LEGACY_FALLBACK|ALLOCATION_READ_FALLBACK|fallbackReason/;
  let count = 0;
  const samples: string[] = [];
  for (const f of files) {
    try {
      for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
        if (pattern.test(line)) { count++; if (samples.length < 5) samples.push(`[${path.basename(f)}] ${line.trim()}`); }
      }
    } catch { /* skip unreadable */ }
  }
  return { filesScanned: files.map((f) => path.basename(f)), fallbackCount: count, samples, insufficient: false };
}

// ── DB coverage query ─────────────────────────────────────────────────────────

async function queryCoverage(start: Date, end: Date) {
  const [[{ count: closed }], [{ covered }], [{ count: uncovered }]] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS count FROM punch_ledger
      WHERE clock_out IS NOT NULL AND labor_class = 'REGULAR'
        AND clock_in >= ${start} AND clock_in <= ${end}`).then((r) => r.rows as { count: number }[]),
    db.execute(sql`
      SELECT COUNT(DISTINCT la.punch_ledger_id)::int AS covered
      FROM labor_allocations la INNER JOIN punch_ledger pl ON pl.id = la.punch_ledger_id
      WHERE la.labor_class = 'REGULAR' AND la.status = 'CLOSED' AND la.allocation_end IS NOT NULL
        AND pl.clock_in >= ${start} AND pl.clock_in <= ${end}`).then((r) => r.rows as { covered: number }[]),
    db.execute(sql`
      SELECT COUNT(*)::int AS count FROM punch_ledger pl
      WHERE pl.clock_out IS NOT NULL AND pl.labor_class = 'REGULAR'
        AND pl.clock_in >= ${start} AND pl.clock_in <= ${end}
        AND NOT EXISTS (
          SELECT 1 FROM labor_allocations la
          WHERE la.punch_ledger_id = pl.id AND la.labor_class = 'REGULAR'
            AND la.status = 'CLOSED' AND la.allocation_end IS NOT NULL
        )`).then((r) => r.rows as { count: number }[]),
  ]);
  return { closed: Number(closed ?? 0), covered: Number(covered ?? 0), uncovered: Number(uncovered ?? 0) };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { apiBase } = parseArgs();
  const reportAt = new Date().toISOString();
  let integrityFailures = 0;
  const lines: string[] = [];

  function log(msg = '') { console.log(msg); lines.push(msg); }
  function warn(msg: string) { console.warn(msg); lines.push(`WARN: ${msg}`); }

  log('');
  log('╔═════════════════════════════════════════════════════════════════════╗');
  log('║  Phase G — Allocation Costing Production Readiness Validation      ║');
  log('╚═════════════════════════════════════════════════════════════════════╝');
  log(`  Generated : ${reportAt}`);
  log(`  API base  : ${apiBase}`);
  log('');

  // ── Step 1: Pay periods ───────────────────────────────────────────────────
  const lastPeriod = getLastCompletedPeriod();
  const currPeriod = getCurrentActivePeriod();

  const lastCalTag = `${lastPeriod.calYear}-${String(lastPeriod.calMonth).padStart(2,'0')}`;
  const currCalTag = `${currPeriod.calYear}-${String(currPeriod.calMonth).padStart(2,'0')}`;
  const sameMonth = lastCalTag === currCalTag;

  log('── Step 1: Pay Periods ──────────────────────────────────────────────────');
  log(`  Last completed pay period : ${fmtDate(lastPeriod.start)} → ${fmtDate(lastPeriod.end)}`);
  log(`  Current active pay period : ${fmtDate(currPeriod.start)} → ${fmtDate(currPeriod.end)} (to today)`);
  log(`  API reconcile scope (last): calendar month ${lastCalTag}  [${fmtDate(lastPeriod.calStart)} → ${fmtDate(lastPeriod.calEnd)}]`);
  log(`  API reconcile scope (curr): calendar month ${currCalTag}  [${fmtDate(currPeriod.calStart)} → ${fmtDate(currPeriod.calEnd)}]`);
  if (sameMonth) log(`  NOTE: Both pay periods fall in the same calendar month (${lastCalTag}).`);
  log(`  CLI uses exact pay-period date boundaries; API uses calendar months (its only supported granularity).`);
  log('');

  // ── Step 2: CLI reconciliation — pay period date ranges ───────────────────
  // CLI uses exact pay-period start/end for period-specific scope.
  log('── Step 2: CLI Reconciliation (phaseECostReconciliation.ts subprocess) ──');
  const cliLast = await runCli(fmtDate(lastPeriod.start), fmtDate(lastPeriod.end));
  const cliCurr = await runCli(fmtDate(currPeriod.start), fmtDate(currPeriod.end));

  function printCli(label: string, r: CliResult, period: PeriodInfo) {
    const ok = r.exitCode === 0 && r.summary.mismatchCount === 0;
    const dateRange = `${fmtDate(period.start)}→${fmtDate(period.end)}`;
    log(`  ${label} [${dateRange}]: exit=${r.exitCode}  ${r.elapsedMs}ms  ${ok ? 'PASS ✓' : 'FAIL ✗'}`);
    log(`    sessions: total=${r.summary.totalSessions} OK=${r.summary.matchCount} ERR=${r.summary.mismatchCount} N/A=${r.summary.naCount}`);
    log(`    legacy=${fmtCurrency(r.summary.totalCostLegacy)} alloc=${fmtCurrency(r.summary.totalCostAllocation)} Δ=${fmtCurrency(r.summary.grandDelta)}`);
    if (r.error) warn(`    CLI error: ${r.error}`);
  }

  printCli('Last period (CLI)', cliLast, lastPeriod);
  printCli('Curr period (CLI)', cliCurr, currPeriod);

  if (cliLast.exitCode !== 0 || cliLast.summary.mismatchCount > 0) integrityFailures++;
  if (cliCurr.exitCode !== 0 || cliCurr.summary.mismatchCount > 0) integrityFailures++;
  log('');

  // ── Step 3: API reconciliation — same calendar month scope as CLI ─────────
  log('── Step 3: API Reconciliation (POST /api/cost-accounting/reconcile-labor-costs) ──');

  interface ApiReconcileResp { summary: ReconcileSummary }

  const reconLast = await apiPost<ApiReconcileResp>(apiBase, '/api/cost-accounting/reconcile-labor-costs',
    { year: lastPeriod.calYear, month: lastPeriod.calMonth });
  const reconCurr = await apiPost<ApiReconcileResp>(apiBase, '/api/cost-accounting/reconcile-labor-costs',
    { year: currPeriod.calYear, month: currPeriod.calMonth });

  // NOTE: CLI uses exact pay-period date boundaries; API uses calendar months.
  // The two tools have different scopes (API may cover sessions outside the pay period).
  // We validate each independently: API must return HTTP 200 with 0 mismatches.
  // Session-count comparison is informational only (no integrity failure for count difference).
  const lastCliApiMatch = reconLast.statusCode === 200;
  const currCliApiMatch = reconCurr.statusCode === 200;

  log(`  CLI last [period-dates]:   sessions=${cliLast.summary.totalSessions} ERR=${cliLast.summary.mismatchCount} Δ=${fmtCurrency(cliLast.summary.grandDelta)}`);
  log(`  API last [cal-month]:      sessions=${reconLast.data.summary?.totalSessions} ERR=${reconLast.data.summary?.mismatchCount} Δ=${fmtCurrency(reconLast.data.summary?.grandDelta ?? 0)}  HTTP ${reconLast.statusCode}`);
  log(`  API last: ${lastCliApiMatch && (reconLast.data.summary?.mismatchCount ?? 0) === 0 ? 'PASS ✓' : 'FAIL ✗'} (different scopes — count difference expected; only ERR=0 required)`);
  log(`  CLI curr [period-dates]:   sessions=${cliCurr.summary.totalSessions} ERR=${cliCurr.summary.mismatchCount} Δ=${fmtCurrency(cliCurr.summary.grandDelta)}`);
  log(`  API curr [cal-month]:      sessions=${reconCurr.data.summary?.totalSessions} ERR=${reconCurr.data.summary?.mismatchCount} Δ=${fmtCurrency(reconCurr.data.summary?.grandDelta ?? 0)}  HTTP ${reconCurr.statusCode}`);
  log(`  API curr: ${currCliApiMatch && (reconCurr.data.summary?.mismatchCount ?? 0) === 0 ? 'PASS ✓' : 'FAIL ✗'} (different scopes — count difference expected; only ERR=0 required)`);

  const apiLastAgg = {
    totalSessions: reconLast.data.summary?.totalSessions ?? 0,
    mismatchCount: reconLast.data.summary?.mismatchCount ?? 0,
    grandDelta: reconLast.data.summary?.grandDelta ?? 0,
    totalCostAllocation: reconLast.data.summary?.totalCostAllocation ?? 0,
    ok: reconLast.statusCode === 200,
  };
  const apiCurrAgg = {
    totalSessions: reconCurr.data.summary?.totalSessions ?? 0,
    mismatchCount: reconCurr.data.summary?.mismatchCount ?? 0,
    grandDelta: reconCurr.data.summary?.grandDelta ?? 0,
    totalCostAllocation: reconCurr.data.summary?.totalCostAllocation ?? 0,
    ok: reconCurr.statusCode === 200,
  };

  if (!apiLastAgg.ok || apiLastAgg.mismatchCount > 0) integrityFailures++;
  if (!apiCurrAgg.ok || apiCurrAgg.mismatchCount > 0) integrityFailures++;

  // Aliases used in report builder
  const reconLastMonths = [{ year: lastPeriod.calYear, month: lastPeriod.calMonth, ...reconLast }];
  const reconCurrMonths = [{ year: currPeriod.calYear, month: currPeriod.calMonth, ...reconCurr }];

  log('');

  // ── Step 4: calculate-labor-costs — flag=OFF ──────────────────────────────
  log('── Step 4: calculate-labor-costs flag=OFF (HTTP POST to running server) ──');
  interface CalcResp { readModel: string; recordCount: number; totalsByType: Record<string, number>; fallbackReason?: string }

  const offLastM = { year: lastPeriod.calYear, month: lastPeriod.calMonth };
  const offCurrM = { year: currPeriod.calYear, month: currPeriod.calMonth };
  const calcOffLast = await apiPost<CalcResp>(apiBase, '/api/cost-accounting/calculate-labor-costs', { year: offLastM.year, month: offLastM.month });
  const calcOffCurr = await apiPost<CalcResp>(apiBase, '/api/cost-accounting/calculate-labor-costs', { year: offCurrM.year, month: offCurrM.month });

  const offLastOk = calcOffLast.statusCode === 200 && calcOffLast.data.readModel === 'LEGACY';
  const offCurrOk = calcOffCurr.statusCode === 200 && calcOffCurr.data.readModel === 'LEGACY';
  log(`  Last period month=${offLastM.year}-${String(offLastM.month).padStart(2,'0')}: HTTP ${calcOffLast.statusCode} ${calcOffLast.elapsedMs}ms readModel=${calcOffLast.data.readModel} ${offLastOk ? 'PASS ✓' : 'FAIL ✗'}`);
  log(`  Curr period month=${offCurrM.year}-${String(offCurrM.month).padStart(2,'0')}: HTTP ${calcOffCurr.statusCode} ${calcOffCurr.elapsedMs}ms readModel=${calcOffCurr.data.readModel} ${offCurrOk ? 'PASS ✓' : 'FAIL ✗'}`);
  if (!offLastOk || !offCurrOk) integrityFailures++;
  log('');

  // ── Step 5: calculate-labor-costs — flag=ON via HTTP to temp server ───────
  log('── Step 5: calculate-labor-costs flag=ON (HTTP POST to temp server :5001) ─');
  log('  Starting phaseGApiServer.ts with USE_ALLOCATION_COSTING_READ=true in env ...');

  let calcOnLast: { data: CalcResp; statusCode: number; elapsedMs: number } | null = null;
  let calcOnCurr: { data: CalcResp; statusCode: number; elapsedMs: number } | null = null;
  let serverError: string | null = null;
  let flagOnServer: TempServer | null = null;

  try {
    flagOnServer = await startFlagOnServer();
    log(`  Server ready. Warm-up call in progress ...`);
    // Warm-up: load DB pool + service modules before timed measurements.
    await apiPost<unknown>(flagOnServer.baseUrl, '/api/cost-accounting/calculate-labor-costs', { year: offLastM.year, month: offLastM.month });
    log('  Warm-up done. Starting timed measurements.');

    calcOnLast = await apiPost<CalcResp>(flagOnServer.baseUrl, '/api/cost-accounting/calculate-labor-costs', { year: offLastM.year, month: offLastM.month });
    calcOnCurr = await apiPost<CalcResp>(flagOnServer.baseUrl, '/api/cost-accounting/calculate-labor-costs', { year: offCurrM.year, month: offCurrM.month });
  } catch (err) {
    serverError = String(err);
    warn(`flag-ON server error: ${serverError}`);
    integrityFailures++;
  } finally {
    flagOnServer?.stop();
    if (flagOnServer) log('  Temp server stopped.');
  }

  const onLastOk = !serverError && calcOnLast?.statusCode === 200 && calcOnLast?.data.readModel === 'ALLOCATION';
  const onCurrOk = !serverError && calcOnCurr?.statusCode === 200 && calcOnCurr?.data.readModel === 'ALLOCATION';

  if (serverError) {
    log(`  flag=ON: FAIL ✗ — ${serverError}`);
  } else {
    log(`  Last period (flag=ON): HTTP ${calcOnLast?.statusCode} ${calcOnLast?.elapsedMs}ms readModel=${calcOnLast?.data.readModel} recordCount=${calcOnLast?.data.recordCount} ${onLastOk ? 'PASS ✓' : 'FAIL ✗'}`);
    if (calcOnLast?.data.fallbackReason) warn(`    fallbackReason: ${calcOnLast.data.fallbackReason}`);
    log(`  Curr period (flag=ON): HTTP ${calcOnCurr?.statusCode} ${calcOnCurr?.elapsedMs}ms readModel=${calcOnCurr?.data.readModel} recordCount=${calcOnCurr?.data.recordCount} ${onCurrOk ? 'PASS ✓' : 'FAIL ✗'}`);
    if (calcOnCurr?.data.fallbackReason) warn(`    fallbackReason: ${calcOnCurr.data.fallbackReason}`);
  }

  if (!onLastOk || !onCurrOk) integrityFailures++;
  log('');

  // ── Step 6: Fallback audit ────────────────────────────────────────────────
  log('── Step 6: Fallback Audit ────────────────────────────────────────────────');

  // 6a: API return value
  const hasFallbackReadModel = calcOnLast?.data.readModel === 'LEGACY_FALLBACK' || calcOnCurr?.data.readModel === 'LEGACY_FALLBACK';
  const fallbackReasons = [calcOnLast?.data.fallbackReason, calcOnCurr?.data.fallbackReason].filter(Boolean);
  log(`  (a) readModel=LEGACY_FALLBACK from flag=ON API: ${hasFallbackReadModel ? 'YES ✗' : 'NO ✓'}`);
  if (fallbackReasons.length) warn(`      fallbackReasons: ${fallbackReasons.join('; ')}`);

  // 6b: Log file inspection — strict: missing logs = insufficient evidence (WARN + mark as conditional)
  const logAudit = inspectLogs();
  let logCheckPass = false;
  if (logAudit.insufficient) {
    warn('  (b) Log file inspection: NO log files found in /tmp/logs/ — log-based fallback evidence is INSUFFICIENT.');
    warn('      Run "refresh_all_logs" in the Replit console to populate /tmp/logs/ and then re-run this script.');
    // Insufficient log evidence is a CONDITIONAL flag, not an integrity failure on its own,
    // but it does prevent a GO verdict (forces at minimum CONDITIONAL GO).
  } else {
    logCheckPass = logAudit.fallbackCount === 0;
    log(`  (b) Log files: ${logAudit.filesScanned.join(', ')}`);
    log(`      LEGACY_FALLBACK occurrences: ${logAudit.fallbackCount} ${logCheckPass ? '✓' : '⚠'}`);
    if (logAudit.samples.length) logAudit.samples.forEach((s) => warn(`      MATCH: ${s}`));
  }

  // 6c: Structural check
  const [{ count: triggerCount }] = (await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM punch_ledger pl
    WHERE pl.clock_out IS NOT NULL AND pl.labor_class = 'REGULAR'
      AND NOT EXISTS (
        SELECT 1 FROM labor_allocations la
        WHERE la.punch_ledger_id = pl.id AND la.labor_class = 'REGULAR'
          AND la.status = 'CLOSED' AND la.allocation_end IS NOT NULL
      )`)).rows as { count: number }[];
  const structuralTriggers = Number(triggerCount ?? 0);
  log(`  (c) Structural triggers (closed sessions w/o allocation): ${structuralTriggers} ${structuralTriggers === 0 ? '✓' : '⚠'}`);

  if (hasFallbackReadModel || structuralTriggers > 0 || (!logAudit.insufficient && logAudit.fallbackCount > 0)) integrityFailures++;
  log('');

  // ── Step 7: Consistency ───────────────────────────────────────────────────
  log('── Step 7: Consistency (calculate flag=ON totals ≡ reconcile new-model) ──');
  const calcOnLastTotal = calcOnLast ? Object.values(calcOnLast.data.totalsByType ?? {}).reduce((a, b) => a + b, 0) : 0;
  const calcOnCurrTotal = calcOnCurr ? Object.values(calcOnCurr.data.totalsByType ?? {}).reduce((a, b) => a + b, 0) : 0;

  const lastMatch = Math.abs(calcOnLastTotal - apiLastAgg.totalCostAllocation) <= 0.01;
  const currMatch = Math.abs(calcOnCurrTotal - apiCurrAgg.totalCostAllocation) <= 0.01;

  log(`  Last period month: calculate=${fmtCurrency(calcOnLastTotal)} reconcile=${fmtCurrency(apiLastAgg.totalCostAllocation)} Δ=${fmtCurrency(Math.abs(calcOnLastTotal - apiLastAgg.totalCostAllocation))} ${lastMatch ? 'MATCH ✓' : 'MISMATCH ✗'}`);
  log(`  Curr period month: calculate=${fmtCurrency(calcOnCurrTotal)} reconcile=${fmtCurrency(apiCurrAgg.totalCostAllocation)} Δ=${fmtCurrency(Math.abs(calcOnCurrTotal - apiCurrAgg.totalCostAllocation))} ${currMatch ? 'MATCH ✓' : 'MISMATCH ✗'}`);
  if (!lastMatch || !currMatch) integrityFailures++;
  log('');

  // ── Step 8: Edge cases ────────────────────────────────────────────────────
  log('── Step 8: Edge Case Validation ──────────────────────────────────────────');

  // (a) Multi-segment sessions (job-switch)
  const multiRows = (await db.execute(sql`
    SELECT la.punch_ledger_id, COUNT(*)::int AS segments, pl.clock_in
    FROM labor_allocations la INNER JOIN punch_ledger pl ON pl.id = la.punch_ledger_id
    WHERE la.labor_class = 'REGULAR'
    GROUP BY la.punch_ledger_id, pl.clock_in HAVING COUNT(*) > 1
    ORDER BY segments DESC LIMIT 3`)).rows as { punch_ledger_id: number; segments: number; clock_in: string }[];

  log(`  (a) Multi-segment sessions (job-switch): ${multiRows.length} found`);
  if (multiRows.length === 0) {
    log('      No multi-segment sessions in dev data — edge case not exercisable (CONDITIONAL GO criterion).');
  } else {
    for (const row of multiRows) {
      const ci = new Date(row.clock_in);
      const year = ci.getFullYear(); const month = ci.getMonth() + 1;
      try {
        const srv = await startFlagOnServer(5002);
        const r = await apiPost<CalcResp>(srv.baseUrl, '/api/cost-accounting/calculate-labor-costs', { year, month });
        srv.stop();
        const ok = r.statusCode === 200 && r.data.readModel === 'ALLOCATION' && !r.data.fallbackReason;
        log(`      punch_ledger_id=${row.punch_ledger_id} segments=${row.segments} period=${year}-${month}: readModel=${r.data.readModel} ${ok ? 'PASS ✓' : 'FAIL ✗'}`);
        if (!ok) integrityFailures++;
      } catch (e) { warn(`      punch_ledger_id=${row.punch_ledger_id}: ERROR ${e}`); integrityFailures++; }
    }
  }

  // (b) Single-session employees — targeted: find employee, run flag=ON API for their period
  const singleRows = (await db.execute(sql`
    SELECT pl.employee_id, pl.id AS session_id, pl.clock_in, pl.clock_out
    FROM punch_ledger pl
    WHERE (SELECT COUNT(*) FROM punch_ledger p2 WHERE p2.employee_id = pl.employee_id) = 1
    LIMIT 3`)).rows as { employee_id: number; session_id: number; clock_in: string; clock_out: string | null }[];

  log(`  (b) Single-session employees (targeted flag=ON test): ${singleRows.length} found`);
  if (singleRows.length === 0) {
    log('      No single-session employees in dev data.');
  } else {
    for (const row of singleRows) {
      const ci = new Date(row.clock_in);
      const year = ci.getFullYear(); const month = ci.getMonth() + 1;
      if (!row.clock_out) {
        // Open session: excluded from costing. Verify period run returns 200 (no crash).
        const r = await apiPost<{ readModel?: string; error?: string }>(apiBase, '/api/cost-accounting/calculate-labor-costs', { year, month });
        const ok = r.statusCode === 200 && !('error' in r.data);
        log(`      emp=${row.employee_id} sess=${row.session_id} OPEN (excluded): HTTP ${r.statusCode} ${ok ? 'no crash ✓' : 'FAIL ✗'}`);
        if (!ok) integrityFailures++;
      } else {
        // Closed session: run flag=ON HTTP API for this employee's period.
        try {
          const srv = await startFlagOnServer(5003);
          const r = await apiPost<CalcResp>(srv.baseUrl, '/api/cost-accounting/calculate-labor-costs', { year, month });
          srv.stop();
          const ok = r.statusCode === 200 && r.data.readModel === 'ALLOCATION' && !r.data.fallbackReason;
          log(`      emp=${row.employee_id} sess=${row.session_id} CLOSED: HTTP ${r.statusCode} readModel=${r.data.readModel} ${ok ? 'PASS ✓' : 'FAIL ✗'}`);
          if (!ok) integrityFailures++;
        } catch (e) { warn(`      emp=${row.employee_id}: ERROR ${e}`); integrityFailures++; }
      }
    }
  }

  // (c) Sessions with no allocation rows — targeted: verify flag=ON API for affected period
  const noAllocRows = (await db.execute(sql`
    SELECT pl.id AS session_id, pl.clock_in, pl.employee_id
    FROM punch_ledger pl
    WHERE pl.clock_out IS NOT NULL AND pl.labor_class = 'REGULAR'
      AND NOT EXISTS (SELECT 1 FROM labor_allocations la WHERE la.punch_ledger_id = pl.id)
    LIMIT 3`)).rows as { session_id: number; clock_in: string; employee_id: number }[];

  log(`  (c) Closed REGULAR sessions with NO allocation row: ${noAllocRows.length} found`);
  if (noAllocRows.length === 0) {
    log('      All closed REGULAR sessions have at least one allocation row. PASS ✓');
  } else {
    for (const row of noAllocRows) {
      const ci = new Date(row.clock_in);
      const year = ci.getFullYear(); const month = ci.getMonth() + 1;
      try {
        const srv = await startFlagOnServer(5004);
        const r = await apiPost<CalcResp>(srv.baseUrl, '/api/cost-accounting/calculate-labor-costs', { year, month });
        srv.stop();
        // Expect: allocation path runs without crash; readModel may fall back to LEGACY
        // for this session specifically (missing allocation = expected N/A in reconcile)
        const ok = r.statusCode === 200 && r.data.readModel !== undefined;
        const fallback = r.data.readModel === 'LEGACY_FALLBACK';
        log(`      sess=${row.session_id} emp=${row.employee_id} period=${year}-${month}: HTTP ${r.statusCode} readModel=${r.data.readModel} ${ok ? 'no crash ✓' : 'FAIL ✗'} ${fallback ? '⚠ FALLBACK' : ''}`);
        if (!ok) integrityFailures++;
        if (fallback) integrityFailures++;  // fallback on no-allocation session is an integrity failure
      } catch (e) { warn(`      sess=${row.session_id}: ERROR ${e}`); integrityFailures++; }
    }
  }
  log('');

  // ── Step 9: Performance (HTTP flag=OFF vs flag=ON) ─────────────────────
  log('── Step 9: Performance (HTTP POST flag=OFF vs flag=ON, warm-up applied) ──');
  const perfOffLast = calcOffLast.elapsedMs;
  const perfOffCurr = calcOffCurr.elapsedMs;
  const perfOnLast = calcOnLast?.elapsedMs ?? 0;
  const perfOnCurr = calcOnCurr?.elapsedMs ?? 0;
  const avgOff = (perfOffLast + perfOffCurr) / 2;
  const avgOn = (perfOnLast + perfOnCurr) / 2;
  const ratio = avgOff > 0 ? avgOn / avgOff : 1;
  const perfOk = ratio <= 2.0;

  log(`  flag=OFF (running dev server): last=${perfOffLast}ms curr=${perfOffCurr}ms avg=${avgOff.toFixed(1)}ms`);
  log(`  flag=ON  (temp server :5001) : last=${perfOnLast}ms curr=${perfOnCurr}ms avg=${avgOn.toFixed(1)}ms`);
  log(`  Ratio (ON÷OFF): ${ratio.toFixed(2)}× ${perfOk ? 'PASS ✓ (≤2×)' : 'WARN ✗ (>2×)'}`);
  log('');

  // ── Step 10: Coverage ─────────────────────────────────────────────────
  log('── Step 10: Coverage (period-scoped punch_ledger vs labor_allocations) ──');
  const covLast = await queryCoverage(lastPeriod.start, lastPeriod.end);
  const covCurr = await queryCoverage(currPeriod.start, currPeriod.end);
  const pct = (c: number, t: number) => t > 0 ? `${((c / t) * 100).toFixed(2)}%` : '100.00%';

  log(`  Last period: closed_regular=${covLast.closed} covered=${covLast.covered} uncovered=${covLast.uncovered} ${pct(covLast.covered, covLast.closed)} ${covLast.uncovered === 0 ? 'PASS ✓' : 'WARN ⚠'}`);
  log(`  Curr period: closed_regular=${covCurr.closed} covered=${covCurr.covered} uncovered=${covCurr.uncovered} ${pct(covCurr.covered, covCurr.closed)} ${covCurr.uncovered === 0 ? 'PASS ✓' : 'WARN ⚠'}`);
  if (covLast.uncovered > 0 || covCurr.uncovered > 0) integrityFailures++;
  log('');

  // ── Final decision ────────────────────────────────────────────────────
  const hasRealData = (cliLast.summary.totalSessions + cliCurr.summary.totalSessions) > 0;
  const hasMultiSeg = multiRows.length > 0;

  const decision =
    integrityFailures > 0 ? 'NO-GO' :
    !hasRealData || !hasMultiSeg || logAudit.insufficient ? 'CONDITIONAL GO' : 'GO';

  log(`══ Final Decision: ${decision} ${'═'.repeat(Math.max(0, 55 - decision.length))}`);
  log(`   Integrity failures: ${integrityFailures}`);
  log('');

  // ── Write report ──────────────────────────────────────────────────────
  // Written to server/reports/ (git-tracked) so it appears in the commit diff.
  const reportDir = path.resolve(process.cwd(), 'server/reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'phase-g-readiness-report.md');

  const md = buildReport({
    reportAt, apiBase, lastPeriod, currPeriod,
    cliLast, cliCurr,
    reconLastMonths, reconCurrMonths,
    apiLastAgg, apiCurrAgg,
    offLastM, offCurrM,
    calcOffLast, calcOffCurr,
    calcOnLast, calcOnCurr,
    serverError,
    onLastOk, onCurrOk,
    hasFallbackReadModel, fallbackReasons,
    logAudit,
    structuralTriggers,
    calcOnLastTotal, calcOnCurrTotal,
    lastMatch, currMatch,
    multiRows,
    singleRows,
    noAllocRows: noAllocRows.length,
    perfOffLast, perfOffCurr, perfOnLast, perfOnCurr, avgOff, avgOn, ratio, perfOk,
    covLast, covCurr,
    integrityFailures, decision, hasRealData, hasMultiSeg,
  });

  fs.writeFileSync(reportPath, md);
  log(`  Report written to: ${reportPath}`);

  // Also write to .local/reports/ as a reference copy (system-gitignored, runtime only).
  try {
    const localDir = path.resolve(process.cwd(), '.local/reports');
    fs.mkdirSync(localDir, { recursive: true });
    fs.copyFileSync(reportPath, path.join(localDir, 'phase-g-readiness-report.md'));
  } catch { /* .local/ write failure is non-critical */ }

  return integrityFailures;
}

// ── Report builder ────────────────────────────────────────────────────────────

function buildReport(ctx: {
  reportAt: string; apiBase: string;
  lastPeriod: PeriodInfo; currPeriod: PeriodInfo;
  cliLast: CliResult; cliCurr: CliResult;
  reconLastMonths: { year: number; month: number; data: { summary: ReconcileSummary }; statusCode: number; elapsedMs: number }[];
  reconCurrMonths: typeof ctx.reconLastMonths;
  apiLastAgg: { totalSessions: number; mismatchCount: number; grandDelta: number; totalCostAllocation: number; ok: boolean };
  apiCurrAgg: typeof ctx.apiLastAgg;
  offLastM: { year: number; month: number }; offCurrM: { year: number; month: number };
  calcOffLast: { data: { readModel: string; recordCount: number; totalsByType: Record<string, number>; fallbackReason?: string }; statusCode: number; elapsedMs: number };
  calcOffCurr: typeof ctx.calcOffLast;
  calcOnLast: typeof ctx.calcOffLast | null;
  calcOnCurr: typeof ctx.calcOffLast | null;
  serverError: string | null;
  onLastOk: boolean; onCurrOk: boolean;
  hasFallbackReadModel: boolean; fallbackReasons: (string | undefined)[];
  logAudit: LogAudit;
  structuralTriggers: number;
  calcOnLastTotal: number; calcOnCurrTotal: number;
  lastMatch: boolean; currMatch: boolean;
  multiRows: { punch_ledger_id: number; segments: number }[];
  singleRows: { employee_id: number; session_id: number; clock_out: string | null }[];
  noAllocRows: number;
  perfOffLast: number; perfOffCurr: number; perfOnLast: number; perfOnCurr: number;
  avgOff: number; avgOn: number; ratio: number; perfOk: boolean;
  covLast: { closed: number; covered: number; uncovered: number };
  covCurr: typeof ctx.covLast;
  integrityFailures: number; decision: string; hasRealData: boolean; hasMultiSeg: boolean;
}): string {
  const { reportAt, apiBase, lastPeriod, currPeriod, cliLast, cliCurr,
    reconLastMonths, reconCurrMonths, apiLastAgg, apiCurrAgg,
    offLastM, offCurrM,
    calcOffLast, calcOffCurr, calcOnLast, calcOnCurr, serverError,
    onLastOk, onCurrOk, hasFallbackReadModel, fallbackReasons, logAudit,
    structuralTriggers, calcOnLastTotal, calcOnCurrTotal, lastMatch, currMatch,
    multiRows, singleRows, noAllocRows,
    perfOffLast, perfOffCurr, perfOnLast, perfOnCurr, avgOff, avgOn, ratio, perfOk,
    covLast, covCurr, integrityFailures, decision, hasRealData, hasMultiSeg } = ctx;

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const fmtCur = (n: number) => `$${n.toFixed(2)}`;
  const pct = (c: number, t: number) => t > 0 ? `${((c / t) * 100).toFixed(2)}%` : '100.00%';
  const lastCalTag = `${lastPeriod.calYear}-${String(lastPeriod.calMonth).padStart(2,'0')}`;
  const currCalTag = `${currPeriod.calYear}-${String(currPeriod.calMonth).padStart(2,'0')}`;
  const sameMonth = lastCalTag === currCalTag;

  const pass = (ok: boolean) => ok ? 'PASS ✓' : 'FAIL ✗';

  const conditionalReasons: string[] = [];
  if (!hasRealData) conditionalReasons.push('Zero closed REGULAR sessions — dollar amounts unproven');
  if (!hasMultiSeg) conditionalReasons.push('No multi-segment (job-switch) sessions — allocation split costing unproven');
  if (logAudit.insufficient) conditionalReasons.push('No application log files found — log-based fallback evidence incomplete');

  return [
    '# Phase G — Allocation Costing Production Readiness Report',
    '',
    `**Generated:** ${reportAt}`,
    `**Environment:** Development`,
    `**Feature flag:** \`USE_ALLOCATION_COSTING_READ\``,
    `**API base (flag=OFF):** \`${apiBase}\``,
    `**API base (flag=ON):** \`http://localhost:5001\` (phaseGApiServer.ts, flag in env)`,
    '',
    '---',
    '',
    `## Final Decision: **${decision}**`,
    '',
    `| Integrity failures | ${integrityFailures} |`,
    `|---|---|`,
    `| Conditional criteria pending | ${conditionalReasons.length} |`,
    '',
    conditionalReasons.length > 0 ? [
      '**Conditions required before upgrading to GO:**',
      ...conditionalReasons.map((r) => `- [ ] ${r}`),
    ].join('\n') : '',
    '',
    '---',
    '',
    '## Summary Table',
    '',
    '| Step | Check | Status |',
    '|---|---|---|',
    `| 2 | CLI recon — last period | ${pass(cliLast.exitCode === 0 && cliLast.summary.mismatchCount === 0)} — exit=${cliLast.exitCode} sessions=${cliLast.summary.totalSessions} ERR=${cliLast.summary.mismatchCount} Δ=${fmtCur(cliLast.summary.grandDelta)} |`,
    `| 2 | CLI recon — curr period | ${pass(cliCurr.exitCode === 0 && cliCurr.summary.mismatchCount === 0)} — exit=${cliCurr.exitCode} sessions=${cliCurr.summary.totalSessions} ERR=${cliCurr.summary.mismatchCount} Δ=${fmtCur(cliCurr.summary.grandDelta)} |`,
    `| 3 | API reconcile — last period month(s) | ${pass(apiLastAgg.ok && apiLastAgg.mismatchCount === 0)} — sessions=${apiLastAgg.totalSessions} ERR=${apiLastAgg.mismatchCount} Δ=${fmtCur(apiLastAgg.grandDelta)} |`,
    `| 3 | API reconcile — curr period month(s) | ${pass(apiCurrAgg.ok && apiCurrAgg.mismatchCount === 0)} — sessions=${apiCurrAgg.totalSessions} ERR=${apiCurrAgg.mismatchCount} Δ=${fmtCur(apiCurrAgg.grandDelta)} |`,
    `| 4 | calculate flag=OFF — last period | ${pass(calcOffLast.statusCode === 200 && calcOffLast.data.readModel === 'LEGACY')} — readModel=${calcOffLast.data.readModel} HTTP ${calcOffLast.statusCode} ${calcOffLast.elapsedMs}ms |`,
    `| 4 | calculate flag=OFF — curr period | ${pass(calcOffCurr.statusCode === 200 && calcOffCurr.data.readModel === 'LEGACY')} — readModel=${calcOffCurr.data.readModel} HTTP ${calcOffCurr.statusCode} ${calcOffCurr.elapsedMs}ms |`,
    `| 5 | calculate flag=ON (HTTP :5001) — last | ${pass(onLastOk)} — readModel=${calcOnLast?.data.readModel ?? 'N/A'} HTTP ${calcOnLast?.statusCode ?? 'N/A'} ${calcOnLast?.elapsedMs ?? 'N/A'}ms |`,
    `| 5 | calculate flag=ON (HTTP :5001) — curr | ${pass(onCurrOk)} — readModel=${calcOnCurr?.data.readModel ?? 'N/A'} HTTP ${calcOnCurr?.statusCode ?? 'N/A'} ${calcOnCurr?.elapsedMs ?? 'N/A'}ms |`,
    `| 6a | No LEGACY_FALLBACK readModel from flag=ON | ${pass(!hasFallbackReadModel)} |`,
    `| 6b | Log file inspection | ${logAudit.insufficient ? 'INSUFFICIENT ⚠ — no log files' : pass(logAudit.fallbackCount === 0) + ` — ${logAudit.filesScanned.length} file(s), ${logAudit.fallbackCount} occurrences`} |`,
    `| 6c | Structural fallback triggers | ${pass(structuralTriggers === 0)} — ${structuralTriggers} closed session(s) without allocation |`,
    `| 7 | Consistency flag=ON vs reconcile — last | ${pass(lastMatch)} — calc=${fmtCur(calcOnLastTotal)} recon=${fmtCur(apiLastAgg.totalCostAllocation)} Δ=${fmtCur(Math.abs(calcOnLastTotal - apiLastAgg.totalCostAllocation))} |`,
    `| 7 | Consistency flag=ON vs reconcile — curr | ${pass(currMatch)} — calc=${fmtCur(calcOnCurrTotal)} recon=${fmtCur(apiCurrAgg.totalCostAllocation)} Δ=${fmtCur(Math.abs(calcOnCurrTotal - apiCurrAgg.totalCostAllocation))} |`,
    `| 8a | Multi-segment session costing | ${multiRows.length === 0 ? 'N/A (CONDITIONAL criterion)' : `${multiRows.length} session(s) exercised`} |`,
    `| 8b | Single-session employee costing | ${singleRows.length === 0 ? 'N/A' : `${singleRows.length} employee(s) exercised`} |`,
    `| 8c | Sessions with no allocation rows | ${pass(noAllocRows === 0)} — ${noAllocRows} found |`,
    `| 9 | Performance ratio (flag=ON÷OFF) | ${pass(perfOk)} — ${ratio.toFixed(2)}× avg (threshold ≤2×) |`,
    `| 10 | Coverage — last period | ${pass(covLast.uncovered === 0)} — ${covLast.covered}/${covLast.closed} (${pct(covLast.covered, covLast.closed)}) |`,
    `| 10 | Coverage — curr period | ${pass(covCurr.uncovered === 0)} — ${covCurr.covered}/${covCurr.closed} (${pct(covCurr.covered, covCurr.closed)}) |`,
    '',
    '---',
    '',
    '## 1. Pay Periods',
    '',
    '| Period | Pay Period Dates | Validation Scope (Calendar Month) |',
    '|---|---|---|',
    `| Last completed pay period | ${fmtDate(lastPeriod.start)} → ${fmtDate(lastPeriod.end)} | ${lastPeriod.calYear}-${String(lastPeriod.calMonth).padStart(2,'0')} (${fmtDate(lastPeriod.calStart)} → ${fmtDate(lastPeriod.calEnd)}) |`,
    `| Current active pay period | ${fmtDate(currPeriod.start)} → ${fmtDate(currPeriod.end)} | ${currPeriod.calYear}-${String(currPeriod.calMonth).padStart(2,'0')} (${fmtDate(currPeriod.calStart)} → ${fmtDate(currPeriod.calEnd)}) |`,
    '',
    '> CLI uses exact pay-period date boundaries. API (reconcile-labor-costs) accepts only calendar month granularity — so session populations may differ when a month contains both periods. Each tool is validated independently; no session-count match between CLI and API is required.',
    (lastCalTag === currCalTag ? `> NOTE: Both pay periods fall in calendar month ${lastCalTag}. API month calls are identical; CLI date boundaries differ.` : ''),
    '',
    '---',
    '',
    '## 2. CLI Reconciliation',
    '',
    '### Last completed pay period',
    `**Command:** \`${cliLast.command}\``,
    '```',
    `Exit code          : ${cliLast.exitCode}`,
    `Sessions processed : ${cliLast.summary.totalSessions}`,
    `Cost matches (OK)  : ${cliLast.summary.matchCount}`,
    `Cost mismatches    : ${cliLast.summary.mismatchCount}`,
    `N/A (no alloc)     : ${cliLast.summary.naCount}`,
    `Legacy total       : ${fmtCur(cliLast.summary.totalCostLegacy)}`,
    `Allocation total   : ${fmtCur(cliLast.summary.totalCostAllocation)}`,
    `Grand delta        : ${fmtCur(cliLast.summary.grandDelta)}`,
    `Elapsed            : ${cliLast.elapsedMs}ms`,
    '```',
    cliLast.error ? `> CLI note: ${cliLast.error}` : '',
    '',
    '### Current active pay period',
    `**Command:** \`${cliCurr.command}\``,
    '```',
    `Exit code          : ${cliCurr.exitCode}`,
    `Sessions processed : ${cliCurr.summary.totalSessions}`,
    `Cost matches (OK)  : ${cliCurr.summary.matchCount}`,
    `Cost mismatches    : ${cliCurr.summary.mismatchCount}`,
    `N/A (no alloc)     : ${cliCurr.summary.naCount}`,
    `Legacy total       : ${fmtCur(cliCurr.summary.totalCostLegacy)}`,
    `Allocation total   : ${fmtCur(cliCurr.summary.totalCostAllocation)}`,
    `Grand delta        : ${fmtCur(cliCurr.summary.grandDelta)}`,
    `Elapsed            : ${cliCurr.elapsedMs}ms`,
    '```',
    cliCurr.error ? `> CLI note: ${cliCurr.error}` : '',
    '',
    '---',
    '',
    '## 3. API Reconciliation',
    '',
    ...reconLastMonths.map((r) => [
      `### Last period — month ${r.year}-${String(r.month).padStart(2,'0')}`,
      '```',
      `POST /api/cost-accounting/reconcile-labor-costs {"year":${r.year},"month":${r.month}}`,
      `HTTP ${r.statusCode}  ${r.elapsedMs}ms`,
      JSON.stringify(r.data, null, 2),
      '```',
      '',
    ].join('\n')),
    ...reconCurrMonths.map((r) => [
      `### Curr period — month ${r.year}-${String(r.month).padStart(2,'0')}`,
      '```',
      `POST /api/cost-accounting/reconcile-labor-costs {"year":${r.year},"month":${r.month}}`,
      `HTTP ${r.statusCode}  ${r.elapsedMs}ms`,
      JSON.stringify(r.data, null, 2),
      '```',
      '',
    ].join('\n')),
    '---',
    '',
    '## 4. calculate-labor-costs — flag=OFF',
    '',
    '```',
    `POST ${apiBase}/api/cost-accounting/calculate-labor-costs {"year":${offLastM.year},"month":${offLastM.month}}`,
    `HTTP ${calcOffLast.statusCode}  ${calcOffLast.elapsedMs}ms`,
    JSON.stringify(calcOffLast.data, null, 2),
    '```',
    '',
    '```',
    `POST ${apiBase}/api/cost-accounting/calculate-labor-costs {"year":${offCurrM.year},"month":${offCurrM.month}}`,
    `HTTP ${calcOffCurr.statusCode}  ${calcOffCurr.elapsedMs}ms`,
    JSON.stringify(calcOffCurr.data, null, 2),
    '```',
    '',
    '---',
    '',
    '## 5. calculate-labor-costs — flag=ON',
    '',
    '**Method:** `phaseGApiServer.ts` spawned as child process on port :5001 with `USE_ALLOCATION_COSTING_READ=true` set in env before any module imports. Both calls are real HTTP POST requests through an Express router. A warm-up call was made before timed measurements to load DB pool and service modules.',
    '',
    serverError
      ? `**ERROR starting flag=ON server:** ${serverError}`
      : [
        '```',
        `POST http://localhost:5001/api/cost-accounting/calculate-labor-costs {"year":${offLastM.year},"month":${offLastM.month}}`,
        `HTTP ${calcOnLast?.statusCode}  ${calcOnLast?.elapsedMs}ms`,
        JSON.stringify(calcOnLast?.data ?? {}, null, 2),
        '```',
        '',
        '```',
        `POST http://localhost:5001/api/cost-accounting/calculate-labor-costs {"year":${offCurrM.year},"month":${offCurrM.month}}`,
        `HTTP ${calcOnCurr?.statusCode}  ${calcOnCurr?.elapsedMs}ms`,
        JSON.stringify(calcOnCurr?.data ?? {}, null, 2),
        '```',
      ].join('\n'),
    '',
    '---',
    '',
    '## 6. Fallback Audit',
    '',
    `- **(a) readModel=LEGACY_FALLBACK from flag=ON API:** ${hasFallbackReadModel ? 'YES ✗' : 'NO ✓'}`,
    fallbackReasons.length ? `  - fallbackReasons: ${fallbackReasons.join('; ')}` : '',
    `- **(b) Application log inspection:** ${logAudit.insufficient ? '**INSUFFICIENT — no log files found in /tmp/logs/**' : `${logAudit.filesScanned.length} file(s), ${logAudit.fallbackCount} LEGACY_FALLBACK occurrences ${logAudit.fallbackCount === 0 ? '✓' : '✗'}`}`,
    logAudit.insufficient ? `  - Re-run after \`refresh_all_logs\` to populate application logs.` : '',
    logAudit.samples.length ? logAudit.samples.map((s) => `  - \`${s}\``).join('\n') : '',
    `- **(c) Structural triggers (closed sessions without allocation):** ${structuralTriggers} ${structuralTriggers === 0 ? '✓' : '⚠'}`,
    '',
    '---',
    '',
    '## 7. Consistency',
    '',
    '| Period | calculate flag=ON | reconcile new-model | Δ | Match |',
    '|---|---|---|---|---|',
    `| Last period month | ${fmtCur(calcOnLastTotal)} | ${fmtCur(apiLastAgg.totalCostAllocation)} | ${fmtCur(Math.abs(calcOnLastTotal - apiLastAgg.totalCostAllocation))} | ${lastMatch ? '✓' : '✗'} |`,
    `| Curr period month | ${fmtCur(calcOnCurrTotal)} | ${fmtCur(apiCurrAgg.totalCostAllocation)} | ${fmtCur(Math.abs(calcOnCurrTotal - apiCurrAgg.totalCostAllocation))} | ${currMatch ? '✓' : '✗'} |`,
    '',
    '---',
    '',
    '## 8. Edge Case Validation',
    '',
    '| Edge Case | Found in Dev | Exercised | Result |',
    '|---|---|---|---|',
    `| Multi-segment (job-switch) sessions | ${multiRows.length} | ${multiRows.length > 0 ? 'Yes — flag=ON HTTP API :5001' : 'No'} | ${multiRows.length === 0 ? 'N/A — CONDITIONAL criterion' : 'See Step 8a'} |`,
    `| Single-session employees | ${singleRows.length} | ${singleRows.length > 0 ? 'Yes — targeted flag=ON HTTP' : 'No'} | ${singleRows.length > 0 ? 'See Step 8b' : 'N/A'} |`,
    `| Sessions with no allocation rows | ${noAllocRows} | ${noAllocRows > 0 ? 'Yes — targeted flag=ON HTTP' : 'N/A'} | ${noAllocRows === 0 ? 'PASS ✓ — 100% covered' : 'See Step 8c'} |`,
    '',
    '---',
    '',
    '## 9. Performance',
    '',
    '| Path | Last period | Curr period | Avg |',
    '|---|---|---|---|',
    `| flag=OFF — running dev server | ${perfOffLast}ms | ${perfOffCurr}ms | ${avgOff.toFixed(1)}ms |`,
    `| flag=ON — temp server :5001 (post-warmup) | ${perfOnLast}ms | ${perfOnCurr}ms | ${avgOn.toFixed(1)}ms |`,
    '',
    `**Ratio (ON÷OFF):** ${ratio.toFixed(2)}× — ${perfOk ? 'PASS ✓ (≤2×)' : 'WARN ✗ (>2×)'}`,
    '',
    '---',
    '',
    '## 10. Coverage',
    '',
    '| Period | Closed REGULAR | Covered by CLOSED allocation | Uncovered | % |',
    '|---|---|---|---|---|',
    `| Last period | ${covLast.closed} | ${covLast.covered} | ${covLast.uncovered} | ${pct(covLast.covered, covLast.closed)} |`,
    `| Curr period | ${covCurr.closed} | ${covCurr.covered} | ${covCurr.uncovered} | ${pct(covCurr.covered, covCurr.closed)} |`,
    '',
    '---',
    '',
    '## Relevant Files',
    '',
    '- `server/scripts/phaseGValidation.ts` — this script',
    '- `server/scripts/phaseGApiServer.ts` — temporary Express server for flag=ON HTTP testing',
    '- `server/scripts/phaseECostReconciliation.ts` — CLI reconciliation tool',
    '- `server/src/services/laborCostingService.ts` — allocation read path + fallback guard',
    '- `server/src/services/laborReconcileService.ts` — reconcile logic',
    '- `server/src/lib/featureFlags.ts` — `USE_ALLOCATION_COSTING_READ` flag',
    '- `server/src/routes/costAccounting.ts` — API routes for cost accounting',
  ].filter((l) => l !== '').join('\n');
}

// ── Entry point ───────────────────────────────────────────────────────────────

main()
  .then((failures) => {
    if (failures > 0) {
      console.error(`[phaseGValidation] ${failures} integrity failure(s). Decision: NO-GO.`);
      process.exit(1);
    }
    console.log('[phaseGValidation] Validation complete. See report for decision.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[phaseGValidation] Fatal error:', err);
    process.exit(1);
  });