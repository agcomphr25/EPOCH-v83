import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execute } = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock('../db', () => ({
  db: { execute },
}));

import { buildBOMTree } from '../src/db/queries/bom';

describe('buildBOMTree manufactured child cost rollup', () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it('uses the latest child revision when the manufactured child has no released revision', async () => {
    execute
      .mockResolvedValueOnce([{ // Root revision lines
        id: 'root-line',
        child_part_ag_number: '26246',
        qty_per: 1,
        scrap_pct: 0,
        uom: 'EA',
        operation_seq: 10,
        reference: null,
        notes: null,
        sku: '26246',
        name: 'Body, Heated Pitot',
        unit_cost: 0,
      }])
      .mockResolvedValueOnce([]) // No released child revision
      .mockResolvedValueOnce([{ rev_id: 'child-revision' }]) // Latest child revision
      .mockResolvedValueOnce([{ // Child revision lines
        id: 'child-line',
        child_part_ag_number: '26251',
        qty_per: 0.25,
        scrap_pct: 0,
        uom: 'EA',
        operation_seq: 10,
        reference: null,
        notes: null,
        sku: '26251',
        name: '6061 Aluminum Rod',
        unit_cost: 22.35,
      }])
      .mockResolvedValueOnce([]) // No released leaf BOM
      .mockResolvedValueOnce([]); // No latest leaf BOM

    const tree = await buildBOMTree('root-revision');

    expect(tree.totalCost).toBeCloseTo(5.5875);
    expect(tree.children[0]).toMatchObject({
      type: 'assembly',
      partId: '26246',
      unitCost: 5.5875,
      extendedCost: 5.5875,
    });
    expect(tree.children[0].children[0]).toMatchObject({
      type: 'component',
      partId: '26251',
      extendedCost: 5.5875,
    });
  });
});
