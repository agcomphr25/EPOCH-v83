import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { DESIGN_CONTROL_WORKFLOW } from '@shared/designControlWorkflow';

import {
  getDesignControlFieldPresentation,
  nextActionForStep,
  STRUCTURED_RECORD_TYPE_BY_STEP,
} from '../features/design-control/designControlFieldPresentation';

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8');

describe('unified Design Control step editor', () => {
  it('gives every field in all twelve controlled stages a typed presentation and guidance', () => {
    expect(DESIGN_CONTROL_WORKFLOW).toHaveLength(12);

    for (const step of DESIGN_CONTROL_WORKFLOW) {
      expect(step.fields.length).toBeGreaterThan(0);
      for (const field of step.fields) {
        const presentation = getDesignControlFieldPresentation(step.key, field);
        expect(presentation.kind).toMatch(
          /^(text|textarea|date|select|project|person|role|attachment)$/
        );
        expect(presentation.help.trim()).not.toBe('');
      }
    }
  });

  it('uses constrained controls for dates, people, roles, evidence, and enumerations', () => {
    const presentationFor = (stepKey: string, label: string) => {
      const step = DESIGN_CONTROL_WORKFLOW.find(
        (item) => item.key === stepKey
      )!;
      const field = step.fields.find((item) => item.label === label)!;
      return getDesignControlFieldPresentation(stepKey, field);
    };

    expect(presentationFor('1', 'Design type').kind).toBe('select');
    expect(presentationFor('1', 'Project / customer / order link').kind).toBe(
      'project'
    );
    expect(presentationFor('1', 'Target manufacturing date').kind).toBe('date');
    expect(presentationFor('1', 'Responsible engineer').kind).toBe('person');
    expect(presentationFor('1', 'Responsible engineer').help).toMatch(
      /accountable person/i
    );
    expect(presentationFor('2', 'Approval roles').kind).toBe('role');
    expect(presentationFor('9', 'Evidence attachment').kind).toBe('attachment');
    expect(presentationFor('9', 'Pass/fail').options).toEqual(['PASS', 'FAIL']);
    expect(presentationFor('9', 'Engineering disposition').kind).not.toBe(
      'person'
    );

    const editor = source(
      'client/src/features/design-control/DesignControlStepEditor.tsx'
    );
    expect(editor).toContain('Select a person...');
    expect(editor).toContain('{person.label}');
    expect(editor).not.toContain('<datalist');
  });

  it('opens normalized records only where an authoritative register exists', () => {
    expect(STRUCTURED_RECORD_TYPE_BY_STEP).toEqual({
      '3': 'REQUIREMENT',
      '5': 'RISK',
      '6': 'REVIEW',
      '9': 'VERIFICATION',
      '10': 'VALIDATION',
      '11': 'REVIEW',
    });
  });

  it('states actionable next steps without inventing completion', () => {
    expect(nextActionForStep('submitted_for_approval', 0)).toMatch(
      /authorized, independent reviewer/i
    );
    expect(nextActionForStep('approved', 0)).toMatch(/approved/i);
    expect(nextActionForStep('draft', 2)).toMatch(/2 missing required items/i);
    expect(nextActionForStep('draft', 0)).toMatch(
      /submit the exact saved version/i
    );
  });

  it('keeps unsaved-change, evidence, and release actions on existing server APIs', () => {
    const editor = source(
      'client/src/features/design-control/DesignControlStepEditor.tsx'
    );
    const forms = source(
      'client/src/components/design-control/ProjectFormInstancesPanel.tsx'
    );
    const release = source(
      'client/src/features/design-control/EngineeringReleaseGatePanel.tsx'
    );

    expect(editor).toContain("window.addEventListener('beforeunload'");
    expect(editor).toContain('setFormData(step?.formData ?? {})');
    expect(editor).toContain('setChecklist(step?.checklist ?? {})');
    expect(editor).toContain(
      'if (!navigatedToAnotherStep && dirtyRef.current) return'
    );
    expect(editor).toContain('Save and Continue');
    expect(editor).toContain('payload.message || payload.error');
    expect(editor).toContain('Select an active project assignment');
    expect(editor).toContain('Enter another accountable person');
    expect(editor).toContain('Enter another customer or order link');
    expect(editor).toContain('Open evidence upload');
    expect(editor).toContain('design-control-evidence-step-');
    expect(editor).not.toContain('<datalist');
    expect(forms).toContain("window.addEventListener('beforeunload'");
    expect(forms).toContain('/attachments`');
    expect(forms).toContain('Objective evidence attached');
    expect(forms).toContain(
      'No controlled step-form template is available for this checkpoint'
    );
    expect(release).toContain('/engineering-release-preview`');
    expect(release).toContain('/engineering-release`');
    expect(release).toContain('disabled={!preview.ready || busy}');
    expect(release).not.toMatch(/bypassRelease|forceRelease|skipReadiness/);
  });
});
