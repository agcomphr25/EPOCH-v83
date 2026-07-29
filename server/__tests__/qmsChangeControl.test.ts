import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..', '..');
const migration = readFileSync(
  path.join(root, 'migrations', '0230_qms_change_control_register.sql'),
  'utf8'
);
const routes = readFileSync(
  path.join(root, 'server', 'src', 'routes', 'changeControl.ts'),
  'utf8'
);
const service = readFileSync(
  path.join(root, 'server', 'src', 'services', 'changeControlService.ts'),
  'utf8'
);
const page = readFileSync(
  path.join(root, 'client', 'src', 'pages', 'QMSChangeControlPage.tsx'),
  'utf8'
);

describe('QMS Change Control architecture', () => {
  it('keeps native ECR and ECN records as the workflow spine', () => {
    expect(migration).toContain(
      'ecr_id uuid UNIQUE REFERENCES engineering_change_requests'
    );
    expect(migration).toContain(
      'ecn_id uuid UNIQUE REFERENCES engineering_change_orders'
    );
    expect(service).toContain('createEcr(');
    expect(service).not.toMatch(
      /INSERT INTO engineering_change_request_approvals/
    );
    expect(service).not.toMatch(
      /INSERT INTO engineering_change_notice_approvals/
    );
  });

  it('separates immutable historical approvals from electronic signatures', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS change_control_historical_approvals'
    );
    expect(migration).toContain(
      'change_control_historical_approvals_immutable'
    );
    expect(service).toContain(
      'Historical approval evidence; not an EPOCH electronic signature'
    );
    expect(page).toContain('These are not EPOCH electronic approvals.');
  });

  it('requires server-side capabilities for sensitive actions', () => {
    for (const [routeFragment, capability] of [
      ["'/change-control'", 'qms.change_control.view'],
      ["'/change-control/native'", 'qms.change_control.create'],
      ["'/change-control/import/preview'", 'qms.change_control.import'],
      ["'/change-control/import/commit'", 'qms.change_control.import'],
      ["'/change-control/import/individual'", 'qms.change_control.import'],
    ]) {
      expect(routes).toContain(routeFragment);
      expect(routes).toContain(`requirePermission('${capability}')`);
    }
  });

  it('previews duplicates and rejects bulk commit before any transaction', () => {
    expect(service).toContain('Duplicate original/change number');
    expect(service).toContain('BULK_IMPORT_VALIDATION_FAILED');
    expect(service.indexOf("preview.some((row) => !row.valid)")).toBeLessThan(
      service.indexOf("await client.query('BEGIN')")
    );
    expect(service).toContain("await client.query('ROLLBACK')");
  });

  it('stores normalized links and immutable checksum evidence', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS change_control_record_links'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS change_control_evidence'
    );
    expect(migration).toContain('sha256_checksum text NOT NULL');
    expect(migration).toContain('change_control_evidence_immutable');
    expect(service).toContain("createHash('sha256')");
  });

  it('blocks controlled-document release when the linked change is unapproved', () => {
    expect(migration).toContain(
      'controlled_document_change_disposition_check'
    );
    expect(migration).toContain(
      'controlled_document_change_release_gate'
    );
    expect(migration).toContain(
      "r.status NOT IN (\n            'APPROVED'"
    );
    expect(service).toContain('DOCUMENT_REVISION_DISPOSITION_REQUIRED');
  });

  it('makes historical provenance permanently visible in the register', () => {
    expect(page).toContain('Historical / Imported');
    expect(page).toContain('not originally controlled by EPOCH');
    expect(migration).toContain(
      "source IN ('IMPORTED_HISTORICAL','EPOCH_NATIVE')"
    );
  });
});
