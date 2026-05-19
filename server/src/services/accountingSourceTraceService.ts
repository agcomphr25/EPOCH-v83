import { eq, ilike } from 'drizzle-orm';
import { db } from '../../db';
import {
  allOrders,
  arInvoices,
  arPaymentAllocations,
  arPayments,
  customers,
  journalEntries,
  journalLines,
  p2Customers,
  p2LotNumbers,
  p2PackingSlips,
  p2PurchaseOrders,
  payments,
} from '../../schema';

export type AccountingSourceTraceNode = {
  type: string;
  id: string | number;
  label: string;
  relationship: 'generated_from' | 'allocated_to' | 'linked_to' | 'reversal_of' | 'supports';
  subtitle?: string | null;
  url?: string | null;
  status?: string | null;
  amount?: number | string | null;
};

export type AccountingSourceTraceResponse = {
  journalEntryId: number;
  displaySource: string | null;
  journalEntry: {
    id: number;
    transactionType: string;
    referenceType: string;
    referenceId: number;
    referenceUuid: string | null;
    sourceDocumentType: string | null;
    sourceDocumentNumber: string | null;
    memo: string | null;
    status: string;
    effectiveDate: Date;
  };
  sources: AccountingSourceTraceNode[];
  unresolvedHints: string[];
};

type TraceNodeInput = Omit<AccountingSourceTraceNode, 'id'> & {
  id?: string | number | null;
};

function addNode(nodes: AccountingSourceTraceNode[], node: TraceNodeInput) {
  if (node.id === null || node.id === undefined || node.id === '') return;
  const key = `${node.type}:${node.id}`;
  if (nodes.some((existing) => `${existing.type}:${existing.id}` === key)) return;
  nodes.push({
    ...node,
    id: node.id,
  });
}

function displaySource(entry: typeof journalEntries.$inferSelect) {
  if (entry.sourceDocumentType && entry.sourceDocumentNumber) {
    return `${entry.sourceDocumentType} ${entry.sourceDocumentNumber}`;
  }
  if (entry.memo) return entry.memo;
  return `${entry.referenceType} #${entry.referenceId}`;
}

function extractInvoiceNumber(entry: typeof journalEntries.$inferSelect) {
  if (entry.sourceDocumentType === 'AR_INVOICE' && entry.sourceDocumentNumber) {
    return entry.sourceDocumentNumber;
  }
  const memoMatch = entry.memo?.match(/AR Invoice\s+([^-\s]+(?:-[^-\s]+)?)/i);
  if (memoMatch?.[1]) return memoMatch[1].trim();
  return null;
}

function toTagObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstStringTag(tags: Record<string, unknown>[], keys: string[]) {
  for (const tag of tags) {
    for (const key of keys) {
      const value = tag[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
  }
  return null;
}

async function resolveArInvoice(nodes: AccountingSourceTraceNode[], entry: typeof journalEntries.$inferSelect) {
  let invoice: typeof arInvoices.$inferSelect | null = null;

  if (entry.referenceUuid) {
    const [byUuid] = await db
      .select()
      .from(arInvoices)
      .where(eq(arInvoices.id, entry.referenceUuid))
      .limit(1);
    invoice = byUuid ?? null;
  }

  if (!invoice) {
    const invoiceNumber = extractInvoiceNumber(entry);
    if (invoiceNumber) {
      const [byNumber] = await db
        .select()
        .from(arInvoices)
        .where(eq(arInvoices.invoiceNumber, invoiceNumber))
        .limit(1);
      invoice = byNumber ?? null;
    }
  }

  if (!invoice) return;

  const [customer] = await db
    .select()
    .from(p2Customers)
    .where(eq(p2Customers.customerId, invoice.customerId))
    .limit(1);

  addNode(nodes, {
    type: 'ar_invoice',
    id: invoice.id,
    label: `AR Invoice ${invoice.invoiceNumber}`,
    relationship: 'generated_from',
    subtitle: customer?.customerName ? `Customer: ${customer.customerName}` : `Customer: ${invoice.customerId}`,
    url: `/finance/invoices/${invoice.id}`,
    status: invoice.status,
    amount: invoice.totalAmount,
  });

  const numericPoId = invoice.poId && /^\d+$/.test(invoice.poId) ? Number(invoice.poId) : null;
  if (numericPoId) {
    const [po] = await db
      .select()
      .from(p2PurchaseOrders)
      .where(eq(p2PurchaseOrders.id, numericPoId))
      .limit(1);
    addNode(nodes, {
      type: 'purchase_order',
      id: po?.id,
      label: po ? `PO ${po.poNumber}` : `PO ${invoice.poId}`,
      relationship: 'linked_to',
      subtitle: po?.customerName ?? invoice.poOverride ?? null,
      url: po ? `/p2/purchase-orders/${po.id}/preview` : null,
      status: po?.status ?? null,
    });
  } else if (invoice.poOverride) {
    addNode(nodes, {
      type: 'purchase_order',
      id: invoice.poOverride,
      label: `PO ${invoice.poOverride}`,
      relationship: 'linked_to',
      subtitle: 'Manual PO reference',
    });
  }

  if (invoice.packingSlipId) {
    const [packingSlip] = await db
      .select()
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.id, invoice.packingSlipId))
      .limit(1);
    addNode(nodes, {
      type: 'packing_slip',
      id: invoice.packingSlipId,
      label: packingSlip?.packingSlipNumber ? `Packing Slip ${packingSlip.packingSlipNumber}` : 'Packing Slip',
      relationship: 'supports',
      subtitle: packingSlip?.shipmentNumber ? `Shipment ${packingSlip.shipmentNumber}` : null,
      url: `/p2/packing-slip/${invoice.packingSlipId}`,
      status: packingSlip?.status ?? null,
    });
  }

  if (invoice.lotId) {
    const [lot] = await db
      .select()
      .from(p2LotNumbers)
      .where(eq(p2LotNumbers.id, invoice.lotId))
      .limit(1);
    addNode(nodes, {
      type: 'shipment_lot',
      id: invoice.lotId,
      label: lot?.lotNumber ? `Shipment Lot ${lot.lotNumber}` : 'Shipment Lot',
      relationship: 'supports',
      subtitle: lot?.poNumber ? `PO ${lot.poNumber}` : null,
      url: `/p2/shipments/${invoice.lotId}`,
      status: lot?.status ?? null,
    });
  }
}

async function resolveArPayment(nodes: AccountingSourceTraceNode[], entry: typeof journalEntries.$inferSelect) {
  if (!entry.referenceUuid) return;

  const [payment] = await db
    .select()
    .from(arPayments)
    .where(eq(arPayments.id, entry.referenceUuid))
    .limit(1);
  if (!payment) return;

  addNode(nodes, {
    type: 'ar_payment',
    id: payment.id,
    label: `AR Payment ${payment.referenceNumber || payment.id}`,
    relationship: 'generated_from',
    subtitle: `${payment.paymentMethod} payment for customer ${payment.customerId}`,
    status: payment.status,
    amount: payment.amount,
  });

  const allocations = await db
    .select({
      id: arPaymentAllocations.id,
      amountApplied: arPaymentAllocations.amountApplied,
      invoiceId: arInvoices.id,
      invoiceNumber: arInvoices.invoiceNumber,
      status: arInvoices.status,
      totalAmount: arInvoices.totalAmount,
    })
    .from(arPaymentAllocations)
    .leftJoin(arInvoices, eq(arPaymentAllocations.invoiceId, arInvoices.id))
    .where(eq(arPaymentAllocations.paymentId, payment.id));

  allocations.forEach((allocation) => {
    addNode(nodes, {
      type: 'ar_invoice',
      id: allocation.invoiceId,
      label: allocation.invoiceNumber ? `AR Invoice ${allocation.invoiceNumber}` : 'AR Invoice',
      relationship: 'allocated_to',
      subtitle: allocation.amountApplied ? `Applied: $${Number(allocation.amountApplied).toFixed(2)}` : null,
      url: allocation.invoiceId ? `/finance/invoices/${allocation.invoiceId}` : null,
      status: allocation.status,
      amount: allocation.totalAmount,
    });
  });
}

async function resolveP1Payment(nodes: AccountingSourceTraceNode[], entry: typeof journalEntries.$inferSelect) {
  if (!Number.isInteger(entry.referenceId) || entry.referenceId <= 0) return;

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, entry.referenceId))
    .limit(1);
  if (!payment) return;

  addNode(nodes, {
    type: 'p1_payment',
    id: payment.id,
    label: `P1 Payment ${payment.id}`,
    relationship: 'generated_from',
    subtitle: `${payment.paymentType} payment for order ${payment.orderId}`,
    status: payment.status,
    amount: payment.paymentAmount,
  });

  await resolveP1Order(nodes, payment.orderId);
}

async function resolveP1Order(nodes: AccountingSourceTraceNode[], orderId: string) {
  const [order] = await db
    .select()
    .from(allOrders)
    .where(eq(allOrders.orderId, orderId))
    .limit(1);

  let customerLabel: string | null = null;
  const numericCustomerId = order?.customerId ? Number(order.customerId) : Number.NaN;
  if (Number.isInteger(numericCustomerId)) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, numericCustomerId))
      .limit(1);
    customerLabel = customer?.name ?? customer?.company ?? null;
  }

  addNode(nodes, {
    type: 'p1_order',
    id: orderId,
    label: `Order ${orderId}`,
    relationship: 'linked_to',
    subtitle: customerLabel || order?.customerPO ? [customerLabel, order?.customerPO && `Customer PO ${order.customerPO}`].filter(Boolean).join(' - ') : null,
    url: `/orders?search=${encodeURIComponent(orderId)}`,
    status: order?.currentDepartment ?? order?.status ?? null,
  });
}

async function resolveFallbackInvoice(nodes: AccountingSourceTraceNode[], entry: typeof journalEntries.$inferSelect) {
  if (nodes.length > 0 || !entry.sourceDocumentNumber) return;

  const [invoice] = await db
    .select()
    .from(arInvoices)
    .where(ilike(arInvoices.invoiceNumber, entry.sourceDocumentNumber))
    .limit(1);

  if (invoice) {
    await resolveArInvoice(nodes, {
      ...entry,
      referenceUuid: invoice.id,
      sourceDocumentType: 'AR_INVOICE',
      sourceDocumentNumber: invoice.invoiceNumber,
    });
  }
}

async function resolveFromLineTags(
  nodes: AccountingSourceTraceNode[],
  entry: typeof journalEntries.$inferSelect,
  tags: Record<string, unknown>[],
) {
  if (nodes.length > 0) return;

  const invoiceId = firstStringTag(tags, ['invoiceId', 'arInvoiceId']);
  if (invoiceId) {
    await resolveArInvoice(nodes, {
      ...entry,
      referenceType: 'ar_invoice',
      referenceUuid: invoiceId,
    });
  }

  const arPaymentId = firstStringTag(tags, ['paymentId', 'arPaymentId']);
  if (arPaymentId && nodes.length === 0) {
    await resolveArPayment(nodes, {
      ...entry,
      referenceType: 'ar_payment',
      referenceUuid: arPaymentId,
    });
  }

  const p1PaymentId = Number(firstStringTag(tags, ['p1PaymentId']));
  if (Number.isInteger(p1PaymentId) && p1PaymentId > 0 && nodes.length === 0) {
    await resolveP1Payment(nodes, {
      ...entry,
      referenceType: 'p1_payment',
      referenceId: p1PaymentId,
    });
  }

  const p1OrderId = firstStringTag(tags, ['p1OrderId', 'orderId']);
  if (p1OrderId && nodes.length === 0) {
    await resolveP1Order(nodes, p1OrderId);
  }
}

export async function getJournalEntrySourceTrace(journalEntryId: number): Promise<AccountingSourceTraceResponse | null> {
  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, journalEntryId))
    .limit(1);

  if (!entry) return null;

  const lines = await db
    .select({ dimensionTags: journalLines.dimensionTags })
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, journalEntryId));

  const sources: AccountingSourceTraceNode[] = [];
  const tagObjects = lines.map((line) => toTagObject(line.dimensionTags)).filter(Boolean) as Record<string, unknown>[];

  if (entry.referenceType === 'ar_invoice' || entry.transactionType.includes('AR_INVOICE')) {
    await resolveArInvoice(sources, entry);
  }
  if (entry.referenceType === 'ar_payment' || entry.transactionType.includes('AR_PAYMENT')) {
    await resolveArPayment(sources, entry);
  }
  if (entry.referenceType === 'p1_payment' || entry.transactionType === 'P1_CUSTOMER_PAYMENT') {
    await resolveP1Payment(sources, entry);
  }

  await resolveFromLineTags(sources, entry, tagObjects);
  await resolveFallbackInvoice(sources, entry);

  const unresolvedHints = [
    entry.sourceDocumentType && `Source document type: ${entry.sourceDocumentType}`,
    entry.sourceDocumentNumber && `Source document number: ${entry.sourceDocumentNumber}`,
    entry.memo && `Memo: ${entry.memo}`,
    `Reference: ${entry.referenceType} #${entry.referenceId}`,
    entry.referenceUuid && `Reference UUID: ${entry.referenceUuid}`,
    ...tagObjects
      .slice(0, 3)
      .map((tags) => `Line tags: ${JSON.stringify(tags)}`),
  ].filter(Boolean) as string[];

  return {
    journalEntryId,
    displaySource: displaySource(entry),
    journalEntry: {
      id: entry.id,
      transactionType: entry.transactionType,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      referenceUuid: entry.referenceUuid,
      sourceDocumentType: entry.sourceDocumentType,
      sourceDocumentNumber: entry.sourceDocumentNumber,
      memo: entry.memo,
      status: entry.status,
      effectiveDate: entry.effectiveDate,
    },
    sources,
    unresolvedHints,
  };
}
