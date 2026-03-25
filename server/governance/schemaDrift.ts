/**
 * Schema Drift Detector
 *
 * Compares the live database column list (from information_schema) against
 * the Drizzle schema's registered tables. Output is a typed array of drift
 * records with shape:
 *   { table, column, status, severity, rowCount, dbType?, schemaType?, suggestion? }
 *
 * Schema introspection uses drizzle's getTableColumns() so it stays in sync
 * automatically as tables are added/changed in server/schema.ts.
 */

import { Pool } from 'pg';
import { getTableColumns, getTableName, isTable } from 'drizzle-orm';
import * as schema from '../schema';

export type DriftStatus = 'MISSING_IN_SCHEMA' | 'MISSING_IN_DB' | 'TYPE_MISMATCH';
export type DriftSeverity = 'CRITICAL' | 'WARNING';

export interface DriftRecord {
  table: string;
  column: string;
  status: DriftStatus;
  severity: DriftSeverity;
  rowCount: number | null;
  dbType?: string;
  schemaType?: string;
  suggestion?: string;
}

/** Tables that are CRITICAL — drift in them is always flagged CRITICAL */
const CRITICAL_TABLES = new Set([
  'all_orders',
  'payments',
  'followup_orders',
  'schema_change_log',
  'nonconformance_records',
]);

/**
 * Build the schema's known table→column→type map directly from Drizzle metadata.
 * Returns: Map<tableName, Map<columnName, pgTypeName>>
 */
function buildSchemaMap(): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();

  for (const [, tableObj] of Object.entries(schema)) {
    if (typeof tableObj !== 'object' || tableObj === null) continue;
    if (!isTable(tableObj)) continue;

    let tableName: string;
    try {
      tableName = getTableName(tableObj as Parameters<typeof getTableName>[0]);
    } catch {
      continue;
    }

    let columns: Record<string, { columnType: string; getSQLType(): string }>;
    try {
      columns = getTableColumns(tableObj as Parameters<typeof getTableColumns>[0]) as typeof columns;
    } catch {
      continue;
    }
    if (!columns || typeof columns !== 'object') continue;

    const colMap = new Map<string, string>();
    for (const [, colDef] of Object.entries(columns)) {
      const colName = (colDef as { name: string }).name;
      if (!colName) continue;
      const sqlType = normalizePgType(colDef.getSQLType());
      colMap.set(colName, sqlType);
    }
    result.set(tableName, colMap);
  }

  return result;
}

function normalizePgType(t: string): string {
  // Strip length modifiers like varchar(255), numeric(10,2), etc.
  const lower = t.toLowerCase().trim().replace(/\(\d+(?:,\s*\d+)?\)/, '').trim();
  if (lower.startsWith('character varying') || lower === 'varchar' || lower === 'char') return 'varchar';
  if (lower === 'text') return 'varchar';
  if (lower === 'timestamp without time zone' || lower === 'timestamp with time zone') return 'timestamp';
  if (lower.startsWith('timestamp')) return 'timestamp';
  if (lower === 'double precision') return 'real';
  if (lower === 'bigint' || lower === 'int8') return 'integer';
  if (lower.startsWith('numeric') || lower.startsWith('decimal')) return 'numeric';
  if (lower === 'bool') return 'boolean';
  if (lower === 'int4' || lower === 'int') return 'integer';
  if (lower === 'serial' || lower === 'bigserial' || lower === 'smallserial') return 'integer';
  if (lower === 'json' || lower === 'jsonb') return 'jsonb';
  if (lower === 'uuid') return 'uuid';
  if (lower === 'array' || lower.endsWith('[]')) return 'array';
  return lower;
}

function classifySeverity(table: string, status: DriftStatus): DriftSeverity {
  // MISSING_IN_SCHEMA on a critical table = data at risk (column removed without migration) = CRITICAL
  // MISSING_IN_DB = expected during forward migrations; pending SQL will add it = WARNING only
  // TYPE_MISMATCH on critical tables = potential data corruption = CRITICAL
  if (status === 'MISSING_IN_SCHEMA' && CRITICAL_TABLES.has(table)) return 'CRITICAL';
  if (status === 'TYPE_MISMATCH' && CRITICAL_TABLES.has(table)) return 'CRITICAL';
  return 'WARNING';
}

function buildSuggestion(
  status: DriftStatus,
  table: string,
  column: string,
  dbType?: string,
  schemaType?: string
): string {
  if (status === 'MISSING_IN_DB') {
    return `Run: ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${schemaType ?? 'text'};`;
  }
  if (status === 'MISSING_IN_SCHEMA') {
    return `Column ${table}.${column} (${dbType}) exists in DB but not in Drizzle schema. Add to server/schema.ts or remove via migration.`;
  }
  if (status === 'TYPE_MISMATCH') {
    return `Column ${table}.${column} is "${dbType}" in DB but "${schemaType}" in schema. Align via a safe migration.`;
  }
  return '';
}

export async function detectSchemaDrift(pool: Pool): Promise<DriftRecord[]> {
  const schemaMap = buildSchemaMap();
  if (schemaMap.size === 0) {
    throw new Error('Schema map is empty — schema introspection failed');
  }

  const tableNames = Array.from(schemaMap.keys());

  const { rows: dbColumns } = await pool.query<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ANY($1)
     ORDER BY table_name, column_name`,
    [tableNames]
  );

  const rowCountCache = new Map<string, number>();

  async function getRowCount(table: string): Promise<number | null> {
    if (rowCountCache.has(table)) return rowCountCache.get(table)!;
    try {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM "${table}"`
      );
      const count = parseInt(rows[0]?.count ?? '0', 10);
      rowCountCache.set(table, count);
      return count;
    } catch {
      rowCountCache.set(table, 0);
      return 0;
    }
  }

  const dbMap = new Map<string, Map<string, string>>();
  for (const row of dbColumns) {
    if (!dbMap.has(row.table_name)) dbMap.set(row.table_name, new Map());
    dbMap.get(row.table_name)!.set(row.column_name, row.data_type);
  }

  const result: DriftRecord[] = [];

  for (const [tableName, schemaColumns] of schemaMap.entries()) {
    const dbCols = dbMap.get(tableName);

    if (!dbCols) {
      for (const [colName, schemaType] of schemaColumns.entries()) {
        const rowCount = await getRowCount(tableName);
        const status: DriftStatus = 'MISSING_IN_DB';
        result.push({
          table: tableName,
          column: colName,
          status,
          severity: classifySeverity(tableName, status),
          rowCount,
          schemaType,
          suggestion: buildSuggestion(status, tableName, colName, undefined, schemaType),
        });
      }
      continue;
    }

    for (const [colName, schemaType] of schemaColumns.entries()) {
      if (!dbCols.has(colName)) {
        const rowCount = await getRowCount(tableName);
        const status: DriftStatus = 'MISSING_IN_DB';
        result.push({
          table: tableName,
          column: colName,
          status,
          severity: classifySeverity(tableName, status),
          rowCount,
          schemaType,
          suggestion: buildSuggestion(status, tableName, colName, undefined, schemaType),
        });
        continue;
      }
      const rawDbType = dbCols.get(colName)!;
      const normalizedDb = normalizePgType(rawDbType);
      const normalizedSchema = normalizePgType(schemaType);
      if (normalizedDb !== normalizedSchema) {
        const rowCount = await getRowCount(tableName);
        const status: DriftStatus = 'TYPE_MISMATCH';
        result.push({
          table: tableName,
          column: colName,
          status,
          severity: classifySeverity(tableName, status),
          rowCount,
          dbType: rawDbType,
          schemaType,
          suggestion: buildSuggestion(status, tableName, colName, rawDbType, schemaType),
        });
      }
    }

    for (const [colName, rawDbType] of dbCols.entries()) {
      if (!schemaColumns.has(colName)) {
        const rowCount = await getRowCount(tableName);
        const status: DriftStatus = 'MISSING_IN_SCHEMA';
        result.push({
          table: tableName,
          column: colName,
          status,
          severity: classifySeverity(tableName, status),
          rowCount,
          dbType: rawDbType,
          suggestion: buildSuggestion(status, tableName, colName, rawDbType),
        });
      }
    }
  }

  return result;
}
