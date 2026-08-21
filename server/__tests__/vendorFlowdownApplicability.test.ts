import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { runMigrationSafetyCheck } from '../utils/migrationSafetyCheck';
import { generateVendorFlowdownExhibitPdf } from '../utils/pdf/vendorFlowdownExhibitPdf';
import { criticalMigrationFiles, safeMigrationFiles } from '../scripts/migrations/runSafeBootMigrations';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('guided vendor PO flowdown applicability', () => {
  const migration = read('migrations/0286_vendor_po_flowdown_applicability.sql');
  const service = read('server/src/services/flowdownApplicabilityService.ts');
  const client = read('client/src/components/inventory/VendorFlowdownReview.tsx');

  it('uses an additive migration and seeds a controlled starter library', () => {
    expect(() => runMigrationSafetyCheck(migration, '0286_vendor_po_flowdown_applicability.sql')).not.toThrow();
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS vendor_po_flowdown_assessments/i);
    expect(migration).toContain("'252.244-7000'");
    expect(migration).toContain("'252.204-7012'");
    expect(safeMigrationFiles).toContain('0286_vendor_po_flowdown_applicability.sql');
    expect(criticalMigrationFiles).toContain('0286_vendor_po_flowdown_applicability.sql');
  });

  it('shows a retryable error instead of an endless loading state', () => {
    expect(client).toContain('workspace.isError');
    expect(client).toContain('Retry review');
    expect(client).toContain('This normally takes only a few seconds.');
    expect(client).toContain('Supporting documents are optional');
  });

  it('preserves human decisions and suppresses vendor disclosure of the internal contract reference', () => {
    expect(service).toContain('discloseContractReference: false');
    expect(service).toContain("decision: row.decision");
    expect(client).toContain('internalContractReference');
    expect(client).toContain('is not printed on the supplier exhibit');
  });

  it('generates a valid tailored exhibit without the internal customer contract number', async () => {
    const bytes = await generateVendorFlowdownExhibitPdf({
      po: { id: 77, poNumber: 'VPO-77', vendorId: 4, vendorName: 'Test Supplier' },
      assessment: { procurementClass: 'COMMERCIAL_PRODUCT', exhibitRevision: 1, internalContractReference: 'SECRET-PRIME-123' },
      clauses: [{
        clauseNumber: '52.204-25', title: 'Covered Telecommunications Prohibition', regulation: 'FAR',
        inclusionMethod: 'SUBSTANCE', officialUrl: 'https://www.acquisition.gov/far/52.204-25',
        savedDecision: 'INCLUDE', decisionReason: 'Required for this Government-supported purchase.',
      }],
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(Buffer.from(bytes).toString('latin1')).not.toContain('SECRET-PRIME-123');
  });
});
