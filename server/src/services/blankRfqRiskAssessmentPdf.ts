import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';

type AssessmentInput = {
  rfqNumber?: string | null;
  formData?: Record<string, any> | null;
  totalOverallPoints?: number | null;
  adjustedRiskLevel?: number | null;
  riskDetermination?: string | null;
  bidDecision?: string | null;
};

const BLACK = rgb(0, 0, 0);
const internalRisks = [
  ['trainedStaff', 'a.', 'Trained/Qualified Staff'],
  ['equipmentRequirements', 'b.', 'Equipment Requirements'],
  ['manufacturingSpace', 'c.', 'Manufacturing Space'],
  ['regulatoryRequirements', 'd.', 'Regulatory Requirements'],
  ['conflictingPriorities', 'e.', 'Conflicting Priorities of Work'],
  ['customerConcentration', 'f.', 'Customer Concentration'],
  ['climateEnvironmental', 'g.', 'Climate/Environmental Impact'],
] as const;

const externalRisks = [
  ['supplyChainDisruptions', 'a.', 'Supply Chain Disruptions'],
  ['supplierVariability', 'b.', 'Supplier Source Variability'],
  ['contractProvisions', 'c.', 'Contract Mandatory Provisions'],
  ['timelines', 'd.', 'Timelines'],
  ['qualityExpectations', 'e.', 'Reasonable Quality Expectations'],
] as const;

function findOriginalFormPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'attached_assets/RFQ Risk Assessment (1)_1753459211571.pdf'),
    path.resolve(process.cwd(), 'dist/attached_assets/RFQ Risk Assessment (1)_1753459211571.pdf'),
  ];
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) throw new Error('Original FO Form 11 RFQ Risk Assessment PDF was not found');
  return match;
}

function normalized(value: unknown): string {
  const result = String(value ?? '').trim().toLowerCase();
  return result === 'med' ? 'medium' : result;
}

function display(value: unknown): string {
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function drawText(page: PDFPage, value: unknown, x: number, y: number, size: number, font: PDFFont) {
  page.drawText(display(value), { x, y, size, font, color: BLACK });
}

function drawCheck(page: PDFPage, x: number, y: number) {
  page.drawLine({ start: { x: x, y: y + 3 }, end: { x: x + 2.3, y }, thickness: 1, color: BLACK });
  page.drawLine({ start: { x: x + 2.2, y }, end: { x: x + 6.2, y: y + 6.4 }, thickness: 1, color: BLACK });
}

function drawChoice(page: PDFPage, x: number, y: number, label: string, checked: boolean, font: PDFFont) {
  page.drawRectangle({ x, y: y + 1, width: 7, height: 7, borderColor: BLACK, borderWidth: 0.55 });
  if (checked) drawCheck(page, x + 0.4, y + 1.3);
  drawText(page, label, x + 11, y, 9.2, font);
}

function redrawRiskRows(page: PDFPage, formData: Record<string, any>, font: PDFFont) {
  const columns = [
    ['extreme', 'Extreme', 270],
    ['high', 'High', 345],
    ['medium', 'Medium', 415],
    ['low', 'Low', 505],
  ] as const;
  const internalRows = [576, 559, 542, 525, 508, 491, 474];
  const externalRows = [413, 396, 379, 362, 345];

  // The original Google Docs export contains inconsistent checkbox positions.
  // Clear each complete risk block, then redraw every row on one shared grid.
  page.drawRectangle({ x: 106, y: 466, width: 470, height: 124, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 106, y: 337, width: 470, height: 89, color: rgb(1, 1, 1) });

  const drawRows = (
    rows: ReadonlyArray<readonly [string, string, string]>,
    yPositions: number[],
  ) => rows.forEach(([key, letter, label], index) => {
    const y = yPositions[index];
    drawText(page, letter, 109, y, 9.2, font);
    drawText(page, label, 121, y, 9.2, font);
    const selected = normalized(formData[key]);
    columns.forEach(([risk, choiceLabel, x]) => drawChoice(page, x, y, choiceLabel, selected === risk, font));
  });

  drawRows(internalRisks, internalRows);
  drawRows(externalRisks, externalRows);
}

async function drawSignature(page: PDFPage, document: PDFDocument, signature: unknown) {
  if (typeof signature !== 'string' || !signature.startsWith('data:image/png;base64,')) return;
  try {
    const image = await document.embedPng(Buffer.from(signature.split(',')[1], 'base64'));
    const scale = Math.min(180 / image.width, 30 / image.height);
    page.drawImage(image, { x: 326, y: 91, width: image.width * scale, height: image.height * scale });
  } catch {
    // Older records may contain incomplete signature image data.
  }
}

export async function generateRfqRiskAssessmentPdf(input: AssessmentInput = {}): Promise<Uint8Array> {
  const originalBytes = fs.readFileSync(findOriginalFormPath());
  const document = await PDFDocument.load(originalBytes);
  const page = document.getPage(0);
  const regular = await document.embedFont(StandardFonts.TimesRoman);
  const formData = input.formData || {};

  redrawRiskRows(page, formData, regular);
  drawText(page, input.rfqNumber, 307, 624, 11, regular);
  drawText(page, formData.internalSubtotal, 196, 454, 9.5, regular);
  drawText(page, formData.externalSubtotal, 196, 343, 9.5, regular);

  const actions = [formData.mitigationActionA, formData.mitigationActionB, formData.mitigationActionC];
  actions.forEach((action, index) => drawText(page, display(action).slice(0, 68), 145, 299 - (index * 17), 9, regular));
  drawText(page, input.totalOverallPoints ?? formData.totalOverallPoints, 414, 313, 9.5, regular);

  const determination = normalized(input.riskDetermination ?? formData.riskDetermination).replace(' risk', '');
  const circles: Record<string, { x: number; y: number; xScale: number }> = {
    high: { x: 178, y: 220, xScale: 47 },
    medium: { x: 292, y: 220, xScale: 55 },
    low: { x: 394, y: 220, xScale: 44 },
  };
  const circle = circles[determination];
  if (circle) {
    page.drawEllipse({ ...circle, yScale: 10, borderColor: BLACK, borderWidth: 0.9 });
  }

  const bidDecision = normalized(input.bidDecision ?? formData.bidDecision);
  if (bidDecision === 'accept' || bidDecision === 'bid') drawCheck(page, 92, 185);
  if (bidDecision === 'abstain' || bidDecision === 'no bid') drawCheck(page, 92, 168);

  drawText(page, formData.date, 79, 130, 9.5, regular);
  drawText(page, formData.printedName, 336, 130, 9.5, regular);
  await drawSignature(page, document, formData.signature);

  document.setTitle(input.rfqNumber ? `RFQ Risk Assessment ${input.rfqNumber}` : 'RFQ Risk Assessment');
  document.setSubject('FO Form 11 RFQ Risk Assessment');
  document.setCreator('EPOCH Manufacturing ERP');
  return document.save();
}

export async function generateBlankRfqRiskAssessmentPdf(): Promise<Uint8Array> {
  return generateRfqRiskAssessmentPdf();
}
