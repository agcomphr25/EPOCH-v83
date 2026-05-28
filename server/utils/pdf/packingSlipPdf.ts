import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import {
  drawTableHeader,
  getMargins,
  wrapText,
  COLORS,
  FONT_SIZES,
  SPACING,
  LINE_HEIGHTS,
  COMPANY_INFO,
} from './pdfConfig';
import type { PackingSlipData } from './types';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

// RULE: All packing slips MUST be persisted to DB immediately after generation.
// Never call this function and discard the result — the returned Buffer must be
// saved as base64 to the relevant DB record (shipment_items.packing_slip_base64
// for P1, or a p2_packing_slips record for P2) before sending any response.
export async function generatePackingSlipPdf(data: PackingSlipData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margins = await getMargins();
  const margin = (margins.STANDARD as number) ?? 40;
  const usableWidth = PAGE_WIDTH - margin * 2;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  let y = PAGE_HEIGHT - margin;

  page.drawText('AG Advanced Technologies', {
    x: margin,
    y,
    size: FONT_SIZES.TITLE_SMALL,
    font: boldFont,
    color: COLORS.TEXT_PRIMARY,
  });
  y -= LINE_HEIGHTS.SECTION;

  page.drawText(COMPANY_INFO.ADDRESS, {
    x: margin,
    y,
    size: FONT_SIZES.BODY_SMALL,
    font,
    color: COLORS.TEXT_SECONDARY,
  });
  y -= LINE_HEIGHTS.COMPACT;

  page.drawText(`Phone: ${COMPANY_INFO.PHONE} | Email: ${COMPANY_INFO.EMAIL}`, {
    x: margin,
    y,
    size: FONT_SIZES.BODY_SMALL,
    font,
    color: COLORS.TEXT_SECONDARY,
  });
  y -= SPACING.SECTION_GAP_SMALL;

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

// ─────────────────────────────────────────────────────────────────────────────
// PO-SPECIFIC PACKING SLIP (new format matching screenshot)
// Layout:
//   Top-left  : Company name + address as plain text
//   Top-right : "Packing Slip" title + bordered Date/Invoice # box
//   Below hdr : Bordered "Ship To:" box with customer name + address
//   Table     : PO # | Contents | Sticker # Range | Quantity | Weekly Box # | Shipment #
//   Table foot: Tracking # embedded in the Weekly Box # column cell at the bottom
// ─────────────────────────────────────────────────────────────────────────────
export async function generatePoPackingSlipPdf(data: PackingSlipData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margins = await getMargins();
  const margin = (margins.STANDARD as number) ?? 40;
  const usableWidth = PAGE_WIDTH - margin * 2;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // ── TOP HEADER ──────────────────────────────────────────────────────────────
  // Left side: company name + address lines
  let leftY = PAGE_HEIGHT - margin;
  const companyLines = [
    'AG Composites, LLC',
    '230 Hamer Rd',
    'Owens Cross Roads, AL 35763',
  ];

  page.drawText(companyLines[0], {
    x: margin,
    y: leftY,
    size: FONT_SIZES.BODY_LARGE,
    font: boldFont,
    color: COLORS.TEXT_PRIMARY,
  });
  leftY -= LINE_HEIGHTS.COMPACT;

  for (let i = 1; i < companyLines.length; i++) {
    page.drawText(companyLines[i], {
      x: margin,
      y: leftY,
      size: FONT_SIZES.BODY_SMALL,
      font,
      color: COLORS.TEXT_SECONDARY,
    });
    leftY -= LINE_HEIGHTS.COMPACT;
  }

  // Right side: "Packing Slip" title + bordered box [Date | Invoice #]
  const rightBlockWidth = 180;
  const rightBlockX = PAGE_WIDTH - margin - rightBlockWidth;

  const titleText = 'Packing Slip';
  const titleSize = FONT_SIZES.TITLE_SMALL;
  const titleW = boldFont.widthOfTextAtSize(titleText, titleSize);
  const titleX = rightBlockX + (rightBlockWidth - titleW) / 2;

  page.drawText(titleText, {
    x: titleX,
    y: PAGE_HEIGHT - margin,
    size: titleSize,
    font: boldFont,
    color: COLORS.TEXT_PRIMARY,
  });

  // Bordered two-column box (Date | Invoice #)
  const boxTop = PAGE_HEIGHT - margin - LINE_HEIGHTS.SECTION;
  const boxHeight = 32;
  const halfW = rightBlockWidth / 2;

  // Outer border
  page.drawRectangle({
    x: rightBlockX,
    y: boxTop - boxHeight,
    width: rightBlockWidth,
    height: boxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.75,
  });

  // Middle divider
  page.drawLine({
    start: { x: rightBlockX + halfW, y: boxTop },
    end: { x: rightBlockX + halfW, y: boxTop - boxHeight },
    thickness: 0.75,
    color: rgb(0, 0, 0),
  });

  // Header row divider (label row at top)
  const labelRowH = 14;
  page.drawLine({
    start: { x: rightBlockX, y: boxTop - labelRowH },
    end: { x: rightBlockX + rightBlockWidth, y: boxTop - labelRowH },
    thickness: 0.75,
    color: rgb(0, 0, 0),
  });

  // "Date" label and value
  page.drawText('Date', {
    x: rightBlockX + 4,
    y: boxTop - labelRowH + 4,
    size: FONT_SIZES.BODY_SMALL,
    font: boldFont,
    color: COLORS.TEXT_PRIMARY,
  });
  page.drawText(data.date, {
    x: rightBlockX + 4,
    y: boxTop - boxHeight + 5,
    size: FONT_SIZES.BODY_SMALL,
    font,
    color: COLORS.TEXT_SECONDARY,
  });

  // "Invoice #" label and value
  page.drawText('Invoice #', {
    x: rightBlockX + halfW + 4,
    y: boxTop - labelRowH + 4,
    size: FONT_SIZES.BODY_SMALL,
    font: boldFont,
    color: COLORS.TEXT_PRIMARY,
  });
  page.drawText(data.packingSlipNumber, {
    x: rightBlockX + halfW + 4,
    y: boxTop - boxHeight + 5,
    size: FONT_SIZES.BODY_SMALL,
    font,
    color: COLORS.TEXT_SECONDARY,
  });

  // Move y below both header blocks (left company text + right box)
  const headerBottom = Math.min(leftY, boxTop - boxHeight);
  let y = headerBottom - SPACING.SECTION_GAP_SMALL;

  // ── SHIP TO BOX ─────────────────────────────────────────────────────────────
  const shipToLines: string[] = [data.customerName];

  if (data.customerAddress) {
    const addr = data.customerAddress;
    if (addr.rawLines && addr.rawLines.length > 0) {
      shipToLines.push(...addr.rawLines);
    } else {
      if (addr.street) shipToLines.push(addr.street);
      if (addr.street2) shipToLines.push(addr.street2);
      const cityStateZip = [addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
      if (cityStateZip) shipToLines.push(cityStateZip);
    }
  }

  const shipToLineH = LINE_HEIGHTS.COMPACT;
  const shipToBoxPad = 6;
  const shipToInnerH = shipToLines.length * shipToLineH + shipToBoxPad * 2;
  const shipToLabelH = 14;
  const shipToBoxH = shipToInnerH + shipToLabelH;

  // Border
  page.drawRectangle({
    x: margin,
    y: y - shipToBoxH,
    width: usableWidth,
    height: shipToBoxH,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.75,
  });

  // "Ship To:" label row
  page.drawLine({
    start: { x: margin, y: y - shipToLabelH },
    end: { x: margin + usableWidth, y: y - shipToLabelH },
    thickness: 0.75,
    color: rgb(0, 0, 0),
  });
  page.drawText('Ship To:', {
    x: margin + 4,
    y: y - shipToLabelH + 4,
    size: FONT_SIZES.BODY_SMALL,
    font: boldFont,
    color: COLORS.TEXT_PRIMARY,
  });

  // Address lines
  let addrY = y - shipToLabelH - shipToBoxPad - 8;
  for (const line of shipToLines) {
    const isFirst = line === shipToLines[0];
    page.drawText(line, {
      x: margin + 6,
      y: addrY,
      size: isFirst ? FONT_SIZES.BODY_MEDIUM : FONT_SIZES.BODY_SMALL,
      font: isFirst ? boldFont : font,
      color: isFirst ? COLORS.TEXT_PRIMARY : COLORS.TEXT_SECONDARY,
    });
    addrY -= shipToLineH;
  }

  y -= shipToBoxH + SPACING.SECTION_GAP_SMALL;

  // ── TABLE ───────────────────────────────────────────────────────────────────
  // Columns: PO # | Contents | Sticker # Range | Quantity | Tracking #
  // Width allocation out of usableWidth (≈532px with margin=40)
  const TABLE_COL_WIDTHS = [70, 120, 75, 50, 217] as const;
  // Sanity: these sum to 532 for usableWidth=532

  const tableColX: number[] = [margin];
  for (let i = 0; i < TABLE_COL_WIDTHS.length - 1; i++) {
    tableColX.push(tableColX[i] + TABLE_COL_WIDTHS[i]);
  }

  const TABLE_HEADERS = [
    'PO #',
    'Contents',
    'Sticker # Range',
    'Quantity',
    'Tracking #',
  ];

  const hdrHeight = 16;

  const renderPoTableHeader = (pg: PDFPage, startY: number) => {
    // Draw outer border + header background
    pg.drawRectangle({
      x: margin,
      y: startY - hdrHeight,
      width: usableWidth,
      height: hdrHeight,
      color: rgb(0.88, 0.88, 0.88),
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.75,
    });

    TABLE_HEADERS.forEach((txt, i) => {
      // Column vertical divider (except first)
      if (i > 0) {
        pg.drawLine({
          start: { x: tableColX[i], y: startY },
          end: { x: tableColX[i], y: startY - hdrHeight },
          thickness: 0.75,
          color: rgb(0, 0, 0),
        });
      }
      pg.drawText(txt, {
        x: tableColX[i] + 3,
        y: startY - hdrHeight + 5,
        size: FONT_SIZES.BODY_SMALL,
        font: boldFont,
        color: COLORS.TEXT_PRIMARY,
      });
    });
  };

  renderPoTableHeader(page, y);
  y -= hdrHeight;

  const tableStartY = y; // remember for outer border drawing later

  const ROW_HEIGHT = 18;

  for (let idx = 0; idx < data.items.length; idx++) {
    const item = data.items[idx];

    // Page break
    if (y - ROW_HEIGHT < margin + 60) {
      // Close current page table border
      page.drawRectangle({
        x: margin,
        y: y,
        width: usableWidth,
        height: tableStartY - y,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.75,
      });

      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - margin;
      renderPoTableHeader(page, y);
      y -= hdrHeight;
    }

    const cellY = y - ROW_HEIGHT + 5;

    // Alternating row background
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: margin,
        y: y - ROW_HEIGHT,
        width: usableWidth,
        height: ROW_HEIGHT,
        color: rgb(0.96, 0.96, 0.96),
      });
    }

    // Row bottom border
    page.drawLine({
      start: { x: margin, y: y - ROW_HEIGHT },
      end: { x: margin + usableWidth, y: y - ROW_HEIGHT },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });

    // Column dividers
    for (let ci = 1; ci < TABLE_COL_WIDTHS.length; ci++) {
      page.drawLine({
        start: { x: tableColX[ci], y: y },
        end: { x: tableColX[ci], y: y - ROW_HEIGHT },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6),
      });
    }

    const cellValues = [
      data.poNumber || '',
      item.contents || item.partNumber || '',
      item.stickerRange || '',
      String(item.quantity ?? 1),
      data.trackingNumber || '',
    ];

    cellValues.forEach((val, ci) => {
      page.drawText(val, {
        x: tableColX[ci] + 3,
        y: cellY,
        size: FONT_SIZES.BODY_SMALL,
        font,
        color: COLORS.TEXT_SECONDARY,
      });
    });

    y -= ROW_HEIGHT;
  }

  // Outer table border (drawn as overlay on top of everything)
  page.drawRectangle({
    x: margin,
    y: y,
    width: usableWidth,
    height: tableStartY - y,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.75,
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
