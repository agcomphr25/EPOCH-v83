import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Phase 9 controlled material scan consumption foundation', () => {
  const migration = read(
    'migrations/0304_p2_controlled_material_scan_consumption.sql'
  );
  const service = read('server/src/services/p2MaterialConsumptionService.ts');
  const route = read('server/src/routes/p2ManufacturingWorkOrders.ts');
  const flags = read('server/src/lib/featureFlags.ts');
  const client = read('client/src/components/MaterialScanner.tsx');

  test('is additive, registered, prospective, and immutable', () => {
    const registry = read('server/scripts/migrations/runSafeBootMigrations.ts');
    expect(
      registry.match(/0304_p2_controlled_material_scan_consumption\.sql/g)
    ).toHaveLength(2);
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS p2_material_consumption_events'
    );
    expect(migration).toContain('BEFORE UPDATE OR DELETE');
    expect(migration).not.toMatch(
      /\bUPDATE\s+(travelers|material_lots|received_units)\b/i
    );
  });

  test('preserves exact Phase 5 through Phase 8 authority identities', () => {
    for (const table of [
      'p2_manufacturing_work_order_authorities',
      'p2_traveler_provisioning_authorities',
      'p2_manufacturing_work_order_operations',
      'p2_manufacturing_work_order_material_requirements',
      'p2_frozen_production_demand_nodes',
      'p2_receiving_barcode_identities',
      'inventory_item_traceability_policies',
    ])
      expect(migration).toContain(`REFERENCES ${table}`);
  });

  test('fails closed on identity, disposition, project, shelf-life, and quantity mismatches', () => {
    expect(service).toContain('MATERIAL_AUTHORITY_MISMATCH');
    expect(service).toContain("row.disposition !== 'accepted'");
    expect(service).toContain('restricted to another project');
    expect(service).toContain('material lot is expired');
    expect(service).toContain('quantity exceeds remaining released demand');
    expect(service).toContain(
      'quantity exceeds received-unit custody quantity'
    );
    expect(service).toContain('AND mr.id=$4');
    expect(service).toContain('resolveP2MaterialScan');
  });

  test('uses the central material issue engine and a ledger-backed retry identity', () => {
    expect(service).toContain('MaterialIssueService.consume');
    expect(service).toContain('p2MaterialConsumptionRequestKey');
    expect(migration).toContain(
      'inventory_ledger_p2_material_consumption_request_uidx'
    );
    expect(migration).toContain('UNIQUE(request_key)');
    expect(service).toContain('p2ReceivedUnitId');
    expect(service).toContain('p2MaterialRequirementId');
    expect(service).toContain('p2MaterialConsumptionRequestHash');
  });

  test('reverses lot and Receiving custody through the immutable ledger with controlled reasons', () => {
    const ledger = read(
      'server/src/services/inventoryTransactionLedgerService.ts'
    );
    expect(route).toContain(
      "requirePermission('p2.material_consumption.reverse')"
    );
    expect(service).toContain('reverseInventoryLedgerEntry');
    expect(ledger).toContain('restoreMaterialCustody');
    expect(ledger).toContain("'RETURN'");
    expect(migration).toContain("event_type IN ('CONSUMED','REVERSED')");
    expect(migration).toContain('p2_material_consumption_single_reversal_uidx');
    expect(migration).toContain("length(btrim(COALESCE(reason_text,''))) > 0");
    expect(migration).toContain('p2_material_consumption_reversal_valid');
  });

  test('retains authenticated actor and exact execution evidence', () => {
    expect(migration).toContain('actor_user_id INTEGER NOT NULL');
    expect(migration).toContain('actor_employee_id INTEGER NOT NULL');
    expect(migration).toContain('inventory_ledger_entry_id UUID NOT NULL');
    expect(service).toContain('operatorSessionToken');
  });

  test('uses narrow server-authoritative permissions', () => {
    expect(route).toContain(
      "requirePermission('p2.material_consumption.record')"
    );
    expect(migration).toContain("r.name IN ('ADMIN','OWNER')");
    expect(migration).toContain(
      "r.name IN ('SUPERVISOR','FLOOR_OPERATOR') AND c.key='p2.material_consumption.record'"
    );
    expect(migration).not.toMatch(
      /INVENTORY_MANAGER[^\n]+p2\.material_consumption/
    );
  });

  test('requires matching server and client gates that default off', () => {
    expect(flags).toContain(
      "envBool('P2_MATERIAL_CONSUMPTION_READS_ENABLED', false)"
    );
    expect(flags).toContain(
      "envBool('P2_MATERIAL_CONSUMPTION_WRITES_ENABLED', false)"
    );
    expect(route).toContain('!areP2MaterialConsumptionReadsEnabled()');
    expect(route).toContain('!areP2MaterialConsumptionWritesEnabled()');
    expect(client).toContain(
      "VITE_P2_MATERIAL_CONSUMPTION_READS_ENABLED === 'true'"
    );
    expect(client).toContain(
      "VITE_P2_MATERIAL_CONSUMPTION_WRITES_ENABLED === 'true'"
    );
  });

  test('does not add downstream output, completion, barcode printing, or Genealogy behavior', () => {
    expect(service).not.toMatch(
      /manufactured output|genealogy|printBarcode|completeWorkOrder/i
    );
    expect(migration).not.toMatch(
      /genealogy|manufactured_output|completion_event/i
    );
  });
});
