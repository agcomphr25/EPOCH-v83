import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  cuttingBuiltPacketFabricSources,
  cuttingFabricInventory,
  cuttingFabricInventoryTransactions,
  cuttingPacketBOMCuts,
  cuttingPacketSessionLots,
  inventoryBalances,
  inventoryTransactionLedger,
  inventoryTransactions,
  materialLotReservations,
  materialLots,
  materialLotTransactions,
  projectReceivedMaterials,
  receiptAuditLog,
  receiptLines,
  receipts,
  receivedUnits,
  travelerMaterialConsumption,
  vendorPOItems,
  vendorPOs,
} from '../../schema';
import { recordInventoryLedgerEntry } from './inventoryTransactionLedgerService';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class ReceiptReversalError extends Error {
  constructor(message: string, public readonly status = 422, public readonly blockers: string[] = []) {
    super(message);
  }
}

export interface ReceiptReversalActor {
  userId: number | null;
  employeeId: number | null;
  displayName: string;
}

async function hasRow(query: PromiseLike<unknown[]>): Promise<boolean> {
  return (await query).length > 0;
}

async function unitBlockers(tx: Tx, unit: typeof receivedUnits.$inferSelect, fabricId?: string): Promise<string[]> {
  const blockers: string[] = [];
  if (unit.materialLotId) {
    if (await hasRow(tx.select({ id: travelerMaterialConsumption.id }).from(travelerMaterialConsumption)
      .where(or(eq(travelerMaterialConsumption.receivedUnitId, unit.id), eq(travelerMaterialConsumption.materialLotId, unit.materialLotId))).limit(1))) {
      blockers.push(`${unit.barcode}: material has traveler consumption`);
    }
    if (await hasRow(tx.select({ id: materialLotReservations.id }).from(materialLotReservations)
      .where(and(eq(materialLotReservations.materialLotId, unit.materialLotId), ne(materialLotReservations.status, 'cancelled'))).limit(1))) {
      blockers.push(`${unit.barcode}: material has an active or fulfilled reservation`);
    }
    if (await hasRow(tx.select({ id: materialLotTransactions.id }).from(materialLotTransactions)
      .where(and(eq(materialLotTransactions.materialLotId, unit.materialLotId), ne(materialLotTransactions.transactionType, 'RECEIVE'))).limit(1))) {
      blockers.push(`${unit.barcode}: material lot has downstream transactions`);
    }
  }
  if (await hasRow(tx.select({ id: projectReceivedMaterials.id }).from(projectReceivedMaterials)
    .where(eq(projectReceivedMaterials.receivedUnitId, unit.id)).limit(1))) {
    blockers.push(`${unit.barcode}: material is assigned to a project`);
  }
  if (fabricId) {
    if (await hasRow(tx.select({ id: cuttingFabricInventoryTransactions.id }).from(cuttingFabricInventoryTransactions)
      .where(and(eq(cuttingFabricInventoryTransactions.fabricInventoryId, fabricId), ne(cuttingFabricInventoryTransactions.changeType, 'RECEIPT'))).limit(1))) {
      blockers.push(`${unit.barcode}: fabric roll has downstream inventory activity`);
    }
    if (await hasRow(tx.select({ id: cuttingPacketSessionLots.id }).from(cuttingPacketSessionLots)
      .where(eq(cuttingPacketSessionLots.fabricInventoryId, fabricId)).limit(1))) blockers.push(`${unit.barcode}: fabric roll is used by a packet session`);
    if (await hasRow(tx.select({ id: cuttingPacketBOMCuts.id }).from(cuttingPacketBOMCuts)
      .where(eq(cuttingPacketBOMCuts.fabricInventoryId, fabricId)).limit(1))) blockers.push(`${unit.barcode}: fabric roll has recorded cuts`);
    if (await hasRow(tx.select({ id: cuttingBuiltPacketFabricSources.id }).from(cuttingBuiltPacketFabricSources)
      .where(eq(cuttingBuiltPacketFabricSources.fabricInventoryId, fabricId)).limit(1))) blockers.push(`${unit.barcode}: fabric roll is linked to a built packet`);
  }
  return blockers;
}

async function loadReceiptForReversal(tx: Tx, receiptId: number) {
  const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).for('update');
  if (!receipt) throw new ReceiptReversalError('Receipt not found', 404);
  const units = await tx.select().from(receivedUnits).where(eq(receivedUnits.receiptId, receiptId)).orderBy(receivedUnits.unitSequence);
  const lines = await tx.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId));
  const fabricRows = units.length === 0 ? [] : await tx.select().from(cuttingFabricInventory).where(or(
    inArray(cuttingFabricInventory.barcode, units.map(unit => unit.barcode)),
    inArray(cuttingFabricInventory.internalControlNumber, units.map(unit => unit.internalControlNumber).filter((value): value is string => Boolean(value))),
  ));
  return { receipt, units, lines, fabricRows };
}

export async function previewReceiptReversal(receiptId: number) {
  return db.transaction(async tx => {
    const context = await loadReceiptForReversal(tx, receiptId);
    const blockers: string[] = [];
    const fabricByUnit = new Map(context.fabricRows.flatMap(row => [row.barcode, row.internalControlNumber].filter(Boolean).map(key => [key!, row] as const)));
    for (const unit of context.units) {
      blockers.push(...await unitBlockers(tx, unit, fabricByUnit.get(unit.barcode)?.id ?? fabricByUnit.get(unit.internalControlNumber ?? '')?.id));
    }
    return {
      receiptId,
      receiptNumber: context.receipt.receiptNumber,
      status: context.receipt.status,
      vendorPoId: context.receipt.vendorPoId,
      vendorPoNumber: context.receipt.vendorPoNumber,
      unitCount: context.units.length,
      totalQuantity: context.units.reduce((sum, unit) => sum + Number(unit.quantity), 0),
      blockers,
      canReverse: context.units.length > 0 && blockers.length === 0 && context.receipt.status !== 'cancelled',
    };
  });
}

export async function reverseReceipt(receiptId: number, reason: string, actor: ReceiptReversalActor) {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 10) throw new ReceiptReversalError('A reversal reason of at least 10 characters is required', 400);

  return db.transaction(async tx => {
    const { receipt, units, lines, fabricRows } = await loadReceiptForReversal(tx, receiptId);
    if (receipt.status === 'cancelled') {
      const prior = await tx.select({ id: receiptAuditLog.id }).from(receiptAuditLog)
        .where(and(eq(receiptAuditLog.receiptId, receiptId), eq(receiptAuditLog.action, 'receipt_reversed'))).limit(1);
      if (prior.length) return { alreadyReversed: true, receiptNumber: receipt.receiptNumber, reversedUnits: 0 };
      throw new ReceiptReversalError('Cancelled receipts without a reversal audit event cannot be reversed automatically');
    }
    if (units.length === 0) throw new ReceiptReversalError('Receipt has no units to reverse');

    const fabricByUnit = new Map(fabricRows.flatMap(row => [row.barcode, row.internalControlNumber].filter(Boolean).map(key => [key!, row] as const)));
    const blockers: string[] = [];
    for (const unit of units) blockers.push(...await unitBlockers(tx, unit, fabricByUnit.get(unit.barcode)?.id ?? fabricByUnit.get(unit.internalControlNumber ?? '')?.id));
    if (blockers.length) throw new ReceiptReversalError('Receipt reversal blocked by downstream usage', 409, blockers);

    for (const unit of units) {
      const quantity = Number(unit.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new ReceiptReversalError(`${unit.barcode}: invalid quantity`);
      const [originalEvent] = await tx.select().from(inventoryTransactions).where(and(
        eq(inventoryTransactions.transactionType, 'receipt'),
        eq(inventoryTransactions.referenceType, 'RECEIVED_UNIT'),
        eq(inventoryTransactions.referenceId, String(unit.id)),
      )).limit(1);
      if (!originalEvent) throw new ReceiptReversalError(`${unit.barcode}: original inventory receipt transaction is missing`);
      const location = originalEvent.toLocation || unit.location || 'WAREHOUSE-MAIN';
      const [balance] = await tx.select().from(inventoryBalances).where(and(
        eq(inventoryBalances.agPartNumber, originalEvent.agPartNumber),
        eq(inventoryBalances.locationId, location),
      )).for('update');
      if (!balance || balance.quantityOnHand - quantity < balance.quantityAllocated) {
        throw new ReceiptReversalError(`${unit.barcode}: available inventory is insufficient for reversal`, 409);
      }
      const nextOnHand = balance.quantityOnHand - quantity;
      await tx.update(inventoryBalances).set({
        quantityOnHand: nextOnHand,
        quantityAvailable: nextOnHand - balance.quantityAllocated,
        updatedAt: new Date(),
      }).where(eq(inventoryBalances.id, balance.id));
      await tx.insert(inventoryTransactions).values({
        agPartNumber: originalEvent.agPartNumber,
        transactionType: 'adjustment',
        quantity: -quantity,
        unitOfMeasure: originalEvent.unitOfMeasure,
        fromLocation: location,
        referenceType: 'RECEIPT_REVERSAL',
        referenceId: String(unit.id),
        performedBy: actor.displayName,
        notes: `Reversal of receipt ${receipt.receiptNumber}: ${trimmedReason}`,
        metadata: { receiptId, receiptNumber: receipt.receiptNumber, receivedUnitId: unit.id, reversedInventoryTransactionId: originalEvent.id, reason: trimmedReason },
      });

      const originalLedgerEntries = await tx.select().from(inventoryTransactionLedger).where(and(
        eq(inventoryTransactionLedger.sourceRecordId, String(unit.id)),
        eq(inventoryTransactionLedger.transactionType, 'RECEIVE'),
      ));
      for (const originalLedger of originalLedgerEntries) {
        const existing = await tx.select({ id: inventoryTransactionLedger.id }).from(inventoryTransactionLedger)
          .where(eq(inventoryTransactionLedger.reversedTransactionId, originalLedger.id)).limit(1);
        if (!existing.length) await recordInventoryLedgerEntry({
          transactionType: 'REVERSAL',
          inventoryItemId: originalLedger.inventoryItemId,
          agPartNumber: originalLedger.agPartNumber,
          lotId: originalLedger.lotId,
          locationId: originalLedger.locationId,
          quantityDelta: -Number(originalLedger.quantityDelta),
          quantityBefore: Number(originalLedger.quantityAfter),
          quantityAfter: Number(originalLedger.quantityAfter) - Number(originalLedger.quantityDelta),
          unitOfMeasure: originalLedger.unitOfMeasure,
          statusBefore: originalLedger.statusAfter,
          statusAfter: originalLedger.statusBefore,
          performedByUserId: actor.userId,
          performedByDisplayName: actor.displayName,
          reasonCode: 'DUPLICATE_RECEIPT_REVERSAL',
          notes: trimmedReason,
          sourceModule: 'receiving-reversal',
          sourceRecordId: String(unit.id),
          reversedTransactionId: originalLedger.id,
          metadata: { receiptId, receiptNumber: receipt.receiptNumber, originalTransactionNumber: originalLedger.transactionNumber },
        }, tx);
      }

      if (unit.materialLotId) {
        const [lot] = await tx.select().from(materialLots).where(eq(materialLots.id, unit.materialLotId)).for('update');
        if (lot) {
          await tx.insert(materialLotTransactions).values({
            materialLotId: lot.id,
            internalControlNumber: lot.internalControlNumber,
            transactionType: 'ADJUST',
            qtyBefore: lot.remainingQty,
            qtyChange: String(-quantity),
            qtyAfter: '0',
            referenceType: 'RECEIPT_REVERSAL',
            referenceId: String(unit.id),
            receiptId,
            performedBy: actor.displayName,
            reason: trimmedReason,
            notes: `Voided duplicate receipt ${receipt.receiptNumber}`,
          });
          await tx.update(materialLots).set({ status: 'REJECTED', remainingQty: '0', lockedReason: `Receipt reversed: ${trimmedReason}`, lockedAt: new Date(), updatedAt: new Date() }).where(eq(materialLots.id, lot.id));
        }
      }

      const fabric = fabricByUnit.get(unit.barcode) ?? fabricByUnit.get(unit.internalControlNumber ?? '');
      if (fabric) {
        await tx.insert(cuttingFabricInventoryTransactions).values({
          fabricInventoryId: fabric.id,
          changeType: 'ADJUSTMENT',
          quantityDelta: -Math.max(1, Math.round(quantity)),
          performedBy: actor.displayName,
          notes: `Receipt reversal ${receipt.receiptNumber}: ${trimmedReason}`,
        });
        await tx.update(cuttingFabricInventory).set({
          quantityInStock: 0,
          squareMeters: '0',
          status: 'depleted',
          depletedAt: new Date(),
          depletedBy: actor.displayName,
          notes: sql`COALESCE(${cuttingFabricInventory.notes}, '') || ${`\nREVERSED ${receipt.receiptNumber}: ${trimmedReason}`}`,
          updatedAt: new Date(),
        }).where(eq(cuttingFabricInventory.id, fabric.id));
      }

      await tx.update(receivedUnits).set({
        disposition: 'rejected',
        dispositionNotes: `REVERSED DUPLICATE RECEIPT: ${trimmedReason}`,
        dispositionByUserId: actor.employeeId,
        dispositionByDisplayName: actor.displayName,
        dispositionAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(receivedUnits.id, unit.id));
    }

    for (const line of lines) await tx.update(receiptLines).set({
      receivedQty: '0', isPartial: false, isOver: false,
      notes: sql`COALESCE(${receiptLines.notes}, '') || ${`\nREVERSED ${receipt.receiptNumber}: ${trimmedReason}`}`,
      updatedAt: new Date(),
    }).where(eq(receiptLines.id, line.id));

    await tx.update(receipts).set({
      status: 'cancelled',
      notes: sql`COALESCE(${receipts.notes}, '') || ${`\nREVERSED: ${trimmedReason}`}`,
      updatedAt: new Date(),
    }).where(eq(receipts.id, receiptId));

    let vendorPoStatus: string | null = null;
    if (receipt.vendorPoId) {
      const poItems = await tx.select().from(vendorPOItems).where(eq(vendorPOItems.vendorPoId, receipt.vendorPoId));
      const activeReceipts = await tx.select({ receivedQty: receiptLines.receivedQty, vendorPoItemId: receiptLines.vendorPoItemId })
        .from(receiptLines).innerJoin(receipts, eq(receipts.id, receiptLines.receiptId))
        .where(and(eq(receipts.vendorPoId, receipt.vendorPoId), ne(receipts.status, 'cancelled')));
      const receivedByItem = new Map<number, number>();
      for (const row of activeReceipts) if (row.vendorPoItemId != null) receivedByItem.set(row.vendorPoItemId, (receivedByItem.get(row.vendorPoItemId) ?? 0) + Number(row.receivedQty));
      const anyReceived = Array.from(receivedByItem.values()).some(value => value > 0);
      const allReceived = poItems.length > 0 && poItems.every(item => (receivedByItem.get(item.id) ?? 0) >= Number(item.quantity ?? 0));
      vendorPoStatus = allReceived ? 'Fully Received' : anyReceived ? 'Partially Received' : 'Sent';
      await tx.update(vendorPOs).set({ status: vendorPoStatus, updatedAt: new Date() }).where(eq(vendorPOs.id, receipt.vendorPoId));
    }

    await tx.insert(receiptAuditLog).values({
      receiptId,
      action: 'receipt_reversed',
      actorUserId: actor.employeeId,
      actorDisplayName: actor.displayName,
      metadata: { reason: trimmedReason, reversedUnitIds: units.map(unit => unit.id), reversedQuantity: units.reduce((sum, unit) => sum + Number(unit.quantity), 0), vendorPoId: receipt.vendorPoId, vendorPoStatus },
    });
    return { alreadyReversed: false, receiptNumber: receipt.receiptNumber, reversedUnits: units.length, reversedQuantity: units.reduce((sum, unit) => sum + Number(unit.quantity), 0), vendorPoStatus };
  });
}
