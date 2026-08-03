import type { P2SerializedUnitLedgerRow } from './p2SerializedUnitLedger';

const normalized = (value: unknown) => String(value ?? '').trim().toUpperCase();

export function countDistinctP2PendingUnits(
  rows: readonly P2SerializedUnitLedgerRow[],
): number {
  const identities = new Set<string>();
  for (const row of rows) {
    if (normalized(row.status) !== 'ACTIVE') continue;
    const department = normalized(row.currentDepartment ?? row.current_department);
    if (department !== '' && department !== 'PENDING LAYUP') continue;
    const serial = normalized(row.serialNumber ?? row.serial_number);
    const id = String(row.id ?? '').trim().toLowerCase();
    if (serial || id) identities.add(serial || `ID:${id}`);
  }
  return identities.size;
}

export function isP2PhysicalProjectWorkOrder(row: {
  workOrderNumber?: unknown;
  wadStatus?: unknown;
}): boolean {
  return !normalized(row.workOrderNumber).startsWith('WAD-')
    && normalized(row.wadStatus) === '';
}
