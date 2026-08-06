import {
  buildP2SerializedUnitLedger,
  countP2LedgerAccountedUnits,
  type P2SerializedUnitLedgerRow,
} from './p2SerializedUnitLedger';

const normalized = (value: unknown) => String(value ?? '').trim().toUpperCase();

type P2ReplacementMetadataRow = { metadata?: unknown };

export function isP2RmaReplacement(row: P2ReplacementMetadataRow): boolean {
  if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) {
    return false;
  }
  const metadata = row.metadata as Record<string, unknown>;
  return metadata.isReplacement === true
    && (metadata.rmaRequired === true || metadata.nonconformingRmaId != null);
}

export function partitionP2PendingRmaReplacements<T extends P2ReplacementMetadataRow>(
  rows: readonly T[],
): { demandPending: T[]; rmaReplacements: T[] } {
  const demandPending: T[] = [];
  const rmaReplacements: T[] = [];
  for (const row of rows) {
    (isP2RmaReplacement(row) ? rmaReplacements : demandPending).push(row);
  }
  return { demandPending, rmaReplacements };
}

export const isHistoricalP2Unit = (row: P2SerializedUnitLedgerRow) =>
  ['SCRAP', 'SCRAPPED', 'CANCELED', 'CANCELLED', 'VOID'].includes(normalized(row.status));

export function countDistinctP2SerializedUnits(
  rows: readonly P2SerializedUnitLedgerRow[],
  shippedItemIds: ReadonlySet<string>,
): number {
  const identities = new Set<string>();
  for (const row of rows) {
    if (isP2RmaReplacement(row)) continue;
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
  if (isP2RmaReplacement(row)) return false;
  return buildP2SerializedUnitLedger(1, [row], shippedItemIds).accounted > 0;
}

export function countDistinctP2DemandUnits(
  rows: readonly P2SerializedUnitLedgerRow[],
  shippedItemIds: ReadonlySet<string>,
): number {
  return countP2LedgerAccountedUnits(
    rows.filter((row) => !isP2RmaReplacement(row)),
    shippedItemIds,
  );
}
