/**
 * Pre-deploy migration runner.
 *
 * This script runs BEFORE drizzle-kit push during deployment.
 *
 * ORDER OF OPERATIONS (fail-safe):
 *  1. Run Schema Governance checks (drift + migration guard) BEFORE applying anything.
 *     If CRITICAL violations are found → exit(1), block deploy.
 *  2. Apply safe idempotent migrations.
 *  3. Final verification of integer→uuid mismatches.
 *
 * Run: npx tsx server/pre-deploy-migrate.ts
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { detectSchemaDrift, DriftRecord } from './governance/schemaDrift';
import { checkMigration, GuardViolation } from './governance/migrationGuard';
import { evaluate } from './governance/schemaPolicy';
import { logMutation, logMigrationBatch } from './governance/mutationLogger';
import { runMigrationSafetyCheck } from './utils/migrationSafetyCheck';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set — cannot run pre-deploy migrations');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

/**
 * Execute a SQL statement and return whether it actually succeeded.
 * Used for idempotent migrations where a failure is non-fatal but must NOT be counted as applied.
 */
async function runSql(sql: string, label: string): Promise<boolean> {
  try {
    await pool.query(sql);
    console.log(`✅ ${label}`);
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️  ${label} — skipped: ${message}`);
    return false;
  }
}

/**
 * Compute the set of migration SQL files that have NOT yet been applied to the DB.
 *
 * Strategy: compare the explicit migration file list against the hashes already
 * recorded in drizzle.__drizzle_migrations. A migration is "pending" if its
 * filename-derived hash is not present in that table OR the table doesn't exist yet.
 */
async function getPendingMigrationFiles(migrationsDir: string, knownFiles: string[]): Promise<string[]> {
  let appliedHashes: Set<string> = new Set();
  try {
    const result = await pool.query(`SELECT hash FROM drizzle.__drizzle_migrations`);
    appliedHashes = new Set(result.rows.map((r: { hash: string }) => r.hash));
  } catch {
    // Table doesn't exist yet — all migrations are pending
  }

  const pending: string[] = [];
  for (const file of knownFiles) {
    const filePath = path.join(migrationsDir, file);
    if (!fs.existsSync(filePath)) continue;
    // Use the bare filename (without .sql) as the hash key — matches drizzle-kit convention
    const hashKey = file.replace(/\.sql$/, '');
    if (!appliedHashes.has(hashKey)) {
      pending.push(file);
    }
  }
  return pending;
}

/**
 * Run governance checks BEFORE applying any migrations.
 * Evaluates ONLY pending (not yet applied) migration files.
 * This function is FAIL-CLOSED — any internal error causes exit(1).
 */
async function runGovernanceGate(migrationsDir: string, migrationFiles: string[]): Promise<void> {
  console.log('\n🛡️  Running Schema Governance gate (pre-migration)...');

  let driftRecords: DriftRecord[];
  try {
    driftRecords = await detectSchemaDrift(pool);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Schema drift detector failed — blocking deploy to ensure safety');
    console.error('   Error:', message);
    await pool.end();
    process.exit(1);
  }

  // CRITICAL drift = MISSING_IN_SCHEMA on critical tables (data removed without migration)
  //                  or TYPE_MISMATCH on critical tables (potential data corruption).
  // WARNING drift = MISSING_IN_DB (normal forward-migration target — pending SQL will fix it)
  //                 or TYPE_MISMATCH on non-critical tables.
  // Only CRITICAL drift blocks deployment.
  const criticalDrift = driftRecords.filter(d => d.severity === 'CRITICAL');
  const warningDrift = driftRecords.filter(d => d.severity === 'WARNING');
  console.log(`   Schema drift: ${criticalDrift.length} CRITICAL (blockers), ${warningDrift.length} WARNING (informational)`);

  if (criticalDrift.length > 0) {
    console.error('\n❌ CRITICAL schema drift detected — these indicate data loss risk, not forward migrations:');
    for (const d of criticalDrift) {
      console.error(`   [${d.status}] ${d.table}.${d.column} — ${d.suggestion ?? ''}`);
    }
  } else if (warningDrift.length > 0) {
    console.log(`   ℹ️  ${warningDrift.length} WARNING drift items (MISSING_IN_DB expected for pending migrations, not blockers)`);
  }

  // Only evaluate PENDING migrations — not historical ones already applied
  let pendingFiles: string[];
  try {
    pendingFiles = await getPendingMigrationFiles(migrationsDir, migrationFiles);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Pending migration check failed — blocking deploy to ensure safety');
    console.error('   Error:', message);
    await pool.end();
    process.exit(1);
  }

  console.log(`   Pending migrations: ${pendingFiles.length} of ${migrationFiles.length} total`);
  if (pendingFiles.length > 0) {
    console.log(`   Files to guard: ${pendingFiles.join(', ')}`);
  }

  let combinedSql = '';
  for (const f of pendingFiles) {
    combinedSql += fs.readFileSync(path.join(migrationsDir, f), 'utf-8') + '\n';
  }

  let guardViolations: GuardViolation[] = [];
  if (combinedSql) {
    let guardResult;
    try {
      guardResult = await checkMigration(combinedSql, pool, false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('❌ Migration guard failed — blocking deploy to ensure safety');
      console.error('   Error:', message);
      await pool.end();
      process.exit(1);
    }
    guardViolations = guardResult.violations;
    const blocked = guardResult.violations.filter(v => v.blocked);
    console.log(`   Migration guard: ${guardResult.violations.length} violations, ${blocked.length} blocked`);
    if (blocked.length > 0) {
      console.error('\n❌ Blocked destructive migration operations in PENDING migrations:');
      for (const v of blocked) {
        console.error(`   [${v.type}] ${v.table}${v.column ? '.' + v.column : ''} — ${v.reason}`);
      }
    }
  } else {
    console.log('   Migration guard: no pending migrations to evaluate');
  }

  const policyDecision = evaluate(guardViolations, driftRecords, false);

  if (!policyDecision.allowed || criticalDrift.length > 0) {
    console.error('\n❌ BLOCKING REPORT — Schema Governance violations prevent deployment:');
    console.error(JSON.stringify({
      criticalDrift: criticalDrift.length,
      criticalDriftItems: criticalDrift.map(d => `${d.table}.${d.column} [${d.status}]`),
      policyViolations: policyDecision.criticalViolations,
      explanation: policyDecision.explanation,
    }, null, 2));
    console.error('\nResolve all violations before deploying.');
    await pool.end();
    process.exit(1);
  }

  console.log('✅ Schema Governance gate passed — safe to apply migrations');
}

async function main() {
  console.log('🔧 Pre-deploy migration runner starting...');
  console.log(`   DATABASE_URL host: ${DATABASE_URL!.replace(/:[^:@]*@/, ':***@')}`);

  const migrationsDir = path.resolve(__dirname, '../migrations');

  // Dynamically discover ALL *.sql files in migrations/ directory, sorted lexicographically
  // (numeric prefixes like 0000_, 0001_, etc. ensure correct order).
  // This ensures new migration files are automatically included in governance checks.
  const migrationFiles: string[] = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort()
    : [];

  if (migrationFiles.length === 0) {
    console.warn('⚠️  No migration SQL files found in migrations/');
  } else {
    console.log(`   Found ${migrationFiles.length} migration file(s): ${migrationFiles.join(', ')}`);
  }

  // ------------------------------------------------------------------
  // STEP 1a: Fast standalone migration safety check (no DB required)
  //          Scans all migration SQL for destructive statements and
  //          logs a human-readable schema diff before any DB contact.
  //          MIGRATION_SAFE_MODE=true (default) → throws on violations.
  //          MIGRATION_SAFE_MODE=false           → warns and continues.
  // ------------------------------------------------------------------
  if (migrationFiles.length > 0) {
    const allMigrationSql = migrationFiles
      .map(f => {
        const filePath = path.join(migrationsDir, f);
        return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
      })
      .join('\n');

    try {
      runMigrationSafetyCheck(allMigrationSql, migrationFiles.join(', '));
    } catch (safetyErr: unknown) {
      const message = safetyErr instanceof Error ? safetyErr.message : String(safetyErr);
      console.error(`\n❌ Pre-deploy blocked by migration safety check: ${message}`);
      await pool.end();
      process.exit(1);
    }
  }

  // ------------------------------------------------------------------
  // STEP 1b: Run governance gate BEFORE any migrations (pending only)
  // ------------------------------------------------------------------
  await runGovernanceGate(migrationsDir, migrationFiles);

  // ------------------------------------------------------------------
  // STEP 2: Ensure the drizzle migration tracking schema/table exist
  // ------------------------------------------------------------------
  await runSql(`CREATE SCHEMA IF NOT EXISTS drizzle`, 'Ensure drizzle schema');
  await runSql(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `, 'Ensure __drizzle_migrations table');

  // ------------------------------------------------------------------
  // STEP 3: Apply all discovered migration SQL files in sorted order
  // ------------------------------------------------------------------

  const appliedFiles: string[] = [];
  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    const succeeded = await runSql(sql, `Migration: ${file}`);
    // Only record migrations that actually executed successfully
    if (succeeded) {
      appliedFiles.push(file);
    }
  }

  // Log each applied migration to the schema_change_log audit table
  if (appliedFiles.length > 0) {
    await logMigrationBatch(pool, 'pre-deploy-migrate', appliedFiles);
    console.log(`✅ Logged ${appliedFiles.length} migration(s) to schema_change_log`);
  }

  // ------------------------------------------------------------------
  // STEP 3b: Idempotent table guards — ensure tables exist that may
  //          have been missed by formal migrations.
  // ------------------------------------------------------------------
  await runSql(`
    CREATE TABLE IF NOT EXISTS rail_demands (
      id SERIAL PRIMARY KEY,
      order_id TEXT NOT NULL,
      rail_sku TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `, 'Ensure rail_demands table');
  await runSql(`
    CREATE UNIQUE INDEX IF NOT EXISTS rail_demands_order_rail_unique
    ON rail_demands (order_id, rail_sku)
  `, 'Ensure rail_demands unique index');

  // ------------------------------------------------------------------
  // STEP 4: Quick verification — report remaining integer→uuid mismatches
  // ------------------------------------------------------------------
  try {
    const result = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type = 'integer'
        AND column_name IN (
          'product_category_id','fabric_inventory_id','session_id',
          'component_id','production_line_id','material_id',
          'packet_bom_id','bom_id','reference_bom_id','revision_id',
          'session_lot_id','rts_inventory_id',
          'serialized_item_id','material_lot_id','certificate_id',
          'lot_number_id','packing_slip_id','source_quote_id',
          'canonical_id','bom_item_id','invoice_id'
        )
        AND table_name NOT IN (
          'customer_satisfaction_responses','customer_satisfaction_surveys',
          'notification_triggers','orders','order_drafts','credit_card_transactions'
        )
      ORDER BY table_name, column_name
    `);

    if (result.rows.length === 0) {
      console.log('✅ Verification: no integer→uuid mismatches remain');
    } else {
      console.warn('⚠️  Remaining mismatches after pre-deploy migrations:');
      result.rows.forEach((r) => {
        console.warn(`   ${r.table_name}.${r.column_name} is ${r.data_type}`);
      });
    }
  } catch (verifyErr: unknown) {
    const message = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
    console.warn('⚠️  Verification query skipped:', message);
  }

  await pool.end();
  console.log('✅ Pre-deploy migrations complete');
}

main().catch(err => {
  console.error('❌ Pre-deploy migration failed:', err.message);
  process.exit(1);
});
