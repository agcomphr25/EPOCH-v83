/**
 * Phase D Validation Audit
 *
 * Proves allocation switching correctness by running 10 structural checks
 * against the live labor_allocations data. Read-only — no mutations.
 *
 * Sections:
 *   Step 1  — Multi-allocation coverage
 *   Step 2  — Sequence order validation
 *   Step 3  — Temporal integrity
 *   Step 4  — Overlap detection (critical)
 *   Step 5  — Open allocation consistency
 *   Step 6  — Duration reconciliation
 *   Step 7  — Attribution validation
 *   Step 8  — Edge cases
 *   Step 9  — Real example trace
 *   Step 10 — Final verdict
 *
 * Exits with code 0 on clean data, code 1 on failures.
 *
 * Run with: npx tsx server/scripts/phaseDValidationAudit.ts
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

async function audit(): Promise<number> {
  let failures = 0;

  const log = (...args: string[]) => console.log(args.join(' '));
  const err = (...args: string[]) => console.error(args.join(' '));

  log('');
  log('╔══════════════════════════════════════════════════════════════╗');
  log('║          Phase D Validation Report — Allocation Switching    ║');
  log('╚══════════════════════════════════════════════════════════════╝');
  log('');

  // ── Baseline totals ──────────────────────────────────────────────────────────
  const totalSessionsResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM punch_ledger
  `);
  const totalSessions = (totalSessionsResult.rows[0] as { count: number }).count;

  const totalAllocsResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM labor_allocations
  `);
  const totalAllocs = (totalAllocsResult.rows[0] as { count: number }).count;

  log(`Baseline: ${totalSessions} punch_ledger session(s), ${totalAllocs} labor_allocations row(s)`);
  log('');

  // ────────────────────────────────────────────────────────────────────────────
  // Step 1 — Multi-allocation coverage
  // ────────────────────────────────────────────────────────────────────────────
  log('──────────────────────────────────────────────────────────────');
  log('Step 1 — Multi-allocation coverage');
  log('──────────────────────────────────────────────────────────────');

  const multiAllocCountResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT punch_ledger_id
      FROM labor_allocations
      GROUP BY punch_ledger_id
      HAVING COUNT(*) > 1
    ) sub
  `);
  const multiSessionCount = (multiAllocCountResult.rows[0] as { count: number }).count;

  const multiAllocSampleResult = await db.execute(sql`
    SELECT punch_ledger_id, COUNT(*)::int AS alloc_count
    FROM labor_allocations
    GROUP BY punch_ledger_id
    HAVING COUNT(*) > 1
    ORDER BY alloc_count DESC
    LIMIT 5
  `);
  type MultiAllocRow = { punch_ledger_id: number; alloc_count: number };
  const multiAllocSamples = multiAllocSampleResult.rows as MultiAllocRow[];

  const multiPct = totalSessions > 0
    ? ((multiSessionCount / totalSessions) * 100).toFixed(2)
    : '0.00';

  log(`  Sessions with >1 allocation : ${multiSessionCount} (${multiPct}% of ${totalSessions} total)`);
  if (multiSessionCount > 0) {
    log(`  Sample sessions (up to 5):`);
    multiAllocSamples.forEach((r) =>
      log(`    punch_ledger_id=${r.punch_ledger_id}  allocations=${r.alloc_count}`)
    );
  } else {
    log(`  No sessions with multiple allocations found — allocation switching may not have been exercised yet.`);
  }
  log('');

  // ────────────────────────────────────────────────────────────────────────────
  // Step 2 — Sequence order validation
  // ────────────────────────────────────────────────────────────────────────────
  log('──────────────────────────────────────────────────────────────');
  log('Step 2 — Sequence order validation');
  log('──────────────────────────────────────────────────────────────');

  const seqResult = await db.execute(sql`
    WITH session_seqs AS (
      SELECT
        punch_ledger_id,
        ARRAY_AGG(sequence_order ORDER BY sequence_order) AS orders
      FROM labor_allocations
      GROUP BY punch_ledger_id
      HAVING COUNT(*) > 1
    ),
    validated AS (
      SELECT
        punch_ledger_id,
        orders,
        orders[1] = 1
          AND orders[array_length(orders,1)] = array_length(orders,1)
          AND (
            SELECT bool_and(orders[i] - orders[i-1] = 1)
            FROM generate_series(2, array_length(orders, 1)) AS i
          ) AS is_valid
      FROM session_seqs
    )
    SELECT punch_ledger_id, orders, is_valid
    FROM validated
    ORDER BY is_valid ASC, punch_ledger_id
  `);
  type SeqRow = { punch_ledger_id: number; orders: number[]; is_valid: boolean };
  const seqRows = seqResult.rows as SeqRow[];

  const validSeqSessions = seqRows.filter((r) => r.is_valid).length;
  const invalidSeqSessions = seqRows.filter((r) => !r.is_valid).length;

  log(`  Sessions with valid sequences  : ${validSeqSessions}`);
  log(`  Sessions with sequence issues  : ${invalidSeqSessions}`);

  if (invalidSeqSessions > 0) {
    failures++;
    err(`  FAIL [sequence order] ${invalidSeqSessions} session(s) have broken sequence_order:`);
    seqRows
      .filter((r) => !r.is_valid)
      .slice(0, 5)
      .forEach((r) =>
        err(`    punch_ledger_id=${r.punch_ledger_id}  observed=[${r.orders.join(', ')}]`)
      );
  } else if (seqRows.length === 0) {
    log(`  No multi-allocation sessions to validate.`);
  } else {
    log(`  PASS [sequence order] All multi-allocation sessions have valid 1-based contiguous sequences.`);
  }
  log('');

  // ────────────────────────────────────────────────────────────────────────────
  // Step 3 — Temporal integrity
  // ────────────────────────────────────────────────────────────────────────────
  log('──────────────────────────────────────────────────────────────');
  log('Step 3 — Temporal integrity');
  log('──────────────────────────────────────────────────────────────');

  // Per-session classification: inversion = any closed row with start >= end
  const inversionCountResult = await db.execute(sql`
    SELECT COUNT(DISTINCT punch_ledger_id)::int AS cnt
    FROM labor_allocations
    WHERE allocation_end IS NOT NULL
      AND allocation_start >= allocation_end
  `);
  const inversionSessionCount = (inversionCountResult.rows[0] as { cnt: number }).cnt;

  const inversionSampleResult = await db.execute(sql`
    SELECT punch_ledger_id, id, allocation_start, allocation_end
    FROM labor_allocations
    WHERE allocation_end IS NOT NULL
      AND allocation_start >= allocation_end
    ORDER BY punch_ledger_id
    LIMIT 5
  `);
  type InvRow = { punch_ledger_id: number; id: number; allocation_start: string; allocation_end: string };
  const inversionSamples = inversionSampleResult.rows as InvRow[];

  // Per-session gap classification:
  // A session has gaps if any of its consecutive closed pairs violate gap <= 1s
  // A session is "perfect" only if ALL consecutive pairs satisfy gap <= 1s AND no inversions
  const sessionGapResult = await db.execute(sql`
    WITH consecutive AS (
      SELECT
        a.punch_ledger_id,
        EXTRACT(EPOCH FROM (
          LEAD(a.allocation_start) OVER (PARTITION BY a.punch_ledger_id ORDER BY a.sequence_order)
          - a.allocation_end
        )) AS gap_seconds
      FROM labor_allocations a
      WHERE a.allocation_end IS NOT NULL
    ),
    session_inversions AS (
      SELECT DISTINCT punch_ledger_id AS inv_session
      FROM labor_allocations
      WHERE allocation_end IS NOT NULL AND allocation_start >= allocation_end
    ),
    session_gaps AS (
      SELECT
        punch_ledger_id,
        BOOL_OR(gap_seconds IS NOT NULL AND ABS(gap_seconds) > 1) AS has_gap,
        MAX(ABS(gap_seconds)) AS max_gap
      FROM consecutive
      WHERE gap_seconds IS NOT NULL
      GROUP BY punch_ledger_id
    )
    SELECT
      COUNT(*)::int AS total_sessions_with_pairs,
      COUNT(*) FILTER (WHERE NOT has_gap AND si.inv_session IS NULL)::int AS perfect_sessions,
      COUNT(*) FILTER (WHERE has_gap)::int AS gap_sessions,
      MAX(max_gap) AS max_gap_seconds
    FROM session_gaps
    LEFT JOIN session_inversions si ON si.inv_session = session_gaps.punch_ledger_id
  `);
  type GapSummary = { total_sessions_with_pairs: number; perfect_sessions: number; gap_sessions: number; max_gap_seconds: number | null };
  const gapSummary = sessionGapResult.rows[0] as GapSummary;

  const gapSessionCount = gapSummary?.gap_sessions ?? 0;
  const perfectSessionCount = gapSummary?.perfect_sessions ?? 0;
  const maxGapSeconds = gapSummary?.max_gap_seconds != null ? Number(gapSummary.max_gap_seconds).toFixed(2) : '0.00';

  const gapSampleResult = await db.execute(sql`
    WITH consecutive AS (
      SELECT
        a.punch_ledger_id,
        a.allocation_end,
        LEAD(a.allocation_start) OVER (PARTITION BY a.punch_ledger_id ORDER BY a.sequence_order) AS next_start,
        EXTRACT(EPOCH FROM (
          LEAD(a.allocation_start) OVER (PARTITION BY a.punch_ledger_id ORDER BY a.sequence_order)
          - a.allocation_end
        )) AS gap_seconds
      FROM labor_allocations a
      WHERE a.allocation_end IS NOT NULL
    )
    SELECT punch_ledger_id, gap_seconds
    FROM consecutive
    WHERE gap_seconds IS NOT NULL AND ABS(gap_seconds) > 1
    ORDER BY ABS(gap_seconds) DESC
    LIMIT 5
  `);
  type GapRow = { punch_ledger_id: number; gap_seconds: number };
  const gapSamples = gapSampleResult.rows as GapRow[];

  log(`  Sessions with all pairs contiguous (gap ≤ 1s) : ${perfectSessionCount}`);
  log(`  Sessions with at least one gap > 1s            : ${gapSessionCount}`);
  log(`  Sessions with time-range inversions            : ${inversionSessionCount}`);
  log(`  Maximum gap observed                           : ${maxGapSeconds}s`);

  if (inversionSessionCount > 0) {
    failures++;
    err(`  FAIL [temporal inversion] ${inversionSessionCount} session(s) have allocation_start >= allocation_end:`);
    inversionSamples.forEach((r) =>
      err(`    la.id=${r.id} punch_ledger_id=${r.punch_ledger_id}  start=${r.allocation_start}  end=${r.allocation_end}`)
    );
  } else {
    log(`  PASS [temporal inversions] No allocation_start >= allocation_end found.`);
  }

  if (gapSessionCount > 0) {
    failures++;
    err(`  FAIL [temporal gaps] ${gapSessionCount} session(s) have consecutive allocation pairs with gap > 1s:`);
    gapSamples.forEach((r) =>
      err(`    punch_ledger_id=${r.punch_ledger_id}  gap=${Number(r.gap_seconds).toFixed(2)}s`)
    );
  } else {
    log(`  PASS [temporal gaps] All consecutive closed allocations are contiguous (≤ 1s gap).`);
  }
  log('');

  // ────────────────────────────────────────────────────────────────────────────
  // Step 4 — Overlap detection (critical)
  // ────────────────────────────────────────────────────────────────────────────
  log('──────────────────────────────────────────────────────────────');
  log('Step 4 — Overlap detection (critical)');
  log('──────────────────────────────────────────────────────────────');

  // True total count via subquery
  const overlapCountResult = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM (
      SELECT a.id AS a_id, b.id AS b_id
      FROM labor_allocations a
      JOIN labor_allocations b
        ON a.punch_ledger_id = b.punch_ledger_id
        AND a.id < b.id
      WHERE a.allocation_end IS NOT NULL
        AND b.allocation_end IS NOT NULL
        AND a.allocation_start < b.allocation_end
        AND a.allocation_end > b.allocation_start
    ) sub
  `);
  const overlapTotal = (overlapCountResult.rows[0] as { cnt: number }).cnt;

  const overlapSampleResult = await db.execute(sql`
    SELECT
      a.punch_ledger_id,
      a.id AS a_id,
      a.allocation_start AS a_start,
      a.allocation_end AS a_end,
      b.id AS b_id,
      b.allocation_start AS b_start,
      b.allocation_end AS b_end
    FROM labor_allocations a
    JOIN labor_allocations b
      ON a.punch_ledger_id = b.punch_ledger_id
      AND a.id < b.id
    WHERE a.allocation_end IS NOT NULL
      AND b.allocation_end IS NOT NULL
      AND a.allocation_start < b.allocation_end
      AND a.allocation_end > b.allocation_start
    ORDER BY a.punch_ledger_id
    LIMIT 5
  `);
  type OverlapRow = {
    punch_ledger_id: number;
    a_id: number; a_start: string; a_end: string;
    b_id: number; b_start: string; b_end: string;
  };
  const overlapSamples = overlapSampleResult.rows as OverlapRow[];

  log(`  Overlapping allocation pairs (total) : ${overlapTotal}`);

  if (overlapTotal > 0) {
    failures++;
    err(`  FAIL [overlap] ${overlapTotal} overlapping allocation pair(s) detected:`);
    overlapSamples.forEach((r) =>
      err(
        `    punch_ledger_id=${r.punch_ledger_id}  ` +
        `la#${r.a_id}[${r.a_start}→${r.a_end}] overlaps la#${r.b_id}[${r.b_start}→${r.b_end}]`
      )
    );
    if (overlapTotal > 5) err(`    ... and ${overlapTotal - 5} more overlapping pair(s)`);
  } else {
    log(`  PASS [overlap] No overlapping allocation pairs found.`);
  }
  log('');

  // ────────────────────────────────────────────────────────────────────────────
  // Step 5 — Open allocation consistency
  // ────────────────────────────────────────────────────────────────────────────
  log('──────────────────────────────────────────────────────────────');
  log('Step 5 — Open allocation consistency');
  log('──────────────────────────────────────────────────────────────');

  const openCountResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE open_count = 1)::int AS exactly_one,
      COUNT(*) FILTER (WHERE open_count = 0)::int AS zero_open,
      COUNT(*) FILTER (WHERE open_count > 1)::int AS more_than_one
    FROM (
      SELECT
        pl.id,
        COUNT(la.id) FILTER (WHERE la.status = 'OPEN') AS open_count
      FROM punch_ledger pl
      LEFT JOIN labor_allocations la ON la.punch_ledger_id = pl.id
      WHERE pl.clock_out IS NULL
      GROUP BY pl.id
    ) sub
  `);
  type OpenSummary = { exactly_one: number; zero_open: number; more_than_one: number };
  const openSummary = openCountResult.rows[0] as OpenSummary;

  const exactlyOne = openSummary?.exactly_one ?? 0;
  const zeroOpen = openSummary?.zero_open ?? 0;
  const moreThanOne = openSummary?.more_than_one ?? 0;

  log(`  Open punch sessions with exactly 1 OPEN allocation : ${exactlyOne}`);
  log(`  Open punch sessions with 0 OPEN allocations        : ${zeroOpen}`);
  log(`  Open punch sessions with >1 OPEN allocations       : ${moreThanOne}`);

  if (moreThanOne > 0) {
    failures++;
    const moreThanOneSampleResult = await db.execute(sql`
      SELECT pl.id AS punch_ledger_id, COUNT(la.id) FILTER (WHERE la.status = 'OPEN')::int AS open_count
      FROM punch_ledger pl
      LEFT JOIN labor_allocations la ON la.punch_ledger_id = pl.id
      WHERE pl.clock_out IS NULL
      GROUP BY pl.id
      HAVING COUNT(la.id) FILTER (WHERE la.status = 'OPEN') > 1
      LIMIT 5
    `);
    type OpenRow = { punch_ledger_id: number; open_count: number };
    err(`  FAIL [open consistency] ${moreThanOne} open session(s) have >1 OPEN allocation:`);
    (moreThanOneSampleResult.rows as OpenRow[]).forEach((r) =>
      err(`    punch_ledger_id=${r.punch_ledger_id}  open_count=${r.open_count}`)
    );
  } else {
    log(`  PASS [open consistency] No open sessions have multiple OPEN allocations.`);
  }

  if (zeroOpen > 0) {
    failures++;
    const zeroOpenSampleResult = await db.execute(sql`
      SELECT pl.id AS punch_ledger_id
      FROM punch_ledger pl
      LEFT JOIN labor_allocations la
        ON la.punch_ledger_id = pl.id AND la.status = 'OPEN'
      WHERE pl.clock_out IS NULL
      GROUP BY pl.id
      HAVING COUNT(la.id) = 0
      LIMIT 5
    `);
    type ZeroOpenRow = { punch_ledger_id: number };
    err(`  FAIL [open consistency] ${zeroOpen} open punch session(s) have no OPEN allocation:`);
    (zeroOpenSampleResult.rows as ZeroOpenRow[]).forEach((r) =>
      err(`    punch_ledger_id=${r.punch_ledger_id}`)
    );
  }
  log('');

  // ────────────────────────────────────────────────────────────────────────────
  // Step 6 — Duration reconciliation
  // ────────────────────────────────────────────────────────────────────────────
  log('──────────────────────────────────────────────────────────────');
  log('Step 6 — Duration reconciliation');
  log('──────────────────────────────────────────────────────────────');

  const durationCountResult = await db.execute(sql`
    WITH mismatch_sessions AS (
      SELECT
        pl.id AS session_id,
        EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) AS session_seconds,
        COALESCE(SUM(EXTRACT(EPOCH FROM (la.allocation_end - la.allocation_start))), 0) AS alloc_seconds
      FROM punch_ledger pl
      LEFT JOIN labor_allocations la
        ON la.punch_ledger_id = pl.id
        AND la.allocation_end IS NOT NULL
      WHERE pl.clock_out IS NOT NULL
      GROUP BY pl.id
      HAVING ABS(
        EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) -
        COALESCE(SUM(EXTRACT(EPOCH FROM (la.allocation_end - la.allocation_start))), 0)
      ) > 1
    )
    SELECT
      COUNT(*)::int AS mismatch_count,
      MAX(ABS(session_seconds - alloc_seconds)) AS max_deviation
    FROM mismatch_sessions
  `);
  type DurSummary = { mismatch_count: number; max_deviation: number | null };
  const durSummary = durationCountResult.rows[0] as DurSummary;
  const durationMismatchCount = durSummary?.mismatch_count ?? 0;
  const maxDeviation = durSummary?.max_deviation != null ? Number(durSummary.max_deviation) : 0;

  const durationSampleResult = await db.execute(sql`
    SELECT
      pl.id AS session_id,
      EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) AS session_seconds,
      COALESCE(SUM(EXTRACT(EPOCH FROM (la.allocation_end - la.allocation_start))), 0) AS alloc_seconds,
      ABS(
        EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) -
        COALESCE(SUM(EXTRACT(EPOCH FROM (la.allocation_end - la.allocation_start))), 0)
      ) AS deviation
    FROM punch_ledger pl
    LEFT JOIN labor_allocations la
      ON la.punch_ledger_id = pl.id
      AND la.allocation_end IS NOT NULL
    WHERE pl.clock_out IS NOT NULL
    GROUP BY pl.id
    HAVING ABS(
      EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) -
      COALESCE(SUM(EXTRACT(EPOCH FROM (la.allocation_end - la.allocation_start))), 0)
    ) > 1
    ORDER BY deviation DESC
    LIMIT 5
  `);
  type DurRow = { session_id: number; session_seconds: number; alloc_seconds: number; deviation: number };
  const durationSamples = durationSampleResult.rows as DurRow[];

  log(`  Closed sessions with duration mismatch (>1s) : ${durationMismatchCount}`);
  log(`  Maximum deviation observed                   : ${maxDeviation.toFixed(2)}s`);

  if (durationMismatchCount > 0) {
    failures++;
    err(`  FAIL [duration reconciliation] ${durationMismatchCount} closed session(s) have allocation duration mismatch:`);
    durationSamples.forEach((r) =>
      err(
        `    session_id=${r.session_id}  session=${Number(r.session_seconds).toFixed(1)}s  ` +
        `allocs=${Number(r.alloc_seconds).toFixed(1)}s  deviation=${Number(r.deviation).toFixed(1)}s`
      )
    );
    if (durationMismatchCount > 5) err(`    ... and ${durationMismatchCount - 5} more`);
  } else {
    log(`  PASS [duration reconciliation] All closed sessions match their allocation durations (tolerance 1s).`);
  }
  log('');

  // ────────────────────────────────────────────────────────────────────────────
  // Step 7 — Attribution validation
  // ────────────────────────────────────────────────────────────────────────────
  log('──────────────────────────────────────────────────────────────');
  log('Step 7 — Attribution validation');
  log('──────────────────────────────────────────────────────────────');

  const attrResult = await db.execute(sql`
    WITH consecutive AS (
      SELECT
        a.punch_ledger_id,
        a.id AS a_id,
        b.id AS b_id,
        (
          a.traveler_id IS DISTINCT FROM b.traveler_id OR
          a.traveler_step_id IS DISTINCT FROM b.traveler_step_id OR
          a.charge_code_id IS DISTINCT FROM b.charge_code_id OR
          a.production_work_order_id IS DISTINCT FROM b.production_work_order_id
        ) AS has_attribution_change
      FROM labor_allocations a
      JOIN labor_allocations b
        ON b.punch_ledger_id = a.punch_ledger_id
        AND b.sequence_order = a.sequence_order + 1
    )
    SELECT
      COUNT(*)::int AS total_transitions,
      COUNT(*) FILTER (WHERE has_attribution_change)::int AS changed_transitions,
      COUNT(*) FILTER (WHERE NOT has_attribution_change)::int AS unchanged_transitions
    FROM consecutive
  `);
  type AttrSummary = { total_transitions: number; changed_transitions: number; unchanged_transitions: number };
  const attrSummary = attrResult.rows[0] as AttrSummary;

  const totalTransitions = attrSummary?.total_transitions ?? 0;
  const changedTransitions = attrSummary?.changed_transitions ?? 0;
  const unchangedTransitions = attrSummary?.unchanged_transitions ?? 0;
  const changePct = totalTransitions > 0
    ? ((changedTransitions / totalTransitions) * 100).toFixed(2)
    : 'N/A';

  log(`  Total consecutive allocation transitions  : ${totalTransitions}`);
  log(`  Transitions with attribution change       : ${changedTransitions} (${changePct}%)`);
  log(`  Transitions with NO attribution change    : ${unchangedTransitions}`);

  if (unchangedTransitions > 0) {
    const unchangedSampleResult = await db.execute(sql`
      SELECT a.punch_ledger_id, a.id AS a_id, b.id AS b_id
      FROM labor_allocations a
      JOIN labor_allocations b
        ON b.punch_ledger_id = a.punch_ledger_id
        AND b.sequence_order = a.sequence_order + 1
      WHERE
        a.traveler_id IS NOT DISTINCT FROM b.traveler_id AND
        a.traveler_step_id IS NOT DISTINCT FROM b.traveler_step_id AND
        a.charge_code_id IS NOT DISTINCT FROM b.charge_code_id AND
        a.production_work_order_id IS NOT DISTINCT FROM b.production_work_order_id
      LIMIT 5
    `);
    type SampleRow = { punch_ledger_id: number; a_id: number; b_id: number };
    err(`  WARN [attribution] ${unchangedTransitions} transition(s) with no attribution field change (may be legitimate re-opens):`);
    (unchangedSampleResult.rows as SampleRow[]).forEach((r) =>
      err(`    punch_ledger_id=${r.punch_ledger_id}  la#${r.a_id} → la#${r.b_id}`)
    );
  } else if (totalTransitions === 0) {
    log(`  No multi-allocation transitions to validate.`);
  } else {
    log(`  PASS [attribution] All consecutive allocation transitions differ in at least one attribution field.`);
  }
  log('');

  // ────────────────────────────────────────────────────────────────────────────
  // Step 8 — Edge cases
  // ────────────────────────────────────────────────────────────────────────────
  log('──────────────────────────────────────────────────────────────');
  log('Step 8 — Edge cases');
  log('──────────────────────────────────────────────────────────────');

  // 8a: Proxy for "allocations created without a prior OPEN allocation for their session".
  // switchAllocation always closes the existing OPEN row before inserting the next one.
  // Therefore, any row with sequence_order > 1 whose immediate predecessor (seq - 1)
  // does not exist OR is not in CLOSED status indicates a switch that skipped the close
  // step — i.e., it was created without going through a valid OPEN predecessor.
  // Note: AMENDED predecessors are treated as anomalies here; adjust if that status
  // is intentionally introduced in future phases.
  const orphanSeqCountResult = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM labor_allocations la
    WHERE la.sequence_order > 1
      AND NOT EXISTS (
        SELECT 1 FROM labor_allocations prev
        WHERE prev.punch_ledger_id = la.punch_ledger_id
          AND prev.sequence_order = la.sequence_order - 1
          AND prev.status = 'CLOSED'
      )
  `);
  const orphanSeqCount = (orphanSeqCountResult.rows[0] as { cnt: number }).cnt;

  const orphanSeqSampleResult = await db.execute(sql`
    SELECT la.id, la.punch_ledger_id, la.sequence_order
    FROM labor_allocations la
    WHERE la.sequence_order > 1
      AND NOT EXISTS (
        SELECT 1 FROM labor_allocations prev
        WHERE prev.punch_ledger_id = la.punch_ledger_id
          AND prev.sequence_order = la.sequence_order - 1
          AND prev.status = 'CLOSED'
      )
    ORDER BY la.punch_ledger_id
    LIMIT 5
  `);
  type OrphanSeqRow = { id: number; punch_ledger_id: number; sequence_order: number };
  const orphanSeqSamples = orphanSeqSampleResult.rows as OrphanSeqRow[];

  log(`  8a) [proxy check] Allocations (seq > 1) without a CLOSED predecessor`);
  log(`      (approximates: "created without a prior OPEN allocation closed first") : ${orphanSeqCount}`);
  if (orphanSeqCount > 0) {
    failures++;
    err(`  FAIL [edge case 8a] ${orphanSeqCount} allocation(s) lack a CLOSED predecessor — the preceding OPEN row was never closed before this row was inserted:`);
    orphanSeqSamples.forEach((r) =>
      err(`    la.id=${r.id}  punch_ledger_id=${r.punch_ledger_id}  sequence_order=${r.sequence_order}`)
    );
    if (orphanSeqCount > 5) err(`    ... and ${orphanSeqCount - 5} more`);
  } else {
    log(`  PASS [edge case 8a] All non-first allocations have a properly CLOSED predecessor row.`);
  }

  // 8b: allocations where allocation_end IS NULL but status != 'OPEN'
  const nullEndNonOpenCountResult = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM labor_allocations
    WHERE allocation_end IS NULL AND status != 'OPEN'
  `);
  const nullEndNonOpenCount = (nullEndNonOpenCountResult.rows[0] as { cnt: number }).cnt;

  const nullEndNonOpenSampleResult = await db.execute(sql`
    SELECT id, punch_ledger_id, status, sequence_order
    FROM labor_allocations
    WHERE allocation_end IS NULL AND status != 'OPEN'
    ORDER BY punch_ledger_id
    LIMIT 5
  `);
  type NullEndRow = { id: number; punch_ledger_id: number; status: string; sequence_order: number };
  const nullEndNonOpenSamples = nullEndNonOpenSampleResult.rows as NullEndRow[];

  log(`  8b) Allocations where allocation_end IS NULL but status != 'OPEN' : ${nullEndNonOpenCount}`);
  if (nullEndNonOpenCount > 0) {
    failures++;
    err(`  FAIL [edge case 8b] ${nullEndNonOpenCount} allocation(s) have null end but non-OPEN status:`);
    nullEndNonOpenSamples.forEach((r) =>
      err(`    la.id=${r.id}  punch_ledger_id=${r.punch_ledger_id}  status=${r.status}  seq=${r.sequence_order}`)
    );
    if (nullEndNonOpenCount > 5) err(`    ... and ${nullEndNonOpenCount - 5} more`);
  } else {
    log(`  PASS [edge case 8b] No allocations with null allocation_end and non-OPEN status.`);
  }

  // 8c: allocations where sequence_order IS NULL
  const nullSeqCountResult = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM labor_allocations
    WHERE sequence_order IS NULL
  `);
  const nullSeqCount = (nullSeqCountResult.rows[0] as { cnt: number }).cnt;

  const nullSeqSampleResult = await db.execute(sql`
    SELECT id, punch_ledger_id, status
    FROM labor_allocations
    WHERE sequence_order IS NULL
    ORDER BY punch_ledger_id
    LIMIT 5
  `);
  type NullSeqRow = { id: number; punch_ledger_id: number; status: string };
  const nullSeqSamples = nullSeqSampleResult.rows as NullSeqRow[];

  log(`  8c) Allocations with sequence_order IS NULL : ${nullSeqCount}`);
  if (nullSeqCount > 0) {
    failures++;
    err(`  FAIL [edge case 8c] ${nullSeqCount} allocation(s) have NULL sequence_order:`);
    nullSeqSamples.forEach((r) =>
      err(`    la.id=${r.id}  punch_ledger_id=${r.punch_ledger_id}  status=${r.status}`)
    );
    if (nullSeqCount > 5) err(`    ... and ${nullSeqCount - 5} more`);
  } else {
    log(`  PASS [edge case 8c] No allocations with NULL sequence_order.`);
  }
  log('');

  // ────────────────────────────────────────────────────────────────────────────
  // Step 9 — Real example trace
  // ────────────────────────────────────────────────────────────────────────────
  log('──────────────────────────────────────────────────────────────');
  log('Step 9 — Real example trace');
  log('──────────────────────────────────────────────────────────────');

  const exampleSessionResult = await db.execute(sql`
    SELECT punch_ledger_id
    FROM labor_allocations
    GROUP BY punch_ledger_id
    HAVING COUNT(*) >= 2
    ORDER BY punch_ledger_id DESC
    LIMIT 1
  `);
  type ExampleSessionRow = { punch_ledger_id: number };
  const exampleSessionRows = exampleSessionResult.rows as ExampleSessionRow[];

  if (exampleSessionRows.length === 0) {
    log(`  No sessions with 2+ allocations found — skipping example trace.`);
    log(`  (Allocation switching has not been exercised yet in this dataset.)`);
  } else {
    const exampleId = exampleSessionRows[0].punch_ledger_id;

    const punchRowResult = await db.execute(sql`
      SELECT *
      FROM punch_ledger
      WHERE id = ${exampleId}
    `);
    type PunchRow = Record<string, unknown>;
    const punch = punchRowResult.rows[0] as PunchRow;

    log(`  punch_ledger row for session ${exampleId}:`);
    Object.entries(punch).forEach(([k, v]) =>
      log(`    ${k.padEnd(32)} : ${v !== null && v !== undefined ? String(v) : 'NULL'}`)
    );
    log('');

    const allocRowsResult = await db.execute(sql`
      SELECT *
      FROM labor_allocations
      WHERE punch_ledger_id = ${exampleId}
      ORDER BY sequence_order
    `);
    type AllocTraceRow = Record<string, unknown>;
    log(`  labor_allocations rows (${allocRowsResult.rows.length} total):`);
    (allocRowsResult.rows as AllocTraceRow[]).forEach((row, idx) => {
      log(`  --- Allocation ${idx + 1} ---`);
      Object.entries(row).forEach(([k, v]) =>
        log(`    ${k.padEnd(28)} : ${v !== null && v !== undefined ? String(v) : 'NULL'}`)
      );
    });
  }
  log('');

  // ────────────────────────────────────────────────────────────────────────────
  // Step 10 — Final verdict
  // ────────────────────────────────────────────────────────────────────────────
  log('══════════════════════════════════════════════════════════════');
  log('Step 10 — Final Verdict');
  log('══════════════════════════════════════════════════════════════');
  log(`  Checks failed : ${failures}`);

  if (failures === 0) {
    log(`  Result        : READY FOR NEXT PHASE`);
    log(`  All structural checks passed. Allocation switching data is correct.`);
  } else {
    err(`  Result        : NOT READY — review issues above`);
    err(`  ${failures} check(s) failed. Address the failures listed above before proceeding.`);
  }
  log('══════════════════════════════════════════════════════════════');

  return failures;
}

audit()
  .then((failures) => {
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error('[phaseDValidationAudit] Unexpected error:', error);
    process.exit(1);
  });

export { audit };
