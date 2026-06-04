import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export interface MaterialTransferItem {
  quantity: number;
  description: string;
  partNumber?: string;
  serialNumber?: string;
  customerAssetId?: string;
  condition?: string;
  notes?: string;
}

export interface MaterialTransferPdfData {
  formNumber?: string;
  transferDate: string;
  customerName: string;
  customerContact?: string;
  customerPhone?: string;
  customerEmail?: string;
  shipToAddress: string;
  returnReason: string;
  carrier?: string;
  trackingNumber?: string;
  freightTerms?: string;
  preparedBy: string;
  authorizedBy?: string;
  notes?: string;
  items: MaterialTransferItem[];
}

const margin = 42;
const pageWidth = 612;
const pageHeight = 792;
const usableWidth = pageWidth - margin * 2;
const companyAddress = '230 Hamer Rd, Owens Cross Roads, AL 35763';
const companyPhone = '(256) 723-8381';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function drawTextBox(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  font: PDFFont,
  boldFont: PDFFont
) {
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    borderColor: rgb(0.72, 0.74, 0.78),
    borderWidth: 0.8,
  });
  page.drawText(label, {
    x: x + 6,
    y: y - 13,
    size: 7.5,
    font: boldFont,
    color: rgb(0.28, 0.31, 0.36),
  });

  let textY = y - 27;
  for (const line of wrapText(value || '-', font, 9, width - 12).slice(0, Math.max(1, Math.floor((height - 22) / 11)))) {
    page.drawText(line, {
      x: x + 6,
      y: textY,
      size: 9,
      font,
      color: rgb(0.08, 0.09, 0.11),
    });
    textY -= 11;
  }
}

function drawFooter(page: PDFPage, font: PDFFont, pageNumber: number) {
  page.drawLine({
    start: { x: margin, y: 34 },
    end: { x: pageWidth - margin, y: 34 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  page.drawText('Customer-owned equipment transfer record', {
    x: margin,
    y: 22,
    size: 7.5,
    font,
    color: rgb(0.38, 0.41, 0.46),
  });
  page.drawText(`Page ${pageNumber}`, {
    x: pageWidth - margin - 40,
    y: 22,
    size: 7.5,
    font,
    color: rgb(0.38, 0.41, 0.46),
  });
}

export async function generateMaterialTransferPdf(data: MaterialTransferPdfData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([pageWidth, pageHeight]);
  let pageNumber = 1;
  let y = pageHeight - margin;

  page.drawText('MATERIAL TRANSFER FORM', {
    x: margin,
    y,
    size: 17,
    font: boldFont,
    color: rgb(0.06, 0.16, 0.30),
  });
  page.drawText('Return of Customer-Owned Equipment', {
    x: margin,
    y: y - 17,
    size: 10,
    font,
    color: rgb(0.32, 0.35, 0.39),
  });

  const companyLines = [
    'AG Advanced Technologies',
    companyAddress,
    `Phone: ${companyPhone}`,
    'Email: glenn@agadvanced.com',
  ].filter(Boolean);
  let companyY = y;
  for (const line of companyLines) {
    const width = font.widthOfTextAtSize(line, 8.5);
    page.drawText(line, {
      x: pageWidth - margin - width,
      y: companyY,
      size: 8.5,
      font,
      color: rgb(0.18, 0.20, 0.24),
    });
    companyY -= 11;
  }

  y -= 54;
  drawTextBox(page, 'Form #', data.formNumber || 'Manual', margin, y, 155, 43, font, boldFont);
  drawTextBox(page, 'Transfer Date', data.transferDate, margin + 170, y, 135, 43, font, boldFont);
  drawTextBox(page, 'Freight Terms', data.freightTerms || 'Prepaid', margin + 320, y, usableWidth - 320, 43, font, boldFont);

  y -= 58;
  drawTextBox(page, 'Customer', data.customerName, margin, y, 245, 58, font, boldFont);
  drawTextBox(
    page,
    'Customer Contact',
    [data.customerContact, data.customerPhone, data.customerEmail].filter(Boolean).join(' | '),
    margin + 260,
    y,
    usableWidth - 260,
    58,
    font,
    boldFont
  );

  y -= 73;
  drawTextBox(page, 'Ship To / Return Destination', data.shipToAddress, margin, y, usableWidth, 74, font, boldFont);

  y -= 89;
  drawTextBox(page, 'Reason for Transfer', data.returnReason, margin, y, 255, 56, font, boldFont);
  drawTextBox(
    page,
    'Carrier / Tracking',
    [data.carrier, data.trackingNumber].filter(Boolean).join(' | '),
    margin + 270,
    y,
    usableWidth - 270,
    56,
    font,
    boldFont
  );

  y -= 80;
  page.drawText('Transferred Equipment', {
    x: margin,
    y,
    size: 11,
    font: boldFont,
    color: rgb(0.08, 0.09, 0.11),
  });
  y -= 12;

  const columns = [
    { label: 'Qty', x: margin, width: 36 },
    { label: 'Description', x: margin + 36, width: 168 },
    { label: 'Part #', x: margin + 204, width: 78 },
    { label: 'Serial / Asset #', x: margin + 282, width: 112 },
    { label: 'Condition', x: margin + 394, width: 72 },
    { label: 'Notes', x: margin + 466, width: usableWidth - 466 },
  ];

  function drawTableHeader() {
    page.drawRectangle({
      x: margin,
      y: y - 18,
      width: usableWidth,
      height: 18,
      color: rgb(0.90, 0.93, 0.97),
      borderColor: rgb(0.55, 0.59, 0.66),
      borderWidth: 0.7,
    });
    for (const col of columns) {
      page.drawText(col.label, {
        x: col.x + 4,
        y: y - 12,
        size: 7.5,
        font: boldFont,
        color: rgb(0.16, 0.18, 0.22),
      });
      if (col.x > margin) {
        page.drawLine({
          start: { x: col.x, y },
          end: { x: col.x, y: y - 18 },
          thickness: 0.5,
          color: rgb(0.55, 0.59, 0.66),
        });
      }
    }
    y -= 18;
  }

  drawTableHeader();

  for (const item of data.items) {
    const values = [
      String(item.quantity || ''),
      item.description,
      item.partNumber || '',
      [item.serialNumber, item.customerAssetId].filter(Boolean).join(' / '),
      item.condition || '',
      item.notes || '',
    ];
    const wrapped = columns.map((col, idx) => wrapText(values[idx], font, 7.5, col.width - 8));
    const rowHeight = Math.max(24, Math.max(...wrapped.map((lines) => lines.length)) * 9 + 10);

    if (y - rowHeight < 58) {
      drawFooter(page, font, pageNumber);
      page = pdf.addPage([pageWidth, pageHeight]);
      pageNumber += 1;
      y = pageHeight - margin;
      page.drawText('MATERIAL TRANSFER FORM - Continued', {
        x: margin,
        y,
        size: 14,
        font: boldFont,
        color: rgb(0.06, 0.16, 0.30),
      });
      y -= 25;
      drawTableHeader();
    }

    page.drawRectangle({
      x: margin,
      y: y - rowHeight,
      width: usableWidth,
      height: rowHeight,
      borderColor: rgb(0.78, 0.80, 0.84),
      borderWidth: 0.5,
    });

    columns.forEach((col, idx) => {
      if (col.x > margin) {
        page.drawLine({
          start: { x: col.x, y },
          end: { x: col.x, y: y - rowHeight },
          thickness: 0.4,
          color: rgb(0.78, 0.80, 0.84),
        });
      }
      let lineY = y - 11;
      for (const line of wrapped[idx]) {
        page.drawText(line || '-', {
          x: col.x + 4,
          y: lineY,
          size: 7.5,
          font,
          color: rgb(0.12, 0.13, 0.16),
        });
        lineY -= 9;
      }
    });

    y -= rowHeight;
  }

  y -= 18;
  if (y < 145) {
    drawFooter(page, font, pageNumber);
    page = pdf.addPage([pageWidth, pageHeight]);
    pageNumber += 1;
    y = pageHeight - margin;
  }

  drawTextBox(page, 'Transfer Notes', data.notes || '-', margin, y, usableWidth, 54, font, boldFont);
  y -= 82;

  drawTextBox(page, 'Prepared By', data.preparedBy, margin, y, 245, 44, font, boldFont);
  drawTextBox(page, 'Authorized By / Received By', data.authorizedBy || '', margin + 270, y, usableWidth - 270, 44, font, boldFont);

  drawFooter(page, font, pageNumber);

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
