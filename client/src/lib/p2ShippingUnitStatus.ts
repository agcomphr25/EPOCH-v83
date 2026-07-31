export interface P2ShippingUnitStatusInput {
  status?: string | null;
  currentDepartment?: string | null;
  finalizedAt?: string | Date | null;
}

const normalized = (value: unknown) => String(value ?? '').trim().toUpperCase();

export function isHistoricalP2InventoryUnit(unit: P2ShippingUnitStatusInput): boolean {
  return normalized(unit.currentDepartment) === 'INVENTORY'
    && ['COMPLETE', 'COMPLETED', 'CLOSED'].includes(normalized(unit.status))
    && !unit.finalizedAt;
}
