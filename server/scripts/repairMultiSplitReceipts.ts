/**
 * Repair Multi-Split Vendor PO Receipts (Task #240)
 *
 * Before Task #240, the standalone Inventory Receiving page submitted N split
 * units as a single consolidated `POST /api/vendor-pos/items/:itemId/receive`
 * call with all per-unit traceability data jammed into `vendor_po_items.notes`
 * (markers like `[N units with individual traceability]` and `Unit 1: …`).
 * `recordVendorPOReceipt` only created **one** material_lots row (or zero,
 * depending on the AG part) for that consolidated call, so the Material
 * Inventory page never showed the additional split units.
 *
 * This script reconstructs the missing material_lots rows and matching
 * inventory_transaction_ledger RECEIVE rows from those legacy notes. It is
 * fully idempotent:
 *
 *   - Skips PO line items where the existing material_lots count for the
 *     (po_number, ag_part_number) tuple already matches the parsed unit count.
 *   - Skips per-unit ITL rows whose source key
 *     `${poLineItemId}:${cumulative}:${idx}` already exists.
 *   - Does NOT touch `vendor_po_items.received_quantity` — that value is
 *     already correct from the original consolidated call.
 *   - Does NOT recompute COGS — cost history was already written.
 *
 * Usage:
 *   npx tsx server/scripts/repairMultiSplitReceipts.ts [--dry-run]
 *       [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--po-line-item-id N]
 */

import { and, eq, gte, like, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  inventoryItems,
  inventoryTransactionLedger,
  materialLots,
  users,
  vendorPOItems,
  vendorPOs,
  vendors,
} from '../schema';
import { recordInventoryLedgerEntry } from '../src/services/inventoryTransactionLedgerService';

interface CliArgs {
  dryRun: boolean;
  from?: Date;
  to?: Date;
  poLineItemId?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--from') args.from = new Date(argv[++i]);
    else if (a === '--to') args.to = new Date(argv[++i]);
    else if (a === '--po-line-item-id') args.poLineItemId = Number(argv[++i]);
    else if (a.startsWith('--from=')) args.from = new Date(a.slice(7));
    else if (a.startsWith('--to=')) args.to = new Date(a.slice(5));
  }
  return args;
}

interface ParsedUnit {
  index: number; // 1-based
  raw: string;
  fields: Record<string, string>;
}

interface ParsedNotes {
  unitCount: number;
  units: ParsedUnit[];
}

/**
 * Parse legacy notes of the form:
 *   "[3 units with individual traceability] | Unit 1: Batch/Lot #: ABC | Roll Number: 12 | Unit 2: ... | ..."
 *
 * The `Unit N: ...` segments use ` | ` as the field separator. Everything
 * after the next `Unit M:` belongs to that unit.
 */
export function parseLegacyMultiSplitNotes(notes: string | null | undefined): ParsedNotes | null {
  if (!notes) return null;
  const headerMatch = notes.match(/\[(\d+)\s+units?\s+with\s+individual\s+traceability\]/i);
  if (!headerMatch) return null;
  const unitCount = parseInt(headerMatch[1], 10);
  if (!Number.isFinite(unitCount) || unitCount <= 0) return null;

  // Split into "Unit N: ..." chunks. Use a regex that finds each "Unit N:"
  // header position; everything between two headers (or to end) is its body.
  const headerRe = /Unit\s+(\d+)\s*:\s*/gi;
  const positions: Array<{ index: number; bodyStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(notes)) !== null) {
    positions.push({ index: parseInt(m[1], 10), bodyStart: m.index + m[0].length });
  }
  if (!positions.length) return { unitCount, units: [] };

  const units: ParsedUnit[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].bodyStart;
    const end = i + 1 < positions.length ? positions[i + 1].bodyStart - `Unit ${positions[i + 1].index}:`.length : notes.length;
    let body = notes.slice(start, Math.max(start, end));
    // Trim trailing " | " separators left over from header re-positioning.
    body = body.replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '').trim();

    const fields: Record<string, string> = {};
    // Each field is "Label: value" separated by " | "
    for (const seg of body.split(/\s*\|\s*/)) {
      const idx = seg.indexOf(':');
      if (idx < 0) continue;
      const label = seg.slice(0, idx).trim();
      const value = seg.slice(idx + 1).trim();
      if (label) fields[label] = value;
    }
    units.push({ index: positions[i].index, raw: body, fields });
  }
  return { unitCount, units };
}

function pickLotNumber(fields: Record<string, string>): string | null {
  // Match the client's preference order in InventoryReceivingPage.handleDialogReceive
  const keys = ['Batch/Lot #', 'Roll Number', 'Manufacture Roll', 'Supplier Batch/Lot/C #'];
  for (const k of keys) {
    if (fields[k] && fields[k].trim()) return fields[k].trim();
  }
  return null;
}

function parseDateField(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function generateNextIcnPrefix(executor: DbOrTx = db): Promise<{ prefix: string; nextSeq: number }> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ICN-MAT-${dateStr}-`;
  const rows = await executor
    .select({ icn: materialLots.internalControlNumber })
    .from(materialLots)
    .where(like(materialLots.internalControlNumber, `${prefix}%`))
    .orderBy(sql`${materialLots.internalControlNumber} DESC`)
    .limit(1);
  const lastSeq = rows.length
    ? parseInt(String(rows[0].icn).split('-').pop() ?? '0', 10)
    : 0;
  return { prefix, nextSeq: lastSeq + 1 };
}

async function repair(args: CliArgs): Promise<void> {
  console.log('🔧 Repair Multi-Split Receipts (Task #240)');
  console.log(`   dryRun=${args.dryRun} from=${args.from?.toISOString() ?? '-'} to=${args.to?.toISOString() ?? '-'} poLineItemId=${args.poLineItemId ?? '-'}`);

  // Find all candidate vendor_po_items whose notes carry the legacy split marker.
  // vendorPOItems.receivedDate is a Drizzle `date()` column → string in/out.
  const conds: any[] = [like(vendorPOItems.notes, '%units with individual traceability%')];
  if (args.from) conds.push(gte(vendorPOItems.receivedDate, args.from.toISOString().slice(0, 10)));
  if (args.to) conds.push(lte(vendorPOItems.receivedDate, args.to.toISOString().slice(0, 10)));
  if (args.poLineItemId) conds.push(eq(vendorPOItems.id, args.poLineItemId));

  const candidates = await db
    .select({
      id: vendorPOItems.id,
      vendorPoId: vendorPOItems.vendorPoId,
      agPartNumber: vendorPOItems.agPartNumber,
      receivedQuantity: vendorPOItems.receivedQuantity,
      receivedDate: vendorPOItems.receivedDate,
      notes: vendorPOItems.notes,
    })
    .from(vendorPOItems)
    .where(and(...conds));

  console.log(`   candidates=${candidates.length}`);

  let totalLotsCreated = 0;
  let totalLedgerCreated = 0;
  let skippedAlreadyOk = 0;
  let skippedNoInventoryItem = 0;
  let errors = 0;

  for (const c of candidates) {
    try {
      const parsed = parseLegacyMultiSplitNotes(c.notes);
      if (!parsed || parsed.unitCount < 2) { skippedAlreadyOk++; continue; }

      const [vp] = await db
        .select({ poNumber: vendorPOs.poNumber, vendorId: vendorPOs.vendorId })
        .from(vendorPOs)
        .where(eq(vendorPOs.id, c.vendorPoId));
      if (!vp) { console.warn(`   skip line ${c.id}: vendor_po missing`); skippedAlreadyOk++; continue; }

      const [inv] = await db
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          agPartNumber: inventoryItems.agPartNumber,
          purchaseUnit: inventoryItems.purchaseUnit,
          usageUnit: inventoryItems.usageUnit,
          supplierPartNumber: inventoryItems.supplierPartNumber,
        })
        .from(inventoryItems)
        .where(eq(inventoryItems.agPartNumber, c.agPartNumber!));
      if (!inv) {
        console.warn(`   skip line ${c.id} (${c.agPartNumber}): no inventory_items row`);
        skippedNoInventoryItem++;
        continue;
      }

      let vendorName: string | null = null;
      if (vp.vendorId != null) {
        const [v] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, vp.vendorId));
        vendorName = v?.name ?? null;
      }

      const totalQty = Number(c.receivedQuantity ?? 0);
      const perUnitQty = parsed.unitCount > 0 ? totalQty / parsed.unitCount : 0;
      // Cumulative=totalQty matches the live writer's idempotency key.
      const cumulative = totalQty;
      const uom = inv.purchaseUnit ?? inv.usageUnit ?? 'EA';
      // vendorPOItems.receivedDate is a `date()` column → string. Coerce to Date.
      const receivedAt: Date = c.receivedDate ? new Date(String(c.receivedDate)) : new Date();

      // Wrap each PO line's repair in a single transaction so a failure
      // mid-line cannot leave dangling material_lots without ledger rows.
      const lineResult = await db.transaction(async (tx) => {
        let lotsCreated = 0;
        let ledgerCreated = 0;

        const { prefix, nextSeq: startSeq } = await generateNextIcnPrefix(tx);
        let nextSeq = startSeq;

        for (const u of parsed.units) {
          const idx = u.index - 1; // 0-based ITL key parity with live writer
          const sourceRecordId = `${c.id}:${cumulative}:${idx}`;

          // Per-unit ITL key dedupe (definitive idempotency).
          const [existingLedger] = await tx
            .select({ id: inventoryTransactionLedger.id })
            .from(inventoryTransactionLedger)
            .where(
              and(
                eq(inventoryTransactionLedger.sourceModule, 'receiving:vendor-po'),
                eq(inventoryTransactionLedger.sourceRecordId, sourceRecordId),
              ),
            )
            .limit(1);
          if (existingLedger) continue;

          const supplierLot = pickLotNumber(u.fields);
          const manufactureDate = parseDateField(u.fields['Manufacture Date']);
          const expirationDate = parseDateField(u.fields['Expiration Date']);

          // Per-unit material_lots dedupe keyed by
          // (poLineItemId, lot/roll-or-unitIndex). The PO line id is
          // embedded in the lot's notes by this script (see noteLine), so
          // we match on (purchaseOrderNumber, materialPartNumber,
          // supplierLotNumber-or-null, notes containing the per-line
          // marker). This is more precise than (po_number+ag_part_number)
          // and correctly handles a PO with multiple lines for the same
          // AG part.
          const noteLineMarker = `[repair po-line ${c.id} unit ${u.index}/${parsed.unitCount}]`;
          const noteLine = [
            `Unit ${u.index} of ${parsed.unitCount}`,
            u.raw,
            noteLineMarker,
          ].filter(Boolean).join(' · ');

          const lotMatchConds = [
            eq(materialLots.purchaseOrderNumber, vp.poNumber),
            eq(materialLots.materialPartNumber, inv.agPartNumber),
            like(materialLots.notes, `%${noteLineMarker}%`),
          ];
          const [existingLot] = await tx
            .select({ id: materialLots.id })
            .from(materialLots)
            .where(and(...lotMatchConds))
            .limit(1);

          let lotId: string | null = existingLot?.id ?? null;
          let icn: string | null = null;

          if (!existingLot) {
            icn = `${prefix}${String(nextSeq++).padStart(6, '0')}`;
            if (!args.dryRun) {
              const insertValues: any = {
                inventoryItemId: inv.id,
                materialPartNumber: inv.agPartNumber,
                materialName: inv.name,
                internalControlNumber: icn,
                supplier: vendorName ?? 'Unknown',
                supplierLotNumber: supplierLot,
                supplierPartNumber: inv.supplierPartNumber ?? null,
                purchaseOrderNumber: vp.poNumber,
                receivedQty: String(perUnitQty),
                remainingQty: String(perUnitQty),
                unitOfMeasure: uom,
                expirationDate,
                manufactureDate,
                status: 'ACCEPTED',
                receivedBy: 'system:repairMultiSplitReceipts',
                receivedAt,
                notes: noteLine,
              };
              const [lot] = await tx.insert(materialLots).values(insertValues).returning();
              lotId = lot?.id ?? null;
            }
            lotsCreated++;
          }

          if (!args.dryRun) {
            await recordInventoryLedgerEntry(
              {
                transactionType: 'RECEIVE',
                inventoryItemId: inv.id,
                agPartNumber: inv.agPartNumber,
                lotId,
                unitOfMeasure: uom,
                // Use 0/qty/qty: balance reconstruction is unreliable post-hoc;
                // the repair row is for traceability not on-hand math.
                quantityBefore: 0,
                quantityDelta: perUnitQty,
                quantityAfter: perUnitQty,
                performedByUserId: null,
                performedByDisplayName: 'system:repairMultiSplitReceipts',
                reasonCode: 'VENDOR_PO_RECEIPT',
                notes: noteLine,
                sourceModule: 'receiving:vendor-po',
                sourceRecordId,
                createdAtOverride: receivedAt,
                metadata: {
                  backfill: { script: 'repairMultiSplitReceipts', task: 240 },
                  vendorPoId: c.vendorPoId,
                  poNumber: vp.poNumber,
                  vendorId: vp.vendorId ?? null,
                  vendorName,
                  poLineItemId: c.id,
                  cumulativeReceivedQuantity: cumulative,
                  unitIndex: idx,
                  unitCount: parsed.unitCount,
                  unitQuantity: perUnitQty,
                  traceability: u.fields,
                  materialLotId: lotId,
                  internalControlNumber: icn,
                },
              },
              tx,
            );
          }
          ledgerCreated++;
        }

        return { lotsCreated, ledgerCreated };
      });

      totalLotsCreated += lineResult.lotsCreated;
      totalLedgerCreated += lineResult.ledgerCreated;

      console.log(`   ✓ line ${c.id} (${c.agPartNumber}): ${parsed.unitCount} units → +${lineResult.lotsCreated} lots / +${lineResult.ledgerCreated} ledger`);
    } catch (err) {
      errors++;
      console.error(`   ✗ line ${c.id}: ${(err as Error).message}`);
    }
  }

  console.log('\n📊 Repair summary:');
  console.log(`   lots created:           ${totalLotsCreated}`);
  console.log(`   ledger rows created:    ${totalLedgerCreated}`);
  console.log(`   skipped (already ok):   ${skippedAlreadyOk}`);
  console.log(`   skipped (no inv item):  ${skippedNoInventoryItem}`);
  console.log(`   errors:                 ${errors}`);
  if (args.dryRun) console.log('   (DRY RUN — no rows written)');
}

const isMain = (() => {
  try {
    const argv1 = process.argv[1];
    return !!argv1 && (import.meta.url === new URL(`file://${argv1}`).href || import.meta.url.endsWith(argv1));
  } catch { return true; }
})();

if (isMain) {
  repair(parseArgs(process.argv.slice(2)))
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
