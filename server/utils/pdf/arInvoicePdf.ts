import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';
import { db } from '../../db';
import { arInvoices, arInvoiceLines, p2Customers, p2PurchaseOrders, p2PackingSlips, p2LotNumbers } from '../../schema';
import { eq, sql } from 'drizzle-orm';
import { COMPANY_INFO } from '../../../shared/company-config';

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

function money(value: unknown): string {
  const num = Number(value || 0);
  return `$${num.toFixed(2)}`;
}

function date(value: unknown): string {
  if (!value) return 'N/A';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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

function billingAddress(customer: any): string[] {
  if (!customer) return [];
  return [
    customer.customerName,
    customer.billingAddress,
    [customer.billingCity, customer.billingState, customer.billingZip].filter(Boolean).join(', ').replace(', ', ', '),
    customer.contactEmail,
  ].filter(Boolean);
}

export async function generateArInvoicePdf(invoiceId: string): Promise<Buffer> {
  const [invoice] = await db
    .select({
      id: arInvoices.id,
      customerId: arInvoices.customerId,
      customerName: p2Customers.customerName,
      invoiceNumber: arInvoices.invoiceNumber,
      invoiceDate: arInvoices.invoiceDate,
      dueDate: arInvoices.dueDate,
      terms: arInvoices.terms,
      poId: arInvoices.poId,
      poOverride: arInvoices.poOverride,
      poNumber: p2PurchaseOrders.poNumber,
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
      billingAddress: p2Customers.billingAddress,
      billingCity: p2Customers.billingCity,
      billingState: p2Customers.billingState,
      billingZip: p2Customers.billingZip,
      contactEmail: p2Customers.contactEmail,
      packingSlipNumber: p2PackingSlips.packingSlipNumber,
      lotNumber: p2LotNumbers.lotNumber,
    })
    .from(arInvoices)
    .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
    .leftJoin(p2PurchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${p2PurchaseOrders.id}`)
    .leftJoin(p2PackingSlips, eq(arInvoices.packingSlipId, p2PackingSlips.id))
    .leftJoin(p2LotNumbers, eq(arInvoices.lotId, p2LotNumbers.id))
    .where(eq(arInvoices.id, invoiceId));

  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

  const lines = await db
    .select()
    .from(arInvoiceLines)
    .where(eq(arInvoiceLines.invoiceId, invoiceId));

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE.WIDTH, PAGE.HEIGHT]);
  let y = PAGE.HEIGHT - PAGE.MARGIN;

  page.drawText(COMPANY_INFO.name || 'AG Composites', { x: PAGE.MARGIN, y, size: FONT_SIZE.TITLE, font: bold, color: COLOR.TEXT });
  y -= 13;
  for (const line of [COMPANY_INFO.streetAddress, `${COMPANY_INFO.city}, ${COMPANY_INFO.state} ${COMPANY_INFO.zipCode}`, COMPANY_INFO.phone].filter(Boolean)) {
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
  page.drawText('BILL TO', { x: PAGE.MARGIN, y, size: FONT_SIZE.LABEL, font: bold, color: COLOR.ACCENT });
  page.drawText('INVOICE DETAILS', { x: mid + 12, y, size: FONT_SIZE.LABEL, font: bold, color: COLOR.ACCENT });
  y -= 13;

  let leftY = y;
  for (const line of billingAddress(invoice)) {
    page.drawText(String(line), { x: PAGE.MARGIN, y: leftY, size: FONT_SIZE.BODY, font, color: COLOR.TEXT });
    leftY -= 13;
  }

  let rightY = y;
  const detailRows = [
    ['Invoice Date:', date(invoice.invoiceDate)],
    ['Due Date:', date(invoice.dueDate)],
    ['Terms:', invoice.terms || 'N/A'],
    ['Customer PO:', invoice.poOverride || invoice.poNumber || invoice.poId || 'N/A'],
    ['Packing Slip:', invoice.packingSlipNumber || 'N/A'],
    ['Lot:', invoice.lotNumber || 'N/A'],
  ];
  for (const [label, value] of detailRows) {
    page.drawText(label, { x: mid + 12, y: rightY, size: FONT_SIZE.BODY, font: bold, color: COLOR.MUTED });
    page.drawText(String(value), { x: mid + 92, y: rightY, size: FONT_SIZE.BODY, font, color: COLOR.TEXT });
    rightY -= 13;
  }

  y = Math.min(leftY, rightY) - 15;
  page.drawRectangle({ x: PAGE.MARGIN, y: y - 18, width: PAGE.WIDTH - PAGE.MARGIN * 2, height: 18, color: COLOR.ACCENT });
  const cols = { part: PAGE.MARGIN + 5, desc: PAGE.MARGIN + 95, qty: PAGE.MARGIN + 350, unit: PAGE.MARGIN + 405, total: PAGE.MARGIN + 475 };
  page.drawText('Part #', { x: cols.part, y: y - 12, size: FONT_SIZE.TABLE, font: bold, color: COLOR.WHITE });
  page.drawText('Description', { x: cols.desc, y: y - 12, size: FONT_SIZE.TABLE, font: bold, color: COLOR.WHITE });
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
    page.drawText(line.partNumber || '', { x: cols.part, y: y - 8, size: FONT_SIZE.TABLE, font, color: COLOR.TEXT });
    descLines.forEach((dl, i) => page.drawText(dl, { x: cols.desc, y: y - 8 - i * 10, size: FONT_SIZE.TABLE, font, color: COLOR.TEXT }));
    page.drawText(String(line.qty), { x: cols.qty, y: y - 8, size: FONT_SIZE.TABLE, font, color: COLOR.TEXT });
    page.drawText(money(line.unitPrice), { x: cols.unit, y: y - 8, size: FONT_SIZE.TABLE, font, color: COLOR.TEXT });
    page.drawText(money(line.lineTotal), { x: cols.total, y: y - 8, size: FONT_SIZE.TABLE, font: bold, color: COLOR.TEXT });
    y -= rowHeight;
  });

  y -= 8;
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
  page.drawRectangle({ x: totalsX - 5, y: y - 2, width: 195, height: 20, color: COLOR.ACCENT });
  page.drawText('AMOUNT DUE:', { x: totalsX, y: y + 4, size: FONT_SIZE.SECTION, font: bold, color: COLOR.WHITE });
  page.drawText(money(invoice.totalAmount), { x: totalsX + 110, y: y + 4, size: FONT_SIZE.SECTION, font: bold, color: COLOR.WHITE });
  y -= 34;

  if (invoice.customerVisibleNotes) {
    page.drawText('NOTES', { x: PAGE.MARGIN, y, size: FONT_SIZE.SECTION, font: bold, color: COLOR.ACCENT });
    y -= 14;
    for (const line of wrap(invoice.customerVisibleNotes, PAGE.WIDTH - PAGE.MARGIN * 2, font, FONT_SIZE.BODY).slice(0, 12)) {
      page.drawText(line, { x: PAGE.MARGIN, y, size: FONT_SIZE.BODY, font, color: COLOR.TEXT });
      y -= 12;
    }
  }

  for (const pg of pdf.getPages()) {
    pg.drawLine({ start: { x: PAGE.MARGIN, y: 32 }, end: { x: PAGE.WIDTH - PAGE.MARGIN, y: 32 }, thickness: 0.5, color: COLOR.LINE });
    pg.drawText('Generated by EPOCH', { x: PAGE.MARGIN, y: 20, size: FONT_SIZE.FOOTER, font, color: COLOR.MUTED });
  }

  return Buffer.from(await pdf.save());
}
