import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import P2V2ProductionExecution from '../components/projects/P2V2ProductionExecution';

const response = {
  ctx: {
    project: {
      id: 'project-1',
      po_id: 42,
      po_number: 'PO-42',
      customer_name: 'Example Customer',
      current_stage: 'IN_PRODUCTION',
    },
    launch: {
      production_plan_revision: 3,
      wad_revision: 2,
      configuration_baseline_id: 'CFG-7',
      effectivity_reference: 'SN-001 through SN-002',
    },
  },
  productionOrders: [{ id: 1 }, { id: 2 }],
  serializedItems: [{ id: 'a' }, { id: 'b' }],
  travelers: [{ id: 't-1' }],
  traceability: [{ id: 'trace-1' }],
  ncrs: [],
  holds: [],
  labor: { actual_hours: '4.5', open_count: 0 },
  evidence: {
    authorizedQuantity: 2,
    completedQuantity: 1,
    acceptedQuantity: 1,
    rejectedQuantity: 0,
    scrappedQuantity: 0,
    productionOrdersRequired: 2,
    productionOrdersComplete: 1,
    incompleteTravelerSteps: 1,
    missingMaterialGenealogy: 1,
    activeHolds: 0,
  },
  readiness: {
    state: 'BLOCKED',
    blockers: ['Required current traveler evidence is missing.'],
    warnings: [],
  },
  review: null,
  approvals: [],
  history: [],
};

describe('P2V2ProductionExecution', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => response,
      })
    );
  });
  it('renders authoritative progress, holds, blockers, and release deferrals', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <P2V2ProductionExecution projectId="project-1" />
      </QueryClientProvider>
    );
    expect(await screen.findByText('Production dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Example Customer · PO PO-42/)).toBeInTheDocument();
    expect(screen.getByText('1/2 complete')).toBeInTheDocument();
    expect(
      screen.getByText('Required current traveler evidence is missing.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not release product or authorize shipping/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create completion review/i })
    ).toBeEnabled();
  });
});
