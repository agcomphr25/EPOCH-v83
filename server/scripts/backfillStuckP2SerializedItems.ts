/**
 * Backfill Stuck P2 Serialized Items (Task #257)
 *
 * Background:
 *   When a traveler step is completed, the per-step sync in
 *   `server/src/routes/travelers.ts` advances the matching
 *   `p2_serialized_items` row through the routing department sequence.
 *   Historically that sync silently no-op'd in three failure modes:
 *     1. The serial lookup restricted to `status = 'ACTIVE'` AND used a
 *        bare ilike, so a row whose serial casing/whitespace differed
 *        was missed.
 *     2. When the completed step's department didn't appear in the
 *        item's routing sequence, the sync returned without doing
 *        anything — leaving the item stuck on its current department
 *        forever.
 *     3. Any thrown exception was swallowed into `console.error`.
 *
 *   The reported symptom: serials `str2600118`, `str2600125`,
 *   `str2600134`, `str2600139` showed in the P2 Control Center →
 *   Production tab's "Pending Layup" queue even though their travelers
 *   were already COMPLETED end-to-end.
 *
 * Behavior:
 *   - Finds every `p2_serialized_items` row with `status = 'ACTIVE'`
 *     whose matching `travelers` row (by trimmed, case-insensitive
 *     serial number) is in status `COMPLETED`.
 *   - For each such row:
 *       * sets `status = 'COMPLETED'`,
 *       * sets `completed_at = now()`,
 *       * back-fills any missing per-department completion timestamps
 *         from the corresponding traveler step `completed_at` when one
 *         can be matched by department alias, otherwise stamps now(),
 *       * writes a `TRANSITION` row to `p2_serialized_item_events` for
 *         audit (eventType=TRANSITION, performedBy='system:backfill-task-257').
 *
 * Idempotent:
 *   Re-runs are no-ops because the candidate query filters to
 *   `status = 'ACTIVE'`, and already-COMPLETED rows are skipped.
 *
 * Usage:
 *   npx tsx server/scripts/backfillStuckP2SerializedItems.ts [--dry-run] \
 *     [--serial str2600118] [--serial str2600125] ...
 *
 *   --dry-run        : log what would change without writing.
 *   --serial <sn>    : only consider the given serial (repeatable).
 *                      When omitted, processes every stuck row found.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db';
import {
  p2SerializedItems,
  p2SerializedItemEvents,
  travelers,
  travelerSteps,
} from '../schema';

interface CliArgs {
  dryRun: boolean;
  serials: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, serials: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--serial') {
      const next = argv[++i];
      if (next) args.serials.push(next.trim());
    }
  }
  return args;
}

const DEPT_ALIASES: Record<string, string> = {
  'layup': 'layup',
  'layupplugging': 'layup',
  'layup/plugging': 'layup',
  'assembledisassembly': 'assembledisassembly',
  'assemble/disassembly': 'assembledisassembly',
  'assembly/disassembly': 'assembledisassembly',
  'assembly': 'assembledisassembly',
  'cnc': 'cnc',
  'finish': 'finish',
  'finishing': 'finish',
  'paint': 'paint',
  'painting': 'paint',
  'finalqc': 'finalqc',
  'final qc': 'finalqc',
  'final_qc': 'finalqc',
  'shipping': 'shipping',
};

function normalizeDept(d: string): string {
  let lower = (d || '').toLowerCase().trim();
  lower = lower.replace(/^pending\s+/i, '');
  if (DEPT_ALIASES[lower]) return DEPT_ALIASES[lower];
  const stripped = lower.replace(/[^a-z0-9]/g, '');
  return DEPT_ALIASES[stripped] || stripped;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[backfill-stuck-p2-serialized-items] starting (dry-run=${args.dryRun}, serials=${args.serials.join(',') || 'ALL'})`);

  // Candidate rows: ACTIVE p2_serialized_items whose matching
  // traveler (by trimmed, case-insensitive serial) is COMPLETED.
  const serialFilter = args.serials.length > 0
    ? sql`AND LOWER(TRIM(psi.serial_number)) = ANY(${sql.raw('ARRAY[' + args.serials.map((s) => `'${s.toLowerCase().replace(/'/g, "''")}'`).join(',') + ']::text[]')})`
    : sql``;

  const rows = await db.execute<{
    item_id: string;
    barcode: string;
    serial_number: string;
    current_department: string;
    current_stage_index: number | null;
    traveler_id: string;
    traveler_status: string;
  }>(sql`
    SELECT
      psi.id AS item_id,
      psi.barcode,
      psi.serial_number,
      psi.current_department,
      psi.current_stage_index,
      t.id AS traveler_id,
      t.status AS traveler_status
    FROM ${p2SerializedItems} psi
    INNER JOIN ${travelers} t
      ON LOWER(TRIM(t.serial_number)) = LOWER(TRIM(psi.serial_number))
    WHERE psi.status = 'ACTIVE'
      AND t.status = 'COMPLETED'
      ${serialFilter}
  `);

  const candidates = (rows as any).rows ?? rows;
  console.log(`[backfill-stuck-p2-serialized-items] found ${candidates.length} stuck item(s)`);

  let updated = 0;
  let skipped = 0;
  for (const row of candidates as any[]) {
    const itemId: string = row.item_id;
    const travelerId: string = row.traveler_id;
    const barcode: string = row.barcode;
    const currentDept: string = row.current_department;
    const currentStageIndex: number = row.current_stage_index ?? 0;

    // Pull completed traveler steps for per-dept timestamp backfill.
    const stepsRes = await db.execute<{ department_name: string; completed_at: Date | null }>(sql`
      SELECT department_name, completed_at
      FROM ${travelerSteps}
      WHERE traveler_id = ${travelerId}
        AND status = 'COMPLETED'
      ORDER BY step_number ASC
    `);
    const completedSteps = ((stepsRes as any).rows ?? stepsRes) as any[];

    // Map dept-key -> earliest completed_at across this traveler's steps.
    const deptCompletionByKey = new Map<string, Date>();
    for (const s of completedSteps) {
      const key = normalizeDept(s.department_name);
      const ts = s.completed_at ? new Date(s.completed_at) : null;
      if (!ts) continue;
      const existing = deptCompletionByKey.get(key);
      if (!existing || ts < existing) deptCompletionByKey.set(key, ts);
    }

    const now = new Date();
    const perDept: Array<[string, string]> = [
      ['layup', 'layup_completed_at'],
      ['assembledisassembly', 'assemble_disassembly_completed_at'],
      ['cnc', 'cnc_completed_at'],
      ['finish', 'finish_completed_at'],
      ['paint', 'paint_completed_at'],
      ['finalqc', 'final_qc_completed_at'],
    ];
    const tsByCol: Record<string, Date> = {};
    for (const [key, col] of perDept) {
      tsByCol[col] = deptCompletionByKey.get(key) ?? now;
    }

    if (args.dryRun) {
      console.log(
        `[dry-run] would COMPLETE item "${barcode}" (serial=${row.serial_number}, ` +
        `traveler=${travelerId}, from dept "${currentDept}" idx=${currentStageIndex})`
      );
      continue;
    }

    // Atomic update + event insert via Drizzle.
    await db.transaction(async (tx) => {
      const updateRes = await tx.execute(sql`
        UPDATE ${p2SerializedItems}
        SET
          status = 'COMPLETED',
          completed_at = ${now},
          updated_at = ${now},
          layup_completed_at = COALESCE(layup_completed_at, ${tsByCol['layup_completed_at']}),
          assemble_disassembly_completed_at = COALESCE(assemble_disassembly_completed_at, ${tsByCol['assemble_disassembly_completed_at']}),
          cnc_completed_at = COALESCE(cnc_completed_at, ${tsByCol['cnc_completed_at']}),
          finish_completed_at = COALESCE(finish_completed_at, ${tsByCol['finish_completed_at']}),
          paint_completed_at = COALESCE(paint_completed_at, ${tsByCol['paint_completed_at']}),
          final_qc_completed_at = COALESCE(final_qc_completed_at, ${tsByCol['final_qc_completed_at']})
        WHERE id = ${itemId}
          AND status = 'ACTIVE'
      `);

      const affected = (updateRes as any).rowCount ?? 0;
      if (affected === 0) {
        skipped++;
        console.log(`[skip] "${barcode}" was no longer ACTIVE (race) — not touching events`);
        return;
      }

      await tx.insert(p2SerializedItemEvents).values({
        serializedItemId: itemId,
        barcode,
        eventType: 'TRANSITION',
        fromDepartment: currentDept,
        toDepartment: 'COMPLETED',
        fromStageIndex: currentStageIndex,
        toStageIndex: null,
        performedBy: 'system:backfill-task-257',
        notes: `Backfilled by Task #257 — traveler ${travelerId} already COMPLETED but item was still ACTIVE in "${currentDept}".`,
      });

      updated++;
      console.log(
        `[updated] "${barcode}" (serial=${row.serial_number}) -> COMPLETED ` +
        `(was "${currentDept}" idx=${currentStageIndex}, traveler=${travelerId})`
      );
    });
  }

  console.log(
    `[backfill-stuck-p2-serialized-items] done. ` +
    `${args.dryRun ? `${candidates.length} candidates (dry-run)` : `${updated} updated, ${skipped} skipped`}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill-stuck-p2-serialized-items] FAILED:', err);
    process.exit(1);
  });
