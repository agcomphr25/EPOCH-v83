import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

const PAGE = { width: 612, height: 792, margin: 48 };

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

export async function generateVendorFlowdownExhibitPdf(workspace: any): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage;
  let y = 0;
  const addPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin;
    page.drawText('AG ADVANCED TECHNOLOGIES', { x: PAGE.margin, y, font: bold, size: 13, color: rgb(0.36, 0.06, 0.1) });
    page.drawText('Controlled Vendor Flowdown Exhibit', { x: PAGE.margin, y: y - 18, font: bold, size: 17, color: rgb(0.06, 0.09, 0.16) });
    y -= 48;
  };
  const ensure = (height: number) => { if (y - height < PAGE.margin + 26) addPage(); };
  const line = (label: string, value: string) => {
    ensure(18);
    page.drawText(label, { x: PAGE.margin, y, font: bold, size: 9, color: rgb(0.25, 0.3, 0.37) });
    page.drawText(value || 'Not recorded', { x: PAGE.margin + 110, y, font: regular, size: 9, color: rgb(0.03, 0.05, 0.08) });
    y -= 16;
  };
  addPage();
  line('AG Vendor PO:', workspace.po.poNumber || `Draft #${workspace.po.id}`);
  line('Supplier:', workspace.po.vendorName || `Vendor #${workspace.po.vendorId}`);
  line('Exhibit revision:', `R${workspace.assessment.exhibitRevision}`);
  line('Issue date:', new Date().toLocaleDateString('en-US'));
  line('Purchase class:', String(workspace.assessment.procurementClass).replaceAll('_', ' '));
  y -= 8;
  ensure(62);
  page.drawRectangle({ x: PAGE.margin, y: y - 46, width: PAGE.width - PAGE.margin * 2, height: 50, color: rgb(0.95, 0.97, 0.99), borderColor: rgb(0.78, 0.82, 0.87), borderWidth: 0.6 });
  const intro = 'The requirements below are incorporated into the AG vendor purchase order according to the stated method. Supplier shall flow applicable requirements to lower-tier suppliers. Communications and required reports shall be submitted through AG Advanced Technologies unless the included requirement expressly states otherwise.';
  wrap(intro, regular, 8.5, PAGE.width - PAGE.margin * 2 - 20).slice(0, 4).forEach((text, index) => page.drawText(text, { x: PAGE.margin + 10, y: y - 12 - index * 10, font: regular, size: 8.5 }));
  y -= 66;

  const included = workspace.clauses.filter((clause: any) => clause.savedDecision === 'INCLUDE');
  page.drawText('Applicable Requirements', { x: PAGE.margin, y, font: bold, size: 12 });
  y -= 20;
  if (!included.length) {
    page.drawText('No FAR/DFARS clauses were approved for inclusion.', { x: PAGE.margin, y, font: regular, size: 9 });
    y -= 20;
  }
  for (const clause of included) {
    const titleLines = wrap(`${clause.clauseNumber} - ${clause.title}`, bold, 9.5, PAGE.width - PAGE.margin * 2 - 16);
    const reasonLines = wrap(`Basis: ${clause.decisionReason || clause.triggerReason}`, regular, 8, PAGE.width - PAGE.margin * 2 - 16);
    const sourceLines = clause.officialUrl
      ? wrap(`Official source: ${clause.officialUrl}`, regular, 6.5, PAGE.width - PAGE.margin * 2 - 16).slice(0, 2)
      : [];
    const height = 24 + titleLines.length * 11 + Math.min(reasonLines.length, 3) * 9 + sourceLines.length * 8;
    ensure(height);
    page.drawRectangle({ x: PAGE.margin, y: y - height + 5, width: PAGE.width - PAGE.margin * 2, height, borderColor: rgb(0.82, 0.85, 0.89), borderWidth: 0.6 });
    page.drawText(`${clause.regulation} | ${clause.inclusionMethod}`, { x: PAGE.width - PAGE.margin - 120, y: y - 10, font: regular, size: 7.5, color: rgb(0.3, 0.35, 0.42) });
    titleLines.forEach((text, index) => page.drawText(text, { x: PAGE.margin + 8, y: y - 12 - index * 11, font: bold, size: 9.5 }));
    const reasonY = y - 17 - titleLines.length * 11;
    reasonLines.slice(0, 3).forEach((text, index) => page.drawText(text, { x: PAGE.margin + 8, y: reasonY - index * 9, font: regular, size: 8, color: rgb(0.25, 0.3, 0.37) }));
    sourceLines.forEach((text, index) => page.drawText(text, {
      x: PAGE.margin + 8,
      y: y - height + 10 + (sourceLines.length - index - 1) * 8,
      font: regular,
      size: 6.5,
      color: rgb(0.12, 0.32, 0.55),
    }));
    y -= height + 7;
  }

  ensure(86);
  y -= 8;
  page.drawText('Supplier Acknowledgment', { x: PAGE.margin, y, font: bold, size: 11 });
  y -= 24;
  page.drawText('Authorized representative: ____________________________________', { x: PAGE.margin, y, font: regular, size: 9 });
  y -= 24;
  page.drawText('Signature: __________________________________  Date: __________________', { x: PAGE.margin, y, font: regular, size: 9 });

  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    item.drawText(`AG controlled exhibit | PO ${workspace.po.poNumber || workspace.po.id} | R${workspace.assessment.exhibitRevision} | Page ${index + 1} of ${pages.length}`, {
      x: PAGE.margin, y: 24, font: regular, size: 7, color: rgb(0.4, 0.44, 0.5),
    });
  });
  return Buffer.from(await pdf.save());
}
