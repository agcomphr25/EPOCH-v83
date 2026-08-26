import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

import { planTravelerCoverage } from '../src/services/p2TravelerCoveragePlanner';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read(
  'migrations/0302_p2_traveler_provisioning_coverage_ledger.sql'
);
const service = read('server/src/services/p2TravelerProvisioningService.ts');
const routes = read('server/src/routes/p2ManufacturingWorkOrders.ts');

describe('Phase 7 P2 traveler provisioning coverage ledger', () => {
  it('is additive, prospective, registered, and disabled by default', () => {
    const registry = read('server/scripts/migrations/runSafeBootMigrations.ts');
    const flags = read('server/src/lib/featureFlags.ts');
    expect(
      registry.match(/0302_p2_traveler_provisioning_coverage_ledger\.sql/g)
    ).toHaveLength(2);
    expect(migration).toContain(
      'No historical traveler, work-order, or inventory row is changed'
    );
    expect(migration).not.toMatch(
      /\b(UPDATE|DELETE FROM)\s+(travelers|production_work_orders|inventory_transactions|orders)\b/i
    );
    expect(flags).toContain(
      "envBool('P2_TRAVELER_PROVISIONING_WRITES_ENABLED', false)"
    );
  });
  it('provisions one quantity-one Individual traveler for every uncovered unit', () => {
    expect(planTravelerCoverage(4, 'INDIVIDUAL', [2])).toEqual([
      { start: 1, end: 1, quantity: 1 },
      { start: 3, end: 3, quantity: 1 },
      { start: 4, end: 4, quantity: 1 },
    ]);
    expect(service).toContain("requirement === 'INDIVIDUAL'");
    expect(service).toContain("'NOT_STARTED'");
  });
  it('supports controlled partial Batch coverage without overlap', () => {
    expect(planTravelerCoverage(10, 'BATCH', [], 6)).toEqual([
      { start: 1, end: 6, quantity: 6 },
    ]);
    expect(planTravelerCoverage(10, 'BATCH', [1, 2, 3, 4, 5, 6], 4)).toEqual([
      { start: 7, end: 10, quantity: 4 },
    ]);
    expect(migration).toContain('UNIQUE(work_order_authority_id,unit_ordinal)');
    expect(service).toContain('TRAVELER_SPLIT_EXECUTION_STARTED');
  });
  it('fails closed for Lot and preserves retry idempotency', () => {
    expect(service).toContain('LOT_TRAVELER_PROVISIONING_NOT_IMPLEMENTED');
    expect(service).toContain('TRAVELER_PROVISIONING_IDEMPOTENCY_CONFLICT');
    expect(service).toContain('replayed: true');
    expect(service).toContain('pg_advisory_xact_lock');
  });
  it('keeps server authority, actor evidence, and immutable snapshots', () => {
    expect(routes).toContain("requirePermission('p2.travelers.provision')");
    expect(migration).toContain('p2_traveler_provisioning_immutable');
    expect(migration).toContain('created_by_employee_id INTEGER NOT NULL');
    expect(service).toContain('expectedConcurrencyVersion');
  });
  it('does not print barcodes or mutate inventory, Receiving, Genealogy, or scheduling', () => {
    for (const forbidden of [
      'INSERT INTO inventory_transactions',
      'INSERT INTO receiving',
      'INSERT INTO genealogy',
      'INSERT INTO weekly_schedule',
      'INSERT INTO material_consumption',
    ])
      expect(service).not.toContain(forbidden);
    expect(service).toContain('printsBarcode: false');
    expect(service).toContain('changesInventory: false');
  });
});
