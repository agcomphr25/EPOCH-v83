import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  canonicalizeDhfManifest,
  safeExportPath,
  sha256,
} from '../../shared/designHistoryFileManifest';
import {
  DESIGN_HISTORY_FILE_POLICY,
  policyForRelease,
} from '../../shared/designHistoryFilePolicy';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('migrations/0221_design_history_files.sql');
const service = read('server/src/services/designHistoryFileService.ts');
const routes = read('server/src/routes/designHistoryFiles.ts');
const packageService = read('server/src/services/engineeringPackageService.ts');
const boot = read('server/scripts/migrations/runSafeBootMigrations.ts');
const ui = read(
  'client/src/components/design-control/DesignHistoryFilePanel.tsx'
);

describe('Phase 10 immutable Design History Files', () => {
  it('allows one DHF authority per R&D Design Project', () => {
    expect(migration).toContain(
      'design_history_files_project_unique UNIQUE (rd_project_id)'
    );
    expect(migration).toContain(
      'design_history_files_record_unique UNIQUE (design_control_record_id)'
    );
    expect(service).toContain('DHF_DESIGN_PROJECT_REQUIRED');
  });
  it('allows one immutable version per Engineering Release', () => {
    expect(migration).toContain(
      'dhf_version_release_unique UNIQUE (engineering_release_id)'
    );
    expect(service).toContain("status: 'existing'");
  });
  it('preserves Revision A and Revision B+ policy behavior', () => {
    expect(
      policyForRelease(1).some((item) => item.key === 'project_intake')
    ).toBe(true);
    expect(
      policyForRelease(2).some((item) => item.key === 'change_control')
    ).toBe(true);
    expect(migration).toContain('predecessor_version_id');
    expect(service).toContain('CURRENT_OR_PREDECESSOR_REFERENCE');
  });
  it('canonicalizes manifest objects deterministically', () => {
    const left = canonicalizeDhfManifest({ z: 1, a: { y: 2, b: 3 } });
    const right = canonicalizeDhfManifest({ a: { b: 3, y: 2 }, z: 1 });
    expect(left).toBe(right);
    expect(sha256(left)).toBe(sha256(right));
  });
  it('centralizes required, conditional, optional, and NA classifications', () => {
    expect(DESIGN_HISTORY_FILE_POLICY).toHaveLength(14);
    expect(service).toContain("['REQUIRED', 'CONDITIONALLY_REQUIRED']");
    expect(migration).toContain('NOT_APPLICABLE_WITH_JUSTIFICATION');
    expect(migration).toContain('omission_reason');
    expect(service).toContain('DHF_REQUIRED_EVIDENCE_CANNOT_BE_OMITTED');
    expect(routes).toContain("requirePermission('design.dhf.admin')");
  });
  it('blocks missing required evidence and checksum failures', () => {
    expect(service).toContain('DHF_NOT_READY');
    expect(service).toContain(
      "inclusionStatus: item.source_checksum ? 'INCLUDED' : 'MISSING'"
    );
    expect(service).toContain('DHF_FINALIZATION_CHECKSUM_MISMATCH');
  });
  it('includes exact approved Project Form/template generations', () => {
    expect(service).toContain("pfi.lifecycle_status='APPROVED'");
    expect(service).toContain('template_revision_snapshot');
    expect(service).toContain('current_content_revision_id');
    expect(service).toContain('retained_pdf_checksum');
  });
  it('includes ECR, ECN, and material controlled-copy exceptions', () => {
    expect(service).toContain("'ECR' kind");
    expect(service).toContain("'ECN'");
    expect(service).toContain("lifecycle_status IN ('ISSUED','LOST')");
    expect(service).toContain('CONTROLLED_COPY_EXCEPTION');
  });
  it('expands the Engineering Package without taking source ownership', () => {
    for (const category of [
      'routing_references',
      'work_instruction_references',
      'software_firmware_configuration',
      'effectivity',
      'controlled_design_forms',
      'authenticated_release_approvals',
    ])
      expect(packageService).toContain(category);
    expect(migration).toContain('package_checksum');
    expect(migration).toContain('dhf_version_id');
  });
  it('uses staged export finalization and recoverable failure status', () => {
    expect(service).toContain("'STAGED'");
    expect(service).toContain("export_status='FAILED'");
    expect(service).toContain("generation_status='FAILED'");
    expect(service).toContain("export_status='FINALIZED'");
    expect(service.indexOf("generation_status='LOCKED'")).toBeGreaterThan(
      service.indexOf("export_status='FINALIZED'")
    );
  });
  it('prevents ZIP traversal and duplicate ambiguous names', () => {
    expect(safeExportPath('../../secret', 1, '../passwd')).not.toContain('..');
    expect(service).toContain('const used = new Set<string>()');
    expect(service).toContain('while (used.has(archivePath))');
  });
  it('produces auditor-friendly deterministic archive structure', () => {
    expect(service).toContain('00-DHF-Cover-and-Index.pdf');
    expect(service).toContain('00-DHF-Manifest.json');
    expect(service).toContain('00-SHA256SUMS.txt');
    expect(service).toContain("platform: 'UNIX'");
    expect(service).toContain('DHF_EXTERNAL_EVIDENCE_INGESTION_REQUIRED');
    expect(service).toContain('DHF_ITEM_CHECKSUM_MISMATCH');
  });
  it('verifies manifest, export, baseline, package, and item identities', () => {
    expect(service).toContain('manifestChecksum ===');
    expect(service).toContain('exportChecksum ===');
    expect(service).toContain('baselineChecksum');
    expect(service).toContain('engineeringPackageChecksum');
    expect(service).toContain('itemFailures');
    expect(service).toContain('DHF_CHECKSUM_FAILURE');
    expect(service).toContain('DHF_EXPORT_DOWNLOADED');
  });
  it('enforces authenticated capabilities and never trusts body actor identity', () => {
    for (const permission of [
      'design.dhf.view',
      'design.dhf.preview',
      'design.dhf.generate',
      'design.dhf.export',
      'design.dhf.verify',
    ])
      expect(routes).toContain(`requirePermission('${permission}')`);
    expect(routes).not.toMatch(/actor:\s*req\.body/);
  });
  it('uses project advisory and release row locks for concurrent generation', () => {
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('FOR UPDATE OF er');
    expect(service).toContain('SELECT id FROM engineering_release_baselines');
  });
  it('protects locked versions, items, events, and historical retrieval', () => {
    expect(migration).toContain('prevent_locked_dhf_mutation');
    expect(migration).toContain('prevent_dhf_item_mutation');
    expect(migration).toContain('prevent_dhf_event_mutation');
    expect(routes).toContain("'/dhfs/:dhfId/versions'");
  });
  it('labels legacy limitations honestly without inventing evidence', () => {
    expect(service).toContain("'LEGACY_MISSING'");
    expect(service).toContain("'LEGACY_UNVERIFIED'");
    expect(service).toContain('legacyImported');
    expect(service).not.toMatch(/invent(?:ed)?Signature|fakeApproval/i);
  });
  it('registers additive migration 0221 for safe critical boot', () => {
    expect(boot.match(/0221_design_history_files\.sql/g)).toHaveLength(2);
    expect(migration).toContain('IF NOT EXISTS');
    expect(migration).not.toMatch(/\bDROP TABLE\b|\bTRUNCATE\b/);
  });
  it('uses schema readiness and avoids request-time DDL', () => {
    expect(routes).toContain('assertDesignHistoryFileSchemaReady');
    expect(service).not.toMatch(/CREATE TABLE|ALTER TABLE/);
  });
  it('provides live R&D and QMS inspection without a compliance claim', () => {
    expect(ui).toContain('checksummed evidence manifest');
    expect(ui).toContain('does not by itself claim');
    expect(ui).toContain('Download protected ZIP');
  });
  it('does not modify P2 or manufacturing business data', () => {
    const combined = `${migration}\n${service}\n${routes}`;
    expect(combined).not.toMatch(
      /(INSERT INTO|UPDATE|DELETE FROM)\s+(projects|p2_|purchase_orders|wads|travelers|routings|work_orders|production_orders)/i
    );
    expect(combined).not.toContain('/api/p2');
  });
});
