/**
 * Schema Mutation Logger
 *
 * Centralized helper for writing schema-changing operations to schema_change_log.
 *
 * Two variants:
 *  - logMutation()       : Non-throwing (fire-and-forget). Used by boot migrations
 *                          where logging is best-effort and should not block startup.
 *  - logMutationStrict() : Throws on DB failure. Used inside transactions where the
 *                          audit record must succeed or the whole operation rolls back.
 *
 * Both accept an optional Pool or PoolClient so callers can pass a transaction client.
 */

import { Pool, PoolClient, QueryResult } from 'pg';

export interface MutationLogEntry {
  actor: string;
  actionType:
    | 'ADD_COLUMN'
    | 'DROP_COLUMN'
    | 'DROP_TABLE'
    | 'ALTER_COLUMN'
    | 'CREATE_TABLE'
    | 'RAW_SQL'
    | 'OVERRIDE'
    | 'BOOT_MIGRATION'
    | 'PRE_DEPLOY_MIGRATION';
  tableName: string;
  columnName?: string;
  beforeState?: unknown;
  afterState?: unknown;
  approvedBy?: string;
  overrideReason?: string;
}

type Queryable = Pool | PoolClient;

async function insertMutationLog(client: Queryable, entry: MutationLogEntry): Promise<void> {
  await client.query(
    `INSERT INTO schema_change_log
       (timestamp, actor, action_type, table_name, column_name,
        before_state, after_state, approved_by, override_reason)
     VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.actor,
      entry.actionType,
      entry.tableName,
      entry.columnName ?? null,
      entry.beforeState != null ? JSON.stringify(entry.beforeState) : null,
      entry.afterState  != null ? JSON.stringify(entry.afterState)  : null,
      entry.approvedBy  ?? null,
      entry.overrideReason ?? null,
    ]
  );
}

/**
 * Fire-and-forget mutation log. Logs failures to console but does NOT throw.
 * Use for background/boot paths where logging is best-effort.
 */
export async function logMutation(pool: Queryable, entry: MutationLogEntry): Promise<void> {
  try {
    await insertMutationLog(pool, entry);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[governance/mutationLogger] Failed to log mutation:', msg);
  }
}

/**
 * Strict mutation log — throws on failure.
 * Use inside transactions where audit failure should roll back the whole operation.
 */
export async function logMutationStrict(client: Queryable, entry: MutationLogEntry): Promise<void> {
  await insertMutationLog(client, entry);
}

/**
 * Capture the current schema state of a table column from information_schema.
 * Returns a snapshot object usable as before_state or after_state.
 * Returns null if the column does not exist (e.g., after a DROP COLUMN).
 */
export async function captureColumnState(
  client: Queryable,
  tableName: string,
  columnName: string
): Promise<Record<string, string | null> | null> {
  try {
    const result: QueryResult<Record<string, string>> = await client.query(
      `SELECT column_name, data_type, udt_name, character_maximum_length,
              is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2`,
      [tableName, columnName]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0] as Record<string, string | null>;
  } catch {
    return null;
  }
}

/**
 * Capture the current schema state of an entire table (all columns).
 * Returns a list of column descriptors, or null if table does not exist.
 */
export async function captureTableState(
  client: Queryable,
  tableName: string
): Promise<Record<string, string | null>[] | null> {
  try {
    const result: QueryResult<Record<string, string>> = await client.query(
      `SELECT column_name, data_type, udt_name, character_maximum_length,
              is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    );
    if (result.rows.length === 0) return null;
    return result.rows as Record<string, string | null>[];
  } catch {
    return null;
  }
}

/**
 * Log multiple migration files applied in a pre-deploy run.
 * Non-throwing — each file logged as PRE_DEPLOY_MIGRATION.
 */
export async function logMigrationBatch(
  pool: Queryable,
  actor: string,
  files: string[],
  overrideReason?: string
): Promise<void> {
  for (const file of files) {
    await logMutation(pool, {
      actor,
      actionType: 'PRE_DEPLOY_MIGRATION',
      tableName: '(migration-file)',
      columnName: file,
      overrideReason,
    });
  }
}
