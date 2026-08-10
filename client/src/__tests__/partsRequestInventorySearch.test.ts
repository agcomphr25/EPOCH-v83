import { describe, expect, it } from 'vitest';

import {
  filterPartsRequestInventoryItems,
  normalizePartsRequestInventorySearch,
} from '@/lib/partsRequestInventorySearch';

const inventory = [
  { agPartNumber: '551e', name: 'Fiberglass horizontal stabilizer reinforcement' },
  { agPartNumber: '538', name: 'Zolatone Black', supplierPartNumber: '1807714' },
  { agPartNumber: '539', name: 'Zolatone Charcoal/Lilith Gray', supplierPartNumber: '1701096' },
  { agPartNumber: '79', name: 'Cups, 9 oz clear (short)' },
];

describe('parts request inventory search', () => {
  it('uses literal matching instead of loose character-sequence matching', () => {
    expect(filterPartsRequestInventoryItems(inventory, 'zola')).toEqual([
      inventory[1],
      inventory[2],
    ]);
  });

  it('ranks an exact AG part number ahead of name matches', () => {
    const items = [
      { agPartNumber: '1538', name: 'Part containing 538' },
      inventory[1],
    ];

    expect(filterPartsRequestInventoryItems(items, '538')[0]).toBe(inventory[1]);
  });

  it('ignores case, spaces, and punctuation', () => {
    expect(normalizePartsRequestInventorySearch(' Zola-tone / Black ')).toBe(
      'zolatoneblack'
    );
  });
});
