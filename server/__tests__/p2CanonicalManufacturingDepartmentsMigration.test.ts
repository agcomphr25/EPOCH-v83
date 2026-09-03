import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read(
  'migrations/0325_canonical_manufacturing_queue_departments.sql'
);
const registry = read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('canonical manufacturing queue departments migration', () => {
  it('is registered as both safe and critical', () => {
    expect(
      registry.match(/0325_canonical_manufacturing_queue_departments\.sql/g)
    ).toHaveLength(2);
  });

  it('preserves the full clean-database baseline and adds missing manufacturing queues', () => {
    for (const baseline of [
      "'Production Queue', 'PRODUCTION_QUEUE'",
      "'Layup', 'LAYUP'",
      "'Barcode', 'BARCODE'",
      "'CNC', 'CNC'",
      "'Gunsmith', 'GUNSMITH'",
      "'Paint', 'PAINT'",
      "'Finish', 'FINISH'",
      "'Finish QC', 'FINISH_QC'",
      "'Shipping QC', 'SHIPPING_QC'",
      "'Shipping', 'SHIPPING'",
      "'Cutting Table', 'CUTTING_TABLE'",
      "'Office', 'OFFICE'",
      "'Assembly', 'ASSEMBLY'",
    ])
      expect(migration).toContain(baseline);
    for (const canonical of [
      "'Kitting', 'KITTING'",
      "'Core', 'CORE'",
      "'Sub Assembly', 'SUB_ASSEMBLY'",
    ])
      expect(migration).toContain(canonical);
    expect(migration).toContain("ARRAY['core', 'cores']");
    expect(migration).toContain("ARRAY['kitting', 'kit', 'kits']");
    expect(migration).toContain(
      "ARRAY['subassembly', 'subassemblies', 'subassy']"
    );
    expect(migration).toContain('SELECT COALESCE(MAX(sort_order), 0)');
  });

  it('serializes replay and preserves inactive or disabled aliases', () => {
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('SELECT pg_advisory_xact_lock(1145394256);');
    expect(migration).toContain('ON CONFLICT DO NOTHING;');
    expect(migration).toContain('= ANY(canonical.aliases)');
    expect(migration).not.toMatch(/\bUPDATE\s+inventory_departments\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+inventory_departments\b/i);
  });
});
