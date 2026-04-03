/**
 * Schema Evolution Helpers
 *
 * Provides safe patterns for evolving the database schema without destroying
 * existing data. The guiding principle: columns and tables are never deleted;
 * they are retired by renaming to *_deprecated so data is always recoverable.
 *
 * Usage in migration files or scripts:
 *
 *   import { markColumnDeprecated, logDeprecationWarning } from '../utils/schemaEvolution';
 *
 *   // Instead of: ALTER TABLE orders DROP COLUMN old_field
 *   // Do:
 *   markColumnDeprecated('orders', 'old_field');
 *   // Then in the migration SQL runner, use the SQL returned.
 */

export interface DeprecationRecord {
  table: string;
  originalColumn: string;
  deprecatedColumn: string;
  sql: string;
  timestamp: string;
}

/**
 * Returns the SQL to rename a column to its deprecated form.
 * Does NOT execute the SQL — the caller is responsible for running it.
 *
 * Convention: `column` → `column_deprecated`
 *
 * Example:
 *   const { sql } = markColumnDeprecated('all_orders', 'old_status');
 *   // sql = 'ALTER TABLE "all_orders" RENAME COLUMN "old_status" TO "old_status_deprecated";'
 */
export function markColumnDeprecated(
  table: string,
  column: string
): DeprecationRecord {
  const deprecatedColumn = `${column}_deprecated`;

  const sql = `ALTER TABLE "${table}" RENAME COLUMN "${column}" TO "${deprecatedColumn}";`;

  const record: DeprecationRecord = {
    table,
    originalColumn: column,
    deprecatedColumn,
    sql,
    timestamp: new Date().toISOString(),
  };

  logDeprecationWarning(record);
  return record;
}

/**
 * Logs a structured deprecation warning to stdout.
 * Called automatically by markColumnDeprecated.
 */
export function logDeprecationWarning(record: DeprecationRecord): void {
  console.warn(
    `⚠️  Column marked deprecated instead of deleted:\n` +
    `   Table:  ${record.table}\n` +
    `   Before: ${record.originalColumn}\n` +
    `   After:  ${record.deprecatedColumn}\n` +
    `   SQL:    ${record.sql}\n` +
    `   Time:   ${record.timestamp}\n` +
    `   → Add this SQL to a migration file. The column can be removed\n` +
    `     permanently once all references have been migrated and the\n` +
    `     deprecation has been in production for at least one release cycle.`
  );
}

/**
 * Returns the SQL to mark a table as deprecated by renaming it.
 * Tables are renamed to `<name>_deprecated_<YYYYMMDD>` so they are
 * instantly identifiable and sortable in pg_catalog.
 */
export function markTableDeprecated(table: string): {
  table: string;
  deprecatedTable: string;
  sql: string;
  timestamp: string;
} {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const deprecatedTable = `${table}_deprecated_${date}`;

  const sql = `ALTER TABLE "${table}" RENAME TO "${deprecatedTable}";`;
  const timestamp = new Date().toISOString();

  console.warn(
    `⚠️  Table marked deprecated instead of dropped:\n` +
    `   Before: ${table}\n` +
    `   After:  ${deprecatedTable}\n` +
    `   SQL:    ${sql}\n` +
    `   Time:   ${timestamp}\n` +
    `   → Add this SQL to a migration file and remove all references\n` +
    `     to the original table name from application code.`
  );

  return { table, deprecatedTable, sql, timestamp };
}

/**
 * Validates that a proposed column name follows deprecation conventions.
 * Returns true if the name ends with '_deprecated'.
 */
export function isDeprecatedColumnName(column: string): boolean {
  return column.endsWith('_deprecated');
}
