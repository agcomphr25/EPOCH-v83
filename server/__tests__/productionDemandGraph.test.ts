import { describe, expect, it } from 'vitest';

import {
  compileProductionDemandGraph,
  ProductionDemandGraphError,
  type FrozenProductionPlanItem,
} from '../src/services/productionDemandGraph';
import type { ProductionLaunchPreviewNode } from '../src/services/productionLaunchPreviewResolver';

const node = (
  partNumber: string,
  assemblyPath: string,
  makeBuy: ProductionLaunchPreviewNode['makeBuy'],
  shortageQuantity: number,
  children: ProductionLaunchPreviewNode[] = []
): ProductionLaunchPreviewNode => ({
  path: ['po-item:20', partNumber],
  productionPlanAssemblyPath: assemblyPath,
  bomLineId: assemblyPath.includes('/line:')
    ? assemblyPath.split('/line:').at(-1)!
    : null,
  demandLineIdentity: '00000000-0000-4000-8000-000000000020',
  originalCustomerQuantity: 4,
  effectiveCustomerQuantity: 4,
  customerDemandEventDigest: '0'.repeat(64),
  customerDemandSnapshot: { originalQuantity: 4, events: [] },
  parentPartNumber: null,
  inventoryItemId: 1,
  partNumber,
  revision: 'A',
  description: `${partNumber} description`,
  classification:
    makeBuy === 'MAKE' ? 'MANUFACTURED_COMPONENT' : 'PURCHASED_COMPONENT',
  makeBuy,
  quantityPerParent: 1,
  extendedProjectQuantity: 4,
  unitOfMeasure: 'EA',
  bomId: makeBuy === 'MAKE' ? 'bom' : null,
  bomRevisionId: makeBuy === 'MAKE' ? 'bom-rev' : null,
  bomRevision: makeBuy === 'MAKE' ? 'A' : null,
  routingId: makeBuy === 'MAKE' ? 'route' : null,
  routingRevision: makeBuy === 'MAKE' ? '1' : null,
  firstDepartment: makeBuy === 'MAKE' ? 'CNC' : null,
  availableQuantity: 4 - shortageQuantity,
  allocatedQuantity: 0,
  shortageQuantity,
  requiredByDate: '2026-10-01',
  demandStatus:
    shortageQuantity === 0
      ? 'STOCK_SATISFIED'
      : makeBuy === 'MAKE'
        ? 'MAKE_REQUIRED'
        : 'BUY_REQUIRED',
  blockers: [],
  children,
});

const plan = (
  ...entries: Array<[string, string]>
): FrozenProductionPlanItem[] =>
  entries.map(([assemblyPath, partNumber], index) => ({
    id: `plan-item-${index + 1}`,
    assemblyPath,
    partNumber,
    productionPlanId: 'plan-1',
    projectId: 'project-1',
  }));

describe('controlled Production Demand graph compiler', () => {
  it('compiles multilevel MAKE and BUY demand with exact released-plan identity', () => {
    const buy = node('RAW-STOCK', 'root:20/line:left/line:stock', 'BUY', 2);
    const left = node('PITOT-CNC-LEFT', 'root:20/line:left', 'MAKE', 4, [buy]);
    const right = node('PITOT-CNC-RIGHT', 'root:20/line:right', 'MAKE', 4);
    const root = node('HEATED-PITOT', 'root:20', 'MAKE', 4, [left, right]);
    const graph = compileProductionDemandGraph(
      [root],
      plan(
        ['root:20', 'HEATED-PITOT'],
        ['root:20/line:left', 'PITOT-CNC-LEFT'],
        ['root:20/line:left/line:stock', 'RAW-STOCK'],
        ['root:20/line:right', 'PITOT-CNC-RIGHT']
      )
    );
    expect(graph.demands).toHaveLength(4);
    expect(graph.demands[1]).toMatchObject({
      parentKey: '20:root:20',
      productionPlanItemId: 'plan-item-2',
      firstDepartmentSnapshot: 'CNC',
      disposition: 'MAKE',
      demandLineIdentity: '00000000-0000-4000-8000-000000000020',
      customerDemandEventDigest: '0'.repeat(64),
    });
    expect(graph.dependencies).toContainEqual({
      predecessorKey: '20:root:20/line:left',
      successorKey: '20:root:20',
      dependencyType: 'ISSUE_OR_SCAN',
    });
  });

  it('propagates the authoritative customer-demand quantity snapshot to every descendant', () => {
    const child = node('CHILD', 'root:20/line:child', 'BUY', 2);
    const root = node('ASSEMBLY', 'root:20', 'MAKE', 6, [child]);
    root.originalCustomerQuantity = 4;
    root.effectiveCustomerQuantity = 6;
    root.customerDemandEventDigest = 'a'.repeat(64);
    root.customerDemandSnapshot = {
      originalQuantity: 4,
      effectiveQuantity: 6,
      events: [{ eventType: 'SCOPE_INCREASE', quantityDelta: 2 }],
    };
    child.originalCustomerQuantity = root.originalCustomerQuantity;
    child.effectiveCustomerQuantity = root.effectiveCustomerQuantity;
    child.customerDemandEventDigest = root.customerDemandEventDigest;
    child.customerDemandSnapshot = root.customerDemandSnapshot;
    const graph = compileProductionDemandGraph(
      [root],
      plan(['root:20', 'ASSEMBLY'], ['root:20/line:child', 'CHILD'])
    );
    expect(graph.demands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          originalCustomerQuantity: 4,
          effectiveCustomerQuantity: 6,
          customerDemandEventDigest: 'a'.repeat(64),
        }),
      ])
    );
    expect(
      graph.demands.every((demand) => demand.effectiveCustomerQuantity === 6)
    ).toBe(true);
  });

  it('retains stock-satisfied traceability without creating a parent gate', () => {
    const stocked = node('STOCKED-BUY', 'root:20/line:stocked', 'BUY', 0);
    const root = node('ASSEMBLY', 'root:20', 'MAKE', 1, [stocked]);
    const graph = compileProductionDemandGraph(
      [root],
      plan(['root:20', 'ASSEMBLY'], ['root:20/line:stocked', 'STOCKED-BUY'])
    );
    expect(graph.demands[1]).toMatchObject({
      disposition: 'STOCK_SATISFIED',
      demandStatus: 'STOCK_SATISFIED',
    });
    expect(graph.dependencies).toEqual([]);
  });

  it('fails closed when the recursive preview differs from the released plan', () => {
    const root = node('ASSEMBLY', 'root:20', 'MAKE', 1);
    expect(() => compileProductionDemandGraph([root], [])).toThrowError(
      expect.objectContaining<Partial<ProductionDemandGraphError>>({
        code: 'PLAN_ITEM_MISSING',
      })
    );
    expect(() =>
      compileProductionDemandGraph([root], plan(['root:20', 'OTHER-PART']))
    ).toThrowError(
      expect.objectContaining<Partial<ProductionDemandGraphError>>({
        code: 'PLAN_ITEM_MISMATCH',
      })
    );
  });
});
