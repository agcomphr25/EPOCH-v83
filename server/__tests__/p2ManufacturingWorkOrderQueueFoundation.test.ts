import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read(
  'migrations/0301_p2_manufacturing_work_order_queue_foundation.sql'
);
const service = read('server/src/services/p2ManufacturingWorkOrderService.ts');
const routes = read('server/src/routes/p2ManufacturingWorkOrders.ts');
const frozenDemand = read(
  'server/src/services/p2FrozenProductionDemandService.ts'
);
const client = read('client/src/components/p2/P2FrozenProductionDemand.tsx');

describe('Phase 6 P2 manufacturing work-order queue foundation', () => {
  it('is prospective, additive, registered, and defaults every server flag off', () => {
    const registry = read('server/scripts/migrations/runSafeBootMigrations.ts');
    const flags = read('server/src/lib/featureFlags.ts');
    expect(
      registry.match(/0301_p2_manufacturing_work_order_queue_foundation\.sql/g)
    ).toHaveLength(2);
    expect(migration).toContain(
      'No historical work order, traveler, or demand row is changed'
    );
    expect(migration).not.toMatch(
      /\b(UPDATE|DELETE FROM)\s+(production_work_orders|travelers|project_production_demands)\b/i
    );
    expect(flags).toContain(
      "envBool('P2_MANUFACTURING_WORK_ORDER_QUEUE_READS_ENABLED', false)"
    );
    expect(flags).toContain(
      "envBool('P2_MANUFACTURING_WORK_ORDER_MATERIALIZATION_ENABLED', false)"
    );
    expect(flags).toContain(
      "envBool('P2_MANUFACTURING_WORK_ORDER_EXECUTION_ENABLED', false)"
    );
  });

  it('materializes only MAKE nodes from an exact released frozen baseline', () => {
    expect(service).toContain("baseline.status !== 'RELEASED'");
    expect(service).toContain(
      'clean(baseline.baseline_checksum) !== input.expectedBaselineChecksum'
    );
    expect(service).toContain("node.make_buy_disposition === 'MAKE'");
    expect(service).toContain("pl.status='COMPLETE'");
    expect(service).toContain("release.status='APPROVED'");
    expect(service).toContain("wad.status='RELEASED'");
    expect(service).toContain("pwo.wad_status='APPROVED'");
    expect(service).not.toContain('shortage_quantity');
    expect(service).not.toContain('NETTING_SNAPSHOT');
    expect(service).toContain("source: 'P2_FROZEN_PRODUCTION_DEMAND'");
  });

  it('uses stable node/path uniqueness and true retry idempotency', () => {
    expect(migration).toContain('UNIQUE(frozen_demand_node_id)');
    expect(migration).toContain(
      'UNIQUE(frozen_demand_baseline_id,assembly_path_identity)'
    );
    expect(migration).toContain('p2_mwo_materialization_request_uidx');
    expect(service).toContain(
      'WORK_ORDER_MATERIALIZATION_IDEMPOTENCY_CONFLICT'
    );
    expect(service).toContain('replayed: true');
    expect(service).toContain('pg_advisory_xact_lock');
  });

  it('fails closed when the legacy launch path already provisioned child work orders', () => {
    expect(service).toContain(
      "launch_event.event_type='P2_WORK_ORDERS_PROVISIONED'"
    );
    expect(service).toContain(
      'LEGACY_WORK_ORDER_PROVISIONING_RECONCILIATION_REQUIRED'
    );
  });

  it('keeps individual materialization child-only and requires its parent authority', () => {
    expect(routes).toContain(
      'frozenDemandNodeId: z.string().uuid().optional()'
    );
    expect(service).toContain('input.frozenDemandNodeId');
    expect(service).toContain('Number(node.depth) > 0');
    expect(service).toContain('MANUFACTURED_PARENT_WORK_ORDER_REQUIRED');
    expect(service).toContain('parentPoAuthorityInherited: true');
    expect(frozenDemand).toContain('materialized_authority_id');
    expect(client).toContain('Create this work order');
    expect(client).toContain(
      'Released parent WAD registered as the root P2 manufacturing authority.'
    );
  });

  it('registers one depth-zero root against the exact released WAD work order', () => {
    expect(service).toContain('Number(node.depth) === 0');
    expect(service).toContain('releaseAuthority.wad_work_order_id');
    expect(service).toContain('WAD_ROOT_WORK_ORDER_MISMATCH');
    expect(service).toContain(
      'Number(releaseAuthority.wad_work_order_quantity) !== quantity'
    );
    expect(service).toContain(
      'normalizedPartNumber(releaseAuthority.wad_work_order_part_number)'
    );
    expect(service).toContain('WAD_ROOT_AUTHORITY_CONFLICT');
    expect(client).toContain(
      'Includes the released parent WAD as the root P2 authority'
    );
  });

  it('enforces quantity-aware child and material readiness centrally', () => {
    expect(migration).toContain('required_quantity NUMERIC(18,6)');
    expect(migration).toContain('satisfied_quantity NUMERIC(18,6)');
    expect(service).toContain("readiness = 'BLOCKED_CHILD'");
    expect(service).toContain("readiness = 'BLOCKED_MATERIAL'");
    expect(service).toContain(
      'cp.accepted_quantity ELSE cp.completed_quantity'
    );
    expect(service).toContain('shortageQuantity');
  });

  it('fails closed at both direct work-order and traveler start boundaries', () => {
    const travelers = read('server/src/routes/travelers.ts');
    expect(routes).toContain("requirePermission('p2.work_orders.execute')");
    expect(service).toContain("readiness.readiness !== 'READY'");
    expect(service).toContain('P2_WORK_ORDER_BLOCKED');
    expect(travelers).toContain('assertTravelerP2WorkOrderReady');
    expect(travelers).toContain(
      'areP2ManufacturingWorkOrderExecutionEnabled()'
    );
  });

  it('advances the same work order through frozen routing operations', () => {
    expect(service).toContain('current_operation_sequence=$2');
    expect(service).toContain("SET status='READY',assigned_department=$2");
    expect(service).toContain("'OPERATION_COMPLETED_DEPARTMENT_ADVANCED'");
    expect(service).not.toContain(
      'INSERT INTO production_work_orders\n+         SELECT'
    );
  });

  it('supports an optional project scope without weakening department scope', () => {
    expect(routes).toContain('projectId: z.string().uuid().optional()');
    expect(routes).toContain('query.projectId');
    expect(service).toContain('AND ($3::uuid IS NULL OR project_id=$3)');
  });

  it('separates execution, completion, and Quality acceptance authority', () => {
    for (const capability of [
      'p2.work_orders.materialize',
      'p2.work_orders.execute',
      'p2.work_orders.complete_operation',
      'p2.work_orders.accept',
    ]) {
      expect(migration).toContain(capability);
      expect(routes).toContain(`requirePermission('${capability}')`);
    }
    expect(service).toContain('AUTHENTICATED_EMPLOYEE_REQUIRED');
    expect(service).toContain("'OUTPUT_ACCEPTED'");
  });

  it('does not create inventory, receiving, barcode, genealogy, or P1 records', () => {
    for (const forbidden of [
      'INSERT INTO inventory_transactions',
      'INSERT INTO receiving',
      'INSERT INTO genealogy',
      'INSERT INTO barcodes',
      'UPDATE orders ',
      'INSERT INTO manufacturing_queue',
    ])
      expect(service).not.toContain(forbidden);
    expect(service).toContain('changesInventory: false');
  });
});
