import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';

const migrationName = '0233a_spec_sheets_base_table.sql';
const controlledMigrationName = '0233_part_specification_sheet_control.sql';
const root = path.resolve(__dirname, '../..');
const migration = fs.readFileSync(
  path.join(root, 'migrations', migrationName),
  'utf8'
);

describe('spec_sheets safe-boot prerequisite', () => {
  it('creates the legacy base table additively with the columns used by the schema', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS spec_sheets/i);
    for (const column of [
      'id',
      'part_routing_id',
      'part_number',
      'title',
      'version',
      'source_type',
      'specifications',
      'is_active',
      'created_at',
      'updated_at',
    ]) {
      expect(migration).toMatch(new RegExp(`\\b${column}\\b`, 'i'));
    }
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
  });

  it('runs as a critical migration before the controlled spec-sheet migration', () => {
    const baseIndex = safeMigrationFiles.indexOf(migrationName);
    const controlledIndex = safeMigrationFiles.indexOf(controlledMigrationName);

    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(controlledIndex).toBeGreaterThan(baseIndex);
    expect(criticalMigrationFiles.has(migrationName)).toBe(true);
  });
});
