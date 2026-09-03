import { describe, expect, it } from 'vitest';

import { getAveryLabelPlacements } from './averyLabelPlacement';

describe('getAveryLabelPlacements', () => {
  it('fills an unused sheet in normal cell order', () => {
    expect(getAveryLabelPlacements(3, 30)).toEqual([
      { pageNumber: 0, cellIndex: 0 },
      { pageNumber: 0, cellIndex: 1 },
      { pageNumber: 0, cellIndex: 2 },
    ]);
  });

  it('skips selected cells on the first sheet', () => {
    expect(getAveryLabelPlacements(3, 10, [0, 2, 4])).toEqual([
      { pageNumber: 0, cellIndex: 1 },
      { pageNumber: 0, cellIndex: 3 },
      { pageNumber: 0, cellIndex: 5 },
    ]);
  });

  it('continues on a fresh sheet after remaining first-sheet cells are filled', () => {
    const placements = getAveryLabelPlacements(4, 3, [0, 1]);
    expect(placements).toEqual([
      { pageNumber: 0, cellIndex: 2 },
      { pageNumber: 1, cellIndex: 0 },
      { pageNumber: 1, cellIndex: 1 },
      { pageNumber: 1, cellIndex: 2 },
    ]);
  });

  it('ignores duplicate and invalid skipped cells', () => {
    expect(getAveryLabelPlacements(2, 3, [-1, 0, 0, 3, 1.5])).toEqual([
      { pageNumber: 0, cellIndex: 1 },
      { pageNumber: 0, cellIndex: 2 },
    ]);
  });
});
