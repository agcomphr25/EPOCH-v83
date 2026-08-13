import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const service = readFileSync(
  join(
    process.cwd(),
    'server/src/services/serializedUnitProvisioningService.ts'
  ),
  'utf8'
);
const route = readFileSync(
  join(process.cwd(), 'server/src/routes/projectProductionPlanning.ts'),
  'utf8'
);
const migration = readFileSync(
  join(process.cwd(), 'migrations/0273_p2_serialized_unit_provisioning.sql'),
  'utf8'
);
const runner = readFileSync(
  join(process.cwd(), 'server/scripts/migrations/runSafeBootMigrations.ts'),
  'utf8'
);

describe('P2 serialized-unit provisioning boundary', () => {
  it('is independently fail-closed and capability protected', () => {
    expect(service).toContain('isP2V2SerializedUnitProvisioningEnabled()');
    expect(route).toContain("'/launch/:launchId/provision-serialized-units'");
    expect(route).toContain("'projects.production_launch.launch'");
  });

  it('serializes only root manufactured MAKE demand', () => {
    expect(service).toContain('d.parent_demand_id IS NULL');
    expect(service).toContain('d.path_depth=0');
    expect(service).toContain("d.classification='MANUFACTURED'");
    expect(service).toContain("d.disposition='MAKE'");
    expect(service).toContain("demand.demand_status !== 'IN_PROCESS'");
  });

  it('uses the authoritative allocator and validates frozen identity', () => {
    expect(service).toContain('storage.addP2SerializedItemsForPoItem');
    expect(service).toContain(
      'item.partRoutingId !== String(demand.routing_id)'
    );
    expect(service).toContain("item.currentDepartment !== 'Pending Layup'");
    expect(service).toContain('EXISTING_SERIALS_REQUIRE_RECONCILIATION');
  });

  it('creates serial links and no travelers or downstream floor records', () => {
    expect(service).toContain(
      'INSERT INTO project_production_demand_serialized_units'
    );
    for (const forbidden of [
      'INSERT INTO travelers',
      'INSERT INTO traveler_steps',
      'INSERT INTO cnc_jobs',
      'INSERT INTO manufacturing_queue',
      'INSERT INTO cutting_packet_schedule',
      'INSERT INTO production_work_orders',
    ])
      expect(service).not.toContain(forbidden);
    expect(service).toContain('createsTravelers: false');
  });

  it('registers migration 0273 as safe and critical with a closed event type', () => {
    expect(migration).toContain('project_production_demand_serialized_units');
    expect(migration).toContain(
      'project_production_demands_id_project_unique_idx'
    );
    expect(migration.indexOf('CREATE UNIQUE INDEX')).toBeLessThan(
      migration.indexOf('CREATE TABLE')
    );
    expect(migration).toContain("'P2_SERIALIZED_UNITS_PROVISIONED'");
    expect(
      runner.match(/0273_p2_serialized_unit_provisioning\.sql/g)
    ).toHaveLength(2);
  });
});
