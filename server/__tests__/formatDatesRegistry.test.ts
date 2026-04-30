/**
 * Regression guard: every *_DATE_COLUMNS constant that is actively called via
 * formatDates() in server/storage.ts must have a matching entry in
 * FORMAT_DATES_REGISTRY (server/utils/formatDates.ts).
 *
 * If you add a new entity with date columns:
 *   1. Define its *_DATE_COLUMNS constant in server/storage.ts
 *   2. Call formatDates() with that constant in every storage method that
 *      returns rows for that entity
 *   3. Add an entry to FORMAT_DATES_REGISTRY in server/utils/formatDates.ts
 *
 * This test will fail if step 3 is forgotten.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { FORMAT_DATES_REGISTRY } from '../utils/formatDates';

const STORAGE_PATH = resolve(__dirname, '../storage.ts');

function readStorageSource(): string {
  return readFileSync(STORAGE_PATH, 'utf-8');
}

/**
 * Extract all  const FOO_DATE_COLUMNS = ['a', 'b'] as const  definitions.
 * Returns a map from constant name to sorted column fingerprint.
 */
function extractDateColumnConstants(src: string): Map<string, string> {
  const map = new Map<string, string>();
  const pattern = /const\s+(\w+_DATE_COLUMNS)\s*=\s*\[([^\]]+)\]\s*as\s+const/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(src)) !== null) {
    const name = m[1];
    const cols = m[2]
      .split(',')
      .map(s => s.trim().replace(/['"]/g, ''))
      .filter(Boolean)
      .sort()
      .join(',');
    map.set(name, cols);
  }
  return map;
}

/**
 * Find every *_DATE_COLUMNS constant name that appears as the second argument
 * of a formatDates() call in the source.
 *
 * The first argument may contain commas (e.g. Record<string, unknown>) so we
 * allow any character except a closing paren before the constant name.
 */
function extractUsedConstants(src: string): Set<string> {
  const used = new Set<string>();
  // Matches: formatDates(  <anything without closing paren>  ,  SOME_DATE_COLUMNS  )
  const pattern = /\bformatDates\s*\([^)]*?(\w+_DATE_COLUMNS)[^)]*?\)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(src)) !== null) {
    used.add(m[1]);
  }
  return used;
}

/**
 * Build a set of column fingerprints from the registry.
 * Each fingerprint is the sorted, comma-joined list of column names for one entity.
 */
function registryFingerprints(): Set<string> {
  return new Set(
    Object.values(FORMAT_DATES_REGISTRY).map(cols => [...cols].sort().join(',')),
  );
}

describe('FORMAT_DATES_REGISTRY sync with storage.ts', () => {
  it('every *_DATE_COLUMNS constant actively used in formatDates() has a matching registry entry', () => {
    const src = readStorageSource();
    const allConstants = extractDateColumnConstants(src);
    const usedConstants = extractUsedConstants(src);
    const registryFps = registryFingerprints();

    const missingFromRegistry: string[] = [];

    for (const constName of usedConstants) {
      const fingerprint = allConstants.get(constName);
      if (fingerprint === undefined) {
        // The constant is referenced in a formatDates() call but its definition
        // wasn't found — this should never happen unless the file is malformed.
        throw new Error(
          `formatDates() references '${constName}' but no matching constant definition was found in storage.ts`,
        );
      }
      if (!registryFps.has(fingerprint)) {
        missingFromRegistry.push(constName);
      }
    }

    expect(
      missingFromRegistry,
      `The following DATE_COLUMNS constants are used in formatDates() in storage.ts ` +
      `but have NO matching entry in FORMAT_DATES_REGISTRY (server/utils/formatDates.ts):\n` +
      missingFromRegistry.map(n => `  • ${n} [${allConstants.get(n)}]`).join('\n') +
      `\n\nAdd each missing entity to FORMAT_DATES_REGISTRY.`,
    ).toHaveLength(0);
  });

  it('FORMAT_DATES_REGISTRY has no entries whose column set is never used in storage.ts', () => {
    const src = readStorageSource();
    const allConstants = extractDateColumnConstants(src);
    const usedConstants = extractUsedConstants(src);

    // Build fingerprint -> entity name map from registry
    const registryByFp = new Map<string, string>();
    for (const [entity, cols] of Object.entries(FORMAT_DATES_REGISTRY)) {
      registryByFp.set([...cols].sort().join(','), entity);
    }

    // Build fingerprints actually in use
    const usedFps = new Set<string>();
    for (const constName of usedConstants) {
      const fp = allConstants.get(constName);
      if (fp) usedFps.add(fp);
    }

    const orphans: string[] = [];
    for (const [fp, entity] of registryByFp) {
      if (!usedFps.has(fp)) {
        orphans.push(entity);
      }
    }

    expect(
      orphans,
      `The following FORMAT_DATES_REGISTRY entries have no matching *_DATE_COLUMNS constant ` +
      `actively used via formatDates() in storage.ts:\n` +
      orphans.map(e => `  • ${e}`).join('\n') +
      `\n\nEither remove the stale registry entries or restore the formatDates() call-sites.`,
    ).toHaveLength(0);
  });
});
