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
});
