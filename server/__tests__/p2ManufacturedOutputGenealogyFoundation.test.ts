import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), 'utf8');
const migration = read(
  'migrations/0305_p2_manufactured_output_genealogy_foundation.sql'
);
const service = read(
  'server/src/services/p2ManufacturedOutputGenealogyService.ts'
);
const routes = read('server/src/routes/p2ManufacturingWorkOrders.ts');
const workOrders = read(
  'server/src/services/p2ManufacturingWorkOrderService.ts'
);
const flags = read('server/src/lib/featureFlags.ts');
const boot = read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('Phase 10 manufactured-output Genealogy foundation', () => {
  it('is additive, registered after 0304, and prospective', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS p2_manufactured_output_authorities'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS p2_material_genealogy_edges'
    );
    expect(migration).not.toMatch(/^\s*UPDATE\s+/im);
    expect(
      boot.indexOf('0305_p2_manufactured_output_genealogy_foundation.sql')
    ).toBeGreaterThan(
      boot.indexOf('0304_p2_controlled_material_scan_consumption.sql')
    );
  });

  it('preserves exact Phase 5 through Phase 9 authority identities', () => {
    for (const token of [
      'frozen_demand_baseline_id',
      'frozen_demand_node_id',
      'work_order_authority_id',
      'inventory_item_id',
      'assembly_path_identity',
      'consumption_event_id',
      'material_requirement_id',
      'received_unit_id',
      'material_lot_id',
    ])
      expect(migration).toContain(token);
  });

  it('enforces immutable released output and immutable Genealogy edges in PostgreSQL', () => {
    expect(migration).toContain("IF OLD.status='RELEASED'");
    expect(migration).toContain(
      'BEFORE UPDATE OR DELETE ON p2_manufactured_output_authorities'
    );
    expect(migration).toContain(
      'BEFORE UPDATE OR DELETE ON p2_material_genealogy_edges'
    );
  });

  it('requires independent release, concurrency, and true create replay identity', () => {
    expect(service).toContain('INDEPENDENT_RELEASE_REQUIRED');
    expect(service).toContain('expectedConcurrencyVersion');
    expect(service).toContain('OUTPUT_IDEMPOTENCY_CONFLICT');
    expect(service).toContain('request_hash !== requestHash');
  });

  it('builds Genealogy only from unreversed Phase 9 consumption', () => {
    expect(service).toContain("e.event_type='CONSUMED'");
    expect(service).toContain("r.event_type='REVERSED'");
    expect(service).toContain('MATERIAL_GENEALOGY_REQUIRED');
  });

  it('uses narrow permissions and server-authoritative disabled gates', () => {
    expect(routes).toContain(
      "requirePermission('p2.manufactured_output.record')"
    );
    expect(routes).toContain(
      "requirePermission('p2.manufactured_output.release')"
    );
    expect(flags).toContain(
      "envBool('P2_MANUFACTURED_OUTPUT_READS_ENABLED', false)"
    );
    expect(flags).toContain(
      "envBool('P2_MANUFACTURED_OUTPUT_WRITES_ENABLED', false)"
    );
  });

  it('gates Quality acceptance on released output only when Phase 10 is enabled', () => {
    expect(workOrders).toContain('areP2ManufacturedOutputWritesEnabled()');
    expect(workOrders).toContain('RELEASED_OUTPUT_GENEALOGY_REQUIRED');
    expect(workOrders).toContain("status='RELEASED'");
  });

  it('does not add scheduling, purchasing, Receiving creation, shipping, or barcode printing', () => {
    expect(service).not.toMatch(
      /purchase order|schedule|shipment|printBarcode|INSERT INTO received_units/i
    );
  });
});
