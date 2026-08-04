import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const wizard = fs.readFileSync(
  path.resolve(
    import.meta.dirname,
    '../components/qms/EpochValidationWizard.tsx'
  ),
  'utf8'
);
const page = fs.readFileSync(
  path.resolve(import.meta.dirname, '../pages/EpochSoftwareValidationPage.tsx'),
  'utf8'
);
const compact = wizard.replace(/\s+/g, '');

describe('EPOCH software validation wizard Phase 1 UI', () => {
  it('replaces the selected-package view with the guided wizard', () => {
    expect(page).toContain('import { EpochValidationWizard }');
    expect(page).toContain('<EpochValidationWizard');
    expect(page).toContain('employees={employees.data || []}');
  });

  it('shows all nine steps while keeping later phases visibly unavailable', () => {
    for (const step of [
      'Setup',
      'Intended Use',
      'Responsibilities',
      'Risk Review',
      'Test Plan',
      'Perform Tests',
      'Resolve Issues',
      'Review & Approve',
      'Auditor Package',
    ]) {
      expect(wizard).toContain(`'${step}'`);
    }
    expect(wizard).toContain('Not available yet');
    expect(compact).toContain('constavailable=index<3');
    expect(compact).toContain('disabled={!available}');
  });

  it('provides the package dashboard, progress, next action, and safe navigation', () => {
    expect(wizard).toContain('Overall completion');
    expect(wizard).toContain('Incomplete items');
    expect(wizard).toContain('Next required action');
    expect(wizard).toContain('beforeunload');
    expect(wizard).toContain(
      'You have unsaved changes. Leave this step without saving?'
    );
    expect(wizard).toContain('Save and exit');
    expect(wizard).toContain('aria-label="Validation wizard steps"');
    expect(wizard).toContain('form.requestSubmit(submitter)');
    expect(wizard).toContain("toast({ title: 'Draft saved successfully.' })");
    expect(wizard).toContain('if (!dirty)');
    expect(wizard).toContain('submissionGuard.current');
    expect(wizard.match(/id=\{stepFormId\([123]\)\}/g)).toHaveLength(3);
  });

  it('supports plain-language setup with advanced technical details', () => {
    expect(wizard).toContain('Why are we validating EPOCH?');
    expect(wizard).toContain('Advanced technical details');
    expect(wizard).toContain(
      'Exact production commit SHA, release tag, or deployment ID'
    );
    expect(compact).toContain("method:'PATCH'");
    expect(wizard).toContain('/wizard/setup');
    expect(wizard).toContain('Controlled draft saved');
  });

  it('captures per-function intended use and failure effects as a draft revision', () => {
    expect(wizard).toContain('EPOCH functions in scope');
    expect(wizard).toContain('How does the company use this function?');
    expect(wizard).toContain('What could happen if it did not work correctly?');
    expect(wizard).toContain('Critical to product quality');
    expect(wizard).toContain(
      'Explain why this function is not used for an approved QMS purpose.'
    );
    expect(wizard).toContain('Intended Use revision saved as DRAFT');
    expect(wizard).toContain('functions: Object.values(functions)');
  });

  it('assigns active employees and exposes personal acceptance', () => {
    expect(wizard).toContain('Search active employees');
    expect(wizard).toContain('Additional testers');
    expect(wizard).toContain('Final approving authority');
    expect(wizard).toContain('Accept responsibility');
    expect(wizard).toContain('/api/auth/session');
    expect(compact).toContain("method:'PUT'");
    expect(wizard).toContain('/decision');
    expect(wizard).toContain('Reason required to decline');
    expect(wizard).toContain("decision: 'DECLINED'");
  });

  it('uses the parsed shared API response without a second parse', () => {
    expect(wizard).toContain('apiRequest(url, options) as Promise<T>');
    expect(wizard).not.toContain('.json()');
  });
});
