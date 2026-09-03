import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildP2V2WorkflowResponse,
  buildUninitializedP2V2Response,
  calculateP2V2Progress,
} from '../src/services/projectWorkflowV2ReadModel';

const root = resolve(__dirname, '../..');
const routeSource = readFileSync(
  resolve(root, 'server/src/routes/projects.ts'),
  'utf8'
);
const projectDetailSource = readFileSync(
  resolve(root, 'client/src/pages/ProjectDetailPage.tsx'),
  'utf8'
);

describe('P2 V2 progress calculation', () => {
  it('counts COMPLETE and approved NOT_APPLICABLE only', () => {
    const progress = calculateP2V2Progress([
      { status: 'COMPLETE', approvals: [] },
      {
        status: 'NOT_APPLICABLE',
        approvals: [
          { decision: 'NOT_APPLICABLE_APPROVED', superseded_at: null },
        ],
      },
      { status: 'NOT_APPLICABLE', approvals: [] },
      { status: 'APPROVED', approvals: [] },
      { status: 'PENDING_APPROVAL', approvals: [] },
    ]);
    expect(progress).toEqual({
      totalStages: 5,
      completedStages: 2,
      blockedStages: 0,
      pendingApprovalStages: 1,
      percentComplete: 40,
    });
  });

  it('does not count superseded not-applicable approval evidence', () => {
    expect(
      calculateP2V2Progress([
        {
          status: 'NOT_APPLICABLE',
          approvals: [
            { decision: 'NOT_APPLICABLE_APPROVED', superseded_at: new Date() },
          ],
        },
      ]).completedStages
    ).toBe(0);
  });
});

describe('P2 V2 read model', () => {
  it('returns an explicit uninitialized model without misleading progress', () => {
    expect(buildUninitializedP2V2Response('project-1')).toMatchObject({
      initialized: false,
      workflowStatus: 'NOT_INITIALIZED',
      percentComplete: null,
      stages: [],
    });
  });

  it('groups active links, superseded links, approvals, and integrity errors', () => {
    const response = buildP2V2WorkflowResponse('project-1', {
      instance: { id: 'instance-1', status: 'ACTIVE', definition_version: 1 },
      integrity: {
        valid: false,
        issues: [{ code: 'MISSING_STAGE', message: 'Missing stage' }],
      },
      steps: [
        {
          id: 'step-1',
          step_type: 'rfq_risk_assessment',
          step_order: 1,
          label_snapshot: 'RFQ & Risk',
          status: 'BLOCKED',
          applicability: 'REQUIRED',
          links: [
            { id: 'a', unlinked_at: null },
            { id: 'b', unlinked_at: new Date(), unlink_reason: 'Replaced' },
          ],
          approvals: [{ id: 'c', decision: 'REJECTED' }],
        },
      ],
    });
    expect(response.integrityStatus).toBe('INVALID');
    expect(response.stages[0]).toMatchObject({
      primaryAction: {
        label: 'Open RFQ & Risk',
        surface: { kind: 'workspace', key: 'commercial_review' },
      },
      activeLinks: [{ id: 'a' }],
      supersededLinks: [{ id: 'b' }],
      evidenceCount: 3,
    });
  });

  it('resolves primary workspaces from the instance definition version', () => {
    const responseFor = (definitionVersion: number) =>
      buildP2V2WorkflowResponse('project-1', {
        instance: {
          id: 'instance-1',
          status: 'ACTIVE',
          definition_version: definitionVersion,
        },
        integrity: { valid: true, issues: [] },
        steps: [
          {
            id: 'step-10',
            step_type: 'project_closing',
            step_order: 10,
            label_snapshot: 'Project Closing',
            status: 'NOT_STARTED',
            applicability: 'REQUIRED',
            links: [],
            approvals: [],
          },
        ],
      });

    expect(responseFor(2).stages[0].primaryAction?.surface.key).toBe(
      'shipping_project_closeout'
    );
    expect(responseFor(3).stages[0].primaryAction?.surface.key).toBe(
      'project_closing_summary'
    );
  });
});

describe('read-only endpoint isolation', () => {
  it('is version-aware and exposes no initializer or legacy step fallback', () => {
    const endpoint = routeSource.slice(
      routeSource.indexOf("router.get('/:id/workflow-v2'"),
      routeSource.indexOf(
        "router.get('/:id'",
        routeSource.indexOf("router.get('/:id/workflow-v2'") + 1
      )
    );
    expect(endpoint).toContain('resolveProjectWorkflowVersion');
    expect(endpoint).toContain('WORKFLOW_VERSION_MISMATCH');
    expect(endpoint).toContain('buildUninitializedP2V2Response');
    expect(endpoint).not.toContain('initializeV2Workflow');
    expect(endpoint).not.toContain('getProjectSteps');
    expect(endpoint).not.toMatch(/INSERT|UPDATE|DELETE/i);
  });

  it('routes Project Detail by server-provided effective version and blocks legacy release for V2', () => {
    expect(projectDetailSource).toContain(
      "effectiveWorkflowVersion === 'p2_v2'"
    );
    expect(projectDetailSource).toContain(
      '<P2V2ProjectWorkflow projectId={project.id} />'
    );
    expect(projectDetailSource).toContain('isLegacyWorkflow && project &&');
    expect(projectDetailSource).toContain('isLegacyWorkflow && [');
    expect(projectDetailSource).toContain('v2-release-gate-future');
    expect(projectDetailSource).toContain(
      'workflow-version-configuration-error'
    );
  });
});
