import { describe, expect, it } from 'vitest';
import { buildProjectBomAssemblyTree, type ProjectBomAssemblyRow } from '../src/services/projectBomAssembly';

const row = (overrides: Partial<ProjectBomAssemblyRow>): ProjectBomAssemblyRow => ({
  node_key: ['root:1000'],
  parent_key: null,
  root_part_number: '1000',
  part_number: '1000',
  part_name: 'Final assembly',
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

  it('treats a part with a BOM as manufactured when inventory classification is absent', () => {
    const tree = buildProjectBomAssemblyTree([row({ item_type: null })]);
    expect(tree[0]).toMatchObject({ isManufactured: true, hasBom: true });
  });
});
