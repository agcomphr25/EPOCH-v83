import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import {
  drawStandardHeader,
  drawTableHeader,
  getMargins,
  wrapText,
  COLORS,
  FONT_SIZES,
  SPACING,
  LINE_HEIGHTS,
} from './pdfConfig';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

export interface P2POLineItem {
  partNumber: string;
  partName: string;
  quantity: number;
  unitPrice?: number | null;
  totalPrice?: number | null;
  specifications?: string | null;
  notes?: string | null;
}

export interface P2PurchaseOrderPdfData {
  poNumber: string;
  customerName: string;
  customerId: string;
  poDate: string;
  expectedDelivery: string;
  status: string;
  notes?: string | null;
  projectName?: string | null;
  lineItems: P2POLineItem[];
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '$0.00';
  return '$' + value.toFixed(2);
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export async function generateP2PurchaseOrderPdf(data: P2PurchaseOrderPdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margins = await getMargins();
  const margin = (margins.STANDARD as number) ?? 40;
  const usableWidth = PAGE_WIDTH - margin * 2;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  let y = await drawStandardHeader(page, pdfDoc, font, boldFont, PAGE_HEIGHT - margin, margin);

  const titleText = 'PURCHASE ORDER';
  const titleWidth = boldFont.widthOfTextAtSize(titleText, FONT_SIZES.TITLE_MEDIUM);
  page.drawText(titleText, {
    x: PAGE_WIDTH - margin - titleWidth,
    y: PAGE_HEIGHT - margin,
    size: FONT_SIZES.TITLE_MEDIUM,
    font: boldFont,
    color: COLORS.TEXT_PRIMARY,
  });

  const poNumWidth = font.widthOfTextAtSize(data.poNumber, FONT_SIZES.BODY_MEDIUM);
  page.drawText(data.poNumber, {
    x: PAGE_WIDTH - margin - poNumWidth,
    y: PAGE_HEIGHT - margin - LINE_HEIGHTS.COMPACT - 4,
    size: FONT_SIZES.BODY_MEDIUM,
    font,
    color: COLORS.TEXT_SECONDARY,
  });

  page.drawLine({
    start: { x: margin, y },
    end: { x: PAGE_WIDTH - margin, y },
    thickness: 0.5,
    color: rgb(0.82, 0.82, 0.82),
  });
  y -= SPACING.SECTION_GAP_TINY;

  const infoItems: Array<{ label: string; value: string }> = [
    { label: 'PO Date', value: formatDate(data.poDate) },
    { label: 'Expected Delivery', value: formatDate(data.expectedDelivery) },
    { label: 'Status', value: data.status },
  ];
  if (data.projectName) {
    infoItems.push({ label: 'Project', value: data.projectName });
  }

  const colWidth = usableWidth / Math.min(infoItems.length, 4);
  infoItems.forEach((item, i) => {
    const cx = margin + i * colWidth;
    page.drawText(item.label, {
      x: cx,
      y,
      size: FONT_SIZES.BODY_SMALL,
      font: boldFont,
      color: COLORS.TEXT_SECONDARY,
    });
    page.drawText(item.value, {
      x: cx,
      y: y - LINE_HEIGHTS.COMPACT,
      size: FONT_SIZES.BODY_MEDIUM,
      font,
      color: COLORS.TEXT_PRIMARY,
    });
  });
  y -= LINE_HEIGHTS.COMPACT + FONT_SIZES.BODY_MEDIUM + SPACING.SECTION_GAP_SMALL;

  page.drawText('CUSTOMER:', {
    x: margin,
    y,
    size: FONT_SIZES.BODY_SMALL,
    font: boldFont,
    color: COLORS.TEXT_SECONDARY,
  });
  y -= LINE_HEIGHTS.COMPACT;

  page.drawText(data.customerName, {
    x: margin,
    y,
    size: FONT_SIZES.BODY_LARGE,
    font: boldFont,
    color: COLORS.TEXT_PRIMARY,
  });
  y -= LINE_HEIGHTS.COMPACT;

  page.drawText(`Customer ID: ${data.customerId}`, {
    x: margin,
    y,
    size: FONT_SIZES.BODY_SMALL,
    font,
    color: COLORS.TEXT_SECONDARY,
  });
  y -= SPACING.SECTION_GAP_SMALL;

  page.drawLine({
    start: { x: margin, y },
    end: { x: PAGE_WIDTH - margin, y },
    thickness: 0.5,
    color: rgb(0.82, 0.82, 0.82),
  });
  y -= SPACING.SECTION_GAP_TINY + 4;

  const colWidths = [80, 170, 45, 80, 80, usableWidth - 80 - 170 - 45 - 80 - 80];
  const colX: number[] = [margin];
  for (let i = 0; i < colWidths.length - 1; i++) {
    colX.push(colX[i] + colWidths[i]);
  }
  const hdrHeight = 16;

  const renderTableHeader = (pg: PDFPage, startY: number) => {
    const columns = [
      { text: 'Part #', x: colX[0] + 3 },
      { text: 'Description', x: colX[1] + 3 },
      { text: 'Qty', x: colX[2] + 3 },
      { text: 'Unit Price', x: colX[3] + 3 },
      { text: 'Line Total', x: colX[4] + 3 },
      { text: 'Specifications', x: colX[5] + 3 },
    ];
    drawTableHeader(pg, margin, startY, usableWidth, hdrHeight, columns, boldFont);
  };

  renderTableHeader(page, y);
  y -= hdrHeight;

  let rowAlt = false;
  let grandTotal = 0;

  for (const item of data.lineItems) {
    const descLines = wrapText(item.partName || '', colWidths[1] - 6, FONT_SIZES.BODY_SMALL, font);
    const specLines = item.specifications
      ? wrapText(item.specifications, colWidths[5] - 6, FONT_SIZES.BODY_SMALL, font)
      : [];

    const textRows = Math.max(descLines.length, specLines.length, 1);
    const rowHeight = Math.max(16, textRows * 11 + 6);

    if (y - rowHeight < margin + 80) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - margin;
      renderTableHeader(page, y);
      y -= hdrHeight;
      rowAlt = false;
    }

    if (rowAlt) {
      page.drawRectangle({
        x: margin,
        y: y - rowHeight,
        width: usableWidth,
        height: rowHeight,
        color: rgb(0.96, 0.96, 0.96),
      });
    }
    rowAlt = !rowAlt;

    const cellY = y - 11;
    const lineTotal = (item.unitPrice ?? 0) * item.quantity;
    grandTotal += lineTotal;

    page.drawText(item.partNumber || '', {
      x: colX[0] + 3,
      y: cellY,
      size: FONT_SIZES.BODY_SMALL,
      font,
      color: COLORS.TEXT_SECONDARY,
    });

    descLines.forEach((line, li) => {
      page.drawText(line, {
        x: colX[1] + 3,
        y: cellY - li * 11,
        size: FONT_SIZES.BODY_SMALL,
        font,
        color: COLORS.TEXT_SECONDARY,
      });
    });

    page.drawText(String(item.quantity), {
      x: colX[2] + 3,
      y: cellY,
      size: FONT_SIZES.BODY_SMALL,
      font,
      color: COLORS.TEXT_SECONDARY,
    });

    page.drawText(formatCurrency(item.unitPrice), {
      x: colX[3] + 3,
      y: cellY,
      size: FONT_SIZES.BODY_SMALL,
      font,
      color: COLORS.TEXT_SECONDARY,
    });

    page.drawText(formatCurrency(lineTotal), {
      x: colX[4] + 3,
      y: cellY,
      size: FONT_SIZES.BODY_SMALL,
      font,
      color: COLORS.TEXT_SECONDARY,
    });

    specLines.forEach((line, si) => {
      page.drawText(line, {
        x: colX[5] + 3,
        y: cellY - si * 11,
        size: FONT_SIZES.BODY_SMALL,
        font,
        color: COLORS.TEXT_SECONDARY,
      });
    });

    page.drawLine({
      start: { x: margin, y: y - rowHeight },
      end: { x: PAGE_WIDTH - margin, y: y - rowHeight },
      thickness: 0.25,
      color: rgb(0.82, 0.82, 0.82),
    });

    y -= rowHeight;
  }

  y -= SPACING.SECTION_GAP_SMALL;
  const totalLabel = `Total: ${formatCurrency(grandTotal)}`;
  const totalLabelWidth = boldFont.widthOfTextAtSize(totalLabel, FONT_SIZES.BODY_LARGE);
  page.drawText(totalLabel, {
    x: PAGE_WIDTH - margin - totalLabelWidth,
    y,
    size: FONT_SIZES.BODY_LARGE,
    font: boldFont,
    color: COLORS.TEXT_PRIMARY,
  });

  if (data.notes) {
    y -= SPACING.SECTION_GAP_MEDIUM;
    page.drawLine({
      start: { x: margin, y: y + 10 },
      end: { x: PAGE_WIDTH - margin, y: y + 10 },
      thickness: 0.5,
      color: rgb(0.82, 0.82, 0.82),
    });
    y -= 6;

    page.drawText('NOTES:', {
      x: margin,
      y,
      size: FONT_SIZES.BODY_SMALL,
      font: boldFont,
      color: COLORS.TEXT_SECONDARY,
    });
    y -= LINE_HEIGHTS.COMPACT;

    const noteLines = wrapText(data.notes, usableWidth, FONT_SIZES.BODY_SMALL, font);
    for (const line of noteLines) {
      if (y < margin + 40) break;
      page.drawText(line, {
        x: margin,
        y,
        size: FONT_SIZES.BODY_SMALL,
        font,
        color: COLORS.TEXT_SECONDARY,
      });
      y -= LINE_HEIGHTS.COMPACT;
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
