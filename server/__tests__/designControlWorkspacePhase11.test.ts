import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const workspace = fs.readFileSync(
  path.join(
    root,
    'client/src/features/design-control/DesignControlWorkspace.tsx'
  ),
  'utf8'
);
const structuredWorkspace = fs.readFileSync(
  path.join(
    root,
    'client/src/features/design-control/StructuredRecordsWorkspace.tsx'
  ),
  'utf8'
);
const qms = fs.readFileSync(
  path.join(root, 'client/src/pages/QMSDesignControlPage.tsx'),
  'utf8'
);
const rd = fs.readFileSync(
  path.join(root, 'client/src/pages/RDProjectsPage.tsx'),
  'utf8'
);
const route = fs.readFileSync(
  path.join(root, 'server/src/routes/qmsDesignControl.ts'),
  'utf8'
);
const lifecycleService = fs.readFileSync(
  path.join(
    root,
    'server/src/services/designControlStructuredLifecycleService.ts'
  ),
  'utf8'
);
const terminology = fs.readFileSync(
  path.join(root, 'shared/designControlTerminology.ts'),
  'utf8'
);
const phases = fs.readFileSync(
  path.join(root, 'shared/designControlPhases.ts'),
  'utf8'
);

describe('Phase 11 unified Design Control workspace', () => {
  it('uses the canonical twelve-step definition', () => {
    expect(workspace).toContain('import { DESIGN_CONTROL_WORKFLOW }');
    expect(workspace).toContain('Progress: {completed}/12');
    expect(workspace).not.toMatch(/const\s+workflowSteps\s*=/);
  });

  it('presents six plain-language phases while preserving all twelve stages', () => {
    for (const title of [
      'Define the Project',
      'Requirements and Risks',
      'Develop the Design',
      'Build, Review, and Test',
      'Final Design Approval',
      'Release to Manufacturing',
    ]) {
      expect(phases).toContain(title);
    }
    for (let step = 1; step <= 12; step += 1) {
      expect(phases).toContain(`'${step}'`);
    }
    expect(workspace).toContain('Six Design Control phases');
    expect(workspace).toContain('All 12 controlled');
    expect(workspace).toContain('Design phases');
    expect(workspace).toContain('Next required action');
    expect(workspace).toContain('Continue Design');
    expect(workspace).toContain('setActiveStep(phase.stepKeys[0])');
  });

  it('gives every phase the same guided, correctable layout', () => {
    for (const heading of [
      'What you need to do',
      'Required information',
      'What is missing',
      'Review and approval',
      'History',
    ]) {
      expect(workspace).toContain(heading);
    }
    expect(workspace).toContain('.getElementById(');
    expect(workspace).toContain('You can save an incomplete draft');
  });

  it('is shared by R&D project mode and QMS oversight mode', () => {
    expect(rd).toContain('<DesignControlWorkspace');
    expect(rd).toContain('mode="project"');
    expect(qms).toContain('<DesignControlWorkspace');
    expect(qms).toContain("'oversight'");
  });

  it('keeps authority on rd_projects and authoritative design control records', () => {
    expect(route).toContain('.from(rdProjects)');
    expect(route).toContain(
      "eq(designControlRecords.authorityStatus, 'authoritative')"
    );
    expect(route).not.toContain('p2Projects');
  });

  it('labels the R&D project link with the authoritative project name', () => {
    expect(route).toContain('linkedProject: linkedProject[0] ?? null');
    expect(route).toContain('projectName: rdProjects.projectName');
    expect(workspace).toContain('detail.linkedProject?.projectName');
    expect(workspace).toContain('{linkedProjectName}');
    expect(workspace).toContain('/design/rd-projects?projectId=');
  });

  it('provides bounded server pagination and filtering', () => {
    expect(route).toMatch(/Math\.min\(\s*50/);
    expect(route).toContain('.limit(pageSize)');
    expect(route).toContain('.offset((page - 1) * pageSize)');
    expect(route).toContain('ilike(rdProjects.projectName');
    expect(qms).toContain(
      'Filtering and pagination are performed by the server'
    );
  });

  it('restores stable project, record, step, tab, and auditor deep links', () => {
    for (const key of ['project', 'record', 'step', 'workspaceTab', 'mode']) {
      expect(workspace + qms).toContain(`searchParams.set('${key}'`);
    }
  });

  it('renders live requirements, risks, reviews, verification, and validation', () => {
    expect(workspace).toContain('<StructuredRecordsWorkspace');
    for (const type of [
      'REQUIREMENT',
      'RISK',
      'REVIEW',
      'VERIFICATION',
      'VALIDATION',
    ]) {
      expect(structuredWorkspace).toContain(`type: '${type}'`);
    }
  });

  it('contains no former sample registers', () => {
    expect(qms).not.toMatch(
      /const\s+(inputs|outputs|reviews|risks|verification|validation|changes|releases)\s*=/
    );
    expect(qms.toLowerCase()).not.toContain('sample');
  });

  it('explains ECR, ECN, and release distinctions', () => {
    expect(workspace).toContain("expandDesignControlTerm('ECR')");
    expect(workspace).toContain("expandDesignControlTerm('ECN')");
    expect(workspace).toMatch(/Engineering Release\s+establishes/);
  });

  it('continues an existing Design Review and explains controlled terminology', () => {
    expect(structuredWorkspace).toContain('Continue Design Review');
    expect(structuredWorkspace).toContain('no duplicate will be created');
    expect(structuredWorkspace).toContain("expandDesignControlTerm('DR')");
    for (const acronym of [
      'SOW',
      'PDR',
      'CDR',
      'TRR',
      'PRR',
      'BOM',
      'CAD',
      'ECR',
      'ECN',
      'DHF',
      'UAS',
      'FAI',
      'WIP',
      'QMS',
      'MDR',
      'P1',
      'P2',
      'AS9100',
    ]) {
      expect(terminology).toMatch(new RegExp(`\\b${acronym}:`));
    }
    expect(terminology).toContain("'N/A': 'Not Applicable'");
  });

  it('enforces source confirmation, N/A reasons, and decision comments server-side', () => {
    expect(lifecycleService).toContain('SOURCE_MAPPING_CONFIRMATION_REQUIRED');
    expect(lifecycleService).toContain('NOT_APPLICABLE_JUSTIFICATION_REQUIRED');
    expect(lifecycleService).toContain('REVIEW_DECISION_COMMENTS_REQUIRED');
  });

  it('distinguishes Revision A and Revision B+', () => {
    expect(workspace).toContain('Revision A establishes the initial baseline');
    expect(workspace).toContain('Revision B+');
  });

  it('reuses controlled forms, copies, and DHF panels', () => {
    expect(workspace).toContain('<ProjectFormInstancesPanel');
    expect(workspace).toContain('<ControlledCopyPanel');
    expect(workspace).toContain('<DesignHistoryFilePanel');
  });

  it('forces existing mutation panels into oversight mode for auditors', () => {
    expect(workspace).toContain("const readOnly = mode === 'auditor'");
    expect(
      workspace.match(/oversightMode=\{readOnly\}/g)?.length
    ).toBeGreaterThanOrEqual(6);
    expect(qms).toContain("can('qms.audit_readiness.view')");
  });

  it('authenticates the oversight aggregation endpoint', () => {
    expect(route).toContain('router.use(authenticateToken)');
    expect(route).toMatch(
      /router\.get\(\s*['"]\/oversight\/projects['"]\s*,\s*requireDesignControlView/
    );
  });

  it('provides loading, empty, error, retry, and permission messages', () => {
    for (const text of [
      'Loading bounded oversight results',
      'No Design Projects match',
      'Oversight could not be loaded',
      'Retry',
      'not authorized',
    ]) {
      expect(qms).toContain(text);
    }
  });

  it('provides labeled and keyboard-accessible controls', () => {
    expect(workspace).toContain('aria-label="Design Control steps"');
    expect(workspace).toContain("aria-current={selected ? 'step'");
    expect(workspace).toContain('focus-visible:ring-2');
    expect(qms).toContain('<Label>');
  });

  it('communicates status with text rather than color alone', () => {
    expect(workspace).toContain('{displayStatus(step?.status)}');
    expect(qms).toContain('{statusText(row.designControlStatus)}');
  });

  it('does not introduce browser alerts or local authoritative records', () => {
    expect(workspace + qms).not.toContain('window.alert');
    expect(workspace + qms).not.toContain('localStorage');
  });

  it('does not add client-side release bypasses', () => {
    expect(workspace + qms).not.toMatch(
      /bypassRelease|forceRelease|skipReadiness/
    );
  });

  it('does not touch P2 behavior from the shared workspace or oversight route', () => {
    const oversightRoute = route.slice(
      route.indexOf("router.get('/oversight/projects'"),
      route.indexOf("router.post('/',")
    );
    expect(workspace + qms + oversightRoute).not.toMatch(
      /\/api\/p2-|p2PurchaseOrder|productionWorkOrder/
    );
  });
});
