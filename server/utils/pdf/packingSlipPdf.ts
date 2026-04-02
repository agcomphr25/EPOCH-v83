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
import type { PackingSlipData } from './types';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

export async function generatePackingSlipPdf(data: PackingSlipData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margins = await getMargins();
  const margin = (margins.STANDARD as number) ?? 40;
  const usableWidth = PAGE_WIDTH - margin * 2;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  let y = await drawStandardHeader(page, pdfDoc, font, boldFont, PAGE_HEIGHT - margin, margin);

  // ── Document title (right side) ──
  const titleText = 'PACKING SLIP';
  const titleWidth = boldFont.widthOfTextAtSize(titleText, FONT_SIZES.TITLE_MEDIUM);
  page.drawText(titleText, {
    x: PAGE_WIDTH - margin - titleWidth,
    y: PAGE_HEIGHT - margin,
    size: FONT_SIZES.TITLE_MEDIUM,
    font: boldFont,
    color: COLORS.TEXT_PRIMARY,
  });

  const slipNumWidth = font.widthOfTextAtSize(data.packingSlipNumber, FONT_SIZES.BODY_MEDIUM);
  page.drawText(data.packingSlipNumber, {
    x: PAGE_WIDTH - margin - slipNumWidth,
    y: PAGE_HEIGHT - margin - LINE_HEIGHTS.COMPACT - 4,
    size: FONT_SIZES.BODY_MEDIUM,
    font,
    color: COLORS.TEXT_SECONDARY,
  });

  // ── Divider line ──
  page.drawLine({
    start: { x: margin, y },
    end: { x: PAGE_WIDTH - margin, y },
    thickness: 0.5,
    color: rgb(0.82, 0.82, 0.82),
  });
  y -= SPACING.SECTION_GAP_TINY;

  // ── Info row: Packing Slip #, Date, PO #, Lot # ──
  const infoItems: Array<{ label: string; value: string }> = [
    { label: 'Packing Slip #', value: data.packingSlipNumber },
    { label: 'Date', value: data.date },
  ];
  if (data.poNumber) infoItems.push({ label: 'PO #', value: data.poNumber });
  if (data.lotNumber) infoItems.push({ label: 'Lot #', value: data.lotNumber });

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

  // ── Ship To block ──
  page.drawText('SHIP TO:', {
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

  if (data.customerAddress) {
    const addr = data.customerAddress;
    let addrLines: string[];
    if (addr.rawLines && addr.rawLines.length > 0) {
      addrLines = addr.rawLines;
    } else {
      const cityStateZip = [addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
      addrLines = [addr.street, addr.street2 || null, cityStateZip || null].filter(
        Boolean
      ) as string[];
    }

    for (const line of addrLines) {
      page.drawText(line, {
        x: margin,
        y,
        size: FONT_SIZES.BODY_MEDIUM,
        font,
        color: COLORS.TEXT_SECONDARY,
      });
      y -= LINE_HEIGHTS.COMPACT;
    }
  }

  y -= SPACING.SECTION_GAP_SMALL;

  // ── Divider line before table ──
  page.drawLine({
    start: { x: margin, y },
    end: { x: PAGE_WIDTH - margin, y },
    thickness: 0.5,
    color: rgb(0.82, 0.82, 0.82),
  });
  y -= SPACING.SECTION_GAP_TINY + 4;

  // ── Table ──
  // Columns: Part # | Description | Qty | Serial / Unit #s
  const colWidths = [90, 165, 35, usableWidth - 90 - 165 - 35];
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
      { text: 'Serial / Unit #s', x: colX[3] + 3 },
    ];
    drawTableHeader(pg, margin, startY, usableWidth, hdrHeight, columns, boldFont);
  };

  renderTableHeader(page, y);
  y -= hdrHeight;

  let rowAlt = false;

  for (const item of data.items) {
    const qty = item.quantity ?? 1;

    // Build serial/unit text for the last column
    const serialUnitParts: string[] = [];
    if (item.unitNumber) {
      serialUnitParts.push(item.unitNumber);
    }
    if (item.serialNumbers && item.serialNumbers.length > 0) {
      serialUnitParts.push(...item.serialNumbers);
    }

    // Wrap description (including specs if present)
    const descText = [item.description, item.specifications].filter(Boolean).join(' — ');
    const descLines = wrapText(descText, colWidths[1] - 6, FONT_SIZES.BODY_SMALL, font);

    // Group serials/units 2 per row
    const serialPerRow = 2;
    const serialChunks: string[] = [];
    for (let r = 0; r < Math.max(1, Math.ceil(serialUnitParts.length / serialPerRow)); r++) {
      serialChunks.push(
        serialUnitParts.slice(r * serialPerRow, (r + 1) * serialPerRow).join('   ')
      );
    }

    const textRows = Math.max(descLines.length, serialChunks.length, 1);
    const rowHeight = Math.max(16, textRows * 11 + 6);

    // Page break if needed
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

    page.drawText(String(qty), {
      x: colX[2] + 3,
      y: cellY,
      size: FONT_SIZES.BODY_SMALL,
      font,
      color: COLORS.TEXT_SECONDARY,
    });

    serialChunks.forEach((chunk, ci) => {
      page.drawText(chunk, {
        x: colX[3] + 3,
        y: cellY - ci * 11,
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

  // ── Totals ──
  y -= SPACING.SECTION_GAP_SMALL;
  const totalLabel = `Total Qty: ${data.totalQuantity}`;
  const totalLabelWidth = boldFont.widthOfTextAtSize(totalLabel, FONT_SIZES.BODY_LARGE);
  page.drawText(totalLabel, {
    x: PAGE_WIDTH - margin - totalLabelWidth,
    y,
    size: FONT_SIZES.BODY_LARGE,
    font: boldFont,
    color: COLORS.TEXT_PRIMARY,
  });

  // ── Footer ──
  const footerY = margin + 40;
  page.drawLine({
    start: { x: margin, y: footerY + 20 },
    end: { x: PAGE_WIDTH - margin, y: footerY + 20 },
    thickness: 0.5,
    color: rgb(0.82, 0.82, 0.82),
  });

  const packedByLabel = data.packedBy
    ? `Packed By: ${data.packedBy}`
    : 'Packed By: _______________________________';
  page.drawText(packedByLabel, {
    x: margin,
    y: footerY,
    size: FONT_SIZES.BODY_SMALL,
    font,
    color: COLORS.TEXT_SECONDARY,
  });

  const trackingText = `Tracking #: ${data.trackingNumber || '_____________________________'}`;
  page.drawText(trackingText, {
    x: margin + 260,
    y: footerY,
    size: FONT_SIZES.BODY_SMALL,
    font,
    color: COLORS.TEXT_SECONDARY,
  });

  const verifiedByLabel = data.verifiedBy
    ? `Verified By: ${data.verifiedBy}`
    : 'Verified By: _______________________________';
  page.drawText(verifiedByLabel, {
    x: margin,
    y: footerY - 16,
    size: FONT_SIZES.BODY_SMALL,
    font,
    color: COLORS.TEXT_SECONDARY,
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
