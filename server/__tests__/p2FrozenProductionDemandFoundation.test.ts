import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

import {
  compileFrozenProductionDemand,
  type FrozenDemandSourceNode,
} from '../src/services/p2FrozenProductionDemandCompiler';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const authority = (
  id: number,
  path: string,
  makeBuy: 'MAKE' | 'BUY' = 'MAKE'
): FrozenDemandSourceNode => ({
  inventoryItemId: id,
  partNumber: `P-${id}`,
  itemName: `Item ${id}`,
  classification: makeBuy === 'MAKE' ? 'ASSEMBLY' : 'PURCHASED_COMPONENT',
  makeBuy,
  unit: 'EA',
  quantityPerParent: '1',
  scrapPercent: '0',
  assemblyPath: path,
  bom:
    makeBuy === 'MAKE'
      ? {
          id: `bom-${id}`,
          revisionId: `rev-${id}`,
          revision: 'A',
          checksum: 'bom',
        }
      : null,
  routing:
    makeBuy === 'MAKE'
      ? {
          id: `route-${id}`,
          revision: '1',
          departmentSequence: ['CUT', 'ASSEMBLY'],
        }
      : null,
  traceability: { id: `policy-${id}`, revision: 1, type: 'SERIAL' },
  wadDecision:
    makeBuy === 'MAKE'
      ? {
          id: `decision-${id}`,
          status: 'VALIDATED',
          traceability_policy_id: `policy-${id}`,
          traveler_type: 'INDIVIDUAL',
        }
      : null,
  inspection: {},
  exceptionEvidence: {},
  effectivity: {},
  customerConfiguration: {},
  children: [],
});

describe('Phase 5 frozen production demand', () => {
  it('recursively multiplies nested gross quantities and preserves separate paths', () => {
    const source = authority(1, 'A');
    const left = authority(2, 'A/B');
    left.quantityPerParent = '2';
    const leaf1 = authority(3, 'A/B/C', 'BUY');
    leaf1.quantityPerParent = '3';
    left.children = [leaf1];
    const right = authority(2, 'A/B2');
    right.quantityPerParent = '4';
    source.children = [left, right];
    const result = compileFrozenProductionDemand(source, '5');
    expect(result.blockers).toEqual([]);
    expect(
      result.nodes.map((n) => [n.assemblyPath, n.requiredGrossQuantity])
    ).toEqual([
      ['A', '5.000000'],
      ['A/B', '10.000000'],
      ['A/B/C', '30.000000'],
      ['A/B2', '20.000000'],
    ]);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
  it('is deterministic for equivalent source content', () => {
    const source = authority(1, 'root');
    expect(compileFrozenProductionDemand(source, 2).checksum).toBe(
      compileFrozenProductionDemand(source, '2').checksum
    );
  });
  it('applies scrap/yield allowance prospectively', () => {
    const source = authority(1, 'root');
    const child = authority(2, 'root/child', 'BUY');
    child.quantityPerParent = '2';
    child.scrapPercent = '20';
    source.children = [child];
    expect(
      compileFrozenProductionDemand(source, 5).nodes[1].requiredGrossQuantity
    ).toBe('12.500000');
  });
  it('fails closed when WAD quantity or batch coverage differs from compiled demand', () => {
    const source = authority(1, 'root');
    source.wadDecision = {
      status: 'VALIDATED',
      traceability_policy_id: 'policy-1',
      required_quantity: 4,
      traveler_type: 'BATCH',
      batch_approved_quantity: 3,
      batch_coverage_scope: 'root',
    };
    const codes = compileFrozenProductionDemand(source, 5).blockers.map(
      (blocker) => blocker.code
    );
    expect(codes).toContain('WAD_QUANTITY_CONFLICT');
    source.wadDecision.required_quantity = 5;
    expect(
      compileFrozenProductionDemand(source, 5).blockers.map(
        (blocker) => blocker.code
      )
    ).toContain('WAD_BATCH_COVERAGE_INSUFFICIENT');
  });
  it('fails closed for a circular BOM without fixed-depth truncation', () => {
    const source = authority(1, 'A');
    const child = authority(2, 'A/B');
    child.children = [authority(1, 'A/B/A')];
    source.children = [child];
    expect(
      compileFrozenProductionDemand(source, 1).blockers.map((b) => b.code)
    ).toContain('CIRCULAR_BOM');
  });
  it.each([
    [
      'missing Inventory Item',
      (n: FrozenDemandSourceNode) => {
        n.inventoryItemId = null;
      },
      'INVENTORY_ITEM_MISSING',
    ],
    [
      'unreleased BOM',
      (n: FrozenDemandSourceNode) => {
        n.bom = null;
      },
      'RELEASED_BOM_MISSING',
    ],
    [
      'unreleased routing',
      (n: FrozenDemandSourceNode) => {
        n.routing = null;
      },
      'RELEASED_ROUTING_MISSING',
    ],
    [
      'routing Department gap',
      (n: FrozenDemandSourceNode) => {
        n.routing = { departmentSequence: [] };
      },
      'ROUTING_DEPARTMENT_MISSING',
    ],
    [
      'missing WAD decision',
      (n: FrozenDemandSourceNode) => {
        n.wadDecision = null;
      },
      'WAD_DECISION_MISSING',
    ],
    [
      'traceability conflict',
      (n: FrozenDemandSourceNode) => {
        n.wadDecision = {
          status: 'VALIDATED',
          traceability_policy_id: 'other',
        };
      },
      'TRACEABILITY_POLICY_CONFLICT',
    ],
    [
      'invalid unit',
      (n: FrozenDemandSourceNode) => {
        n.unit = '';
      },
      'UNIT_MISSING',
    ],
    [
      'unsupported classification',
      (n: FrozenDemandSourceNode) => {
        n.classification = 'UNKNOWN';
      },
      'UNSUPPORTED_CLASSIFICATION',
    ],
  ])('fails closed for %s', (_label, change, code) => {
    const source = authority(1, 'root');
    change(source);
    expect(
      compileFrozenProductionDemand(source, 1).blockers.map((b) => b.code)
    ).toContain(code);
  });
  it('rejects invalid quantities and duplicate path identities', () => {
    const source = authority(1, 'root');
    const a = authority(2, 'same', 'BUY');
    const b = authority(3, 'same', 'BUY');
    b.quantityPerParent = '0';
    source.children = [a, b];
    const codes = compileFrozenProductionDemand(source, 1).blockers.map(
      (x) => x.code
    );
    expect(codes).toContain('QUANTITY_INVALID');
    expect(codes).not.toContain('DUPLICATE_ASSEMBLY_PATH');
    b.quantityPerParent = '1';
    expect(
      compileFrozenProductionDemand(source, 1).blockers.map((x) => x.code)
    ).toContain('DUPLICATE_ASSEMBLY_PATH');
  });
  it('registers additive migration, immutable tables, independent release, permissions and disabled flags', () => {
    const migration = read(
      'migrations/0300_p2_frozen_production_demand_foundation.sql'
    );
    const service = read(
      'server/src/services/p2FrozenProductionDemandService.ts'
    );
    const routes = read('server/src/routes/p2FrozenProductionDemand.ts');
    const flags = read('server/src/lib/featureFlags.ts');
    const registry = read('server/scripts/migrations/runSafeBootMigrations.ts');
    expect(
      registry.match(/0300_p2_frozen_production_demand_foundation\.sql/g)
    ).toHaveLength(2);
    expect(migration).toContain(
      'No historical project or production row is modified'
    );
    expect(migration).toContain('p2_frozen_demand_node_immutable');
    expect(migration).toContain('p2_frozen_demand_event_immutable');
    expect(migration).toContain('projects.frozen_production_demand.release');
    expect(service).toContain('INDEPENDENT_RELEASE_REQUIRED');
    expect(service).toContain('PREVIEW_RELEASE_MISMATCH');
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain("baseline?.status === 'RELEASED'");
    expect(service).toContain('parentBomRevisionId');
    expect(routes).toContain(
      "requirePermission('projects.frozen_production_demand.release')"
    );
    expect(flags).toContain(
      "envBool('P2_FROZEN_PRODUCTION_DEMAND_READS_ENABLED', false)"
    );
  });
  it('contains no Phase 6 execution mutation', () => {
    const combined =
      read('server/src/services/p2FrozenProductionDemandService.ts') +
      read('migrations/0300_p2_frozen_production_demand_foundation.sql');
    for (const target of [
      'INSERT INTO production_work_orders',
      'INSERT INTO travelers',
      'INSERT INTO inventory_transactions',
      'INSERT INTO p2_production_orders',
      'INSERT INTO genealogy',
    ])
      expect(combined).not.toContain(target);
  });
});
