import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
const BLUE = rgb(0.08, 0.25, 0.44);
const LIGHT_BLUE = rgb(0.91, 0.95, 0.98);
const LIGHT_GRAY = rgb(0.96, 0.97, 0.98);
const MID_GRAY = rgb(0.42, 0.46, 0.50);
const BLACK = rgb(0.08, 0.09, 0.10);

type Fonts = { regular: PDFFont; bold: PDFFont };

function text(page: PDFPage, value: string, x: number, y: number, size: number, font: PDFFont, color = BLACK) {
  page.drawText(value, { x, y, size, font, color });
}

function line(page: PDFPage, x1: number, y1: number, x2: number, y2: number, color = MID_GRAY, thickness = 0.7) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
}

function fieldLine(page: PDFPage, label: string, x: number, y: number, width: number, fonts: Fonts) {
  text(page, label, x, y + 3, 9, fonts.bold);
  const labelWidth = fonts.bold.widthOfTextAtSize(label, 9) + 8;
  line(page, x + labelWidth, y, x + width, y);
}

function header(page: PDFPage, fonts: Fonts, pageNumber: number) {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 76, width: PAGE_WIDTH, height: 76, color: BLUE });
  text(page, 'A G COMPOSITES', MARGIN, PAGE_HEIGHT - 34, 16, fonts.bold, rgb(1, 1, 1));
  text(page, 'RFQ RISK ASSESSMENT', MARGIN, PAGE_HEIGHT - 57, 13, fonts.bold, rgb(1, 1, 1));
  text(page, 'FO Form 11', PAGE_WIDTH - MARGIN - 62, PAGE_HEIGHT - 34, 9, fonts.bold, rgb(1, 1, 1));
  text(page, `Page ${pageNumber} of 2`, PAGE_WIDTH - MARGIN - 62, PAGE_HEIGHT - 53, 8, fonts.regular, rgb(1, 1, 1));
}

function footer(page: PDFPage, fonts: Fonts) {
  line(page, MARGIN, 31, PAGE_WIDTH - MARGIN, 31, rgb(0.75, 0.77, 0.79), 0.5);
  text(page, 'FO Form 11 - Version 1.4 - Uncontrolled when printed', MARGIN, 18, 7.5, fonts.regular, MID_GRAY);
  text(page, 'Blank assessment form', PAGE_WIDTH - MARGIN - 84, 18, 7.5, fonts.regular, MID_GRAY);
}

function sectionTitle(page: PDFPage, title: string, y: number, fonts: Fonts) {
  page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_WIDTH, height: 22, color: LIGHT_BLUE });
  text(page, title, MARGIN + 8, y + 3, 10, fonts.bold, BLUE);
}

function checkbox(page: PDFPage, x: number, y: number) {
  page.drawRectangle({ x, y, width: 9, height: 9, borderColor: MID_GRAY, borderWidth: 0.7 });
}

function riskTable(page: PDFPage, yTop: number, title: string, factors: string[], fonts: Fonts): number {
  sectionTitle(page, title, yTop, fonts);
  const top = yTop - 12;
  const rowHeight = 31;
  const columns = [MARGIN, MARGIN + 196, MARGIN + 246, MARGIN + 296, MARGIN + 346, MARGIN + 396, PAGE_WIDTH - MARGIN];

  page.drawRectangle({ x: MARGIN, y: top - 24, width: CONTENT_WIDTH, height: 24, color: LIGHT_GRAY });
  ['Assessment factor', 'Low', 'Med.', 'High', 'Extreme', 'Notes / evidence'].forEach((label, index) => {
    text(page, label, columns[index] + 5, top - 16, index === 0 || index === 5 ? 7.5 : 7, fonts.bold, BLUE);
  });
  line(page, MARGIN, top, PAGE_WIDTH - MARGIN, top, BLUE, 0.8);
  line(page, MARGIN, top - 24, PAGE_WIDTH - MARGIN, top - 24, MID_GRAY, 0.6);

  let rowTop = top - 24;
  for (const factor of factors) {
    const rowBottom = rowTop - rowHeight;
    text(page, factor, MARGIN + 5, rowBottom + 11, 8, fonts.regular);
    [columns[1], columns[2], columns[3], columns[4]].forEach((columnX) => checkbox(page, columnX + 19, rowBottom + 11));
    line(page, MARGIN, rowBottom, PAGE_WIDTH - MARGIN, rowBottom, rgb(0.78, 0.80, 0.82), 0.5);
    rowTop = rowBottom;
  }
  columns.forEach((columnX) => line(page, columnX, top, columnX, rowTop, rgb(0.72, 0.74, 0.76), 0.5));
  return rowTop;
}

export async function generateBlankRfqRiskAssessmentPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
  };

  const page1 = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  header(page1, fonts, 1);
  footer(page1, fonts);

  fieldLine(page1, 'RFQ Number', MARGIN, 686, 245, fonts);
  fieldLine(page1, 'Date', 318, 686, 252, fonts);
  fieldLine(page1, 'Customer', MARGIN, 661, CONTENT_WIDTH, fonts);
  text(page1, 'Description / scope:', MARGIN, 638, 9, fonts.bold);
  line(page1, MARGIN, 622, PAGE_WIDTH - MARGIN, 622);
  line(page1, MARGIN, 606, PAGE_WIDTH - MARGIN, 606);

  page1.drawRectangle({ x: MARGIN, y: 567, width: CONTENT_WIDTH, height: 27, color: LIGHT_GRAY });
  text(page1, 'Score each factor:  Low = 0     Medium = 1     High = 3     Extreme = 17', MARGIN + 8, 578, 8.5, fonts.bold, BLUE);

  riskTable(page1, 547, '1. INTERNAL RISKS', [
    'Trained staff',
    'Equipment requirements',
    'Manufacturing space',
    'Regulatory requirements',
    'Conflicting priorities',
    'Customer concentration',
    'Climate / environmental',
  ], fonts);
  fieldLine(page1, 'Internal subtotal', MARGIN + 330, 282, 198, fonts);
  text(page1, 'Use notes/evidence to identify assumptions, constraints, or required follow-up.', MARGIN, 255, 8, fonts.regular, MID_GRAY);

  const page2 = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  header(page2, fonts, 2);
  footer(page2, fonts);

  let y = riskTable(page2, 682, '2. EXTERNAL RISKS', [
    'Supply chain disruptions',
    'Supplier variability',
    'Contract provisions',
    'Timelines',
    'Quality expectations',
  ], fonts);
  fieldLine(page2, 'External subtotal', MARGIN + 330, y - 22, 198, fonts);

  y -= 58;
  sectionTitle(page2, '3. MITIGATION ACTIONS', y, fonts);
  y -= 22;
  ['A', 'B', 'C'].forEach((letter) => {
    text(page2, `${letter}.`, MARGIN + 4, y - 8, 9, fonts.bold);
    line(page2, MARGIN + 22, y - 10, MARGIN + 395, y - 10);
    text(page2, 'Reduction:', MARGIN + 405, y - 8, 8, fonts.bold);
    line(page2, MARGIN + 455, y - 10, PAGE_WIDTH - MARGIN, y - 10);
    y -= 31;
  });

  sectionTitle(page2, '4. RISK SUMMARY AND BID DECISION', y, fonts);
  y -= 29;
  fieldLine(page2, 'Total overall points', MARGIN + 4, y, 220, fonts);
  fieldLine(page2, 'Less mitigation', MARGIN + 270, y, 252, fonts);
  y -= 27;
  fieldLine(page2, 'Adjusted risk level', MARGIN + 4, y, 220, fonts);
  text(page2, 'Risk determination:', MARGIN + 270, y + 3, 9, fonts.bold);
  ['Low', 'Medium', 'High'].forEach((label, index) => {
    checkbox(page2, MARGIN + 365 + (index * 55), y - 2);
    text(page2, label, MARGIN + 378 + (index * 55), y, 8, fonts.regular);
  });
  y -= 31;
  text(page2, 'Bid decision:', MARGIN + 4, y + 3, 9, fonts.bold);
  ['Bid', 'No bid', 'Conditional / management review'].forEach((label, index) => {
    const x = [MARGIN + 78, MARGIN + 150, MARGIN + 240][index];
    checkbox(page2, x, y - 2);
    text(page2, label, x + 13, y, 8, fonts.regular);
  });

  y -= 43;
  sectionTitle(page2, '5. APPROVAL', y, fonts);
  y -= 32;
  fieldLine(page2, 'Printed name', MARGIN + 4, y, 245, fonts);
  fieldLine(page2, 'Date', MARGIN + 285, y, 237, fonts);
  y -= 35;
  fieldLine(page2, 'Signature', MARGIN + 4, y, CONTENT_WIDTH - 4, fonts);
  text(page2, 'High-risk assessments require authorized executive approval.', MARGIN + 4, y - 24, 8, fonts.regular, MID_GRAY);

  document.setTitle('Blank RFQ Risk Assessment');
  document.setSubject('Printable blank RFQ risk assessment form');
  document.setCreator('EPOCH Manufacturing ERP');
  return document.save();
}
