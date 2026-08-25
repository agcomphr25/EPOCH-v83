import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';

const migrationName = '0293_inventory_foam_and_3d_cutting_categories.sql';

describe('inventory manufactured categories migration', () => {
  it('deploys the enum additions as a critical safe migration', () => {
    expect(safeMigrationFiles).toContain(migrationName);
    expect(criticalMigrationFiles).toContain(migrationName);

    const migrationSql = readFileSync(
      join(process.cwd(), 'migrations', migrationName),
      'utf8'
    );
    expect(migrationSql).toContain(
      "ADD VALUE IF NOT EXISTS 'FOAM_CUTTING'"
    );
    expect(migrationSql).toContain(
      "ADD VALUE IF NOT EXISTS 'THREE_D_PRINTING_CUTTING'"
    );
  });
});
