import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

const read = (relative: string) =>
  readFileSync(join(process.cwd(), relative), 'utf8');

describe('Project Form template readiness UI', () => {
  it('publishes per-step released-template readiness through the Design Control route', () => {
    const routes = read('server/src/routes/projectForms.ts');
    const service = read('server/src/services/projectFormInstanceService.ts');

    expect(routes).toContain('/:recordId/forms/template-readiness');
    expect(routes).toContain("requirePermission('design.forms.view')");
    expect(service).toContain('getProjectFormTemplateReadiness');
    expect(service).toContain("await loadRecordStep(recordId, '1', client)");
    expect(service).not.toContain('authoritativeContext(');
    expect(service).toContain('selectableTemplateForStep(stepKey, client)');
    expect(service).toContain('ready: false');
    expect(service).toContain('reason: error.message');
  });

  it('keeps missing-template API errors inside the panel instead of rethrowing globally', () => {
    const panel = read(
      'client/src/components/design-control/ProjectFormInstancesPanel.tsx'
    );

    expect(panel).toContain('/forms/template-readiness');
    expect(panel).toContain('setMessage(error.message)');
    expect(panel).toContain('return null');
    expect(panel).not.toContain('throw error;');
  });

  it('disables instance creation until the exact released template is ready', () => {
    const panel = read(
      'client/src/components/design-control/ProjectFormInstancesPanel.tsx'
    );

    expect(panel).toContain("readiness?.ready &&");
    expect(panel).toContain("!readiness?.ready &&");
    expect(panel).toContain('Template not released');
    expect(panel).toContain('released template ready');
  });
});
