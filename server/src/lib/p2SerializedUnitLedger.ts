export type P2SerializedUnitBucket =
  | 'shipped'
  | 'finalization'
  | 'activeProduction'
  | 'scheduled';

export interface P2SerializedUnitLedgerRow {
  id?: string | null;
  serialNumber?: string | null;
  serial_number?: string | null;
  status?: string | null;
  currentDepartment?: string | null;
  current_department?: string | null;
  finalizedAt?: string | Date | null;
  finalized_at?: string | Date | null;
}

export interface P2SerializedUnitLedger {
  shipped: number;
  finalization: number;
  activeProduction: number;
  scheduled: number;
  missing: number;
  productionPipeline: number;
  total: number;
  accounted: number;
  missingSerialSlots: string[];
  bucketBySerial: Map<string, P2SerializedUnitBucket>;
}

const normalized = (value: unknown) => String(value ?? '').trim().toUpperCase();

const serialKey = (row: P2SerializedUnitLedgerRow) =>
  normalized(row.serialNumber ?? row.serial_number);

const department = (row: P2SerializedUnitLedgerRow) =>
  normalized(row.currentDepartment ?? row.current_department)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const isScheduledDepartment = (value: string) =>
  value === 'LAYUP' || value === 'SCHEDULED';

const isExcludedHistoricalRecord = (row: P2SerializedUnitLedgerRow) => {
  const status = normalized(row.status);
  const dept = department(row);
  return dept === 'INVENTORY'
    && ['COMPLETE', 'COMPLETED', 'CLOSED'].includes(status);
};

const classify = (
  row: P2SerializedUnitLedgerRow,
  shippedItemIds: ReadonlySet<string>,
): P2SerializedUnitBucket | null => {
  const id = String(row.id ?? '').trim().toLowerCase();
  if (id && shippedItemIds.has(id)) return 'shipped';

  if (row.finalizedAt ?? row.finalized_at) return 'finalization';
  if (isExcludedHistoricalRecord(row)) return null;

  const status = normalized(row.status);
  const dept = department(row);
  if (['SCRAP', 'SCRAPPED', 'CANCELED', 'CANCELLED', 'VOID'].includes(status)) {
    return null;
  }
  if (dept === 'PENDING LAYUP') return null;
  if (isScheduledDepartment(dept)) return 'scheduled';
  if (
    dept
    && !['INVENTORY', 'SHIPPED', 'SHIPPING', 'CLOSED'].includes(dept)
    && !['PENDING', 'SCHEDULED', 'COMPLETE', 'COMPLETED', 'CLOSED', 'SHIPPED'].includes(status)
  ) {
    return 'activeProduction';
  }
  return null;
};

const bucketP2SerializedUnits = (
  rows: readonly P2SerializedUnitLedgerRow[],
  shippedItemIds: Iterable<string>,
) => {
  const shippedIds = new Set(
    Array.from(shippedItemIds, (id) => String(id).trim().toLowerCase())
      .filter(Boolean),
  );
  const bucketBySerial = new Map<string, P2SerializedUnitBucket>();
  const precedence: Record<P2SerializedUnitBucket, number> = {
    shipped: 4,
    finalization: 3,
    activeProduction: 2,
    scheduled: 1,
  };
  for (const row of rows) {
    const serial = serialKey(row);
    if (!serial) continue;
    const bucket = classify(row, shippedIds);
    if (!bucket) continue;
    const existing = bucketBySerial.get(serial);
    if (!existing || precedence[bucket] > precedence[existing]) {
      bucketBySerial.set(serial, bucket);
    }
  }
  return bucketBySerial;
};

export function countP2LedgerAccountedUnits(
  rows: readonly P2SerializedUnitLedgerRow[],
  shippedItemIds: Iterable<string>,
): number {
  return bucketP2SerializedUnits(rows, shippedItemIds).size;
}

export function buildP2SerializedUnitLedger(
  orderedQuantity: number,
  rows: readonly P2SerializedUnitLedgerRow[],
  shippedSerializedItemIds: Iterable<string>,
): P2SerializedUnitLedger {
  const total = Math.max(0, Math.trunc(Number(orderedQuantity) || 0));
  // A serial can have historical duplicate rows. Evaluate every row and retain
  // only the highest-precedence legitimate state for that physical unit.
  const bucketBySerial = bucketP2SerializedUnits(rows, shippedSerializedItemIds);

  const counts = {
    shipped: 0,
    finalization: 0,
    activeProduction: 0,
    scheduled: 0,
  };
  for (const bucket of bucketBySerial.values()) counts[bucket] += 1;

  const accounted = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (accounted > total) {
    // Over-allocation: more serialized units exist than were ordered (e.g. PO was
    // revised down after production started). Treat missing as 0 and continue —
    // the caller sees the real counts and can surface the discrepancy in the UI.
    console.warn(
      `[p2SerializedUnitLedger] Over-allocation on PO: ${accounted} bucketed units exceed ordered quantity ${total}`,
    );
  }
  const missing = Math.max(0, total - accounted);

  return {
    ...counts,
    missing,
    productionPipeline: counts.activeProduction + counts.scheduled,
    total,
    accounted,
    missingSerialSlots: Array.from(
      { length: missing },
      (_, index) => `MISSING-${String(index + 1).padStart(3, '0')}`,
    ),
    bucketBySerial,
  };
}
