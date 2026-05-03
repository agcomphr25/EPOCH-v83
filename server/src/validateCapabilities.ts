import * as fs from 'fs';
import * as path from 'path';
import { REQUIRED_CAPABILITY_KEYS } from './capabilities';

/**
 * Root directories (relative to project root) that are recursively scanned
 * for TypeScript source files containing requirePermission() calls.
 * No manual file list is maintained — any .ts file under these directories
 * that calls requirePermission() is automatically included.
 */
const SCAN_ROOTS = [
  'server/src/routes',
  'modules',
];

/**
 * Regex that matches the string literal passed to requirePermission().
 * Matches both single- and double-quoted keys, e.g.:
 *   requirePermission('work_orders.release')
 *   requirePermission("time.edit_entry")
 */
const REQUIRE_PERMISSION_RE = /requirePermission\(['"]([^'"]+)['"]\)/g;

/**
 * Recursively collect all .ts files under a directory.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Scan all TypeScript source files under SCAN_ROOTS and return every unique
 * capability key that appears as a literal argument to requirePermission().
 *
 * New route files are discovered automatically — no list to maintain.
 */
function discoverCallsiteKeys(cwd: string): Set<string> {
  const discovered = new Set<string>();

  for (const relRoot of SCAN_ROOTS) {
    const absRoot = path.resolve(cwd, relRoot);
    const files = collectTsFiles(absRoot);

    for (const filePath of files) {
      const source = fs.readFileSync(filePath, 'utf-8');
      REQUIRE_PERMISSION_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = REQUIRE_PERMISSION_RE.exec(source)) !== null) {
        discovered.add(match[1]);
      }
    }
  }

  return discovered;
}

/**
 * validateCapabilityKeys
 *
 * 1. Recursively scans SCAN_ROOTS for .ts files and extracts every literal key
 *    passed to requirePermission() — no manually maintained file list needed.
 * 2. Verifies that all discovered keys exist in the perm_capabilities DB table.
 * 3. Warns if REQUIRED_CAPABILITY_KEYS in server/src/capabilities.ts is out of
 *    sync with the discovered callsite keys so developers can keep it up to date.
 *
 * Throws — causing process.exit(1) in server/index.ts — if any callsite key is
 * missing from the DB. This prevents a renamed seed key from silently opening a
 * protected route to everyone.
 *
 * Call this once after the capability seeding step in server/index.ts.
 */
export async function validateCapabilityKeys(pool: { query: (sql: string, params?: any[]) => Promise<any[]> }): Promise<void> {
  // 1. Auto-discover keys from all route source files in the repo
  const callsiteKeys = discoverCallsiteKeys(process.cwd());

  if (callsiteKeys.size === 0) {
    throw new Error(
      `[validateCapabilityKeys] STARTUP FAILURE: No requirePermission() callsites were ` +
        `found under SCAN_ROOTS (${SCAN_ROOTS.join(', ')}). ` +
        `This likely indicates a path or configuration problem.`
    );
  }

  // 2. Query the DB for all seeded capability keys
  const rows: Array<{ key: string }> = await pool.query(
    `SELECT key FROM perm_capabilities`
  );
  const seededKeys = new Set(rows.map((r) => r.key));

  // 3. Find callsite keys that are missing from the DB — these are the dangerous ones
  const missingFromDb = [...callsiteKeys].filter((k) => !seededKeys.has(k));

  if (missingFromDb.length > 0) {
    const list = missingFromDb.map((k) => `  - ${k}`).join('\n');
    throw new Error(
      `[validateCapabilityKeys] STARTUP FAILURE: The following capability keys are ` +
        `used in requirePermission() calls but are MISSING from the perm_capabilities table:\n${list}\n\n` +
        `Add the missing keys to the epochCapabilities seed array in server/index.ts ` +
        `and to REQUIRED_CAPABILITY_KEYS in server/src/capabilities.ts.`
    );
  }

  // 4. Cross-check that REQUIRED_CAPABILITY_KEYS is kept in sync with discovered callsites
  //    (warn only — the DB check above is the authoritative gate)
  const requiredSet = new Set(REQUIRED_CAPABILITY_KEYS);
  const inCallsitesNotInList = [...callsiteKeys].filter((k) => !requiredSet.has(k));
  const inListNotInCallsites = [...requiredSet].filter((k) => !callsiteKeys.has(k));

  if (inCallsitesNotInList.length > 0 || inListNotInCallsites.length > 0) {
    console.warn(
      `[validateCapabilityKeys] ⚠️  REQUIRED_CAPABILITY_KEYS in server/src/capabilities.ts is out of sync ` +
        `with discovered callsites. Update the list to keep documentation accurate.\n` +
        (inCallsitesNotInList.length > 0
          ? `  In callsites but NOT in list: ${inCallsitesNotInList.join(', ')}\n`
          : '') +
        (inListNotInCallsites.length > 0
          ? `  In list but NOT in callsites: ${inListNotInCallsites.join(', ')}\n`
          : '')
    );
  }

  console.log(
    `✅ Capability key validation passed — ${callsiteKeys.size} callsite key(s) discovered across codebase and verified against perm_capabilities`
  );
}
