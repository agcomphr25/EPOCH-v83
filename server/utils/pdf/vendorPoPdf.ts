import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { storage } from '../../storage';
import { resolveAssetPath } from '../../src/utils/assetPaths';
import * as fs from 'fs';

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

export async function generateVendorPoPdf(poId: number): Promise<Buffer> {
  const data = await fetchVendorPOData(poId);
  const { po, vendor, items, companySettings, poSettings } = data;

  const isRFQ = !po.poNumber;
  const docTitle = isRFQ ? 'REQUEST FOR QUOTE' : 'PURCHASE ORDER';
  const accentColor = isRFQ ? rgb(0.9, 0.49, 0.13) : rgb(0.1, 0.23, 0.36);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const margin = 40;
  const printableWidth = width - margin * 2;
  let y = height - margin;

  const logo = await embedLogo(pdfDoc);
  if (logo) {
    const logoWidth = 140;
    const logoHeight = logoWidth * (logo.height / logo.width);
    page.drawImage(logo, { x: margin, y: y - logoHeight, width: logoWidth, height: logoHeight });
    y -= logoHeight + 8;
  }

  const companyName = companySettings?.companyName || 'AG Composites';
  const companyAddress = companySettings?.companyAddress || '';
  const companyPhone = companySettings?.companyPhone || '';
  const companyEmail = companySettings?.companyEmail || '';

  if (companyAddress) {
    page.drawText(companyAddress, { x: margin, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 11;
  }
  if (companyPhone || companyEmail) {
    const contactLine = [companyPhone ? `Phone: ${companyPhone}` : '', companyEmail ? `Email: ${companyEmail}` : ''].filter(Boolean).join(' | ');
    page.drawText(contactLine, { x: margin, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 16;
  }

  const titleBoxW = 200;
  const titleBoxH = 60;
  const titleBoxX = width - margin - titleBoxW;
  const titleBoxY = height - margin - titleBoxH;

  page.drawRectangle({ x: titleBoxX, y: titleBoxY, width: titleBoxW, height: titleBoxH, color: accentColor });
  const titleWidth = boldFont.widthOfTextAtSize(docTitle, 16);
  page.drawText(docTitle, { x: titleBoxX + (titleBoxW - titleWidth) / 2, y: titleBoxY + titleBoxH - 24, size: 16, font: boldFont, color: rgb(1, 1, 1) });

  if (po.poNumber) {
    const poNumStr = po.poNumber.replace('VPO-', '').replace(/-R[A-Z0-9]+$/, '');
    const poNumWidth = boldFont.widthOfTextAtSize(`#${poNumStr}`, 14);
    page.drawText(`#${poNumStr}`, { x: titleBoxX + (titleBoxW - poNumWidth) / 2, y: titleBoxY + titleBoxH - 44, size: 14, font: boldFont, color: rgb(1, 1, 1) });
  }

  y = Math.min(y, titleBoxY - 15);

  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 18;

  const colMid = width / 2;

  page.drawText('VENDOR', { x: margin, y, size: 8, font: boldFont, color: accentColor });
  page.drawText('ORDER DETAILS', { x: colMid + 10, y, size: 8, font: boldFont, color: accentColor });
  y -= 14;

  const vendorLines = [
    vendor.name,
    vendor.contactPerson || '',
    vendor.address || '',
    vendor.email || '',
    vendor.phone || '',
  ].filter(Boolean);

  let vendorY = y;
  for (const line of vendorLines) {
    page.drawText(line, { x: margin, y: vendorY, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    vendorY -= 13;
  }

  let detailY = y;
  const details = [
    ['Date:', formatDate(po.createdAt)],
    ['Delivery:', formatDate(po.expectedDeliveryDate)],
    po.poNumber ? ['PO #:', po.poNumber] : null,
    po.status ? ['Status:', po.status] : null,
  ].filter(Boolean) as string[][];

  for (const [label, value] of details) {
    page.drawText(label, { x: colMid + 10, y: detailY, size: 9, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(value, { x: colMid + 80, y: detailY, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    detailY -= 13;
  }

  y = Math.min(vendorY, detailY) - 12;

  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 5;

  const colWidths = {
    line: 30,
    partNum: 90,
    description: printableWidth - 30 - 90 - 50 - 60 - 70 - 70,
    unit: 50,
    qty: 60,
    unitPrice: 70,
    total: 70,
  };
  const cols = {
    line: margin,
    partNum: margin + colWidths.line,
    description: margin + colWidths.line + colWidths.partNum,
    unit: margin + colWidths.line + colWidths.partNum + colWidths.description,
    qty: margin + colWidths.line + colWidths.partNum + colWidths.description + colWidths.unit,
    unitPrice: margin + colWidths.line + colWidths.partNum + colWidths.description + colWidths.unit + colWidths.qty,
    total: margin + colWidths.line + colWidths.partNum + colWidths.description + colWidths.unit + colWidths.qty + colWidths.unitPrice,
  };

  const headerRowH = 18;
  page.drawRectangle({ x: margin, y: y - headerRowH, width: printableWidth, height: headerRowH, color: accentColor });
  y -= headerRowH - 4;

  const headers = [
    { text: '#', x: cols.line + 4 },
    { text: 'Part Number', x: cols.partNum + 4 },
    { text: 'Description', x: cols.description + 4 },
    { text: 'Unit', x: cols.unit + 4 },
    { text: 'Qty', x: cols.qty + 4 },
    { text: 'Unit Price', x: cols.unitPrice + 4 },
    { text: 'Total', x: cols.total + 4 },
  ];

  for (const h of headers) {
    page.drawText(h.text, { x: h.x, y, size: 8, font: boldFont, color: rgb(1, 1, 1) });
  }
  y -= 8;

  let lineTotal = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const itemTotal = qty * price;
    lineTotal += itemTotal;

    const descText = item.description || item.itemDescription || '';
    const descLines = wrapText(descText, colWidths.description - 8, font, 8);
    const rowHeight = Math.max(14, descLines.length * 11 + 3);

    if (y - rowHeight < margin + 40) {
      page = pdfDoc.addPage([612, 792]);
      y = height - margin;
    }

    if (i % 2 === 1) {
      page.drawRectangle({ x: margin, y: y - rowHeight, width: printableWidth, height: rowHeight, color: rgb(0.97, 0.97, 0.97) });
    }

    const textY = y - 10;
    page.drawText(String(item.lineNumber ?? i + 1), { x: cols.line + 4, y: textY, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(truncateText(item.agPartNumber || '', colWidths.partNum - 8, font, 8), { x: cols.partNum + 4, y: textY, size: 8, font, color: rgb(0.2, 0.2, 0.2) });

    for (let dl = 0; dl < descLines.length; dl++) {
      page.drawText(descLines[dl], { x: cols.description + 4, y: textY - (dl * 11), size: 8, font, color: rgb(0.2, 0.2, 0.2) });
    }

    page.drawText(item.unit || 'EA', { x: cols.unit + 4, y: textY, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(String(qty), { x: cols.qty + 4, y: textY, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(formatCurrency(price), { x: cols.unitPrice + 4, y: textY, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(formatCurrency(itemTotal), { x: cols.total + 4, y: textY, size: 8, font: boldFont, color: rgb(0.2, 0.2, 0.2) });

    y -= rowHeight;
  }

  y -= 5;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 16;

  const totalLabelX = cols.unitPrice - 10;
  const totalValueX = cols.total + 4;

  page.drawText('Subtotal:', { x: totalLabelX, y, size: 9, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(formatCurrency(lineTotal), { x: totalValueX, y, size: 9, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
  y -= 15;

  if (po.shippingCost && Number(po.shippingCost) > 0) {
    page.drawText('Shipping:', { x: totalLabelX, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(formatCurrency(po.shippingCost), { x: totalValueX, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 15;
    lineTotal += Number(po.shippingCost);
  }

  page.drawRectangle({ x: totalLabelX - 5, y: y - 2, width: printableWidth - (totalLabelX - margin) + 5, height: 18, color: accentColor });
  page.drawText('TOTAL:', { x: totalLabelX, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(formatCurrency(po.totalCost || lineTotal), { x: totalValueX, y: y + 2, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  y -= 30;

  const terms = vendor.termsAndConditions || poSettings?.termsAndConditions;
  const paymentTerms = vendor.paymentTerms || poSettings?.paymentTerms;
  const shippingInstructions = vendor.shippingInstructions || poSettings?.shippingInstructions;

  if (paymentTerms || shippingInstructions || terms) {
    if (y < margin + 80) {
      page = pdfDoc.addPage([612, 792]);
      y = height - margin;
    }

    page.drawText('TERMS & CONDITIONS', { x: margin, y, size: 10, font: boldFont, color: accentColor });
    y -= 16;

    if (paymentTerms) {
      page.drawText('Payment Terms:', { x: margin, y, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
      y -= 12;
      const ptLines = wrapText(paymentTerms, printableWidth - 10, font, 8);
      for (const line of ptLines) {
        page.drawText(line, { x: margin + 5, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
        y -= 11;
      }
      y -= 4;
    }

    if (shippingInstructions) {
      page.drawText('Shipping Instructions:', { x: margin, y, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
      y -= 12;
      const siLines = wrapText(shippingInstructions, printableWidth - 10, font, 8);
      for (const line of siLines) {
        page.drawText(line, { x: margin + 5, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
        y -= 11;
      }
      y -= 4;
    }

    if (terms) {
      page.drawText('General Terms:', { x: margin, y, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
      y -= 12;
      const tLines = wrapText(terms, printableWidth - 10, font, 8);
      for (const line of tLines.slice(0, 20)) {
        if (y < margin + 15) {
          page = pdfDoc.addPage([612, 792]);
          y = height - margin;
        }
        page.drawText(line, { x: margin + 5, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
        y -= 11;
      }
    }
  }

  if (po.notes) {
    if (y < margin + 50) {
      page = pdfDoc.addPage([612, 792]);
      y = height - margin;
    }
    y -= 10;
    page.drawText('NOTES', { x: margin, y, size: 10, font: boldFont, color: accentColor });
    y -= 14;
    const noteLines = wrapText(po.notes, printableWidth - 10, font, 8);
    for (const line of noteLines.slice(0, 15)) {
      page.drawText(line, { x: margin + 5, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 11;
    }
  }

  const footerY = margin - 5;
  for (const pg of pdfDoc.getPages()) {
    pg.drawLine({ start: { x: margin, y: footerY + 12 }, end: { x: width - margin, y: footerY + 12 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    pg.drawText(`${companyName} — Generated by EPOCH`, { x: margin, y: footerY, size: 7, font, color: rgb(0.6, 0.6, 0.6) });
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const dateWidth = font.widthOfTextAtSize(dateStr, 7);
    pg.drawText(dateStr, { x: width - margin - dateWidth, y: footerY, size: 7, font, color: rgb(0.6, 0.6, 0.6) });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
