import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../components/inventory/InventoryItemsCard.tsx', import.meta.url),
  'utf8'
);

describe('enhanced MRP global inventory search', () => {
  it('evaluates the shared query against purchased and manufactured items', () => {
    expect(source).toContain('filterSearchResults(purchasedItems)');
    expect(source).toContain('filterSearchResults(manufacturedItems)');
    expect(source).toContain('Searching both categories:');
  });

  it('opens the other category when it is the only category with matches', () => {
    expect(source).toContain("purchasedSearchResults.length === 0 && manufacturedSearchResults.length > 0");
    expect(source).toContain("manufacturedSearchResults.length === 0 && purchasedSearchResults.length > 0");
    expect(source).toContain("setActiveTab('manufactured')");
    expect(source).toContain("setActiveTab('purchased')");
  });
});
