import { db } from '../../db';
import {
  arInvoices,
  arInvoiceLines,
  p2PackingSlips,
  p2LotNumbers,
  p2PurchaseOrderItems,
  p2Customers,
} from '../../schema';
import { eq } from 'drizzle-orm';

interface LineItem {
  poItemId?: number;
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
    console.log(`[InvoiceService] Duplicate prevented (pre-check): invoice already exists for packing slip ${packingSlipId}`);
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
  let poItems: { id: number; partNumber: string; unitPrice: number | null }[] = [];
  if (lot.poId) {
    poItems = await db
      .select({
        id: p2PurchaseOrderItems.id,
        partNumber: p2PurchaseOrderItems.partNumber,
        unitPrice: p2PurchaseOrderItems.unitPrice,
      })
      .from(p2PurchaseOrderItems)
      .where(eq(p2PurchaseOrderItems.poId, lot.poId));
  }

  // Build a map from partNumber -> matching PO items
  const poItemsById = new Map<number, { id: number; partNumber: string; unitPrice: number | null }>();
  const poItemsByPart = new Map<string, { id: number; partNumber: string; unitPrice: number | null }[]>();
  for (const item of poItems) {
    poItemsById.set(item.id, item);
    const existing = poItemsByPart.get(item.partNumber) ?? [];
    existing.push(item);
    poItemsByPart.set(item.partNumber, existing);
  }

  // Process line items from the packing slip
  const lineItems: LineItem[] = Array.isArray(slip.lineItems) ? (slip.lineItems as LineItem[]) : [];

  // No-charge replacement: all line totals are forced to zero without touching
  // the normal price-resolution path (which still runs for auditing purposes).
  const isNoCharge = slip.isNoChargeReplacement === true;
  if (isNoCharge) {
    console.log(`[InvoiceService] No-charge replacement flag active for packing slip ${packingSlipId} — all line prices forced to $0`);
  }

  let pricingMismatch = false;
  let pricingAmbiguous = false;
  let subtotal = 0;

  const resolvedLines: Array<{
    poItemId: number | null;
    partNumber: string | null;
    description: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }> = [];

  for (const line of lineItems) {
    const linkedPoItem = line.poItemId ? poItemsById.get(line.poItemId) : undefined;
    const matches = linkedPoItem ? [linkedPoItem] : (poItemsByPart.get(line.partNumber) ?? []);
    let unitPrice = 0;
    let resolvedPoItemId: number | null = linkedPoItem?.id ?? null;

    if (matches.length === 1) {
      unitPrice = matches[0].unitPrice ?? 0;
      resolvedPoItemId = matches[0].id;
    } else if (matches.length === 0) {
      pricingMismatch = true;
      unitPrice = 0;
      console.warn(`[InvoiceService] Pricing mismatch: no PO match found for part number ${line.partNumber}`);
    } else {
      pricingAmbiguous = true;
      unitPrice = 0;
      console.warn(`[InvoiceService] Pricing ambiguity: ${matches.length} PO matches found for part number ${line.partNumber}`);
    }

    const qty = line.quantity ?? 0;
    // Force unit price and line total to zero for no-charge replacement slips
    const effectiveUnitPrice = isNoCharge ? 0 : unitPrice;
    const lineTotal = effectiveUnitPrice * qty;
    subtotal += lineTotal;

    resolvedLines.push({
      poItemId: resolvedPoItemId,
      partNumber: line.partNumber ?? null,
      description: line.partName ? `${line.partNumber} – ${line.partName}` : line.partNumber,
      qty,
      unitPrice: effectiveUnitPrice,
      lineTotal,
    });
  }

  // Generate invoice number
  const { storage } = await import('../../storage');
  const invoiceNumber = slip.invoiceNumber || await storage.getNextInvoiceNumber(slip.customerId, slip.customerName);
  if (!slip.invoiceNumber) {
    await db
      .update(p2PackingSlips)
      .set({ invoiceNumber })
      .where(eq(p2PackingSlips.id, packingSlipId));
  }

  const [customer] = await db
    .select({ paymentTerms: p2Customers.paymentTerms })
    .from(p2Customers)
    .where(eq(p2Customers.customerId, slip.customerId));

  // Dates
  const today = new Date();
  const invoiceDateStr = today.toISOString().split('T')[0];
  const terms = customer?.paymentTerms || 'NET_30';
  const termsDays = terms === 'NET_15' ? 15 : terms === 'NET_60' ? 60 : 30;
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + termsDays);
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
          terms,
          poId: lot.poId ? String(lot.poId) : null,
          poOverride: slip.poNumber || null,
          packingSlipId,
          lotId,
          status: 'REVIEW',
          autoCreated: true,
          pricingMismatch,
          pricingAmbiguous,
          subtotal: String(subtotal),
          discountAmount: '0',
          freightAmount: '0',
          taxAmount: '0',
          retainagePercent: '0',
          retainageAmount: '0',
          totalAmount: String(subtotal),
          createdBy: 'system',
          customerVisibleNotes: slip.notes || null,
        })
        .returning({ id: arInvoices.id });

      if (resolvedLines.length > 0) {
        await tx.insert(arInvoiceLines).values(
          resolvedLines.map((l) => ({
            invoiceId: invoice.id,
            poItemId: l.poItemId,
            partNumber: l.partNumber,
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

    console.log(`[InvoiceService] Invoice ${invoiceNumber} auto-created for packing slip ${packingSlipId}`);
  } catch (err: any) {
    // Postgres unique_violation (23505) on the packing_slip_id unique index means
    // a concurrent request already created the invoice — idempotent, not an error.
    if (err?.code === '23505') {
      console.log(`[InvoiceService] Duplicate prevented (constraint): invoice already exists for packing slip ${packingSlipId}`);
      return;
    }
    throw err;
  }
}
