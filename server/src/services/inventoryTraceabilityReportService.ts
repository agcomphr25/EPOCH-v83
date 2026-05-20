import { pgPool } from '../../db';

export interface InventoryTraceabilityReportFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  exceptionOnly?: string;
}

type Severity = 'info' | 'warning' | 'critical';

export interface InventoryTraceabilityReport {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    status: string | null;
    exceptionOnly: boolean;
  };
  summary: {
    totalLots: number;
    icnCoveredLots: number;
    icnCoveragePercent: number;
    receiptEvents: number;
    issueEvents: number;
    moveEvents: number;
    splitEvents: number;
    linkedWorkOrders: number;
    zeroQuantityExceptions: number;
    negativeQuantityExceptions: number;
    fifoExceptions: number;
    fefoExceptions: number;
    splitLineageExceptions: number;
  };
  lots: Array<{
    id: string;
    internalControlNumber: string | null;
    materialPartNumber: string;
    materialName: string;
    supplier: string;
    supplierLotNumber: string | null;
    purchaseOrderNumber: string | null;
    receivingRecordNumber: string | null;
    receivedQty: number;
    remainingQty: number;
    unitOfMeasure: string;
    status: string;
    storageLocation: string | null;
    receivedAt: string | null;
    expirationDate: string | null;
    parentLotId: string | null;
    parentIcn: string | null;
    childLotCount: number;
    receiptCount: number;
    issueCount: number;
    moveCount: number;
    splitCount: number;
    adjustmentCount: number;
    consumptionCount: number;
    linkedTravelerCount: number;
    linkedWorkOrderCount: number;
    workOrderNumbers: string;
    latestTransactionAt: string | null;
    latestTransactionType: string | null;
    fifoException: boolean;
    fefoException: boolean;
    zeroQuantityException: boolean;
    negativeQuantityException: boolean;
    splitLineageException: boolean;
    flags: string[];
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    lotId: string | null;
    internalControlNumber: string | null;
  }>;
}

const STATUSES = new Set(['RECEIVED', 'QUARANTINE', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'ISSUED', 'CONSUMED', 'SCRAPPED', 'HOLD', 'LOCKED']);

function parseDateFilter(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be in YYYY-MM-DD format`);
  }
  return value;
}

function parseStatus(value: string | undefined): string | undefined {
  if (!value || value === 'all') return undefined;
  const normalized = value.toUpperCase();
  if (!STATUSES.has(normalized)) throw new Error('status is invalid');
  return normalized;
}

function parseBoolean(value: string | undefined): boolean {
  return value === 'true' || value === '1' || value === 'yes';
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateOnly(value: Date | string | null | undefined): string | null {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function addException(
  exceptions: InventoryTraceabilityReport['exceptions'],
  severity: Severity,
  exceptionType: string,
  message: string,
  lotId: string | null,
  internalControlNumber: string | null,
) {
  exceptions.push({ severity, exceptionType, message, lotId, internalControlNumber });
}

export async function getInventoryTraceabilityReport(
  filters: InventoryTraceabilityReportFilters = {},
): Promise<InventoryTraceabilityReport> {
  const startDate = parseDateFilter(filters.startDate, 'startDate');
  const endDate = parseDateFilter(filters.endDate, 'endDate');
  const status = parseStatus(filters.status);
  const exceptionOnly = parseBoolean(filters.exceptionOnly);

  const params: unknown[] = [];
  const clauses: string[] = [];
  if (startDate) {
    params.push(startDate);
    clauses.push(`ml.received_at::date >= $${params.length}::date`);
  }
  if (endDate) {
    params.push(endDate);
    clauses.push(`ml.received_at::date <= $${params.length}::date`);
  }
  if (status) {
    params.push(status);
    clauses.push(`ml.status = $${params.length}::text`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rowsSql = `
    WITH tx AS (
      SELECT
        material_lot_id,
        COUNT(*) FILTER (WHERE transaction_type = 'RECEIVE')::int AS receipt_count,
        COUNT(*) FILTER (WHERE transaction_type IN ('ISSUE', 'SCRAP', 'RETURN'))::int AS issue_count,
        COUNT(*) FILTER (WHERE transaction_type IN ('MOVE', 'OUT_START', 'OUT_END'))::int AS move_count,
        COUNT(*) FILTER (WHERE transaction_type = 'SPLIT')::int AS split_count,
        COUNT(*) FILTER (WHERE transaction_type = 'ADJUST')::int AS adjustment_count,
        (ARRAY_AGG(transaction_type ORDER BY performed_at DESC NULLS LAST))[1] AS latest_transaction_type,
        MAX(performed_at) AS latest_transaction_at
      FROM material_lot_transactions
      GROUP BY material_lot_id
    ),
    consumption AS (
      SELECT
        tmc.material_lot_id,
        COUNT(*)::int AS consumption_count,
        COUNT(DISTINCT tmc.traveler_id)::int AS linked_traveler_count,
        COUNT(DISTINCT pwo.id)::int AS linked_work_order_count,
        COALESCE(STRING_AGG(DISTINCT pwo.work_order_number, ', '), '') AS work_order_numbers
      FROM traveler_material_consumption tmc
      LEFT JOIN travelers tr ON tr.id = tmc.traveler_id::text
      LEFT JOIN production_work_orders pwo ON pwo.id = tr.production_work_order_id
      GROUP BY tmc.material_lot_id
    ),
    ledger_links AS (
      SELECT
        itl.lot_id AS material_lot_id,
        COUNT(DISTINCT itl.production_work_order_id)::int AS ledger_work_order_count,
        COALESCE(STRING_AGG(DISTINCT pwo.work_order_number, ', '), '') AS ledger_work_order_numbers
      FROM inventory_transaction_ledger itl
      LEFT JOIN production_work_orders pwo ON pwo.id = itl.production_work_order_id
      WHERE itl.lot_id IS NOT NULL
      GROUP BY itl.lot_id
    ),
    children AS (
      SELECT parent_lot_id, COUNT(*)::int AS child_lot_count
      FROM material_lots
      WHERE parent_lot_id IS NOT NULL
      GROUP BY parent_lot_id
    ),
    fifo_risk AS (
      SELECT DISTINCT newer.id AS lot_id
      FROM material_lot_transactions issue_tx
      JOIN material_lots newer ON newer.id = issue_tx.material_lot_id
      JOIN material_lots older ON older.inventory_item_id = newer.inventory_item_id
        AND older.id <> newer.id
        AND older.received_at < newer.received_at
        AND COALESCE(older.remaining_qty::numeric, 0) > 0
        AND older.status IN ('RECEIVED', 'ACCEPTED', 'HOLD', 'LOCKED')
      WHERE issue_tx.transaction_type IN ('ISSUE', 'SCRAP')
    ),
    fefo_risk AS (
      SELECT DISTINCT later.id AS lot_id
      FROM material_lot_transactions issue_tx
      JOIN material_lots later ON later.id = issue_tx.material_lot_id
      JOIN material_lots earlier ON earlier.inventory_item_id = later.inventory_item_id
        AND earlier.id <> later.id
        AND earlier.expiration_date IS NOT NULL
        AND later.expiration_date IS NOT NULL
        AND earlier.expiration_date < later.expiration_date
        AND COALESCE(earlier.remaining_qty::numeric, 0) > 0
        AND earlier.status IN ('RECEIVED', 'ACCEPTED', 'HOLD', 'LOCKED')
      WHERE issue_tx.transaction_type IN ('ISSUE', 'SCRAP')
    )
    SELECT
      ml.id,
      ml.internal_control_number,
      ml.material_part_number,
      ml.material_name,
      ml.supplier,
      ml.supplier_lot_number,
      ml.purchase_order_number,
      ml.receiving_record_number,
      ml.received_qty,
      ml.remaining_qty,
      ml.unit_of_measure,
      ml.status,
      ml.storage_location,
      ml.received_at,
      ml.expiration_date,
      ml.parent_lot_id,
      parent.internal_control_number AS parent_icn,
      COALESCE(children.child_lot_count, 0) AS child_lot_count,
      COALESCE(tx.receipt_count, 0) AS receipt_count,
      COALESCE(tx.issue_count, 0) AS issue_count,
      COALESCE(tx.move_count, 0) AS move_count,
      COALESCE(tx.split_count, 0) AS split_count,
      COALESCE(tx.adjustment_count, 0) AS adjustment_count,
      COALESCE(consumption.consumption_count, 0) AS consumption_count,
      COALESCE(consumption.linked_traveler_count, 0) AS linked_traveler_count,
      GREATEST(COALESCE(consumption.linked_work_order_count, 0), COALESCE(ledger_links.ledger_work_order_count, 0)) AS linked_work_order_count,
      TRIM(BOTH ', ' FROM CONCAT_WS(', ', NULLIF(consumption.work_order_numbers, ''), NULLIF(ledger_links.ledger_work_order_numbers, ''))) AS work_order_numbers,
      tx.latest_transaction_at,
      tx.latest_transaction_type,
      CASE WHEN fifo_risk.lot_id IS NOT NULL THEN true ELSE false END AS fifo_exception,
      CASE WHEN fefo_risk.lot_id IS NOT NULL THEN true ELSE false END AS fefo_exception
    FROM material_lots ml
    LEFT JOIN material_lots parent ON parent.id = ml.parent_lot_id
    LEFT JOIN tx ON tx.material_lot_id = ml.id
    LEFT JOIN consumption ON consumption.material_lot_id = ml.id
    LEFT JOIN ledger_links ON ledger_links.material_lot_id = ml.id
    LEFT JOIN children ON children.parent_lot_id = ml.id
    LEFT JOIN fifo_risk ON fifo_risk.lot_id = ml.id
    LEFT JOIN fefo_risk ON fefo_risk.lot_id = ml.id
    ${where}
    ORDER BY
      CASE
        WHEN ml.internal_control_number IS NULL OR ml.internal_control_number = '' THEN 0
        WHEN COALESCE(ml.remaining_qty::numeric, 0) < 0 THEN 1
        WHEN fifo_risk.lot_id IS NOT NULL OR fefo_risk.lot_id IS NOT NULL THEN 2
        ELSE 3
      END,
      ml.received_at DESC NULLS LAST,
      ml.material_part_number;
  `;

  const result = await pgPool.query(rowsSql, params);
  const exceptions: InventoryTraceabilityReport['exceptions'] = [];

  const lots = result.rows.map((row) => {
    const icn = row.internal_control_number ? String(row.internal_control_number) : null;
    const remainingQty = round2(toNumber(row.remaining_qty));
    const receivedQty = round2(toNumber(row.received_qty));
    const statusValue = String(row.status ?? '');
    const zeroQuantityException = remainingQty === 0 && !['ISSUED', 'CONSUMED', 'SCRAPPED', 'REJECTED', 'EXPIRED'].includes(statusValue);
    const negativeQuantityException = remainingQty < 0;
    const splitLineageException = (Number(row.split_count ?? 0) > 0 && Number(row.child_lot_count ?? 0) === 0)
      || (!!row.parent_lot_id && !row.parent_icn);
    const flags: string[] = [];

    if (!icn) flags.push('Missing ICN');
    if (zeroQuantityException) flags.push('Zero quantity with active status');
    if (negativeQuantityException) flags.push('Negative quantity');
    if (row.fifo_exception) flags.push('Potential FIFO exception');
    if (row.fefo_exception) flags.push('Potential FEFO exception');
    if (splitLineageException) flags.push('Split lineage gap');
    if (Number(row.receipt_count ?? 0) === 0) flags.push('No receipt transaction');
    if (Number(row.issue_count ?? 0) > 0 && Number(row.linked_work_order_count ?? 0) === 0 && Number(row.linked_traveler_count ?? 0) === 0) {
      flags.push('Issue without work-order linkage');
    }

    const lot = {
      id: String(row.id),
      internalControlNumber: icn,
      materialPartNumber: String(row.material_part_number ?? ''),
      materialName: String(row.material_name ?? ''),
      supplier: String(row.supplier ?? ''),
      supplierLotNumber: row.supplier_lot_number ?? null,
      purchaseOrderNumber: row.purchase_order_number ?? null,
      receivingRecordNumber: row.receiving_record_number ?? null,
      receivedQty,
      remainingQty,
      unitOfMeasure: String(row.unit_of_measure ?? 'EA'),
      status: statusValue,
      storageLocation: row.storage_location ?? null,
      receivedAt: toDateOnly(row.received_at),
      expirationDate: toDateOnly(row.expiration_date),
      parentLotId: row.parent_lot_id ?? null,
      parentIcn: row.parent_icn ?? null,
      childLotCount: Number(row.child_lot_count ?? 0),
      receiptCount: Number(row.receipt_count ?? 0),
      issueCount: Number(row.issue_count ?? 0),
      moveCount: Number(row.move_count ?? 0),
      splitCount: Number(row.split_count ?? 0),
      adjustmentCount: Number(row.adjustment_count ?? 0),
      consumptionCount: Number(row.consumption_count ?? 0),
      linkedTravelerCount: Number(row.linked_traveler_count ?? 0),
      linkedWorkOrderCount: Number(row.linked_work_order_count ?? 0),
      workOrderNumbers: row.work_order_numbers ?? '',
      latestTransactionAt: toIso(row.latest_transaction_at),
      latestTransactionType: row.latest_transaction_type ?? null,
      fifoException: !!row.fifo_exception,
      fefoException: !!row.fefo_exception,
      zeroQuantityException,
      negativeQuantityException,
      splitLineageException,
      flags,
    };

    for (const flag of flags) {
      const severity: Severity = flag.includes('Negative') || flag.includes('Missing ICN') || flag.includes('Split') ? 'critical' : 'warning';
      addException(
        exceptions,
        severity,
        flag.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        `${lot.internalControlNumber ?? lot.materialPartNumber}: ${flag}.`,
        lot.id,
        lot.internalControlNumber,
      );
    }

    return lot;
  }).filter((lot) => !exceptionOnly || lot.flags.length > 0);

  const summary = lots.reduce<InventoryTraceabilityReport['summary']>((acc, lot) => {
    acc.totalLots += 1;
    if (lot.internalControlNumber) acc.icnCoveredLots += 1;
    acc.receiptEvents += lot.receiptCount;
    acc.issueEvents += lot.issueCount + lot.consumptionCount;
    acc.moveEvents += lot.moveCount;
    acc.splitEvents += lot.splitCount;
    if (lot.linkedWorkOrderCount > 0 || lot.linkedTravelerCount > 0) acc.linkedWorkOrders += 1;
    if (lot.zeroQuantityException) acc.zeroQuantityExceptions += 1;
    if (lot.negativeQuantityException) acc.negativeQuantityExceptions += 1;
    if (lot.fifoException) acc.fifoExceptions += 1;
    if (lot.fefoException) acc.fefoExceptions += 1;
    if (lot.splitLineageException) acc.splitLineageExceptions += 1;
    return acc;
  }, {
    totalLots: 0,
    icnCoveredLots: 0,
    icnCoveragePercent: 0,
    receiptEvents: 0,
    issueEvents: 0,
    moveEvents: 0,
    splitEvents: 0,
    linkedWorkOrders: 0,
    zeroQuantityExceptions: 0,
    negativeQuantityExceptions: 0,
    fifoExceptions: 0,
    fefoExceptions: 0,
    splitLineageExceptions: 0,
  });

  summary.icnCoveragePercent = summary.totalLots === 0
    ? 0
    : round2((summary.icnCoveredLots / summary.totalLots) * 100);

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      status: status ?? null,
      exceptionOnly,
    },
    summary,
    lots,
    exceptions: exceptionOnly ? exceptions.filter((exception) => lots.some((lot) => lot.id === exception.lotId)) : exceptions,
  };
}
