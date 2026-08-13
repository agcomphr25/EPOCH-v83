import { describe, expect, it } from 'vitest';
import type { ProjectBomAssemblyNode } from '../src/services/projectBomAssembly';
import { buildProjectProductionHierarchy } from '../src/services/projectProductionHierarchy';

const node = (
  key: string,
  partNumber: string,
  isManufactured: boolean,
  children: ProjectBomAssemblyNode[] = []
): ProjectBomAssemblyNode => ({
  key,
  partNumber,
  partName: partNumber,
  quantityPerParent: 1,
  operationSequence: null,
  depth: key.split('/').length - 1,
  isManufactured,
  hasBom: children.length > 0,
  bomId: children.length > 0 ? `${partNumber}-bom` : null,
  bomCode: null,
  revisionId: null,
  revisionCode: null,
  children,
});

describe('buildProjectProductionHierarchy', () => {
  it('separates the assembly, manufactured children, and purchased material', () => {
    const root = node('pitot', 'HEATED-PITOT', true, [
      node('pitot/body', 'PITOT-BODY', true),
      node('pitot/manifold', 'MANIFOLD', true),
      node('pitot/heater', 'HEATER-CARTRIDGE', false),
    ]);
    const productionOrders = [
      ...Array.from({ length: 150 }, (_, index) => ({
        id: `body-${index}`,
        sku: 'PITOT-BODY',
        quantity: 1,
        quantity_manufactured: 0,
        department: 'CNC',
      })),
      ...Array.from({ length: 150 }, (_, index) => ({
        id: `manifold-${index}`,
        sku: 'MANIFOLD',
        quantity: 1,
        quantity_manufactured: 0,
        department: 'CNC',
      })),
    ];

    const result = buildProjectProductionHierarchy({
      root,
      orderedQuantity: 150,
      workOrders: [{ id: 1, partNumber: 'HEATED-PITOT', quantity: 150 }],
      productionOrders,
    });

    expect(result?.sourceType).toBe('ASSEMBLY_WORK_ORDER');
    expect(result?.requiredQuantity).toBe(150);
    expect(result?.workOrders).toHaveLength(1);
    expect(result?.children).toMatchObject([
      {
        partNumber: 'PITOT-BODY',
        sourceType: 'MANUFACTURED_WORK_ORDER',
        requiredQuantity: 150,
        productionDemand: {
          recordCount: 150,
          totalQuantity: 150,
          legacyUnitRows: true,
          departments: ['CNC'],
        },
      },
      {
        partNumber: 'MANIFOLD',
        sourceType: 'MANUFACTURED_WORK_ORDER',
        requiredQuantity: 150,
        productionDemand: {
          recordCount: 150,
          totalQuantity: 150,
          legacyUnitRows: true,
          departments: ['CNC'],
        },
      },
      {
        partNumber: 'HEATER-CARTRIDGE',
        sourceType: 'PURCHASED_MATERIAL',
        requiredQuantity: 150,
        productionDemand: { recordCount: 0 },
      },
    ]);
  });

  it('multiplies nested BOM quantities without inventing work orders', () => {
    const child = node('assembly/child', 'CHILD', true);
    child.quantityPerParent = 2;
    const result = buildProjectProductionHierarchy({
      root: node('assembly', 'ASSEMBLY', true, [child]),
      orderedQuantity: 10,
      workOrders: [],
      productionOrders: [],
    });

    expect(result?.children[0].requiredQuantity).toBe(20);
    expect(result?.children[0].workOrders).toEqual([]);
  });
});
