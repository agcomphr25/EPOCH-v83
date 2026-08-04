import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const route = read('server/src/routes/epochSoftwareValidation.ts');
const decisionService = read(
  'server/src/services/epochValidationResponsibilityDecision.ts'
);
const compactRoute = route.replace(/\s+/g, '');
const migration = read('migrations/0250_epoch_validation_wizard_phase1.sql');
const safeBoot = read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('EPOCH validation wizard Phase 1 architecture', () => {
  it('adds revision-linked intended-use functions without rewriting existing records', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS qms_epoch_validation_intended_use_functions'
    );
    expect(migration).toContain(
      'intended_use_revision_id uuid NOT NULL REFERENCES qms_epoch_validation_intended_use_revisions(id)'
    );
    expect(migration).toContain('qms_esv_intended_function_complete');
    expect(migration).not.toMatch(/UPDATE\s+qms_epoch_validation_packages/i);
    expect(migration).not.toMatch(
      /INSERT\s+INTO\s+qms_epoch_validation_packages/i
    );
  });

  it('keeps structured intended-use persistence in the revision transaction', () => {
    const intendedUse = compactRoute.slice(
      compactRoute.indexOf("router.post('/:id/intended-use'"),
      compactRoute.indexOf("router.post('/:id/requirements'")
    );
    expect(intendedUse).toContain('constrecord=awaittx(async(q)=>');
    expect(intendedUse).toContain(
      'INSERTINTOqms_epoch_validation_intended_use_functions'
    );
    expect(intendedUse).toContain('intended_use_revision_id');
    expect(route).toContain('.default([])');
  });

  it('stores responsibilities as auditable assignments with employee acceptance', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS qms_epoch_validation_responsibilities'
    );
    expect(migration).toContain("'FINAL_APPROVING_AUTHORITY'");
    expect(migration).toContain(
      "'AWAITING_ACCEPTANCE','ACCEPTED','DECLINED','SUPERSEDED'"
    );
    expect(route).toContain('WHERE id=ANY($1::int[]) AND is_active=true');
    expect(route).toContain("assignment_status='SUPERSEDED'");
    expect(decisionService).toContain('ASSIGNEE_DECISION_REQUIRED');
    expect(route).toContain(
      'if (previousKeys.has(`${assignment.role}:${assignment.employeeId}`))'
    );
    expect(route).toContain("'RESPONSIBILITIES_ASSIGNED'");
    expect(route).toContain("'RESPONSIBILITY_ACCEPTED'");
    expect(route).toContain("'RESPONSIBILITY_DECLINED'");
    expect(route).toContain('responsibilityDecisionIdentityError');
    expect(route).toContain('authenticatedEmployeeId');
    expect(route).toContain('WHERE id=$1 FOR SHARE');
    expect(route).toContain('packageRevision: packageRow.revision');
    expect(route).toContain('productionVersion: packageRow.production_version');
  });

  it('requires edit authorization and optimistic locking for Phase 1 changes', () => {
    expect(route).toContain("'/:id/wizard/setup'");
    expect(
      route.match(/requirePermission\('EPOCH_VALIDATION_EDIT'\)/g)?.length
    ).toBeGreaterThan(3);
    expect(route).toContain('WHERE id=$14 AND row_version=$15 RETURNING *');
    expect(route).toContain("error: 'STALE_RECORD'");
    expect(route).toContain("'WIZARD_SETUP_SAVED'");
    const assignmentRoute = compactRoute.slice(
      compactRoute.indexOf("router.put('/:id/responsibilities'"),
      compactRoute.indexOf('asyncfunctiondecideResponsibility')
    );
    const decisionRoute = compactRoute.slice(
      compactRoute.indexOf('asyncfunctiondecideResponsibility'),
      compactRoute.indexOf('constintendedUseSchema')
    );
    expect(assignmentRoute).toContain(
      "requirePermission('EPOCH_VALIDATION_EDIT')"
    );
    expect(decisionRoute).not.toContain(
      "requirePermission('EPOCH_VALIDATION_EDIT')"
    );
  });

  it('registers migration 0250 in both safe and critical boot lists', () => {
    expect(
      safeBoot.match(/0250_epoch_validation_wizard_phase1\.sql/g)?.length
    ).toBe(2);
  });

  it('retains existing execution, approval, and release gates', () => {
    expect(route).toContain('PACKAGE_EXECUTION_READINESS_BLOCKED');
    expect(route).toContain('FORMAL_TEST_EXECUTION_NOT_ALLOWED');
    expect(route).toContain('PACKAGE_FINAL_READINESS_BLOCKED');
    expect(route).toContain('invalidateApprovals');
  });
});
