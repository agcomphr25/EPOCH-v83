import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import P2V2PreproductionReadiness from '../components/projects/P2V2PreproductionReadiness';

function renderReadiness(
  overrides: Record<string, unknown> = {},
  actionFailure?: string
) {
  const model = {
    review: {
      id: 'review-1',
      revision_number: 2,
      lock_version: 7,
      status: 'COMPLETE',
      checklist_snapshot: [
        {
          key: 'routing',
          category: 'Manufacturing planning',
          label: 'Approved routing',
          applicability: 'REQUIRED',
          satisfied: true,
          evidence: [{ recordType: 'ROUTING', recordId: 'route-1' }],
        },
      ],
      source_stage_revisions: {
        commercial: 1,
        technical: 2,
        productionPlanning: 3,
        wadAuthorization: 4,
      },
      exceptions: [],
      risks_and_controls: [{ risk: 'Capacity', owner: 'Ops', control: 'Plan' }],
      effectivity_reference: 'PO line 10',
    },
    history: [],
    approvals: [
      {
        id: 'a1',
        approval_type: 'PREPRODUCTION_PROJECT_MANAGEMENT',
        decision: 'APPROVED',
        actor_display_name: 'Project Manager',
        decided_at: '2026-07-23T12:00:00Z',
      },
    ],
    requiredApprovals: [
      'PROJECT_MANAGEMENT',
      'ENGINEERING',
      'QUALITY',
      'OPERATIONS',
    ],
    readiness: { state: 'READY', blockers: [], stale: false },
    release: null,
    launch: null,
    projectStatus: 'PREPRODUCTION_READINESS',
    ...overrides,
  };
  const fetchImplementation = actionFailure
    ? vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => model,
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: actionFailure }),
        })
    : vi.fn().mockResolvedValue({
        ok: true,
        json: async () => model,
      });
  vi.stubGlobal('fetch', fetchImplementation);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <P2V2PreproductionReadiness projectId="project-1" />
    </QueryClientProvider>
  );
}

describe('P2V2PreproductionReadiness', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows readiness evidence and keeps release and launch as separate controls', async () => {
    renderReadiness();
    expect(
      await screen.findByText('Checklist and evidence')
    ).toBeInTheDocument();
    expect(screen.getByText(/Approved routing/)).toBeInTheDocument();
    expect(
      screen.getByText(/does not create production records or launch work/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId('approve-production-release')).toBeEnabled();
    expect(screen.getByTestId('launch-production')).toBeDisabled();
  });

  it('disables both consequential actions when readiness is stale', async () => {
    renderReadiness({
      readiness: {
        state: 'STALE',
        stale: true,
        blockers: ['Routing revision changed.'],
      },
      release: {
        id: 'release-1',
        status: 'APPROVED',
        approved_at: '2026-07-23T12:00:00Z',
      },
      projectStatus: 'READY_FOR_P2_RELEASE',
    });
    expect(
      await screen.findByText(/Routing revision changed/)
    ).toBeInTheDocument();
    expect(screen.getByTestId('approve-production-release')).toBeDisabled();
    expect(screen.getByTestId('launch-production')).toBeDisabled();
  });

  it('describes consequential launch actions and explicitly deferred records', async () => {
    renderReadiness({
      release: {
        id: 'release-1',
        status: 'APPROVED',
        approved_at: '2026-07-23T12:00:00Z',
      },
      projectStatus: 'READY_FOR_P2_RELEASE',
    });
    const launch = await screen.findByTestId('launch-production');
    fireEvent.click(launch);
    expect(
      await screen.findByText(/Travelers, inventory demands, reservations/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/changes the project to IN_PRODUCTION/i)
    ).toBeInTheDocument();
  });

  it('keeps the confirmation open and shows no false success when launch fails', async () => {
    renderReadiness(
      {
        release: {
          id: 'release-1',
          status: 'APPROVED',
          approved_at: '2026-07-23T12:00:00Z',
        },
        projectStatus: 'READY_FOR_P2_RELEASE',
      },
      'Routing revision changed.'
    );
    fireEvent.click(await screen.findByTestId('launch-production'));
    fireEvent.click(screen.getByText('Confirm Launch Production'));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2));
    expect(
      screen.getByTestId('launch-production-confirmation')
    ).toBeInTheDocument();
  });
});
