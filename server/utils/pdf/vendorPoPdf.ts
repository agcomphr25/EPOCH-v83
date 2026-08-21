import { PDFDocument, rgb, StandardFonts, degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import { storage } from '../../storage';
import { resolveVendorPoContactName, resolveVendorPoReturnEmail } from '../vendorPoContact';

const PAGE = { WIDTH: 612, HEIGHT: 792, MARGIN: 40 } as const;
const PRINTABLE_WIDTH = PAGE.WIDTH - PAGE.MARGIN * 2;

const COLOR = {
  PRIMARY_TEXT: rgb(0.1, 0.1, 0.1),
  SECONDARY_TEXT: rgb(0.28, 0.28, 0.28),
  MUTED_TEXT: rgb(0.42, 0.42, 0.42),
  BORDER: rgb(0.82, 0.82, 0.82),
  LIGHT_BORDER: rgb(0.9, 0.9, 0.9),
  HEADER_BG: rgb(0.96, 0.96, 0.96),
  ROW_ALT: rgb(0.985, 0.985, 0.985),
  PANEL_BG: rgb(0.98, 0.98, 0.98),
  WATERMARK: rgb(0.93, 0.93, 0.93),
  WHITE: rgb(1, 1, 1),
  ACCENT_PO: rgb(0.1, 0.23, 0.36),
  ACCENT_RFQ: rgb(0.9, 0.49, 0.13),
} as const;

const FONT_SIZE = {
  WATERMARK: 52,
  COMPANY: 22,
  META_TITLE: 14,
  SECTION_LABEL: 11,
  BODY: 10.5,
  SMALL: 8.5,
} as const;

interface VendorPOData {
  po: any;
  vendor: any;
  items: any[];
  companySettings: any;
  poSettings: any;
  optionalSettings: any[];
  flowdownExhibitRevision: number | null;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface DrawState {
  pdfDoc: PDFDocument;
  page: PDFPage;
  fonts: Fonts;
  accentColor: ReturnType<typeof rgb>;
}

type TextLine = { text: string; font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> };

async function fetchVendorPOData(poId: number): Promise<VendorPOData> {
  const po = await storage.getVendorPO(poId);
  if (!po) throw new Error(`Vendor PO #${poId} not found`);

  const [vendor, items, companySettings, poSettings, optionalSettings] = await Promise.all([
    storage.getVendor(po.vendorId),
    storage.getVendorPOItems(poId),
    storage.getCompanySettings(),
    storage.getVendorPOSettings(),
    storage.getPOOptionalSettings(poId),
  ]);

  if (!vendor) throw new Error(`Vendor #${po.vendorId} not found for PO #${poId}`);
  let flowdownExhibitRevision: number | null = null;
  if (po.issueFlowdownsRequired) {
    const { getVendorPoFlowdownWorkspace } = await import('../../src/services/flowdownApplicabilityService');
    const workspace = await getVendorPoFlowdownWorkspace(poId);
    if (workspace.assessment.reviewStatus === 'APPROVED') {
      flowdownExhibitRevision = Number(workspace.assessment.exhibitRevision) || 0;
    }
  }
  return {
    po,
    vendor,
    items: items ?? [],
    companySettings,
    poSettings,
    optionalSettings: optionalSettings ?? [],
    flowdownExhibitRevision,
  };
}

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
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
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatNumber(value: any): string {
  const num = Number(value);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function joinParts(parts: unknown[], separator = ' '): string {
  return parts.map(cleanText).filter(Boolean).join(separator);
}

function widthOf(text: string, font: PDFFont, size: number): number {
  return font.widthOfTextAtSize(cleanText(text), size);
}

function drawText(
  page: PDFPage,
  text: unknown,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLOR.PRIMARY_TEXT,
) {
  const value = cleanText(text);
  if (!value) return;
  page.drawText(value, { x, y, size, font, color });
}

function drawRightText(
  page: PDFPage,
  text: unknown,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLOR.PRIMARY_TEXT,
) {
  const value = cleanText(text);
  if (!value) return;
  page.drawText(value, { x: rightX - widthOf(value, font, size), y, size, font, color });
}

function drawRightTextFit(
  page: PDFPage,
  text: unknown,
  rightX: number,
  minX: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLOR.PRIMARY_TEXT,
) {
  const value = cleanText(text);
  if (!value) return;

  let fontSize = size;
  while (fontSize > 7 && widthOf(value, font, fontSize) > rightX - minX) {
    fontSize -= 0.25;
  }

  page.drawText(value, { x: Math.max(minX, rightX - widthOf(value, font, fontSize)), y, size: fontSize, font, color });
}

function groupMixedFractionTokens(words: string[]): string[] {
  const grouped: string[] = [];
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const nextWord = words[index + 1];
    if (/^\d+$/.test(word) && /^\d+\/\d+[),.;:]?$/.test(nextWord || '')) {
      grouped.push(`${word} ${nextWord}`);
      index += 1;
    } else {
      grouped.push(word);
    }
  }
  return grouped;
}

export function wrapVendorPoText(text: unknown, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  const paragraphs = cleanText(text).split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = groupMixedFractionTokens(paragraph.trim().split(/\s+/).filter(Boolean));
    if (!words.length) {
      lines.push('');
      continue;
    }

    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (widthOf(testLine, font, fontSize) > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines.length ? lines : [''];
}

function drawWrappedText(
  page: PDFPage,
  text: unknown,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  fontSize: number,
  lineHeight: number,
  color = COLOR.PRIMARY_TEXT,
): number {
  const lines = wrapVendorPoText(text, maxWidth, font, fontSize);
  let cursorY = y;
  for (const line of lines) {
    drawText(page, line, x, cursorY, font, fontSize, color);
    cursorY -= lineHeight;
  }
  return cursorY;
}

function addPage(state: DrawState): PDFPage {
  state.page = state.pdfDoc.addPage([PAGE.WIDTH, PAGE.HEIGHT]);
  return state.page;
}

function ensureSpace(state: DrawState, y: number, requiredHeight: number): number {
  if (y - requiredHeight >= PAGE.MARGIN + 20) return y;
  addPage(state);
  return PAGE.HEIGHT - PAGE.MARGIN;
}

function drawHeaderBox(
  page: PDFPage,
  x: number,
  yTop: number,
  width: number,
  height: number,
  title: string,
  fonts: Fonts,
) {
  const headerHeight = 22;
  page.drawRectangle({ x, y: yTop - height, width, height, borderColor: COLOR.BORDER, borderWidth: 1 });
  page.drawRectangle({ x, y: yTop - headerHeight, width, height: headerHeight, color: COLOR.HEADER_BG, borderColor: COLOR.BORDER, borderWidth: 1 });
  drawText(page, title.toUpperCase(), x + 14, yTop - 15, fonts.bold, FONT_SIZE.SECTION_LABEL, COLOR.MUTED_TEXT);
}

function drawPanel(page: PDFPage, x: number, yTop: number, width: number, title: string, lines: TextLine[], fonts: Fonts): number {
  const bodyLineHeight = 14;
  const bodyHeight = Math.max(52, lines.length * bodyLineHeight + 22);
  const panelHeight = bodyHeight + 22;
  drawHeaderBox(page, x, yTop, width, panelHeight, title, fonts);

  let y = yTop - 39;
  for (const line of lines) {
    drawText(page, line.text, x + 14, y, line.font ?? fonts.regular, line.size ?? FONT_SIZE.BODY, line.color ?? COLOR.PRIMARY_TEXT);
    y -= bodyLineHeight;
  }

  return yTop - panelHeight;
}

function drawContactStrip(page: PDFPage, yTop: number, settings: any, fonts: Fonts): number {
  const contactName = cleanText(settings.contactName);
  const contactTitle = cleanText(settings.contactTitle);
  const contactPhone = cleanText(settings.contactPhone);
  const contactEmail = cleanText(settings.contactEmail);
  if (!contactName && !contactPhone && !contactEmail) return yTop;

  const stripHeight = 34;
  page.drawRectangle({
    x: PAGE.MARGIN,
    y: yTop - stripHeight,
    width: PRINTABLE_WIDTH,
    height: stripHeight,
    color: COLOR.PANEL_BG,
    borderColor: COLOR.LIGHT_BORDER,
    borderWidth: 1,
  });

  drawText(page, 'Purchasing Contact:', PAGE.MARGIN + 14, yTop - 21, fonts.bold, FONT_SIZE.BODY, COLOR.MUTED_TEXT);
  const contactLine = joinParts([contactName, contactTitle], contactTitle ? ', ' : '');
  drawText(page, contactLine, PAGE.MARGIN + 122, yTop - 21, fonts.regular, FONT_SIZE.BODY, COLOR.PRIMARY_TEXT);
  drawRightText(
    page,
    [contactPhone, contactEmail].filter(Boolean).join(' | '),
    PAGE.WIDTH - PAGE.MARGIN - 12,
    yTop - 21,
    fonts.regular,
    FONT_SIZE.BODY,
    COLOR.PRIMARY_TEXT,
  );

  return yTop - stripHeight - 20;
}

function drawMetaRow(page: PDFPage, label: string, value: unknown, x: number, rightX: number, y: number, fonts: Fonts) {
  drawText(page, label, x, y, fonts.regular, FONT_SIZE.BODY, COLOR.MUTED_TEXT);
  drawRightText(page, value, rightX, y, fonts.bold, FONT_SIZE.BODY, COLOR.PRIMARY_TEXT);
}

function drawDocumentHeader(state: DrawState, data: VendorPOData, settings: any, isRFQ: boolean): number {
  const { page, fonts, accentColor } = state;
  const docTitle = isRFQ ? 'REQUEST FOR QUOTE' : 'PURCHASE ORDER';
  const metaWidth = 260;
  const titleX = PAGE.WIDTH - PAGE.MARGIN - metaWidth;
  const titleY = PAGE.HEIGHT - PAGE.MARGIN;
  const titleHeight = isRFQ ? 124 : 108;

  if (isRFQ) {
    page.drawText('REQUEST FOR QUOTE', {
      x: 62,
      y: 365,
      size: FONT_SIZE.WATERMARK,
      font: fonts.bold,
      color: COLOR.WATERMARK,
      rotate: degrees(-35),
    });
  }

  drawText(page, settings.companyName || 'AG Composites', PAGE.MARGIN, titleY - 18, fonts.bold, FONT_SIZE.COMPANY, COLOR.PRIMARY_TEXT);
  let companyY = titleY - 40;
  companyY = drawWrappedText(page, settings.companyAddress || '', PAGE.MARGIN, companyY, 250, fonts.regular, FONT_SIZE.BODY, 13, COLOR.MUTED_TEXT);
  if (settings.companyPhone) {
    drawText(page, settings.companyPhone, PAGE.MARGIN, companyY - 2, fonts.regular, FONT_SIZE.BODY, COLOR.MUTED_TEXT);
    companyY -= 14;
  }
  if (settings.companyWebsite) {
    drawText(page, settings.companyWebsite, PAGE.MARGIN, companyY - 2, fonts.regular, FONT_SIZE.BODY, COLOR.MUTED_TEXT);
  }

  page.drawRectangle({ x: titleX, y: titleY - titleHeight, width: metaWidth, height: titleHeight, borderColor: accentColor, borderWidth: 1.5 });
  page.drawRectangle({ x: titleX, y: titleY - 32, width: metaWidth, height: 32, color: accentColor });
  drawText(page, docTitle, titleX + (metaWidth - widthOf(docTitle, fonts.bold, FONT_SIZE.META_TITLE)) / 2, titleY - 21, fonts.bold, FONT_SIZE.META_TITLE, COLOR.WHITE);

  const displayPoNumber = data.po.poNumber?.startsWith('VPO-') ? data.po.poNumber.slice(4) : (data.po.poNumber ?? '');
  let metaY = titleY - 48;
  if (isRFQ) {
    drawText(page, 'Non-binding quote request', titleX + 46, metaY, fonts.bold, FONT_SIZE.SMALL, accentColor);
    metaY -= 16;
  } else {
    drawMetaRow(page, 'PO Number', displayPoNumber, titleX + 16, titleX + metaWidth - 16, metaY, fonts);
    metaY -= 15;
  }

  if (data.po.externalPoNumber) {
    drawMetaRow(page, 'Legacy ERP PO #', data.po.externalPoNumber, titleX + 16, titleX + metaWidth - 16, metaY, fonts);
    metaY -= 15;
  }

  drawMetaRow(page, 'Date', formatDate(data.po.orderDate || data.po.createdAt), titleX + 16, titleX + metaWidth - 16, metaY, fonts);
  metaY -= 15;
  drawMetaRow(page, 'Requested Delivery Date', formatDate(data.po.expectedDeliveryDate), titleX + 16, titleX + metaWidth - 16, metaY, fonts);
  metaY -= 15;
  drawMetaRow(page, 'Ship Via', data.po.shipVia || 'N/A', titleX + 16, titleX + metaWidth - 16, metaY, fonts);

  const dividerY = Math.min(companyY - 12, titleY - titleHeight - 20);
  page.drawLine({ start: { x: PAGE.MARGIN, y: dividerY }, end: { x: PAGE.WIDTH - PAGE.MARGIN, y: dividerY }, thickness: 1, color: COLOR.BORDER });
  return dividerY - 20;
}

function vendorLines(vendor: any, fonts: Fonts): TextLine[] {
  const cityStateZip = [
    joinParts([vendor.city, vendor.state], ', '),
    vendor.zip_code || vendor.zipCode,
  ].filter(Boolean).join(' ');

  return [
    { text: vendor.name || '', font: fonts.bold },
    { text: vendor.street || vendor.address || '' },
    { text: cityStateZip },
    { text: vendor.phone ? `Ph: ${vendor.phone}` : '' },
    { text: vendor.email || '' },
    { text: vendor.contactPerson ? `Attn: ${vendor.contactPerson}` : '' },
  ].filter(line => cleanText(line.text));
}

function shipToLines(settings: any, fonts: Fonts): TextLine[] {
  return [
    { text: settings.companyName || 'AG Composites', font: fonts.bold },
    ...wrapVendorPoText(settings.companyAddress || '', 210, fonts.regular, FONT_SIZE.BODY).map(text => ({ text })),
    { text: settings.companyPhone ? `Ph: ${settings.companyPhone}` : '' },
  ].filter(line => cleanText(line.text));
}

function drawParties(state: DrawState, data: VendorPOData, settings: any, y: number): number {
  y = drawContactStrip(state.page, y, settings, state.fonts);

  const gap = 16;
  const panelWidth = (PRINTABLE_WIDTH - gap) / 2;
  const vendorBottom = drawPanel(state.page, PAGE.MARGIN, y, panelWidth, 'Vendor', vendorLines(data.vendor, state.fonts), state.fonts);
  const shipBottom = drawPanel(state.page, PAGE.MARGIN + panelWidth + gap, y, panelWidth, 'Ship To', shipToLines(settings, state.fonts), state.fonts);
  return Math.min(vendorBottom, shipBottom) - 18;
}

function drawTableHeader(page: PDFPage, y: number, fonts: Fonts): number {
  const headerHeight = 26;
  const cols = tableColumns();
  page.drawRectangle({ x: PAGE.MARGIN, y: y - headerHeight, width: PRINTABLE_WIDTH, height: headerHeight, color: COLOR.HEADER_BG });
  page.drawLine({ start: { x: PAGE.MARGIN, y: y - headerHeight }, end: { x: PAGE.WIDTH - PAGE.MARGIN, y: y - headerHeight }, thickness: 1.5, color: COLOR.BORDER });

  const headerY = y - 17;
  drawText(page, 'Line', cols.line, headerY, fonts.bold, FONT_SIZE.SMALL, COLOR.SECONDARY_TEXT);
  drawText(page, 'Supplier Part #', cols.part, headerY, fonts.bold, FONT_SIZE.SMALL, COLOR.SECONDARY_TEXT);
  drawText(page, 'Description', cols.description, headerY, fonts.bold, FONT_SIZE.SMALL, COLOR.SECONDARY_TEXT);
  drawRightText(page, 'Qty', cols.qtyRight, headerY, fonts.bold, FONT_SIZE.SMALL, COLOR.SECONDARY_TEXT);
  drawText(page, 'Unit', cols.unit, headerY, fonts.bold, FONT_SIZE.SMALL, COLOR.SECONDARY_TEXT);
  drawRightText(page, 'Unit Price', cols.priceRight, headerY, fonts.bold, FONT_SIZE.SMALL, COLOR.SECONDARY_TEXT);
  drawRightText(page, 'Line Total', cols.totalRight, headerY, fonts.bold, FONT_SIZE.SMALL, COLOR.SECONDARY_TEXT);
  return y - headerHeight;
}

function tableColumns() {
  const x = PAGE.MARGIN;
  return {
    line: x + 10,
    part: x + 48,
    description: x + 158,
    qtyRight: x + 348,
    unit: x + 360,
    priceLeft: x + 386,
    priceRight: x + 446,
    totalLeft: x + 472,
    totalRight: x + 526,
    descWidth: 164,
    partWidth: 102,
  };
}

function drawItemsTable(state: DrawState, items: any[], startY: number): { y: number; subtotal: number } {
  const cols = tableColumns();
  let y = drawTableHeader(state.page, startY, state.fonts);
  let subtotal = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const total = qty * price;
    subtotal += total;

    const purchaseDetail = item.purchaseQty != null && Number(item.purchaseQty) > 0 && item.purchaseUnit
      ? ` (${formatNumber(item.purchaseQty)} ${item.purchaseUnit} ordered)`
      : '';
    const partLines = wrapVendorPoText(
      item.supplierPartNumber || item.agPartNumber || '-',
      cols.partWidth,
      state.fonts.regular,
      FONT_SIZE.SMALL,
    );
    const itemNotes = cleanText(item.notes).trim();
    const isInternalPartsRequestProvenance = /^PR-\d+\s*:/i.test(itemNotes);
    const descriptionLines = [
      ...wrapVendorPoText(`${item.description || item.itemDescription || '-'}${purchaseDetail}`, cols.descWidth, state.fonts.regular, FONT_SIZE.BODY),
      ...(itemNotes && !isInternalPartsRequestProvenance
        ? wrapVendorPoText(`Details: ${itemNotes}`, cols.descWidth, state.fonts.regular, FONT_SIZE.SMALL)
        : []),
    ];
    const rowHeight = Math.max(32, descriptionLines.length * 12 + 16, partLines.length * 10 + 16);

    y = ensureSpace(state, y, rowHeight + 28);
    if (y === PAGE.HEIGHT - PAGE.MARGIN) {
      y = drawTableHeader(state.page, y, state.fonts);
    }

    if (i % 2 === 1) {
      state.page.drawRectangle({ x: PAGE.MARGIN, y: y - rowHeight, width: PRINTABLE_WIDTH, height: rowHeight, color: COLOR.ROW_ALT });
    }
    state.page.drawLine({ start: { x: PAGE.MARGIN, y: y - rowHeight }, end: { x: PAGE.WIDTH - PAGE.MARGIN, y: y - rowHeight }, thickness: 0.5, color: COLOR.LIGHT_BORDER });

    const textY = y - 18;
    drawText(state.page, item.lineNumber ?? i + 1, cols.line, textY, state.fonts.regular, FONT_SIZE.BODY, COLOR.PRIMARY_TEXT);
    let partY = textY;
    for (const line of partLines) {
      drawText(state.page, line, cols.part, partY, state.fonts.regular, FONT_SIZE.SMALL, COLOR.PRIMARY_TEXT);
      partY -= 10;
    }

    let descY = textY;
    for (let index = 0; index < descriptionLines.length; index++) {
      const line = descriptionLines[index];
      drawText(state.page, line, cols.description, descY, state.fonts.regular, index === 0 ? FONT_SIZE.BODY : FONT_SIZE.SMALL, index === 0 ? COLOR.PRIMARY_TEXT : COLOR.SECONDARY_TEXT);
      descY -= 12;
    }

    drawRightText(state.page, formatNumber(qty), cols.qtyRight, textY, state.fonts.regular, FONT_SIZE.BODY, COLOR.PRIMARY_TEXT);
    drawText(state.page, item.vendorUnit || item.unit || item.uom || '-', cols.unit, textY, state.fonts.regular, FONT_SIZE.BODY, COLOR.PRIMARY_TEXT);
    drawRightTextFit(state.page, formatCurrency(price), cols.priceRight, cols.priceLeft, textY, state.fonts.regular, FONT_SIZE.BODY, COLOR.PRIMARY_TEXT);
    drawRightTextFit(state.page, formatCurrency(total), cols.totalRight, cols.totalLeft, textY, state.fonts.regular, FONT_SIZE.BODY, COLOR.PRIMARY_TEXT);
    y -= rowHeight;
  }

  return { y: y - 12, subtotal };
}

function drawTotals(state: DrawState, y: number, subtotal: number, po: any): number {
  const boxWidth = 220;
  const boxX = PAGE.WIDTH - PAGE.MARGIN - boxWidth;
  const shipping = Number(po.shippingCost) || 0;
  const total = Number(po.totalCost) || subtotal + shipping;
  const boxHeight = shipping > 0 ? 74 : 54;

  y = ensureSpace(state, y, boxHeight + 20);
  state.page.drawRectangle({ x: boxX, y: y - boxHeight, width: boxWidth, height: boxHeight, color: COLOR.PANEL_BG, borderColor: COLOR.LIGHT_BORDER, borderWidth: 1 });
  drawText(state.page, 'Subtotal', boxX + 20, y - 19, state.fonts.regular, FONT_SIZE.BODY, COLOR.MUTED_TEXT);
  drawRightText(state.page, formatCurrency(subtotal), boxX + boxWidth - 20, y - 19, state.fonts.bold, FONT_SIZE.BODY, COLOR.PRIMARY_TEXT);

  let totalY = y - 39;
  if (shipping > 0) {
    drawText(state.page, 'Shipping', boxX + 20, y - 39, state.fonts.regular, FONT_SIZE.BODY, COLOR.MUTED_TEXT);
    drawRightText(state.page, formatCurrency(shipping), boxX + boxWidth - 20, y - 39, state.fonts.regular, FONT_SIZE.BODY, COLOR.PRIMARY_TEXT);
    totalY = y - 59;
  }

  drawText(state.page, 'Total', boxX + 20, totalY, state.fonts.bold, FONT_SIZE.META_TITLE, COLOR.PRIMARY_TEXT);
  drawRightText(state.page, formatCurrency(total), boxX + boxWidth - 20, totalY, state.fonts.bold, FONT_SIZE.META_TITLE, COLOR.PRIMARY_TEXT);
  return y - boxHeight - 22;
}

function drawBlock(state: DrawState, y: number, title: string, body: unknown): number {
  const text = cleanText(body);
  if (!text) return y;

  const lines = wrapVendorPoText(text, PRINTABLE_WIDTH, state.fonts.regular, FONT_SIZE.BODY);
  const requiredHeight = 24 + lines.length * 12;
  y = ensureSpace(state, y, requiredHeight);
  drawText(state.page, title, PAGE.MARGIN, y, state.fonts.bold, FONT_SIZE.SECTION_LABEL, COLOR.PRIMARY_TEXT);
  y -= 16;
  for (const line of lines) {
    drawText(state.page, line, PAGE.MARGIN, y, state.fonts.regular, FONT_SIZE.BODY, COLOR.SECONDARY_TEXT);
    y -= 12;
  }
  return y - 8;
}

function drawTermsAndNotes(state: DrawState, data: VendorPOData, settings: any, y: number): number {
  y = drawBlock(state, y, 'Notes', data.po.notes);

  const hasComplianceRequirements =
    data.po.issueDpasRated || data.po.issueFlowdownsRequired;
  const hasTerms = settings.paymentTerms || settings.shippingInstructions || settings.termsAndConditions || data.optionalSettings.length > 0;
  if (!hasTerms && !hasComplianceRequirements) return y;

  y = ensureSpace(state, y, hasComplianceRequirements ? 130 : 50);
  state.page.drawLine({ start: { x: PAGE.MARGIN, y }, end: { x: PAGE.WIDTH - PAGE.MARGIN, y }, thickness: 1, color: COLOR.BORDER });
  y -= 18;

  if (hasComplianceRequirements) {
    drawText(state.page, 'Compliance Requirements', PAGE.MARGIN, y, state.fonts.bold, FONT_SIZE.SECTION_LABEL, COLOR.PRIMARY_TEXT);
    y -= 16;
    if (data.po.issueDpasRated) {
      y = drawBlock(state, y, 'DPAS Rating', data.po.issueDpasRating || 'Rating required');
    }
    if (data.po.issueFlowdownsRequired) {
      const revision = data.flowdownExhibitRevision == null
        ? 'approved revision'
        : `Revision R${data.flowdownExhibitRevision}`;
      y = drawBlock(
        state,
        y,
        'Contractual Flowdowns',
        `Applicable FAR, DFARS, and/or customer flowdowns are incorporated through the attached Controlled Vendor Flowdown Exhibit, ${revision}.`
      );
    }
  }

  y = drawBlock(state, y, 'Payment Terms', settings.paymentTerms);
  y = drawBlock(state, y, 'Shipping Instructions', settings.shippingInstructions);
  y = drawBlock(state, y, 'Terms and Conditions', settings.termsAndConditions);

  if (data.optionalSettings.length > 0) {
    y = ensureSpace(state, y, 40);
    drawText(state.page, 'Additional Requirements', PAGE.MARGIN, y, state.fonts.bold, FONT_SIZE.SECTION_LABEL, COLOR.PRIMARY_TEXT);
    y -= 16;
    for (let i = 0; i < data.optionalSettings.length; i++) {
      const setting = data.optionalSettings[i];
      y = drawBlock(state, y, `${i + 1}. ${setting.name || 'Requirement'}`, setting.statement);
    }
  }

  return y;
}

export async function generateVendorPoPdf(poId: number): Promise<Buffer> {
  const data = await fetchVendorPOData(poId);
  const { po, vendor, items, companySettings, poSettings } = data;
  const isRFQ = !po.poNumber;
  const accentColor = isRFQ ? COLOR.ACCENT_RFQ : COLOR.ACCENT_PO;

  const settings = {
    companyName: companySettings?.companyName || 'AG Composites',
    companyAddress: companySettings?.companyAddress || '',
    companyPhone: companySettings?.companyPhone || '',
    companyEmail: companySettings?.companyEmail || '',
    companyWebsite: companySettings?.companyWebsite || '',
    contactName: resolveVendorPoContactName(poSettings),
    contactTitle: poSettings?.contactTitle || '',
    contactPhone: poSettings?.contactPhone || '',
    contactEmail: resolveVendorPoReturnEmail(poSettings) || companySettings?.companyEmail || '',
    termsAndConditions: vendor?.termsAndConditions || poSettings?.termsAndConditions || '',
    paymentTerms: vendor?.paymentTerms || poSettings?.paymentTerms || '',
    shippingInstructions: vendor?.shippingInstructions || poSettings?.shippingInstructions || '',
  };

  const pdfDoc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };

  const state: DrawState = {
    pdfDoc,
    page: pdfDoc.addPage([PAGE.WIDTH, PAGE.HEIGHT]),
    fonts,
    accentColor,
  };

  let y = drawDocumentHeader(state, data, settings, isRFQ);
  y = drawParties(state, data, settings, y);
  const tableResult = drawItemsTable(state, items, y);
  y = drawTotals(state, tableResult.y, tableResult.subtotal, po);
  drawTermsAndNotes(state, data, settings, y);

  if (po.status === 'Voided' || po.voidedAt) {
    for (const page of pdfDoc.getPages()) {
      page.drawText('VOID', {
        x: 145,
        y: 320,
        size: 110,
        font: fonts.bold,
        color: rgb(0.75, 0.08, 0.08),
        opacity: 0.18,
        rotate: degrees(35),
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
