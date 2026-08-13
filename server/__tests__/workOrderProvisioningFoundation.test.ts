import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const service = read('server/src/services/workOrderProvisioningService.ts');
const route = read('server/src/routes/projectProductionPlanning.ts');
const migration = read('migrations/0276_p2_work_order_provisioning.sql');
const runner = read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('P2 work-order provisioning boundary', () => {
  it('is independently disabled and capability protected', () => {
    expect(service).toContain('isP2V2WorkOrderProvisioningEnabled()');
    expect(route).toContain("'/launch/:launchId/provision-work-orders'");
    expect(route).toContain("'projects.production_launch.launch'");
  });

  it('uses the released WAD as the exact single root assembly work order', () => {
    expect(service).toContain('SINGLE_ROOT_ASSEMBLY_REQUIRED');
    expect(service).toContain('ROOT_WAD_MISMATCH');
    expect(service).toContain('demand.id !== root.id');
    expect(service).toContain("'WORK_ORDER'");
  });

  it('creates draft child work orders only for authorized MAKE shortages', () => {
    expect(service).toContain("d.disposition='MAKE'");
    expect(service).toContain("demand.demand_status !== 'IN_PROCESS'");
    expect(service).toContain('INSERT INTO production_work_orders');
    expect(service).toContain("'PLANNED','DRAFT'");
    expect(service).not.toContain('INSERT INTO travelers');
    expect(service).not.toContain('INSERT INTO cnc_jobs');
    expect(service).not.toContain('INSERT INTO manufacturing_queue');
    expect(service).not.toContain('INSERT INTO cutting_packet_schedule');
  });

  it('is transactional, idempotent, and preserves audit evidence', () => {
    expect(service).toContain('db.transaction');
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain("event_type='P2_WORK_ORDERS_PROVISIONED'");
    expect(service).toContain('WORK_ORDER_PROVISIONING_IDEMPOTENCY_CONFLICT');
    expect(service).toContain('EXISTING_WORK_ORDERS_REQUIRE_RECONCILIATION');
    expect(service).toContain('releasesFloorWork: false');
  });

  it('registers the additive migration in both safe-boot lists', () => {
    expect(migration).toContain("'WORK_ORDER'");
    expect(migration).toContain("'P2_WORK_ORDERS_PROVISIONED'");
    expect(runner.match(/0276_p2_work_order_provisioning\.sql/g)).toHaveLength(
      2
    );
  });
});
