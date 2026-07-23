import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import P2V2ProjectWorkflow from '../components/projects/P2V2ProjectWorkflow';

const stages = Array.from({ length: 10 }, (_, index) => ({
  id: `step-${index + 1}`,
  stepType:
    index === 3
      ? 'design_applicability'
      : index === 4
        ? 'production_planning'
        : index === 5
          ? 'wad_authorization'
          : `stage_${index + 1}`,
  stepOrder: index + 1,
  label: `Stage ${index + 1}`,
  description: `Description ${index + 1}`,
  status: index === 0 ? 'BLOCKED' : 'NOT_STARTED',
  applicability: 'REQUIRED',
  blockedReason: index === 0 ? 'Required evidence is missing' : null,
  activeLinks:
    index === 0
      ? [
          {
            id: 'link-1',
            recordType: 'quote',
            recordId: 'Q-1',
            relationshipType: 'PRIMARY',
            isAuthoritative: true,
            linkedByDisplayName: 'Alex',
          },
        ]
      : [],
  supersededLinks:
    index === 0
      ? [
          {
            id: 'link-2',
            recordType: 'quote',
            recordId: 'Q-0',
            relationshipType: 'SUPERSEDES',
            isAuthoritative: false,
            supersededAt: '2026-01-01',
            supersededReason: 'Revised',
          },
        ]
      : [],
  approvals:
    index === 0
      ? [
          {
            id: 'approval-1',
            decision: 'REJECTED',
            approvalType: 'QUALITY',
            signatureMeaning: 'Reviewed',
            actorDisplayName: 'Pat',
            superseded: false,
          },
        ]
      : [],
  evidenceCount: index === 0 ? 3 : 0,
  lastUpdated: '2026-01-01',
}));

const initialized = {
  projectId: 'p1',
  initialized: true,
  workflowStatus: 'ACTIVE',
  definitionVersion: 1,
  initializedAt: '2026-01-01',
  initializedBy: 'Tester',
  integrityStatus: 'INVALID',
  integrityErrors: [
    { code: 'MISSING_STAGE', message: 'Example integrity problem' },
  ],
  totalStages: 10,
  completedStages: 0,
  blockedStages: 1,
  pendingApprovalStages: 0,
  percentComplete: 0,
  stages,
};

function renderWorkflow(response: object) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => response })
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <P2V2ProjectWorkflow projectId="p1" />
    </QueryClientProvider>
  );
}

describe('P2V2ProjectWorkflow', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders ten ordered, text-labelled read-only stages and integrity/blocker warnings', async () => {
    renderWorkflow(initialized);
    expect(
      await screen.findByText('P2 Project Workflow V2')
    ).toBeInTheDocument();
    expect(screen.getAllByTestId(/^v2-stage-\d+$/)).toHaveLength(10);
    expect(screen.getByTestId('v2-integrity-warning')).toHaveTextContent(
      'Example integrity problem'
    );
    expect(screen.getByTestId('v2-blocked-reason')).toHaveTextContent(
      'Required evidence is missing'
    );
    expect(screen.getByText('BLOCKED')).toBeInTheDocument();
    for (const forbidden of [
      'Start',
      'Mark Complete',
      'Skip',
      'Approve',
      'Waive',
    ])
      expect(
        screen.queryByRole('button', { name: forbidden })
      ).not.toBeInTheDocument();
  });

  it('shows active, superseded, and approval evidence in stage details', async () => {
    renderWorkflow(initialized);
    fireEvent.click(await screen.findByTestId('v2-stage-details-1'));
    expect(
      await screen.findByTestId('v2-stage-details-dialog')
    ).toBeInTheDocument();
    expect(screen.getByTestId('v2-active-link')).toHaveTextContent('Q-1');
    expect(screen.getByTestId('v2-superseded-link')).toHaveTextContent('Q-0');
    expect(screen.getByTestId('v2-approval')).toHaveTextContent('REJECTED');
  });

  it('makes only Design Applicability, Production Planning and WAD Authorization writable from the ten-stage summary', async () => {
    renderWorkflow(initialized);
    expect(
      await screen.findByTestId('open-design-applicability')
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Open Design Applicability' })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Open Production Planning' })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Open WAD Authorization' })
    ).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Details' })).toHaveLength(10);
  });

  it('shows an explicit not-initialized state without an initialize action', async () => {
    renderWorkflow({
      initialized: false,
      workflowStatus: 'NOT_INITIALIZED',
      integrityStatus: 'NOT_EVALUATED',
      integrityErrors: [],
      totalStages: 0,
      completedStages: 0,
      blockedStages: 0,
      pendingApprovalStages: 0,
      percentComplete: null,
      message: 'P2 V2 workflow has not been initialized.',
      stages: [],
    });
    expect(
      await screen.findByTestId('v2-workflow-not-initialized')
    ).toHaveTextContent('Workflow not initialized');
    expect(
      screen.queryByRole('button', { name: /initialize/i })
    ).not.toBeInTheDocument();
  });
});
