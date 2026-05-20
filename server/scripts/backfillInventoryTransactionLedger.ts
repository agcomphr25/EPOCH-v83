/**
 * Backfill Inventory Transaction Ledger (Task #183)
 *
 * Reconstructs ledger rows from historical source-of-truth tables that were
 * written before `inventory_transaction_ledger` was the canonical pipeline.
 * After backfill, the Material Traceability Viewer can render full chains for
 * legacy travelers (e.g. roc2600007).
 *
 * Sources processed (each maps 1:1 to a ledger row):
 *   - material_lot_transactions       → ledger row using qty_before/change/after
 *   - traveler_material_consumption   → CONSUME row attributed to traveler+step
 *   - material_lot_reservations       → RESERVE row (qty math 0/0/0)
 *
 * Note: `cutting_packet_session_lots` tracks cutting-fabric inventory which has
 * its own dedicated ledger pipeline; it is intentionally NOT a source here.
 *
 * Idempotency: each source row is keyed by (sourceModule, sourceRecordId)
 * where sourceModule is `backfill:<table>`. Re-runs are no-ops.
 *
 * Usage:
 *   npx tsx server/scripts/backfillInventoryTransactionLedger.ts \
 *       [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run] \
 *       [--source mlt|consumption|reservations|all]
 */

import { and, eq, gte, lte, inArray, isNotNull, gt } from 'drizzle-orm';
import { db } from '../db';
import {
  inventoryItems,
  inventoryTransactionLedger,
  materialLotReservations,
  materialLotTransactions,
  materialLots,
  partsRequestOrderLines,
  partsRequestReceiptLines,
  partsRequestReceipts,
  travelerMaterialConsumption,
  vendorPOItems,
  type InventoryTransactionLedger,
} from '../schema';
import {
  recordInventoryLedgerEntry,
  type InventoryLedgerEntryInput,
  type InventoryLedgerTransactionType,
} from '../src/services/inventoryTransactionLedgerService';

// ──────────────────────────────────────────────────────────────────────
// CLI parsing
// ──────────────────────────────────────────────────────────────────────

type SourceKey = 'mlt' | 'consumption' | 'reservations' | 'parts-request-receipts' | 'vendor-po-items';
const ALL_SOURCES: SourceKey[] = ['mlt', 'consumption', 'reservations', 'parts-request-receipts', 'vendor-po-items'];

interface CliArgs {
  from?: Date;
  to?: Date;
  dryRun: boolean;
  sources: SourceKey[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, sources: ALL_SOURCES };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--from') args.from = parseDate(argv[++i], '--from');
    else if (a === '--to') args.to = parseDate(argv[++i], '--to');
    else if (a === '--source') {
      const v = (argv[++i] ?? '').toLowerCase();
      if (v === 'all') args.sources = ALL_SOURCES;
      else if (ALL_SOURCES.includes(v as SourceKey)) args.sources = [v as SourceKey];
      else throw new Error(`Unknown --source value: ${v}. Use mlt|consumption|reservations|all`);
    } else if (a.startsWith('--from=')) args.from = parseDate(a.slice(7), '--from');
    else if (a.startsWith('--to=')) args.to = parseDate(a.slice(5), '--to');
    else if (a.startsWith('--source=')) {
      const v = a.slice(9).toLowerCase();
      if (v === 'all') args.sources = ALL_SOURCES;
      else if (ALL_SOURCES.includes(v as SourceKey)) args.sources = [v as SourceKey];
      else throw new Error(`Unknown --source value: ${v}`);
    }
  }
  return args;
}

function parseDate(value: string | undefined, flag: string): Date {
  if (!value) throw new Error(`${flag} requires a YYYY-MM-DD value`);
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new Error(`${flag} value "${value}" is not a valid date`);
  return d;
}

// ──────────────────────────────────────────────────────────────────────
// Source-module identifiers (idempotency keys)
// ──────────────────────────────────────────────────────────────────────

export const SOURCE_MODULE = {
  mlt: 'backfill:material_lot_transactions',
  consumption: 'backfill:traveler_material_consumption',
  reservations: 'backfill:material_lot_reservations',
  'parts-request-receipts': 'backfill:parts_request_receipt_lines',
  'vendor-po-items': 'backfill:vendor_po_items',
} as const;

// ──────────────────────────────────────────────────────────────────────
// Pure mappers (exported for unit tests)
// ──────────────────────────────────────────────────────────────────────

const MLT_TO_LEDGER_TYPE: Record<string, InventoryLedgerTransactionType> = {
  RECEIVE: 'RECEIVE',
  MOVE: 'MOVE',
  ISSUE: 'ISSUE',
  ADJUST: 'ADJUST',
  SCRAP: 'SCRAP',
  RETURN: 'RETURN',
  SPLIT: 'SPLIT',
  QUARANTINE: 'QUARANTINE',
  EXPIRE: 'EXPIRE',
  ACCEPT: 'STATUS_CHANGE',
  REJECT: 'STATUS_CHANGE',
  HOLD: 'STATUS_CHANGE',
  OUT_START: 'STATUS_CHANGE',
  OUT_END: 'STATUS_CHANGE',
};

export function mapMltToLedgerType(txnType: string): InventoryLedgerTransactionType {
  return MLT_TO_LEDGER_TYPE[txnType] ?? 'STATUS_CHANGE';
}

interface LotRef {
  id: string;
  inventoryItemId: number;
  materialPartNumber: string;
  unitOfMeasure: string;
}

export function buildMltPayload(
  row: typeof materialLotTransactions.$inferSelect,
  lot: LotRef,
): InventoryLedgerEntryInput {
  const before = numOrZero(row.qtyBefore);
  const delta = numOrZero(row.qtyChange);
  // Source qty_after may be null OR drift from before+delta on legacy rows.
  // The ledger writer enforces before+delta=after, so derive when needed.
  const after = row.qtyAfter != null && Math.abs(numOrZero(row.qtyAfter) - (before + delta)) < 0.0001
    ? numOrZero(row.qtyAfter)
    : before + delta;
  const isTraveler = row.referenceType === 'TRAVELER' && !!row.referenceId;
  return {
    transactionType: mapMltToLedgerType(row.transactionType),
    inventoryItemId: lot.inventoryItemId,
    agPartNumber: lot.materialPartNumber,
    lotId: lot.id,
    locationId: row.toLocation ?? row.fromLocation ?? null,
    quantityDelta: delta,
    quantityBefore: before,
    quantityAfter: after,
    unitOfMeasure: lot.unitOfMeasure,
    performedByDisplayName: row.performedBy || 'system:backfill',
    travelerId: isTraveler ? String(row.referenceId) : null,
    reasonCode: row.reason ?? null,
    notes: row.notes ?? null,
    sourceModule: SOURCE_MODULE.mlt,
    sourceRecordId: row.id,
    createdAtOverride: row.performedAt ?? row.createdAt ?? null,
    metadata: {
      backfill: { table: 'material_lot_transactions', id: row.id },
      originalReferenceType: row.referenceType,
      originalReferenceId: row.referenceId,
      receiptId: row.receiptId,
      fromLocation: row.fromLocation,
      toLocation: row.toLocation,
      wasOverride: row.wasOverride ?? false,
      overrideApprovedBy: row.overrideApprovedBy,
      overrideReason: row.overrideReason,
    },
  };
}

export function buildConsumptionPayload(
  row: typeof travelerMaterialConsumption.$inferSelect,
  lot: LotRef,
  runningBalance: number,
): InventoryLedgerEntryInput {
  const used = numOrZero(row.qtyUsed);
  const delta = -used;
  const before = runningBalance;
  const after = before + delta;
  return {
    transactionType: 'CONSUME',
    inventoryItemId: lot.inventoryItemId,
    agPartNumber: row.materialPartNumber || lot.materialPartNumber,
    lotId: lot.id,
    quantityDelta: delta,
    quantityBefore: before,
    quantityAfter: after,
    unitOfMeasure: row.unitOfMeasure || lot.unitOfMeasure,
    performedByDisplayName: row.scannedBy || 'system:backfill',
    travelerId: row.travelerId,
    travelerStepId: row.travelerStepId,
    reasonCode: 'MATERIAL_CONSUME',
    notes: row.notes ?? null,
    sourceModule: SOURCE_MODULE.consumption,
    sourceRecordId: row.id,
    createdAtOverride: row.scannedAt ?? row.createdAt ?? null,
    metadata: {
      backfill: { table: 'traveler_material_consumption', id: row.id },
      validationStatus: row.validationStatus,
      receivedUnitId: row.receivedUnitId,
      travelerTaskId: row.travelerTaskId,
      badgeScan: row.badgeScan,
      wasOverride: row.wasOverride ?? false,
    },
  };
}

export function buildReservationPayload(
  row: typeof materialLotReservations.$inferSelect,
  lot: LotRef,
): InventoryLedgerEntryInput {
  // Reservations don't change on-hand quantity; record qty math as 0/0/0
  // and stash the reserved qty in metadata for downstream UI.
  const isCancelled = row.status === 'cancelled';
  return {
    transactionType: isCancelled ? 'UNRESERVE' : 'RESERVE',
    inventoryItemId: lot.inventoryItemId,
    agPartNumber: lot.materialPartNumber,
    lotId: lot.id,
    quantityDelta: 0,
    quantityBefore: 0,
    quantityAfter: 0,
    unitOfMeasure: row.unitOfMeasure || lot.unitOfMeasure,
    performedByDisplayName: row.createdBy || 'system:backfill',
    travelerId: row.travelerId ?? null,
    reasonCode: isCancelled ? 'RESERVATION_CANCELLED' : 'RESERVATION_ACTIVE',
    notes: row.notes ?? null,
    sourceModule: SOURCE_MODULE.reservations,
    sourceRecordId: String(row.id),
    createdAtOverride: row.createdAt ?? null,
    metadata: {
      backfill: { table: 'material_lot_reservations', id: row.id },
      reservationStatus: row.status,
      reservedQuantity: String(row.quantityReserved),
      receivedUnitId: row.receivedUnitId,
      workOrderId: row.workOrderId,
      intendedRoutingStepId: row.intendedRoutingStepId,
    },
  };
}

function numOrZero(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ──────────────────────────────────────────────────────────────────────
// Lot lookup cache
// ──────────────────────────────────────────────────────────────────────

async function loadLots(lotIds: string[]): Promise<Map<string, LotRef>> {
  const map = new Map<string, LotRef>();
  if (!lotIds.length) return map;
  const unique = Array.from(new Set(lotIds));
  const rows = await db
    .select({
      id: materialLots.id,
      inventoryItemId: materialLots.inventoryItemId,
      materialPartNumber: materialLots.materialPartNumber,
      unitOfMeasure: materialLots.unitOfMeasure,
    })
    .from(materialLots)
    .where(inArray(materialLots.id, unique));
  for (const r of rows) map.set(r.id, r);
  return map;
}

async function loadExistingSourceIds(
  sourceModule: string,
  sourceIds: string[],
): Promise<Set<string>> {
  if (!sourceIds.length) return new Set();
  const existing = await db
    .select({ id: inventoryTransactionLedger.sourceRecordId })
    .from(inventoryTransactionLedger)
    .where(
      and(
        eq(inventoryTransactionLedger.sourceModule, sourceModule),
        inArray(inventoryTransactionLedger.sourceRecordId, sourceIds),
      ),
    );
  return new Set(existing.map((r) => r.id).filter((v): v is string => !!v));
}

// ──────────────────────────────────────────────────────────────────────
// Per-source backfill routines
// ──────────────────────────────────────────────────────────────────────

interface BackfillStats {
  source: SourceKey;
  scanned: number;
  inserted: number;
  skippedExisting: number;
  skippedNoLot: number;
  errors: number;
}

async function backfillMlt(args: CliArgs): Promise<BackfillStats> {
  const stats: BackfillStats = {
    source: 'mlt', scanned: 0, inserted: 0, skippedExisting: 0, skippedNoLot: 0, errors: 0,
  };
  const conds = [];
  if (args.from) conds.push(gte(materialLotTransactions.performedAt, args.from));
  if (args.to) conds.push(lte(materialLotTransactions.performedAt, args.to));
  const rows = await db
    .select()
    .from(materialLotTransactions)
    .where(conds.length ? and(...conds) : undefined);
  stats.scanned = rows.length;

  const lots = await loadLots(rows.map((r) => r.materialLotId));
  const existing = await loadExistingSourceIds(SOURCE_MODULE.mlt, rows.map((r) => r.id));

  for (const row of rows) {
    if (existing.has(row.id)) { stats.skippedExisting++; continue; }
    const lot = lots.get(row.materialLotId);
    if (!lot) { stats.skippedNoLot++; continue; }
    try {
      const payload = buildMltPayload(row, lot);
      if (!args.dryRun) await recordInventoryLedgerEntry(payload);
      stats.inserted++;
    } catch (e) {
      stats.errors++;
      console.error(`[mlt] row=${row.id} lot=${row.materialLotId} error:`, (e as Error).message);
    }
  }
  return stats;
}

async function backfillConsumption(args: CliArgs): Promise<BackfillStats> {
  const stats: BackfillStats = {
    source: 'consumption', scanned: 0, inserted: 0, skippedExisting: 0, skippedNoLot: 0, errors: 0,
  };
  const conds = [];
  if (args.from) conds.push(gte(travelerMaterialConsumption.scannedAt, args.from));
  if (args.to) conds.push(lte(travelerMaterialConsumption.scannedAt, args.to));
  const rows = await db
    .select()
    .from(travelerMaterialConsumption)
    .where(conds.length ? and(...conds) : undefined);
  stats.scanned = rows.length;

  const lots = await loadLots(rows.map((r) => r.materialLotId));
  const existing = await loadExistingSourceIds(SOURCE_MODULE.consumption, rows.map((r) => r.id));

  // Sort per-lot chronologically so we can chain quantityBefore/After.
  // The starting balance is the lot's receivedQty if present, else 0.
  const lotStartBalance = await loadLotReceivedQty(Array.from(lots.keys()));
  const perLotRunning = new Map<string, number>();
  for (const [lotId] of lots) perLotRunning.set(lotId, lotStartBalance.get(lotId) ?? 0);

  rows.sort((a, b) => {
    const at = (a.scannedAt ?? a.createdAt)?.getTime() ?? 0;
    const bt = (b.scannedAt ?? b.createdAt)?.getTime() ?? 0;
    return at - bt;
  });

  for (const row of rows) {
    if (existing.has(row.id)) { stats.skippedExisting++; continue; }
    const lot = lots.get(row.materialLotId);
    if (!lot) { stats.skippedNoLot++; continue; }
    const running = perLotRunning.get(lot.id) ?? 0;
    try {
      const payload = buildConsumptionPayload(row, lot, running);
      if (!args.dryRun) await recordInventoryLedgerEntry(payload);
      perLotRunning.set(lot.id, Number(payload.quantityAfter));
      stats.inserted++;
    } catch (e) {
      stats.errors++;
      console.error(`[consumption] row=${row.id} lot=${row.materialLotId} error:`, (e as Error).message);
    }
  }
  return stats;
}

async function loadLotReceivedQty(lotIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!lotIds.length) return map;
  const rows = await db
    .select({ id: materialLots.id, receivedQty: materialLots.receivedQty })
    .from(materialLots)
    .where(inArray(materialLots.id, lotIds));
  for (const r of rows) map.set(r.id, numOrZero(r.receivedQty));
  return map;
}

async function backfillReservations(args: CliArgs): Promise<BackfillStats> {
  const stats: BackfillStats = {
    source: 'reservations', scanned: 0, inserted: 0, skippedExisting: 0, skippedNoLot: 0, errors: 0,
  };
  const conds = [];
  if (args.from) conds.push(gte(materialLotReservations.createdAt, args.from));
  if (args.to) conds.push(lte(materialLotReservations.createdAt, args.to));
  const rows = await db
    .select()
    .from(materialLotReservations)
    .where(conds.length ? and(...conds) : undefined);
  stats.scanned = rows.length;

  const lots = await loadLots(rows.map((r) => r.materialLotId));
  const existing = await loadExistingSourceIds(
    SOURCE_MODULE.reservations,
    rows.map((r) => String(r.id)),
  );

  for (const row of rows) {
    const sid = String(row.id);
    if (existing.has(sid)) { stats.skippedExisting++; continue; }
    const lot = lots.get(row.materialLotId);
    if (!lot) { stats.skippedNoLot++; continue; }
    try {
      const payload = buildReservationPayload(row, lot);
      if (!args.dryRun) await recordInventoryLedgerEntry(payload);
      stats.inserted++;
    } catch (e) {
      stats.errors++;
      console.error(`[reservations] row=${row.id} lot=${row.materialLotId} error:`, (e as Error).message);
    }
  }
  return stats;
}

// ──────────────────────────────────────────────────────────────────────
// Parts-request receipt-line backfill (Task #229)
// ──────────────────────────────────────────────────────────────────────

async function backfillPartsRequestReceipts(args: CliArgs): Promise<BackfillStats> {
  const stats: BackfillStats = {
    source: 'parts-request-receipts',
    scanned: 0, inserted: 0, skippedExisting: 0, skippedNoLot: 0, errors: 0,
  };

  const conds = [];
  if (args.from) conds.push(gte(partsRequestReceipts.receivedAt, args.from));
  if (args.to) conds.push(lte(partsRequestReceipts.receivedAt, args.to));

  // Join receipt lines → receipts → order lines so each row carries the
  // qtyReceived, the AG part number, and the receivedAt timestamp.
  const rows = await db
    .select({
      receiptLineId: partsRequestReceiptLines.id,
      receiptId: partsRequestReceiptLines.receiptId,
      orderLineId: partsRequestReceiptLines.orderLineId,
      qtyReceived: partsRequestReceiptLines.qtyReceived,
      receivedBy: partsRequestReceipts.receivedBy,
      receivedAt: partsRequestReceipts.receivedAt,
      notes: partsRequestReceipts.notes,
      agPartNumber: partsRequestOrderLines.agPartNumber,
      partNumber: partsRequestOrderLines.partNumber,
      partName: partsRequestOrderLines.partName,
      batchId: partsRequestOrderLines.batchId,
    })
    .from(partsRequestReceiptLines)
    .innerJoin(partsRequestReceipts, eq(partsRequestReceiptLines.receiptId, partsRequestReceipts.id))
    .innerJoin(partsRequestOrderLines, eq(partsRequestReceiptLines.orderLineId, partsRequestOrderLines.id))
    .where(conds.length ? and(...conds) : undefined);
  stats.scanned = rows.length;

  // Match the live writer's stable composite key:
  // `receiving:parts-request` → `${receiptId}:${orderLineId}`.
  const sourceIds = rows.map((r) => `${r.receiptId}:${r.orderLineId}`);
  const existing = await loadExistingSourceIds(SOURCE_MODULE['parts-request-receipts'], sourceIds);
  // Cross-source dedupe: skip rows the live writer already covered for the
  // same logical (receipt, orderLine) pair.
  const existingLive = await loadExistingSourceIds('receiving:parts-request', sourceIds);

  // Pre-load inventory_items for all distinct AG part numbers in one query.
  const partNumbers = Array.from(new Set(rows.map((r) => r.agPartNumber).filter((p): p is string => !!p)));
  const invItems = partNumbers.length
    ? await db
        .select({
          id: inventoryItems.id,
          agPartNumber: inventoryItems.agPartNumber,
          purchaseUnit: inventoryItems.purchaseUnit,
          usageUnit: inventoryItems.usageUnit,
        })
        .from(inventoryItems)
        .where(inArray(inventoryItems.agPartNumber, partNumbers))
    : [];
  const invByPart = new Map(invItems.map((r) => [r.agPartNumber, r]));

  for (const row of rows) {
    const sid = `${row.receiptId}:${row.orderLineId}`;
    if (existing.has(sid) || existingLive.has(sid)) { stats.skippedExisting++; continue; }
    if (!row.agPartNumber) { stats.skippedNoLot++; continue; }
    const inv = invByPart.get(row.agPartNumber);
    if (!inv) { stats.skippedNoLot++; continue; }
    try {
      const qty = Number(row.qtyReceived ?? 0);
      const payload: InventoryLedgerEntryInput = {
        transactionType: 'RECEIVE',
        inventoryItemId: inv.id,
        agPartNumber: inv.agPartNumber,
        unitOfMeasure: inv.purchaseUnit ?? inv.usageUnit ?? 'EA',
        quantityBefore: 0,
        quantityDelta: qty,
        quantityAfter: qty,
        performedByDisplayName: row.receivedBy || 'system:backfill',
        reasonCode: 'PARTS_REQUEST_RECEIPT',
        notes: row.notes ?? null,
        sourceModule: SOURCE_MODULE['parts-request-receipts'],
        sourceRecordId: sid,
        createdAtOverride: row.receivedAt ?? null,
        metadata: {
          backfill: { table: 'parts_request_receipt_lines', id: row.receiptLineId },
          receiptId: row.receiptId,
          orderLineId: row.orderLineId,
          batchId: row.batchId,
          partNumber: row.partNumber,
          partName: row.partName,
        },
      };
      if (!args.dryRun) await recordInventoryLedgerEntry(payload);
      stats.inserted++;
    } catch (e) {
      stats.errors++;
      console.error(`[parts-request-receipts] receiptLine=${row.receiptLineId} error:`, (e as Error).message);
    }
  }
  return stats;
}

// ──────────────────────────────────────────────────────────────────────
// Vendor PO line-item backfill (Task #229)
//
// Reconstructs ONE cumulative RECEIVE row per vendor_po_items row whose
// receivedQuantity > 0. Historical partial-receipt timing is not available
// (only the final cumulative quantity is stored on the line), so the row
// represents the total received-to-date as a single ledger event.
// ──────────────────────────────────────────────────────────────────────

async function backfillVendorPOItems(args: CliArgs): Promise<BackfillStats> {
  const stats: BackfillStats = {
    source: 'vendor-po-items',
    scanned: 0, inserted: 0, skippedExisting: 0, skippedNoLot: 0, errors: 0,
  };

  const conds = [gt(vendorPOItems.receivedQuantity, 0), isNotNull(vendorPOItems.agPartNumber)];
  if (args.from) conds.push(gte(vendorPOItems.receivedDate, args.from));
  if (args.to) conds.push(lte(vendorPOItems.receivedDate, args.to));

  const rows = await db
    .select({
      id: vendorPOItems.id,
      vendorPoId: vendorPOItems.vendorPoId,
      agPartNumber: vendorPOItems.agPartNumber,
      receivedQuantity: vendorPOItems.receivedQuantity,
      receivedDate: vendorPOItems.receivedDate,
    })
    .from(vendorPOItems)
    .where(and(...conds));
  stats.scanned = rows.length;

  // Each backfilled row uses sourceRecordId = `${poLineItemId}:${cumulative}`
  // to match the live writer's idempotency key, so re-runs after a partial
  // live receipt also coalesce.
  const sourceIds = rows.map((r) => `${r.id}:${r.receivedQuantity}`);
  const existing = await loadExistingSourceIds(SOURCE_MODULE['vendor-po-items'], sourceIds);
  // Also skip rows that the live writer already covered.
  const existingLive = await loadExistingSourceIds('receiving:vendor-po', sourceIds);

  const partNumbers = Array.from(new Set(rows.map((r) => r.agPartNumber).filter((p): p is string => !!p)));
  const invItems = partNumbers.length
    ? await db
        .select({
          id: inventoryItems.id,
          agPartNumber: inventoryItems.agPartNumber,
          purchaseUnit: inventoryItems.purchaseUnit,
          usageUnit: inventoryItems.usageUnit,
        })
        .from(inventoryItems)
        .where(inArray(inventoryItems.agPartNumber, partNumbers))
    : [];
  const invByPart = new Map(invItems.map((r) => [r.agPartNumber, r]));

  for (const row of rows) {
    if (!row.agPartNumber) { stats.skippedNoLot++; continue; }
    const sid = `${row.id}:${row.receivedQuantity}`;
    if (existing.has(sid) || existingLive.has(sid)) { stats.skippedExisting++; continue; }
    const inv = invByPart.get(row.agPartNumber);
    if (!inv) { stats.skippedNoLot++; continue; }
    try {
      const qty = Number(row.receivedQuantity ?? 0);
      const eventDate = row.receivedDate ? new Date(row.receivedDate) : null;
      const payload: InventoryLedgerEntryInput = {
        transactionType: 'RECEIVE',
        inventoryItemId: inv.id,
        agPartNumber: inv.agPartNumber,
        unitOfMeasure: inv.purchaseUnit ?? inv.usageUnit ?? 'EA',
        quantityBefore: 0,
        quantityDelta: qty,
        quantityAfter: qty,
        performedByDisplayName: 'system:backfill',
        reasonCode: 'VENDOR_PO_RECEIPT',
        notes: null,
        sourceModule: SOURCE_MODULE['vendor-po-items'],
        sourceRecordId: sid,
        createdAtOverride: eventDate,
        metadata: {
          backfill: { table: 'vendor_po_items', id: row.id },
          vendorPoId: row.vendorPoId,
          poLineItemId: row.id,
          cumulativeReceivedQuantity: row.receivedQuantity,
        },
      };
      if (!args.dryRun) await recordInventoryLedgerEntry(payload);
      stats.inserted++;
    } catch (e) {
      stats.errors++;
      console.error(`[vendor-po-items] poLineItemId=${row.id} error:`, (e as Error).message);
    }
  }
  return stats;
}

// ──────────────────────────────────────────────────────────────────────
// Entrypoint
// ──────────────────────────────────────────────────────────────────────

export async function run(argv: string[] = process.argv.slice(2)): Promise<BackfillStats[]> {
  const args = parseArgs(argv);
  console.log('Inventory Transaction Ledger backfill');
  console.log('  dry-run :', args.dryRun);
  console.log('  from    :', args.from?.toISOString() ?? '(none)');
  console.log('  to      :', args.to?.toISOString() ?? '(none)');
  console.log('  sources :', args.sources.join(', '));
  console.log('');

  const results: BackfillStats[] = [];
  for (const src of args.sources) {
    const stats =
      src === 'mlt' ? await backfillMlt(args)
      : src === 'consumption' ? await backfillConsumption(args)
      : src === 'reservations' ? await backfillReservations(args)
      : src === 'parts-request-receipts' ? await backfillPartsRequestReceipts(args)
      : await backfillVendorPOItems(args);
    console.log(
      `[${stats.source}] scanned=${stats.scanned} inserted=${stats.inserted} ` +
      `skippedExisting=${stats.skippedExisting} skippedNoLot=${stats.skippedNoLot} errors=${stats.errors}` +
      (args.dryRun ? '  (dry-run)' : ''),
    );
    results.push(stats);
  }
  return results;
}

// Allow direct CLI execution. import.meta.url comparison is the standard
// "is this the entry module?" check for ESM/tsx scripts.
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('backfillInventoryTransactionLedger.ts');
if (isMain) {
  run().then(() => process.exit(0)).catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  });
}

export type { InventoryTransactionLedger };
