import { describe, expect, it } from 'vitest';
import { buildProjectBomAssemblyTree, collectManufacturedBomParts, collectPurchasedBomParts, type ProjectBomAssemblyRow } from '../src/services/projectBomAssembly';

const row = (overrides: Partial<ProjectBomAssemblyRow>): ProjectBomAssemblyRow => ({
  node_key: ['root:1000'],
  parent_key: null,
  root_part_number: '1000',
  part_number: '1000',
  part_name: 'Final assembly',
  inventory_item_id: 1000,
  item_type: 'MANUFACTURED',
  qty_per: 1,
  operation_seq: null,
  depth: 0,
  bom_id: 'bom-root',
  latest_revision_id: 'rev-root',
  ...overrides,
});

describe('buildProjectBomAssemblyTree', () => {
  it('nests manufactured child BOMs and leaf components in assembly order', () => {
    const tree = buildProjectBomAssemblyTree([
      row({
        node_key: ['root:1000', 'line:2'],
        parent_key: ['root:1000'],
        part_number: '3000',
        part_name: 'Purchased fastener',
        inventory_item_id: 3000,
        item_type: 'PURCHASED',
        qty_per: '4',
        operation_seq: 20,
        depth: 1,
        bom_id: null,
        latest_revision_id: null,
      }),
      row({}),
      row({
        node_key: ['root:1000', 'line:1'],
        parent_key: ['root:1000'],
        part_number: '2000',
        part_name: 'Manufactured child',
        inventory_item_id: 2000,
        item_type: 'MANUFACTURED',
        qty_per: '2',
        operation_seq: 10,
        depth: 1,
        bom_id: 'bom-child',
        latest_revision_id: 'rev-child',
      }),
      row({
        node_key: ['root:1000', 'line:1', 'line:3'],
        parent_key: ['root:1000', 'line:1'],
        part_number: '4000',
        part_name: 'Child material',
        inventory_item_id: 4000,
        item_type: 'PURCHASED',
        qty_per: '3',
        operation_seq: 10,
        depth: 2,
        bom_id: null,
        latest_revision_id: null,
      }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].partNumber).toBe('1000');
    expect(tree[0].children.map((child) => child.partNumber)).toEqual(['2000', '3000']);
    expect(tree[0].children[0]).toMatchObject({ isManufactured: true, hasBom: true, quantityPerParent: 2 });
    expect(tree[0].children[0].children[0]).toMatchObject({ partNumber: '4000', isManufactured: false });
  });

  it('does not treat a non-inventory BOM node as manufactured', () => {
    const tree = buildProjectBomAssemblyTree([row({ inventory_item_id: null, item_type: null })]);
    expect(tree[0]).toMatchObject({ isInventoryItem: false, isManufactured: false, hasBom: true });
  });

  it('collects every purchased BOM component and extends quantities through the assembly tree', () => {
    const tree = buildProjectBomAssemblyTree([
      row({}),
      row({
        node_key: ['root:1000', 'line:1'], parent_key: ['root:1000'], part_number: '2000',
        part_name: 'Manufactured child', inventory_item_id: 2000, item_type: 'MANUFACTURED', qty_per: 2, depth: 1, bom_id: 'bom-child',
      }),
      row({
        node_key: ['root:1000', 'line:1', 'line:2'], parent_key: ['root:1000', 'line:1'], part_number: 'BUY-1',
        part_name: 'Fastener', inventory_item_id: 3000, item_type: 'PURCHASED', qty_per: 3, depth: 2, bom_id: null,
      }),
      row({
        node_key: ['root:1000', 'line:3'], parent_key: ['root:1000'], part_number: 'BUY-1',
        part_name: 'Fastener', inventory_item_id: 3000, item_type: 'PURCHASED', qty_per: 1, depth: 1, bom_id: null,
      }),
    ]);

    expect(collectPurchasedBomParts(tree, new Map([['1000', 10]]))).toEqual([{
      id: 'bom-purchased:buy-1', part_number: 'BUY-1', part_name: 'Fastener',
      quantity: 70, bom_occurrence_count: 2,
    }]);

    expect(collectManufacturedBomParts(tree, new Map([['1000', 10]]))).toEqual([
      { id: 'bom-manufactured:1000', part_number: '1000', part_name: 'Final assembly', quantity: 10, bom_occurrence_count: 1 },
      { id: 'bom-manufactured:2000', part_number: '2000', part_name: 'Manufactured child', quantity: 20, bom_occurrence_count: 1 },
    ]);
  });

  it('preserves fractional BOM usage when calculating purchased material demand', () => {
    const tree = buildProjectBomAssemblyTree([
      row({}),
      row({
        node_key: ['root:1000', 'line:1'], parent_key: ['root:1000'], part_number: 'SHEET-1',
        part_name: 'Sheet material', inventory_item_id: 3000, item_type: 'PURCHASED', qty_per: '0.02', depth: 1, bom_id: null,
      }),
    ]);

    expect(collectPurchasedBomParts(tree, new Map([['1000', 110]]))).toEqual([{
      id: 'bom-purchased:sheet-1', part_number: 'SHEET-1', part_name: 'Sheet material',
      quantity: 2.2, bom_occurrence_count: 1,
    }]);
  });

  it('suppresses downstream raw-material demand covered by manufactured child inventory', () => {
    const tree = buildProjectBomAssemblyTree([
      row({}),
      row({
        node_key: ['root:1000', 'line:1'], parent_key: ['root:1000'], part_number: 'CHILD-1',
        part_name: 'Manufactured child', inventory_item_id: 2000, item_type: 'MANUFACTURED', qty_per: '1', depth: 1, bom_id: 'bom-child', latest_revision_id: 'rev-child',
      }),
      row({
        node_key: ['root:1000', 'line:1', 'line:2'], parent_key: ['root:1000', 'line:1'], part_number: 'RAW-1',
        part_name: 'Raw material', inventory_item_id: 3000, item_type: 'PURCHASED', qty_per: '0.5', depth: 2, bom_id: null, latest_revision_id: null,
      }),
    ]);

    expect(collectPurchasedBomParts(
      tree,
      new Map([['1000', 10]]),
      new Map([['child-1', 10]])
    )).toEqual([]);

    expect(collectPurchasedBomParts(
      tree,
      new Map([['1000', 10]]),
      new Map([['child-1', 4]])
    )).toMatchObject([{ part_number: 'RAW-1', quantity: 3 }]);
  });
});
