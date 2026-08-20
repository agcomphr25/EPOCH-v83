import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import {
  generateBlankRfqRiskAssessmentPdf,
  generateRfqRiskAssessmentPdf,
} from '../src/services/blankRfqRiskAssessmentPdf';

describe('blank RFQ risk assessment PDF', () => {
  it('produces the original compact one-page printable form', async () => {
    const bytes = await generateBlankRfqRiskAssessmentPdf();
    const original = fs.readFileSync(
      path.resolve(process.cwd(), 'attached_assets/RFQ Risk Assessment (1)_1753459211571.pdf')
    );
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(3_000);
    expect(Buffer.from(bytes).equals(original)).toBe(false);
  });

  it('uses the same one-page form for a completed assessment', async () => {
    const bytes = await generateRfqRiskAssessmentPdf({
      rfqNumber: 'AEV260017',
      formData: {
        trainedStaff: 'low',
        equipmentRequirements: 'medium',
        internalSubtotal: 1,
        externalSubtotal: 0,
        mitigationActionA: 'Cross-train an additional operator',
        printedName: 'Glenn Jones',
        date: '08/19/2026',
      },
      totalOverallPoints: 1,
      adjustedRiskLevel: 1,
      riskDetermination: 'Low Risk',
      bidDecision: 'accept',
    });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
  });

  it('routes blank print and export through the PDF endpoint instead of browser page printing', () => {
    const page = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/RFQRiskAssessment.tsx'), 'utf8');
    const routes = fs.readFileSync(path.resolve(process.cwd(), 'server/src/routes/customers.ts'), 'utf8');
    expect(page).not.toContain('window.print()');
    expect(page).toContain("'/api/customers/rfq-assessments/blank/pdf'");
    expect(page).toContain('onClick={handleViewPdf}');
    expect(routes).toContain("router.get('/rfq-assessments/blank/pdf'");
    expect(routes).toContain('generateRfqRiskAssessmentPdf(assessment as any)');
    expect(routes.indexOf("router.get('/rfq-assessments/blank/pdf'")).toBeLessThan(
      routes.indexOf("router.get('/rfq-assessments/:id/pdf'")
    );
  });
});
