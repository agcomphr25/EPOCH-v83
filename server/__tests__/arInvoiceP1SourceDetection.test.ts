import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AR invoice P1 source detection', () => {
  const source = readFileSync(
    join(process.cwd(), 'server/src/routes/arInvoices.ts'),
    'utf8',
  );

  it('classifies P1 PO invoices by production line, not only OEM packing-slip notes', () => {
    expect(source).toContain("UPPER(COALESCE(ail.production_line, '')) = 'P1'");
    expect(source).toContain("UPPER(COALESCE(${arInvoiceLines.productionLine}, '')) = 'P1'");
  });

  it('preserves existing line source tags when editable P1 invoice lines are saved', () => {
    expect(source).toContain('const existingLinesById = new Map');
    expect(source).toContain('existingLine?.dimensionTags');
    expect(source).toContain('...(line.dimensionTags || {})');
    expect(source).not.toContain('if (!isP1Invoice && lines && Array.isArray(lines))');
  });
});
