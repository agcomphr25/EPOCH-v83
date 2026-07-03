/**
 * Backfill Superseded WAD Work Orders (Task #258)
 *
 * Background:
 *   When a P2 work order is assigned to a project, any WAD-generated
 *   `production_work_orders` row on the same project that covers the same
 *   part number is redundant. The runtime helper
 *   `cancelWadWorkOrdersSupersededByP2` now cancels these as P2 POs are
 *   linked, but historical projects can still contain redundant WAD WOs
 *   that pre-date the fix.
 *
 *   This script sweeps every project that has at least one linked P2 PO
 *   and cancels the redundant WAD WOs. It records an audit-ledger event
 *   per cancellation just like the live path.
 *
 * Behavior:
 *   - Finds the distinct set of project IDs that have either
 *     `projects.po_id` populated, or at least one `project_steps` row with
 *     a non-null `linked_p2_order_id`.
 *   - For each project, invokes `cancelWadWorkOrdersSupersededByP2` and
 *     prints a summary.
 *   - With `--dry-run`, reports what would be cancelled without writing.
 *
 * Idempotent: re-runs are no-ops because already-CANCELLED WAD WOs are
 * skipped by the helper.
 *
 * Usage:
 *   npx tsx server/scripts/backfillSupersededWadWorkOrders.ts [--dry-run]
 */

import { sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { cancelWadWorkOrdersSupersededByP2 } from '../src/services/wadSupersedeService';

interface CliArgs {
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[backfill-superseded-wad] starting (dry-run=${args.dryRun})`);

  const projects = await pool.query<{ projectId: string }>(`
    SELECT id::text AS "projectId" FROM projects WHERE po_id IS NOT NULL
    UNION
    SELECT DISTINCT project_id::text AS "projectId"
    FROM project_steps
    WHERE linked_p2_order_id IS NOT NULL AND project_id IS NOT NULL
  `);

  console.log(`[backfill-superseded-wad] scanning ${projects.length} project(s) with a linked P2 PO`);

  let totalCancelled = 0;
  let projectsAffected = 0;

  for (const { projectId } of projects) {
    if (args.dryRun) {
      const candidates: any = await db.execute(sql`
        WITH project_po_link AS (
          SELECT p.po_id AS po_id FROM projects p
          WHERE p.id = ${projectId}::uuid AND p.po_id IS NOT NULL
          UNION
          SELECT ps.linked_p2_order_id AS po_id FROM project_steps ps
          WHERE ps.project_id = ${projectId}::uuid AND ps.linked_p2_order_id IS NOT NULL
        ),
        p2_parts AS (
          SELECT DISTINCT TRIM(poi.part_number) AS part_number
          FROM project_po_link ppl
          JOIN p2_purchase_order_items poi ON poi.po_id = ppl.po_id
          WHERE poi.part_number IS NOT NULL AND TRIM(poi.part_number) <> ''
        )
        SELECT wo.id::text AS id, wo.work_order_number AS "workOrderNumber",
               wo.part_number AS "partNumber", wo.status
        FROM production_work_orders wo
        JOIN p2_parts pp ON TRIM(wo.part_number) = pp.part_number
        WHERE wo.project_id = ${projectId}::uuid
          AND wo.status NOT IN ('CANCELLED', 'CANCELED', 'COMPLETE', 'COMPLETED', 'CLOSED')
          AND wo.work_order_number LIKE 'WAD-%'
      `);
      const rows = Array.isArray(candidates) ? candidates : (candidates?.rows ?? []);
      if (rows.length > 0) {
        projectsAffected++;
        totalCancelled += rows.length;
        console.log(`  [dry-run] project ${projectId}: would cancel ${rows.length} WAD WO(s):`);
        for (const r of rows) {
          console.log(`    - ${r.workOrderNumber} (part=${r.partNumber}, status=${r.status})`);
        }
      }
      continue;
    }

    try {
      const result = await cancelWadWorkOrdersSupersededByP2(projectId, {
        sourceService: 'backfill:task-258',
      });
      if (result.cancelledCount > 0) {
        projectsAffected++;
        totalCancelled += result.cancelledCount;
        console.log(`  project ${projectId}: cancelled ${result.cancelledCount} WAD WO(s)`);
        for (const c of result.cancelled) {
          console.log(`    - ${c.workOrderNumber} (part=${c.partNumber}, was=${c.previousStatus}, superseded by ${c.supersedingP2PoNumbers.join(', ') || 'N/A'})`);
        }
      }
    } catch (err) {
      console.error(`  project ${projectId}: ERROR`, err);
    }
  }

  console.log(`[backfill-superseded-wad] done. projectsAffected=${projectsAffected} totalCancelled=${totalCancelled}`);
  await pool.end();
}

main().catch((err) => {
  console.error('[backfill-superseded-wad] fatal:', err);
  process.exit(1);
});
