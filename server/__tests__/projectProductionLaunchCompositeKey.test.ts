import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migrationName = '0226_project_production_launch_composite_key.sql';
const migration = fs.readFileSync(
  path.join(root, 'migrations', migrationName),
  'utf8',
);
const safeBoot = fs.readFileSync(
  path.join(root, 'server/scripts/migrations/runSafeBootMigrations.ts'),
  'utf8',
);

describe('project production launch composite key repair', () => {
  it('creates the unique index before attaching the named constraint', () => {
    const createIndexAt = migration.indexOf(
      'CREATE UNIQUE INDEX IF NOT EXISTS project_production_launches_id_project_key',
    );
    const addConstraintAt = migration.indexOf(
      'ADD CONSTRAINT project_production_launches_id_project_key',
    );

    expect(createIndexAt).toBeGreaterThan(-1);
    expect(addConstraintAt).toBeGreaterThan(createIndexAt);
    expect(migration).toContain(
      'UNIQUE USING INDEX project_production_launches_id_project_key',
    );
  });

  it('is idempotent and registered as a critical safe-boot migration', () => {
    expect(migration).toContain(
      "to_regclass('public.project_production_launches') IS NULL",
    );
    expect(migration).toContain('IF NOT EXISTS (');
    expect(safeBoot.match(new RegExp(migrationName.replace('.', '\\.'), 'g'))).toHaveLength(2);
  });
});
