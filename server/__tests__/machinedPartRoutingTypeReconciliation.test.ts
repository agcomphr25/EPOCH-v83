import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../migrations/0319_reconcile_machined_part_routing_type.sql', import.meta.url),
  'utf8',
);
const safeBootRegistry = readFileSync(
  new URL('../scripts/migrations/runSafeBootMigrations.ts', import.meta.url),
  'utf8',
);

test('reconciliation changes only defaulted routings linked to machined inventory items', () => {
  assert.match(migration, /routing\.routing_type = 'COMPOSITE'::routing_type/);
  assert.match(
    migration,
    /item\.manufactured_category = 'MACHINED_PART'::inventory_manufactured_category/,
  );
  assert.match(migration, /SET routing_type = 'CNC'::routing_type/);
  assert.match(migration, /routing\.inventory_item_fk = item\.id/);
  assert.match(migration, /routing\.inventory_item_id ~ '\^\[0-9\]\+\$'/);
  assert.doesNotMatch(migration, /part_number\s*=/i);
});

test('reconciliation is registered as both safe and critical', () => {
  const registrations = safeBootRegistry.match(
    /'0319_reconcile_machined_part_routing_type\.sql'/g,
  ) ?? [];
  assert.equal(registrations.length, 2);
});
