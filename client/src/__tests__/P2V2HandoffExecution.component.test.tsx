import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import P2V2HandoffExecution from '../components/projects/P2V2HandoffExecution';

describe('P2V2HandoffExecution', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders safely when an older API response omits blockers and links', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          state: 'Not Released',
          currentP2Status: 'NOT_RELEASED',
          quantityRequired: 0,
          quantityPending: 0,
          quantityInProduction: 0,
          quantityCompleted: 0,
          quantityDispositioned: 0,
          quantityAcceptedByQuality: 0,
          quantityReleased: 0,
          quantityShipped: 0,
          productionHolds: 0,
          qualityHolds: 0,
          shippingHolds: 0,
          openNcrs: 0,
          certificationStatus: 'Incomplete',
          shippingStatus: 'Not shipped',
          executionComplete: false,
          closingUnlocked: false,
          nextAction: 'Approve Production Release.',
        }),
      })
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <P2V2HandoffExecution projectId="project-1" mode="execution" />
      </QueryClientProvider>
    );

    expect(
      await screen.findByText('P2 Execution — authoritative summary')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open P2 Control Center' })
    ).toHaveAttribute('href', '/p2-control-center');
  });

  it('renders safely when shared cache contains a raw handoff error payload', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(
      ['/api/projects', 'project-1', 'workflow-v2', 'p2-handoff'],
      {
        error: 'P2_HANDOFF_FAILED',
        message: 'The P2 handoff action failed.',
      }
    );

    render(
      <QueryClientProvider client={client}>
        <P2V2HandoffExecution projectId="project-1" mode="execution" />
      </QueryClientProvider>
    );

    expect(
      await screen.findByText('P2 Execution — authoritative summary')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open P2 Control Center' })
    ).toHaveAttribute('href', '/p2-control-center');
  });

  it('renders all contextual operating links during handoff', async () => {
    const links = {
      controlCenter:
        '/p2-control-center?tab=status&projectId=project-1&poId=42&po=PO-42',
      production:
        '/p2-control-center?tab=production&projectId=project-1&poId=42&po=PO-42',
      productionMap:
        '/p2-control-center?tab=production-map&projectId=project-1&poId=42&po=PO-42',
      projectProduction: '/projects/project-1?tab=production',
      pmControlCenter: '/pm-control-center?project=project-1',
      dailyTagUp: '/daily-tag-up?projectId=project-1&customerPo=PO-42',
      p2WorkOrderQueues:
        '/p2-work-orders/queues/all?projectId=project-1&poId=42&po=PO-42',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          state: 'Not Released',
          currentP2Status: 'NOT_RELEASED',
          quantityRequired: 0,
          quantityPending: 0,
          quantityInProduction: 0,
          quantityCompleted: 0,
          quantityDispositioned: 0,
          quantityAcceptedByQuality: 0,
          quantityReleased: 0,
          quantityShipped: 0,
          productionHolds: 0,
          qualityHolds: 0,
          shippingHolds: 0,
          openNcrs: 0,
          certificationStatus: 'Incomplete',
          shippingStatus: 'Not shipped',
          executionComplete: false,
          closingUnlocked: false,
          blockers: [],
          nextAction: 'Approve Production Release.',
          links,
        }),
      })
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <P2V2HandoffExecution projectId="project-1" mode="handoff" />
      </QueryClientProvider>
    );

    await screen.findByTestId('p2-v2-handoff-actions');
    for (const [name, href] of [
      ['Open P2 Control Center', links.controlCenter],
      ['Open Production Queue', links.production],
      ['Open Production Map', links.productionMap],
      ['Open Project Production', links.projectProduction],
      ['Open PM Dashboard', links.pmControlCenter],
      ['Open Daily Tag Up', links.dailyTagUp],
      ['Open P2 Work Order Queues', links.p2WorkOrderQueues],
    ]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });
});
