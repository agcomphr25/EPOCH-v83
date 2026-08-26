#!/usr/bin/env node
/**
 * sync-safe-migrations.js
 *
 * Reads all *.sql files from migrations/ and ensures every one of them
 * is present in the safeFiles array inside server/index.ts.
 *
 * Usage:
 *   node scripts/sync-safe-migrations.js          # mutate mode: adds missing entries
 *   node scripts/sync-safe-migrations.js --check  # CI mode: exits non-zero if drift detected
 *
 * Safe to run repeatedly — it only appends entries that are missing and
 * rebuilds the list in sorted order.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const SERVER_INDEX = path.join(
  ROOT,
  'server',
  'scripts',
  'migrations',
  'runSafeBootMigrations.ts'
);

const CHECK_MODE = process.argv.includes('--check');

// ── 1. Collect migration filenames from disk ──────────────────────────────
const diskFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (diskFiles.length === 0) {
  console.log('No *.sql files found in migrations/ — nothing to do.');
  process.exit(0);
}

// ── 2. Read server/index.ts ───────────────────────────────────────────────
const src = fs.readFileSync(SERVER_INDEX, 'utf-8');

// ── 3. Locate the safeFiles array in the source ───────────────────────────
const ARRAY_START = /export const safeMigrationFiles\s*=\s*\[/;
const startMatch = ARRAY_START.exec(src);
if (!startMatch) {
  console.error(
    'ERROR: Could not find "const safeFiles = [" in server/index.ts'
  );
  process.exit(1);
}

const arrayOpenIdx = startMatch.index + startMatch[0].length;

// Find the matching closing bracket
let depth = 1;
let i = arrayOpenIdx;
while (i < src.length && depth > 0) {
  if (src[i] === '[') depth++;
  else if (src[i] === ']') depth--;
  i++;
}
const arrayCloseIdx = i - 1; // points at the ']'

const arrayBody = src.slice(arrayOpenIdx, arrayCloseIdx);

// ── 4. Parse existing entries ─────────────────────────────────────────────
const entryRegex = /'([^']+\.sql)'/g;
const existingSet = new Set();
let m;
while ((m = entryRegex.exec(arrayBody)) !== null) {
  existingSet.add(m[1]);
}

// ── 5. Determine what's missing ───────────────────────────────────────────
//
// Some migration files are intentionally excluded from safeMigrationFiles
// because they are one-off data repairs whose fail-closed guards would block
// boot once the repair has been applied or the target row state has changed.
// List them here so the sync script never re-adds them automatically.
const INTENTIONALLY_EXCLUDED = new Set([
  // One-off controlled validation-package correction. It is certified by the
  // dedicated migration-0253 workflow and must not replay during safe boot.
  '0253_void_duplicate_epoch_validation_packages.sql',
  // One-off row-level data repair for PO-P18380-46-1.  Its fail-closed guard
  // raises an exception when the target production_orders row is not in the
  // exact legacy mismatch state it was authored against (CANCELLED / Shipping QC),
  // which blocks boot after the order state changes.  Idempotency key:
  // migration.0267_reconcile_p18380_persisted_shipment
  '0267_reconcile_p18380_persisted_shipment.sql',
  // Historical row-level corrections. These are applied once by the tracked
  // migration runner and must never replay on application boot.
  '0257_restore_shipping_qc_after_0171_replay.sql',
  '0281_contain_shipped_p1_auto_populate_regression.sql',
  '0301_repair_0171_manufacturing_bypass.sql',
]);

const missing = diskFiles.filter(
  (f) => !existingSet.has(f) && !INTENTIONALLY_EXCLUDED.has(f)
);

if (missing.length === 0) {
  console.log(
    `✅ safeFiles is already up-to-date (${existingSet.size} entries).`
  );
  process.exit(0);
}

// ── 6. Check mode: report drift and exit non-zero ─────────────────────────
if (CHECK_MODE) {
  console.error(
    `❌ safeFiles is OUT OF SYNC — ${missing.length} migration(s) on disk are not listed:`
  );
  missing.forEach((f) => console.error(`   missing: ${f}`));
  console.error('Run: node scripts/sync-safe-migrations.js   to fix this.');
  process.exit(1);
}

// ── 7. Mutate mode: add missing entries ───────────────────────────────────
console.log(
  `Adding ${missing.length} missing migration(s) to safeMigrationFiles:`
);
missing.forEach((f) => console.log(`  + ${f}`));

const allEntries = Array.from(existingSet).concat(missing).sort();

const indent = '  '; // 2 spaces to match existing indentation in runSafeBootMigrations.ts
const newBody =
  '\n' + allEntries.map((f) => `${indent}'${f}',`).join('\n') + '\n';

const newSrc = src.slice(0, arrayOpenIdx) + newBody + src.slice(arrayCloseIdx);

fs.writeFileSync(SERVER_INDEX, newSrc, 'utf-8');
console.log(
  `✅ runSafeBootMigrations.ts updated — safeMigrationFiles now has ${allEntries.length} entries.`
);
