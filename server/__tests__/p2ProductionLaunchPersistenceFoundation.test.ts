import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const migration = fs.readFileSync(
  path.join(root, 'migrations/0266_p2_production_launch_persistence.sql'),
  'utf8'
);
const service = fs.readFileSync(
  path.join(root, 'server/src/services/productionLaunchPersistenceService.ts'),
  'utf8'
);
const route = fs.readFileSync(
  path.join(root, 'server/src/routes/projectProductionPlanning.ts'),
  'utf8'
);
const safeBoot = fs.readFileSync(
  path.join(root, 'server/scripts/migrations/runSafeBootMigrations.ts'),
  'utf8'
);

describe('P2 Production Launch persistence foundation', () => {
  it('registers migration 0266 after both demand foundations', () => {
    expect(
      safeBoot.indexOf('0264_p2_recursive_production_demand_foundation.sql')
    ).toBeLessThan(safeBoot.indexOf('0265_p2_demand_planning_foundation.sql'));
    expect(
      safeBoot.indexOf('0265_p2_demand_planning_foundation.sql')
    ).toBeLessThan(
      safeBoot.indexOf('0266_p2_production_launch_persistence.sql')
    );
  });

  it('adds baseline-scoped idempotency and immutable audit evidence', () => {
    expect(migration).toContain(
      'project_production_launches_baseline_idempotency_unique'
    );
    expect(migration).toContain('project_production_launch_events');
    expect(migration).toContain('Production Launch audit events are immutable');
    expect(migration).not.toContain('ON DELETE CASCADE');
  });

  it('aligns demand evidence with controlled demand-planning classifications', () => {
    for (const classification of [
      'MANUFACTURED',
      'PURCHASED',
      'RAW_MATERIAL',
      'CUSTOMER_SUPPLIED',
    ])
      expect(migration).toContain(`'${classification}'`);
  });

  it('fails closed before opening a write transaction when disabled', () => {
    expect(
      service.indexOf('isP2V2ProductionLaunchPersistenceEnabled()')
    ).toBeLessThan(service.indexOf('return db.transaction'));
  });

  it('serializes and locks every authority before rebuilding the preview', () => {
    const lock = service.indexOf('pg_advisory_xact_lock');
    const authorities = service.indexOf('FOR UPDATE OF p,wi,release,plan,wad');
    const preview = service.indexOf(
      'const preview = await buildProductionLaunchPreview'
    );
    expect(lock).toBeGreaterThan(0);
    expect(lock).toBeLessThan(authorities);
    expect(authorities).toBeLessThan(preview);
  });

  it('uses the existing preview and graph compiler rather than recalculating demand', () => {
    expect(service).toContain('buildProductionLaunchPreview(');
    expect(service).toContain('compileProductionDemandGraph(');
    expect(service).not.toContain('resolveProductionLaunchPreview(');
  });

  it('rejects stale authorities, unresolved nodes, plan mismatch, and key drift', () => {
    for (const code of [
      'STALE_PREVIEW',
      'STALE_BASELINE',
      'STALE_PRODUCTION_PLAN',
      'STALE_WAD',
      'UNRESOLVED_PRODUCTION_DEMAND',
      'IDEMPOTENCY_CONFLICT',
      'EXISTING_CONFLICTING_LAUNCH',
    ])
      expect(service).toContain(`'${code}'`);
    expect(service).toContain('ProductionDemandGraphError');
  });

  it('persists only planning evidence inside the transaction', () => {
    for (const table of [
      'project_production_launches',
      'project_production_demands',
      'project_production_demand_allocations',
      'project_production_demand_dependencies',
      'project_production_launch_events',
    ])
      expect(service).toContain(`INSERT INTO ${table}`);
    for (const forbidden of [
      'INSERT INTO production_work_orders',
      'INSERT INTO p2_production_orders',
      'INSERT INTO travelers',
      'INSERT INTO cnc_jobs',
      'INSERT INTO manufacturing_queue',
      'INSERT INTO cutting_packet_schedule',
      'INSERT INTO purchase_orders',
      'INSERT INTO inventory_reservations',
      'UPDATE projects SET current_stage',
    ])
      expect(service).not.toContain(forbidden);
  });

  it('records stock netting as evidence without reservation or consumption', () => {
    expect(service).toContain("'NETTING_SNAPSHOT'");
    expect(service).toContain('createsReservation: false');
    expect(service).not.toContain("'RESERVATION'");
    expect(service).not.toContain("'ISSUE'");
  });

  it('exposes a narrow authorized endpoint', () => {
    expect(route).toContain("router.post('/launch'");
    expect(route).toContain("'projects.production_launch.launch'");
    expect(route).toContain('idempotencyKey');
    expect(route).toContain('expectedPreviewDigest');
    expect(route).toContain('signatureMeaning');
    expect(route).not.toContain('authoritativeBomNodes');
  });
});
