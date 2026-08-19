import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { generateBlankRfqRiskAssessmentPdf } from '../src/services/blankRfqRiskAssessmentPdf';

describe('blank RFQ risk assessment PDF', () => {
  it('produces a compact two-page printable form', async () => {
    const bytes = await generateBlankRfqRiskAssessmentPdf();
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(2);
    expect(bytes.byteLength).toBeGreaterThan(4_000);
  });

  it('routes blank print and export through the PDF endpoint instead of browser page printing', () => {
    const page = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/RFQRiskAssessment.tsx'), 'utf8');
    const routes = fs.readFileSync(path.resolve(process.cwd(), 'server/src/routes/customers.ts'), 'utf8');
    expect(page).not.toContain('window.print()');
    expect(page).toContain("'/api/customers/rfq-assessments/blank/pdf'");
    expect(page).toContain('onClick={handleViewPdf}');
    expect(routes).toContain("router.get('/rfq-assessments/blank/pdf'");
    expect(routes.indexOf("router.get('/rfq-assessments/blank/pdf'")).toBeLessThan(
      routes.indexOf("router.get('/rfq-assessments/:id/pdf'")
    );
  });
});
