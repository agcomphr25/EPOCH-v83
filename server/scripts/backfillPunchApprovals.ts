/**
 * Backfill: TRAVELER-source punch_ledger rows that were written with
 * approvalStatus = 'AUTO' before Task #77 enforcement.
 *
 * Per Architecture Constitution §5.2:
 *   - Every WAD-linked TRAVELER session MUST have a labor_approvals row
 *     before its hours can flow to GL / payroll / DCAA.
 *   - We synthesize one labor_approvals row per (employee_id, production_work_order_id)
 *     group for historical AUTO punches, attributed to 'system-migration', then
 *     stamp the punches as APPROVED with labor_approval_id linked.
 *
 * Scope is bounded by a cutover timestamp.  Only rows created strictly before
 * the cutover are touched.  Rows at or after the cutover should already obey
 * the PENDING_APPROVAL default (the application-layer change is live by then),
 * and they are intentionally left alone so this script can never mutate
 * post-enforcement data.
 *
 * Anything we cannot back-fill (no WAD link, no employee, etc.) is reported in
 * a deterministic JSON reconciliation file and stamped FLAGGED for manual
 * supervisor review.
 *
 * Usage:
 *   npx tsx server/scripts/backfillPunchApprovals.ts --cutover 2026-05-06
 *   npx tsx server/scripts/backfillPunchApprovals.ts --cutover 2026-05-06 --apply
 *   npx tsx server/scripts/backfillPunchApprovals.ts --cutover 2026-05-06 --apply --report ./backfill-report.json
 */

import { writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '../db';

interface CandidateGroup {
  employee_id: number;
  production_work_order_id: string;
  punch_count: number;
  total_hours: number;
  earliest_created_at: string;
  latest_created_at: string;
}

interface UnbackfillableRow {
  id: number;
  employee_id: number | null;
  production_work_order_id: string | null;
  created_at: string;
  reason: 'NO_WAD_LINK' | 'NO_EMPLOYEE_ID';
}

interface ReconciliationReport {
  generatedAt: string;
  cutover: string;
  mode: 'DRY_RUN' | 'APPLY';
  candidateGroups: CandidateGroup[];
  unbackfillableRows: UnbackfillableRow[];
  appliedSummary?: {
    approvalsCreated: number;
    approvalsReused: number;
    punchesFlipped: number;
    punchesFlagged: number;
  };
}

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const cutoverIdx = argv.indexOf('--cutover');
  if (cutoverIdx === -1 || !argv[cutoverIdx + 1]) {
    throw new Error(
      '--cutover <ISO-DATE> is required.  Pass the timestamp at which the §5.2 application-layer enforcement went live; rows created at or after this time are left untouched.',
    );
  }
  const cutover = argv[cutoverIdx + 1];
  const cutoverDate = new Date(cutover);
  if (Number.isNaN(cutoverDate.getTime())) {
    throw new Error(`--cutover '${cutover}' is not a valid ISO date/timestamp.`);
  }

  const reportIdx = argv.indexOf('--report');
  const reportPath = reportIdx !== -1 ? argv[reportIdx + 1] : null;

  return { apply, cutover: cutoverDate, reportPath };
}

async function main() {
  const { apply, cutover, reportPath } = parseArgs(process.argv);
  console.log(
    `[backfillPunchApprovals] mode=${apply ? 'APPLY' : 'DRY-RUN'} cutover=${cutover.toISOString()}`,
  );

  // Identify TRAVELER+AUTO rows BEFORE the cutover that have no WAD/employee link.
  const unbackfillableRes = await db.execute(sql`
    SELECT id, employee_id, production_work_order_id, created_at
    FROM punch_ledger
    WHERE source = 'TRAVELER'
      AND approval_status = 'AUTO'
      AND created_at < ${cutover.toISOString()}::timestamptz
      AND (employee_id IS NULL OR production_work_order_id IS NULL)
    ORDER BY id
  `);
  const unbackfillableRows: UnbackfillableRow[] = (unbackfillableRes as any).rows.map((r: any) => ({
    id: r.id,
    employee_id: r.employee_id,
    production_work_order_id: r.production_work_order_id,
    created_at: r.created_at,
    reason: r.production_work_order_id == null ? 'NO_WAD_LINK' : 'NO_EMPLOYEE_ID',
  }));

  // Group the back-fillable rows by (employee_id, production_work_order_id).
  const groupsRes = await db.execute(sql`
    SELECT employee_id,
           production_work_order_id,
           COUNT(*)::int AS punch_count,
           COALESCE(SUM(EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600.0), 0)::float AS total_hours,
           MIN(created_at) AS earliest_created_at,
           MAX(created_at) AS latest_created_at
    FROM punch_ledger
    WHERE source = 'TRAVELER'
      AND approval_status = 'AUTO'
      AND created_at < ${cutover.toISOString()}::timestamptz
      AND employee_id IS NOT NULL
      AND production_work_order_id IS NOT NULL
    GROUP BY employee_id, production_work_order_id
    ORDER BY employee_id, production_work_order_id
  `);
  const candidateGroups: CandidateGroup[] = (groupsRes as any).rows;

  // Audit: warn (loudly) if there are any post-cutover TRAVELER+AUTO rows;
  // these indicate an application-layer regression and we refuse to touch them.
  const postCutoverRes = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM punch_ledger
    WHERE source = 'TRAVELER'
      AND approval_status = 'AUTO'
      AND created_at >= ${cutover.toISOString()}::timestamptz
  `);
  const postCutoverCount = (postCutoverRes as any).rows[0]?.cnt ?? 0;

  console.log(`[backfillPunchApprovals] candidate groups (pre-cutover): ${candidateGroups.length}`);
  console.log(`[backfillPunchApprovals] unbackfillable rows (pre-cutover): ${unbackfillableRows.length}`);
  if (postCutoverCount > 0) {
    console.warn(
      `[backfillPunchApprovals] WARNING: ${postCutoverCount} TRAVELER+AUTO rows exist AT OR AFTER the cutover. ` +
        `These are NOT touched by this script — investigate the application-layer regression that allowed them.`,
    );
  }

  const report: ReconciliationReport = {
    generatedAt: new Date().toISOString(),
    cutover: cutover.toISOString(),
    mode: apply ? 'APPLY' : 'DRY_RUN',
    candidateGroups,
    unbackfillableRows,
  };

  if (apply) {
    let approvalsCreated = 0;
    let approvalsReused = 0;
    let punchesFlipped = 0;

    await db.transaction(async (tx) => {
      for (const g of candidateGroups) {
        const existingRes = await tx.execute(sql`
          SELECT id FROM labor_approvals
          WHERE employee_id = ${String(g.employee_id)}
            AND production_work_order_id = ${g.production_work_order_id}::uuid
          LIMIT 1
        `);
        const existing = (existingRes as any).rows[0];

        let approvalId: number;
        if (existing) {
          approvalId = existing.id;
          approvalsReused += 1;
        } else {
          const insertRes = await tx.execute(sql`
            INSERT INTO labor_approvals
              (production_work_order_id, employee_id, approved_by, department, reason, hours_at_approval)
            VALUES
              (${g.production_work_order_id}::uuid,
               ${String(g.employee_id)},
               'system-migration',
               NULL,
               ${'Task #77 backfill: synthesized approval for historical TRAVELER+AUTO punches'},
               ${g.total_hours.toFixed(4)})
            RETURNING id
          `);
          approvalId = (insertRes as any).rows[0].id;
          approvalsCreated += 1;
        }

        const flipRes = await tx.execute(sql`
          UPDATE punch_ledger
          SET approval_status = 'APPROVED',
              labor_approval_id = ${approvalId},
              updated_at = NOW()
          WHERE source = 'TRAVELER'
            AND approval_status = 'AUTO'
            AND created_at < ${cutover.toISOString()}::timestamptz
            AND employee_id = ${g.employee_id}
            AND production_work_order_id = ${g.production_work_order_id}::uuid
        `);
        punchesFlipped += (flipRes as { rowCount?: number }).rowCount ?? 0;
      }

      // Stamp the unbackfillable rows as FLAGGED for manual triage.
      let flagged = 0;
      if (unbackfillableRows.length > 0) {
        const flagRes = await tx.execute(sql`
          UPDATE punch_ledger
          SET approval_status = 'FLAGGED',
              override_reason = COALESCE(
                override_reason,
                'Task #77 backfill: TRAVELER+AUTO without WAD/employee link — manual review required'
              ),
              updated_at = NOW()
          WHERE source = 'TRAVELER'
            AND approval_status = 'AUTO'
            AND created_at < ${cutover.toISOString()}::timestamptz
            AND (employee_id IS NULL OR production_work_order_id IS NULL)
        `);
        flagged = (flagRes as { rowCount?: number }).rowCount ?? 0;
      }

      report.appliedSummary = {
        approvalsCreated,
        approvalsReused,
        punchesFlipped,
        punchesFlagged: flagged,
      };
    });

    console.log(
      `[backfillPunchApprovals] APPLY complete. ${JSON.stringify(report.appliedSummary)}`,
    );
  } else {
    console.log('[backfillPunchApprovals] dry-run complete (no writes). Re-run with --apply to commit.');
  }

  if (reportPath) {
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[backfillPunchApprovals] reconciliation report written to ${reportPath}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfillPunchApprovals] FAILED', err);
    process.exit(1);
  });
