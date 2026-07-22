import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('generated template document configuration-control footer', () => {
  const source = readFileSync(join(process.cwd(), 'server/src/routes/routingDocuments.ts'), 'utf8');
  const start = source.indexOf('async function renderSpecSheetPdf');
  const end = source.indexOf('async function saveSpecSheetPdfFile', start);
  const renderer = source.slice(start, end);

  it('permanently stamps the MDR control identity into every generated PDF page', () => {
    expect(renderer).toContain('await PDFDocument.load(generatedPdf)');
    expect(renderer).toContain('for (const page of controlledPdf.getPages())');
    expect(renderer).toContain('Doc #: ${input.documentNumber}');
    expect(renderer).toContain('Revision: 1.0');
    expect(renderer).toContain('Configuration Controlled');
  });

  it('finishes the controlled PDF before it is sent to central storage', () => {
    expect(renderer).toContain('return Buffer.from(await controlledPdf.save())');
  });
});
