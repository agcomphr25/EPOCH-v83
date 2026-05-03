/**
 * Helpers for building packing slip content.
 */

import type { PackingSlipItem } from '../../utils/pdf/types';

export interface PoItemDescriptionFields {
  stockModelName?: string | null;
  itemName?: string | null;
  stockModelId?: string | null;
}

/**
 * Resolves the human-readable description for a packing slip line item.
 *
 * Priority:
 *   1. stockModelName  — the configured display name for the stock model
 *   2. itemName        — the PO line item name entered by the operator
 *   3. stockModelId    — the raw database identifier (last resort)
 *   4. 'N/A'           — nothing available
 *
 * stockModelId should never appear on printed slips; it is an internal
 * identifier (e.g. "mesa_universal") that is meaningless to customers.
 */
export function resolvePackingSlipDescription(poItem: PoItemDescriptionFields): string {
  return (
    poItem.stockModelName ||
    poItem.itemName ||
    poItem.stockModelId ||
    'N/A'
  );
}

export interface GroupItemForSlip {
  poItem: PoItemDescriptionFields;
  order?: {
    unitNumber?: number | string | null;
    orderId?: string | null;
  } | null;
  quantity?: number | null;
}

export interface SlipItemOptions {
  partNumber?: string;
  weeklyBoxNumber?: string;
  shipmentNumber?: string;
}

function extractUnitNumber(item: GroupItemForSlip): number {
  const rawUnit =
    item.order?.unitNumber ||
    (() => {
      if (!item.order?.orderId) return 1;
      const unitMatch = item.order.orderId.match(/-(\d+)$/);
      return unitMatch ? parseInt(unitMatch[1]) : 1;
    })();
  return typeof rawUnit === 'number' ? rawUnit : parseInt(String(rawUnit), 10) || 1;
}

function computeStickerRange(unitNumbers: number[]): string {
  if (unitNumbers.length === 0) return '';
  const min = Math.min(...unitNumbers);
  const max = Math.max(...unitNumbers);
  return min === max ? String(min) : `${min}-${max}`;
}

/**
 * Groups an array of order items by their resolved description, producing one
 * PackingSlipItem per distinct description. Items sharing the same description
 * are merged: quantities are summed and unit numbers are collapsed into a
 * sticker range (e.g. "1-3").
 *
 * Insertion order of the first occurrence of each description is preserved.
 */
export function groupItemsByDescription(
  items: GroupItemForSlip[],
  options: SlipItemOptions = {}
): PackingSlipItem[] {
  const groups = new Map<string, { unitNumbers: number[]; totalQty: number }>();

  for (const item of items) {
    const desc = resolvePackingSlipDescription(item.poItem);
    const unitNum = extractUnitNumber(item);
    const qty = item.quantity ?? 1;

    if (!groups.has(desc)) {
      groups.set(desc, { unitNumbers: [], totalQty: 0 });
    }
    const group = groups.get(desc)!;
    group.unitNumbers.push(unitNum);
    group.totalQty += qty;
  }

  const result: PackingSlipItem[] = [];
  for (const [desc, { unitNumbers, totalQty }] of groups.entries()) {
    result.push({
      partNumber: options.partNumber,
      description: desc,
      contents: desc,
      stickerRange: computeStickerRange(unitNumbers),
      quantity: totalQty,
      weeklyBoxNumber: options.weeklyBoxNumber,
      shipmentNumber: options.shipmentNumber,
    });
  }

  return result;
}
