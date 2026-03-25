/**
 * Destructive Migration Guard
 *
 * Parses a SQL string for DROP COLUMN, DROP TABLE, and type-changing
 * ALTER COLUMN … TYPE patterns. Returns a structured allow/block decision.
 *
 * Type-shrink checks are source-type-aware when a Pool is available:
 * it queries the live column type before determining whether a cast is
 * actually shrinking or expanding data.
 */

import { Pool } from 'pg';

export type ViolationType = 'DROP_COLUMN' | 'DROP_TABLE' | 'TYPE_CHANGE';

export interface GuardViolation {
  type: ViolationType;
  table: string;
  column?: string;
  rowCount: number;
  sql: string;
  blocked: boolean;
  reason: string;
  isShrink?: boolean;
}

export interface GuardResult {
  allowed: boolean;
  violations: GuardViolation[];
  summary: string;
}

const DROP_COLUMN_RE = /ALTER\s+TABLE\s+["']?(\w+)["']?\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?["']?(\w+)["']?/gi;
const DROP_TABLE_RE  = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["']?(\w+)["']?/gi;
const TYPE_ALTER_RE  = /ALTER\s+TABLE\s+["']?(\w+)["']?\s+ALTER\s+COLUMN\s+["']?(\w+)["']?\s+(?:SET\s+DATA\s+)?TYPE\s+([\w\s\(\)]+?)(?:USING|;|$)/gi;

/**
 * Pairs where casting FROM → TO represents a potential data loss shrink.
 * Key = canonical FROM type, Value = set of canonical TO types that shrink it.
 */
const SHRINK_MAP = new Map<string, Set<string>>([
  ['text',    new Set(['varchar', 'char', 'integer', 'bigint', 'smallint', 'boolean', 'real', 'numeric'])],
  ['varchar', new Set(['char', 'integer', 'bigint', 'smallint', 'boolean'])],
  ['jsonb',   new Set(['text', 'varchar', 'integer', 'real'])],
  ['json',    new Set(['text', 'varchar', 'integer', 'real'])],
  ['bigint',  new Set(['integer', 'smallint'])],
  ['integer', new Set(['smallint', 'boolean'])],
  ['real',    new Set(['integer', 'smallint'])],
  ['numeric', new Set(['integer', 'smallint', 'real'])],
  ['uuid',    new Set(['text', 'varchar', 'integer'])],
]);

function normalizePgType(t: string): string {
  const lower = t.trim().toLowerCase().replace(/\(\d+(?:,\s*\d+)?\)/, '').trim();
  if (lower.startsWith('character varying') || lower === 'varchar' || lower === 'char') return 'varchar';
  if (lower === 'text') return 'text';
  if (lower === 'bigint' || lower === 'int8') return 'bigint';
  if (lower === 'integer' || lower === 'int4' || lower === 'int' || lower === 'serial') return 'integer';
  if (lower === 'smallint' || lower === 'int2' || lower === 'smallserial') return 'smallint';
  if (lower === 'boolean' || lower === 'bool') return 'boolean';
  if (lower.startsWith('timestamp')) return 'timestamp';
  if (lower === 'json') return 'json';
  if (lower === 'jsonb') return 'jsonb';
  if (lower === 'uuid') return 'uuid';
  if (lower.startsWith('numeric') || lower.startsWith('decimal')) return 'numeric';
  if (lower === 'real' || lower === 'float4' || lower === 'double precision' || lower === 'float8') return 'real';
  return lower;
}

function isTypeShrink(fromType: string, toType: string): boolean {
  const from = normalizePgType(fromType);
  const to   = normalizePgType(toType);
  if (from === to) return false;
  return SHRINK_MAP.get(from)?.has(to) ?? false;
}

/** Returns whether the target type is an expansion from any common source (unknown shrink direction). */
function isUncertainTypeChange(toType: string): boolean {
  const to = normalizePgType(toType);
  for (const [, shrinkTargets] of SHRINK_MAP) {
    if (shrinkTargets.has(to)) return true;
  }
  return false;
}

async function getTableRowCount(pool: Pool, table: string): Promise<number> {
  try {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM "${table}"`
    );
    return parseInt(rows[0]?.count ?? '0', 10);
  } catch {
    return 0;
  }
}

async function getLiveColumnType(pool: Pool, table: string, column: string): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [table, column]
    );
    return rows[0]?.data_type ?? null;
  } catch {
    return null;
  }
}

export async function checkMigration(
  sql: string,
  pool: Pool,
  override = false
): Promise<GuardResult> {
  const violations: GuardViolation[] = [];

  let match: RegExpExecArray | null;

  DROP_COLUMN_RE.lastIndex = 0;
  while ((match = DROP_COLUMN_RE.exec(sql)) !== null) {
    const table  = match[1];
    const column = match[2];
    const rowCount = await getTableRowCount(pool, table);
    const blocked  = rowCount > 0 && !override;
    violations.push({
      type: 'DROP_COLUMN',
      table,
      column,
      rowCount,
      sql: match[0],
      blocked,
      reason: rowCount > 0
        ? `Table "${table}" has ${rowCount} rows — dropping column "${column}" would cause data loss`
        : `Safe to drop (table is empty)`,
    });
  }

  DROP_TABLE_RE.lastIndex = 0;
  while ((match = DROP_TABLE_RE.exec(sql)) !== null) {
    const table    = match[1];
    const rowCount = await getTableRowCount(pool, table);
    const blocked  = rowCount > 0 && !override;
    violations.push({
      type: 'DROP_TABLE',
      table,
      rowCount,
      sql: match[0],
      blocked,
      reason: rowCount > 0
        ? `Table "${table}" has ${rowCount} rows — dropping it would cause data loss`
        : `Safe to drop (table is empty)`,
    });
  }

  TYPE_ALTER_RE.lastIndex = 0;
  while ((match = TYPE_ALTER_RE.exec(sql)) !== null) {
    const table     = match[1];
    const column    = match[2];
    const targetRaw = match[3].trim();

    // Fetch live source type to determine direction
    const liveType  = await getLiveColumnType(pool, table, column);
    const rowCount  = await getTableRowCount(pool, table);

    let isShrink   = false;
    let uncertain  = false;
    let reason     = '';

    if (liveType) {
      isShrink = isTypeShrink(liveType, targetRaw);
      if (isShrink) {
        reason = `Shrinking type of "${table}.${column}" from "${liveType}" to "${targetRaw}" with ${rowCount} rows risks data truncation or loss`;
      } else {
        reason = `Type change "${table}.${column}" from "${liveType}" to "${targetRaw}" appears safe (expanding or neutral)`;
      }
    } else {
      uncertain = isUncertainTypeChange(targetRaw);
      reason = uncertain
        ? `Cannot verify source type for "${table}.${column}" — target "${targetRaw}" is a potential shrink target; flagged as warning`
        : `Type change target "${targetRaw}" on "${table}.${column}" (source type unknown, likely safe)`;
    }

    const blocked = isShrink && rowCount > 0 && !override;
    if (isShrink || uncertain) {
      violations.push({
        type: 'TYPE_CHANGE',
        table,
        column,
        rowCount,
        sql: match[0],
        blocked,
        reason,
        isShrink,
      });
    }
  }

  const blockedViolations = violations.filter(v => v.blocked);
  const allowed = blockedViolations.length === 0;

  let summary: string;
  if (violations.length === 0) {
    summary = 'No destructive operations detected.';
  } else if (allowed) {
    summary = `${violations.length} destructive operation(s) found but all are safe (override applied, tables empty, or safe type expansion).`;
  } else {
    summary = `BLOCKED: ${blockedViolations.length} destructive operation(s) would cause data loss. Provide an override with a reason to proceed.`;
  }

  return { allowed, violations, summary };
}
