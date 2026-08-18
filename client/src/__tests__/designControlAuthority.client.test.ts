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

    // QMSDesignControlPage now delegates rendering to DesignControlWorkspace,
    // which is where the shared workflow import lives.
    const workspaceSrc = readFileSync(
      join(
        process.cwd(),
        'client/src/features/design-control/DesignControlWorkspace.tsx'
      ),
      'utf8'
    );
    expect(workspaceSrc).toContain("from '@shared/designControlWorkflow'");
    expect(workspaceSrc).not.toContain('legacyDesignWorkflowSteps');

    // The page itself should render the workspace component.
    const pageSrc = readFileSync(
      join(process.cwd(), 'client/src/pages/QMSDesignControlPage.tsx'),
      'utf8'
    );
    expect(pageSrc).toContain('DesignControlWorkspace');
  });

  it('keeps server projects authoritative and local-only data visible for review', () => {
    const source = readFileSync(
      join(process.cwd(), 'client/src/pages/RDProjectsPage.tsx'),
      'utf8'
    );
    expect(source).toContain('const projects = sharedProjects');
    expect(source).toContain('Browser-local project data needs review');
    expect(source).toContain('Review and import');
    expect(source).toContain('was selected automatically.');
  });

  it('provides controlled draft, submit, approval, and navigation actions for every stage', () => {
    const editorSource = readFileSync(
      join(
        process.cwd(),
        'client/src/features/design-control/DesignControlStepEditor.tsx'
      ),
      'utf8'
    );
    const workspaceSource = readFileSync(
      join(
        process.cwd(),
        'client/src/features/design-control/DesignControlWorkspace.tsx'
      ),
      'utf8'
    );

    expect(workspaceSource).toContain('<DesignControlStepEditor');
    expect(editorSource).toContain('definition.fields.map');
    expect(editorSource).toContain('definition.checklist.map');
    expect(editorSource).toContain('/submit`');
    expect(editorSource).toContain('/decision`');
    expect(editorSource).toContain("decide(slot, 'RETURNED_FOR_REVISION')");
    expect(editorSource).toContain("decide(slot, 'REJECTED')");
    expect(editorSource).toContain('Save the draft before submission.');
    expect(editorSource).toContain('design-control-missing-summary');
    expect(editorSource).toContain('Version and decision history');
    expect(editorSource).toContain('contentVersionId:');
    expect(editorSource).toContain('Save Draft');
    expect(editorSource).toContain('Save and Continue');
    expect(editorSource).toContain("window.addEventListener('beforeunload'");
    expect(editorSource).toContain('You have unsaved changes');
    expect(editorSource).toContain('Last saved');
    expect(editorSource).toContain('Next action');
    expect(editorSource).toContain('Submit for Approval');
    expect(editorSource).toContain('Previous stage');
    expect(editorSource).toContain('Next stage');
    expect(editorSource).toContain("can('design.control.edit')");
    expect(editorSource).toContain("can('design.control.submit')");
    expect(editorSource).toContain("can('design.control.approve')");
    expect(workspaceSource).toContain('<DesignProjectConfigurationWorkspace');
  });
});
