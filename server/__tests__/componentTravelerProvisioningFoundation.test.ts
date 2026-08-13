import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const service = read(
  'server/src/services/componentTravelerProvisioningService.ts'
);
const route = read('server/src/routes/projectProductionPlanning.ts');
const migration = read(
  'migrations/0278_p2_component_traveler_provisioning.sql'
);
const runner = read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('P2 component traveler provisioning boundary', () => {
  it('is independently disabled and capability protected', () => {
    expect(service).toContain('isP2V2ComponentTravelerProvisioningEnabled()');
    expect(route).toContain(
      "'/launch/:launchId/provision-component-travelers'"
    );
    expect(route).toContain("'projects.production_launch.launch'");
  });

  it('targets manufactured children only after work-order provisioning', () => {
    expect(service).toContain("event_type='P2_WORK_ORDERS_PROVISIONED'");
    expect(service).toContain("d.disposition='MAKE'");
    expect(service).toContain('d.parent_demand_id IS NOT NULL');
    expect(service).toContain("wo.link_type='WORK_ORDER'");
    expect(service).toContain('WORK_ORDER_PROVISIONING_REQUIRED');
  });

  it('requires exact draft work-order and frozen-routing evidence', () => {
    expect(service).toContain('resolveWadTravelerRequired');
    expect(service).toContain('WAD_TRAVELER_SELECTION_REQUIRED');
    expect(service).toContain('travelerRequired: false');
    expect(service).toContain("target.work_order_status !== 'PLANNED'");
    expect(service).toContain("target.work_order_wad_status !== 'DRAFT'");
    expect(service).toContain('work_order_part_number');
    expect(service).toContain('routing_first_department');
    expect(service).toContain('first_department_snapshot');
  });

  it('creates draft travelers without downstream execution records', () => {
    expect(service).toContain('generateTravelerFromRouting');
    expect(service).toContain("status: 'DRAFT'");
    expect(service).toContain("'TRAVELER'");
    for (const forbidden of [
      'INSERT INTO cnc_jobs',
      'INSERT INTO manufacturing_queue',
      'INSERT INTO cutting_packet_schedule',
    ])
      expect(service).not.toContain(forbidden);
    expect(service).toContain('createsCncJobs: false');
    expect(service).toContain('releasesFloorWork: false');
  });

  it('uses locking, idempotency, reconciliation guards, and registered audit evidence', () => {
    expect(service).toContain('pg_advisory_lock');
    expect(service).toContain('COMPONENT_TRAVELER_IDEMPOTENCY_CONFLICT');
    expect(service).toContain(
      'EXISTING_COMPONENT_TRAVELER_REQUIRES_RECONCILIATION'
    );
    expect(migration).toContain("'P2_COMPONENT_TRAVELERS_PROVISIONED'");
    expect(
      runner.match(/0278_p2_component_traveler_provisioning\.sql/g)
    ).toHaveLength(2);
  });
});
