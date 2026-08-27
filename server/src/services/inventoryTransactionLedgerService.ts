import crypto from 'crypto';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  inventoryBalances,
  inventoryItems,
  inventoryTransactionLedger,
  type InventoryTransactionLedger,
} from '../../schema';
import { canonicalize } from './auditLedgerService';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type LedgerTx = Pick<DbTransaction, 'insert' | 'select' | 'execute'>;

export type InventoryLedgerTransactionType =
  | 'RECEIVE'
  | 'ISSUE'
  | 'RETURN'
  | 'TRANSFER'
  | 'MOVE'
  | 'RESERVE'
  | 'UNRESERVE'
  | 'CONSUME'
  | 'ADJUST'
  | 'SCRAP'
  | 'SPLIT'
  | 'MERGE'
  | 'COUNT_ADJUSTMENT'
  | 'STATUS_CHANGE'
  | 'QUARANTINE'
  | 'RELEASE'
  | 'EXPIRE'
  | 'REVERSAL';

export type InventoryLedgerEntryInput = {
  transactionType: InventoryLedgerTransactionType;
  inventoryItemId: number;
  agPartNumber: string;
  lotId?: string | null;
  locationId?: string | null;
  quantityDelta: number | string;
  quantityBefore: number | string;
  quantityAfter: number | string;
  unitOfMeasure?: string | null;
  statusBefore?: string | null;
  statusAfter?: string | null;
  performedByUserId?: number | null;
  performedByDisplayName: string;
  approvedByUserId?: number | null;
  approvedByDisplayName?: string | null;
  approvalId?: string | null;
  projectId?: string | null;
  productionWorkOrderId?: string | null;
  travelerId?: string | null;
  travelerStepId?: string | null;
  chargeCodeId?: number | null;
  reasonCode?: string | null;
  notes?: string | null;
  digitalSignatureId?: string | null;
  sourceModule: string;
  sourceRecordId?: string | number | null;
  reversedTransactionId?: string | null;
  metadata?: Record<string, unknown> | null;
  /**
   * BACKFILL ONLY — preserves the original event timestamp for historical
   * rows reconstructed from pre-ledger source-of-truth tables (Task #183).
   * Live writers must omit this; the database default `now()` is then used.
   * The eventHash payload does NOT include createdAt, so back-dating a row
   * does not alter the chained hash.
   */
  createdAtOverride?: Date | null;
};

export type InventoryLedgerBalanceChangeInput = {
  agPartNumber: string;
  transactionType: InventoryLedgerTransactionType;
  lotId?: string | null;
  locationId?: string | null;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  unitOfMeasure?: string | null;
  performedBy?: string | null;
  referenceType?: string | null;
  referenceId?: string | number | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
};

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function toLedgerNumeric(value: number | string): string {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`INVENTORY LEDGER: invalid numeric value ${value}`);
  }
  return numericValue.toFixed(4);
}

function assertQuantityMath(input: Pick<InventoryLedgerEntryInput, 'quantityBefore' | 'quantityDelta' | 'quantityAfter'>): void {
  const before = Number(input.quantityBefore);
  const delta = Number(input.quantityDelta);
  const after = Number(input.quantityAfter);

  if (!Number.isFinite(before) || !Number.isFinite(delta) || !Number.isFinite(after)) {
    throw new Error('INVENTORY LEDGER: quantity values must be finite numbers');
  }

  if (Math.abs(before + delta - after) > 0.0001) {
    throw new Error(
      `INVENTORY LEDGER: quantity math mismatch. before=${before} delta=${delta} after=${after}`,
    );
  }
}

function transactionNumber(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ITL-${stamp}-${suffix}`;
}

function eventHash(input: InventoryLedgerEntryInput, txNumber: string): string {
  return sha256Hex(canonicalize({
    transactionNumber: txNumber,
    transactionType: input.transactionType,
    inventoryItemId: input.inventoryItemId,
    agPartNumber: input.agPartNumber,
    lotId: input.lotId ?? null,
    locationId: input.locationId ?? null,
    quantityDelta: toLedgerNumeric(input.quantityDelta),
    quantityBefore: toLedgerNumeric(input.quantityBefore),
    quantityAfter: toLedgerNumeric(input.quantityAfter),
    unitOfMeasure: input.unitOfMeasure ?? 'EA',
    statusBefore: input.statusBefore ?? null,
    statusAfter: input.statusAfter ?? null,
    performedByUserId: input.performedByUserId ?? null,
    performedByDisplayName: input.performedByDisplayName,
    sourceModule: input.sourceModule,
    sourceRecordId: input.sourceRecordId != null ? String(input.sourceRecordId) : null,
    reversedTransactionId: input.reversedTransactionId ?? null,
  }));
}

export async function recordInventoryLedgerEntry(
  input: InventoryLedgerEntryInput,
  tx?: LedgerTx,
): Promise<InventoryTransactionLedger> {
  if (!input.performedByDisplayName) {
    throw new Error('INVENTORY LEDGER: performedByDisplayName required');
  }
  if (!input.sourceModule) {
    throw new Error('INVENTORY LEDGER: sourceModule required');
  }
  if (input.transactionType === 'REVERSAL' && !input.reversedTransactionId) {
    throw new Error('INVENTORY LEDGER: reversal entries must link reversedTransactionId');
  }
  assertQuantityMath(input);

  const runner = tx ?? db;
  const txNumber = transactionNumber();
  const hash = eventHash(input, txNumber);

  const [inserted] = await runner
    .insert(inventoryTransactionLedger)
    .values({
      transactionNumber: txNumber,
      transactionType: input.transactionType,
      inventoryItemId: input.inventoryItemId,
      agPartNumber: input.agPartNumber,
      lotId: input.lotId ?? null,
      locationId: input.locationId ?? null,
      quantityDelta: toLedgerNumeric(input.quantityDelta),
      quantityBefore: toLedgerNumeric(input.quantityBefore),
      quantityAfter: toLedgerNumeric(input.quantityAfter),
      unitOfMeasure: input.unitOfMeasure ?? 'EA',
      statusBefore: input.statusBefore ?? null,
      statusAfter: input.statusAfter ?? null,
      performedByUserId: input.performedByUserId ?? null,
      performedByDisplayName: input.performedByDisplayName,
      approvedByUserId: input.approvedByUserId ?? null,
      approvedByDisplayName: input.approvedByDisplayName ?? null,
      approvalId: input.approvalId ?? null,
      projectId: input.projectId ?? null,
      productionWorkOrderId: input.productionWorkOrderId ?? null,
      travelerId: input.travelerId ?? null,
      travelerStepId: input.travelerStepId ?? null,
      chargeCodeId: input.chargeCodeId ?? null,
      reasonCode: input.reasonCode ?? null,
      notes: input.notes ?? null,
      digitalSignatureId: input.digitalSignatureId ?? null,
      sourceModule: input.sourceModule,
      sourceRecordId: input.sourceRecordId != null ? String(input.sourceRecordId) : null,
      eventHash: hash,
      reversedTransactionId: input.reversedTransactionId ?? null,
      metadata: input.metadata ?? null,
      ...(input.createdAtOverride ? { createdAt: input.createdAtOverride } : {}),
    })
    .returning();

  if (!inserted) {
    throw new Error('INVENTORY LEDGER: insert returned no row');
  }

  return inserted;
}

export async function recordInventoryBalanceLedgerChange(
  input: InventoryLedgerBalanceChangeInput,
  tx?: LedgerTx,
): Promise<InventoryTransactionLedger> {
  const runner = tx ?? db;
  const [item] = await runner
    .select({
      id: inventoryItems.id,
      agPartNumber: inventoryItems.agPartNumber,
      usageUnit: inventoryItems.usageUnit,
      purchaseUnit: inventoryItems.purchaseUnit,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.agPartNumber, input.agPartNumber));

  if (!item) {
    throw new Error(`INVENTORY LEDGER: part number ${input.agPartNumber} not found`);
  }

  return recordInventoryLedgerEntry({
    transactionType: input.transactionType,
    inventoryItemId: item.id,
    agPartNumber: item.agPartNumber,
    lotId: input.lotId ?? null,
    locationId: input.locationId ?? null,
    quantityDelta: input.quantityDelta,
    quantityBefore: input.quantityBefore,
    quantityAfter: input.quantityAfter,
    unitOfMeasure: input.unitOfMeasure ?? item.usageUnit ?? item.purchaseUnit ?? 'EA',
    performedByDisplayName: input.performedBy ?? 'system',
    reasonCode: input.referenceType ?? null,
    notes: input.notes ?? null,
    sourceModule: 'inventory',
    sourceRecordId: input.referenceId ?? null,
    metadata: input.metadata ?? null,
  }, tx);
}

export async function reverseInventoryLedgerEntry(params: {
  transactionId: string;
  performedByDisplayName: string;
  reasonCode: string;
  notes?: string | null;
  approvedByUserId?: number | null;
  approvedByDisplayName?: string | null;
  digitalSignatureId?: string | null;
  /** Phase 9 only: atomically restore the exact material lot and Receiving custody unit. */
  restoreMaterialCustody?: {
    materialLotId: string;
    receivedUnitId: number;
    quantity: number;
    materialRequirementId: string;
  };
}): Promise<InventoryTransactionLedger> {
  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(inventoryTransactionLedger)
      .where(eq(inventoryTransactionLedger.id, params.transactionId))
      .for('update');

    if (!original) {
      throw new Error(`INVENTORY LEDGER: transaction ${params.transactionId} not found`);
    }
    if (original.transactionType === 'REVERSAL') {
      throw new Error('INVENTORY LEDGER: reversal entries cannot be reversed directly');
    }

    const [existingReversal] = await tx
      .select({ id: inventoryTransactionLedger.id })
      .from(inventoryTransactionLedger)
      .where(eq(inventoryTransactionLedger.reversedTransactionId, original.id))
      .limit(1);

    if (existingReversal) {
      throw new Error(`INVENTORY LEDGER: transaction ${params.transactionId} already has a reversal`);
    }

    const [balance] = await tx
      .select({
        quantityOnHand: inventoryBalances.quantityOnHand,
      })
      .from(inventoryBalances)
      .where(sql`${inventoryBalances.agPartNumber} = ${original.agPartNumber} AND ${inventoryBalances.locationId} IS NOT DISTINCT FROM ${original.locationId}`)
      .limit(1);

    const currentQuantity = balance?.quantityOnHand ?? Number(original.quantityAfter);
    const reversalDelta = -Number(original.quantityDelta);

    if (params.restoreMaterialCustody) {
      const custody = params.restoreMaterialCustody;
      if (
        original.lotId !== custody.materialLotId ||
        reversalDelta !== custody.quantity ||
        reversalDelta <= 0
      )
        throw new Error('INVENTORY LEDGER: material custody reversal does not match the original transaction');
      const lotResult = await tx.execute(sql`
        SELECT id, internal_control_number, remaining_qty, status
        FROM material_lots WHERE id=${custody.materialLotId} FOR UPDATE
      `);
      const lot = lotResult.rows[0];
      if (!lot) throw new Error('INVENTORY LEDGER: material lot for reversal was not found');
      const unitResult = await tx.execute(sql`
        SELECT id, quantity FROM received_units
        WHERE id=${custody.receivedUnitId} AND material_lot_id=${custody.materialLotId}
        FOR UPDATE
      `);
      const unit = unitResult.rows[0];
      if (!unit) throw new Error('INVENTORY LEDGER: Receiving custody unit for reversal was not found');
      const lotBefore = Number(lot.remaining_qty);
      const lotAfter = lotBefore + custody.quantity;
      await tx.execute(sql`
        UPDATE material_lots SET remaining_qty=${lotAfter},status=${original.statusBefore ?? 'ACCEPTED'},updated_at=now()
        WHERE id=${custody.materialLotId}
      `);
      await tx.execute(sql`
        UPDATE received_units SET quantity=${Number(unit.quantity) + custody.quantity},updated_at=now()
        WHERE id=${custody.receivedUnitId}
      `);
      const requirementResult = await tx.execute(sql`
        SELECT issued_quantity FROM p2_manufacturing_work_order_material_requirements
        WHERE id=${custody.materialRequirementId} FOR UPDATE
      `);
      const requirement = requirementResult.rows[0];
      if (!requirement || Number(requirement.issued_quantity) < custody.quantity)
        throw new Error('INVENTORY LEDGER: released BOM demand cannot accept this reversal');
      await tx.execute(sql`
        UPDATE p2_manufacturing_work_order_material_requirements
        SET issued_quantity=${Number(requirement.issued_quantity) - custody.quantity},status='OPEN',updated_at=now()
        WHERE id=${custody.materialRequirementId}
      `);
      await tx.execute(sql`
        INSERT INTO material_lot_transactions
          (material_lot_id,internal_control_number,transaction_type,qty_before,qty_change,qty_after,reference_type,reference_id,performed_by,reason,notes)
        VALUES (${custody.materialLotId},${String(lot.internal_control_number)},'RETURN',${lotBefore},${custody.quantity},${lotAfter},'P2_CONSUMPTION_REVERSAL',${original.id},${params.performedByDisplayName},${params.reasonCode},${params.notes ?? null})
      `);
    }

    return recordInventoryLedgerEntry({
      transactionType: 'REVERSAL',
      inventoryItemId: original.inventoryItemId,
      agPartNumber: original.agPartNumber,
      lotId: original.lotId,
      locationId: original.locationId,
      quantityDelta: reversalDelta,
      quantityBefore: currentQuantity,
      quantityAfter: currentQuantity + reversalDelta,
      unitOfMeasure: original.unitOfMeasure,
      statusBefore: original.statusAfter,
      statusAfter: original.statusBefore,
      performedByDisplayName: params.performedByDisplayName,
      approvedByUserId: params.approvedByUserId ?? null,
      approvedByDisplayName: params.approvedByDisplayName ?? null,
      reasonCode: params.reasonCode,
      notes: params.notes ?? `Reversal of ${original.transactionNumber}`,
      digitalSignatureId: params.digitalSignatureId ?? null,
      sourceModule: 'inventory-ledger-reversal',
      sourceRecordId: original.id,
      reversedTransactionId: original.id,
      metadata: {
        originalTransactionNumber: original.transactionNumber,
        originalEventHash: original.eventHash,
      },
    }, tx);
  });
}

export async function listInventoryLedgerEntries(params: {
  agPartNumber?: string;
  lotId?: string;
  sourceModule?: string;
  limit?: number;
} = {}): Promise<InventoryTransactionLedger[]> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
  const conditions = [];
  if (params.agPartNumber) {
    conditions.push(eq(inventoryTransactionLedger.agPartNumber, params.agPartNumber));
  }
  if (params.lotId) {
    conditions.push(eq(inventoryTransactionLedger.lotId, params.lotId));
  }
  if (params.sourceModule) {
    conditions.push(eq(inventoryTransactionLedger.sourceModule, params.sourceModule));
  }

  return db
    .select()
    .from(inventoryTransactionLedger)
    .where(conditions.length ? sql.join(conditions, sql` AND `) : sql`TRUE`)
    .orderBy(desc(inventoryTransactionLedger.createdAt), asc(inventoryTransactionLedger.transactionNumber))
    .limit(limit);
}

export async function verifyInventoryLedgerHashes(params: {
  limit?: number;
} = {}): Promise<{
  checked: number;
  mismatches: Array<{ id: string; transactionNumber: string; expectedHash: string; actualHash: string }>;
}> {
  const limit = Math.min(Math.max(params.limit ?? 500, 1), 5000);
  const rows = await db
    .select()
    .from(inventoryTransactionLedger)
    .orderBy(asc(inventoryTransactionLedger.createdAt), asc(inventoryTransactionLedger.transactionNumber))
    .limit(limit);

  const mismatches = rows
    .map((row) => {
      const expectedHash = eventHash({
        transactionType: row.transactionType,
        inventoryItemId: row.inventoryItemId,
        agPartNumber: row.agPartNumber,
        lotId: row.lotId,
        locationId: row.locationId,
        quantityDelta: row.quantityDelta,
        quantityBefore: row.quantityBefore,
        quantityAfter: row.quantityAfter,
        unitOfMeasure: row.unitOfMeasure,
        statusBefore: row.statusBefore,
        statusAfter: row.statusAfter,
        performedByUserId: row.performedByUserId,
        performedByDisplayName: row.performedByDisplayName,
        sourceModule: row.sourceModule,
        sourceRecordId: row.sourceRecordId,
        reversedTransactionId: row.reversedTransactionId,
      }, row.transactionNumber);

      return expectedHash === row.eventHash
        ? null
        : {
            id: row.id,
            transactionNumber: row.transactionNumber,
            expectedHash,
            actualHash: row.eventHash,
          };
    })
    .filter((row): row is { id: string; transactionNumber: string; expectedHash: string; actualHash: string } => Boolean(row));

  return { checked: rows.length, mismatches };
}

/**
 * Re-compute and compare event hashes for an explicit list of ledger entry IDs.
 * Used by the Material Traceability Viewer to attest a reconstructed chain.
 */
export async function verifyInventoryLedgerHashesByIds(
  ids: string[],
): Promise<{
  checked: number;
  mismatches: Array<{ id: string; transactionNumber: string; expectedHash: string; actualHash: string }>;
}> {
  if (!ids.length) return { checked: 0, mismatches: [] };
  const rows = await db
    .select()
    .from(inventoryTransactionLedger)
    .where(inArray(inventoryTransactionLedger.id, ids));

  const mismatches = rows
    .map((row) => {
      const expectedHash = eventHash({
        transactionType: row.transactionType,
        inventoryItemId: row.inventoryItemId,
        agPartNumber: row.agPartNumber,
        lotId: row.lotId,
        locationId: row.locationId,
        quantityDelta: row.quantityDelta,
        quantityBefore: row.quantityBefore,
        quantityAfter: row.quantityAfter,
        unitOfMeasure: row.unitOfMeasure,
        statusBefore: row.statusBefore,
        statusAfter: row.statusAfter,
        performedByUserId: row.performedByUserId,
        performedByDisplayName: row.performedByDisplayName,
        sourceModule: row.sourceModule,
        sourceRecordId: row.sourceRecordId,
        reversedTransactionId: row.reversedTransactionId,
      }, row.transactionNumber);

      return expectedHash === row.eventHash
        ? null
        : {
            id: row.id,
            transactionNumber: row.transactionNumber,
            expectedHash,
            actualHash: row.eventHash,
          };
    })
    .filter((row): row is { id: string; transactionNumber: string; expectedHash: string; actualHash: string } => Boolean(row));

  return { checked: rows.length, mismatches };
}
