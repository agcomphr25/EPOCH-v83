export function parseP1POUnitOrderId(orderId: string): {
  poNumber: string;
  poItemId: number;
  unitNumber: number;
} | null {
  if (!orderId.startsWith('PO-')) return null;

  const parts = orderId.split('-');
  if (parts.length < 4) return null;

  const unitPart = parts.at(-1) ?? '';
  const itemPart = parts.at(-2) ?? '';
  const poNumber = parts.slice(1, -2).join('-');

  if (!poNumber || !/^\d+$/.test(itemPart) || !/^\d+$/.test(unitPart)) {
    return null;
  }

  const unitNumber = Number.parseInt(unitPart, 10);
  const poItemId = Number.parseInt(itemPart, 10);

  return { poNumber, poItemId, unitNumber };
}
