import { db, pool } from '../../db';
import {
  arInvoices,
  arInvoiceLines,
  p2PackingSlips,
  p2LotNumbers,
  p2PurchaseOrderItems,
  p2Customers,
  p2SerializedItems,
} from '../../schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { buildRevenueDimensionTags } from './productionLineAccounting';
import { assignReservedP2InvoiceNumberToPackingSlip } from './p2InvoiceNumberService';

let p2PackingSlipInvoiceNumberSchemaReady: Promise<void> | null = null;
let p2BillingAllocationSchemaReady: Promise<void> | null = null;

function ensureP2PackingSlipInvoiceNumberSchema(): Promise<void> {
  if (!p2PackingSlipInvoiceNumberSchemaReady) {
    p2PackingSlipInvoiceNumberSchemaReady = pool.query(`
      ALTER TABLE p2_packing_slips
        ADD COLUMN IF NOT EXISTS invoice_number text
    `).then(() => undefined);
  }

  return p2PackingSlipInvoiceNumberSchemaReady;
}

interface LineItem {
  poItemId?: number;
  billingAllocationId?: string | null;
  billingBucketLabel?: string | null;
  customerPoLine?: string | null;
  partNumber: string;
  customerSku?: string | null;
  sku?: string | null;
  partName?: string;
  quantity: number;
  unitPrice?: number | string | null;
  serialNumbers?: string[];
}

function ensureP2BillingAllocationSchema(): Promise<void> {
  if (!p2BillingAllocationSchemaReady) {
    p2BillingAllocationSchemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS p2_billing_allocations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        po_id integer NOT NULL REFERENCES p2_purchase_orders(id),
        po_item_id integer REFERENCES p2_purchase_order_items(id),
        po_number text NOT NULL,
        part_number text NOT NULL,
        bucket_label text NOT NULL,
        description text,
        customer_po_line text,
        quantity_authorized integer NOT NULL,
        unit_price numeric(12,2) NOT NULL,
        notes text,
        active boolean NOT NULL DEFAULT true,
        created_by text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS p2_serial_billing_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        allocation_id uuid NOT NULL REFERENCES p2_billing_allocations(id),
        serialized_item_id uuid NOT NULL REFERENCES p2_serialized_items(id),
        po_id integer NOT NULL REFERENCES p2_purchase_orders(id),
        po_item_id integer REFERENCES p2_purchase_order_items(id),
        lot_id uuid REFERENCES p2_lot_numbers(id),
        packing_slip_id uuid REFERENCES p2_packing_slips(id),
        invoice_id uuid REFERENCES ar_invoices(id),
        assigned_at timestamp NOT NULL DEFAULT now(),
        assigned_by text,
        assignment_source text NOT NULL DEFAULT 'shipment',
        locked_at timestamp,
        locked_by text,
        lock_reason text,
        notes text,
        updated_at timestamp NOT NULL DEFAULT now(),
        UNIQUE(serialized_item_id)
      );

      CREATE TABLE IF NOT EXISTS p2_billing_allocation_audit (
        id serial PRIMARY KEY,
        entity_type text NOT NULL,
        entity_id text NOT NULL,
        action text NOT NULL,
        old_value jsonb,
        new_value jsonb,
        changed_by text,
        reason text,
        created_at timestamp NOT NULL DEFAULT now()
      );
    `).then(() => undefined);
  }

  return p2BillingAllocationSchemaReady;
}

export interface InvoicePreviewLine {
  poItemId: number | null;
  partNumber: string | null;
  internalPartNumber: string | null;
  billingAllocationId?: string | null;
  billingBucketLabel?: string | null;
  customerPoLine?: string | null;
  serialNumbers?: string[];
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

function assignedSkuFromSerials(serials: Array<{ sku?: string | null }>): string | null {
  const skus = Array.from(
    new Set(
      serials
        .map((serial) => serial.sku?.trim())
        .filter((sku): sku is string => Boolean(sku)),
    ),
  );

  return skus.length > 0 ? skus.join(', ') : null;
}

async function hydrateInvoiceLineItemCustomerParts(lineItems: LineItem[]): Promise<LineItem[]> {
  const serialNumbers = Array.from(
    new Set(
      lineItems.flatMap((item) =>
        Array.isArray(item.serialNumbers)
          ? item.serialNumbers.filter((serial): serial is string => typeof serial === 'string' && serial.trim().length > 0)
          : [],
      ),
    ),
  );

  if (serialNumbers.length === 0) return lineItems;

  const serialRows = await db
    .select({ serialNumber: p2SerializedItems.serialNumber, sku: p2SerializedItems.sku })
    .from(p2SerializedItems)
    .where(inArray(p2SerializedItems.serialNumber, serialNumbers));
  const skuBySerialNumber = new Map(serialRows.map((row) => [row.serialNumber, row.sku]));

  return lineItems.map((item) => {
    const customerSku = assignedSkuFromSerials(
      (Array.isArray(item.serialNumbers) ? item.serialNumbers : [])
        .map((serialNumber) => ({ sku: skuBySerialNumber.get(serialNumber) })),
    );

    return customerSku && !item.customerSku
      ? { ...item, customerSku }
      : item;
  });
}

function resolveCustomerFacingPartNumber(line: LineItem): string | null {
  return line.customerSku?.trim() || line.sku?.trim() || line.partNumber || null;
}

export async function buildInvoicePreviewFromPackingSlip(
  packingSlipId: string,
  lotId: string,
  overrides: InvoicePreviewInput = {},
): Promise<InvoicePreview> {
  await ensureP2PackingSlipInvoiceNumberSchema();
  await ensureP2BillingAllocationSchema();

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

  const rawLineItems: LineItem[] = Array.isArray(slip.lineItems) ? (slip.lineItems as LineItem[]) : [];
  const lineItems = await hydrateInvoiceLineItemCustomerParts(rawLineItems);
  const isNoCharge = slip.isNoChargeReplacement === true;

  let pricingMismatch = false;
  let pricingAmbiguous = false;

  const resolvedLines: InvoicePreviewLine[] = lineItems.map((line) => {
    const linkedPoItem = line.poItemId ? poItemsById.get(line.poItemId) : undefined;
    const matches = linkedPoItem ? [linkedPoItem] : (poItemsByPart.get(line.partNumber) ?? []);
    let unitPrice = 0;
    let resolvedPoItemId: number | null = linkedPoItem?.id ?? null;
    let pricingStatus: InvoicePreviewLine['pricingStatus'] = 'matched';
    const bucketUnitPrice = line.billingAllocationId ? money(line.unitPrice) : null;

    if (bucketUnitPrice !== null) {
      unitPrice = bucketUnitPrice;
      resolvedPoItemId = line.poItemId ?? resolvedPoItemId;
    } else if (matches.length === 1) {
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
    const invoicePartNumber = resolveCustomerFacingPartNumber(line);
    const internalPartNumber = invoicePartNumber === line.partNumber ? null : line.partNumber;
    const bucketLabel = line.billingBucketLabel?.trim() || null;
    const baseDescription = line.partName ? `${invoicePartNumber || line.partNumber} - ${line.partName}` : invoicePartNumber || line.partNumber;
    return {
      poItemId: resolvedPoItemId,
      partNumber: invoicePartNumber,
      internalPartNumber,
      billingAllocationId: line.billingAllocationId || null,
      billingBucketLabel: bucketLabel,
      customerPoLine: line.customerPoLine || null,
      serialNumbers: Array.isArray(line.serialNumbers) ? line.serialNumbers : [],
      description: bucketLabel ? `${baseDescription} (${bucketLabel})` : baseDescription,
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
            internalPartNumber: base?.internalPartNumber ?? null,
            billingAllocationId: base?.billingAllocationId ?? null,
            billingBucketLabel: base?.billingBucketLabel ?? null,
            customerPoLine: base?.customerPoLine ?? null,
            serialNumbers: base?.serialNumbers ?? [],
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

  const invoiceNumber = slip.invoiceNumber || await assignReservedP2InvoiceNumberToPackingSlip({
    packingSlipId,
    reason: 'Reserved during invoice preview from P2 packing slip',
    changedBy: 'system:invoice-preview',
  });

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
            dimensionTags: {
              ...buildRevenueDimensionTags('P2'),
              ...(line.internalPartNumber ? { internalPartNumber: line.internalPartNumber } : {}),
              ...(line.billingAllocationId ? { billingAllocationId: line.billingAllocationId } : {}),
              ...(line.billingBucketLabel ? { billingBucketLabel: line.billingBucketLabel } : {}),
              ...(line.customerPoLine ? { customerPoLine: line.customerPoLine } : {}),
              ...(line.serialNumbers?.length ? { serialNumbers: line.serialNumbers } : {}),
            },
          })),
        );
      }

      const serialNumbers = preview.lines.flatMap((line) => line.serialNumbers ?? []);
      if (serialNumbers.length > 0) {
        const serialNumberList = sql.join(serialNumbers.map((serialNumber) => sql`${serialNumber}`), sql`, `);
        await tx.execute(sql`
          UPDATE p2_serial_billing_assignments sba
             SET invoice_id = ${invoice.id},
                 locked_at = now(),
                 locked_by = 'system:invoice-create',
                 lock_reason = 'Locked when P2 invoice was created',
                 updated_at = now()
            FROM p2_serialized_items si
           WHERE sba.serialized_item_id = si.id
             AND si.serial_number IN (${serialNumberList})
             AND sba.locked_at IS NULL
        `);
        await tx.execute(sql`
          INSERT INTO p2_billing_allocation_audit (entity_type, entity_id, action, new_value, changed_by, reason)
          SELECT
            'serial_billing_assignment',
            sba.serialized_item_id::text,
            'LOCK_FOR_INVOICE',
            jsonb_build_object(
              'invoiceId', ${invoice.id},
              'invoiceNumber', ${preview.invoiceNumber},
              'allocationId', sba.allocation_id
            ),
            'system:invoice-create',
            'Locked when P2 invoice was created'
          FROM p2_serial_billing_assignments sba
          JOIN p2_serialized_items si ON si.id = sba.serialized_item_id
          WHERE si.serial_number IN (${serialNumberList})
            AND sba.invoice_id = ${invoice.id}
        `);
      }

      await tx
        .update(p2PackingSlips)
        .set({
          invoiceNumber: preview.invoiceNumber,
          packingSlipNumber: preview.invoiceNumber,
        })
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
