/**
 * Governance Runner (standalone CLI entry point)
 *
 * Run: npx tsx server/governance/runGovernance.ts
 *
 * Outputs a full JSON governance report:
 * - Schema drift
 * - Raw SQL violations
 * - Migration guard evaluation against migrations/*.sql
 * - Policy evaluation summary
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { detectSchemaDrift } from './schemaDrift';
import { checkMigration } from './migrationGuard';
import { evaluate } from './schemaPolicy';
import { scanRawSql } from './rawSqlScanner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  console.error('🔍 Running Schema Governance Report...\n');

  const driftRecords = await detectSchemaDrift(pool);

  const serverDir = path.resolve(__dirname, '..');
  const rawViolations = scanRawSql(serverDir);

  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const migrationFiles = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
    : [];

  let combinedMigrationSql = '';
  for (const file of migrationFiles) {
    combinedMigrationSql += fs.readFileSync(path.join(migrationsDir, file), 'utf-8') + '\n';
  }

  const migrationGuardResult = combinedMigrationSql
    ? await checkMigration(combinedMigrationSql, pool, false)
    : { allowed: true, violations: [], summary: 'No migration files found.' };

  const policyDecision = evaluate(migrationGuardResult.violations, driftRecords, false);

  const criticalDrift = driftRecords.filter((d) => d.severity === 'CRITICAL');
  const warningDrift = driftRecords.filter((d) => d.severity === 'WARNING');

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      driftCritical: criticalDrift.length,
      driftWarning: warningDrift.length,
      rawSqlViolations: rawViolations.length,
      migrationGuardViolations: migrationGuardResult.violations.length,
      migrationGuardBlocked: migrationGuardResult.violations.filter((v) => v.blocked).length,
      policyAllowed: policyDecision.allowed,
      criticalPolicyViolations: policyDecision.criticalViolations.length,
    },
    drift: driftRecords,
    rawSqlViolations: rawViolations,
    migrationGuard: migrationGuardResult,
    policyDecision,
  };

  console.log(JSON.stringify(report, null, 2));

  const hasCritical = criticalDrift.length > 0 || policyDecision.criticalViolations.length > 0;
  if (hasCritical) {
    console.error('\n❌ CRITICAL governance violations found — review report above.');
    process.exit(1);
  }

  console.error('\n✅ No critical governance violations found.');
  await pool.end();
}

main().catch((err) => {
  console.error('❌ Governance runner failed:', err.message);
  process.exit(1);
});
