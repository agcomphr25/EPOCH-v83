/**
 * Migration Safety Check
 *
 * A fast, standalone SQL scanner that catches destructive DDL statements
 * BEFORE any DB-connected governance checks run.
 *
 * Controls:
 *   MIGRATION_SAFE_MODE=true  → Block ALL destructive statements and throw.
 *   MIGRATION_SAFE_MODE=false → Warn but allow (for dev/manual override scenarios).
 *
 * Detected destructive patterns:
 *   DROP COLUMN
 *   DROP TABLE
 *   ALTER TABLE ... DROP
 *   TRUNCATE
 *   DELETE FROM (without WHERE clause)
 *
 * Diff categories for logging:
 *   ✅ Adding    — CREATE TABLE, ADD COLUMN
 *   ⚠️  Modifying — ALTER COLUMN TYPE, SET DEFAULT, SET DATA TYPE
 *   ❌ Removing  — DROP TABLE, DROP COLUMN, TRUNCATE, unbounded DELETE
 */

export interface SafetyViolation {
  pattern: string;
  match: string;
  line: number;
}

export interface DiffEntry {
  symbol: '✅' | '⚠️ ' | '❌';
  label: string;
  detail: string;
  line: number;
}

export interface SafetyCheckResult {
  safe: boolean;
  violations: SafetyViolation[];
  diff: DiffEntry[];
  safeMode: boolean;
}

// -------------------------------------------------------------------------
// Destructive pattern regexes
// -------------------------------------------------------------------------
const DESTRUCTIVE_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'DROP COLUMN',  re: /ALTER\s+TABLE\s+\S+\s+DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?\S+/i },
  { name: 'DROP TABLE',   re: /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?\S+/i },
  { name: 'TRUNCATE',     re: /^\s*TRUNCATE\s+(?:TABLE\s+)?\S+/i },
  {
    name: 'DELETE without WHERE',
    // DELETE FROM table — no WHERE clause on the same line (simplistic guard)
    re: /DELETE\s+FROM\s+\S+(?:\s*;|\s*$)/i,
  },
];

// -------------------------------------------------------------------------
// Additive / modifier pattern regexes for diff logging
// -------------------------------------------------------------------------
const ADD_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'Create table',  re: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)/i },
  { label: 'Add column',    re: /ALTER\s+TABLE\s+\S+\s+ADD\s+(?:COLUMN\s+)?(\S+)/i },
  { label: 'Create index',  re: /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)/i },
];

const MODIFY_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'Alter column type',    re: /ALTER\s+TABLE\s+(\S+)\s+ALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE/i },
  { label: 'Alter column default', re: /ALTER\s+TABLE\s+(\S+)\s+ALTER\s+COLUMN\s+\S+\s+SET\s+DEFAULT/i },
  { label: 'Rename column',        re: /ALTER\s+TABLE\s+(\S+)\s+RENAME\s+COLUMN/i },
  { label: 'Rename table',         re: /ALTER\s+TABLE\s+(\S+)\s+RENAME\s+TO/i },
  { label: 'Disable row security', re: /ALTER\s+TABLE\s+(\S+)\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY/i },
  { label: 'Drop index',           re: /DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(\S+)/i },
];

// -------------------------------------------------------------------------
// Core scan
// -------------------------------------------------------------------------
function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('--') || t.startsWith('/*') || t.startsWith('*');
}

/** Extract table name from a CREATE TEMP TABLE statement. */
const TEMP_TABLE_CREATE_RE = /CREATE\s+(?:GLOBAL\s+|LOCAL\s+)?TEMP(?:ORARY)?\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)/i;
/** Extract table name from a DROP TABLE statement. */
const DROP_TABLE_NAME_RE   = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\S+)/i;

/**
 * Pre-scan: collect all table names created via CREATE TEMP TABLE in the SQL.
 * DROP TABLE on these tables is legitimate cleanup — not a destructive schema change.
 */
function collectTempTableNames(lines: string[]): Set<string> {
  const names = new Set<string>();
  for (const line of lines) {
    if (isCommentLine(line) || !line.trim()) continue;
    const m = line.match(TEMP_TABLE_CREATE_RE);
    if (m) names.add(m[1].replace(/;$/, '').toLowerCase());
  }
  return names;
}

export function scanMigrationSql(sql: string): SafetyCheckResult {
  const safeMode = (process.env.MIGRATION_SAFE_MODE ?? 'true').toLowerCase() !== 'false';

  const violations: SafetyViolation[] = [];
  const diff: DiffEntry[] = [];
  const lines = sql.split('\n');

  // Tables created as TEMP in this same migration block — dropping them is safe.
  const tempTables = collectTempTableNames(lines);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    if (isCommentLine(line)) continue;
    if (!line.trim()) continue;

    // ---- Destructive patterns ----
    for (const { name, re } of DESTRUCTIVE_PATTERNS) {
      const m = line.match(re);
      if (m) {
        // DROP TABLE on a temp table created within this same migration is
        // legitimate cleanup, not a destructive schema change — skip it.
        if (name === 'DROP TABLE') {
          const dropMatch = line.match(DROP_TABLE_NAME_RE);
          const droppedName = dropMatch ? dropMatch[1].replace(/;$/, '').toLowerCase() : '';
          if (droppedName && tempTables.has(droppedName)) {
            // Emit as an informational ❌ diff entry but do NOT add a violation.
            diff.push({
              symbol: '❌',
              label: 'Drop temp table (safe — created in same migration)',
              detail: m[0].trim().slice(0, 100),
              line: lineNo,
            });
            break;
          }
        }

        violations.push({ pattern: name, match: m[0].trim(), line: lineNo });
        diff.push({
          symbol: '❌',
          label: name,
          detail: m[0].trim().slice(0, 100),
          line: lineNo,
        });
        break;
      }
    }

    // ---- Additive patterns ----
    for (const { label, re } of ADD_PATTERNS) {
      const m = line.match(re);
      if (m) {
        diff.push({
          symbol: '✅',
          label,
          detail: line.trim().slice(0, 100),
          line: lineNo,
        });
        break;
      }
    }

    // ---- Modifier patterns ----
    for (const { label, re } of MODIFY_PATTERNS) {
      const m = line.match(re);
      if (m) {
        diff.push({
          symbol: '⚠️ ',
          label,
          detail: line.trim().slice(0, 100),
          line: lineNo,
        });
        break;
      }
    }
  }

  return { safe: violations.length === 0, violations, diff, safeMode };
}

// -------------------------------------------------------------------------
// Public entry-point — logs the diff and throws or warns based on safe mode
// -------------------------------------------------------------------------
export function runMigrationSafetyCheck(sql: string, label = 'migration'): void {
  const result = scanMigrationSql(sql);

  const addCount    = result.diff.filter(d => d.symbol === '✅').length;
  const modCount    = result.diff.filter(d => d.symbol === '⚠️ ').length;
  const removeCount = result.diff.filter(d => d.symbol === '❌').length;

  console.log(`\n📋 SCHEMA DIFF (${label}):`);

  if (result.diff.length === 0) {
    console.log('   (no schema-level statements detected)');
  } else {
    for (const entry of result.diff) {
      console.log(`   ${entry.symbol} [L${entry.line}] ${entry.label}: ${entry.detail}`);
    }
    console.log('');
    console.log(`   Summary: ✅ ${addCount} adding  ⚠️  ${modCount} modifying  ❌ ${removeCount} removing`);
  }

  if (result.violations.length === 0) {
    console.log('✅ Migration safety check passed — no destructive statements detected');
    return;
  }

  // ----- Destructive statements found -----
  const banner = [
    '',
    '🚨 MIGRATION BLOCKED — DESTRUCTIVE CHANGE DETECTED',
    '',
    'The following operations are not allowed:',
    ...result.violations.map(v => `  - [L${v.line}] ${v.pattern}: ${v.match}`),
    '',
    'Resolution required:',
    '  - Rename column to *_deprecated instead of dropping',
    '  - Create a forward migration that preserves existing data',
    '  - If the table is empty and drop is safe, explicitly set MIGRATION_SAFE_MODE=false',
    '',
  ].join('\n');

  if (result.safeMode) {
    console.error(banner);
    throw new Error(
      `Migration safety check failed: ${result.violations.length} destructive operation(s) blocked. ` +
      `Set MIGRATION_SAFE_MODE=false to override (not recommended for production).`
    );
  } else {
    console.warn(banner);
    console.warn(
      `⚠️  MIGRATION_SAFE_MODE=false — proceeding despite ${result.violations.length} destructive operation(s). ` +
      `This will be logged. Ensure this is intentional.`
    );
  }
}
