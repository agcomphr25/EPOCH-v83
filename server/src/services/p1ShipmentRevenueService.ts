import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  allOrders,
  chartOfAccounts,
  customers,
  journalEntries,
  journalLines,
  payments,
  purchaseOrderItems,
  purchaseOrders,
  shipmentAccountingSnapshots,
  shipmentItems,
  shipmentRecords,
} from '../../schema';
import {
  assertRevenueStream,
  classifyRevenueStream,
  type RevenueStream,
  type RevenueStreamClassification,
} from './revenueStreamClassifier';

type DbExecutor = typeof db | any;

type MoneyParts = {
  productRevenue: number;
  shippingIncome: number;
  discountAmount: number;
  netReceivable: number;
};

type DimensionSeed = {
  customerId: string | null;
  customerName: string | null;
  customerType: string | null;
  orderId: string | null;
  source: 'p1_standard_shipment_revenue' | 'p1_po_shipment_revenue';
  sourceId: string;
  sourceDocumentNumber: string;
  revenueStream: RevenueStream;
  revenueClassification: RevenueStreamClassification;
  extraTags?: Record<string, unknown>;
};

function money(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
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

async function getP1OrderPaymentTotal(tx: DbExecutor, orderId: string | null): Promise<number> {
  if (!orderId) return 0;
  const [row] = await tx
    .select({
      total: sql<number>`COALESCE(SUM(${payments.paymentAmount}), 0)`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.orderId, orderId),
        sql`${payments.status} IS DISTINCT FROM 'voided'`,
        sql`${payments.status} IS DISTINCT FROM 'reversal'`,
        sql`${payments.paymentType} IS DISTINCT FROM 'payment_reversal'`,
      ),
    );
  return money(row?.total ?? 0);
}

async function getP1OrderCustomer(tx: DbExecutor, orderId: string | null) {
  if (!orderId) return { order: null, customer: null };
  const [order] = await tx
    .select()
    .from(allOrders)
    .where(eq(allOrders.orderId, orderId))
    .limit(1);

  let customer: typeof customers.$inferSelect | null = null;
  const numericCustomerId = order?.customerId ? Number(order.customerId) : Number.NaN;
  if (Number.isInteger(numericCustomerId)) {
    const [byId] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, numericCustomerId))
      .limit(1);
    customer = byId ?? null;
  }
  if (!customer && order?.customerId) {
    const [byKey] = await tx
      .select()
      .from(customers)
      .where(eq(customers.customerKey, order.customerId))
      .limit(1);
    customer = byKey ?? null;
  }

  return { order: order ?? null, customer };
}

async function upsertDraftRevenueEntry(
  tx: DbExecutor,
  key: {
    referenceType: string;
    referenceId: number;
    referenceUuid?: string | null;
    sourceDocumentType: string;
  },
  parts: MoneyParts,
  seed: DimensionSeed,
  paidAmount: number,
  effectiveDate: Date,
  user?: { username?: string | null } | null,
) {
  const productRevenue = money(parts.productRevenue);
  const shippingIncome = money(parts.shippingIncome);
  const discountAmount = money(parts.discountAmount);
  const netReceivable = money(parts.netReceivable || productRevenue + shippingIncome - discountAmount);

  if (netReceivable <= 0 && productRevenue <= 0 && shippingIncome <= 0) {
    return null;
  }

  const accountsReceivable = await getRequiredAccount(tx, '11000', 'Accounts Receivable');
  const customerDeposits = await getRequiredAccount(tx, '20600', 'Customer Deposits');
  const productRevenueAccount = await getRequiredAccount(tx, '41000', 'Product Revenue');
  const shippingIncomeAccount = shippingIncome > 0 ? await getRequiredAccount(tx, '43000', 'Shipping Income') : null;
  const discountAccount = discountAmount > 0 ? await getRequiredAccount(tx, '49000', 'Discounts and Allowances') : null;

  const depositApplied = money(Math.min(Math.max(paidAmount, 0), Math.max(netReceivable, 0)));
  const arAmount = money(Math.max(netReceivable - depositApplied, 0));

  const [existingEntry] = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.transactionType, 'P1_SHIPMENT_REVENUE'),
        eq(journalEntries.referenceType, key.referenceType),
        key.referenceUuid
          ? eq(journalEntries.referenceUuid, key.referenceUuid)
          : eq(journalEntries.referenceId, key.referenceId),
      ),
    )
    .limit(1);

  if (existingEntry?.status === 'EXPORTED' || existingEntry?.status === 'POSTED') {
    return { journalEntryId: existingEntry.id, alreadyPosted: true };
  }

  const entryValues = {
    transactionType: 'P1_SHIPMENT_REVENUE',
    referenceType: key.referenceType,
    referenceId: key.referenceId,
    referenceUuid: key.referenceUuid ?? null,
    effectiveDate,
    memo: `P1 shipment revenue - ${seed.sourceDocumentNumber}`,
    status: 'DRAFT',
    sourceSystem: 'EPOCH',
    sourceDocumentType: key.sourceDocumentType,
    sourceDocumentNumber: seed.sourceDocumentNumber,
    postingMode: 'STANDARD',
    createdBy: user?.username || null,
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
    journalEntryId: entryId,
    customerId: seed.customerId,
    customerNameSnapshot: seed.customerName,
    customerType: seed.customerType,
    productionLine: 'P1',
    allowability: 'ALLOWABLE',
    directIndirect: 'DIRECT',
    costPool: 'DIRECT',
    dimensionTags: {
      source: seed.source,
      revenueStream: seed.revenueStream,
      revenueRecognitionTiming: seed.revenueClassification.recognitionTiming,
      revenuePaymentTerms: seed.revenueClassification.paymentTerms,
      revenueClassificationReason: seed.revenueClassification.reason,
      productionLine: 'P1',
      sourceId: seed.sourceId,
      p1OrderId: seed.orderId,
      productRevenue,
      shippingIncome,
      discountAmount,
      netReceivable,
      paidAmount,
      depositApplied,
      arAmount,
      ...seed.extraTags,
    } as Record<string, unknown>,
  };

  const lines: (typeof journalLines.$inferInsert)[] = [];
  if (depositApplied > 0) {
    lines.push({
      ...commonDimensions,
      accountId: customerDeposits.id,
      debitAmount: depositApplied,
      creditAmount: 0,
    });
  }
  if (arAmount > 0) {
    lines.push({
      ...commonDimensions,
      accountId: accountsReceivable.id,
      debitAmount: arAmount,
      creditAmount: 0,
    });
  }
  if (discountAmount > 0 && discountAccount) {
    lines.push({
      ...commonDimensions,
      accountId: discountAccount.id,
      debitAmount: discountAmount,
      creditAmount: 0,
    });
  }
  if (productRevenue > 0) {
    lines.push({
      ...commonDimensions,
      accountId: productRevenueAccount.id,
      debitAmount: 0,
      creditAmount: productRevenue,
    });
  }
  if (shippingIncome > 0 && shippingIncomeAccount) {
    lines.push({
      ...commonDimensions,
      accountId: shippingIncomeAccount.id,
      debitAmount: 0,
      creditAmount: shippingIncome,
    });
  }

  const debits = money(lines.reduce((sum, line) => sum + Number(line.debitAmount ?? 0), 0));
  const credits = money(lines.reduce((sum, line) => sum + Number(line.creditAmount ?? 0), 0));
  if (Math.abs(debits - credits) > 0.001) {
    throw new Error(`P1 shipment revenue entry is imbalanced: debits=${debits}, credits=${credits}`);
  }

  await tx.insert(journalLines).values(lines);

  return {
    journalEntryId: entryId,
    netReceivable,
    depositApplied,
    arAmount,
  };
}

export async function createOrUpdateP1ShipmentRevenueFromSnapshot(
  snapshotId: string,
  user?: { username?: string | null } | null,
  tx: DbExecutor = db,
) {
  const [snapshot] = await tx
    .select()
    .from(shipmentAccountingSnapshots)
    .where(eq(shipmentAccountingSnapshots.id, snapshotId))
    .limit(1);
  if (!snapshot) throw new Error(`Shipment accounting snapshot ${snapshotId} not found`);

  const { order, customer } = await getP1OrderCustomer(tx, snapshot.salesOrderId);
  const paidAmount = await getP1OrderPaymentTotal(tx, snapshot.salesOrderId);
  const customerName = customer?.name ?? customer?.company ?? snapshot.customerName ?? null;
  const classification = classifyRevenueStream({
    productionLine: 'P1',
    sourceTable: 'shipment_accounting_snapshots',
    orderSource: order?.orderSource,
    orderSourceV2: order?.orderSourceV2,
    sourcePoId: order?.sourcePoId,
    hasCustomerPrepayment: paidAmount > 0,
  });
  assertRevenueStream(classification, 'P1_REGULAR_PREPAID', `P1 shipment snapshot ${snapshot.id}`);

  return upsertDraftRevenueEntry(
    tx,
    {
      referenceType: 'p1_shipment_snapshot',
      referenceId: 0,
      referenceUuid: snapshot.id,
      sourceDocumentType: 'P1_SHIPMENT',
    },
    {
      productRevenue: money(snapshot.stockRevenueAmount),
      shippingIncome: money(snapshot.shippingIncomeAmount),
      discountAmount: money(snapshot.discountAmount),
      netReceivable: money(snapshot.netTotal),
    },
    {
      customerId: snapshot.customerId || order?.customerId || null,
      customerName,
      customerType: customer?.customerType ?? null,
      orderId: snapshot.salesOrderId,
      source: 'p1_standard_shipment_revenue',
      sourceId: snapshot.id,
      sourceDocumentNumber: snapshot.salesOrderId || String(snapshot.shipmentId),
      revenueStream: classification.revenueStream,
      revenueClassification: classification,
      extraTags: {
        shipmentAccountingSnapshotId: snapshot.id,
        shipmentId: snapshot.shipmentId,
        pricingSource: 'shipment_accounting_snapshot',
      },
    },
    paidAmount,
    snapshot.shipmentDate instanceof Date ? snapshot.shipmentDate : new Date(snapshot.shipmentDate),
    user,
  );
}

export async function createOrUpdateP1ShipmentRevenueFromShipmentRecord(
  shipmentRecordId: string,
  user?: { username?: string | null } | null,
  tx: DbExecutor = db,
) {
  const [shipment] = await tx
    .select()
    .from(shipmentRecords)
    .where(eq(shipmentRecords.id, shipmentRecordId))
    .limit(1);
  if (!shipment) throw new Error(`Shipment record ${shipmentRecordId} not found`);

  const items = await tx
    .select({
      shipmentItemId: shipmentItems.id,
      orderId: shipmentItems.orderId,
      quantity: shipmentItems.quantity,
      poItemId: purchaseOrderItems.id,
      unitPrice: purchaseOrderItems.unitPrice,
      poNumber: purchaseOrders.poNumber,
      customerId: purchaseOrders.customerId,
      customerName: purchaseOrders.customerName,
      stockModelName: purchaseOrderItems.stockModelName,
      itemName: purchaseOrderItems.itemName,
    })
    .from(shipmentItems)
    .leftJoin(purchaseOrderItems, eq(shipmentItems.poItemId, purchaseOrderItems.id))
    .leftJoin(purchaseOrders, eq(purchaseOrderItems.poId, purchaseOrders.id))
    .where(eq(shipmentItems.shipmentId, shipmentRecordId));

  const productRevenue = money(
    items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0), 0),
  );
  if (productRevenue <= 0) return null;

  const first = items[0] ?? null;
  const orderIds = Array.from(new Set(items.map((item: any) => item.orderId).filter(Boolean)));
  const poNumbers = Array.from(new Set(items.map((item: any) => item.poNumber).filter(Boolean)));
  const classification = classifyRevenueStream({
    productionLine: 'P1',
    sourceTable: 'shipment_records',
    p1PurchaseOrderId: poNumbers[0] ?? null,
    hasP1PurchaseOrderItems: items.some((item: any) => item.poItemId),
    terms: 'NET_30',
  });
  assertRevenueStream(classification, 'P1_PO_NET30', `P1 shipment record ${shipment.id}`);

  return upsertDraftRevenueEntry(
    tx,
    {
      referenceType: 'p1_shipment_record',
      referenceId: 0,
      referenceUuid: shipment.id,
      sourceDocumentType: 'P1_PO_SHIPMENT',
    },
    {
      productRevenue,
      shippingIncome: 0,
      discountAmount: 0,
      netReceivable: productRevenue,
    },
    {
      customerId: first?.customerId ?? null,
      customerName: first?.customerName ?? null,
      customerType: null,
      orderId: orderIds.length === 1 ? orderIds[0] : null,
      source: 'p1_po_shipment_revenue',
      sourceId: shipment.id,
      sourceDocumentNumber: shipment.invoiceNumber || shipment.reference || shipment.id,
      revenueStream: classification.revenueStream,
      revenueClassification: classification,
      extraTags: {
        shipmentRecordId: shipment.id,
        shipmentReference: shipment.reference,
        invoiceNumber: shipment.invoiceNumber,
        masterTrackingNumber: shipment.masterTrackingNumber,
        poNumbers,
        orderIds,
        shipmentItemIds: items.map((item: any) => item.shipmentItemId),
        poItemIds: items.map((item: any) => item.poItemId),
        pricingSource: 'shipment_items.quantity_x_purchase_order_items.unit_price',
      },
    },
    0,
    shipment.shippedAt instanceof Date ? shipment.shippedAt : new Date(shipment.shippedAt),
    user,
  );
}

export async function reverseP1ShipmentRevenueDraftOrEntry(
  referenceType: 'p1_shipment_snapshot' | 'p1_shipment_record',
  referenceUuid: string,
  reason: string,
  user?: { username?: string | null } | null,
  tx: DbExecutor = db,
) {
  const [originalEntry] = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.transactionType, 'P1_SHIPMENT_REVENUE'),
        eq(journalEntries.referenceType, referenceType),
        eq(journalEntries.referenceUuid, referenceUuid),
      ),
    )
    .limit(1);

  if (!originalEntry) return null;

  if (originalEntry.status === 'DRAFT') {
    const [voided] = await tx
      .update(journalEntries)
      .set({
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedBy: user?.username || null,
        voidReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(journalEntries.id, originalEntry.id))
      .returning();
    return { journalEntryId: voided.id, voidedDraft: true };
  }

  const [existingReversal] = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.transactionType, 'P1_SHIPMENT_REVENUE_REVERSAL'),
        eq(journalEntries.referenceType, referenceType),
        eq(journalEntries.referenceUuid, referenceUuid),
      ),
    )
    .limit(1);
  if (existingReversal) return { journalEntryId: existingReversal.id, alreadyReversed: true };

  const originalLines = await tx
    .select()
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, originalEntry.id));

  const [reversal] = await tx
    .insert(journalEntries)
    .values({
      transactionType: 'P1_SHIPMENT_REVENUE_REVERSAL',
      referenceType,
      referenceId: originalEntry.referenceId,
      referenceUuid,
      effectiveDate: new Date(),
      memo: `Reversal - ${originalEntry.memo || 'P1 shipment revenue'}: ${reason}`,
      status: 'DRAFT',
      sourceSystem: 'EPOCH',
      sourceDocumentType: `${originalEntry.sourceDocumentType || 'P1_SHIPMENT'}_REVERSAL`,
      sourceDocumentNumber: originalEntry.sourceDocumentNumber,
      postingMode: 'REVERSAL',
      reversalOfJournalEntryId: originalEntry.id,
      createdBy: user?.username || null,
    })
    .returning();

  await tx.insert(journalLines).values(
    originalLines.map((line: typeof journalLines.$inferSelect) => ({
      journalEntryId: reversal.id,
      accountId: line.accountId,
      debitAmount: Number(line.creditAmount ?? 0),
      creditAmount: Number(line.debitAmount ?? 0),
      customerId: line.customerId,
      customerNameSnapshot: line.customerNameSnapshot,
      customerType: line.customerType,
      projectId: line.projectId,
      projectNameSnapshot: line.projectNameSnapshot,
      contractNumber: line.contractNumber,
      productionLine: line.productionLine,
      department: line.department,
      chargeCodeId: line.chargeCodeId,
      inventoryItemId: line.inventoryItemId,
      partNumber: line.partNumber,
      salespersonUserId: line.salespersonUserId,
      salespersonNameSnapshot: line.salespersonNameSnapshot,
      csrUserId: line.csrUserId,
      csrNameSnapshot: line.csrNameSnapshot,
      allowability: line.allowability,
      directIndirect: line.directIndirect,
      costPool: line.costPool,
      dimensionTags: {
        ...(line.dimensionTags as Record<string, unknown>),
        source: 'p1_shipment_revenue_reversal',
        reversalOfJournalEntryId: originalEntry.id,
        reversalReason: reason,
      },
    })),
  );

  return { journalEntryId: reversal.id, reversedEntryId: originalEntry.id };
}
