import { describe, expect, it } from 'vitest';

import {
  resolveProductionLaunchPreview,
  type PreviewBomCandidate,
  type PreviewBomLine,
  type PreviewInventoryItem,
  type PreviewRoutingCandidate,
  type ProductionLaunchPreviewSource,
} from '../src/services/productionLaunchPreviewResolver';

type Fixture = {
  inventory: PreviewInventoryItem[];
  boms: Record<
    string,
    Array<
      Omit<PreviewBomCandidate, 'isActive' | 'isReleased' | 'isEffective'> &
        Partial<
          Pick<PreviewBomCandidate, 'isActive' | 'isReleased' | 'isEffective'>
        >
    >
  >;
  lines: Record<string, PreviewBomLine[]>;
  routings: Record<string, PreviewRoutingCandidate[]>;
};

const key = (value: string) => value.trim().toUpperCase();
const item = (
  id: number,
  partNumber: string,
  itemType: 'MANUFACTURED' | 'PURCHASED',
  availableQuantity = 0
): PreviewInventoryItem => ({
  id,
  partNumber,
  description: `${partNumber} description`,
  itemType,
  planningClassification: itemType,
  classificationRevision: 1,
  classificationSourceRevision: 'test:1',
  partConfigurationRevision: 'A',
  classificationCandidateCount: 1,
  manufacturedCategory: itemType === 'MANUFACTURED' ? 'MACHINED_PART' : null,
  manufacturingLevel: itemType === 'MANUFACTURED' ? 'COMPONENT' : null,
  unitOfMeasure: 'EA',
  availableQuantity,
  allocatedQuantity: 0,
  vendorId: itemType === 'PURCHASED' ? 99 : null,
  orderUrl: null,
});

const routing = (
  id: string,
  departments: string[] = ['CNC']
): PreviewRoutingCandidate => ({
  id,
  revision: '1',
  isActive: true,
  releaseStatus: 'APPROVED',
  departmentSequence: departments,
  precedence: 1,
});

function source(fixture: Fixture): ProductionLaunchPreviewSource {
  return {
    async findInventory(partNumber, inventoryItemId) {
      return fixture.inventory.filter((entry) =>
        inventoryItemId == null
          ? key(entry.partNumber) === key(partNumber)
          : entry.id === inventoryItemId
      );
    },
    async findBoms(partNumber) {
      return (fixture.boms[key(partNumber)] ?? []).map((entry) => ({
        isActive: true,
        isReleased: true,
        isEffective: true,
        ...entry,
      }));
    },
    async getBomLines(revisionId) {
      return fixture.lines[revisionId] ?? [];
    },
    async findRoutings(partNumber) {
      return fixture.routings[key(partNumber)] ?? [];
    },
  };
}

const roots = (partNumber: string, quantity = 1) => [
  {
    poItemId: 20,
    partNumber,
    quantity,
    inventoryItemId: null,
    requiredByDate: '2026-10-01',
  },
];

describe('Production Launch recursive preview', () => {
  it('expands a heated-pitot assembly into two CNC MAKE children without a Layup fallback', async () => {
    const fixture: Fixture = {
      inventory: [
        {
          ...item(1, 'AG-SYS-HEATED-PITOT-0003', 'MANUFACTURED'),
          manufacturedCategory: 'ASSEMBLY',
          manufacturingLevel: 'FINAL',
        },
        item(2, 'PITOT-CNC-LEFT', 'MANUFACTURED'),
        item(3, 'PITOT-CNC-RIGHT', 'MANUFACTURED'),
      ],
      boms: {
        'AG-SYS-HEATED-PITOT-0003': [
          { bomId: 'bom-root', revisionId: 'rev-root', revision: 'A' },
        ],
        'PITOT-CNC-LEFT': [
          { bomId: 'bom-left', revisionId: 'rev-left', revision: 'A' },
        ],
        'PITOT-CNC-RIGHT': [
          { bomId: 'bom-right', revisionId: 'rev-right', revision: 'A' },
        ],
      },
      lines: {
        'rev-root': [
          {
            id: 'line-left',
            childPartNumber: 'PITOT-CNC-LEFT',
            quantityPerParent: 2,
          },
          {
            id: 'line-right',
            childPartNumber: 'PITOT-CNC-RIGHT',
            quantityPerParent: 1,
          },
        ],
        'rev-left': [
          {
            id: 'left-buy',
            childPartNumber: 'LEFT-STOCK',
            quantityPerParent: 1,
          },
        ],
        'rev-right': [
          {
            id: 'right-buy',
            childPartNumber: 'RIGHT-STOCK',
            quantityPerParent: 1,
          },
        ],
      },
      routings: {
        'AG-SYS-HEATED-PITOT-0003': [routing('routing-root', ['Assembly'])],
        'PITOT-CNC-LEFT': [routing('routing-left')],
        'PITOT-CNC-RIGHT': [routing('routing-right')],
      },
    };
    fixture.inventory.push(
      item(4, 'LEFT-STOCK', 'PURCHASED'),
      item(5, 'RIGHT-STOCK', 'PURCHASED')
    );

    const preview = await resolveProductionLaunchPreview(
      roots('AG-SYS-HEATED-PITOT-0003', 3),
      source(fixture)
    );

    expect(preview.ready).toBe(true);
    expect(preview.nodes[0]).toMatchObject({
      classification: 'MANUFACTURED',
      extendedProjectQuantity: 3,
    });
    expect(preview.nodes[0].children).toEqual([
      expect.objectContaining({
        partNumber: 'PITOT-CNC-LEFT',
        extendedProjectQuantity: 6,
        firstDepartment: 'CNC',
      }),
      expect.objectContaining({
        partNumber: 'PITOT-CNC-RIGHT',
        extendedProjectQuantity: 3,
        firstDepartment: 'CNC',
      }),
    ]);
    expect(preview.nodes[0].children[0].children[0]).toMatchObject({
      path: [
        'po-item:20',
        'AG-SYS-HEATED-PITOT-0003',
        'PITOT-CNC-LEFT',
        'LEFT-STOCK',
      ],
      makeBuy: 'BUY',
      extendedProjectQuantity: 6,
    });
  });

  it('reports a complete BOM cycle path instead of silently truncating recursion', async () => {
    const fixture: Fixture = {
      inventory: [item(1, 'A', 'MANUFACTURED'), item(2, 'B', 'MANUFACTURED')],
      boms: {
        A: [{ bomId: 'bom-a', revisionId: 'rev-a', revision: '1' }],
        B: [{ bomId: 'bom-b', revisionId: 'rev-b', revision: '1' }],
      },
      lines: {
        'rev-a': [{ id: 'a-b', childPartNumber: 'B', quantityPerParent: 1 }],
        'rev-b': [{ id: 'b-a', childPartNumber: 'A', quantityPerParent: 1 }],
      },
      routings: { A: [routing('route-a')], B: [routing('route-b')] },
    };

    const preview = await resolveProductionLaunchPreview(
      roots('A'),
      source(fixture)
    );
    expect(preview.ready).toBe(false);
    expect(preview.blockers).toContainEqual(
      expect.objectContaining({
        code: 'BOM_CYCLE',
        path: ['po-item:20', 'A', 'B', 'A'],
      })
    );
  });

  it('fails closed for duplicate effective BOMs and missing routing', async () => {
    const fixture: Fixture = {
      inventory: [item(1, 'MAKE-1', 'MANUFACTURED')],
      boms: {
        'MAKE-1': [
          { bomId: 'bom-1', revisionId: 'rev-1', revision: 'A' },
          { bomId: 'bom-2', revisionId: 'rev-2', revision: 'B' },
        ],
      },
      lines: {},
      routings: {},
    };
    const preview = await resolveProductionLaunchPreview(
      roots('MAKE-1'),
      source(fixture)
    );
    expect(preview.blockers.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(['BOM_AMBIGUOUS', 'ROUTING_MISSING'])
    );
  });

  it('nets partial purchased stock and creates no manufactured routing requirement', async () => {
    const fixture: Fixture = {
      inventory: [item(1, 'BUY-1', 'PURCHASED', 4)],
      boms: {},
      lines: {},
      routings: {},
    };
    const preview = await resolveProductionLaunchPreview(
      roots('BUY-1', 10),
      source(fixture)
    );
    expect(preview.ready).toBe(true);
    expect(preview.nodes[0]).toMatchObject({
      makeBuy: 'BUY',
      availableQuantity: 4,
      shortageQuantity: 6,
      demandStatus: 'BUY_REQUIRED',
      routingId: null,
    });
  });

  it('marks a purchased leaf as stock satisfied when usable stock covers demand', async () => {
    const fixture: Fixture = {
      inventory: [item(1, 'BUY-STOCKED', 'PURCHASED', 12)],
      boms: {},
      lines: {},
      routings: {},
    };
    const preview = await resolveProductionLaunchPreview(
      roots('BUY-STOCKED', 10),
      source(fixture)
    );
    expect(preview.nodes[0]).toMatchObject({
      shortageQuantity: 0,
      demandStatus: 'STOCK_SATISFIED',
    });
  });

  it('blocks missing inventory identity and missing make-buy classification', async () => {
    const unresolved = item(1, 'UNRESOLVED', 'PURCHASED');
    unresolved.itemType = null;
    unresolved.planningClassification = null;
    unresolved.classificationRevision = null;
    unresolved.classificationSourceRevision = null;
    unresolved.partConfigurationRevision = null;
    unresolved.classificationCandidateCount = 0;
    const fixture: Fixture = {
      inventory: [unresolved],
      boms: {},
      lines: {},
      routings: {},
    };
    const missing = await resolveProductionLaunchPreview(
      roots('MISSING'),
      source(fixture)
    );
    const missingDecision = await resolveProductionLaunchPreview(
      roots('UNRESOLVED'),
      source(fixture)
    );
    expect(missing.blockers[0]).toMatchObject({
      code: 'INVENTORY_ITEM_MISSING',
      path: ['po-item:20', 'MISSING'],
    });
    expect(missingDecision.blockers).toContainEqual(
      expect.objectContaining({ code: 'CLASSIFICATION_REQUIRED' })
    );
  });

  it.each([
    ['RAW_MATERIAL', 'RAW_MATERIAL_REQUIRED'],
    ['CUSTOMER_SUPPLIED', 'CUSTOMER_SUPPLIED_REQUIRED'],
  ] as const)(
    'preserves authoritative %s leaf demand',
    async (classification, demandStatus) => {
      const leaf = item(1, `${classification}-1`, 'PURCHASED');
      leaf.planningClassification = classification;
      if (classification === 'RAW_MATERIAL') leaf.vendorId = 99;
      const preview = await resolveProductionLaunchPreview(
        roots(leaf.partNumber, 4),
        source({ inventory: [leaf], boms: {}, lines: {}, routings: {} })
      );
      expect(preview.ready).toBe(true);
      expect(preview.nodes[0]).toMatchObject({
        classification,
        demandStatus,
        extendedProjectQuantity: 4,
        routingId: null,
      });
    }
  );

  it.each([
    ['BOM_INACTIVE', { isActive: false }],
    ['BOM_NOT_RELEASED', { isReleased: false }],
    ['BOM_NOT_EFFECTIVE', { isEffective: false }],
  ] as const)(
    'distinguishes %s BOM authority failures',
    async (code, state) => {
      const fixture: Fixture = {
        inventory: [item(1, 'MAKE-STATE', 'MANUFACTURED')],
        boms: {
          'MAKE-STATE': [
            { bomId: 'bom', revisionId: 'rev', revision: 'A', ...state },
          ],
        },
        lines: {},
        routings: { 'MAKE-STATE': [routing('route')] },
      };
      const preview = await resolveProductionLaunchPreview(
        roots('MAKE-STATE'),
        source(fixture)
      );
      expect(preview.blockers).toContainEqual(
        expect.objectContaining({ code })
      );
    }
  );

  it('fails closed when only a live routing lacks provable effectivity', async () => {
    const fixture: Fixture = {
      inventory: [item(1, 'MAKE-LIVE-ROUTE', 'MANUFACTURED')],
      boms: {
        'MAKE-LIVE-ROUTE': [{ bomId: 'bom', revisionId: 'rev', revision: 'A' }],
      },
      lines: {
        rev: [{ id: 'leaf', childPartNumber: 'BUY', quantityPerParent: 1 }],
      },
      routings: {
        'MAKE-LIVE-ROUTE': [{ ...routing('live-route'), precedence: 3 }],
      },
    };
    fixture.inventory.push(item(2, 'BUY', 'PURCHASED'));
    const preview = await resolveProductionLaunchPreview(
      roots('MAKE-LIVE-ROUTE'),
      source(fixture)
    );
    expect(preview.blockers).toContainEqual(
      expect.objectContaining({ code: 'ROUTING_EFFECTIVITY_UNRESOLVED' })
    );
    expect(preview.nodes[0].firstDepartment).toBeNull();
  });

  it('blocks an empty released routing rather than defaulting to Layup', async () => {
    const fixture: Fixture = {
      inventory: [item(1, 'MAKE-EMPTY-ROUTE', 'MANUFACTURED')],
      boms: {
        'MAKE-EMPTY-ROUTE': [
          { bomId: 'bom', revisionId: 'rev', revision: 'A' },
        ],
      },
      lines: {
        rev: [{ id: 'buy', childPartNumber: 'BUY-LEAF', quantityPerParent: 1 }],
      },
      routings: { 'MAKE-EMPTY-ROUTE': [routing('route-empty', [])] },
    };
    fixture.inventory.push(item(2, 'BUY-LEAF', 'PURCHASED'));
    const preview = await resolveProductionLaunchPreview(
      roots('MAKE-EMPTY-ROUTE'),
      source(fixture)
    );
    expect(preview.blockers).toContainEqual(
      expect.objectContaining({ code: 'ROUTING_EMPTY' })
    );
    expect(preview.nodes[0].firstDepartment).toBeNull();
  });

  it('blocks a released manufactured BOM with no component lines', async () => {
    const fixture: Fixture = {
      inventory: [item(1, 'EMPTY-BOM', 'MANUFACTURED')],
      boms: {
        'EMPTY-BOM': [{ bomId: 'bom', revisionId: 'rev', revision: 'A' }],
      },
      lines: { rev: [] },
      routings: { 'EMPTY-BOM': [routing('route')] },
    };
    const preview = await resolveProductionLaunchPreview(
      roots('EMPTY-BOM'),
      source(fixture)
    );
    expect(preview.blockers).toContainEqual(
      expect.objectContaining({ code: 'BOM_EMPTY' })
    );
  });
});
