import { createRequire } from 'module';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import {
  calculateQcLimits,
  SPEC_SHEET_TABLE_TYPES,
} from './partSpecificationSheets';

const require = createRequire(import.meta.url);

export type PartSpecificationSheetPdfInput = {
  title: string;
  sku?: string | null;
  partNumber?: string | null;
  partName?: string | null;
  manufacturedPart?: Record<string, any> | null;
  fieldValues: Record<string, any>;
  templateSections: any[];
  templateFields: any[];
  documentNumber: string;
  revision?: string;
  status?: string;
  effectiveDate?: string | null;
};

export async function renderPartSpecificationSheetPdf(
  input: PartSpecificationSheetPdfInput
): Promise<Buffer> {
  const PDFKitDocument = require('pdfkit');
  const landscape = input.templateFields.some(
    (field) =>
      SPEC_SHEET_TABLE_TYPES.has(field.fieldType) &&
      Array.isArray(field.columns) &&
      field.columns.length > 8
  );
  const doc = new PDFKitDocument({
    margin: 36,
    size: 'LETTER',
    layout: landscape ? 'landscape' : 'portrait',
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const contentBottom = 34;
  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const writeLine = (label: string, value: any) => {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
    doc.font('Helvetica').text(value ? String(value) : '-');
  };
  const ensureSpace = (height: number) => {
    if (doc.y + height > doc.page.height - contentBottom) doc.addPage();
  };
  const displayCell = (value: any) => {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value == null || value === '') return '-';
    return String(value);
  };
  const drawTable = (field: any, rawRows: any[]) => {
    const columns = Array.isArray(field.columns) ? field.columns : [];
    if (columns.length === 0) return;
    const rows =
      field.fieldType === 'qc_standards_table'
        ? rawRows.map((row) => calculateQcLimits(row))
        : rawRows;
    const totalWeight = columns.reduce(
      (sum: number, column: any) => sum + Number(column.width || 1),
      0
    );
    const widths = columns.map(
      (column: any) => (pageWidth * Number(column.width || 1)) / totalWeight
    );
    const headerHeight = 26;
    const drawHeader = () => {
      ensureSpace(headerHeight + 18);
      const y = doc.y;
      let x = doc.page.margins.left;
      columns.forEach((column: any, index: number) => {
        doc
          .rect(x, y, widths[index], headerHeight)
          .fillAndStroke('#e5e7eb', '#6b7280');
        doc
          .fillColor('#111827')
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .text(column.label || column.key, x + 3, y + 4, {
            width: widths[index] - 6,
            height: headerHeight - 6,
          });
        x += widths[index];
      });
      doc.y = y + headerHeight;
    };
    drawHeader();
    for (const row of rows) {
      const heights = columns.map((column: any, index: number) =>
        doc.heightOfString(displayCell(row?.[column.key]), {
          width: widths[index] - 6,
          lineGap: 1,
        })
      );
      const rowHeight = Math.max(18, Math.max(...heights) + 8);
      if (doc.y + rowHeight > doc.page.height - contentBottom) {
        doc.addPage();
        drawHeader();
      }
      let x = doc.page.margins.left;
      const y = doc.y;
      columns.forEach((column: any, index: number) => {
        doc.rect(x, y, widths[index], rowHeight).stroke('#9ca3af');
        doc
          .fillColor('#111827')
          .font('Helvetica')
          .fontSize(6.5)
          .text(displayCell(row?.[column.key]), x + 3, y + 4, {
            width: widths[index] - 6,
            height: rowHeight - 7,
            lineGap: 1,
          });
        x += widths[index];
      });
      doc.y = y + rowHeight;
    }
  };

  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(input.title, { width: pageWidth });
  doc.moveDown(0.4);
  doc
    .fontSize(9)
    .font('Helvetica')
    .text(`Controlled Doc #: ${input.documentNumber}`);
  doc.moveDown(0.8);
  writeLine('SKU #', input.sku);
  writeLine('Part #', input.partNumber);
  writeLine('Part Name', input.partName);
  if (input.manufacturedPart) {
    writeLine(
      'Linked Manufactured Part',
      `${input.manufacturedPart.agPartNumber || input.manufacturedPart.id} - ${
        input.manufacturedPart.name || ''
      }`
    );
  }

  const sections =
    input.templateSections.length > 0
      ? input.templateSections
      : Array.from(
          new Set(
            input.templateFields
              .map((field) => field.sectionName)
              .filter(Boolean)
          )
        ).map((name) => ({ name }));

  for (const section of sections) {
    const sectionName = section.name || section.sectionName || 'Section';
    const fields = input.templateFields.filter(
      (field) => (field.sectionName || 'Section') === sectionName
    );
    if (fields.length === 0) continue;
    ensureSpace(48);
    doc.moveDown(0.9);
    const sectionY = doc.y;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(sectionName, doc.page.margins.left, sectionY, {
        underline: true,
      });
    doc.moveDown(0.25);
    for (const field of fields) {
      const rawValue =
        input.fieldValues[field.fieldName] ?? field.defaultValue ?? '';
      ensureSpace(34);
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(
          field.fieldLabel || field.fieldName,
          doc.page.margins.left,
          doc.y
        );
      if (
        SPEC_SHEET_TABLE_TYPES.has(field.fieldType) &&
        Array.isArray(rawValue)
      ) {
        drawTable(field, rawValue);
      } else {
        const value = Array.isArray(rawValue)
          ? rawValue.join('\n')
          : String(rawValue || '');
        doc
          .font('Helvetica')
          .fontSize(9)
          .text(value || '-', { width: pageWidth, lineGap: 2 });
      }
      doc.moveDown(0.35);
    }
  }

  doc.end();
  const generatedPdf = await finished;
  const controlledPdf = await PDFDocument.load(generatedPdf);
  const footerFont = await controlledPdf.embedFont(StandardFonts.Helvetica);
  const footerDate =
    input.effectiveDate || new Date().toISOString().slice(0, 10);
  const pages = controlledPdf.getPages();
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const footer =
      `${input.documentNumber} | Rev ${input.revision || '1.0'} | ` +
      `${input.status || 'DRAFT'} | ${footerDate} | Page ${index + 1} of ${
        pages.length
      } | Configuration Controlled | Uncontrolled When Printed`;
    let footerSize = 6.5;
    while (
      footerSize > 5 &&
      footerFont.widthOfTextAtSize(footer, footerSize) > width - 72
    ) {
      footerSize -= 0.25;
    }
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: 26,
      color: rgb(1, 1, 1),
      opacity: 0.96,
    });
    page.drawLine({
      start: { x: 36, y: 25 },
      end: { x: width - 36, y: 25 },
      thickness: 0.5,
      color: rgb(0.72, 0.72, 0.72),
    });
    page.drawText(footer, {
      x: 36,
      y: 9,
      size: footerSize,
      font: footerFont,
      color: rgb(0.2, 0.2, 0.2),
      maxWidth: width - 72,
    });
  });
  return Buffer.from(await controlledPdf.save());
}
