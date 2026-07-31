import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';

const migrationName = '0129a_capa_records_base_table.sql';
const dependentMigrationName = '0235_quality_action_change_control.sql';
const root = path.resolve(__dirname, '../..');
const migration = fs.readFileSync(
  path.join(root, 'migrations', migrationName),
  'utf8'
);

describe('capa_records safe-boot prerequisite', () => {
  it('creates the capa_records base table additively with the required columns', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS capa_records/i);
    for (const column of [
      'id',
      'capa_number',
      'source_type',
      'title',
      'problem_statement',
      'status',
      'effectiveness_status',
      'created_at',
      'updated_at',
    ]) {
      expect(migration).toMatch(new RegExp(`\\b${column}\\b`, 'i'));
    }
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
  });

  it('runs as a critical migration before the quality-action change-control migration', () => {
    const baseIndex = safeMigrationFiles.indexOf(migrationName);
    const dependentIndex = safeMigrationFiles.indexOf(dependentMigrationName);

    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(dependentIndex).toBeGreaterThan(baseIndex);
    expect(criticalMigrationFiles.has(migrationName)).toBe(true);
  });
});
