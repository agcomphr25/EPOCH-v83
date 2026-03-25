/**
 * Centralized Schema Mutation Executor
 *
 * All destructive DDL (DROP TABLE, DROP COLUMN, ALTER COLUMN type changes) in
 * server/index.ts boot migrations should go through executeSchemaMutation().
 *
 * This ensures:
 *  1. checkMigration() guard runs BEFORE execution
 *  2. schemaPolicy.evaluate() decides allow/block
 *  3. captureColumnState / captureTableState captures before_state
 *  4. DDL is executed only if guard+policy allow it
 *  5. logMutation() records the action with before_state + after_state
 *
 * For boot paths, this is non-throwing: any internal error is logged as a warning
 * and the function returns { executed: false, reason: '...' }.
 */

import { Pool } from 'pg';
import { checkMigration } from './migrationGuard';
import { evaluate } from './schemaPolicy';
import {
  logMutation,
  captureColumnState,
  captureTableState,
  MutationLogEntry,
} from './mutationLogger';

export interface MutationResult {
  executed: boolean;
  blocked: boolean;
  reason: string;
}

export interface ExecuteMutationOptions {
  actor?: string;
  overrideReason?: string;
}

/**
 * Execute a destructive schema DDL statement through the full governance pipeline:
 * guard → policy → capture before state → execute → capture after state → audit log.
 *
 * Non-throwing: governance or execution errors result in { executed: false }.
 * Only pass DDL that is destructive (DROP TABLE, DROP COLUMN, ALTER COLUMN type change).
 * For additive changes (ADD COLUMN IF NOT EXISTS), calling this is unnecessary but harmless.
 *
 * @param pool      PostgreSQL Pool for guard + state capture + audit log
 * @param ddlSql    The DDL SQL statement to evaluate and execute
 * @param execFn    Async function that actually executes the DDL (e.g., via Drizzle `db.execute`)
 * @param logEntry  Partial MutationLogEntry (tableName, columnName, actionType required)
 * @param options   Actor name and override reason
 */
export async function executeSchemaMutation(
  pool: Pool,
  ddlSql: string,
  execFn: () => Promise<void>,
  logEntry: Pick<MutationLogEntry, 'tableName' | 'columnName' | 'actionType'>,
  options: ExecuteMutationOptions = {}
): Promise<MutationResult> {
  const actor = options.actor ?? 'boot-migration';
  const overrideReason = options.overrideReason ?? 'Boot-time schema migration via governance guard';

  try {
    // Step 1: run guard
    const guardResult = await checkMigration(ddlSql, pool, false);
    const blockedViolations = guardResult.violations.filter(v => v.blocked);

    // Step 2: run policy
    const policy = evaluate(guardResult.violations, [], false);

    if (blockedViolations.length > 0 || !policy.allowed) {
      const reasons = [
        ...blockedViolations.map(v => v.reason),
        ...policy.criticalViolations,
      ];
      const reason = reasons.join('; ');
      console.warn(
        `⚠️ [governance] ${logEntry.actionType} on ${logEntry.tableName}${logEntry.columnName ? '.' + logEntry.columnName : ''} BLOCKED: ${reason}. Manual override required.`
      );
      return { executed: false, blocked: true, reason };
    }

    // Step 3: capture before state
    const beforeState = logEntry.actionType === 'DROP_TABLE'
      ? await captureTableState(pool, logEntry.tableName)
      : logEntry.columnName
        ? await captureColumnState(pool, logEntry.tableName, logEntry.columnName)
        : null;

    // Step 4: execute DDL
    await execFn();

    // Step 5: capture after state
    const afterState = logEntry.actionType === 'DROP_TABLE'
      ? await captureTableState(pool, logEntry.tableName)
      : logEntry.columnName
        ? await captureColumnState(pool, logEntry.tableName, logEntry.columnName)
        : null;

    // Step 6: audit log (non-strict for boot paths)
    await logMutation(pool, {
      actor,
      actionType: logEntry.actionType,
      tableName: logEntry.tableName,
      columnName: logEntry.columnName,
      beforeState,
      afterState,
      overrideReason,
    });

    return { executed: true, blocked: false, reason: 'Guard allowed' };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ [governance] executeSchemaMutation failed for ${logEntry.tableName}: ${reason}`);
    return { executed: false, blocked: false, reason };
  }
}
