import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const service = readFileSync(
  join(
    process.cwd(),
    'server/src/services/productionExecutionAuthorizationService.ts'
  ),
  'utf8'
);
const route = readFileSync(
  join(process.cwd(), 'server/src/routes/projectProductionPlanning.ts'),
  'utf8'
);
const migration = readFileSync(
  join(process.cwd(), 'migrations/0271_p2_execution_authorization_event.sql'),
  'utf8'
);
const migrationRunner = readFileSync(
  join(process.cwd(), 'server/scripts/migrations/runSafeBootMigrations.ts'),
  'utf8'
);
const launchEventMigrations = [271, 272, 273, 274, 276, 278].map((number) =>
  readFileSync(
    join(
      process.cwd(),
      'migrations',
      `${String(number).padStart(4, '0')}_${
        {
          271: 'p2_execution_authorization_event',
          272: 'p2_production_order_provisioning_event',
          273: 'p2_serialized_unit_provisioning',
          274: 'p2_traveler_provisioning',
          276: 'p2_work_order_provisioning',
          278: 'p2_component_traveler_provisioning',
        }[number as 271 | 272 | 273 | 274 | 276 | 278]
      }.sql`
    ),
    'utf8'
  )
);

const launchEventTypes = [
  'RECURSIVE_DEMAND_GRAPH_PERSISTED',
  'EXECUTION_AUTHORIZED',
  'P2_PRODUCTION_ORDERS_PROVISIONED',
  'P2_SERIALIZED_UNITS_PROVISIONED',
  'P2_DRAFT_TRAVELERS_PROVISIONED',
  'P2_WORK_ORDERS_PROVISIONED',
  'P2_COMPONENT_TRAVELERS_PROVISIONED',
] as const;

describe('Production execution authorization foundation', () => {
  it('is independently fail-closed and server-authorized', () => {
    expect(service).toContain('isP2V2ExecutionAuthorizationEnabled()');
    expect(route).toContain("'projects.production_launch.launch'");
    expect(route).toContain("'/launch/:launchId/authorize-execution'");
  });

  it('links MAKE demand only to the exact released WAD', () => {
    expect(service).toContain("demand.disposition === 'MAKE'");
    expect(service).toContain('wa.status AS wad_status');
    expect(service).toContain('pwo.wad_status AS work_order_wad_status');
    expect(service).toContain("'WAD'");
    expect(service).toContain("demand_status='AUTHORIZED'");
  });

  it('creates no floor execution records in this phase', () => {
    for (const forbidden of [
      'INSERT INTO p2_production_orders',
      'INSERT INTO travelers',
      'INSERT INTO traveler_steps',
      'INSERT INTO cnc_jobs',
      'INSERT INTO manufacturing_queue',
      'INSERT INTO cutting_packet_schedule',
      'INSERT INTO production_work_orders',
    ])
      expect(service).not.toContain(forbidden);
    expect(service).toContain('createsFloorRecords: false');
  });

  it('uses one transaction, locking, idempotency, and reconciliation blockers', () => {
    expect(service).toContain('db.transaction');
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain("event_type='EXECUTION_AUTHORIZED'");
    expect(service).toContain('EXECUTION_AUTHORIZATION_IDEMPOTENCY_CONFLICT');
    expect(service).toContain('EXISTING_EXECUTION_REQUIRES_RECONCILIATION');
  });

  it('registers the authorization event without opening arbitrary event types', () => {
    expect(migration).toContain("'RECURSIVE_DEMAND_GRAPH_PERSISTED'");
    expect(migration).toContain("'EXECUTION_AUTHORIZED'");
    expect(migration).toContain(
      'project_production_launch_events_event_type_check'
    );
    expect(
      migrationRunner.match(/0271_p2_execution_authorization_event\.sql/g)
    ).toHaveLength(2);
  });

  it('keeps every replayed launch-event constraint compatible with later valid events', () => {
    for (const replayedMigration of launchEventMigrations) {
      for (const eventType of launchEventTypes) {
        expect(replayedMigration).toContain(`'${eventType}'`);
      }
    }
  });
});
