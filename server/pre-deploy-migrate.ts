/**
 * Pre-deploy migration runner.
 *
 * This script runs BEFORE drizzle-kit push during deployment.
 * It applies all known integer → uuid type conversions using safe,
 * idempotent SQL so that subsequent db:push sees no type mismatches
 * and generates NO destructive ALTER COLUMN SET DATA TYPE statements.
 *
 * Run: npx tsx server/pre-deploy-migrate.ts
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set — cannot run pre-deploy migrations');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function runSql(sql: string, label: string): Promise<void> {
  try {
    await pool.query(sql);
    console.log(`✅ ${label}`);
  } catch (err: any) {
    console.warn(`⚠️  ${label} — skipped: ${err.message}`);
  }
}

async function main() {
  console.log('🔧 Pre-deploy migration: applying safe integer→uuid conversions...');
  console.log(`   DATABASE_URL host: ${DATABASE_URL.replace(/:[^:@]*@/, ':***@')}`);

  // ------------------------------------------------------------------
  // Ensure the drizzle migration tracking schema/table exist
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
  // Run migration SQL files in order (idempotent — safe to re-run)
  // ------------------------------------------------------------------
  const migrationFiles = [
    '0001_fix_cutting_built_packets_category_uuid.sql',
    '0002_fix_fabric_sources_inventory_id_uuid.sql',
    '0003_comprehensive_integer_to_uuid_audit.sql',
  ];

  const migrationsDir = path.resolve(__dirname, '../migrations');

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Migration file not found: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf-8');
    await runSql(sql, `Migration: ${file}`);
  }

  // ------------------------------------------------------------------
  // Quick verification — report any remaining integer columns where
  // the schema expects uuid/text. If any remain, db:push will still fail.
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
    `) as any;

    const rows = Array.isArray(result) ? result : (result.rows ?? []);
    if (rows.length === 0) {
      console.log('✅ Verification: no integer→uuid mismatches remain');
    } else {
      console.warn('⚠️  Remaining mismatches after pre-deploy migrations:');
      rows.forEach((r: any) => {
        console.warn(`   ${r.table_name}.${r.column_name} is ${r.data_type}`);
      });
    }
  } catch (verifyErr: any) {
    console.warn('⚠️  Verification query skipped:', verifyErr.message);
  }

  await pool.end();
  console.log('✅ Pre-deploy migrations complete');
}

main().catch(err => {
  console.error('❌ Pre-deploy migration failed:', err.message);
  process.exit(1);
});
