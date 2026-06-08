import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { storage } from '../../storage';
import { resolveAssetPath } from '../../src/utils/assetPaths';
import { resolveVendorPoReturnEmail } from '../vendorPoContact';
import * as fs from 'fs';

const PAGE = { WIDTH: 612, HEIGHT: 792, MARGIN: 40 } as const;
const PRINTABLE_WIDTH = PAGE.WIDTH - PAGE.MARGIN * 2;

const FONT_SIZE = {
  FOOTER: 7,
  TABLE_CELL: 8,
  SECTION_LABEL: 8,
  BODY: 9,
  SECTION_TITLE: 10,
  PO_NUMBER: 14,
  DOC_TITLE: 16,
} as const;

const LINE_HEIGHT = {
  SMALL: 11,
  BODY: 13,
  SECTION_GAP: 16,
  AFTER_DIVIDER: 18,
  TOTAL_ROW: 15,
} as const;

const SPACING = {
  CELL_PAD: 4,
  LOGO_GAP: 8,
  TEXT_INSET: 5,
  ROW_TEXT_OFFSET: 10,
  SECTION_BREAK: 12,
  DETAIL_LABEL_OFFSET: 10,
  DETAIL_VALUE_OFFSET: 80,
  TOTAL_BAR_HEIGHT: 18,
  TOTAL_BAR_PAD: 5,
  TOTAL_BAR_OFFSET: 2,
  AFTER_TOTAL: 30,
  NOTES_GAP: 10,
  NOTES_TITLE_GAP: 14,
  TERMS_TITLE_GAP: 16,
  TERMS_SUBSECTION_GAP: 12,
  TERMS_SUBSECTION_TAIL: 4,
  MIN_ROW_HEIGHT: 14,
  ROW_HEIGHT_PAD: 3,
  FOOTER_OFFSET: 5,
  FOOTER_LINE_OFFSET: 12,
} as const;

const PAGE_BREAK = {
  TABLE_ROW: 40,
  TERMS_SECTION: 80,
  TERMS_INNER: 15,
  NOTES_SECTION: 50,
} as const;

const TITLE_BOX = { WIDTH: 200, HEIGHT: 60, TITLE_Y: 24, NUMBER_Y: 44, BELOW_GAP: 15 } as const;
const LOGO_WIDTH = 140;

const COLOR = {
  PRIMARY_TEXT: rgb(0.2, 0.2, 0.2),
  SECONDARY_TEXT: rgb(0.3, 0.3, 0.3),
  MUTED_TEXT: rgb(0.4, 0.4, 0.4),
  FOOTER_TEXT: rgb(0.6, 0.6, 0.6),
  DIVIDER: rgb(0.85, 0.85, 0.85),
  ALT_ROW_BG: rgb(0.97, 0.97, 0.97),
  WHITE: rgb(1, 1, 1),
  ACCENT_PO: rgb(0.1, 0.23, 0.36),
  ACCENT_RFQ: rgb(0.9, 0.49, 0.13),
} as const;

const TABLE_COL_WIDTHS_BASE = {
  LINE: 30,
  PART_NUM: 90,
  UNIT: 50,
  QTY: 60,
  UNIT_PRICE: 70,
  TOTAL: 70,
} as const;

const TABLE_COL_WIDTHS_WITH_NOTES = {
  LINE: 25,
  PART_NUM: 75,
  UNIT: 40,
  QTY: 45,
  UNIT_PRICE: 65,
  TOTAL: 65,
  NOTES: 97,
} as const;

function computeDescWidth(withNotes: boolean): number {
  if (withNotes) {
    return PRINTABLE_WIDTH
      - TABLE_COL_WIDTHS_WITH_NOTES.LINE
      - TABLE_COL_WIDTHS_WITH_NOTES.PART_NUM
      - TABLE_COL_WIDTHS_WITH_NOTES.NOTES
      - TABLE_COL_WIDTHS_WITH_NOTES.UNIT
      - TABLE_COL_WIDTHS_WITH_NOTES.QTY
      - TABLE_COL_WIDTHS_WITH_NOTES.UNIT_PRICE
      - TABLE_COL_WIDTHS_WITH_NOTES.TOTAL;
  }
  return PRINTABLE_WIDTH
    - TABLE_COL_WIDTHS_BASE.LINE
    - TABLE_COL_WIDTHS_BASE.PART_NUM
    - TABLE_COL_WIDTHS_BASE.UNIT
    - TABLE_COL_WIDTHS_BASE.QTY
    - TABLE_COL_WIDTHS_BASE.UNIT_PRICE
    - TABLE_COL_WIDTHS_BASE.TOTAL;
}

const HEADER_ROW_HEIGHT = SPACING.TOTAL_BAR_HEIGHT;

interface VendorPOData {
  po: any;
  vendor: any;
  items: any[];
  companySettings: any;
  poSettings: any;
}

async function fetchVendorPOData(poId: number): Promise<VendorPOData> {
  const po = await storage.getVendorPO(poId);
  if (!po) throw new Error(`Vendor PO #${poId} not found`);

  const [vendor, items, companySettings, poSettings] = await Promise.all([
    storage.getVendor(po.vendorId),
    storage.getVendorPOItems(poId),
    storage.getCompanySettings(),
    storage.getVendorPOSettings(),
  ]);

  if (!vendor) throw new Error(`Vendor #${po.vendorId} not found for PO #${poId}`);

  return { po, vendor, items: items ?? [], companySettings, poSettings };
}

function formatDate(dateValue: any): string {
  if (!dateValue) return 'N/A';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(value: any): string {
  const num = Number(value);
  if (isNaN(num)) return '$0.00';
  return `$${num.toFixed(2)}`;
}

function truncateText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && font.widthOfTextAtSize(truncated + '...', fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}

function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(testLine, fontSize) > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

async function embedLogo(pdfDoc: PDFDocument) {
  try {
    const logoPath = resolveAssetPath('logo_updated.png');
    if (fs.existsSync(logoPath)) {
      const logoBytes = fs.readFileSync(logoPath);
      return await pdfDoc.embedPng(logoBytes);
    }
  } catch {}
  return null;
}

function buildTableColumnPositions(margin: number, withNotes: boolean) {
  const colW = withNotes ? TABLE_COL_WIDTHS_WITH_NOTES : TABLE_COL_WIDTHS_BASE;
  const descWidth = computeDescWidth(withNotes);
  const line = margin;
  const partNum = line + colW.LINE;
  const description = partNum + colW.PART_NUM;
  const notes = description + descWidth;
  const unit = withNotes ? notes + TABLE_COL_WIDTHS_WITH_NOTES.NOTES : notes;
  const qty = unit + colW.UNIT;
  const unitPrice = qty + colW.QTY;
  const total = unitPrice + colW.UNIT_PRICE;
  return { line, partNum, description, notes: withNotes ? notes : null, unit, qty, unitPrice, total };
}

export async function generateVendorPoPdf(poId: number): Promise<Buffer> {
  const data = await fetchVendorPOData(poId);
  const { po, vendor, items, companySettings, poSettings } = data;

  const isRFQ = !po.poNumber;
  const docTitle = isRFQ ? 'REQUEST FOR QUOTE' : 'PURCHASE ORDER';
  const accentColor = isRFQ ? COLOR.ACCENT_RFQ : COLOR.ACCENT_PO;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE.WIDTH, PAGE.HEIGHT]);
  const { width, height } = page.getSize();
  let y = height - PAGE.MARGIN;

  const logo = await embedLogo(pdfDoc);
  if (logo) {
    const logoHeight = LOGO_WIDTH * (logo.height / logo.width);
    page.drawImage(logo, { x: PAGE.MARGIN, y: y - logoHeight, width: LOGO_WIDTH, height: logoHeight });
    y -= logoHeight + SPACING.LOGO_GAP;
  }

  const companyName = companySettings?.companyName || 'AG Composites';
  const companyAddress = companySettings?.companyAddress || '';
  const companyPhone = companySettings?.companyPhone || '';
  const companyEmail = resolveVendorPoReturnEmail(poSettings) || companySettings?.companyEmail || '';

  if (companyAddress) {
    page.drawText(companyAddress, { x: PAGE.MARGIN, y, size: FONT_SIZE.SECTION_LABEL, font, color: COLOR.MUTED_TEXT });
    y -= LINE_HEIGHT.SMALL;
  }
  if (companyPhone || companyEmail) {
    const contactLine = [companyPhone ? `Phone: ${companyPhone}` : '', companyEmail ? `Email: ${companyEmail}` : ''].filter(Boolean).join(' | ');
    page.drawText(contactLine, { x: PAGE.MARGIN, y, size: FONT_SIZE.SECTION_LABEL, font, color: COLOR.MUTED_TEXT });
    y -= LINE_HEIGHT.SECTION_GAP;
  }

  const titleBoxX = width - PAGE.MARGIN - TITLE_BOX.WIDTH;
  const titleBoxY = height - PAGE.MARGIN - TITLE_BOX.HEIGHT;

  page.drawRectangle({ x: titleBoxX, y: titleBoxY, width: TITLE_BOX.WIDTH, height: TITLE_BOX.HEIGHT, color: accentColor });
  const titleWidth = boldFont.widthOfTextAtSize(docTitle, FONT_SIZE.DOC_TITLE);
  page.drawText(docTitle, { x: titleBoxX + (TITLE_BOX.WIDTH - titleWidth) / 2, y: titleBoxY + TITLE_BOX.HEIGHT - TITLE_BOX.TITLE_Y, size: FONT_SIZE.DOC_TITLE, font: boldFont, color: COLOR.WHITE });

  const displayPoNumber = po.poNumber?.startsWith('VPO-')
    ? po.poNumber.slice(4)
    : (po.poNumber ?? '');

  if (po.poNumber) {
    const poNumStr = displayPoNumber;
    const poNumWidth = boldFont.widthOfTextAtSize(`#${poNumStr}`, FONT_SIZE.PO_NUMBER);
    page.drawText(`#${poNumStr}`, { x: titleBoxX + (TITLE_BOX.WIDTH - poNumWidth) / 2, y: titleBoxY + TITLE_BOX.HEIGHT - TITLE_BOX.NUMBER_Y, size: FONT_SIZE.PO_NUMBER, font: boldFont, color: COLOR.WHITE });
  }

  y = Math.min(y, titleBoxY - TITLE_BOX.BELOW_GAP);

  page.drawLine({ start: { x: PAGE.MARGIN, y }, end: { x: width - PAGE.MARGIN, y }, thickness: 1, color: COLOR.DIVIDER });
  y -= LINE_HEIGHT.AFTER_DIVIDER;

  const colMid = width / 2;

  page.drawText('VENDOR', { x: PAGE.MARGIN, y, size: FONT_SIZE.SECTION_LABEL, font: boldFont, color: accentColor });
  page.drawText('ORDER DETAILS', { x: colMid + SPACING.DETAIL_LABEL_OFFSET, y, size: FONT_SIZE.SECTION_LABEL, font: boldFont, color: accentColor });
  y -= LINE_HEIGHT.BODY + 1;

  const vendorLines = [
    vendor.name,
    vendor.contactPerson || '',
    vendor.address || '',
    vendor.email || '',
    vendor.phone || '',
  ].filter(Boolean);

  let vendorY = y;
  for (const line of vendorLines) {
    page.drawText(line, { x: PAGE.MARGIN, y: vendorY, size: FONT_SIZE.BODY, font, color: COLOR.PRIMARY_TEXT });
    vendorY -= LINE_HEIGHT.BODY;
  }

  let detailY = y;
  const details = [
    ['Date:', formatDate(po.orderDate || po.createdAt)],
    ['Delivery:', formatDate(po.expectedDeliveryDate)],
    po.poNumber ? ['PO #:', displayPoNumber] : null,
    po.externalPoNumber ? ['Legacy ERP PO #:', po.externalPoNumber] : null,
    po.status ? ['Status:', po.status] : null,
  ].filter(Boolean) as string[][];

  for (const [label, value] of details) {
    page.drawText(label, { x: colMid + SPACING.DETAIL_LABEL_OFFSET, y: detailY, size: FONT_SIZE.BODY, font: boldFont, color: COLOR.SECONDARY_TEXT });
    page.drawText(value, { x: colMid + SPACING.DETAIL_VALUE_OFFSET, y: detailY, size: FONT_SIZE.BODY, font, color: COLOR.PRIMARY_TEXT });
    detailY -= LINE_HEIGHT.BODY;
  }

  y = Math.min(vendorY, detailY) - SPACING.SECTION_BREAK;

  page.drawLine({ start: { x: PAGE.MARGIN, y }, end: { x: width - PAGE.MARGIN, y }, thickness: 1, color: COLOR.DIVIDER });
  y -= SPACING.TEXT_INSET;

  const hasAnyNotes = items.some(item => item.notes?.trim());
  const cols = buildTableColumnPositions(PAGE.MARGIN, hasAnyNotes);
  const activeDescWidth = computeDescWidth(hasAnyNotes);
  const activePartNumWidth = hasAnyNotes ? TABLE_COL_WIDTHS_WITH_NOTES.PART_NUM : TABLE_COL_WIDTHS_BASE.PART_NUM;
  const activeNotesWidth = hasAnyNotes ? TABLE_COL_WIDTHS_WITH_NOTES.NOTES : 0;

  page.drawRectangle({ x: PAGE.MARGIN, y: y - HEADER_ROW_HEIGHT, width: PRINTABLE_WIDTH, height: HEADER_ROW_HEIGHT, color: accentColor });
  y -= HEADER_ROW_HEIGHT - SPACING.CELL_PAD;

  const headers: { text: string; x: number }[] = [
    { text: '#', x: cols.line + SPACING.CELL_PAD },
    { text: 'Part Number', x: cols.partNum + SPACING.CELL_PAD },
    { text: 'Description', x: cols.description + SPACING.CELL_PAD },
    ...(hasAnyNotes && cols.notes !== null ? [{ text: 'Notes', x: cols.notes + SPACING.CELL_PAD }] : []),
    { text: 'Unit', x: cols.unit + SPACING.CELL_PAD },
    { text: 'Qty', x: cols.qty + SPACING.CELL_PAD },
    { text: 'Unit Price', x: cols.unitPrice + SPACING.CELL_PAD },
    { text: 'Total', x: cols.total + SPACING.CELL_PAD },
  ];

  for (const h of headers) {
    page.drawText(h.text, { x: h.x, y, size: FONT_SIZE.TABLE_CELL, font: boldFont, color: COLOR.WHITE });
  }
  y -= FONT_SIZE.TABLE_CELL;

  let lineTotal = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const itemTotal = qty * price;
    lineTotal += itemTotal;

    const descText = item.description || item.itemDescription || '';
    const descLines = wrapText(descText, activeDescWidth - SPACING.CELL_PAD, font, FONT_SIZE.TABLE_CELL);

    const noteText = hasAnyNotes ? (item.notes?.trim() || '') : '';
    const noteLines = noteText
      ? wrapText(noteText, activeNotesWidth - SPACING.CELL_PAD, font, FONT_SIZE.TABLE_CELL)
      : [];

    const contentLineCount = Math.max(descLines.length, noteLines.length, 1);
    const rowHeight = Math.max(SPACING.MIN_ROW_HEIGHT, contentLineCount * LINE_HEIGHT.SMALL + SPACING.ROW_HEIGHT_PAD);

    if (y - rowHeight < PAGE.MARGIN + PAGE_BREAK.TABLE_ROW) {
      page = pdfDoc.addPage([PAGE.WIDTH, PAGE.HEIGHT]);
      y = height - PAGE.MARGIN;
    }

    if (i % 2 === 1) {
      page.drawRectangle({ x: PAGE.MARGIN, y: y - rowHeight, width: PRINTABLE_WIDTH, height: rowHeight, color: COLOR.ALT_ROW_BG });
    }

    const textY = y - SPACING.ROW_TEXT_OFFSET;
    page.drawText(String(item.lineNumber ?? i + 1), { x: cols.line + SPACING.CELL_PAD, y: textY, size: FONT_SIZE.TABLE_CELL, font, color: COLOR.SECONDARY_TEXT });
    page.drawText(truncateText(item.supplierPartNumber || item.agPartNumber || '', activePartNumWidth - SPACING.CELL_PAD, font, FONT_SIZE.TABLE_CELL), { x: cols.partNum + SPACING.CELL_PAD, y: textY, size: FONT_SIZE.TABLE_CELL, font, color: COLOR.PRIMARY_TEXT });

    for (let dl = 0; dl < descLines.length; dl++) {
      page.drawText(descLines[dl], { x: cols.description + SPACING.CELL_PAD, y: textY - (dl * LINE_HEIGHT.SMALL), size: FONT_SIZE.TABLE_CELL, font, color: COLOR.PRIMARY_TEXT });
    }

    if (hasAnyNotes && cols.notes !== null) {
      for (let nl = 0; nl < noteLines.length; nl++) {
        page.drawText(noteLines[nl], { x: cols.notes + SPACING.CELL_PAD, y: textY - (nl * LINE_HEIGHT.SMALL), size: FONT_SIZE.TABLE_CELL, font, color: COLOR.MUTED_TEXT });
      }
    }

    page.drawText(item.unit || 'EA', { x: cols.unit + SPACING.CELL_PAD, y: textY, size: FONT_SIZE.TABLE_CELL, font, color: COLOR.SECONDARY_TEXT });
    page.drawText(String(qty), { x: cols.qty + SPACING.CELL_PAD, y: textY, size: FONT_SIZE.TABLE_CELL, font, color: COLOR.PRIMARY_TEXT });
    page.drawText(formatCurrency(price), { x: cols.unitPrice + SPACING.CELL_PAD, y: textY, size: FONT_SIZE.TABLE_CELL, font, color: COLOR.PRIMARY_TEXT });
    page.drawText(formatCurrency(itemTotal), { x: cols.total + SPACING.CELL_PAD, y: textY, size: FONT_SIZE.TABLE_CELL, font: boldFont, color: COLOR.PRIMARY_TEXT });

    y -= rowHeight;
  }

  y -= SPACING.TEXT_INSET;
  page.drawLine({ start: { x: PAGE.MARGIN, y }, end: { x: width - PAGE.MARGIN, y }, thickness: 1, color: COLOR.DIVIDER });
  y -= LINE_HEIGHT.SECTION_GAP;

  const totalLabelX = cols.unitPrice - SPACING.DETAIL_LABEL_OFFSET;
  const totalValueX = cols.total + SPACING.CELL_PAD;

  page.drawText('Subtotal:', { x: totalLabelX, y, size: FONT_SIZE.BODY, font: boldFont, color: COLOR.SECONDARY_TEXT });
  page.drawText(formatCurrency(lineTotal), { x: totalValueX, y, size: FONT_SIZE.BODY, font: boldFont, color: COLOR.PRIMARY_TEXT });
  y -= LINE_HEIGHT.TOTAL_ROW;

  if (po.shippingCost && Number(po.shippingCost) > 0) {
    page.drawText('Shipping:', { x: totalLabelX, y, size: FONT_SIZE.BODY, font, color: COLOR.SECONDARY_TEXT });
    page.drawText(formatCurrency(po.shippingCost), { x: totalValueX, y, size: FONT_SIZE.BODY, font, color: COLOR.PRIMARY_TEXT });
    y -= LINE_HEIGHT.TOTAL_ROW;
    lineTotal += Number(po.shippingCost);
  }

  page.drawRectangle({ x: totalLabelX - SPACING.TOTAL_BAR_PAD, y: y - SPACING.TOTAL_BAR_OFFSET, width: PRINTABLE_WIDTH - (totalLabelX - PAGE.MARGIN) + SPACING.TOTAL_BAR_PAD, height: SPACING.TOTAL_BAR_HEIGHT, color: accentColor });
  page.drawText('TOTAL:', { x: totalLabelX, y: y + SPACING.TOTAL_BAR_OFFSET, size: FONT_SIZE.SECTION_TITLE, font: boldFont, color: COLOR.WHITE });
  page.drawText(formatCurrency(po.totalCost || lineTotal), { x: totalValueX, y: y + SPACING.TOTAL_BAR_OFFSET, size: FONT_SIZE.SECTION_TITLE, font: boldFont, color: COLOR.WHITE });
  y -= SPACING.AFTER_TOTAL;

  const terms = vendor.termsAndConditions || poSettings?.termsAndConditions;
  const paymentTerms = vendor.paymentTerms || poSettings?.paymentTerms;
  const shippingInstructions = vendor.shippingInstructions || poSettings?.shippingInstructions;

  if (paymentTerms || shippingInstructions || terms) {
    if (y < PAGE.MARGIN + PAGE_BREAK.TERMS_SECTION) {
      page = pdfDoc.addPage([PAGE.WIDTH, PAGE.HEIGHT]);
      y = height - PAGE.MARGIN;
    }

    page.drawText('TERMS & CONDITIONS', { x: PAGE.MARGIN, y, size: FONT_SIZE.SECTION_TITLE, font: boldFont, color: accentColor });
    y -= SPACING.TERMS_TITLE_GAP;

    if (paymentTerms) {
      page.drawText('Payment Terms:', { x: PAGE.MARGIN, y, size: FONT_SIZE.SECTION_LABEL, font: boldFont, color: COLOR.SECONDARY_TEXT });
      y -= SPACING.TERMS_SUBSECTION_GAP;
      const ptLines = wrapText(paymentTerms, PRINTABLE_WIDTH - SPACING.DETAIL_LABEL_OFFSET, font, FONT_SIZE.SECTION_LABEL);
      for (const line of ptLines) {
        page.drawText(line, { x: PAGE.MARGIN + SPACING.TEXT_INSET, y, size: FONT_SIZE.SECTION_LABEL, font, color: COLOR.SECONDARY_TEXT });
        y -= LINE_HEIGHT.SMALL;
      }
      y -= SPACING.TERMS_SUBSECTION_TAIL;
    }

    if (shippingInstructions) {
      page.drawText('Shipping Instructions:', { x: PAGE.MARGIN, y, size: FONT_SIZE.SECTION_LABEL, font: boldFont, color: COLOR.SECONDARY_TEXT });
      y -= SPACING.TERMS_SUBSECTION_GAP;
      const siLines = wrapText(shippingInstructions, PRINTABLE_WIDTH - SPACING.DETAIL_LABEL_OFFSET, font, FONT_SIZE.SECTION_LABEL);
      for (const line of siLines) {
        page.drawText(line, { x: PAGE.MARGIN + SPACING.TEXT_INSET, y, size: FONT_SIZE.SECTION_LABEL, font, color: COLOR.SECONDARY_TEXT });
        y -= LINE_HEIGHT.SMALL;
      }
      y -= SPACING.TERMS_SUBSECTION_TAIL;
    }

    if (terms) {
      page.drawText('General Terms:', { x: PAGE.MARGIN, y, size: FONT_SIZE.SECTION_LABEL, font: boldFont, color: COLOR.SECONDARY_TEXT });
      y -= SPACING.TERMS_SUBSECTION_GAP;
      const tLines = wrapText(terms, PRINTABLE_WIDTH - SPACING.DETAIL_LABEL_OFFSET, font, FONT_SIZE.SECTION_LABEL);
      for (const line of tLines.slice(0, 20)) {
        if (y < PAGE.MARGIN + PAGE_BREAK.TERMS_INNER) {
          page = pdfDoc.addPage([PAGE.WIDTH, PAGE.HEIGHT]);
          y = height - PAGE.MARGIN;
        }
        page.drawText(line, { x: PAGE.MARGIN + SPACING.TEXT_INSET, y, size: FONT_SIZE.SECTION_LABEL, font, color: COLOR.SECONDARY_TEXT });
        y -= LINE_HEIGHT.SMALL;
      }
    }
  }

  if (po.notes) {
    if (y < PAGE.MARGIN + PAGE_BREAK.NOTES_SECTION) {
      page = pdfDoc.addPage([PAGE.WIDTH, PAGE.HEIGHT]);
      y = height - PAGE.MARGIN;
    }
    y -= SPACING.NOTES_GAP;
    page.drawText('NOTES', { x: PAGE.MARGIN, y, size: FONT_SIZE.SECTION_TITLE, font: boldFont, color: accentColor });
    y -= SPACING.NOTES_TITLE_GAP;
    const noteLines = wrapText(po.notes, PRINTABLE_WIDTH - SPACING.DETAIL_LABEL_OFFSET, font, FONT_SIZE.SECTION_LABEL);
    for (const line of noteLines.slice(0, 15)) {
      page.drawText(line, { x: PAGE.MARGIN + SPACING.TEXT_INSET, y, size: FONT_SIZE.SECTION_LABEL, font, color: COLOR.SECONDARY_TEXT });
      y -= LINE_HEIGHT.SMALL;
    }
  }

  const footerY = PAGE.MARGIN - SPACING.FOOTER_OFFSET;
  for (const pg of pdfDoc.getPages()) {
    pg.drawLine({ start: { x: PAGE.MARGIN, y: footerY + SPACING.FOOTER_LINE_OFFSET }, end: { x: width - PAGE.MARGIN, y: footerY + SPACING.FOOTER_LINE_OFFSET }, thickness: 0.5, color: COLOR.DIVIDER });
    pg.drawText(`${companyName} — Generated by EPOCH`, { x: PAGE.MARGIN, y: footerY, size: FONT_SIZE.FOOTER, font, color: COLOR.FOOTER_TEXT });
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const dateWidth = font.widthOfTextAtSize(dateStr, FONT_SIZE.FOOTER);
    pg.drawText(dateStr, { x: width - PAGE.MARGIN - dateWidth, y: footerY, size: FONT_SIZE.FOOTER, font, color: COLOR.FOOTER_TEXT });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
