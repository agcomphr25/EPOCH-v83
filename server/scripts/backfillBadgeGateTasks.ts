/**
 * Backfill Stuck Badge-Gate Tasks (Task #212)
 *
 * Background:
 *   The auto-complete pass inside `performStepStart` historically excluded
 *   badge-named CHECK/GATE_CHECK tasks whose `requiresCertification` flag was
 *   `true`. Because the operator UI hides badge-gate tasks (it assumes the
 *   backend auto-completes them), affected travelers ended up with an
 *   IN_PROGRESS step whose hidden Badge Scan task was still NOT_STARTED, and
 *   the Sign endpoint rejected the step with `incomplete_tasks` referencing
 *   the invisible task.
 *
 *   The bug is fixed in `server/src/routes/travelers.ts` (badge-gate filter no
 *   longer excludes `requiresCertification`). This script unblocks travelers
 *   that are already stuck in the broken state without forcing operators to
 *   restart the step.
 *
 * Behavior:
 *   - Finds traveler steps in `IN_PROGRESS` whose START-phase
 *     CHECK/GATE_CHECK tasks with a badge-name (matches /badge/i) and
 *     `requires_signature = false` are still `NOT_STARTED`.
 *   - Marks each such task COMPLETED, attributing the completion to the
 *     step's `startedBy` / `startedAt` (falling back to NOW() if missing).
 *
 * Idempotent: re-runs are no-ops because tasks already COMPLETED are skipped.
 *
 * Usage:
 *   npx tsx server/scripts/backfillBadgeGateTasks.ts [--dry-run]
 */

import { sql, and, eq, ne } from 'drizzle-orm';
import { db } from '../db';
import { travelerSteps, travelerTasks } from '../schema';

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
  console.log(`[backfill-badge-gate-tasks] starting (dry-run=${args.dryRun})`);

  const candidates = await db
    .select({
      taskId: travelerTasks.id,
      taskTitle: travelerTasks.title,
      stepId: travelerSteps.id,
      travelerId: travelerSteps.travelerId,
      startedAt: travelerSteps.startedAt,
      startedBy: travelerSteps.startedBy,
    })
    .from(travelerTasks)
    .innerJoin(travelerSteps, eq(travelerTasks.travelerStepId, travelerSteps.id))
    .where(
      and(
        eq(travelerSteps.status, 'IN_PROGRESS'),
        eq(travelerTasks.status, 'NOT_STARTED'),
        eq(travelerTasks.taskPhase, 'START'),
        eq(travelerTasks.requiresSignature, false),
        sql`${travelerTasks.taskType} IN ('CHECK', 'GATE_CHECK')`,
        sql`${travelerTasks.title} ~* 'badge'`,
      ),
    );

  console.log(
    `[backfill-badge-gate-tasks] found ${candidates.length} stuck badge-gate task(s)`,
  );

  let updated = 0;
  for (const row of candidates) {
    const completedBy = row.startedBy ?? 'system:backfill-task-212';
    const completedAt = row.startedAt ?? new Date();

    if (args.dryRun) {
      console.log(
        `  [dry-run] would complete task ${row.taskId} (${row.taskTitle}) on step ${row.stepId} (traveler ${row.travelerId}) as ${completedBy}`,
      );
    } else {
      await db
        .update(travelerTasks)
        .set({
          status: 'COMPLETED',
          completedAt,
          completedBy,
        })
        .where(
          and(
            eq(travelerTasks.id, row.taskId),
            ne(travelerTasks.status, 'COMPLETED'),
          ),
        );
    }
    updated++;
  }

  console.log(`[backfill-badge-gate-tasks] summary:`);
  console.log(`  candidates : ${candidates.length}`);
  console.log(
    `  updated    : ${updated}${args.dryRun ? ' (dry-run, no writes)' : ''}`,
  );
}

main()
  .then(() => {
    console.log('[backfill-badge-gate-tasks] done');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[backfill-badge-gate-tasks] failed:', err);
    process.exit(1);
  });
