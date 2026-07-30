// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import P2V2PilotControlCenter from '../components/projects/P2V2PilotControlCenter';

const dashboard = {
  environment: 'isolated_test',
  pilot: {
    authorization_number: 'PILOT-SYNTHETIC-R1',
    environment: 'isolated_test',
    customer_po_number: 'SYNTHETIC-PO',
    approved_po_lines: [
      { poLineId: 1, partNumber: 'PART-A', maximumQuantity: 2 },
    ],
    authorized_participants: [{ userId: 10, functionalRole: 'QUALITY' }],
    status: 'PENDING_READINESS',
    revision_number: 1,
    configuration_baseline_revision: 'CFG-R1',
    production_plan_revision: 1,
    wad_revision: 1,
    review_expires_at: '2027-01-01T00:00:00.000Z',
    rollback_owner_user_id: 99,
    rollback_plan_reference: 'docs/p2-v2-pilot-rollback-recovery.md',
  },
  readiness: {
    ready: false,
    blockers: [
      {
        key: 'training_complete',
        reason: 'Required training evidence is missing.',
        responsibleFunction: 'Quality',
        correctionLocation: 'Training Control Center',
      },
    ],
  },
  approvals: [],
  training: [],
  issues: [
    {
      issue_number: 'PILOT-ISSUE-000001',
      severity: 'MAJOR',
      category: 'WORKFLOW_BLOCKER',
      status: 'OPEN',
      description: 'Synthetic blocker',
    },
  ],
  evidenceManifest: [],
  events: [],
  nextAuthorizedAction: 'Resolve readiness blockers and submit',
};

function renderPanel(canView: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('/api/auth/session'))
        return {
          ok: true,
          json: async () => ({ id: 10, username: 'quality' }),
        };
      if (url.includes('/api/permissions/me'))
        return {
          ok: true,
          json: async () => ({
            permissions: canView ? ['projects.pilot_v2.view'] : [],
          }),
        };
      if (url.includes('/pilot-control'))
        return { ok: true, json: async () => dashboard };
      return { ok: false, json: async () => ({}) };
    })
  );
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const response = await fetch(String(queryKey[0]));
          if (!response.ok) throw new Error('Synthetic request failed');
          return response.json();
        },
      },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <P2V2PilotControlCenter projectId="project-1" />
    </QueryClientProvider>
  );
}

describe('P2V2PilotControlCenter', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows understandable restricted readiness, scope, training, issue and rollback evidence', async () => {
    renderPanel(true);
    expect(
      await screen.findByTestId('p2-v2-pilot-control-center')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Restricted Pilot Control Center')
    ).toBeInTheDocument();
    expect(screen.getByText(/SYNTHETIC-PO/)).toBeInTheDocument();
    expect(screen.getByText(/PART-A/)).toHaveTextContent('maximum 2');
    expect(screen.getByText('Training missing')).toBeInTheDocument();
    expect(
      screen.getByText('Why: Required training evidence is missing.')
    ).toBeInTheDocument();
    expect(screen.getByText('Who: Quality')).toBeInTheDocument();
    expect(
      screen.getByText('Where: Training Control Center')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Resolve readiness blockers and submit')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /activate/i })
    ).not.toBeInTheDocument();
  });

  it('does not expose pilot administration to an ordinary project user', async () => {
    const { container } = renderPanel(false);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
