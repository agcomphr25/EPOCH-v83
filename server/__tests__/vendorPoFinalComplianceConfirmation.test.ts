import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';

const migrationName = '0292_vendor_po_final_compliance_confirmation.sql';
const routeSource = fs.readFileSync(
  path.resolve(process.cwd(), 'server/src/routes/vendorPOs.ts'),
  'utf8'
);
const storageSource = fs.readFileSync(
  path.resolve(process.cwd(), 'server/storage.ts'),
  'utf8'
);
const uiSource = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'client/src/components/inventory/VendorPOManager.tsx'
  ),
  'utf8'
);

describe('vendor PO final compliance confirmation', () => {
  it('deploys the nullable confirmation fields as a critical safe migration', () => {
    expect(safeMigrationFiles).toContain(migrationName);
    expect(criticalMigrationFiles).toContain(migrationName);

    const sql = fs.readFileSync(
      path.resolve(process.cwd(), 'migrations', migrationName),
      'utf8'
    );
    expect(sql).toContain('issue_dpas_rated boolean');
    expect(sql).toContain('issue_flowdowns_required boolean');
    expect(sql).not.toContain('issue_dpas_rated boolean NOT NULL DEFAULT false');
  });

  it('requires both explicit answers and a rating when DPAS applies', () => {
    expect(routeSource).toContain('issueComplianceConfirmationSchema');
    expect(routeSource).toContain("error: 'Final compliance confirmation required'");
    expect(routeSource).toContain("error: 'DPAS rating required'");
  });

  it('requires an approved review with an included clause when flowdowns apply', () => {
    expect(routeSource).toContain("flowdownAssessment?.reviewStatus !== 'APPROVED'");
    expect(routeSource).toContain("eq(vendorPoFarFlowdowns.decision, 'INCLUDE')");
    expect(routeSource).toContain("error: 'Included flowdown required'");
  });

  it('persists confirmation evidence atomically with issuance', () => {
    expect(storageSource).toContain(
      'issueDpasRated: opts.complianceConfirmation.dpasRated'
    );
    expect(storageSource).toContain(
      'issueFlowdownsRequired: opts.complianceConfirmation.flowdownsRequired'
    );
    expect(storageSource).toContain(
      'issueComplianceConfirmedAt: opts.complianceConfirmation.confirmedAt'
    );
    expect(routeSource).toContain('meta: { poNumber, issuedWithoutEmail: false, complianceConfirmation }');
    expect(routeSource).toContain('meta: { poNumber, issuedWithoutEmail: true, complianceConfirmation }');
  });

  it('shows mandatory controls in the shared issue modal for email and internal issuance', () => {
    expect(uiSource).toContain('data-testid="select-issue-dpas-rated"');
    expect(uiSource).toContain('data-testid="input-issue-dpas-rating"');
    expect(uiSource).toContain('data-testid="select-issue-flowdowns-required"');
    expect(uiSource).toContain('complianceConfirmation: {');
    expect(uiSource.match(/!issueDpasDecision/g)?.length).toBeGreaterThanOrEqual(2);
    expect(uiSource.match(/!issueFlowdownDecision/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
