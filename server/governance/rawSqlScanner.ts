/**
 * Raw SQL Lockdown Scanner
 *
 * Scans all .ts files under server/ (excluding migrations/ and server/schema.ts)
 * for literal DDL SQL patterns: ALTER TABLE, DROP COLUMN, DROP TABLE, ADD COLUMN,
 * CREATE COLUMN. Returns violations with file path and line number.
 *
 * Per task spec, only migrations/ directory and server/schema.ts are excluded —
 * governance source files are included in the scan coverage.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SqlViolation {
  file: string;
  line: number;
  snippet: string;
  pattern: string;
}

const DANGEROUS_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'ALTER TABLE',   re: /ALTER\s+TABLE/i },
  { name: 'DROP COLUMN',   re: /DROP\s+COLUMN/i },
  { name: 'DROP TABLE',    re: /DROP\s+TABLE/i },
  { name: 'ADD COLUMN',    re: /ADD\s+COLUMN/i },
  { name: 'CREATE COLUMN', re: /CREATE\s+COLUMN/i },
];

/** Exact path suffixes to always exclude */
const EXCLUDED_PATH_SUFFIXES = [
  'server/schema.ts',
];

/** Directories to never recurse into */
const EXCLUDED_DIRS = ['migrations', 'node_modules', '.git', 'dist'];

function shouldExclude(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');

  for (const suffix of EXCLUDED_PATH_SUFFIXES) {
    if (normalized.endsWith(suffix)) return true;
  }

  return false;
}

function collectTsFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.includes(entry.name)) continue;
      collectTsFiles(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      if (!shouldExclude(fullPath)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

export function scanRawSql(serverDir: string): SqlViolation[] {
  const violations: SqlViolation[] = [];
  const files = collectTsFiles(serverDir);
  const seen = new Set<string>(); // deduplicate ADD COLUMN / CREATE COLUMN dual-match

  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      for (const { name, re } of DANGEROUS_PATTERNS) {
        if (!re.test(line)) continue;

        // Deduplicate ADD COLUMN / CREATE COLUMN on same line
        const dedupKey = `${filePath}:${i + 1}`;
        if (seen.has(dedupKey)) break;
        seen.add(dedupKey);

        violations.push({
          file: filePath.replace(/\\/g, '/'),
          line: i + 1,
          snippet: line.trim().slice(0, 120),
          pattern: name,
        });
        break;
      }
    }
  }

  return violations;
}
