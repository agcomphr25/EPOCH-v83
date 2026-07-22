import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

import {
  ProjectDesignApplicabilityError,
  validateDesignApplicabilityInput,
} from '../src/services/projectDesignApplicabilityValidation';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read(
  'migrations/0203_project_design_applicability_decisions.sql'
);
const service = read(
  'server/src/services/projectDesignApplicabilityService.ts'
);
const routes = read('server/src/routes/projects.ts');

describe('Phase 5 additive storage', () => {
  it('retains revision evidence without legacy backfill or destructive cascades', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS project_design_applicability_decisions'
    );
    expect(migration).toContain('project_design_applicability_current_unique');
    expect(migration).toContain(
      'UNIQUE (project_id, workflow_instance_id, revision_number)'
    );
    expect(migration).toContain("workflow_step_type = 'design_applicability'");
    expect(migration).toContain(
      'FOREIGN KEY (workflow_step_instance_id, workflow_instance_id, project_id)'
    );
    expect(migration).not.toMatch(/UPDATE\s+(?:projects|project_steps)\b/i);
    expect(migration).not.toMatch(/ON DELETE CASCADE/i);
  });
});

describe('responsibility-specific submission validation', () => {
  const base = {
    requirementSource: 'Customer PO',
    justification: 'Responsibility reviewed',
  };

  it('requires the controlling drawing, revision, and explicit AG scope for build-to-print', () => {
    expect(() =>
      validateDesignApplicabilityInput({
        ...base,
        responsibilityType: 'CUSTOMER_BUILD_TO_PRINT',
      })
    ).toThrow(ProjectDesignApplicabilityError);
    expect(() =>
      validateDesignApplicabilityInput({
        ...base,
        responsibilityType: 'CUSTOMER_BUILD_TO_PRINT',
        customerDrawingNumber: 'DWG-1',
        customerDrawingRevision: 'C',
        agDesignScope: 'None',
      })
    ).not.toThrow();
  });

  it('requires a Design Project and AG scope for AG-owned design', () => {
    expect(() =>
      validateDesignApplicabilityInput({
        ...base,
        responsibilityType: 'AG_DESIGN_RESPONSIBLE',
        agDesignScope: 'Tooling',
      })
    ).toThrow(/linkedDesignProjectId/);
    expect(() =>
      validateDesignApplicabilityInput({
        ...base,
        responsibilityType: 'AG_DESIGN_RESPONSIBLE',
        agDesignScope: 'Tooling',
        linkedDesignProjectId: 'DC-1',
      })
    ).not.toThrow();
  });

  it('requires both scopes, their boundary, and a Design Project for shared design', () => {
    expect(() =>
      validateDesignApplicabilityInput({
        ...base,
        responsibilityType: 'SHARED_DESIGN_RESPONSIBILITY',
        agDesignScope: 'Bracket',
        linkedDesignProjectId: 'DC-1',
      })
    ).toThrow(/customerDesignScope, responsibilityBoundary/);
    expect(() =>
      validateDesignApplicabilityInput({
        ...base,
        responsibilityType: 'SHARED_DESIGN_RESPONSIBILITY',
        agDesignScope: 'Bracket',
        customerDesignScope: 'Interface',
        responsibilityBoundary:
          'Customer controls interfaces; AG controls bracket',
        linkedDesignProjectId: 'DC-1',
      })
    ).not.toThrow();
  });
});

describe('controlled mutation boundaries', () => {
  it('has scoped actions and no generic stage status endpoint', () => {
    for (const action of [
      'design-applicability',
      '/submit',
      '/engineering-decision',
      '/quality-decision',
      '/revise',
    ])
      expect(routes).toContain(action);
    expect(routes).not.toMatch(/workflow-v2\/[^'"]*stage-status/);
    expect(service).toContain(
      "decision.responsibility_type === 'CUSTOMER_BUILD_TO_PRINT'"
    );
    expect(service).toContain("status='NOT_APPLICABLE'");
    expect(service).toContain("status='COMPLETE'");
    expect(service).toContain('SEGREGATION_OF_DUTIES');
    expect(service).toContain("release_status = 'RELEASED'");
    expect(service).toContain('step_order < 4');
  });
});
