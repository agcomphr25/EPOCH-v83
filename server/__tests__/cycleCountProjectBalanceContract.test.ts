import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(
  new URL('../src/services/cycleCountService.ts', import.meta.url),
  'utf8',
);
const routes = readFileSync(
  new URL('../src/routes/cycleCounts.ts', import.meta.url),
  'utf8',
);
const page = readFileSync(
  new URL('../../client/src/pages/CycleCountPage.tsx', import.meta.url),
  'utf8',
);

test('cycle count exposes project and manufactured-part scopes', () => {
  assert.match(routes, /router\.get\('\/scope-options'/);
  assert.match(routes, /projectId: z\.string\(\)\.uuid\(\)/);
  assert.match(service, /p2_project_controlled_configurations/);
  assert.match(service, /item_type = 'MANUFACTURED'/);
  assert.match(page, /Project manufactured parts/);
  assert.match(page, /One manufactured part/);
});

test('posting locks and updates the location balance in the ledger transaction', () => {
  assert.match(service, /eq\(inventoryBalances\.locationId, sess\.location\)/);
  assert.match(service, /\.for\('update'\)/);
  assert.match(service, /Balance changed after counting/);
  assert.match(service, /tx\.update\(inventoryBalances\)/);
  assert.match(service, /quantityOnHand: qtyAfter/);
  assert.match(service, /lastCountedAt: new Date\(\)/);
  assert.match(service, /Cannot post an adjustment for ALL locations/);
});
