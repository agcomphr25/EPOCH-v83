import { db } from '../../db';
import {
  arInvoices,
  arInvoiceLines,
  p2PackingSlips,
  p2LotNumbers,
  p2PurchaseOrderItems,
} from '../../schema';
import { eq, and } from 'drizzle-orm';

interface LineItem {
  partNumber: string;
  partName?: string;
  quantity: number;
  serialNumbers?: string[];
}

export async function createInvoiceFromPackingSlip(
  packingSlipId: string,
  lotId: string,
): Promise<void> {
  // Idempotency: bail out if an invoice already exists for this packing slip
  const existing = await db
    .select({ id: arInvoices.id })
    .from(arInvoices)
    .where(eq(arInvoices.packingSlipId, packingSlipId));

  if (existing.length > 0) {
    return;
  }

  // Load packing slip
  const [slip] = await db
    .select()
    .from(p2PackingSlips)
    .where(eq(p2PackingSlips.id, packingSlipId));

  if (!slip) {
    throw new Error(`Packing slip ${packingSlipId} not found`);
  }

  // Load lot to get the PO id
  const [lot] = await db
    .select({ poId: p2LotNumbers.poId })
    .from(p2LotNumbers)
    .where(eq(p2LotNumbers.id, lotId));

  if (!lot) {
    throw new Error(`Lot ${lotId} not found`);
  }

  // Load PO line items for pricing resolution
  let poItems: { partNumber: string; unitPrice: number | null }[] = [];
  if (lot.poId) {
    poItems = await db
      .select({
        partNumber: p2PurchaseOrderItems.partNumber,
        unitPrice: p2PurchaseOrderItems.unitPrice,
      })
      .from(p2PurchaseOrderItems)
      .where(eq(p2PurchaseOrderItems.poId, lot.poId));
  }

  // Build a map from partNumber -> matching PO items
  const poItemsByPart = new Map<string, { partNumber: string; unitPrice: number | null }[]>();
  for (const item of poItems) {
    const existing = poItemsByPart.get(item.partNumber) ?? [];
    existing.push(item);
    poItemsByPart.set(item.partNumber, existing);
  }

  // Process line items from the packing slip
  const lineItems: LineItem[] = Array.isArray(slip.lineItems) ? (slip.lineItems as LineItem[]) : [];

  let pricingMismatch = false;
  let pricingAmbiguous = false;
  let subtotal = 0;

  const resolvedLines: Array<{
    description: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }> = [];

  for (const line of lineItems) {
    const matches = poItemsByPart.get(line.partNumber) ?? [];
    let unitPrice = 0;

    if (matches.length === 1) {
      unitPrice = matches[0].unitPrice ?? 0;
    } else if (matches.length === 0) {
      pricingMismatch = true;
      unitPrice = 0;
    } else {
      pricingAmbiguous = true;
      unitPrice = 0;
    }

    const qty = line.quantity ?? 0;
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    resolvedLines.push({
      description: line.partName ? `${line.partNumber} – ${line.partName}` : line.partNumber,
      qty,
      unitPrice,
      lineTotal,
    });
  }

  // Generate invoice number
  const { storage } = await import('../../storage');
  const invoiceNumber = await storage.getNextInvoiceNumber(slip.customerId, slip.customerName);

  // Dates
  const today = new Date();
  const invoiceDateStr = today.toISOString().split('T')[0];
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().split('T')[0];

  // Insert invoice header + lines in a transaction.
  // A unique-constraint violation on packing_slip_id means a concurrent request
  // already created the invoice — treat that as idempotent success.
  try {
    await db.transaction(async (tx) => {
      const [invoice] = await tx
        .insert(arInvoices)
        .values({
          customerId: slip.customerId,
          invoiceNumber,
          invoiceDate: invoiceDateStr,
          dueDate: dueDateStr,
          terms: 'NET_30',
          packingSlipId,
          lotId,
          status: 'DRAFT',
          autoCreated: true,
          pricingMismatch,
          pricingAmbiguous,
          subtotal: String(subtotal),
          taxAmount: '0',
          totalAmount: String(subtotal),
          createdBy: 'system',
        })
        .returning({ id: arInvoices.id });

      if (resolvedLines.length > 0) {
        await tx.insert(arInvoiceLines).values(
          resolvedLines.map((l) => ({
            invoiceId: invoice.id,
            description: l.description,
            qty: String(l.qty),
            unitPrice: String(l.unitPrice),
            lineTotal: String(l.lineTotal),
          })),
        );
      }

      // Write back invoice number to packing slip
      await tx
        .update(p2PackingSlips)
        .set({ invoiceNumber })
        .where(eq(p2PackingSlips.id, packingSlipId));
    });
  } catch (err: any) {
    // Postgres unique_violation (23505) on the packing_slip_id unique index means
    // a concurrent request already created the invoice — idempotent, not an error.
    if (err?.code === '23505') {
      return;
    }
    throw err;
  }
}
