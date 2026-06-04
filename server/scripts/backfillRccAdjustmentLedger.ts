/**
 * Backfill RCC Putaway Adjustment Ledger (Task #260)
 *
 * The Receiving Control Center accept path (`handleAcceptedUnit`) already
 * writes an `inventory_transaction_ledger` RECEIVE row, but the post-accept
 * quantity-correction path in `PATCH /api/receipts/:id/units/:unitId` was
 * silently dropping the ledger entry. As a result, receipts like the Rock
 * West Composites PO `PCV-20260514` show the original RECEIVE row but not
 * the subsequent putaway quantity correction, breaking the Material
 * Traceability Viewer chain.
 *
 * This script scans `material_lot_transactions` for rows of type `ADJUST`
 * whose `referenceType = 'received_unit_adjustment'` (the live signature of
 * an RCC putaway correction) and writes any missing `inventory_transaction_ledger`
 * ADJUST rows using the same idempotency key the live writer now uses
 * (`receiving:rcc-adjust:${unitId}:${newQty}`). Cross-source dedupe also
 * skips rows the generic MLT backfill (`backfill:material_lot_transactions`)
 * already covered, so re-runs and mixed prior runs are safe.
 *
 * Usage:
 *   npx tsx server/scripts/backfillRccAdjustmentLedger.ts \
 *       [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run]
 */

import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '../db';
import {
  inventoryTransactionLedger,
  materialLotTransactions,
  materialLots,
  receivedUnits,
} from '../schema';
import {
  recordInventoryLedgerEntry,
  type InventoryLedgerEntryInput,
} from '../src/services/inventoryTransactionLedgerService';
import { ensureInventoryItemForReceipt } from '../src/services/ensureInventoryItemForReceipt';

const LIVE_SOURCE_MODULE = 'receiving:rcc-adjust';
const MLT_BACKFILL_SOURCE_MODULE = 'backfill:material_lot_transactions';

interface CliArgs {
  from?: Date;
  to?: Date;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--from') args.from = parseDate(argv[++i], '--from');
    else if (a === '--to') args.to = parseDate(argv[++i], '--to');
    else if (a.startsWith('--from=')) args.from = parseDate(a.slice(7), '--from');
    else if (a.startsWith('--to=')) args.to = parseDate(a.slice(5), '--to');
  }
  return args;
}

function parseDate(value: string | undefined, flag: string): Date {
  if (!value) throw new Error(`${flag} requires a YYYY-MM-DD value`);
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new Error(`${flag} value "${value}" is not a valid date`);
  return d;
}

function numOrZero(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[backfillRccAdjustmentLedger] starting${args.dryRun ? ' (DRY RUN)' : ''}`);
  if (args.from) console.log(`  from: ${args.from.toISOString()}`);
  if (args.to) console.log(`  to:   ${args.to.toISOString()}`);

  const conds = [
    eq(materialLotTransactions.transactionType, 'ADJUST'),
    eq(materialLotTransactions.referenceType, 'received_unit_adjustment'),
  ];
  if (args.from) conds.push(gte(materialLotTransactions.performedAt, args.from));
  if (args.to) conds.push(lte(materialLotTransactions.performedAt, args.to));

  const rows = await db
    .select()
    .from(materialLotTransactions)
    .where(and(...conds));

  console.log(`  scanned: ${rows.length} candidate MLT ADJUST rows`);

  let inserted = 0;
  let skippedExisting = 0;
  let skippedNoLot = 0;
  let skippedNoUnit = 0;
  let errors = 0;

  // Pre-load lots and units for batch
  const lotIds = Array.from(new Set(rows.map((r) => r.materialLotId)));
  const lotRows = lotIds.length
    ? await db
        .select({
          id: materialLots.id,
          inventoryItemId: materialLots.inventoryItemId,
          materialPartNumber: materialLots.materialPartNumber,
          unitOfMeasure: materialLots.unitOfMeasure,
        })
        .from(materialLots)
        .where(inArray(materialLots.id, lotIds))
    : [];
  const lotById = new Map(lotRows.map((l) => [l.id, l]));

  for (const row of rows) {
    const unitId = row.referenceId ? Number(row.referenceId) : null;
    if (!unitId || !Number.isFinite(unitId)) { skippedNoUnit++; continue; }
    const lot = lotById.get(row.materialLotId);
    if (!lot?.materialPartNumber) { skippedNoLot++; continue; }

    const after = numOrZero(row.qtyAfter);
    const before = numOrZero(row.qtyBefore);
    const delta = numOrZero(row.qtyChange);
    const liveSourceRecordId = `${unitId}:${after}`;

    // Cross-source dedupe: skip if either the live key or the generic MLT
    // backfill already wrote a ledger row for this logical event.
    const [existingLive] = await db
      .select({ id: inventoryTransactionLedger.id })
      .from(inventoryTransactionLedger)
      .where(
        and(
          eq(inventoryTransactionLedger.sourceModule, LIVE_SOURCE_MODULE),
          eq(inventoryTransactionLedger.sourceRecordId, liveSourceRecordId),
        ),
      )
      .limit(1);
    if (existingLive) { skippedExisting++; continue; }

    const [existingMltBackfill] = await db
      .select({ id: inventoryTransactionLedger.id })
      .from(inventoryTransactionLedger)
      .where(
        and(
          eq(inventoryTransactionLedger.sourceModule, MLT_BACKFILL_SOURCE_MODULE),
          eq(inventoryTransactionLedger.sourceRecordId, row.id),
        ),
      )
      .limit(1);
    if (existingMltBackfill) { skippedExisting++; continue; }

    // Resolve unit barcode for richer notes/metadata (best-effort).
    let unitBarcode: string | null = null;
    try {
      const [unitRow] = await db
        .select({ barcode: receivedUnits.barcode })
        .from(receivedUnits)
        .where(eq(receivedUnits.id, unitId))
        .limit(1);
      unitBarcode = unitRow?.barcode ?? null;
    } catch { /* best effort */ }

    try {
      let invItemId = lot.inventoryItemId;
      if (!invItemId) {
        if (args.dryRun) {
          // In dry-run, don't create the placeholder — just count it.
          inserted++;
          continue;
        }
        const ensured = await ensureInventoryItemForReceipt(db, {
          agPartNumber: lot.materialPartNumber,
          fallbackName: lot.materialPartNumber,
          createdBy: 'system:backfill-rcc-adjust',
        });
        invItemId = ensured.id;
      }

      const payload: InventoryLedgerEntryInput = {
        transactionType: 'ADJUST',
        inventoryItemId: invItemId,
        agPartNumber: lot.materialPartNumber,
        lotId: lot.id,
        unitOfMeasure: lot.unitOfMeasure ?? 'EA',
        quantityBefore: before,
        quantityDelta: delta,
        quantityAfter: after,
        performedByDisplayName: row.performedBy || 'system:backfill',
        reasonCode: 'RECEIPT_QTY_CORRECTION',
        notes: row.notes ?? (unitBarcode ? `Backfilled RCC correction for unit ${unitBarcode}` : null),
        sourceModule: LIVE_SOURCE_MODULE,
        sourceRecordId: liveSourceRecordId,
        createdAtOverride: row.performedAt ?? row.createdAt ?? null,
        metadata: {
          backfill: { table: 'material_lot_transactions', id: row.id },
          receiptId: row.receiptId,
          receivedUnitId: unitId,
          unitBarcode,
          materialLotId: lot.id,
          internalControlNumber: row.internalControlNumber,
          quantityBefore: before,
          quantityAfter: after,
        },
      };

      if (!args.dryRun) await recordInventoryLedgerEntry(payload);
      inserted++;
    } catch (e) {
      errors++;
      console.error(
        `[backfillRccAdjustmentLedger] mlt=${row.id} unit=${unitId} lot=${row.materialLotId} error:`,
        (e as Error).message,
      );
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  inserted:        ${inserted}${args.dryRun ? ' (dry-run — nothing persisted)' : ''}`);
  console.log(`  skippedExisting: ${skippedExisting}`);
  console.log(`  skippedNoLot:    ${skippedNoLot}`);
  console.log(`  skippedNoUnit:   ${skippedNoUnit}`);
  console.log(`  errors:          ${errors}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfillRccAdjustmentLedger] fatal:', err);
    process.exit(1);
  });
