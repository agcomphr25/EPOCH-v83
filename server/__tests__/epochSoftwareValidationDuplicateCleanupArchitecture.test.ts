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
  it('preserves 0001 and targets only the thirteen empty duplicate drafts', () => {
    expect(migration).toContain("package_number = 'ESV-2026-0001'");
    expect(migration).toContain(
      "package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'"
    );
    expect(migration).toContain('target_count <> 13');
    expect(migration).toContain('authored_count <> 0');
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
  });

  it('uses the controlled duplicate status and records an audit event', () => {
    expect(migration).toContain("status = 'VOID_DUPLICATE'");
    expect(migration).toContain("'PACKAGE_VOIDED_DUPLICATE'");
    expect(migration).toContain("status = 'DRAFT'");
  });

  it('registers migration 0253 in both safe and critical boot lists', () => {
    expect(
      safeBoot.match(/0253_void_duplicate_epoch_validation_packages\.sql/g)
        ?.length
    ).toBe(2);
  });
});
