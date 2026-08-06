// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinalDesignReviewPanel } from '../features/design-control/FinalDesignReviewPanel';
import { ProjectTeamPanel } from '../features/design-control/ProjectTeamPanel';
import { StructuredRecordsWorkspace } from '../features/design-control/StructuredRecordsWorkspace';
import { TraceabilityMatrix } from '../features/design-control/TraceabilityMatrix';

function renderWithQuery(ui: ReactElement) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {ui}
    </QueryClientProvider>
  );
}

describe('Design Control structured workspaces', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith('/structured/REQUIREMENT'))
          return new Response(JSON.stringify({ records: [] }), { status: 200 });
        if (url.endsWith('/traceability'))
          return new Response(
            JSON.stringify({
              source: 'PERSISTED_DESIGN_CONTROL_RELATIONSHIPS',
              calculatedAt: '2026-08-05T00:00:00Z',
              rows: [
                {
                  requirementId: 'req-1',
                  requirementNumber: 'REQ-1',
                  statement: 'Synthetic requirement',
                  owner: 'Engineer',
                  lifecycleStatus: 'APPROVED',
                  statuses: ['MISSING_VERIFICATION'],
                  primaryStatus: 'MISSING_VERIFICATION',
                  links: [],
                  remediation: {
                    reason: 'missing verification',
                    owner: 'Engineer',
                    href: '/fix',
                  },
                },
              ],
              totals: {
                requirements: 1,
                fullyTraced: 0,
                releaseReady: false,
                byStatus: { MISSING_VERIFICATION: 1 },
              },
            }),
            { status: 200 }
          );
        if (url.endsWith('/final-review/readiness'))
          return new Response(
            JSON.stringify({
              status: 'BLOCKED',
              calculatedAt: '2026-08-05T00:00:00Z',
              source: 'AUTHORITATIVE_PERSISTED_RECORDS',
              blocking: [
                {
                  key: 'verification',
                  label: 'Verification results',
                  status: 'BLOCKED',
                  reason: 'Failed verification remains visible.',
                  owner: 'Quality',
                  recordId: 'record-1',
                  href: '/fix-verification',
                },
              ],
              categories: [
                {
                  key: 'verification',
                  label: 'Verification results',
                  status: 'BLOCKED',
                  reason: 'Failed verification remains visible.',
                  owner: 'Quality',
                  recordId: 'record-1',
                  href: '/fix-verification',
                },
              ],
            }),
            { status: 200 }
          );
        if (url.endsWith('/project-team'))
          return new Response(
            JSON.stringify({ activated: false, assignments: [], history: [] }),
            { status: 200 }
          );
        return new Response(JSON.stringify({ message: 'Unexpected request' }), {
          status: 500,
        });
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows a plain-language empty state and Add action for authoritative requirements', async () => {
    renderWithQuery(
      <StructuredRecordsWorkspace recordId="record-1" readOnly={false} />
    );
    expect(
      await screen.findByText(/No design inputs and requirements yet/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Add requirement/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/State one clear, testable requirement/i)
    ).toBeInTheDocument();
  });

  it('renders server-calculated traceability and direct remediation', async () => {
    renderWithQuery(<TraceabilityMatrix recordId="record-1" />);
    expect(await screen.findByText('REQ-1')).toBeInTheDocument();
    expect(screen.getByText(/^MISSING VERIFICATION$/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Fix missing verification/i })
    ).toHaveAttribute('href', '/fix');
    expect(
      screen.getByText(/Text similarity is never treated as evidence/i)
    ).toBeInTheDocument();
  });

  it('shows authoritative Final Design Review blockers with owner and fix link', async () => {
    renderWithQuery(
      <FinalDesignReviewPanel recordId="record-1" readOnly={false} />
    );
    expect(
      await screen.findByText('Verification results', { selector: 'strong' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Failed verification remains visible/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Owner: Quality/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open evidence/i })
    ).toHaveAttribute('href', '/fix-verification');
  });

  it('makes project assignment enforcement explicitly prospective', async () => {
    renderWithQuery(<ProjectTeamPanel recordId="record-1" readOnly={false} />);
    expect(
      await screen.findByText(/Assignment enforcement is not activated/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Activate and assign me as Design Authority/i,
      })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/qms/design-control/record-1/project-team',
        expect.anything()
      )
    );
  });
});
