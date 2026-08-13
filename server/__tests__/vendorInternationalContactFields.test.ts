import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { insertVendorSchema } from '../schema';
import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';

const migrationName = '0278_vendor_international_contact_fields.sql';

describe('vendor international contact fields', () => {
  it('deploys the website column as a critical safe migration', () => {
    expect(safeMigrationFiles).toContain(migrationName);
    expect(criticalMigrationFiles).toContain(migrationName);

    const migrationSql = readFileSync(
      join(process.cwd(), 'migrations', migrationName),
      'utf8'
    );
    expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS website TEXT');
  });

  it('accepts complete international contact data', () => {
    const result = insertVendorSchema.safeParse({
      name: 'Example GmbH',
      website: 'https://www.example.de/about',
      phone: '+49 30 123456-78 ext. 4',
      street: 'Musterstraße 12\n3. Obergeschoss',
      city: 'Berlin',
      state: 'Berlin',
      zipCode: '10115',
      country: 'Germany',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a website without a URL scheme', () => {
    const result = insertVendorSchema.safeParse({
      name: 'Example Vendor',
      website: 'example.com',
    });

    expect(result.success).toBe(false);
  });
});
