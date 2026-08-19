import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { generatePurchaseReviewChecklistPdf } from '../src/services/purchaseReviewChecklistPdf';

describe('Purchase Review Checklist PDF', () => {
  it('generates a compact four-page blank printable checklist', async () => {
    const bytes = await generatePurchaseReviewChecklistPdf();
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(4);
    expect(bytes.byteLength).toBeGreaterThan(6_000);
  });

  it('uses the same generator for a saved checklist', async () => {
    const bytes = await generatePurchaseReviewChecklistPdf({
      customerName: 'Example Customer',
      poNumber: 'PO-100',
      existingCustomer: 'Y',
      certifications: ['Certificate of Conformance', 'Material certifications'],
      reviewerName: 'Reviewer',
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(4);
  });

  it('routes print and export to blank or saved PDFs instead of printing the React page', () => {
    const page = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/PurchaseReviewChecklist.tsx'), 'utf8');
    const routes = fs.readFileSync(path.resolve(process.cwd(), 'server/src/routes/forms.ts'), 'utf8');
    expect(page).not.toContain('window.print()');
    expect(page).toContain("'/api/forms/purchase-review-checklists/blank/pdf'");
    expect(page).toContain('`/api/forms/purchase-review-checklists/${submissionId}/pdf`');
    expect(routes).toContain("router.get('/purchase-review-checklists/blank/pdf'");
    expect(routes).toContain("router.get('/purchase-review-checklists/:id/pdf'");
  });
});
