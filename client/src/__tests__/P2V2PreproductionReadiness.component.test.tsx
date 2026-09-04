import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import P2V2PreproductionReadiness from '../components/projects/P2V2PreproductionReadiness';

const readinessEndpoint =
  '/api/projects/project-1/workflow-v2/preproduction-readiness';

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
});

function makeReadinessModel(overrides: Record<string, unknown> = {}) {
  return {
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
    productionLaunchEnabled: true,
    ...overrides,
  };
}

function renderReadiness(
  overrides: Record<string, unknown> = {},
  actionFailure?: string,
  suppliedFetch?: ReturnType<typeof vi.fn>
) {
  const model = makeReadinessModel(overrides);
  const fetchImplementation =
    suppliedFetch ??
    vi.fn(
      async (input: unknown, init?: { method?: string; body?: unknown }) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === '/api/preproduction-checklists/templates') {
          return jsonResponse([]);
        }
        if (url.endsWith('/production-planning/launch-preview')) {
          return jsonResponse({
            resultChecksum: 'a'.repeat(64),
            blockers: [],
          });
        }
        if (actionFailure && method !== 'GET') {
          return jsonResponse({ message: actionFailure }, false);
        }
        return jsonResponse(model);
      }
    );
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

async function openReadinessForm() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open Preproduction Readiness Form',
    })
  );
  return screen.findByRole('dialog', { name: 'Preproduction Readiness Form' });
}

describe('P2V2PreproductionReadiness', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows readiness evidence and keeps release and launch as separate controls', async () => {
    renderReadiness();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await openReadinessForm();
    expect(screen.getByText('Checklist and evidence')).toBeInTheDocument();
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
    await openReadinessForm();
    expect(screen.getByText(/Routing revision changed/)).toBeInTheDocument();
    expect(screen.getByTestId('approve-production-release')).toBeDisabled();
    expect(screen.getByTestId('launch-production')).toBeDisabled();
  });

  it('renders a new readiness stage when the API omits empty collections', async () => {
    renderReadiness({
      review: null,
      history: undefined,
      approvals: undefined,
      requiredApprovals: undefined,
      recommendedChecklist: undefined,
      readiness: { state: 'NOT_READY', stale: false },
    });

    await openReadinessForm();
    expect(screen.getByTestId('preproduction-no-revision')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Readiness Draft' })
    ).toBeDisabled();
  });

  it('disables Production Launch from server readiness while preserving Production Release', async () => {
    renderReadiness({
      productionLaunchEnabled: false,
      release: {
        id: 'release-1',
        status: 'APPROVED',
        approved_at: '2026-07-23T12:00:00Z',
      },
      projectStatus: 'READY_FOR_P2_RELEASE',
    });

    await openReadinessForm();
    expect(
      screen.getByText(/Production Launch awaiting deployment validation/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId('launch-production')).toBeDisabled();
    expect(screen.getByText(/Release APPROVED/i)).toBeInTheDocument();
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
    await openReadinessForm();
    const launch = screen.getByTestId('launch-production');
    await waitFor(() => expect(launch).toBeEnabled());
    fireEvent.click(launch);
    expect(
      await screen.findByText(/Travelers, inventory demands, reservations/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/changes the project to IN_PRODUCTION/i)
    ).toBeInTheDocument();
  });

  it('allows a canonical planning launch to continue into the confirmed execution handoff', async () => {
    renderReadiness({
      release: {
        id: 'release-1',
        status: 'APPROVED',
        approved_at: '2026-07-23T12:00:00Z',
      },
      launch: {
        id: 'launch-1',
        status: 'COMPLETE',
        launched_at: '2026-07-23T12:30:00Z',
        execution_completed: false,
      },
      projectStatus: 'READY_FOR_P2_RELEASE',
    });

    await openReadinessForm();
    const launch = screen.getByTestId('launch-production');
    await waitFor(() => expect(launch).toBeEnabled());
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
    await openReadinessForm();
    const launch = screen.getByTestId('launch-production');
    await waitFor(() => expect(launch).toBeEnabled());
    fireEvent.click(launch);
    fireEvent.click(screen.getByText('Confirm Launch Production'));
    await waitFor(() => {
      const post = vi
        .mocked(fetch)
        .mock.calls.find(([, init]) => init?.method === 'POST');
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
        expectedPreviewDigest: 'a'.repeat(64),
        pilotConfirmation: 'LAUNCH P2 PRODUCTION',
      });
    });
    expect(
      screen.getByTestId('launch-production-confirmation')
    ).toBeInTheDocument();
  });

  it('imports tasks from an active reusable template without replacing V2 system checks', async () => {
    const model = makeReadinessModel({
      review: null,
      recommendedChecklist: [
        {
          key: 'routing',
          category: 'Manufacturing planning',
          label: 'Approved routing',
          applicability: 'REQUIRED',
          satisfied: false,
          evidence: [],
        },
      ],
      readiness: { state: 'NOT_READY', blockers: [], stale: false },
    });
    const fetchImplementation = vi.fn(
      async (input: unknown, init?: { method?: string; body?: unknown }) => {
        const url = String(input);
        if (url === readinessEndpoint) return jsonResponse(model);
        if (url === '/api/preproduction-checklists/templates') {
          return jsonResponse([
            {
              id: 'template-1',
              name: 'Standard Preproduction Review',
              isActive: true,
            },
          ]);
        }
        if (url === '/api/preproduction-checklists/templates/template-1') {
          return jsonResponse({
            id: 'template-1',
            name: 'Standard Preproduction Review',
            updatedAt: '2026-09-03T12:00:00Z',
            sections: [
              {
                id: 'section-1',
                name: 'Quality',
                tasks: [
                  {
                    id: 'task-1',
                    description: 'Supplier packet complete',
                  },
                ],
              },
            ],
          });
        }
        throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
      }
    );
    renderReadiness({}, undefined, fetchImplementation);

    await openReadinessForm();
    fireEvent.change(
      await screen.findByLabelText('Pre-production review template'),
      { target: { value: 'template-1' } }
    );
    await waitFor(() =>
      expect(screen.getByTestId('apply-preproduction-template')).toBeEnabled()
    );
    fireEvent.click(screen.getByTestId('apply-preproduction-template'));

    expect(screen.getByText('Approved routing')).toBeInTheDocument();
    expect(screen.getByText('Supplier packet complete')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Supplier packet complete evidence type')
    ).toHaveValue('PREPRODUCTION_TEMPLATE');
    expect(
      screen.getByLabelText('Supplier packet complete evidence record')
    ).toHaveValue('template-1');
  });

  it('saves a draft through the V2 PATCH contract without mutating legacy checklists', async () => {
    const base = makeReadinessModel();
    const model = makeReadinessModel({
      review: { ...base.review, status: 'DRAFT' },
      readiness: { state: 'NOT_READY', blockers: [], stale: false },
    });
    const fetchImplementation = vi.fn(
      async (input: unknown, init?: { method?: string; body?: unknown }) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url === readinessEndpoint && method === 'GET') {
          return jsonResponse(model);
        }
        if (url === '/api/preproduction-checklists/templates') {
          return jsonResponse([]);
        }
        if (url === `${readinessEndpoint}/review-1` && method === 'PATCH') {
          return jsonResponse({ review: model.review });
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      }
    );
    renderReadiness({}, undefined, fetchImplementation);

    await openReadinessForm();
    fireEvent.change(screen.getByLabelText('Readiness effectivity'), {
      target: { value: ' PO 14332 line 4, Rev C ' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Readiness Draft' })
    );

    await waitFor(() =>
      expect(fetchImplementation).toHaveBeenCalledWith(
        `${readinessEndpoint}/review-1`,
        expect.objectContaining({ method: 'PATCH' })
      )
    );
    const patchCall = fetchImplementation.mock.calls.find(
      ([input, init]) =>
        String(input) === `${readinessEndpoint}/review-1` &&
        init?.method === 'PATCH'
    );
    const patchBody = JSON.parse(String(patchCall?.[1]?.body));
    expect(patchBody).toMatchObject({
      expectedLockVersion: 7,
      effectivityReference: 'PO 14332 line 4, Rev C',
      checklist: [
        expect.objectContaining({
          key: 'routing',
          evidence: [
            expect.objectContaining({
              recordType: 'ROUTING',
              recordId: 'route-1',
            }),
          ],
        }),
      ],
    });
    expect(
      fetchImplementation.mock.calls.filter(([input, init]) => {
        const method = init?.method ?? 'GET';
        return (
          String(input).startsWith('/api/preproduction-checklists') &&
          ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
        );
      })
    ).toHaveLength(0);
  });
});
