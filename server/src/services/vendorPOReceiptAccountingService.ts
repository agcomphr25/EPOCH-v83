import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  chartOfAccounts,
  inventoryItems,
  journalEntries,
  journalLines,
  vendorPOItems,
  vendorPOs,
  vendors,
} from '../../schema';
import { assertPostingAllowedForPeriod } from './accountingPeriodService';

type DbExecutor = typeof db | any;

type ReceiptAccrualInput = {
  poLineItemId: number;
  receivedQuantity: number;
  receivedDate: Date;
  cumulativeReceivedQuantity: number;
  createdBy?: string | number | null;
  notes?: string | null;
};

type ReceiptAccrualResult =
  | {
      journalEntryId: number;
      amount: number;
      receiptKey: string;
      debitAccount: string;
      creditAccount: string;
      skipped: false;
    }
  | {
      journalEntryId: null;
      amount: number;
      receiptKey: string;
      skipped: true;
      reason: string;
    };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function actorName(createdBy?: string | number | null): string | null {
  if (createdBy == null) return null;
  return String(createdBy);
}

async function getRequiredAccount(tx: DbExecutor, accountNumber: string, accountName: string) {
  const [byNumber] = await tx
    .select()
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.accountNumber, accountNumber))
    .limit(1);
  if (byNumber) return byNumber;

  const [byName] = await tx
    .select()
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.accountName, accountName))
    .limit(1);
  if (byName) return byName;

  throw new Error(`Required chart-of-accounts entry not found: ${accountNumber} ${accountName}`);
}

export async function createOrUpdateVendorPOReceiptAccrualJournalEntry(
  input: ReceiptAccrualInput,
  tx: DbExecutor = db,
): Promise<ReceiptAccrualResult> {
  const effectiveDate = input.receivedDate;
  await assertPostingAllowedForPeriod({
    effectiveDate,
    user: { username: actorName(input.createdBy) },
    postingMode: 'STANDARD',
  });

  const [line] = await tx
    .select({
      id: vendorPOItems.id,
      vendorPoId: vendorPOItems.vendorPoId,
      agPartNumber: vendorPOItems.agPartNumber,
      description: vendorPOItems.description,
      quantity: vendorPOItems.quantity,
      unitPrice: vendorPOItems.unitPrice,
      vendorUnit: vendorPOItems.vendorUnit,
      lineTotal: vendorPOItems.lineTotal,
      projectId: vendorPOItems.projectId,
      productionWorkOrderId: vendorPOItems.productionWorkOrderId,
      chargeCodeId: vendorPOItems.chargeCodeId,
    })
    .from(vendorPOItems)
    .where(eq(vendorPOItems.id, input.poLineItemId))
    .limit(1);

  if (!line) {
    throw new Error(`Vendor PO line ${input.poLineItemId} not found for receipt accrual`);
  }

  const receiptKey = `${line.id}:${input.cumulativeReceivedQuantity}`;
  const unitPrice = Number(line.unitPrice ?? 0);
  const amount = round2(Number(input.receivedQuantity) * unitPrice);

  if (!line.agPartNumber) {
    return {
      journalEntryId: null,
      amount,
      receiptKey,
      skipped: true,
      reason: 'Ad-hoc PO line has no AG part number; receipt accrual requires inventory identity.',
    };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      journalEntryId: null,
      amount: 0,
      receiptKey,
      skipped: true,
      reason: 'Receipt accrual requires a positive received quantity and unit price.',
    };
  }

  const [po] = await tx
    .select({
      id: vendorPOs.id,
      poNumber: vendorPOs.poNumber,
      vendorId: vendorPOs.vendorId,
      productionLine: vendorPOs.productionLine,
    })
    .from(vendorPOs)
    .where(eq(vendorPOs.id, line.vendorPoId))
    .limit(1);

  if (!po) {
    throw new Error(`Vendor PO ${line.vendorPoId} not found for receipt accrual`);
  }

  const [vendor] = await tx
    .select({ name: vendors.name })
    .from(vendors)
    .where(eq(vendors.id, po.vendorId))
    .limit(1);

  const [inventoryItem] = await tx
    .select({
      id: inventoryItems.id,
      agPartNumber: inventoryItems.agPartNumber,
      name: inventoryItems.name,
      purchaseUnit: inventoryItems.purchaseUnit,
      usageUnit: inventoryItems.usageUnit,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.agPartNumber, line.agPartNumber))
    .limit(1);

  const rawMaterialsInventory = await getRequiredAccount(tx, '12000', 'Inventory - Raw Materials');
  const grni = await getRequiredAccount(tx, '21100', 'GRNI - Received Not Invoiced');

  const [existingEntry] = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.transactionType, 'INVENTORY_RECEIPT_ACCRUAL'),
        eq(journalEntries.referenceType, 'vendor_po_receipt'),
        eq(journalEntries.referenceId, line.id),
        eq(journalEntries.sourceDocumentNumber, receiptKey),
      ),
    )
    .limit(1);

  if (existingEntry?.status === 'EXPORTED') {
    throw new Error(`Inventory receipt accrual journal entry ${existingEntry.id} is EXPORTED and cannot be changed`);
  }

  const createdBy = actorName(input.createdBy);
  const entryValues = {
    transactionType: 'INVENTORY_RECEIPT_ACCRUAL',
    referenceType: 'vendor_po_receipt',
    referenceId: line.id,
    effectiveDate,
    status: 'POSTED',
    memo: `Inventory receipt accrual for PO ${po.poNumber ?? po.id}, line ${line.id}`,
    sourceSystem: 'EPOCH',
    sourceDocumentType: 'VENDOR_PO_RECEIPT',
    sourceDocumentNumber: receiptKey,
    postingMode: 'STANDARD',
    postedAt: new Date(),
    postedBy: createdBy,
    createdBy,
  };

  let entryId: number;
  if (existingEntry) {
    entryId = existingEntry.id;
    await tx
      .update(journalEntries)
      .set({ ...entryValues, updatedAt: new Date() })
      .where(eq(journalEntries.id, existingEntry.id));
    await tx.delete(journalLines).where(eq(journalLines.journalEntryId, existingEntry.id));
  } else {
    const [entry] = await tx.insert(journalEntries).values(entryValues).returning();
    entryId = entry.id;
  }

  const commonDimensions = {
    projectId: line.projectId ? String(line.projectId) : null,
    productionLine: po.productionLine ?? null,
    chargeCodeId: line.chargeCodeId ?? null,
    inventoryItemId: inventoryItem?.id != null ? String(inventoryItem.id) : null,
    partNumber: line.agPartNumber,
    allowability: 'ALLOWABLE',
    directIndirect: line.projectId || line.productionWorkOrderId || line.chargeCodeId ? 'DIRECT' : 'UNASSIGNED',
    costPool: 'DIRECT',
    dimensionTags: {
      source: 'vendor_po_receipt',
      receiptKey,
      vendorPoId: po.id,
      poNumber: po.poNumber ?? null,
      poLineItemId: line.id,
      vendorId: po.vendorId,
      vendorName: vendor?.name ?? null,
      receivedQuantity: input.receivedQuantity,
      cumulativeReceivedQuantity: input.cumulativeReceivedQuantity,
      unitPrice,
      vendorUnit: line.vendorUnit ?? null,
      inventoryItemName: inventoryItem?.name ?? line.description ?? null,
      inventoryUnit: inventoryItem?.purchaseUnit ?? inventoryItem?.usageUnit ?? null,
      productionWorkOrderId: line.productionWorkOrderId ?? null,
      notes: input.notes ?? null,
    } as Record<string, unknown>,
  };

  await tx.insert(journalLines).values([
    {
      ...commonDimensions,
      journalEntryId: entryId,
      accountId: rawMaterialsInventory.id,
      debitAmount: amount,
      creditAmount: 0,
    },
    {
      ...commonDimensions,
      journalEntryId: entryId,
      accountId: grni.id,
      debitAmount: 0,
      creditAmount: amount,
    },
  ]);

  return {
    journalEntryId: entryId,
    amount,
    receiptKey,
    debitAccount: rawMaterialsInventory.accountName,
    creditAccount: grni.accountName,
    skipped: false,
  };
}
