import crypto from 'crypto';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';

import type { DesignControlFormDefinition } from '../../../shared/designControlFormCatalog';

export const DESIGN_CONTROL_PDF_RENDERER_VERSION = 'design-control-blank-pdf/1';

export type BlankFormPdfInput = {
  templateRevisionId: string;
  definition: DesignControlFormDefinition;
  documentNumber: string;
  documentRevision: string;
  lifecycleStatus: string;
  generatedAt: Date;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 42;
const BODY_TOP = 670;
const BODY_BOTTOM = 72;

export const sha256Buffer = (buffer: Buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');

export async function renderDesignControlBlankPdf(
  input: BlankFormPdfInput
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const fixedDate = new Date(input.generatedAt.toISOString());
  pdf.setTitle(`${input.documentNumber} ${input.definition.title}`);
  pdf.setSubject(
    `Controlled blank Design Control form revision ${input.documentRevision}`
  );
  pdf.setProducer(DESIGN_CONTROL_PDF_RENDERER_VERSION);
  pdf.setCreator('EPOCH Master Document Register');
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const stableRevisionUrl = `/api/design-control-form-templates/revisions/${input.templateRevisionId}`;
  const qrBytes = await QRCode.toBuffer(stableRevisionUrl, {
    type: 'png',
    margin: 0,
    width: 92,
    errorCorrectionLevel: 'M',
  });
  const qr = await pdf.embedPng(qrBytes);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = BODY_TOP;
  const pages: PDFPage[] = [page];

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    y = BODY_TOP;
  };

  const ensureSpace = (height: number) => {
    if (y - height < BODY_BOTTOM) newPage();
  };

  const line = (
    text: string,
    options: { bold?: boolean; size?: number; indent?: number } = {}
  ) => {
    const size = options.size ?? 9;
    const indent = options.indent ?? 0;
    ensureSpace(size + 8);
    page.drawText(text.slice(0, 100), {
      x: MARGIN + indent,
      y,
      size,
      font: options.bold ? bold : regular,
      color: rgb(0.12, 0.16, 0.22),
    });
    y -= size + 7;
  };

  for (const section of input.definition.sections) {
    ensureSpace(42);
    line(section.title, { bold: true, size: 11 });
    if (section.repeating)
      line('Repeat rows as needed.', { size: 8, indent: 8 });
    for (const formField of section.fields) {
      ensureSpace(formField.type === 'textarea' ? 54 : 31);
      line(`${formField.label}${formField.required ? ' *' : ''}`, {
        size: 9,
        indent: 8,
      });
      if (formField.type === 'checkbox') {
        page.drawRectangle({
          x: MARGIN + 16,
          y: y - 2,
          width: 10,
          height: 10,
          borderWidth: 0.7,
        });
        page.drawText('Yes / No / N/A     Comments:', {
          x: MARGIN + 34,
          y,
          size: 8,
          font: regular,
        });
        y -= 18;
      } else if (formField.type === 'signature') {
        page.drawLine({
          start: { x: MARGIN + 16, y },
          end: { x: 300, y },
          thickness: 0.6,
        });
        page.drawText('Signature / authenticated approval', {
          x: MARGIN + 16,
          y: y - 10,
          size: 7,
          font: regular,
        });
        page.drawLine({
          start: { x: 430, y },
          end: { x: 555, y },
          thickness: 0.6,
        });
        page.drawText('Date', { x: 430, y: y - 10, size: 7, font: regular });
        y -= 25;
      } else {
        const writingHeight = formField.type === 'textarea' ? 33 : 16;
        page.drawRectangle({
          x: MARGIN + 16,
          y: y - writingHeight + 4,
          width: PAGE_WIDTH - MARGIN * 2 - 16,
          height: writingHeight,
          borderWidth: 0.5,
          borderColor: rgb(0.45, 0.49, 0.55),
        });
        y -= writingHeight + 7;
      }
    }
    y -= 6;
  }

  pages.forEach((current, index) => {
    current.drawRectangle({
      x: MARGIN,
      y: 708,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 48,
      borderWidth: 1,
      borderColor: rgb(0.15, 0.25, 0.4),
    });
    current.drawText('AG COMPOSITES — DESIGN CONTROL FORM', {
      x: MARGIN + 10,
      y: 740,
      size: 9,
      font: bold,
      color: rgb(0.08, 0.18, 0.32),
    });
    current.drawText(input.definition.title, {
      x: MARGIN + 10,
      y: 721,
      size: 13,
      font: bold,
    });
    current.drawText(
      `${input.documentNumber}  |  Revision ${input.documentRevision}  |  ${input.lifecycleStatus}`,
      {
        x: 340,
        y: 740,
        size: 8,
        font: bold,
      }
    );
    if (index === 0)
      current.drawImage(qr, { x: 510, y: 615, width: 54, height: 54 });
    current.drawText(`Template revision: ${input.templateRevisionId}`, {
      x: MARGIN,
      y: 50,
      size: 7,
      font: regular,
    });
    current.drawText(
      `Generated: ${fixedDate.toISOString()}  |  ${stableRevisionUrl}`,
      {
        x: MARGIN,
        y: 39,
        size: 7,
        font: regular,
      }
    );
    current.drawText(input.definition.identification.footerText, {
      x: MARGIN,
      y: 28,
      size: 7,
      font: bold,
    });
    current.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: 520,
      y: 28,
      size: 7,
      font: bold,
    });
  });

  return Buffer.from(
    await pdf.save({ useObjectStreams: false, addDefaultPage: false })
  );
}
