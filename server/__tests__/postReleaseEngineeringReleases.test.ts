import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('migrations/0216_post_release_design_change_gating.sql');
const service = read(
  'server/src/services/postReleaseEngineeringReleaseService.ts'
);
const routes = read('server/src/routes/postReleaseEngineeringReleases.ts');
const schemaReadiness = read(
  'server/src/services/postReleaseSchemaReadiness.ts'
);
const initialReleaseService = read(
  'server/src/services/engineeringReleaseService.ts'
);
const boot = read('server/scripts/migrations/runSafeBootMigrations.ts');
const ui = read(
  'client/src/components/design-control/PostReleaseChangePanel.tsx'
);

describe('Phase 8 post-release Engineering Release gating', () => {
  it('keeps Revision A independent of ECR and ECN', () => {
    expect(service).toContain(
      "releaseType: predecessor ? 'CHANGE_RELEASE' : 'INITIAL'"
    );
    expect(service).toContain('ready: !predecessor');
    expect(initialReleaseService).toContain("releaseType: 'INITIAL'");
    expect(initialReleaseService).toContain('releaseSequence: 1');
    expect(initialReleaseService).toContain(
      'Revision B+ must use the ECN-authorized'
    );
  });
  it('requires a direct predecessor for every change release', () => {
    expect(migration).toContain('predecessor_engineering_release_id');
    expect(migration).toContain(
      'engineering_releases_predecessor_successor_unique'
    );
  });
  it('binds approved ECR and ECN immutable identities', () => {
    for (const field of [
      'authorizing_ecr_revision_id',
      'authorizing_ecr_checksum',
      'authorizing_ecn_revision_id',
      'authorizing_ecn_checksum',
    ])
      expect(migration).toContain(field);
    expect(service).toContain('source_ecr_checksum !== ecr.approved_checksum');
  });
  it('enforces project, record, release, and baseline consistency', () => {
    expect(service).toContain('ECN ${label} does not match');
    expect(service).toContain(
      'ECR project, record, release, or baseline identity'
    );
  });
  it('uses monotonic sequence rather than alphabetical comparison', () => {
    expect(service).toContain('proposedSequence');
    expect(service).toContain('nextHumanRevision');
    expect(migration).toContain('engineering_releases_record_sequence_unique');
    expect(service).not.toMatch(/localeCompare.*proposedRevision/);
  });
  it('allocates under an advisory transaction lock', () => {
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain("await client.query('BEGIN')");
  });
  it('supports idempotent retry and rejects incompatible reuse', () => {
    expect(migration).toContain('engineering_releases_idempotency_unique');
    expect(service).toContain('idempotentReplay: true');
    expect(service).toContain('IDEMPOTENCY_KEY_REUSE_CONFLICT');
  });
  it('reopens only ECN-targeted steps and preserves predecessors', () => {
    expect(service).toContain('i.reopen_required=true');
    expect(migration).toContain('predecessor_generation_id');
    expect(service).not.toMatch(/for \(let .*<= 12/);
  });
  it('invalidates approvals without deleting them', () => {
    expect(service).toContain("SET status='INVALIDATED'");
    expect(service).not.toMatch(/DELETE FROM design_control_step_approvals/);
  });
  it('requires current generation forms or an approved justification', () => {
    expect(migration).toContain('form_revision_not_required');
    expect(migration).toContain('form_reuse_justification');
    expect(service).toContain('form_reuse_approval_id');
  });
  it('rejects legacy approval booleans', () => {
    expect(service).toContain('design_control_step_approvals');
    expect(service).not.toMatch(/step\.approvals|approval booleans/);
  });
  it('requires Step 12 authenticated approval', () => {
    expect(service).toContain("s.step_key='12'");
    expect(service).toContain('Step 12 Engineering Release Gate generation');
  });
  it('gates actions, V&V, effectivity, items, and retained ECN evidence', () => {
    for (const evidence of [
      'implementation action',
      'Required V&V',
      'effectivity_method',
      'affected item',
      'retained_form_checksum',
    ])
      expect(service).toContain(evidence);
  });
  it('uses one readiness service for preview and transaction execution', () => {
    expect(routes).toContain('computeChangeReleaseReadiness');
    expect(
      service.match(/computeChangeReleaseReadiness/g)?.length
    ).toBeGreaterThan(1);
  });
  it('creates release, baseline, evidence, link, and close in one transaction', () => {
    for (const table of [
      'engineering_releases',
      'engineering_release_baselines',
      'engineering_release_baseline_items',
      'engineering_release_change_evidence',
    ])
      expect(service).toContain(`INSERT INTO ${table}`);
    expect(service).toContain("status='closed'");
    expect(service).toContain("await client.query('ROLLBACK')");
  });
  it('captures predecessor, ECR, ECN, steps, forms, V&V, effectivity, and manufacturing references', () => {
    for (const category of [
      'predecessor_release',
      'authorizing_ecr',
      'authorizing_ecn',
      'affected_steps',
      'project_forms_approvals',
      'ecn_actions_vv_items',
      'effectivity',
      'manufacturing_evidence_references',
    ])
      expect(service).toContain(category);
  });
  it('protects released evidence at database level', () => {
    expect(
      migration.match(/BEFORE UPDATE OR DELETE/g)?.length
    ).toBeGreaterThanOrEqual(4);
    expect(migration).toContain('Released Phase 8 evidence is immutable');
  });
  it('is additive, idempotent, and safe-boot registered', () => {
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE/);
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS');
    expect(
      boot.match(/0216_post_release_design_change_gating\.sql/g)
    ).toHaveLength(2);
  });
  it('has schema readiness and no request-time DDL', () => {
    expect(schemaReadiness).toContain('POST_RELEASE_CHANGE_SCHEMA_NOT_READY');
    expect(routes).not.toMatch(/CREATE TABLE|ALTER TABLE/);
  });
  it('never accepts actor identity from request bodies', () => {
    expect(routes).not.toMatch(/req\.body\.(actor|user|username|releasedBy)/);
    expect(routes).toContain('actor(req)');
  });
  it('enforces release-role segregation and durable rollback evidence', () => {
    expect(service).toContain('ENGINEERING_RELEASE_SEGREGATION_REQUIRED');
    expect(service).toContain('performed_vv');
    expect(service).toContain('quality_approved');
    expect(service).toContain("'ROLLED_BACK'");
    expect(service).toContain("await client.query('ROLLBACK')");
  });
  it('exposes authoritative readiness, release, baseline, and authorization APIs', () => {
    for (const endpoint of [
      "'/readiness'",
      "'/:id'",
      "'/:id/baseline'",
      "'/:id/change-authorization'",
      "'/ecns/:ecnId/release-readiness'",
      "'/ecns/:ecnId/create-engineering-release'",
    ])
      expect(routes).toContain(endpoint);
  });
  it('provides R&D/QMS readiness and receipt UI', () => {
    expect(ui).toContain('Create Engineering Release');
    expect(ui).toContain('Compare predecessor');
    expect(ui).toContain('QMS oversight');
    expect(ui).toContain('release_checksum');
  });
  it('does not mutate P2, production, inventory, or manufacturing sources', () => {
    expect(service).not.toMatch(
      /(INSERT INTO|UPDATE|DELETE FROM)\s+(projects|p2_|purchase|inventory|travel|work_order|routing|production)/i
    );
  });
  it('does not implement controlled copies, DHF export, or package expansion', () => {
    expect(service).not.toMatch(
      /controlled.?copy|DHF|generateEngineeringPackage/i
    );
    expect(service).toContain('fullEngineeringPackageExpansion: false');
    expect(service).toContain('INSERT INTO engineering_packages');
    expect(migration).not.toMatch(/controlled.?copy|DHF/i);
  });
});
