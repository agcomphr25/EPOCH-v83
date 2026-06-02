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
import { buildRevenueDimensionTags } from './productionLineAccounting';

interface LineItem {
  poItemId?: number;
  partNumber: string;
  partName?: string;
  quantity: number;
  serialNumbers?: string[];
}

export interface InvoicePreviewLine {
  poItemId: number | null;
  partNumber: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  pricingStatus: 'matched' | 'missing' | 'ambiguous' | 'manual' | 'no_charge';
  matchCount: number;
}

export interface InvoicePreviewInput {
  invoiceDate?: string;
  dueDate?: string;
  terms?: string;
  poOverride?: string | null;
  freightAmount?: number | string;
  taxAmount?: number | string;
  discountAmount?: number | string;
  customerVisibleNotes?: string | null;
  lines?: Array<Partial<InvoicePreviewLine> & {
    qty?: number | string;
    unitPrice?: number | string;
  }>;
}

export interface InvoicePreview {
  packingSlipId: string;
  lotId: string;
  customerId: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  terms: string;
  poId: string | null;
  poOverride: string | null;
  status: 'REVIEW';
  autoCreated: true;
  pricingMismatch: boolean;
  pricingAmbiguous: boolean;
  subtotal: number;
  discountAmount: number;
  freightAmount: number;
  taxAmount: number;
  retainagePercent: number;
  retainageAmount: number;
  totalAmount: number;
  customerVisibleNotes: string | null;
  isNoChargeReplacement: boolean;
  lines: InvoicePreviewLine[];
}

function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getTermsDays(terms: string): number {
  if (terms === 'NET_15') return 15;
  if (terms === 'NET_60') return 60;
  return 30;
}

function addDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateOnly(date);
}

export async function buildInvoicePreviewFromPackingSlip(
  packingSlipId: string,
  lotId: string,
  overrides: InvoicePreviewInput = {},
): Promise<InvoicePreview> {
  const [slip] = await db
    .select()
    .from(p2PackingSlips)
    .where(eq(p2PackingSlips.id, packingSlipId));

  if (!slip) throw new Error(`Packing slip ${packingSlipId} not found`);

  const [lot] = await db
    .select({ poId: p2LotNumbers.poId })
    .from(p2LotNumbers)
    .where(eq(p2LotNumbers.id, lotId));

  if (!lot) throw new Error(`Lot ${lotId} not found`);

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

  const poItemsById = new Map<number, { id: number; partNumber: string; unitPrice: number | null }>();
  const poItemsByPart = new Map<string, { id: number; partNumber: string; unitPrice: number | null }[]>();
  for (const item of poItems) {
    poItemsById.set(item.id, item);
    const existing = poItemsByPart.get(item.partNumber) ?? [];
    existing.push(item);
    poItemsByPart.set(item.partNumber, existing);
  }

  const lineItems: LineItem[] = Array.isArray(slip.lineItems) ? (slip.lineItems as LineItem[]) : [];
  const isNoCharge = slip.isNoChargeReplacement === true;

  let pricingMismatch = false;
  let pricingAmbiguous = false;

  const resolvedLines: InvoicePreviewLine[] = lineItems.map((line) => {
    const linkedPoItem = line.poItemId ? poItemsById.get(line.poItemId) : undefined;
    const matches = linkedPoItem ? [linkedPoItem] : (poItemsByPart.get(line.partNumber) ?? []);
    let unitPrice = 0;
    let resolvedPoItemId: number | null = linkedPoItem?.id ?? null;
    let pricingStatus: InvoicePreviewLine['pricingStatus'] = 'matched';

    if (matches.length === 1) {
      unitPrice = matches[0].unitPrice ?? 0;
      resolvedPoItemId = matches[0].id;
    } else if (matches.length === 0) {
      pricingMismatch = true;
      pricingStatus = 'missing';
      console.warn(`[InvoiceService] Pricing mismatch: no PO match found for part number ${line.partNumber}`);
    } else {
      pricingAmbiguous = true;
      pricingStatus = 'ambiguous';
      console.warn(`[InvoiceService] Pricing ambiguity: ${matches.length} PO matches found for part number ${line.partNumber}`);
    }

    const qty = money(line.quantity);
    const effectiveUnitPrice = isNoCharge ? 0 : unitPrice;

    return {
      poItemId: resolvedPoItemId,
      partNumber: line.partNumber ?? null,
      description: line.partName ? `${line.partNumber} - ${line.partName}` : line.partNumber,
      qty,
      unitPrice: effectiveUnitPrice,
      lineTotal: effectiveUnitPrice * qty,
      pricingStatus: isNoCharge ? 'no_charge' : pricingStatus,
      matchCount: matches.length,
    };
  });

  const lines = overrides.lines && overrides.lines.length > 0
    ? overrides.lines
        .map((line, index) => {
          const base = resolvedLines[index] ?? resolvedLines[resolvedLines.length - 1];
          const qty = money(line.qty ?? base?.qty ?? 0);
          const unitPrice = money(line.unitPrice ?? base?.unitPrice ?? 0);
          return {
            poItemId: typeof line.poItemId === 'number' ? line.poItemId : base?.poItemId ?? null,
            partNumber: (line.partNumber ?? base?.partNumber ?? null) || null,
            description: String(line.description ?? base?.description ?? '').trim(),
            qty,
            unitPrice,
            lineTotal: qty * unitPrice,
            pricingStatus: 'manual' as const,
            matchCount: base?.matchCount ?? 0,
          };
        })
        .filter((line) => line.description && line.qty > 0)
    : resolvedLines;

  pricingMismatch = lines.some((line) => line.pricingStatus === 'missing');
  pricingAmbiguous = lines.some((line) => line.pricingStatus === 'ambiguous');

  const { storage } = await import('../../storage');
  const invoiceNumber = slip.invoiceNumber || await storage.getNextInvoiceNumber(slip.customerId, slip.customerName);

  const [customer] = await db
    .select({ paymentTerms: p2Customers.paymentTerms })
    .from(p2Customers)
    .where(eq(p2Customers.customerId, slip.customerId));

  const invoiceDate = overrides.invoiceDate || dateOnly(new Date());
  const terms = overrides.terms || customer?.paymentTerms || 'NET_30';
  const dueDate = overrides.dueDate || addDays(invoiceDate, getTermsDays(terms));
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const discountAmount = money(overrides.discountAmount);
  const freightAmount = money(overrides.freightAmount);
  const taxAmount = money(overrides.taxAmount);
  const retainagePercent = 0;
  const retainageAmount = 0;
  const totalAmount = subtotal - discountAmount + freightAmount + taxAmount - retainageAmount;

  return {
    packingSlipId,
    lotId,
    customerId: slip.customerId,
    customerName: slip.customerName,
    invoiceNumber,
    invoiceDate,
    dueDate,
    terms,
    poId: lot.poId ? String(lot.poId) : null,
    poOverride: overrides.poOverride !== undefined ? overrides.poOverride : slip.poNumber || null,
    status: 'REVIEW',
    autoCreated: true,
    pricingMismatch,
    pricingAmbiguous,
    subtotal,
    discountAmount,
    freightAmount,
    taxAmount,
    retainagePercent,
    retainageAmount,
    totalAmount,
    customerVisibleNotes: overrides.customerVisibleNotes !== undefined
      ? overrides.customerVisibleNotes
      : slip.notes || null,
    isNoChargeReplacement: isNoCharge,
    lines,
  };
}

export async function createInvoiceFromPackingSlip(
  packingSlipId: string,
  lotId: string,
  overrides: InvoicePreviewInput = {},
): Promise<void> {
  const existing = await db
    .select({ id: arInvoices.id })
    .from(arInvoices)
    .where(eq(arInvoices.packingSlipId, packingSlipId));

  if (existing.length > 0) {
    console.log(`[InvoiceService] Duplicate prevented (pre-check): invoice already exists for packing slip ${packingSlipId}`);
    return;
  }

  const preview = await buildInvoicePreviewFromPackingSlip(packingSlipId, lotId, overrides);
  if (preview.isNoChargeReplacement) {
    console.log(`[InvoiceService] No-charge replacement flag active for packing slip ${packingSlipId}; all line prices forced to $0 unless manually overridden`);
  }

  try {
    await db.transaction(async (tx) => {
      const [invoice] = await tx
        .insert(arInvoices)
        .values({
          customerId: preview.customerId,
          invoiceNumber: preview.invoiceNumber,
          invoiceDate: preview.invoiceDate,
          dueDate: preview.dueDate,
          terms: preview.terms,
          poId: preview.poId,
          poOverride: preview.poOverride,
          packingSlipId,
          lotId,
          status: 'REVIEW',
          autoCreated: true,
          pricingMismatch: preview.pricingMismatch,
          pricingAmbiguous: preview.pricingAmbiguous,
          subtotal: String(preview.subtotal),
          discountAmount: String(preview.discountAmount),
          freightAmount: String(preview.freightAmount),
          taxAmount: String(preview.taxAmount),
          retainagePercent: String(preview.retainagePercent),
          retainageAmount: String(preview.retainageAmount),
          totalAmount: String(preview.totalAmount),
          createdBy: 'system',
          customerVisibleNotes: preview.customerVisibleNotes,
        })
        .returning({ id: arInvoices.id });

      if (preview.lines.length > 0) {
        await tx.insert(arInvoiceLines).values(
          preview.lines.map((line) => ({
            invoiceId: invoice.id,
            poItemId: line.poItemId,
            partNumber: line.partNumber,
            productionLine: 'P2',
            description: line.description,
            qty: String(line.qty),
            unitPrice: String(line.unitPrice),
            lineTotal: String(line.lineTotal),
            dimensionTags: buildRevenueDimensionTags('P2'),
          })),
        );
      }

      await tx
        .update(p2PackingSlips)
        .set({ invoiceNumber: preview.invoiceNumber })
        .where(eq(p2PackingSlips.id, packingSlipId));
    });

    console.log(`[InvoiceService] Invoice ${preview.invoiceNumber} auto-created for packing slip ${packingSlipId}`);
  } catch (err: any) {
    if (err?.code === '23505') {
      console.log(`[InvoiceService] Duplicate prevented (constraint): invoice already exists for packing slip ${packingSlipId}`);
      return;
    }
    throw err;
  }
}
