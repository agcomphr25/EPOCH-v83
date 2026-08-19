import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';

const W = 612;
const H = 792;
const M = 38;
const CW = W - M * 2;
const BLUE = rgb(0.08, 0.25, 0.44);
const PALE = rgb(0.91, 0.95, 0.98);
const GRAY = rgb(0.42, 0.46, 0.50);
const LINE = rgb(0.72, 0.75, 0.78);
const BLACK = rgb(0.08, 0.09, 0.10);

type Data = Record<string, unknown>;
type Fonts = { regular: PDFFont; bold: PDFFont };

const display = (value: unknown) => {
  if (Array.isArray(value)) return value.join(', ');
  const text = String(value ?? '').trim();
  return text || '';
};

function drawText(page: PDFPage, value: string, x: number, y: number, size: number, font: PDFFont, color = BLACK) {
  page.drawText(value, { x, y, size, font, color });
}

function drawLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, color = LINE, thickness = 0.6) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
}

function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && current) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
  }
  return lines;
}

function header(page: PDFPage, fonts: Fonts, pageNumber: number, totalPages: number) {
  page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: BLUE });
  drawText(page, 'A G COMPOSITES', M, H - 30, 15, fonts.bold, rgb(1, 1, 1));
  drawText(page, 'PURCHASE REVIEW CHECKLIST', M, H - 51, 12, fonts.bold, rgb(1, 1, 1));
  drawText(page, `Page ${pageNumber} of ${totalPages}`, W - M - 58, H - 43, 8, fonts.regular, rgb(1, 1, 1));
  drawLine(page, M, 29, W - M, 29, LINE, 0.5);
  drawText(page, 'Purchase Review Checklist - Uncontrolled when printed', M, 17, 7.5, fonts.regular, GRAY);
}

function section(page: PDFPage, title: string, y: number, fonts: Fonts) {
  page.drawRectangle({ x: M, y: y - 4, width: CW, height: 21, color: PALE });
  drawText(page, title, M + 7, y + 3, 9.5, fonts.bold, BLUE);
}

function field(page: PDFPage, label: string, value: unknown, x: number, y: number, width: number, fonts: Fonts, height = 26) {
  drawText(page, label, x, y + height - 10, 7.5, fonts.bold, BLUE);
  const rendered = display(value);
  if (rendered) {
    const lines = wrap(rendered, fonts.regular, 8, width - 10).slice(0, Math.max(1, Math.floor((height - 12) / 9)));
    lines.forEach((entry, index) => drawText(page, entry, x + 5, y + height - 21 - index * 9, 8, fonts.regular));
  }
  page.drawRectangle({ x, y, width, height, borderColor: LINE, borderWidth: 0.55 });
}

function choice(page: PDFPage, label: string, value: unknown, x: number, y: number, width: number, choices: string[], fonts: Fonts) {
  drawText(page, label, x, y + 17, 7.5, fonts.bold, BLUE);
  const selected = display(value).toLowerCase();
  let cursor = x + Math.min(width * 0.48, 150);
  choices.forEach((item) => {
    page.drawRectangle({ x: cursor, y: y + 8, width: 8, height: 8, borderColor: GRAY, borderWidth: 0.6 });
    if (selected === item.toLowerCase() || (item === 'Yes' && selected === 'y') || (item === 'No' && selected === 'n')) {
      drawText(page, 'X', cursor + 1.2, y + 8.7, 7, fonts.bold, BLUE);
    }
    drawText(page, item, cursor + 11, y + 9, 7.5, fonts.regular);
    cursor += fonts.regular.widthOfTextAtSize(item, 7.5) + 28;
  });
  drawLine(page, x, y + 4, x + width, y + 4);
}

function page(document: PDFDocument, fonts: Fonts, number: number, total: number) {
  const created = document.addPage([W, H]);
  header(created, fonts, number, total);
  return created;
}

export async function generatePurchaseReviewChecklistPdf(formData: Data = {}): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
  };
  const half = (CW - 10) / 2;
  const totalPages = 4;

  const p1 = page(document, fonts, 1, totalPages);
  section(p1, 'CUSTOMER AND ORDER IDENTIFICATION', 694, fonts);
  field(p1, 'Customer', formData.customerName || formData.companyName, M, 647, half, fonts, 36);
  field(p1, 'Quote', formData.quoteId, M + half + 10, 647, half, fonts, 36);
  field(p1, 'Company name', formData.companyName, M, 606, half, fonts, 34);
  field(p1, 'Contracting officer', formData.contractingOfficer, M + half + 10, 606, half, fonts, 34);
  field(p1, 'Address', formData.address, M, 558, CW, fonts, 42);
  field(p1, 'Phone', formData.phone, M, 518, half, fonts, 34);
  field(p1, 'Email', formData.email, M + half + 10, 518, half, fonts, 34);
  choice(p1, '1. Existing customer?', formData.existingCustomer, M, 484, half, ['Yes', 'No'], fonts);
  choice(p1, '2. Significant changes?', formData.significantChanges, M + half + 10, 484, half, ['Yes', 'No'], fonts);
  choice(p1, 'FFL', formData.ffl, M, 451, half, ['Y', 'N', 'N/A'], fonts);
  choice(p1, 'FFL copy on hand?', formData.fflCopyOnHand, M + half + 10, 451, half, ['Y', 'N', 'N/A'], fonts);
  choice(p1, 'Credit check authorization', formData.creditCheckAuth, M, 418, half, ['Y', 'N', 'N/A'], fonts);
  choice(p1, 'Credit approval', formData.creditApproval, M + half + 10, 418, half, ['Y', 'N', 'N/A'], fonts);
  section(p1, 'SECTION A - COMMERCIAL TERMS', 379, fonts);
  field(p1, 'PO number', formData.poNumber, M, 335, half, fonts, 34);
  field(p1, 'Contract / prime contract number', formData.contractNumber, M + half + 10, 335, half, fonts, 34);
  field(p1, 'Invoice remittance', formData.invoiceRemittance, M, 287, CW, fonts, 42);
  field(p1, 'Payment terms', formData.paymentTerms, M, 247, half, fonts, 34);
  field(p1, 'Early-pay discount', formData.earlyPayDiscount, M + half + 10, 247, half, fonts, 34);
  field(p1, 'Method of payment', formData.paymentMethod === 'Other' ? formData.paymentMethodOther : formData.paymentMethod, M, 207, CW, fonts, 34);

  const p2 = page(document, fonts, 2, totalPages);
  section(p2, 'SECTION B - SERVICE / PRODUCT REQUESTED AND PRICES', 694, fonts);
  field(p2, 'Outside services', formData.outsideServices, M, 646, CW, fonts, 42);
  field(p2, 'Quantity requested', formData.quantityRequested, M, 606, half, fonts, 34);
  field(p2, 'Unit of measure', formData.unitOfMeasure, M + half + 10, 606, half, fonts, 34);
  field(p2, 'Unit price', formData.unitPrice, M, 566, half, fonts, 34);
  field(p2, 'Tooling price', formData.toolingPrice, M + half + 10, 566, half, fonts, 34);
  field(p2, 'Additional items', formData.additionalItems, M, 518, CW, fonts, 42);
  field(p2, 'Additional cost', formData.additionalCost, M, 478, half, fonts, 34);
  field(p2, 'Calculated amount', formData.amount, M + half + 10, 478, half, fonts, 34);
  field(p2, 'Disbursement schedule', formData.disbursementSchedule, M, 438, CW, fonts, 34);
  section(p2, 'MANUFACTURING LEVEL REVIEW', 399, fonts);
  drawText(p2, 'Level 1 - Assembly', M, 371, 9, fonts.bold, BLUE);
  field(p2, 'Item number', formData.level1ItemNumber, M, 327, half, fonts, 34);
  choice(p2, 'Parts / kits provided', formData.level1PartsKits, M + half + 10, 333, half, ['Y', 'N', 'N/A'], fonts);
  choice(p2, 'Exhibits / drawings provided', formData.level1Exhibits, M + half + 10, 302, half, ['Y', 'N', 'N/A'], fonts);
  drawText(p2, 'Level 2 - CNC', M, 286, 9, fonts.bold, BLUE);
  field(p2, 'Item number', formData.level2ItemNumber, M, 242, half, fonts, 34);
  choice(p2, 'Parts / kits provided', formData.level2PartsKits, M + half + 10, 248, half, ['Y', 'N', 'N/A'], fonts);
  choice(p2, 'Programming provided', formData.level2Programming, M + half + 10, 217, half, ['Y', 'N', 'N/A'], fonts);
  drawText(p2, 'Level 3 - Manufacturing', M, 201, 9, fonts.bold, BLUE);
  field(p2, 'Item number', formData.level3ItemNumber, M, 157, half, fonts, 34);
  choice(p2, 'Parts / kits provided', formData.level3PartsKits, M + half + 10, 163, half, ['Y', 'N', 'N/A'], fonts);
  choice(p2, 'Exhibits provided', formData.level3Exhibits, M + half + 10, 132, half, ['Y', 'N', 'N/A'], fonts);

  const p3 = page(document, fonts, 3, totalPages);
  section(p3, 'SECTION C - DESCRIPTION / SPECIFICATIONS', 694, fonts);
  choice(p3, 'Critical safety items ordered?', formData.criticalSafetyItems, M, 657, half, ['Yes', 'No'], fonts);
  choice(p3, 'Quality requirements included?', formData.qualityRequirements, M + half + 10, 657, half, ['Yes', 'No'], fonts);
  field(p3, 'Acceptance / rejection criteria', formData.acceptanceRejectionCriteria, M, 603, CW, fonts, 46);
  choice(p3, 'Verification operations required?', formData.verificationOperations, M, 568, CW, ['Yes', 'No'], fonts);
  field(p3, 'Verification requirements', formData.verificationRequirements, M, 518, CW, fonts, 42);
  field(p3, 'Verification sequence', formData.verificationSequence, M, 468, CW, fonts, 42);
  field(p3, 'Measurement results required', formData.measurementResults, M, 418, half, fonts, 42);
  field(p3, 'Measurement equipment', formData.measurementEquipment, M + half + 10, 418, half, fonts, 42);
  choice(p3, 'Special instructions?', formData.specialInstructions, M, 383, half, ['Y', 'N', 'N/A'], fonts);
  choice(p3, 'Material sourcing specified?', formData.materialSourcing, M + half + 10, 383, half, ['Y', 'N'], fonts);
  choice(p3, 'Optional design elements?', formData.optionalDesignElements, M, 350, half, ['Y', 'N'], fonts);
  choice(p3, 'Tolerances provided?', formData.tolerancesProvided, M + half + 10, 350, half, ['Y', 'N', 'N/A'], fonts);
  section(p3, 'SECTION D - INSPECTION AND ACCEPTANCE', 311, fonts);
  field(p3, 'First article quantity', formData.firstArticleQuantity, M, 267, half, fonts, 34);
  field(p3, 'First article due date', formData.firstArticleDueDate, M + half + 10, 267, half, fonts, 34);
  field(p3, 'Inspection location', formData.inspectionLocation, M, 219, CW, fonts, 42);
  field(p3, 'Acceptance timeframe', formData.acceptanceTimeframe, M, 171, CW, fonts, 42);

  const p4 = page(document, fonts, 4, totalPages);
  section(p4, 'SECTION E - SHIPPING', 694, fonts);
  choice(p4, 'Special packaging instructions?', formData.specialPackaging, M, 657, half, ['Yes', 'No'], fonts);
  choice(p4, 'Special marking instructions?', formData.specialMarking, M + half + 10, 657, half, ['Yes', 'No'], fonts);
  field(p4, 'FOB', formData.fobType, M, 617, half, fonts, 34);
  field(p4, 'Shipping company', formData.shippingCompany, M + half + 10, 617, half, fonts, 34);
  field(p4, 'Client account number', formData.clientAccountNumber, M, 577, half, fonts, 34);
  field(p4, 'Shipping type', formData.shippingType, M + half + 10, 577, half, fonts, 34);
  field(p4, 'Delivery schedule', formData.deliverySchedule, M, 529, CW, fonts, 42);
  field(p4, 'Ship-to information', formData.shipToInformation, M, 479, CW, fonts, 42);
  section(p4, 'SECTION F - SPECIAL CONTRACT REQUIREMENTS', 440, fonts);
  field(p4, 'Certifications', formData.certifications, M, 390, CW, fonts, 42);
  field(p4, 'Retention requirements', formData.retentionRequirements, M, 342, half, fonts, 40);
  field(p4, 'DPAS rating', formData.dpasRating, M + half + 10, 342, half, fonts, 40);
  field(p4, 'FAR / DFARS flowdown clause numbers', formData.farFlowdownClauseNumbers, M, 286, CW, fonts, 48);
  field(p4, 'FAR / DFARS flowdown notes', formData.farFlowdownNotes, M, 230, CW, fonts, 48);
  section(p4, 'REVIEWER AUTHORIZATION', 191, fonts);
  field(p4, 'Name / title', [formData.reviewerName, formData.reviewerTitle].filter(Boolean).join(' - '), M, 147, half, fonts, 34);
  choice(p4, 'Acceptance', formData.acceptance, M + half + 10, 153, half, ['Yes', 'No'], fonts);
  field(p4, 'Date', formData.date, M, 107, half, fonts, 34);
  field(p4, 'Signature', formData.signature ? '[Digital signature recorded]' : '', M + half + 10, 107, half, fonts, 34);

  document.setTitle('Purchase Review Checklist');
  document.setCreator('EPOCH Manufacturing ERP');
  return document.save();
}
