import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import P2V2ProductionPlanning from '../components/projects/P2V2ProductionPlanning';

const model = {
  plan: {
    id: 'plan-1',
    revision_number: 2,
    status: 'PENDING_APPROVAL',
    po_number: 'PO-100',
    po_revision_number: 3,
    effectivity_reference: 'PO PO-100 Rev 3',
  },
  items: [
    {
      id: 'root',
      assembly_path: 'root:1',
      part_number: 'MAKE-100',
      part_name: 'Final assembly',
      is_manufactured: true,
      extended_project_quantity: '2',
      bom_revision: 'B',
      bom_release_status: 'RELEASED',
      routing_revision: '4',
      routing_release_status: 'RELEASED',
    },
    {
      id: 'leaf',
      assembly_path: 'root:1/line:2',
      part_number: 'BUY-20',
      part_name: 'Purchased fastener',
      is_manufactured: false,
      extended_project_quantity: '8',
      bom_release_status: 'NOT_REQUIRED_APPROVED',
      routing_release_status: 'NOT_REQUIRED_APPROVED',
    },
  ],
  history: [
    {
      id: 'plan-1',
      revision_number: 2,
      status: 'DRAFT',
      configuration_revision: 'PO PO-100 Rev 3',
      effectivity_reference: 'PO PO-100 Rev 3',
    },
    {
      id: 'plan-0',
      revision_number: 1,
      status: 'SUPERSEDED',
      configuration_revision: 'PO PO-100 Rev 2',
      effectivity_reference: 'PO PO-100 Rev 2',
    },
  ],
  approvalHistory: [],
  readiness: {
    ready: false,
    stale: true,
    blockers: ['MAKE-100: traveler decision required.'],
    differences: ['MAKE-100: BOM revision/release changed.'],
  },
};

function renderPlanning() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const body = url.includes('/api/permissions/me')
        ? {
            permissions: [
              'projects.production_planning.manage',
              'projects.production_planning.engineering_decide',
              'projects.production_planning.quality_decide',
              'projects.production_planning.operations_decide',
            ],
          }
        : model;
      return { ok: true, json: async () => body } as Response;
    })
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <P2V2ProductionPlanning projectId="p1" />
    </QueryClientProvider>
  );
}

describe('P2V2ProductionPlanning', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('renders assembly hierarchy, purchased leaves, blockers, stale changes, decisions, approvals and revision history', async () => {
    renderPlanning();
    fireEvent.click(screen.getByTestId('open-production-planning'));
    expect(
      await screen.findByTestId('production-planning-dialog')
    ).toBeInTheDocument();
    expect(await screen.findByText('MAKE-100')).toBeInTheDocument();
    expect(screen.getByText('BUY-20')).toBeInTheDocument();
    expect(screen.getByText('MAKE')).toBeInTheDocument();
    expect(screen.getByText('BUY')).toBeInTheDocument();
    expect(screen.getByText(/traveler decision required/i)).toBeInTheDocument();
    expect(screen.getByTestId('production-plan-stale')).toHaveTextContent(
      'BOM revision/release changed'
    );
    expect(screen.getByText(/engineering approval/i)).toBeInTheDocument();
    expect(screen.getByText(/quality approval/i)).toBeInTheDocument();
    expect(screen.getByText(/operations approval/i)).toBeInTheDocument();
    expect(screen.getByText(/Revision 1/)).toBeInTheDocument();
    expect(screen.getAllByTestId('production-plan-item')).toHaveLength(1);
  });
});
