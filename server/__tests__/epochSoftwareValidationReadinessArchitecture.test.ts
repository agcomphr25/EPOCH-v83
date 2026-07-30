import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const route = read('server/src/routes/epochSoftwareValidation.ts');
const migration = read(
  'migrations/0234_epoch_validation_readiness_controls.sql'
);
const ui = read('client/src/pages/EpochSoftwareValidationPage.tsx');
const safeBoot = read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('EPOCH validation package-readiness architecture', () => {
  it('adds only additive readiness metadata without rewriting existing packages', () => {
    expect(migration).toContain('ALTER TABLE qms_epoch_validation_packages');
    expect(migration).not.toMatch(
      /\b(?:UPDATE|DELETE FROM|INSERT INTO)\s+qms_epoch_validation_packages\b/i
    );
    expect(migration).not.toContain('0229_epoch_software_validation');
    expect(
      safeBoot.match(/0234_epoch_validation_readiness_controls\.sql/g)?.length
    ).toBeGreaterThanOrEqual(2);
  });

  it('uses active employee and authoritative assessment sources', () => {
    expect(route).toContain(
      'FROM employees WHERE id=ANY($1::int[]) AND is_active=true'
    );
    expect(route).toContain('qms_audit_readiness_assessments');
    expect(route).toContain("error:'INACTIVE_EMPLOYEE_ASSIGNMENT'");
    expect(route).toContain(
      "router.post('/:id/audit-readiness-na',requirePermission('EPOCH_VALIDATION_FINAL_APPROVE')"
    );
  });

  it('requires authenticated confirmations and invalidates stale deployment confirmation', () => {
    expect(route).toContain(
      "router.post('/:id/confirm-deployment-date',requirePermission('EPOCH_VALIDATION_EDIT')"
    );
    expect(route).toContain(
      "router.post('/:id/confirm-environment-separation',requirePermission('EPOCH_VALIDATION_EDIT')"
    );
    expect(route).toContain(
      'deployment_date_confirmed=CASE WHEN $19 THEN false'
    );
    expect(route).toContain('DEPLOYMENT_DATE_CONFIRMED');
    expect(route).toContain('ENVIRONMENT_SEPARATION_CONFIRMED');
  });

  it('blocks execution and final approval on incomplete package or protocol evidence', () => {
    expect(route).toContain("error:'PACKAGE_EXECUTION_READINESS_BLOCKED'");
    expect(route).toContain("error:'PACKAGE_FINAL_READINESS_BLOCKED'");
    expect(route).toContain("error:'PROTOCOL_EXECUTION_OR_REVIEW_INCOMPLETE'");
    expect(route).toContain(
      "e.overall_result IN ('PASSED','PASSED_WITH_APPROVED_DEVIATION')"
    );
    expect(route).toContain('snapshot_checksum IS NOT NULL');
  });

  it('exposes actionable readiness UI with the required production identifier guidance', () => {
    expect(ui).toContain('Package readiness');
    expect(ui).toContain('Edit package readiness');
    expect(ui).toContain(
      'Production commit SHA, release tag, or deployment identifier'
    );
    expect(ui).toContain('A PR number alone is not sufficient.');
    expect(ui).toContain('Confirm deployment date');
    expect(ui).toContain('Confirm environment separation');
  });
});
