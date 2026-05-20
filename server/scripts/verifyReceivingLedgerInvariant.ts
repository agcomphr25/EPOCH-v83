/**
 * Verify Receiving → Inventory Transaction Ledger Invariant (Task #248)
 *
 * Sweeps recent receiving rows from each of the four entry points and asserts
 * that every row landed a corresponding `inventory_transaction_ledger` entry
 * (or, for truly ad-hoc lines without an AG part number, that the skip is
 * legitimate). Designed as both a one-shot diagnostic and a re-runnable
 * post-deploy check.
 *
 * Coverage:
 *   - `material_lots`             via `material-lots:create` source key
 *   - `received_units` (accepted) via `receiving` source key
 *   - `vendor_po_items` partial   via `receiving:vendor-po` source key
 *   - `parts_request_receipts`    via `receiving:parts-request` source key
 *
 * Usage:
 *   npx tsx server/scripts/verifyReceivingLedgerInvariant.ts [--days 30]
 */

import { and, desc, eq, gte, inArray, isNotNull, like } from 'drizzle-orm';
import { db } from '../db';
import {
  inventoryItems,
  inventoryTransactionLedger,
  materialLots,
  partsRequestOrderLines,
  partsRequestReceiptLines,
  partsRequestReceipts,
  receipts,
  receivedUnits,
  vendorPOItems,
} from '../schema';

interface Gap {
  source: string;
  identifier: string;
  agPartNumber: string | null;
  reason: string;
}

function parseDaysArg(argv: string[]): number {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days' || argv[i].startsWith('--days=')) {
      const raw = argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1];
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 30;
}

async function loadExistingSourceIds(
  sourceModule: string,
  ids: string[],
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ id: inventoryTransactionLedger.sourceRecordId })
    .from(inventoryTransactionLedger)
    .where(
      and(
        eq(inventoryTransactionLedger.sourceModule, sourceModule),
        inArray(inventoryTransactionLedger.sourceRecordId, ids),
      ),
    );
  return new Set(rows.map((r) => r.id).filter((v): v is string => !!v));
}

async function checkMaterialLots(since: Date): Promise<Gap[]> {
  const lots = await db
    .select({
      id: materialLots.id,
      icn: materialLots.internalControlNumber,
      part: materialLots.materialPartNumber,
    })
    .from(materialLots)
    .where(gte(materialLots.createdAt, since));
  const present = await loadExistingSourceIds(
    'material-lots:create',
    lots.map((l) => l.id),
  );
  return lots
    .filter((l) => !present.has(l.id))
    .map((l) => ({
      source: 'material-lots:create',
      identifier: `${l.icn ?? l.id}`,
      agPartNumber: l.part,
      reason: 'No ITL row keyed to material_lots.id',
    }));
}

async function checkReceivedUnits(since: Date): Promise<Gap[]> {
  const units = await db
    .select({
      id: receivedUnits.id,
      barcode: receivedUnits.barcode,
      lotId: receivedUnits.materialLotId,
    })
    .from(receivedUnits)
    .innerJoin(receipts, eq(receivedUnits.receiptId, receipts.id))
    .where(
      and(
        gte(receipts.receivedAt, since),
        isNotNull(receivedUnits.materialLotId),
      ),
    );
  const present = await loadExistingSourceIds(
    'receiving',
    units.map((u) => String(u.id)),
  );
  return units
    .filter((u) => !present.has(String(u.id)))
    .map((u) => ({
      source: 'receiving',
      identifier: `unit#${u.id} (${u.barcode})`,
      agPartNumber: null,
      reason: 'Accepted unit has material_lot but no ITL row',
    }));
}

async function checkVendorPoItems(since: Date): Promise<Gap[]> {
  // Approximate: any vendorPOItems row whose receivedQuantity > 0 and updated
  // recently should have ≥1 ITL row keyed by `${id}:` prefix.
  const items = await db
    .select({
      id: vendorPOItems.id,
      part: vendorPOItems.agPartNumber,
      received: vendorPOItems.receivedQuantity,
      updated: vendorPOItems.updatedAt,
    })
    .from(vendorPOItems)
    .where(gte(vendorPOItems.updatedAt, since));
  const recent = items.filter((i) => Number(i.received ?? 0) > 0);
  const gaps: Gap[] = [];
  for (const item of recent) {
    const matches = await db
      .select({ id: inventoryTransactionLedger.id })
      .from(inventoryTransactionLedger)
      .where(
        and(
          eq(inventoryTransactionLedger.sourceModule, 'receiving:vendor-po'),
          like(inventoryTransactionLedger.sourceRecordId, `${item.id}:%`),
        ),
      )
      .limit(1);
    if (matches.length) continue;
    if (!item.part) continue; // truly ad-hoc, legitimately skipped
    gaps.push({
      source: 'receiving:vendor-po',
      identifier: `poLineItem#${item.id}`,
      agPartNumber: item.part,
      reason: `receivedQuantity=${item.received} but no ITL row found`,
    });
  }
  return gaps;
}

async function checkPartsRequestReceipts(since: Date): Promise<Gap[]> {
  const lines = await db
    .select({
      receiptId: partsRequestReceiptLines.receiptId,
      orderLineId: partsRequestReceiptLines.orderLineId,
      part: partsRequestOrderLines.agPartNumber,
    })
    .from(partsRequestReceiptLines)
    .innerJoin(
      partsRequestReceipts,
      eq(partsRequestReceiptLines.receiptId, partsRequestReceipts.id),
    )
    .innerJoin(
      partsRequestOrderLines,
      eq(partsRequestReceiptLines.orderLineId, partsRequestOrderLines.id),
    )
    .where(gte(partsRequestReceipts.receivedAt, since));
  const ids = lines.map((l) => `${l.receiptId}:${l.orderLineId}`);
  const present = await loadExistingSourceIds('receiving:parts-request', ids);
  return lines
    .filter((l) => l.part && !present.has(`${l.receiptId}:${l.orderLineId}`))
    .map((l) => ({
      source: 'receiving:parts-request',
      identifier: `receipt#${l.receiptId} line#${l.orderLineId}`,
      agPartNumber: l.part,
      reason: 'No ITL row for receipt+orderLine pair',
    }));
}

async function main() {
  const days = parseDaysArg(process.argv.slice(2));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  console.log(`Verifying receiving → ITL invariant since ${since.toISOString()} (${days}d window)`);

  const [a, b, c, d] = await Promise.all([
    checkMaterialLots(since),
    checkReceivedUnits(since),
    checkVendorPoItems(since),
    checkPartsRequestReceipts(since),
  ]);
  const gaps = [...a, ...b, ...c, ...d];

  if (!gaps.length) {
    console.log('OK — no missing ledger rows detected.');
    process.exit(0);
  }

  console.log(`FOUND ${gaps.length} GAPS:`);
  for (const g of gaps) {
    console.log(
      `  [${g.source}] ${g.identifier} part=${g.agPartNumber ?? '(none)'} — ${g.reason}`,
    );
  }
  // Lookup which of the AG part numbers in the gaps have no inventory_items
  // row at all — those are the most likely root cause for legacy gaps.
  const partsToCheck = Array.from(
    new Set(gaps.map((g) => g.agPartNumber).filter((p): p is string => !!p)),
  );
  if (partsToCheck.length) {
    const items = await db
      .select({ p: inventoryItems.agPartNumber })
      .from(inventoryItems)
      .where(inArray(inventoryItems.agPartNumber, partsToCheck));
    const known = new Set(items.map((i) => i.p));
    const missing = partsToCheck.filter((p) => !known.has(p));
    if (missing.length) {
      console.log(`\nAG part numbers WITHOUT an inventory_items row (${missing.length}):`);
      for (const p of missing) console.log(`  - ${p}`);
    }
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(2);
});
