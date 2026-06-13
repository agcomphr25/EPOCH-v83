import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';
import { db } from '../../db';
import { arInvoices, arInvoiceLines, customers, purchaseOrders, p2Customers, p2PurchaseOrders, p2PackingSlips, p2LotNumbers, p2SerializedItems } from '../../schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { COMPANY_INFO } from '../../../shared/company-config';
import { resolveAssetPath } from '../../src/utils/assetPaths';
import * as fs from 'fs';

const PAGE = { WIDTH: 612, HEIGHT: 792, MARGIN: 40 } as const;
const FONT_SIZE = { FOOTER: 7, TABLE: 8, BODY: 9, LABEL: 8, SECTION: 10, NUMBER: 14, TITLE: 16 } as const;
const COLOR = {
  TEXT: rgb(0.2, 0.2, 0.2),
  MUTED: rgb(0.45, 0.45, 0.45),
  LINE: rgb(0.86, 0.86, 0.86),
  ALT: rgb(0.97, 0.97, 0.97),
  WHITE: rgb(1, 1, 1),
  ACCENT: rgb(0.1, 0.23, 0.36),
} as const;

const TOTALS_BLOCK_HEIGHT = 116;
const NOTES_HEADER_HEIGHT = 28;
const AMOUNT_DUE_BAR_HEIGHT = 20;
const AMOUNT_DUE_BAR_GAP = 6;
const LOGO_WIDTH = 120;

const P1_COMPANY_INFO = {
  ...COMPANY_INFO,
  name: 'AG Composites',
};

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 3,
});

function money(value: unknown): string {
  const num = Number(value || 0);
  return moneyFormatter.format(Number.isFinite(num) ? num : 0);
}

function quantity(value: unknown): string {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return String(value || '');
  return numberFormatter.format(num);
}

function date(value: unknown): string {
  if (!value) return 'N/A';
  const raw = String(value);
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

function wrap(text: string, width: number, font: PDFFont, size: number): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function embedLogo(pdf: PDFDocument) {
  try {
    const logoPath = resolveAssetPath('logo_updated.png');
    if (fs.existsSync(logoPath)) {
      return await pdf.embedPng(fs.readFileSync(logoPath));
    }
  } catch {}
  return null;
}

function billingAddress(customer: any): string[] {
  if (!customer) return [];
  return [
    customer.customerName || customer.p1ShipToName,
    customer.billingAddress || customer.p1ShipToStreet,
    [customer.billingCity || customer.p1ShipToCity, customer.billingState || customer.p1ShipToState, customer.billingZip || customer.p1ShipToZip].filter(Boolean).join(', '),
    customer.contactEmail,
  ].filter(Boolean);
}

function shipToAddress(invoice: any): string[] {
  return [
    invoice.p1ShipToName || invoice.customerName,
    invoice.p1ShipToStreet || invoice.billingAddress,
    invoice.p1ShipToStreet2,
    [invoice.p1ShipToCity || invoice.billingCity, invoice.p1ShipToState || invoice.billingState, invoice.p1ShipToZip || invoice.billingZip].filter(Boolean).join(', '),
  ].filter(Boolean);
}

function consolidateLines(lines: any[]): any[] {
  const grouped = new Map<string, any>();
  for (const line of lines) {
    const key = JSON.stringify([line.partNumber || '', line.description || '', String(line.unitPrice ?? '')]);
    const existing = grouped.get(key);
    if (existing) {
      existing.qty = String(Number(existing.qty || 0) + Number(line.qty || 0));
      existing.lineTotal = String(Number(existing.lineTotal || 0) + Number(line.lineTotal || 0));
    } else {
      grouped.set(key, { ...line });
    }
  }
  return Array.from(grouped.values());
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

function stripPartPrefix(description: string, parts: Array<string | null | undefined>): string {
  let cleaned = description.trim();
  for (const part of parts) {
    const normalized = part?.trim();
    if (!normalized) continue;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`^${escaped}\\s*(-|–|—|:)\\s*`, 'i'), '').trim();
  }
  return cleaned || description;
}

function hasPartPrefix(description: string | null | undefined, part: string | null | undefined): boolean {
  const normalized = part?.trim();
  if (!description || !normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}\\s*(-|–|—|:)\\s*`, 'i').test(description.trim());
}

async function hydrateP2PdfLineDisplay(invoice: any, lines: any[]): Promise<any[]> {
  if (invoice.invoiceSource === 'P1' || !Array.isArray(invoice.packingSlipLineItems)) return lines;

  const slipLineItems = invoice.packingSlipLineItems as any[];
  const serialNumbers = Array.from(
    new Set(
      slipLineItems.flatMap((item) =>
        Array.isArray(item.serialNumbers)
          ? item.serialNumbers.filter((serial: unknown): serial is string => typeof serial === 'string' && serial.trim().length > 0)
          : [],
      ),
    ),
  );

  const skuBySerialNumber = new Map<string, string | null>();
  if (serialNumbers.length > 0) {
    const serialRows = await db
      .select({ serialNumber: p2SerializedItems.serialNumber, sku: p2SerializedItems.sku })
      .from(p2SerializedItems)
      .where(inArray(p2SerializedItems.serialNumber, serialNumbers));
    for (const row of serialRows) {
      skuBySerialNumber.set(row.serialNumber, row.sku);
    }
  }

  const slipLines = slipLineItems.map((item) => {
    const customerSku = assignedSkuFromSerials(
      (Array.isArray(item.serialNumbers) ? item.serialNumbers : [])
        .map((serialNumber: string) => ({ sku: skuBySerialNumber.get(serialNumber) })),
    ) || item.customerSku || item.sku || null;

    return {
      ...item,
      customerPartNumber: customerSku || item.partNumber || null,
    };
  });

  return lines.map((line) => {
    const match = slipLines.find((item) =>
      (line.poItemId && item.poItemId && String(line.poItemId) === String(item.poItemId)) ||
      (line.partNumber && item.partNumber && String(line.partNumber).trim() === String(item.partNumber).trim()) ||
      (line.dimensionTags?.internalPartNumber && item.partNumber && String(line.dimensionTags.internalPartNumber).trim() === String(item.partNumber).trim()) ||
      hasPartPrefix(line.description, item.partNumber)
    );
    if (!match?.customerPartNumber) return line;

    const originalPartNumber = line.partNumber || match.partNumber || line.dimensionTags?.internalPartNumber;
    return {
      ...line,
      partNumber: match.customerPartNumber,
      description: stripPartPrefix(line.description || '', [originalPartNumber, match.partNumber, match.customerPartNumber]),
    };
  });
}

const invoiceSourceSql = () => sql<string>`
  CASE WHEN EXISTS (
    SELECT 1
    FROM ar_invoice_lines ail
    WHERE ail.invoice_id = ${arInvoices.id}
      AND ail.dimension_tags->>'source' = 'p1_oem_packing_slip'
  ) THEN 'P1' ELSE 'P2' END
`;

export async function generateArInvoicePdf(invoiceId: string): Promise<Buffer> {
  const [invoice] = await db
    .select({
      id: arInvoices.id,
      customerId: arInvoices.customerId,
      customerName: sql<string | null>`
        COALESCE(
          CASE WHEN (${invoiceSourceSql()}) = 'P1' THEN ${customers.name} ELSE ${p2Customers.customerName} END,
          ${purchaseOrders.customerName},
          ${p2Customers.customerName}
        )
      `,
      invoiceNumber: arInvoices.invoiceNumber,
      invoiceDate: arInvoices.invoiceDate,
      dueDate: arInvoices.dueDate,
      terms: arInvoices.terms,
      poId: arInvoices.poId,
      poOverride: arInvoices.poOverride,
      poNumber: sql<string | null>`
        COALESCE(
          CASE WHEN (${invoiceSourceSql()}) = 'P1' THEN ${purchaseOrders.poNumber} ELSE ${p2PurchaseOrders.poNumber} END,
          ${arInvoices.poOverride},
          ${purchaseOrders.poNumber},
          ${p2PurchaseOrders.poNumber}
        )
      `,
      invoiceSource: invoiceSourceSql(),
      packingSlipId: arInvoices.packingSlipId,
      lotId: arInvoices.lotId,
      subtotal: arInvoices.subtotal,
      discountAmount: arInvoices.discountAmount,
      freightAmount: arInvoices.freightAmount,
      taxAmount: arInvoices.taxAmount,
      retainagePercent: arInvoices.retainagePercent,
      retainageAmount: arInvoices.retainageAmount,
      totalAmount: arInvoices.totalAmount,
      customerVisibleNotes: arInvoices.customerVisibleNotes,
      status: arInvoices.status,
      billingAddress: sql<string | null>`CASE WHEN (${invoiceSourceSql()}) = 'P1' THEN NULL ELSE ${p2Customers.billingAddress} END`,
      billingCity: sql<string | null>`CASE WHEN (${invoiceSourceSql()}) = 'P1' THEN NULL ELSE ${p2Customers.billingCity} END`,
      billingState: sql<string | null>`CASE WHEN (${invoiceSourceSql()}) = 'P1' THEN NULL ELSE ${p2Customers.billingState} END`,
      billingZip: sql<string | null>`CASE WHEN (${invoiceSourceSql()}) = 'P1' THEN NULL ELSE ${p2Customers.billingZip} END`,
      contactEmail: sql<string | null>`CASE WHEN (${invoiceSourceSql()}) = 'P1' THEN ${customers.email} ELSE ${p2Customers.contactEmail} END`,
      packingSlipNumber: p2PackingSlips.packingSlipNumber,
      packingSlipLineItems: p2PackingSlips.lineItems,
      lotNumber: p2LotNumbers.lotNumber,
      p1ShipToName: sql<string | null>`(
        SELECT sr.ship_to_snapshot->>'name'
        FROM shipment_records sr
        WHERE sr.id::text = (
          SELECT ail.dimension_tags->>'shipmentRecordId'
          FROM ar_invoice_lines ail
          WHERE ail.invoice_id = ${arInvoices.id}
            AND ail.dimension_tags->>'source' = 'p1_oem_packing_slip'
          LIMIT 1
        )
        LIMIT 1
      )`,
      p1ShipToStreet: sql<string | null>`(
        SELECT sr.ship_to_snapshot->>'street'
        FROM shipment_records sr
        WHERE sr.id::text = (
          SELECT ail.dimension_tags->>'shipmentRecordId'
          FROM ar_invoice_lines ail
          WHERE ail.invoice_id = ${arInvoices.id}
            AND ail.dimension_tags->>'source' = 'p1_oem_packing_slip'
          LIMIT 1
        )
        LIMIT 1
      )`,
      p1ShipToStreet2: sql<string | null>`(
        SELECT sr.ship_to_snapshot->>'street2'
        FROM shipment_records sr
        WHERE sr.id::text = (
          SELECT ail.dimension_tags->>'shipmentRecordId'
          FROM ar_invoice_lines ail
          WHERE ail.invoice_id = ${arInvoices.id}
            AND ail.dimension_tags->>'source' = 'p1_oem_packing_slip'
          LIMIT 1
        )
        LIMIT 1
      )`,
      p1ShipToCity: sql<string | null>`(
        SELECT sr.ship_to_snapshot->>'city'
        FROM shipment_records sr
        WHERE sr.id::text = (
          SELECT ail.dimension_tags->>'shipmentRecordId'
          FROM ar_invoice_lines ail
          WHERE ail.invoice_id = ${arInvoices.id}
            AND ail.dimension_tags->>'source' = 'p1_oem_packing_slip'
          LIMIT 1
        )
        LIMIT 1
      )`,
      p1ShipToState: sql<string | null>`(
        SELECT sr.ship_to_snapshot->>'state'
        FROM shipment_records sr
        WHERE sr.id::text = (
          SELECT ail.dimension_tags->>'shipmentRecordId'
          FROM ar_invoice_lines ail
          WHERE ail.invoice_id = ${arInvoices.id}
            AND ail.dimension_tags->>'source' = 'p1_oem_packing_slip'
          LIMIT 1
        )
        LIMIT 1
      )`,
      p1ShipToZip: sql<string | null>`(
        SELECT sr.ship_to_snapshot->>'postalCode'
        FROM shipment_records sr
        WHERE sr.id::text = (
          SELECT ail.dimension_tags->>'shipmentRecordId'
          FROM ar_invoice_lines ail
          WHERE ail.invoice_id = ${arInvoices.id}
            AND ail.dimension_tags->>'source' = 'p1_oem_packing_slip'
          LIMIT 1
        )
        LIMIT 1
      )`,
      p1TrackingNumber: sql<string | null>`(
        SELECT sr.master_tracking_number
        FROM shipment_records sr
        WHERE sr.id::text = (
          SELECT ail.dimension_tags->>'shipmentRecordId'
          FROM ar_invoice_lines ail
          WHERE ail.invoice_id = ${arInvoices.id}
            AND ail.dimension_tags->>'source' = 'p1_oem_packing_slip'
          LIMIT 1
        )
        LIMIT 1
      )`,
    })
    .from(arInvoices)
    .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
    .leftJoin(p2PurchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${p2PurchaseOrders.id}`)
    .leftJoin(customers, sql`(CASE WHEN ${arInvoices.customerId} ~ '^[0-9]+$' THEN ${arInvoices.customerId}::integer END) = ${customers.id}`)
    .leftJoin(purchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${purchaseOrders.id}`)
    .leftJoin(p2PackingSlips, eq(arInvoices.packingSlipId, p2PackingSlips.id))
    .leftJoin(p2LotNumbers, eq(arInvoices.lotId, p2LotNumbers.id))
    .where(eq(arInvoices.id, invoiceId));

  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

  const rawLines = await db
    .select()
    .from(arInvoiceLines)
    .where(eq(arInvoiceLines.invoiceId, invoiceId));
  const lines = consolidateLines(await hydrateP2PdfLineDisplay(invoice, rawLines));

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(pdf);
  let page = pdf.addPage([PAGE.WIDTH, PAGE.HEIGHT]);
  let y = PAGE.HEIGHT - PAGE.MARGIN;

  const addPage = () => {
    page = pdf.addPage([PAGE.WIDTH, PAGE.HEIGHT]);
    y = PAGE.HEIGHT - PAGE.MARGIN;
  };

  const ensureSpace = (height: number) => {
    if (y - height < PAGE.MARGIN + 40) addPage();
  };

  const isP1Invoice = invoice.invoiceSource === 'P1';
  const companyInfo = isP1Invoice ? P1_COMPANY_INFO : COMPANY_INFO;

  if (isP1Invoice && logo) {
    const logoHeight = LOGO_WIDTH * (logo.height / logo.width);
    page.drawImage(logo, { x: PAGE.MARGIN, y: y - logoHeight, width: LOGO_WIDTH, height: logoHeight });
    y -= logoHeight + 8;
  } else {
    page.drawText(companyInfo.name || 'AG Composites', { x: PAGE.MARGIN, y, size: FONT_SIZE.TITLE, font: bold, color: COLOR.TEXT });
    y -= 13;
  }
  for (const line of [companyInfo.streetAddress, `${companyInfo.city}, ${companyInfo.state} ${companyInfo.zipCode}`, companyInfo.phone].filter(Boolean)) {
    page.drawText(line, { x: PAGE.MARGIN, y, size: FONT_SIZE.LABEL, font, color: COLOR.MUTED });
    y -= 11;
  }

  const boxX = PAGE.WIDTH - PAGE.MARGIN - 200;
  const boxY = PAGE.HEIGHT - PAGE.MARGIN - 60;
  page.drawRectangle({ x: boxX, y: boxY, width: 200, height: 60, color: COLOR.ACCENT });
  page.drawText('INVOICE', { x: boxX + 66, y: boxY + 37, size: FONT_SIZE.TITLE, font: bold, color: COLOR.WHITE });
  page.drawText(invoice.invoiceNumber, { x: boxX + 28, y: boxY + 17, size: FONT_SIZE.NUMBER, font: bold, color: COLOR.WHITE });

  y = Math.min(y - 8, boxY - 18);
  page.drawLine({ start: { x: PAGE.MARGIN, y }, end: { x: PAGE.WIDTH - PAGE.MARGIN, y }, thickness: 1, color: COLOR.LINE });
  y -= 18;

  const mid = PAGE.WIDTH / 2;
  page.drawText(isP1Invoice ? 'SHIP TO' : 'BILL TO', { x: PAGE.MARGIN, y, size: FONT_SIZE.LABEL, font: bold, color: COLOR.ACCENT });
  page.drawText('INVOICE DETAILS', { x: mid + 12, y, size: FONT_SIZE.LABEL, font: bold, color: COLOR.ACCENT });
  y -= 13;

  let leftY = y;
  const leftLines = isP1Invoice ? shipToAddress(invoice) : billingAddress(invoice);
  if (isP1Invoice) {
    const shipBoxHeight = Math.max(44, leftLines.length * 13 + 8);
    page.drawRectangle({
      x: PAGE.MARGIN,
      y: y - shipBoxHeight + 6,
      width: mid - PAGE.MARGIN - 12,
      height: shipBoxHeight,
      borderColor: COLOR.LINE,
      borderWidth: 1,
    });
    leftY -= 6;
  }
  for (const line of leftLines) {
    page.drawText(String(line), { x: PAGE.MARGIN + (isP1Invoice ? 6 : 0), y: leftY, size: FONT_SIZE.BODY, font, color: COLOR.TEXT });
    leftY -= 13;
  }
  if (isP1Invoice) leftY -= 4;

  let rightY = y;
  const detailRows: Array<[string, string]> = [
    ['Invoice Date:', date(invoice.invoiceDate)],
    ['Due Date:', date(invoice.dueDate)],
    ['Terms:', String(invoice.terms || 'N/A')],
    ['Customer PO:', String(invoice.poOverride || invoice.poNumber || invoice.poId || 'N/A')],
    ['Packing Slip:', String(invoice.packingSlipNumber || (isP1Invoice ? invoice.invoiceNumber : 'N/A'))],
    ...(isP1Invoice ? [['Tracking #:', String(invoice.p1TrackingNumber || 'N/A')]] : [['Lot:', String(invoice.lotNumber || 'N/A')]]),
  ];
  for (const [label, value] of detailRows) {
    page.drawText(label, { x: mid + 12, y: rightY, size: FONT_SIZE.BODY, font: bold, color: COLOR.MUTED });
    page.drawText(String(value), { x: mid + 92, y: rightY, size: FONT_SIZE.BODY, font, color: COLOR.TEXT });
    rightY -= 13;
  }

  y = Math.min(leftY, rightY) - 15;
  page.drawRectangle({ x: PAGE.MARGIN, y: y - 18, width: PAGE.WIDTH - PAGE.MARGIN * 2, height: 18, color: COLOR.ACCENT });
  const cols = { part: PAGE.MARGIN + 5, desc: PAGE.MARGIN + 105, qty: PAGE.MARGIN + 350, unit: PAGE.MARGIN + 405, total: PAGE.MARGIN + 475 };
  page.drawText(isP1Invoice ? 'PO #' : 'Part #', { x: cols.part, y: y - 12, size: FONT_SIZE.TABLE, font: bold, color: COLOR.WHITE });
  page.drawText(isP1Invoice ? 'Contents' : 'Description', { x: cols.desc, y: y - 12, size: FONT_SIZE.TABLE, font: bold, color: COLOR.WHITE });
  page.drawText('Qty', { x: cols.qty, y: y - 12, size: FONT_SIZE.TABLE, font: bold, color: COLOR.WHITE });
  page.drawText('Unit', { x: cols.unit, y: y - 12, size: FONT_SIZE.TABLE, font: bold, color: COLOR.WHITE });
  page.drawText('Total', { x: cols.total, y: y - 12, size: FONT_SIZE.TABLE, font: bold, color: COLOR.WHITE });
  y -= 24;

  lines.forEach((line, idx) => {
    const descLines = wrap(line.description, 240, font, FONT_SIZE.TABLE);
    const rowHeight = Math.max(17, descLines.length * 10 + 6);
    if (y - rowHeight < PAGE.MARGIN + 120) {
      page = pdf.addPage([PAGE.WIDTH, PAGE.HEIGHT]);
      y = PAGE.HEIGHT - PAGE.MARGIN;
    }
    if (idx % 2 === 1) page.drawRectangle({ x: PAGE.MARGIN, y: y - rowHeight + 3, width: PAGE.WIDTH - PAGE.MARGIN * 2, height: rowHeight, color: COLOR.ALT });
    page.drawText(isP1Invoice ? String(invoice.poOverride || invoice.poNumber || invoice.poId || '') : (line.partNumber || ''), { x: cols.part, y: y - 8, size: FONT_SIZE.TABLE, font, color: COLOR.TEXT });
    descLines.forEach((dl, i) => page.drawText(dl, { x: cols.desc, y: y - 8 - i * 10, size: FONT_SIZE.TABLE, font, color: COLOR.TEXT }));
    page.drawText(quantity(line.qty), { x: cols.qty, y: y - 8, size: FONT_SIZE.TABLE, font, color: COLOR.TEXT });
    page.drawText(money(line.unitPrice), { x: cols.unit, y: y - 8, size: FONT_SIZE.TABLE, font, color: COLOR.TEXT });
    page.drawText(money(line.lineTotal), { x: cols.total, y: y - 8, size: FONT_SIZE.TABLE, font: bold, color: COLOR.TEXT });
    y -= rowHeight;
  });

  y -= 8;
  ensureSpace(TOTALS_BLOCK_HEIGHT);
  page.drawLine({ start: { x: PAGE.MARGIN, y }, end: { x: PAGE.WIDTH - PAGE.MARGIN, y }, thickness: 1, color: COLOR.LINE });
  y -= 18;

  const totalsX = PAGE.WIDTH - PAGE.MARGIN - 190;
  const totalRows = [
    ['Subtotal:', money(invoice.subtotal)],
    ['Discount:', Number(invoice.discountAmount || 0) ? `-${money(invoice.discountAmount)}` : money(0)],
    ['Freight:', money(invoice.freightAmount)],
    ['Tax:', money(invoice.taxAmount)],
    ['Retainage:', Number(invoice.retainageAmount || 0) ? `-${money(invoice.retainageAmount)}` : money(0)],
  ];
  for (const [label, value] of totalRows) {
    page.drawText(String(label), { x: totalsX, y, size: FONT_SIZE.BODY, font, color: COLOR.MUTED });
    page.drawText(String(value), { x: totalsX + 110, y, size: FONT_SIZE.BODY, font, color: COLOR.TEXT });
    y -= 14;
  }
  y -= AMOUNT_DUE_BAR_GAP;
  page.drawRectangle({ x: totalsX - 5, y: y - AMOUNT_DUE_BAR_HEIGHT, width: 195, height: AMOUNT_DUE_BAR_HEIGHT, color: COLOR.ACCENT });
  page.drawText('AMOUNT DUE:', { x: totalsX, y: y - 14, size: FONT_SIZE.SECTION, font: bold, color: COLOR.WHITE });
  page.drawText(money(invoice.totalAmount), { x: totalsX + 110, y: y - 14, size: FONT_SIZE.SECTION, font: bold, color: COLOR.WHITE });
  y -= AMOUNT_DUE_BAR_HEIGHT + 14;

  if (invoice.customerVisibleNotes) {
    ensureSpace(NOTES_HEADER_HEIGHT);
    page.drawText('NOTES', { x: PAGE.MARGIN, y, size: FONT_SIZE.SECTION, font: bold, color: COLOR.ACCENT });
    y -= 14;
    for (const line of wrap(invoice.customerVisibleNotes, PAGE.WIDTH - PAGE.MARGIN * 2, font, FONT_SIZE.BODY).slice(0, 12)) {
      ensureSpace(12);
      page.drawText(line, { x: PAGE.MARGIN, y, size: FONT_SIZE.BODY, font, color: COLOR.TEXT });
      y -= 12;
    }
  }

  for (const pg of pdf.getPages()) {
    pg.drawLine({ start: { x: PAGE.MARGIN, y: 32 }, end: { x: PAGE.WIDTH - PAGE.MARGIN, y: 32 }, thickness: 0.5, color: COLOR.LINE });
  }

  return Buffer.from(await pdf.save());
}
