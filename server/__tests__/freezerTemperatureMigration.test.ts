import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { insertFreezerTemperatureLogSchema } from '../schema';
import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';

const repairMigration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'migrations/0210_repair_freezer_temperature_tracking.sql'
  ),
  'utf8'
);
const naMigrationName = '0217_freezer_na_readings.sql';
const naMigration = fs.readFileSync(
  path.resolve(process.cwd(), 'migrations', naMigrationName),
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

const locationOne = '00000000-0000-4000-8000-000000000001';
const locationTwo = '00000000-0000-4000-8000-000000000002';
const baseLog = {
  recordedAt: new Date(),
  notes: 'Freezer 2 is down for maintenance',
};

describe('freezer temperature migrations', () => {
  it('makes every legacy fixed-reading column nullable for normalized inserts', () => {
    for (const column of legacyRequiredColumns) {
      expect(repairMigration).toContain(`'${column}'`);
    }
    expect(repairMigration).toContain(
      'ALTER TABLE freezer_temperature_logs ALTER COLUMN %I DROP NOT NULL'
    );
  });

  it('creates the normalized location and reading tables idempotently', () => {
    expect(repairMigration).toContain(
      'CREATE TABLE IF NOT EXISTS "freezer_temperature_locations"'
    );
    expect(repairMigration).toContain(
      'CREATE TABLE IF NOT EXISTS "freezer_temperature_readings"'
    );
    expect(repairMigration).toContain('UNIQUE ("log_id", "location_id")');
  });

  it('registers the N/A migration as safe and critical', () => {
    expect(safeMigrationFiles).toContain(naMigrationName);
    expect(criticalMigrationFiles.has(naMigrationName)).toBe(true);
    expect(naMigration).toContain('ALTER COLUMN "temperature" DROP NOT NULL');
    expect(naMigration).toContain('"is_not_applicable" boolean');
    expect(naMigration).toContain(
      'freezer_temperature_readings_value_or_na_check'
    );
  });
});

describe('freezer temperature submission validation', () => {
  it('accepts multiple numeric and N/A readings in one row', () => {
    const result = insertFreezerTemperatureLogSchema.safeParse({
      ...baseLog,
      readings: [
        {
          locationId: locationOne,
          temperature: '-1.5',
          isNotApplicable: false,
        },
        { locationId: locationTwo, temperature: null, isNotApplicable: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a reading that has neither a temperature nor N/A', () => {
    const result = insertFreezerTemperatureLogSchema.safeParse({
      ...baseLog,
      readings: [
        { locationId: locationOne, temperature: null, isNotApplicable: false },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate freezers in one submission', () => {
    const result = insertFreezerTemperatureLogSchema.safeParse({
      ...baseLog,
      readings: [
        { locationId: locationOne, temperature: '-1', isNotApplicable: false },
        { locationId: locationOne, temperature: '-2', isNotApplicable: false },
      ],
    });
    expect(result.success).toBe(false);
  });
});
