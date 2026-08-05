import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const migration = fs.readFileSync(
  path.join(
    root,
    'migrations/0253_void_duplicate_epoch_validation_packages.sql'
  ),
  'utf8'
);
const safeBoot = fs.readFileSync(
  path.join(root, 'server/scripts/migrations/runSafeBootMigrations.ts'),
  'utf8'
);

describe('EPOCH validation duplicate cleanup', () => {
  it('preserves 0001 and classifies empty, complete, safe, and ambiguous states', () => {
    expect(migration).toContain("package_number = 'ESV-2026-0001'");
    expect(migration).toContain(
      "package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'"
    );
    expect(migration).toContain('candidate_count = 0');
    expect(migration).toContain('candidate_count <> 13');
    expect(migration).toContain('NOTHING_TO_DO');
    expect(migration).toContain('ALREADY_COMPLETED');
    expect(migration).toContain('EXACT_SAFE_CLEANUP');
    expect(migration).toContain('AMBIGUOUS_STOP');
    expect(migration).toContain('authored_count <> 0');
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
  });

  it('locks before deciding and records the controlled audit event atomically', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('ORDER BY package_number');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain("status = 'VOID_DUPLICATE'");
    expect(migration).toContain("'PACKAGE_VOIDED_DUPLICATE'");
    expect(migration).toContain("status = 'DRAFT'");
    expect(migration).toContain('WITH changed AS');
    expect(migration).toContain('inserted_events AS');
  });

  it('requires exact untouched payload matches and retained completion evidence', () => {
    expect(migration).toContain('ROW(');
    expect(migration).toContain('IS DISTINCT FROM');
    expect(migration).toContain('matching_authority_count <> 1');
    expect(migration).toContain('revision <> 1');
    expect(migration).toContain('row_version <> 1');
    expect(migration).toContain('completed_event_count <> 13');
  });

  it('registers migration 0253 in both safe and critical boot lists', () => {
    expect(
      safeBoot.match(/0253_void_duplicate_epoch_validation_packages\.sql/g)
        ?.length
    ).toBe(2);
  });
});
