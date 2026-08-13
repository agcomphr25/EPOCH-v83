import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const service = readFileSync(
  join(
    process.cwd(),
    'server/src/services/productionOrderProvisioningService.ts'
  ),
  'utf8'
);
const route = readFileSync(
  join(process.cwd(), 'server/src/routes/projectProductionPlanning.ts'),
  'utf8'
);
const migration = readFileSync(
  join(
    process.cwd(),
    'migrations/0272_p2_production_order_provisioning_event.sql'
  ),
  'utf8'
);
const runner = readFileSync(
  join(process.cwd(), 'server/scripts/migrations/runSafeBootMigrations.ts'),
  'utf8'
);

describe('P2 production order provisioning boundary', () => {
  it('is independently fail-closed and capability protected', () => {
    expect(service).toContain('isP2V2ProductionOrderProvisioningEnabled()');
    expect(route).toContain("'/launch/:launchId/provision-p2-orders'");
    expect(route).toContain("'projects.production_launch.launch'");
  });

  it('requires authorized whole-unit MAKE demand and frozen routing agreement', () => {
    expect(service).toContain('d.demand_status');
    expect(service).toContain("d.disposition='MAKE'");
    expect(service).toContain('routing_first_department');
    expect(service).toContain('first_department_snapshot');
    expect(service).toContain("wl.link_type='WAD'");
    expect(service).toContain('wad_link_id');
    expect(service).toContain('Number.isSafeInteger(quantity)');
  });

  it('creates only P2 order and demand-link floor records', () => {
    expect(service).toContain('INSERT INTO p2_production_orders');
    expect(service).toContain("'P2_PRODUCTION_ORDER'");
    for (const forbidden of [
      'INSERT INTO p2_serialized_items',
      'INSERT INTO travelers',
      'INSERT INTO traveler_steps',
      'INSERT INTO cnc_jobs',
      'INSERT INTO manufacturing_queue',
      'INSERT INTO cutting_packet_schedule',
      'INSERT INTO production_work_orders',
    ])
      expect(service).not.toContain(forbidden);
    expect(service).toContain('createsSerializedItems: false');
    expect(service).toContain('createsTravelers: false');
  });

  it('uses one transaction, locking, event replay, and reconciliation guards', () => {
    expect(service).toContain('db.transaction');
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain("event_type='P2_PRODUCTION_ORDERS_PROVISIONED'");
    expect(service).toContain('P2_ORDER_PROVISIONING_IDEMPOTENCY_CONFLICT');
    expect(service).toContain('EXISTING_P2_ORDERS_REQUIRE_RECONCILIATION');
    expect(service).toContain("demand_status='IN_PROCESS'");
  });

  it('registers the closed event type as safe and critical migration 0270', () => {
    expect(migration).toContain("'RECURSIVE_DEMAND_GRAPH_PERSISTED'");
    expect(migration).toContain("'EXECUTION_AUTHORIZED'");
    expect(migration).toContain("'P2_PRODUCTION_ORDERS_PROVISIONED'");
    expect(
      runner.match(/0272_p2_production_order_provisioning_event\.sql/g)
    ).toHaveLength(2);
  });
});
