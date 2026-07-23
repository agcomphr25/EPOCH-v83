import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'migrations/0210_repair_freezer_temperature_tracking.sql'),
  'utf8'
);

const legacyRequiredColumns = [
  'freezer_1_temperature',
  'freezer_2_temperature',
  'freezer_3_temperature',
  'freezer_4_temperature',
  'layup_room_temperature',
  'refrigerator_container_temperature',
];

describe('freezer temperature legacy-schema repair', () => {
  it('makes every legacy fixed-reading column nullable for normalized inserts', () => {
    for (const column of legacyRequiredColumns) {
      expect(migration).toContain(`'${column}'`);
    }
    expect(migration).toContain('ALTER TABLE freezer_temperature_logs ALTER COLUMN %I DROP NOT NULL');
  });

  it('creates the normalized location and reading tables idempotently', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "freezer_temperature_locations"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "freezer_temperature_readings"');
    expect(migration).toContain('UNIQUE ("log_id", "location_id")');
  });
});