export type P2CuttingDemandRow = {
  poItemId: unknown;
  originalQuantity: unknown;
  shippedQuantity: unknown;
  committedQuantity: unknown;
  [key: string]: unknown;
};

export function reconcileP2CuttingDemandWithShipmentLedger<T extends P2CuttingDemandRow>(
  rows: readonly T[],
  shippedByPoItem: ReadonlyMap<number, number>,
): T[] {
  return rows.flatMap((row) => {
    const poItemId = Number(row.poItemId);
    const originalQuantity = Math.max(0, Number(row.originalQuantity) || 0);
    const ledgerShippedQuantity = Number.isFinite(poItemId)
      ? Math.max(0, shippedByPoItem.get(poItemId) || 0)
      : 0;
    if (originalQuantity > 0 && ledgerShippedQuantity >= originalQuantity) return [];

    // Keep the existing line-level calculation for partially shipped demand. Shipment
    // membership and packet commitment can temporarily refer to the same active unit,
    // so combining them here would risk subtracting one unit twice.
    return [row];
  });
}
