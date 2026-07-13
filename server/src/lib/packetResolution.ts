import { eq, like, and } from 'drizzle-orm';
import { db } from '../../db';
import {
  cuttingBuiltPackets,
  cuttingBuiltPacketFabricSources,
  cuttingFabricInventory,
  cuttingPacketBOMs,
  cuttingPacketCompositions,
  manufacturingQueue,
} from '../../schema';

export type PacketResolutionResult = {
  source: 'built_packet' | 'manufacturing_queue';
  packetRecord: typeof cuttingBuiltPackets.$inferSelect | null;
  queueItem: typeof manufacturingQueue.$inferSelect | null;
  barcode: string;
  packetNumber: number;
  backfillAttempted: boolean;
  backfillResult: 'created' | 'existed' | 'skipped' | null;
};

export async function backfillPacketFromQueue(
  queueItem: typeof manufacturingQueue.$inferSelect,
  barcode: string,
  packetNumber: number,
  fabricRolls: any[]
): Promise<'created' | 'existed' | 'skipped'> {
  try {
    let productCategoryId: string | null = null;
    if (queueItem.inventoryItemId) {
      const [bom] = await db
        .select({ productCategoryId: cuttingPacketBOMs.productCategoryId })
        .from(cuttingPacketBOMs)
        .where(eq(cuttingPacketBOMs.inventoryItemId, queueItem.inventoryItemId))
        .limit(1);
      if (bom?.productCategoryId) {
        productCategoryId = bom.productCategoryId;
      }
    }

    if (!productCategoryId && queueItem.inventoryItemId) {
      const [comp] = await db
        .select({ productCategoryId: cuttingPacketCompositions.productCategoryId })
        .from(cuttingPacketCompositions)
        .where(eq(cuttingPacketCompositions.inventoryItemId, queueItem.inventoryItemId))
        .limit(1);
      if (comp?.productCategoryId) {
        productCategoryId = comp.productCategoryId;
      }
    }

    if (!productCategoryId) {
      console.warn(
        `[backfillPacketFromQueue] Skipping backfill for barcode ${barcode}: ` +
        `productCategoryId could not be resolved for inventoryItemId ${queueItem.inventoryItemId}`
      );
      return 'skipped';
    }

    const buildDate = queueItem.completedAt ?? queueItem.startedAt ?? new Date();
    const orderRef = queueItem.parentProductionOrderId ?? queueItem.sourceId ?? null;
    const buildDateObj = buildDate instanceof Date ? buildDate : new Date(buildDate);
    const sourceValues = fabricRolls.map((roll: any, idx: number) => ({
      fabricInventoryId: roll.fabricInventoryId ?? null,
      fabricType: roll.fabricType ?? null,
      lotNumber: roll.lotNumber ?? null,
      batchNumber: roll.batchNumber ?? null,
      rollNumber: roll.rollNumber ?? null,
      supplierPartNumber: roll.supplierPartNumber ?? null,
      internalControlNumber: roll.internalControlNumber ?? null,
      expirationDate: roll.expirationDate ?? null,
      quantityUsed: roll.quantityUsed != null ? Math.round(Number(roll.quantityUsed)) : 1,
      isPrimary: roll.isPrimary ?? (idx === 0),
    }));

    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(cuttingBuiltPackets)
        .values({
          barcode,
          packetNumber,
          productCategoryId,
          buildDate: buildDateObj,
          status: 'AVAILABLE',
          isMixedFabric: fabricRolls.length > 1,
          fabricSourceCount: fabricRolls.length,
          allocatedToOrder: orderRef,
          notes: `Backfilled from queue item #${queueItem.id} on first barcode scan`,
          createdBy: 'system:backfill',
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        return 'existed' as const;
      }

      const packetId = inserted[0].id;
      if (sourceValues.length > 0) {
        await tx.insert(cuttingBuiltPacketFabricSources).values(
          sourceValues.map((s) => ({ ...s, builtPacketId: packetId }))
        );
      }

      return 'created' as const;
    });

    if (result === 'created') {
      console.log(
        `[backfillPacketFromQueue] Backfilled packet ${barcode} ` +
        `with ${fabricRolls.length} source(s) from queue item #${queueItem.id}`
      );
    }
    return result;
  } catch (err: any) {
    console.error(`[backfillPacketFromQueue] Failed to backfill barcode ${barcode}:`, err.message);
    return 'skipped';
  }
}

export async function resolvePacketBarcode(barcode: string): Promise<PacketResolutionResult | null> {
  const normalizedBarcode = barcode.trim().toUpperCase();
  if (!normalizedBarcode) return null;

  const [directPacket] = await db
    .select()
    .from(cuttingBuiltPackets)
    .where(eq(cuttingBuiltPackets.barcode, normalizedBarcode))
    .limit(1);

  if (directPacket) {
    return {
      source: 'built_packet',
      packetRecord: directPacket,
      queueItem: null,
      barcode: normalizedBarcode,
      packetNumber: directPacket.packetNumber ?? 1,
      backfillAttempted: false,
      backfillResult: null,
    };
  }

  const mfgMatch = normalizedBarcode.match(/^MFG-(\d+)-([^-]+)(?:-(\d+))?$/);
  if (!mfgMatch) {
    return null;
  }

  const queueId = parseInt(mfgMatch[1], 10);
  const [queueItem] = await db
    .select()
    .from(manufacturingQueue)
    .where(eq(manufacturingQueue.id, queueId))
    .limit(1);

  if (!queueItem) {
    return null;
  }

  const parsedPacketNumber = mfgMatch[3] ? parseInt(mfgMatch[3], 10) : null;

  let builtPacketForQueue: typeof cuttingBuiltPackets.$inferSelect | undefined;

  const [exactPacket] = await db
    .select()
    .from(cuttingBuiltPackets)
    .where(eq(cuttingBuiltPackets.barcode, normalizedBarcode))
    .limit(1);
  builtPacketForQueue = exactPacket;

  // Stored packet barcodes follow the format `PKT-{partNumber}-{queueId}-{packetNumber}-{timestamp}`.
  // The scanned MFG- label is only a display barcode, so resolve it back to the PKT row using a
  // strict (queueId, packetNumber) match.  We deliberately do NOT fall back to "the most recently
  // built packet for this queue" — historically that path returned a sibling packet's fabric rolls
  // when the scanned packet number had not yet been built, which silently autofilled the wrong
  // material ICNs into the P2 Traveler.  See Task #43.
  if (!builtPacketForQueue && parsedPacketNumber !== null) {
    const [seqPacket] = await db
      .select()
      .from(cuttingBuiltPackets)
      .where(
        and(
          like(cuttingBuiltPackets.barcode, `PKT-%-${queueId}-${parsedPacketNumber}-%`),
          eq(cuttingBuiltPackets.packetNumber, parsedPacketNumber)
        )
      )
      .limit(1);
    builtPacketForQueue = seqPacket;
  }

  if (builtPacketForQueue) {
    return {
      source: 'built_packet',
      packetRecord: builtPacketForQueue,
      queueItem,
      barcode: normalizedBarcode,
      packetNumber: builtPacketForQueue.packetNumber ?? 1,
      backfillAttempted: false,
      backfillResult: null,
    };
  }

  const packetNumber = parseInt(mfgMatch[3] || '1', 10);

  let fabricRolls: any[] = [];
  if (queueItem.materialDetails) {
    try {
      const stored = JSON.parse(queueItem.materialDetails);
      if (Array.isArray(stored) && stored.length > 0) {
        fabricRolls = stored.map((s: any) => ({
          fabricInventoryId: s.fabricInventoryId,
          fabricType: s.fabricType,
          lotNumber: s.lotNumber,
          batchNumber: s.batchNumber,
          rollNumber: s.rollNumber,
          supplierPartNumber: s.supplierPartNumber,
          internalControlNumber: s.internalControlNumber,
          expirationDate: s.expirationDate,
          quantityUsed: s.quantityUsed,
          isPrimary: s.isPrimary ?? true,
          source: s.source || s.supplier,
          squareMeters: s.squareMeters,
          receivedDate: s.receivedDate,
        }));
      }
    } catch { /* ignore JSON parse errors */ }
  }

  if (fabricRolls.length === 0 && (queueItem.fabricLot || queueItem.fabricBatch || queueItem.fabricRoll)) {
    fabricRolls = [{
      lotNumber: queueItem.fabricLot,
      batchNumber: queueItem.fabricBatch,
      rollNumber: queueItem.fabricRoll,
      internalControlNumber: queueItem.fabricLot || queueItem.fabricBatch,
      isPrimary: true,
    }];
  }

  // Backfill is a persistence side-effect only.  We deliberately do NOT re-query for the
  // freshly-backfilled packet and reclassify the response as `built_packet`, because the
  // data the caller is about to act on is still planned-order data (not authoritative
  // cutting-table data).  Keeping `source: 'manufacturing_queue'` ensures downstream
  // callers — especially the traveler completion pre-flight — treat this resolution as
  // queue-derived and surface the same warning path as before any backfill ran.  See Task #43.
  let backfillResult: 'created' | 'existed' | 'skipped' | null = null;
  if (fabricRolls.length > 0) {
    backfillResult = await backfillPacketFromQueue(queueItem, normalizedBarcode, packetNumber, fabricRolls);
  }

  return {
    source: 'manufacturing_queue',
    packetRecord: null,
    queueItem,
    barcode: normalizedBarcode,
    packetNumber,
    backfillAttempted: fabricRolls.length > 0,
    backfillResult,
  };
}
