import crypto from 'crypto';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';

import type { DesignControlFormDefinition } from '../../../shared/designControlFormCatalog';
import { canonicalizeProjectFormContent } from '../../../shared/projectFormValidation';

export const PROJECT_FORM_PDF_RENDERER_VERSION =
  'design-control-project-form/1';

export type CompletedProjectFormPdfInput = {
  instanceId: string;
  instanceNumber: string;
  projectId: string;
  projectName: string;
  recordNumber: string;
  stepKey: string;
  contentRevision: number;
  definition: DesignControlFormDefinition;
  documentNumber: string;
  documentRevision: string;
  lifecycleStatus: string;
  content: Record<string, unknown>;
  approvals: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  generatedAt: Date;
  controlled: boolean;
};

export const sha256ProjectFormBuffer = (buffer: Buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');

const linesForContent = (value: unknown, prefix = ''): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      linesForContent(item, `${prefix}${prefix ? '.' : ''}${index + 1}`)
    );
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, item]) =>
        linesForContent(item, `${prefix}${prefix ? '.' : ''}${key}`)
    );
  }
  return [`${prefix}: ${String(value ?? '')}`];
};

export async function renderCompletedProjectFormPdf(
  input: CompletedProjectFormPdfInput
) {
  const pdf = await PDFDocument.create();
  const fixedDate = new Date(input.generatedAt.toISOString());
  pdf.setTitle(`${input.instanceNumber} ${input.definition.title}`);
  pdf.setSubject(
    `Design Project form content revision ${input.contentRevision}`
  );
  pdf.setCreator('EPOCH Design Control');
  pdf.setProducer(PROJECT_FORM_PDF_RENDERER_VERSION);
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const stableUrl = `/api/project-forms/${input.instanceId}`;
  const qr = await pdf.embedPng(
    await QRCode.toBuffer(stableUrl, {
      type: 'png',
      margin: 0,
      width: 96,
      errorCorrectionLevel: 'M',
    })
  );
  const pages: PDFPage[] = [];
  let page = pdf.addPage([612, 792]);
  pages.push(page);
  let y = 665;

  const nextPage = () => {
    page = pdf.addPage([612, 792]);
    pages.push(page);
    y = 665;
  };
  const write = (text: string, strong = false, indent = 0) => {
    if (y < 78) nextPage();
    page.drawText(text.slice(0, 112), {
      x: 42 + indent,
      y,
      size: strong ? 10 : 8,
      font: strong ? bold : regular,
      color: rgb(0.1, 0.14, 0.2),
    });
    y -= strong ? 16 : 12;
  };

  write('Project and controlled-form identity', true);
  write(`Project: ${input.projectId} — ${input.projectName}`, false, 8);
  write(`Design Control record: ${input.recordNumber}`, false, 8);
  write(`Step: ${input.stepKey}`, false, 8);
  write(`Form instance: ${input.instanceNumber}`, false, 8);
  write(`Content revision: ${input.contentRevision}`, false, 8);
  y -= 8;
  write('Completed form content', true);
  for (const line of linesForContent(input.content)) write(line, false, 8);
  y -= 8;
  write('Authenticated approvals', true);
  for (const approval of input.approvals) {
    write(
      `${approval.approvalKey ?? approval.approval_key}: ${approval.decision} — ${approval.actorDisplayNameSnapshot ?? approval.actor_display_name_snapshot ?? ''}`,
      false,
      8
    );
  }
  y -= 8;
  write('Attached evidence', true);
  for (const attachment of input.attachments) {
    write(
      `${attachment.originalFilename ?? attachment.original_filename} (${attachment.sha256Checksum ?? attachment.sha256_checksum})`,
      false,
      8
    );
  }

  const contentIdentity = crypto
    .createHash('sha256')
    .update(canonicalizeProjectFormContent(input.content))
    .digest('hex');

  pages.forEach((current, index) => {
    current.drawRectangle({
      x: 42,
      y: 704,
      width: 528,
      height: 54,
      borderWidth: 1,
      borderColor: rgb(0.08, 0.2, 0.36),
    });
    current.drawText('AG COMPOSITES — DESIGN CONTROL PROJECT FORM', {
      x: 52,
      y: 741,
      size: 9,
      font: bold,
    });
    current.drawText(input.definition.title, {
      x: 52,
      y: 719,
      size: 13,
      font: bold,
    });
    current.drawText(
      `${input.documentNumber} Rev ${input.documentRevision} | ${input.lifecycleStatus}`,
      { x: 350, y: 741, size: 8, font: bold }
    );
    if (index === 0) {
      current.drawImage(qr, { x: 510, y: 620, width: 54, height: 54 });
    }
    current.drawText(
      input.controlled
        ? input.definition.identification.footerText
        : 'UNCONTROLLED WHEN PRINTED',
      { x: 42, y: 30, size: 8, font: bold }
    );
    current.drawText(
      `Generated ${fixedDate.toISOString()} | ${stableUrl} | Content ${contentIdentity.slice(0, 12)}`,
      { x: 42, y: 44, size: 7, font: regular }
    );
    current.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: 520,
      y: 30,
      size: 7,
      font: bold,
    });
  });

  return Buffer.from(
    await pdf.save({ useObjectStreams: false, addDefaultPage: false })
  );
}
