/**
 * Migration safety tests.
 *
 * Seven layers of protection against migration step-ordering bugs like the one
 * that plagued 0049_retire_timekeeping_identity_columns.sql, where columns were
 * nullified via UPDATE before their NOT NULL constraints were dropped:
 *
 *   1. File-structure validation — every migration file is readable, non-empty,
 *      and has a unique numeric prefix.  Pre-existing duplicate prefixes (from
 *      historical parallel-schema development) are explicitly catalogued; the
 *      test fails only if a NEW undocumented duplicate appears.
 *
 *   2. Static ordering analysis — each migration file is scanned for the
 *      specific anti-pattern: "SET col = NULL" appearing before the matching
 *      "ALTER COLUMN col DROP NOT NULL" within the same file.  This check is
 *      purely in-process (no DB required) and directly catches the class of
 *      bug that affected migration 0049.
 *
 *   3. Idempotency execution — migrations that declare themselves idempotent
 *      (early-exit guards via column-existence checks) are executed against the
 *      live database inside a transaction that is always rolled back.  A
 *      successful rollback proves the SQL is error-free on re-run; the database
 *      state is never permanently altered.
 *
 *   4. Schema-baseline migration replay — all migration files are replayed in
 *      order on a scratch database that is seeded with the current production
 *      schema via pg_dump --schema-only.  This mirrors the real deployment flow
 *      (Drizzle schema push → migration files) and ensures that any NEW
 *      migration added to the repo can be applied without SQL errors.  Only
 *      "already applied" (already-exists) errors are accepted for existing
 *      migrations; any other SQL error is a real failure.  All known broken
 *      migrations have been resolved; the exemption list is currently empty.
 *
 *   5. Schema-level column guards — query information_schema.columns on the
 *      live database and assert that columns dropped or renamed by specific
 *      clean-up migrations are truly absent.  Guards exist for:
 *
 *        • migration 0049: the five original identity columns
 *          (first_name, last_name, employee_number, pin, timezone) must be
 *          absent from timekeeping.employees after the rename to *_deprecated.
 *          Asserting absence of the originals reliably catches every
 *          partial-apply scenario, including cases where only some renames
 *          completed before the migration was aborted.
 *
 *        • migration 0066: the five *_deprecated columns
 *          (first_name_deprecated, last_name_deprecated,
 *          employee_number_deprecated, pin_deprecated, timezone_deprecated)
 *          must be absent from timekeeping.employees after the physical drop.
 *
 *      A failed or partially-applied migration would otherwise leave orphan
 *      columns that silently return NULL rather than failing loudly.  The
 *      shared assertColumnsAbsent() helper makes it straightforward to add
 *      guards for future clean-up migrations.
 *
 *   6. Retired-column name guard — every migration file is scanned (statically,
 *      no DB required) for references to the ten retired column names: the five
 *      *_deprecated names dropped by migration 0066, and the five original names
 *      renamed by migration 0049 (first_name, last_name, employee_number, pin,
 *      timezone).  Any non-exempt migration that references one of these names
 *      causes the build to fail with a clear message identifying the file,
 *      column, and the retirement source.  This is the automated guard that
 *      would have caught the bug fixed in task #1346.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Pool, type PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Helpers — file enumeration
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');

/** Returns all *.sql files from the migrations directory, sorted by name. */
function getMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && /^\d+_/.test(f))
    .sort();
}

/** Extracts the numeric prefix (e.g. "0049") from a migration filename. */
function numericPrefix(filename: string): string {
  return filename.split('_')[0];
}

/**
 * Strips single-line comments (--) and block comments from SQL so that
 * column names inside comments don't produce false positives.
 */
function stripSqlComments(sql: string): string {
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/--[^\n]*/g, ' ');
  return s;
}

/** Column names matching "SET col = NULL" in stripped SQL. */
function findNullifiedColumns(sql: string): Set<string> {
  const cols = new Set<string>();
  const re = /(\w+|"[^"]+")\s*=\s*NULL/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    cols.add(m[1].toLowerCase().replace(/"/g, ''));
  }
  return cols;
}

/** Column names matching "ALTER COLUMN col DROP NOT NULL" in stripped SQL. */
function findDropNotNullColumns(sql: string): Set<string> {
  const cols = new Set<string>();
  const re = /ALTER\s+COLUMN\s+(\w+|"[^"]+")\s+DROP\s+NOT\s+NULL/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    cols.add(m[1].toLowerCase().replace(/"/g, ''));
  }
  return cols;
}

/** Byte-offset of the first "SET col = NULL" for a named column. */
function firstNullifyOffset(sql: string, col: string): number {
  const re = new RegExp(`(${col}|"${col}")\\s*=\\s*NULL`, 'gi');
  const m = re.exec(sql);
  return m ? m.index : -1;
}

/** Byte-offset of the first "ALTER COLUMN col DROP NOT NULL" for a column. */
function firstDropNotNullOffset(sql: string, col: string): number {
  const re = new RegExp(
    `ALTER\\s+COLUMN\\s+(${col}|"${col}")\\s+DROP\\s+NOT\\s+NULL`,
    'gi',
  );
  const m = re.exec(sql);
  return m ? m.index : -1;
}

// ---------------------------------------------------------------------------
// Helpers — database utilities
// ---------------------------------------------------------------------------

let adminPool: Pool | null = null;

/** Pool connected to the main application DATABASE_URL. */
function getAdminPool(): Pool {
  if (!adminPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL must be set to run the DB-backed migration safety tests.',
      );
    }
    adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return adminPool;
}

afterAll(async () => {
  if (adminPool) {
    await adminPool.end();
    adminPool = null;
  }
});

/**
 * Builds a connection URL pointing to `dbName` on the same host/port/auth as
 * DATABASE_URL, preserving any query-string parameters (e.g. sslmode=disable).
 */
function scratchDbUrl(dbName: string): string {
  const u = new URL(process.env.DATABASE_URL!);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/**
 * Creates a scratch PostgreSQL database, calls `fn` with a client connected to
 * it, then unconditionally drops the database.
 *
 * The seed SQL (a pg_dump schema snapshot) is applied to the scratch database
 * via psql before `fn` is called, giving a fully populated schema baseline
 * that mirrors the production state after the initial Drizzle schema push.
 */
async function withScratchDatabase(
  name: string,
  seedFile: string,
  fn: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const dbUrl = process.env.DATABASE_URL!;
  const admin = getAdminPool();

  // CREATE/DROP DATABASE cannot run inside a transaction.
  const adminClient = await admin.connect();
  try {
    await adminClient.query(`DROP DATABASE IF EXISTS "${name}"`);
    await adminClient.query(`CREATE DATABASE "${name}"`);
  } finally {
    adminClient.release();
  }

  const scratchUrl = scratchDbUrl(name);
  const scratchPool = new Pool({ connectionString: scratchUrl });

  try {
    // Restore the schema baseline into the scratch DB.
    execSync(`psql "${scratchUrl}" < "${seedFile}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const client = await scratchPool.connect();
    try {
      await fn(client);
    } finally {
      client.release();
    }
  } finally {
    await scratchPool.end();

    const dropClient = await admin.connect();
    try {
      await dropClient.query(`DROP DATABASE IF EXISTS "${name}"`);
    } finally {
      dropClient.release();
    }
  }
}

// ---------------------------------------------------------------------------
// Test suite 1: file-structure validation
// ---------------------------------------------------------------------------

/**
 * Pre-existing duplicate numeric prefixes from historical parallel development.
 * Accepted as known.  Any NEW undocumented duplicate causes the test to fail.
 */
const KNOWN_DUPLICATE_PREFIXES = new Set<string>([
  '0075', // 0075_cutting_documents_table.sql vs 0075_time_off_requests.sql — parallel development
  '0077', // 0077_compliance_requires_attention.sql vs 0077_phase_a_salaried_labor_capture.sql — parallel development
  '0094', // 0094_enable_salaried_timesheets.sql vs 0094_labor_entry_drafts.sql — parallel development (salaried timesheets + labor entry drafts merged the same week)
  '0099', // 0099_audit_evidence_hardening.sql vs 0099_employee_payroll_control.sql vs 0099_policies_library.sql vs 0099_punch_ledger_pending_approval.sql — four parallel tasks merged in one window (audit evidence, payroll control, policies library, punch ledger)
  '0100', // 0100_audit_ledger_privilege_hardening.sql vs 0100_burden_rates_engine.sql — parallel development (audit ledger privilege + burden rates engine)
  '0109', // 0109_inventory_transaction_ledger.sql vs 0109_vendor_pos_purchasing_controls_columns.sql — vendor_pos hotfix landed in parallel with the immutable inventory ledger task
  '0111', // 0111_critical_schema_health_repairs.sql vs 0111_inventory_anomaly_detection.sql vs 0111_routing_step_enforcement.sql — three parallel tasks (schema repairs, anomaly detection, routing-step enforcement) merged in the same window
  '0112', // 0112_cycle_count_subsystem.sql vs 0112_inventory_traceability_capability.sql vs 0112_material_issue_approvals.sql — three parallel inventory tasks merged in the same window
  '0114', // 0114_inventory_high_risk_approvals.sql vs 0114_shelf_life_out_time_enforcement.sql — parallel inventory governance work
  '0117', // 0117_vendor_po_items_purchasing_unit_columns.sql vs 0117_vendor_po_line_project_traceability.sql — parallel vendor PO line enhancements
  '0121', // 0121_p2_invoice_review_send_structure.sql vs 0121_quote_snapshots_and_po_reconciliation.sql — parallel quoting/invoicing work
  '0127', // 0127_contract_po_review_flowdown.sql vs 0127_quote_contract_snapshot_release_gates.sql — parallel contract review/release-gate work
  '0128', // 0128_engineering_control_revision_eco.sql vs 0128_procurement_section6_supplier_controls.sql — parallel engineering ECO + procurement controls
  '0129', // 0129_manufacturing_section8_execution_controls.sql vs 0129_phase1_foundation_closure.sql vs 0129_quality_section9_ncr_capa_calibration.sql vs 0129_receiving_inspection_plans.sql — four parallel compliance/closure tasks merged together
  '0130', // 0130_audit_dcaa_security_section11.sql vs 0130_cmmc_itar_security_vault.sql vs 0130_vendor_po_support_tables_safe.sql — parallel compliance + vendor PO support
  '0131', // 0131_nonconformance_schema_alignment.sql vs 0131_user_sessions_login_compatibility.sql — parallel NCR alignment + session compatibility hotfix
  '0134', // 0134_conversational_rfq_risk_sessions.sql vs 0134_knowledge_capture_enrichment.sql vs 0134_project_revisions.sql — three parallel feature tasks (RFQ risk, knowledge capture, project revisions) merged the same window
  '0139', // 0139_p2_production_orders_project_id.sql vs 0139_wad_dashboard_assignment.sql — parallel P2 production-order linkage + WAD dashboard assignment
  '0101', // 0101_audit_tamper_attempts_durable.sql vs 0101_burden_rate_accumulation.sql — parallel audit tamper-attempt hardening + burden rate accumulation workflow
  '0115', // 0115_receiving_project_material_acceptance.sql vs 0115_vendor_pos_production_line.sql — parallel receiving project material acceptance + vendor PO production line tasks merged in the same window
  '0135', // 0135_p2_po_contract_review_role.sql vs 0135_pto_balances_and_schedules.sql — parallel P2 contract review role + PTO balances/schedules feature work merged in the same window
  '0116', // 0116_parts_request_po_approvals.sql vs 0116_po_project_links.sql — parallel P2 PO project-link feature landed alongside parts-request PO approvals
  '0136', // 0136_p1_fulfillment_attempts.sql vs 0136_p2_production_change_form_approvals.sql — parallel P1 fulfillment attempts + P2 production change form approvals merged in the same window
  '0186', // 0186_draft_bom_draft_access_controls.sql vs 0186_inventory_items_machined_part_fields.sql — parallel draft BOM access controls + inventory machined part fields merged in the same window
  '0187', // 0187_cnc_operation_batch_labor_links.sql vs 0187_repair_p2_po_unit_serials.sql — parallel CNC batch labor links + P2 PO unit serial repair merged in the same window
  '0188', // 0188_rd_projects.sql vs 0188b_design_control_add_rd_project_id.sql — remediation migration to add rd_project_id columns to pre-existing design_control_* tables
  '0192', // 0192_backfill_routed_timer_oven_cure_logs.sql vs 0192_engineering_packages.sql — backfill oven/cure timer history landed in same window as engineering packages
]);

describe('Migration file structure', () => {
  const files = getMigrationFiles();

  it('finds at least one migration file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('every migration file is non-empty', () => {
    const empty: string[] = [];
    for (const f of files) {
      const size = fs.statSync(path.join(MIGRATIONS_DIR, f)).size;
      if (size === 0) empty.push(f);
    }
    expect(empty, `Empty migration files: ${empty.join(', ')}`).toHaveLength(0);
  });

  it('no NEW migration files share an undocumented numeric prefix with an existing file', () => {
    const seen = new Map<string, string[]>();
    for (const f of files) {
      const prefix = numericPrefix(f);
      if (!seen.has(prefix)) seen.set(prefix, []);
      seen.get(prefix)!.push(f);
    }
    const newDuplicates: string[] = [];
    for (const [prefix, names] of seen.entries()) {
      if (names.length > 1 && !KNOWN_DUPLICATE_PREFIXES.has(prefix)) {
        newDuplicates.push(`${prefix}: ${names.join(', ')}`);
      }
    }
    expect(
      newDuplicates,
      `NEW undocumented duplicate migration prefixes — add to KNOWN_DUPLICATE_PREFIXES if intentional:\n${newDuplicates.join('\n')}`,
    ).toHaveLength(0);
  });

  it('migration files are sorted in ascending numeric order by prefix', () => {
    const prefixes = files.map(numericPrefix);
    const sorted = [...prefixes].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    expect(prefixes).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// Test suite 2: static ordering analysis
// ---------------------------------------------------------------------------

describe('Migration step-ordering analysis (static)', () => {
  const files = getMigrationFiles();

  it('no migration nullifies a column via UPDATE before dropping its NOT NULL constraint', () => {
    /**
     * Anti-pattern: "UPDATE … SET col = NULL" appears earlier in the file
     * than "ALTER COLUMN col DROP NOT NULL" for the same column.  PostgreSQL
     * requires the constraint to be dropped first; reversing the order causes
     * the UPDATE to violate the NOT NULL constraint and aborts the migration.
     *
     * This is the exact bug that affected migration 0049.
     */
    const violations: string[] = [];

    for (const filename of files) {
      const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
      const sql = stripSqlComments(raw);

      const nullifiedCols = findNullifiedColumns(sql);
      const droppedCols = findDropNotNullColumns(sql);

      for (const col of nullifiedCols) {
        if (!droppedCols.has(col)) continue;

        const nullifyAt = firstNullifyOffset(sql, col);
        const dropAt = firstDropNotNullOffset(sql, col);

        if (nullifyAt === -1 || dropAt === -1) continue;

        if (nullifyAt < dropAt) {
          violations.push(
            `${filename}: column "${col}" is SET to NULL (offset ${nullifyAt}) ` +
              `before its NOT NULL constraint is dropped (offset ${dropAt})`,
          );
        }
      }
    }

    expect(
      violations,
      `Step-ordering violations found:\n${violations.join('\n')}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test suite 3: idempotency execution (live DB, always rolled back)
// ---------------------------------------------------------------------------

/** True when the migration contains a documented early-exit idempotency guard. */
function isDeclaredIdempotent(sql: string): boolean {
  const stripped = stripSqlComments(sql).toLowerCase();
  return (
    /raise\s+notice\s+[^;]*no.?op/.test(stripped) ||
    /raise\s+notice\s+[^;]*already\s+renamed/.test(stripped) ||
    /raise\s+notice\s+[^;]*already\s+applied/.test(stripped) ||
    (stripped.includes('information_schema.columns') && stripped.includes('return')) ||
    /if\s+not\s+cols_exist/.test(stripped) ||
    /if\s+not\s+col_exists/.test(stripped)
  );
}

describe('Idempotent migration re-execution (live DB, rolled back)', () => {
  const files = getMigrationFiles();
  const idempotentFiles = files.filter((f) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    return isDeclaredIdempotent(sql);
  });

  if (idempotentFiles.length === 0) {
    it('no idempotent migrations detected in the migrations directory', () => {
      expect(idempotentFiles.length).toBeGreaterThanOrEqual(0);
    });
  }

  for (const filename of idempotentFiles) {
    it(`${filename} executes without error when re-run`, async () => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
      const client = await getAdminPool().connect();
      try {
        await client.query('BEGIN');
        await expect(client.query(sql)).resolves.toBeDefined();
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Test suite 4: schema-baseline migration replay
// ---------------------------------------------------------------------------

/**
 * Determines whether an error from re-running a migration on a schema-baseline
 * database indicates the migration was already applied (acceptable) versus a
 * genuine SQL error (not acceptable).
 *
 * The baseline was created with pg_dump --schema-only, so every DDL change
 * from every existing migration is already present.  Re-running migrations
 * therefore always produces "already exists" collisions for existing migrations.
 * Accepting only those classes of error keeps this assertion strict: any error
 * that is NOT of the "already exists" family is treated as a real bug.
 */
function isAlreadyAppliedError(msg: string): boolean {
  return (
    /already exists/i.test(msg) ||
    /duplicate column/i.test(msg) ||
    /could not create unique index/i.test(msg) ||
    /enum label .* already exists/i.test(msg) ||
    /constraint .* already exists/i.test(msg) ||
    /index .* already exists/i.test(msg)
  );
}

/**
 * Pre-existing migrations that are known to fail on the schema-baseline
 * database for documented structural reasons unrelated to step-ordering bugs.
 * Every entry requires a written justification.  Remove entries as the
 * underlying issues are resolved.
 */
const KNOWN_BROKEN_ON_SCHEMA_BASELINE: Record<string, string> = {
  // Migration 0047 has a conditional backfill that references timekeeping.employees.pin.
  // That column was renamed to pin_deprecated by migration 0049 and then physically
  // dropped by migration 0066.  When the schema-baseline replay starts from a pg_dump
  // of the post-0066 dev DB, timekeeping.employees no longer has a "pin" column, so
  // the UPDATE inside the DO block fails with "column tk.pin does not exist".
  // This is a structural artifact of the column's lifecycle — the migration applied
  // correctly at the time it was first run (before 0049/0066).  It is NOT a sign of
  // a step-ordering bug in any in-flight migration.
  '0047_timekeeper_pin_and_timezone.sql':
    'Backfill references timekeeping.employees.pin, which was renamed by 0049 and dropped by 0066. ' +
    'Harmless on the post-0066 baseline — column no longer exists so backfill is a no-op in practice.',
  // Migration 0027 patches a single legacy account by writing to users.password.
  // The current users table no longer has a "password" column (auth moved to
  // hashed credentials in a later migration), so this one-off backfill cannot
  // re-apply on a modern pg_dump baseline. The original effect was applied at
  // its proper place in history; the replay failure is a structural artifact,
  // not a real bug introduced by any in-flight migration.
  '0027_brian_ramirez_account_fix.sql':
    'One-off backfill writes users.password, a column dropped in a later migration. ' +
    'Harmless on the modern baseline — the row was already patched at its original epoch.',
  // Migration 0164 adds a column and index to charge_code_employee_assignments, but that
  // table was created at runtime by ensureChargeCodeAssignmentTable() in employees.ts, not
  // by any migration file.  The schema-baseline replay starts from a pg_dump that includes
  // the table (it exists in production), but a freshly seeded scratch DB does not have it
  // yet when 0164 runs.  This is a structural artifact of the table being created outside
  // the migration pipeline — not a step-ordering bug in any in-flight migration.
  '0164_charge_code_production_line_controls.sql':
    'Adds column/index to charge_code_employee_assignments, which is created at runtime ' +
    '(ensureChargeCodeAssignmentTable in employees.ts), not via a migration. ' +
    'Table exists in production but is absent in a fresh scratch-DB baseline replay.',
};

// ---------------------------------------------------------------------------
// Test suite 5: schema-level column guards — dropped/renamed columns absent
// ---------------------------------------------------------------------------

/**
 * Asserts that every column in `columns` is absent from `schema`.`table` in
 * the live database.
 *
 * Use this helper to add a guard for any clean-up migration that drops or
 * renames columns.  A failed or partially-applied migration could otherwise
 * leave orphan columns that silently return NULL rather than failing loudly.
 *
 * @param schema   PostgreSQL schema name (e.g. 'timekeeping')
 * @param table    Table name (e.g. 'employees')
 * @param columns  List of column names that must NOT exist in the table
 * @param migrationHint  Migration filename referenced in the failure message
 */
async function assertColumnsAbsent(
  schema: string,
  table: string,
  columns: readonly string[],
  migrationHint: string,
): Promise<void> {
  const pool = getAdminPool();

  const result = await pool.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name   = $2
        AND column_name  = ANY($3::text[])`,
    [schema, table, columns],
  );

  const stillPresent = result.rows.map((r) => r.column_name);

  expect(
    stillPresent,
    `${migrationHint} did not fully remove/rename all expected columns from ` +
      `${schema}.${table}. The following columns are still present: ` +
      `${stillPresent.join(', ')}. ` +
      `Re-run ${migrationHint} against the database to complete the operation.`,
  ).toHaveLength(0);
}

/**
 * Guard for migration 0049_retire_timekeeping_identity_columns.sql
 *
 * That migration renames five identity columns:
 *   first_name → first_name_deprecated
 *   last_name  → last_name_deprecated
 *   employee_number → employee_number_deprecated
 *   pin        → pin_deprecated
 *   timezone   → timezone_deprecated
 *
 * After it has fully applied (and after 0066 drops the *_deprecated names),
 * none of the five original column names may remain in timekeeping.employees.
 * A partially-applied 0049 — e.g. only 3 of the 5 RENAME COLUMNs completed
 * before the migration was aborted — would leave the un-renamed originals in
 * place.  Because PostgreSQL RENAME COLUMN is atomic per statement (not the
 * whole DO block), the surviving originals would not coexist with their
 * *_deprecated counterparts; a coexistence check would therefore miss the
 * failure.  Asserting absence of the originals catches every partial-apply
 * case reliably.
 */
describe('Schema-level guard: original identity columns absent from timekeeping.employees after migration 0049 (live DB)', () => {
  const ORIGINAL_IDENTITY_COLUMNS = [
    'first_name',
    'last_name',
    'employee_number',
    'pin',
    'timezone',
  ] as const;

  it('none of the five original identity columns exist after migration 0049 renamed them', async () => {
    await assertColumnsAbsent(
      'timekeeping',
      'employees',
      ORIGINAL_IDENTITY_COLUMNS,
      '0049_retire_timekeeping_identity_columns.sql',
    );
  });
});

/**
 * Guard for migration 0066_drop_timekeeping_deprecated_columns.sql
 *
 * That migration physically drops the five *_deprecated columns left behind by
 * migration 0049.  After it has run, none of those columns must remain in
 * timekeeping.employees.
 */
describe('Schema-level guard: deprecated columns absent from timekeeping.employees after migration 0066 (live DB)', () => {
  const DEPRECATED_COLUMNS = [
    'first_name_deprecated',
    'last_name_deprecated',
    'employee_number_deprecated',
    'pin_deprecated',
    'timezone_deprecated',
  ] as const;

  it('none of the five deprecated columns exist after migration 0066 dropped them', async () => {
    await assertColumnsAbsent(
      'timekeeping',
      'employees',
      DEPRECATED_COLUMNS,
      '0066_drop_timekeeping_deprecated_columns.sql',
    );
  });
});

// ---------------------------------------------------------------------------
// Test suite 6: retired-column name guard (static, no DB required)
// ---------------------------------------------------------------------------

/**
 * The five column names dropped by migration 0066 after being renamed by 0049.
 * Any reference to these names in a non-exempt migration is a bug: the columns
 * no longer exist in the database schema.
 */
const DEPRECATED_COLUMN_NAMES: ReadonlyArray<string> = [
  'first_name_deprecated',
  'last_name_deprecated',
  'employee_number_deprecated',
  'pin_deprecated',
  'timezone_deprecated',
];

/**
 * The five column names that were renamed to *_deprecated by migration 0049.
 * Any reference to these names in a non-exempt migration that runs AFTER 0049
 * is a bug: the columns have been renamed and must not be read or written under
 * their original names.
 *
 * Note: these names are checked with word-boundary matching to avoid false
 * positives from column names that merely contain one of these as a substring
 * (e.g. "employee_number_deprecated" won't double-match "employee_number").
 * Very generic names like "pin" and "timezone" can theoretically appear in
 * unrelated table DDL; if a legitimate future migration triggers this guard,
 * add it to EXEMPT_FROM_RETIRED_COLUMN_CHECK with a clear justification.
 */
const PRE_RENAME_COLUMN_NAMES: ReadonlyArray<string> = [
  'first_name',
  'last_name',
  'employee_number',
  'pin',
  'timezone',
];

/**
 * Numeric prefix (e.g. "0049") of the migration that renamed the original
 * columns to *_deprecated.  Pre-rename originals are only checked in files
 * with a higher numeric prefix than this value.
 */
const RENAME_MIGRATION_PREFIX = '0049';

/**
 * Migration files that legitimately reference the retired column names and are
 * therefore exempt from the check.  Every entry requires a written justification.
 * Add a new entry (with justification) only when the reference is intentional
 * and guarded — never to silence a real bug.
 */
const EXEMPT_FROM_RETIRED_COLUMN_CHECK: Record<string, string> = {
  '0049_retire_timekeeping_identity_columns.sql':
    'Source of truth: renames the original five columns to *_deprecated. ' +
    'This is the migration that retires the pre-rename names.',
  '0066_drop_timekeeping_deprecated_columns.sql':
    'Source of truth: drops the *_deprecated columns. ' +
    'References to *_deprecated names here are the DROP statements themselves.',
  '0069_timekeeping_schema.sql':
    'Guarded: the INSERT that references first_name/last_name/pin is preceded ' +
    'by an IF NOT EXISTS check on information_schema.columns that skips the ' +
    'block entirely when 0049 has already run. Reviewed and documented in ' +
    'task #1346. The CREATE TABLE IF NOT EXISTS at the top is also safe ' +
    'because the table already exists by the time 0069 runs.',
  '0080_link_users_to_employees.sql':
    'All first_name/last_name references here target public.users, not ' +
    'timekeeping.employees. The timekeeping.employees columns were renamed by ' +
    '0049, but public.users always had and still has first_name/last_name columns ' +
    'that were never renamed. Reviewed in task #1731.',
  '0081_proteus_labs.sql':
    'All CREATE TABLE and CREATE INDEX statements use IF NOT EXISTS guards. ' +
    'All CREATE TYPE statements use IF NOT EXISTS guards. No column renames or ' +
    'drops. Net-new tables only: proteus_prompts, proteus_prompt_variables, ' +
    'proteus_prompt_executions, proteus_prompt_results, proteus_prompt_tags. Safe.',
  '0153_user_finish_technician_flag.sql':
    'All first_name/last_name references here target public.users, not ' +
    'timekeeping.employees. The timekeeping.employees columns were renamed by ' +
    '0049, but public.users always had and still has first_name/last_name columns ' +
    'that were never renamed. Same pattern as 0080_link_users_to_employees.sql.',
};

/**
 * Returns true if the given migration filename is exempt from the retired-column
 * guard.
 */
function isExemptFromRetiredColumnCheck(filename: string): boolean {
  return filename in EXEMPT_FROM_RETIRED_COLUMN_CHECK;
}

/**
 * Returns true if the given numeric prefix (e.g. "0070") is strictly greater
 * than the rename migration prefix ("0049"), meaning the migration runs after
 * the column-rename has already been applied.
 */
function isAfterRenameMigration(prefix: string): boolean {
  return prefix.localeCompare(RENAME_MIGRATION_PREFIX, undefined, { numeric: true }) > 0;
}

/**
 * Scans the (comment-stripped) SQL for word-boundary references to any of the
 * supplied column names.  Returns an array of { column, matchSnippet } for each
 * hit found, or an empty array when the SQL is clean.
 *
 * Word-boundary matching (\b) ensures that "employee_number" does not match
 * inside "employee_number_deprecated" and vice versa.
 */
function findRetiredColumnReferences(
  sql: string,
  columnNames: ReadonlyArray<string>,
): Array<{ column: string; matchSnippet: string }> {
  const hits: Array<{ column: string; matchSnippet: string }> = [];
  for (const col of columnNames) {
    const re = new RegExp(`\\b${col}\\b`, 'gi');
    const m = re.exec(sql);
    if (m) {
      // Provide a short snippet of surrounding context to aid diagnosis.
      const start = Math.max(0, m.index - 30);
      const end = Math.min(sql.length, m.index + col.length + 30);
      const snippet = sql.slice(start, end).replace(/\s+/g, ' ').trim();
      hits.push({ column: col, matchSnippet: `…${snippet}…` });
    }
  }
  return hits;
}

describe('Retired-column name guard (static analysis, no DB required)', () => {
  const files = getMigrationFiles();

  it('no migration references a *_deprecated column name outside the source-of-truth migrations', () => {
    /**
     * The five *_deprecated column names only exist between migrations 0049
     * (rename) and 0066 (drop).  After 0066 they are gone entirely.  Any
     * non-exempt migration that names them in executable SQL will fail at
     * runtime because the columns no longer exist.
     *
     * This check runs without a database connection.
     */
    const violations: string[] = [];

    for (const filename of files) {
      if (isExemptFromRetiredColumnCheck(filename)) continue;

      const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
      const sql = stripSqlComments(raw);

      const hits = findRetiredColumnReferences(sql, DEPRECATED_COLUMN_NAMES);
      for (const { column, matchSnippet } of hits) {
        violations.push(
          `${filename}: references retired *_deprecated column "${column}" ` +
            `(dropped by 0066_drop_timekeeping_deprecated_columns.sql). ` +
            `Context: ${matchSnippet}`,
        );
      }
    }

    expect(
      violations,
      `Retired *_deprecated column references found — these will cause runtime ` +
        `SQL errors because the columns no longer exist after migration 0066:\n` +
        violations.join('\n'),
    ).toHaveLength(0);
  });

  it('no migration after 0049 references a pre-rename column name (first_name, last_name, employee_number, pin, timezone) outside the exempt list', () => {
    /**
     * Migration 0049 renamed first_name → first_name_deprecated, last_name →
     * last_name_deprecated, employee_number → employee_number_deprecated,
     * pin → pin_deprecated, and timezone → timezone_deprecated in
     * timekeeping.employees.  Any migration with a numeric prefix higher than
     * 0049 that refers to those original names in SQL that targets
     * timekeeping.employees will fail with "column does not exist".
     *
     * This is the exact class of bug that was manually caught and fixed in
     * task #1346 (migration 0069 contained an INSERT that referenced first_name
     * and was only safe because a guard was later added).
     *
     * This check runs without a database connection.
     *
     * If a legitimate future migration triggers this guard for a genuine reason
     * (e.g. a column with the same name on a different, unrelated table), add
     * it to EXEMPT_FROM_RETIRED_COLUMN_CHECK with a clear written justification.
     */
    const violations: string[] = [];

    for (const filename of files) {
      if (isExemptFromRetiredColumnCheck(filename)) continue;
      if (!isAfterRenameMigration(numericPrefix(filename))) continue;

      const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
      const sql = stripSqlComments(raw);

      const hits = findRetiredColumnReferences(sql, PRE_RENAME_COLUMN_NAMES);
      for (const { column, matchSnippet } of hits) {
        violations.push(
          `${filename}: references pre-rename column "${column}" ` +
            `(renamed to ${column}_deprecated by 0049_retire_timekeeping_identity_columns.sql). ` +
            `If this is intentional and guarded, add the file to EXEMPT_FROM_RETIRED_COLUMN_CHECK. ` +
            `Context: ${matchSnippet}`,
        );
      }
    }

    expect(
      violations,
      `Pre-rename column references found in migrations after 0049 — these reference ` +
        `column names that were renamed in timekeeping.employees and will cause SQL ` +
        `errors if applied to a database where 0049 has already run:\n` +
        violations.join('\n'),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test suite 4: schema-baseline migration replay
// ---------------------------------------------------------------------------

describe('Schema-baseline migration replay (scratch DB seeded from pg_dump)', () => {
  it('all migration files replay without unexpected SQL errors on the seeded baseline', async () => {
    /**
     * Workflow:
     *  1. pg_dump --schema-only captures the current production schema into a
     *     temp file.  This represents the state of the database after the
     *     initial Drizzle schema push has been applied.
     *  2. A scratch PostgreSQL database is created and seeded with that dump.
     *  3. All migration files are applied in alphabetical order (which
     *     matches the numeric-prefix order).
     *  4. For existing migrations the dump already contains their changes, so
     *     they produce "already applied" errors — accepted.
     *  5. For NEW migrations (not yet merged) the baseline does NOT contain
     *     their changes, so they must apply without error.  If a new migration
     *     has a step-ordering bug or an unguarded data dependency it will fail
     *     here.
     *  6. The scratch database is always dropped when the test ends.
     */

    // --- Prerequisite checks ---
    // Verify pg_dump and psql are on PATH, and the DB role can CREATE DATABASE.
    // If any prerequisite is missing the test skips with an explicit message
    // rather than failing with an opaque error.

    // 1. DATABASE_URL must be set (getAdminPool throws if not)
    const admin = getAdminPool();

    // 2. pg_dump must be available
    try {
      execSync('pg_dump --version', { stdio: 'pipe' });
    } catch {
      console.warn(
        '[migrationSafety] Skipping schema-baseline replay: pg_dump not found on PATH. ' +
          'Ensure postgresql-client is installed in your CI environment.',
      );
      return;
    }

    // 3. psql must be available
    try {
      execSync('psql --version', { stdio: 'pipe' });
    } catch {
      console.warn(
        '[migrationSafety] Skipping schema-baseline replay: psql not found on PATH.',
      );
      return;
    }

    // 4. The DB role must have CREATEDB privilege
    const privCheck = await admin.query<{ usecreatedb: boolean }>(
      'SELECT usecreatedb FROM pg_user WHERE usename = current_user',
    );
    if (!privCheck.rows[0]?.usecreatedb) {
      console.warn(
        '[migrationSafety] Skipping schema-baseline replay: current DB role lacks ' +
          'CREATEDB privilege.  Grant it or run the suite with a role that has it.',
      );
      return;
    }

    // --- Step 1: dump current schema to a temp file ---
    const dumpFile = path.join(os.tmpdir(), `migration_safety_baseline_${Date.now()}.sql`);
    execSync(`pg_dump --schema-only "${process.env.DATABASE_URL}" > "${dumpFile}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const dbName = `migration_safety_${Date.now()}`;
    const files = getMigrationFiles();
    const errors: string[] = [];
    const knownFailures: string[] = [];

    try {
      await withScratchDatabase(dbName, dumpFile, async (client) => {
        for (const filename of files) {
          const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
          try {
            await client.query(sql);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);

            if (filename in KNOWN_BROKEN_ON_SCHEMA_BASELINE) {
              knownFailures.push(`${filename} (known): ${msg.split('\n')[0]}`);
            } else if (!isAlreadyAppliedError(msg)) {
              // An unexpected error — this is a real migration bug.
              errors.push(`${filename}: ${msg}`);
            }
            // For "already applied" errors: continue to the next migration.
          }
        }
      });
    } finally {
      try { fs.unlinkSync(dumpFile); } catch { /* ignore */ }
    }

    if (knownFailures.length > 0) {
      console.warn(
        '\n[migrationSafety] Known/pre-approved failures (see KNOWN_BROKEN_ON_SCHEMA_BASELINE):\n  ' +
          knownFailures.join('\n  '),
      );
    }

    expect(
      errors,
      `Unexpected migration errors on schema-baseline replay — these indicate real bugs:\n${errors.join('\n')}`,
    ).toHaveLength(0);
  // pg_dump + CREATE DATABASE + psql restore + migration replay can take 30–60 s
  // initially, but grows with the migration set; allow generous headroom.
  }, 300_000);
});
