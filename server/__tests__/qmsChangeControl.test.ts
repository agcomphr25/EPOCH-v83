import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..', '..');
const migration = readFileSync(
  path.join(root, 'migrations', '0230_qms_change_control_register.sql'),
  'utf8'
);
const qualityActionMigration = readFileSync(
  path.join(root, 'migrations', '0231_quality_action_change_control.sql'),
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
const legacyRoutes = readFileSync(
  path.join(root, 'server', 'src', 'routes', 'index.ts'),
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

  it('does not apply Change Control schema readiness to unrelated API routes', () => {
    expect(routes).toContain(
      "router.use('/change-control', authenticate, readiness)"
    );
    expect(routes).toContain(
      "router.use('/change-control-dashboard', authenticate, readiness)"
    );
    expect(routes).not.toContain('router.use(authenticate, readiness)');
  });

  it('previews duplicates and rejects bulk commit before any transaction', () => {
    expect(service).toContain('Duplicate original/change number');
    expect(service).toContain('BULK_IMPORT_VALIDATION_FAILED');
    const bulkImport = service.slice(
      service.indexOf('export async function importHistoricalRows'),
      service.indexOf('export async function', service.indexOf('export async function importHistoricalRows') + 1),
    );
    expect(bulkImport.indexOf("preview.some((row) => !row.valid)")).toBeLessThan(
      bulkImport.indexOf("await client.query('BEGIN')")
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

  it('projects NCR, CAR, and PCR without replacing their authoritative records', () => {
    expect(qualityActionMigration).toContain('sync_ncr_quality_action_register');
    expect(qualityActionMigration).toContain('sync_car_quality_action_register');
    expect(qualityActionMigration).toContain('sync_pcr_quality_action_register');
    expect(qualityActionMigration).toContain("'NCR',n.id::text");
    expect(qualityActionMigration).toContain("'CAR',c.id::text");
    expect(qualityActionMigration).toContain("'PCR',p.id::text");
  });

  it('keeps assessment, approval, audit, and relationship evidence immutable', () => {
    expect(qualityActionMigration).toContain('assessment_answers_no_update');
    expect(qualityActionMigration).toContain('pcr_approval_immutable');
    expect(qualityActionMigration).toContain('pcr_audit_immutable');
    expect(qualityActionMigration).toContain('change_control_links_no_update');
  });

  it('exposes controlled PCR implementation and verification endpoints', () => {
    expect(routes).toContain("'/change-control/pcrs/:pcrId/authorize-implementation'");
    expect(routes).toContain("'/change-control/pcrs/:pcrId/complete-implementation'");
    expect(routes).toContain("'/change-control/pcrs/:pcrId/verify'");
    expect(routes).toContain("'/change-control/pcrs/:pcrId/close'");
    expect(service).toContain('PCR_IMPLEMENTATION_GATE_BLOCKED');
    expect(service).toContain('PCR_VERIFICATION_RESULTS_REQUIRED');
    expect(legacyRoutes).toContain('LEGACY_PCR_DECISION_DISABLED');
    expect(legacyRoutes).toContain('LEGACY_PCR_MUTATION_DISABLED');
  });
});
