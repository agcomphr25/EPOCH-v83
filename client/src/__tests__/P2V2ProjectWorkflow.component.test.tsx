import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import P2V2ProjectWorkflow from '../components/projects/P2V2ProjectWorkflow';

const stageDefinitions = [
  ['rfq_risk_assessment', 'RFQ & Risk Assessment', 'commercial_review'],
  ['estimate_quote', 'Estimate & Quote', 'commercial_review'],
  ['contract_review', 'Contract Review', 'commercial_review'],
  [
    'technical_configuration_review',
    'Technical & Configuration Review',
    'technical_configuration_review',
  ],
  ['production_planning', 'Production Planning', 'production_planning'],
  ['wad_authorization', 'WAD Authorization', 'wad_authorization'],
  [
    'preproduction_release',
    'Preproduction & Production Release',
    'preproduction_readiness',
  ],
  ['production_quality', 'Production Execution', 'production_execution'],
  [
    'final_release_shipping',
    'Quality & Product Release',
    'quality_product_release',
  ],
  [
    'project_closing',
    'Shipping, Delivery & Project Closing',
    'shipping_project_closeout',
  ],
] as const;

const stages = stageDefinitions.map(
  ([stepType, label, workspaceKey], index) => ({
    id: `step-${index + 1}`,
    stepType,
    stepOrder: index + 1,
    label,
    description: `Description ${index + 1}`,
    primaryAction: {
      label: `Open ${label}`,
      surface: { kind: 'workspace', key: workspaceKey },
    },
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
  })
);

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
  requiredApprovals: [],
  approvals: [],
  stages,
};

function renderWorkflow(response: object) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: Parameters<typeof fetch>[0]) =>
      String(input).endsWith('/workflow-v2')
        ? { ok: true, json: async () => response }
        : String(input).endsWith('/p2-handoff')
          ? {
              ok: true,
              json: async () => ({
                p2PoNumber: 'PO-V3',
                state: 'Partially Shipped',
                currentP2Status: 'IN_PRODUCTION',
                quantityRequired: 10,
                quantityPending: 4,
                quantityInProduction: 2,
                quantityCompleted: 6,
                quantityDispositioned: 0,
                quantityAcceptedByQuality: 6,
                quantityReleased: 5,
                quantityShipped: 3,
                productionHolds: 0,
                qualityHolds: 0,
                shippingHolds: 0,
                openNcrs: 0,
                certificationStatus: 'Incomplete',
                shippingStatus: 'Partial',
                executionComplete: false,
                closingUnlocked: false,
                blockers: ['4 unit(s) not complete'],
                nextAction: 'Continue work in the P2 Control Center.',
                links: { controlCenter: '/p2-control-center' },
              }),
            }
          : {
              ok: false,
              status: 404,
              json: async () => ({
                message: 'Endpoint not mocked in summary test',
              }),
            }
    )
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

  it('renders ten ordered stage workspaces and integrity/blocker warnings', async () => {
    renderWorkflow(initialized);
    expect(
      await screen.findByText('P2 Project Workflow V2')
    ).toBeInTheDocument();
    expect(screen.getAllByTestId(/^v2-stage-\d+$/)).toHaveLength(10);
    for (const [, label] of stageDefinitions)
      expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByTestId('v2-integrity-warning')).toHaveTextContent(
      'Example integrity problem'
    );
    expect(screen.getByTestId('v2-blocked-reason')).toHaveTextContent(
      'Required evidence is missing'
    );
    expect(screen.getByText('BLOCKED')).toBeInTheDocument();
    for (const forbidden of [
      'Design Control',
      'ECR',
      'ECN',
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
    fireEvent.click(await screen.findByTestId('v2-stage-audit-evidence-1'));
    expect(
      await screen.findByTestId('v2-stage-details-dialog')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Read-only workflow stage audit evidence')
    ).toBeInTheDocument();
    expect(screen.getByTestId('v2-active-link')).toHaveTextContent('Q-1');
    expect(screen.getByTestId('v2-superseded-link')).toHaveTextContent('Q-0');
    expect(screen.getByTestId('v2-approval')).toHaveTextContent('REJECTED');
  });

  it('treats omitted empty workflow collections as empty arrays', async () => {
    renderWorkflow({
      ...initialized,
      integrityErrors: undefined,
      stages: stages.map(
        ({
          activeLinks: _activeLinks,
          supersededLinks: _supersededLinks,
          approvals: _approvals,
          evidenceCount: _evidenceCount,
          ...stage
        }) => stage
      ),
    });

    expect(
      await screen.findByText('P2 Project Workflow V2')
    ).toBeInTheDocument();
    expect(screen.getAllByTestId(/^v2-stage-\d+$/)).toHaveLength(10);
    expect(screen.getAllByText(/0 \/ 0 \/ 0/)).toHaveLength(10);
  });

  it('presents the configured stage workspace before secondary audit evidence', async () => {
    renderWorkflow(initialized);
    expect(
      await screen.findByTestId('open-commercial-review-rfq_risk_assessment')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('open-commercial-review-estimate_quote')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('open-commercial-review-contract_review')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('open-technical-configuration-review')
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', {
        name: 'Open Technical & Configuration Review',
      })
    ).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'Open Design Applicability' })
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Open Production Planning' })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Open WAD Authorization' })
    ).toHaveLength(1);
    expect(screen.getAllByTestId(/^v2-stage-workspace-\d+$/)).toHaveLength(10);
    expect(screen.getByTestId('v2-stage-workspace-1')).toHaveAttribute(
      'data-workspace-key',
      'commercial_review'
    );
    expect(
      screen.getAllByRole('button', { name: 'Audit evidence' })
    ).toHaveLength(10);
    expect(
      screen.queryByRole('button', { name: 'Details' })
    ).not.toBeInTheDocument();
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

  it('renders prospective definition v3 in three sections without duplicate execution workspaces', async () => {
    const labels = [
      'RFQ Review',
      'Estimate & Quote',
      'Purchase/Contract Review',
      'Technical & Configuration Review',
      'Production Planning',
      'WAD Authorization',
      'Preproduction Readiness',
      'Approve and Release to P2',
      'P2 Execution',
      'Project Closing',
    ];
    const types = [
      'rfq_risk_assessment',
      'estimate_quote',
      'contract_review',
      'technical_configuration_review',
      'production_planning',
      'wad_authorization',
      'preproduction_release',
      'p2_release',
      'p2_execution',
      'project_closing',
    ];
    const workspaceKeys = [
      'commercial_review',
      'commercial_review',
      'commercial_review',
      'technical_configuration_review',
      'production_planning',
      'wad_authorization',
      'preproduction_readiness',
      'p2_release_handoff',
      'p2_execution_summary',
      'project_closing_summary',
    ];
    renderWorkflow({
      ...initialized,
      definitionVersion: 3,
      integrityStatus: 'VALID',
      integrityErrors: [],
      stages: labels.map((label, index) => ({
        ...stages[index],
        id: `v3-${index}`,
        stepType: types[index],
        label,
        stepOrder: index + 1,
        blockedReason: null,
        primaryAction: {
          label: `Open ${label}`,
          surface: { kind: 'workspace', key: workspaceKeys[index] },
        },
      })),
    });
    for (const label of labels)
      expect(await screen.findByText(label)).toBeInTheDocument();
    expect(
      screen.getByText('A. Planning and Authorization')
    ).toBeInTheDocument();
    expect(screen.getByText('B. P2 Handoff and Execution')).toBeInTheDocument();
    expect(screen.getByText('C. Completion')).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: /Open P2 Control Center/i })
    ).toHaveAttribute('href', '/p2-control-center');
    expect(screen.getByTestId('p2-v2-execution-summary')).toHaveTextContent(
      'Partially Shipped'
    );
    expect(screen.getByTestId('p2-v2-project-closing')).toHaveTextContent(
      'Not Ready'
    );
    expect(
      screen.queryByText('Shipping & Project Closing')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Shipping readiness and packaging')
    ).not.toBeInTheDocument();
  });
});
