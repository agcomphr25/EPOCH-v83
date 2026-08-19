import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 36;
const RIGHT = 576;
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.93, 0.93, 0.93);

type AssessmentInput = {
  rfqNumber?: string | null;
  customerName?: string | null;
  description?: string | null;
  formData?: Record<string, any> | null;
  totalOverallPoints?: number | null;
  adjustedRiskLevel?: number | null;
  riskDetermination?: string | null;
  bidDecision?: string | null;
};

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

const internalRisks = [
  ['trainedStaff', 'Availability of properly trained staff'],
  ['equipmentRequirements', 'Equipment requirements / capability'],
  ['manufacturingSpace', 'Manufacturing space / capacity'],
  ['regulatoryRequirements', 'Regulatory requirements'],
  ['conflictingPriorities', 'Conflicting priorities'],
  ['customerConcentration', 'Customer concentration'],
  ['climateEnvironmental', 'Climate / environmental requirements'],
] as const;

const externalRisks = [
  ['supplyChainDisruptions', 'Supply chain disruptions'],
  ['supplierVariability', 'Supplier variability'],
  ['contractProvisions', 'Contract provisions'],
  ['timelines', 'Required timelines'],
  ['qualityExpectations', 'Quality expectations'],
] as const;

function drawText(page: PDFPage, value: unknown, x: number, y: number, size: number, font: PDFFont) {
  page.drawText(String(value ?? ''), { x, y, size, font, color: BLACK });
}

function drawLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, thickness = 0.65) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: BLACK });
}

function centered(page: PDFPage, value: string, y: number, size: number, font: PDFFont) {
  const width = font.widthOfTextAtSize(value, size);
  drawText(page, value, (PAGE_WIDTH - width) / 2, y, size, font);
}

function checkbox(page: PDFPage, x: number, y: number, checked: boolean) {
  page.drawRectangle({ x, y, width: 9, height: 9, borderColor: BLACK, borderWidth: 0.7 });
  if (checked) {
    drawLine(page, x + 1.5, y + 1.5, x + 7.5, y + 7.5, 1.2);
    drawLine(page, x + 7.5, y + 1.5, x + 1.5, y + 7.5, 1.2);
  }
}

function normalizeRisk(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'med') return 'medium';
  return normalized;
}

function sectionBar(page: PDFPage, number: string, title: string, y: number, fonts: Fonts) {
  page.drawRectangle({ x: LEFT, y: y - 3, width: RIGHT - LEFT, height: 16, color: GRAY, borderColor: BLACK, borderWidth: 0.7 });
  drawText(page, `${number}. ${title}`, LEFT + 5, y + 1, 8.5, fonts.bold);
}

function riskTable(
  page: PDFPage,
  yTop: number,
  rows: ReadonlyArray<readonly [string, string]>,
  formData: Record<string, any>,
  fonts: Fonts,
): number {
  const labelRight = 365;
  const columnWidth = (RIGHT - labelRight) / 4;
  const rowHeight = 19;
  const headerBottom = yTop - 18;
  const bottom = headerBottom - (rows.length * rowHeight);
  const levels = ['extreme', 'high', 'medium', 'low'];
  const labels = ['Extreme', 'High', 'Medium', 'Low'];

  page.drawRectangle({ x: LEFT, y: headerBottom, width: RIGHT - LEFT, height: 18, borderColor: BLACK, borderWidth: 0.7 });
  drawText(page, 'Risk Factor', LEFT + 5, headerBottom + 5, 7.5, fonts.bold);
  labels.forEach((label, index) => {
    const x = labelRight + (index * columnWidth);
    const width = fonts.bold.widthOfTextAtSize(label, 6.8);
    drawText(page, label, x + ((columnWidth - width) / 2), headerBottom + 5, 6.8, fonts.bold);
  });

  rows.forEach(([key, label], rowIndex) => {
    const rowBottom = headerBottom - ((rowIndex + 1) * rowHeight);
    drawText(page, label, LEFT + 5, rowBottom + 6, 7.3, fonts.regular);
    const selected = normalizeRisk(formData[key]);
    levels.forEach((level, columnIndex) => {
      const x = labelRight + (columnIndex * columnWidth) + ((columnWidth - 9) / 2);
      checkbox(page, x, rowBottom + 5, selected === level);
    });
    drawLine(page, LEFT, rowBottom, RIGHT, rowBottom, 0.45);
  });

  [LEFT, labelRight, ...[1, 2, 3].map((i) => labelRight + (i * columnWidth)), RIGHT].forEach((x) => {
    drawLine(page, x, yTop, x, bottom, 0.55);
  });
  return bottom;
}

function valueOrBlank(value: unknown): string {
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function mitigationLine(page: PDFPage, letter: string, action: unknown, reduction: unknown, y: number, fonts: Fonts) {
  drawText(page, `${letter}.`, LEFT + 4, y, 7.5, fonts.bold);
  const actionText = valueOrBlank(action);
  if (actionText) drawText(page, actionText.slice(0, 93), LEFT + 18, y, 7, fonts.regular);
  drawLine(page, LEFT + 17, y - 2, 474, y - 2, 0.45);
  drawText(page, 'Score Adj.', 480, y, 6.8, fonts.bold);
  drawLine(page, 525, y - 2, RIGHT, y - 2, 0.45);
  if (valueOrBlank(reduction)) drawText(page, reduction, 539, y, 7, fonts.regular);
}

async function drawSignature(page: PDFPage, document: PDFDocument, signature: unknown, x: number, y: number) {
  if (typeof signature !== 'string' || !signature.startsWith('data:image/png;base64,')) return;
  try {
    const image = await document.embedPng(Buffer.from(signature.split(',')[1], 'base64'));
    const scale = Math.min(120 / image.width, 23 / image.height);
    page.drawImage(image, { x, y, width: image.width * scale, height: image.height * scale });
  } catch {
    // Older records may contain incomplete signature data. The remaining audit fields still render.
  }
}

export async function generateRfqRiskAssessmentPdf(input: AssessmentInput = {}): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
    italic: await document.embedFont(StandardFonts.HelveticaOblique),
  };
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const formData = input.formData || {};

  centered(page, 'AG', 756, 28, fonts.bold);
  centered(page, 'COMPOSITES LLC', 744, 7.2, fonts.bold);
  centered(page, 'ENGINEERED FOR PERFORMANCE', 734, 5.8, fonts.italic);
  centered(page, `RFQ Risk Assessment # ${valueOrBlank(input.rfqNumber) || '________________'}`, 708, 14, fonts.bold);

  sectionBar(page, '1', 'Internal Risks', 682, fonts);
  let y = riskTable(page, 661, internalRisks, formData, fonts);
  drawText(page, 'Subtotal Internal Risk Points:', 395, y - 14, 7.3, fonts.bold);
  drawLine(page, 523, y - 16, RIGHT, y - 16);
  drawText(page, valueOrBlank(formData.internalSubtotal), 539, y - 14, 7.3, fonts.regular);

  y -= 38;
  sectionBar(page, '2', 'External Risks', y, fonts);
  y = riskTable(page, y - 21, externalRisks, formData, fonts);
  drawText(page, 'Subtotal External Risk Points:', 395, y - 14, 7.3, fonts.bold);
  drawLine(page, 523, y - 16, RIGHT, y - 16);
  drawText(page, valueOrBlank(formData.externalSubtotal), 539, y - 14, 7.3, fonts.regular);

  y -= 38;
  sectionBar(page, '3', 'Mitigation Actions and Score Adjustment', y, fonts);
  y -= 20;
  mitigationLine(page, 'a', formData.mitigationActionA, formData.mitigationReductionA, y, fonts);
  mitigationLine(page, 'b', formData.mitigationActionB, formData.mitigationReductionB, y - 20, fonts);
  mitigationLine(page, 'c', formData.mitigationActionC, formData.mitigationReductionC, y - 40, fonts);
  drawText(page, 'Total Overall Points:', 407, y - 61, 7.5, fonts.bold);
  drawLine(page, 503, y - 63, RIGHT, y - 63);
  drawText(page, valueOrBlank(input.totalOverallPoints ?? formData.totalOverallPoints), 535, y - 61, 7.3, fonts.regular);

  y -= 84;
  sectionBar(page, '4', 'Overall Risk Determination', y, fonts);
  y -= 24;
  const determination = normalizeRisk(input.riskDetermination ?? formData.riskDetermination);
  drawText(page, 'Overall Risk:', LEFT + 5, y, 7.5, fonts.bold);
  [['High', 'high'], ['Medium', 'medium'], ['Low', 'low']].forEach(([label, value], index) => {
    const x = LEFT + 79 + (index * 85);
    checkbox(page, x, y - 2, determination.includes(value));
    drawText(page, label, x + 14, y, 7.3, fonts.regular);
  });
  drawText(page, 'Adjusted Score:', 402, y, 7.3, fonts.bold);
  drawLine(page, 472, y - 2, RIGHT, y - 2);
  drawText(page, valueOrBlank(input.adjustedRiskLevel ?? formData.adjustedRiskLevel), 526, y, 7.3, fonts.regular);

  y -= 31;
  const bidDecision = String(input.bidDecision ?? formData.bidDecision ?? '').toLowerCase();
  checkbox(page, LEFT + 5, y - 2, bidDecision === 'accept' || bidDecision === 'bid');
  drawText(page, 'By submitting a bid, I acknowledge and accept the risks associated with this RFQ.', LEFT + 21, y, 7.3, fonts.regular);
  y -= 20;
  checkbox(page, LEFT + 5, y - 2, bidDecision === 'abstain' || bidDecision === 'no bid');
  drawText(page, 'Due to risk, I choose to abstain from submitting a bid.', LEFT + 21, y, 7.3, fonts.regular);

  y -= 35;
  drawText(page, 'Date:', LEFT + 5, y, 7.5, fonts.bold);
  drawLine(page, LEFT + 32, y - 2, 177, y - 2);
  drawText(page, valueOrBlank(formData.date), LEFT + 36, y, 7.3, fonts.regular);
  drawText(page, 'Printed Name:', 200, y, 7.5, fonts.bold);
  drawLine(page, 267, y - 2, 390, y - 2);
  drawText(page, valueOrBlank(formData.printedName), 271, y, 7.3, fonts.regular);
  drawText(page, 'Signature:', 408, y, 7.5, fonts.bold);
  drawLine(page, 456, y - 2, RIGHT, y - 2);
  await drawSignature(page, document, formData.signature, 458, y - 5);

  drawLine(page, LEFT, 31, RIGHT, 31, 0.45);
  drawText(page, 'FO Form 11', LEFT, 20, 6.7, fonts.regular);
  centered(page, 'Version 1.4 10/23/2024', 20, 6.7, fonts.regular);
  drawText(page, 'Page 1 of 1', 529, 20, 6.7, fonts.regular);

  document.setTitle(input.rfqNumber ? `RFQ Risk Assessment ${input.rfqNumber}` : 'Blank RFQ Risk Assessment');
  document.setSubject('FO Form 11 RFQ Risk Assessment');
  document.setCreator('EPOCH Manufacturing ERP');
  return document.save();
}

export async function generateBlankRfqRiskAssessmentPdf(): Promise<Uint8Array> {
  return generateRfqRiskAssessmentPdf();
}
