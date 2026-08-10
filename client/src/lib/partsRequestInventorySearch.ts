export type PartsRequestInventorySearchItem = {
  agPartNumber?: string | null;
  supplierPartNumber?: string | null;
  name?: string | null;
};

export function normalizePartsRequestInventorySearch(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function filterPartsRequestInventoryItems<
  T extends PartsRequestInventorySearchItem,
>(items: T[], query: string): T[] {
  const normalizedQuery = normalizePartsRequestInventorySearch(query);
  if (!normalizedQuery) return items;

  return items
    .map((item, index) => {
      const agPartNumber = normalizePartsRequestInventorySearch(item.agPartNumber);
      const supplierPartNumber = normalizePartsRequestInventorySearch(
        item.supplierPartNumber
      );
      const name = normalizePartsRequestInventorySearch(item.name);

      let rank = Number.POSITIVE_INFINITY;
      if (agPartNumber === normalizedQuery) rank = 0;
      else if (supplierPartNumber === normalizedQuery) rank = 1;
      else if (agPartNumber.startsWith(normalizedQuery)) rank = 2;
      else if (supplierPartNumber.startsWith(normalizedQuery)) rank = 3;
      else if (agPartNumber.includes(normalizedQuery)) rank = 4;
      else if (supplierPartNumber.includes(normalizedQuery)) rank = 5;
      else if (name.includes(normalizedQuery)) rank = 6;

      return { item, index, rank };
    })
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.item);
}
