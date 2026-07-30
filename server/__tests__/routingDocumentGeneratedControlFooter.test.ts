import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('generated template document configuration-control footer', () => {
  const renderer = readFileSync(
    join(process.cwd(), 'server/src/lib/partSpecificationSheetPdf.ts'),
    'utf8'
  );

  it('permanently stamps the MDR control identity into every generated PDF page', () => {
    expect(renderer).toContain('await PDFDocument.load(generatedPdf)');
    expect(renderer).toContain('pages.forEach((page, index)');
    expect(renderer).toContain(
      '${input.documentNumber} | Rev ${input.revision'
    );
    expect(renderer).toContain('${input.status');
    expect(renderer).toMatch(
      /Page \$\{index \+ 1\} of \$\{\s*pages\.length\s*\}/
    );
    expect(renderer).toContain('Configuration Controlled');
    expect(renderer).toContain('Uncontrolled When Printed');
  });

  it('finishes the controlled PDF before it is sent to central storage', () => {
    expect(renderer).toContain(
      'return Buffer.from(await controlledPdf.save())'
    );
  });
});
