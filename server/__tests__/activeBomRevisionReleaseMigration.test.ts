import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../migrations/0318_backfill_active_bom_revision_release.sql', import.meta.url),
  'utf8',
);
const safeBootRegistry = readFileSync(
  new URL('../scripts/migrations/runSafeBootMigrations.ts', import.meta.url),
  'utf8',
);

test('backfill promotes only the latest revision of active BOMs with no released revision', () => {
  assert.match(migration, /WHERE bom\.is_active = TRUE/);
  assert.match(migration, /NOT EXISTS[\s\S]*released_revision\.is_released = TRUE/);
  assert.match(
    migration,
    /ORDER BY revision\.created_at DESC NULLS LAST, revision\.id DESC[\s\S]*LIMIT 1/,
  );
  assert.match(migration, /SET is_released = TRUE/);
  assert.doesNotMatch(migration, /SET[\s\S]*lifecycle_status\s*=/);
  assert.match(migration, /effective_from = COALESCE/);
  assert.match(migration, /effective_to = NULL/);
});

test('backfill is registered as both safe and critical', () => {
  const registrations = safeBootRegistry.match(
    /'0318_backfill_active_bom_revision_release\.sql'/g,
  ) ?? [];
  assert.equal(registrations.length, 2);
});
