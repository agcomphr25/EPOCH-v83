import {
  buildP2SerializedUnitLedger,
  countP2LedgerAccountedUnits,
  type P2SerializedUnitLedgerRow,
} from './p2SerializedUnitLedger';

const normalized = (value: unknown) => String(value ?? '').trim().toUpperCase();

export const isHistoricalP2Unit = (row: P2SerializedUnitLedgerRow) =>
  ['SCRAP', 'SCRAPPED', 'CANCELED', 'CANCELLED', 'VOID'].includes(normalized(row.status));

export function countDistinctP2SerializedUnits(
  rows: readonly P2SerializedUnitLedgerRow[],
  shippedItemIds: ReadonlySet<string>,
): number {
  const identities = new Set<string>();
  for (const row of rows) {
    if (isHistoricalP2Unit(row)) continue;
    const status = normalized(row.status);
    const department = normalized(row.currentDepartment ?? row.current_department);
    const isSchedulablePending = status === 'ACTIVE'
      && (department === '' || department === 'PENDING LAYUP');
    if (!isSchedulablePending && !p2UnitConsumesOrderedDemand(row, shippedItemIds)) {
      continue;
    }
    const serial = normalized(row.serialNumber ?? row.serial_number);
    const id = String(row.id ?? '').trim().toLowerCase();
    if (serial || id) identities.add(serial || `ID:${id}`);
  }
  return identities.size;
}

export function p2PendingUnitDeficit(
  orderedQuantity: number,
  consumedQuantity: number,
  existingPendingQuantity: number,
): number {
  const earlyStageCapacity = Math.max(0, orderedQuantity - consumedQuantity);
  return Math.max(0, earlyStageCapacity - existingPendingQuantity);
}

export function p2UnitConsumesOrderedDemand(
  row: P2SerializedUnitLedgerRow,
  shippedItemIds: ReadonlySet<string>,
): boolean {
  return buildP2SerializedUnitLedger(1, [row], shippedItemIds).accounted > 0;
}

export function countDistinctP2DemandUnits(
  rows: readonly P2SerializedUnitLedgerRow[],
  shippedItemIds: ReadonlySet<string>,
): number {
  return countP2LedgerAccountedUnits(rows, shippedItemIds);
}
