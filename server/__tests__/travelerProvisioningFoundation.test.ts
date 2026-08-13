import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const service = readFileSync(
  join(process.cwd(), 'server/src/services/travelerProvisioningService.ts'),
  'utf8'
);
const route = readFileSync(
  join(process.cwd(), 'server/src/routes/projectProductionPlanning.ts'),
  'utf8'
);
const migration = readFileSync(
  join(process.cwd(), 'migrations/0274_p2_traveler_provisioning.sql'),
  'utf8'
);
const runner = readFileSync(
  join(process.cwd(), 'server/scripts/migrations/runSafeBootMigrations.ts'),
  'utf8'
);

describe('P2 draft traveler provisioning boundary', () => {
  it('is independently gated and capability protected', () => {
    expect(service).toContain('isP2V2TravelerProvisioningEnabled()');
    expect(route).toContain("'/launch/:launchId/provision-draft-travelers'");
    expect(route).toContain("'projects.production_launch.launch'");
  });

  it('requires audited serial links and exact frozen routing', () => {
    expect(service).toContain('project_production_demand_serialized_units');
    expect(service).toContain('project_production_serialized_unit_travelers');
    expect(service).toContain(
      'String(target.part_routing_id) !== String(target.routing_id)'
    );
    expect(service).toContain('EXISTING_TRAVELER_REQUIRES_RECONCILIATION');
  });

  it('creates routing-derived travelers but does not activate work', () => {
    expect(service).toContain('storage.generateTravelerFromRouting');
    expect(service).toContain("status: 'DRAFT'");
    expect(service).toContain("ts.status<>'NOT_STARTED'");
    expect(service).toContain('activatesWork: false');
    for (const forbidden of [
      'INSERT INTO cnc_jobs',
      'INSERT INTO manufacturing_queue',
      'INSERT INTO cutting_packet_schedule',
      'INSERT INTO p2_work_tasks',
    ])
      expect(service).not.toContain(forbidden);
  });

  it('registers migration 0274 as safe and critical', () => {
    expect(migration).toContain('P2_DRAFT_TRAVELERS_PROVISIONED');
    expect(runner.match(/0274_p2_traveler_provisioning\.sql/g)).toHaveLength(2);
  });
});
