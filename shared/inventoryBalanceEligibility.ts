export type InventoryBalanceEligibilityItem = {
  utilizedInNonInventory?: boolean | null;
  utilizedInCustomerSupplied?: boolean | null;
  utilizedInServices?: boolean | null;
  type?: string | null;
};

export function isServiceInventoryItem(item: InventoryBalanceEligibilityItem | null | undefined): boolean {
  if (!item) return false;
  const looseType = (item.type || '').trim().toLowerCase();
  return item.utilizedInServices === true || looseType === 'service' || looseType === 'services';
}

/**
 * Authoritative application rule for ordinary inventory-balance eligibility.
 * Customer-supplied items intentionally remain eligible for custody tracking.
 */
export function isInventoryBalanceEligible(
  item: InventoryBalanceEligibilityItem | null | undefined
): boolean {
  return Boolean(item) && item?.utilizedInNonInventory !== true && !isServiceInventoryItem(item);
}

export function inventoryBalanceIneligibilityReason(
  item: InventoryBalanceEligibilityItem | null | undefined
): 'NON_INVENTORY' | 'SERVICE' | 'ITEM_NOT_FOUND' | null {
  if (!item) return 'ITEM_NOT_FOUND';
  if (item.utilizedInNonInventory === true) return 'NON_INVENTORY';
  if (isServiceInventoryItem(item)) return 'SERVICE';
  return null;
}
