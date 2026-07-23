import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';
import { DESIGN_CONTROL_WORKFLOW } from '@shared/designControlWorkflow';

describe('Design Control client authority foundation', () => {
  it('uses the shared twelve-step workflow definition', () => {
    expect(DESIGN_CONTROL_WORKFLOW.map((step) => step.key)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
    ]);

    const source = readFileSync(
      join(process.cwd(), 'client/src/pages/QMSDesignControlPage.tsx'),
      'utf8'
    );
    expect(source).toContain("from '@shared/designControlWorkflow'");
    expect(source).not.toContain('legacyDesignWorkflowSteps');
  });

  it('keeps server projects authoritative and local-only data visible for review', () => {
    const source = readFileSync(
      join(process.cwd(), 'client/src/pages/RDProjectsPage.tsx'),
      'utf8'
    );
    expect(source).toContain('const projects = sharedProjects');
    expect(source).toContain('Browser-local project data needs review');
    expect(source).toContain('Review and import');
    expect(source).toContain('No record was selected automatically');
  });
});
