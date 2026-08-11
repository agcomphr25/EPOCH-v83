import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  addDemandIdentities,
  demandPlanningChecksum,
} from '../src/services/p2DemandPlanningDeterminism';

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), 'utf8');

describe('P2 Demand Planning Foundation Phase 1', () => {
  const migration = read('migrations/0265_p2_demand_planning_foundation.sql');

  it('defines exactly four authoritative planning classifications without inference backfill', () => {
    for (const value of [
      'MANUFACTURED',
      'PURCHASED',
      'RAW_MATERIAL',
      'CUSTOMER_SUPPLIED',
    ])
      expect(migration).toContain(`'${value}'`);
    expect(migration).toContain('part_configuration_revision TEXT NOT NULL');
    expect(migration).not.toMatch(/UPDATE\s+inventory_items/i);
    expect(migration).not.toMatch(
      /INSERT INTO\s+p2_part_planning_classifications\s+SELECT/i
    );
  });

  it('preserves controlled plan revision, lineage, lifecycle, concurrency, and source evidence', () => {
    for (const token of [
      'p2_demand_plans',
      'p2_demand_plan_lines',
      'demand_identity',
      'parent_line_id',
      'aggregation_provenance',
      'source_checksum',
      'result_checksum',
      'concurrency_version',
      'CUSTOMER_DEMAND_CANCELED',
      'p2_demand_fulfillment_references',
    ])
      expect(migration).toContain(token);
  });

  it('keeps fulfillment cancellation separate from customer-demand cancellation', () => {
    expect(migration).toContain(
      "status TEXT NOT NULL CHECK (status IN ('PROPOSED','ACTIVE','CANCELED','REPLACED','FULFILLED'))"
    );
    expect(migration).toContain("'CUSTOMER_DEMAND_CANCELED'");
  });

  it('registers the additive migration as safe and critical', () => {
    const runner = read('server/scripts/migrations/runSafeBootMigrations.ts');
    expect(
      runner.match(/0265_p2_demand_planning_foundation\.sql/g)
    ).toHaveLength(2);
  });

  it('uses bounded batch preload before recursive resolution', () => {
    const resolver = read(
      'server/src/services/productionLaunchPreviewResolver.ts'
    );
    const service = read(
      'server/src/services/productionLaunchPreviewService.ts'
    );
    expect(resolver).toContain('await source.prepare?.(roots, effectiveAt)');
    expect(service).toContain(
      'const [inventoryRows, bomRows, lineRows, routingRows] = await Promise.all'
    );
    expect(service).toContain('WITH RECURSIVE graph');
    expect(service).toContain('graph.depth<50');
  });

  it('does not generate execution records', () => {
    const service = read(
      'server/src/services/productionLaunchPreviewService.ts'
    );
    expect(service).not.toMatch(
      /INSERT INTO\s+(p2_production_orders|production_work_orders|travelers|material_lot_reservations)/i
    );
    expect(service).toContain('createsRecords: false');
  });

  it('produces stable identities and checksums for identical controlled inputs', () => {
    const nodes = [
      {
        path: ['po-item:1', 'A'],
        partNumber: 'A',
        revision: 'B',
        classification: 'MANUFACTURED',
        bomRevisionId: 'bom-rev',
        routingId: 'route',
        routingRevision: '2',
        requiredByDate: '2026-10-01',
        children: [],
      },
    ];
    const first = addDemandIdentities(nodes, { projectId: 'project', poId: 4 });
    const second = addDemandIdentities(nodes, {
      projectId: 'project',
      poId: 4,
    });
    expect(second).toEqual(first);
    expect(demandPlanningChecksum(second)).toBe(demandPlanningChecksum(first));
    expect(
      addDemandIdentities([{ ...nodes[0], revision: 'C' }], {
        projectId: 'project',
        poId: 4,
      })[0].demandIdentity
    ).not.toBe(first[0].demandIdentity);
  });

  it('enforces independent release, optimistic concurrency, and effectivity conflicts', () => {
    const service = read(
      'server/src/services/p2PartPlanningClassificationService.ts'
    );
    expect(service).toContain('INDEPENDENT_RELEASE_REQUIRED');
    expect(service).toContain('CLASSIFICATION_VERSION_CONFLICT');
    expect(service).toContain('CLASSIFICATION_EFFECTIVITY_CONFLICT');
    expect(service).toContain('FUTURE_EFFECTIVITY_TRANSITION_REQUIRED');
    expect(service).toContain('pg_advisory_xact_lock');
  });
});
