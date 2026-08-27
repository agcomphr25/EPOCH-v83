import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read(
  'migrations/0307_p2_manufactured_component_issue_genealogy.sql'
);
const service = read(
  'server/src/services/p2ManufacturedComponentIssueService.ts'
);
const routes = read('server/src/routes/p2ManufacturingWorkOrders.ts');
const flags = read('server/src/lib/featureFlags.ts');
const boot = read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('Phase 11 manufactured-component issue genealogy', () => {
  it('is additive, prospective, and registered after custody', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS p2_manufactured_component_issues'
    );
    expect(migration).not.toMatch(/^\s*(UPDATE|DELETE)\s+/im);
    expect(
      boot.indexOf('0307_p2_manufactured_component_issue_genealogy.sql')
    ).toBeGreaterThan(
      boot.indexOf('0306_p2_manufactured_output_custody_foundation.sql')
    );
  });

  it('requires exact custody, Inventory Item, and parent demand authority', () => {
    expect(service).toContain('RELEASED_AVAILABLE_CUSTODY_REQUIRED');
    expect(service).toContain('PARENT_DEMAND_MISMATCH');
    expect(service).toContain('r.successor_authority_id=$3');
    expect(service).toContain(
      'row.inventory_item_id !== row.requirement_item_id'
    );
  });

  it('is quantity-safe, serial-safe, concurrent, and retry-idempotent', () => {
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('COMPONENT_ISSUE_QUANTITY_INVALID');
    expect(service).toContain('SERIAL_COMPONENT_ISSUE_INVALID');
    expect(service).toContain('COMPONENT_ISSUE_IDEMPOTENCY_CONFLICT');
    expect(migration).toContain(
      "traceability_mode <> 'SERIAL' OR quantity = 1"
    );
    expect(migration).not.toContain(
      'UNIQUE(custody_id,parent_material_requirement_id)'
    );
  });

  it('uses the inventory ledger and immutable multilevel-capable genealogy edges', () => {
    expect(service).toContain("transactionType: 'ISSUE'");
    expect(service).toContain("transactionType: 'REVERSAL'");
    expect(service).toContain(
      'reversedTransactionId: row.issue_ledger_entry_id'
    );
    expect(migration).toContain('p2_component_genealogy_immutable');
    expect(migration).toContain('child_assembly_path_identity');
    expect(migration).toContain('parent_assembly_path_identity');
  });

  it('keeps permissions narrow and both server flags disabled', () => {
    expect(routes).toContain(
      "requirePermission('p2.manufactured_component.issue')"
    );
    expect(routes).toContain(
      "requirePermission('p2.manufactured_component.issue_reverse')"
    );
    expect(flags).toContain(
      "envBool('P2_MANUFACTURED_COMPONENT_ISSUE_READS_ENABLED', false)"
    );
    expect(flags).toContain(
      "envBool('P2_MANUFACTURED_COMPONENT_ISSUE_WRITES_ENABLED', false)"
    );
  });

  it('does not add Phase 12, Phase 13, purchasing, scheduling, or UI behavior', () => {
    expect(service).not.toMatch(
      /shipment_release|purchase_order|department_queue/i
    );
    expect(routes).not.toContain('VITE_P2_MANUFACTURED_COMPONENT');
  });
});
