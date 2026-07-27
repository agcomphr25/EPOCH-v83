import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import P2V2QualityProductRelease from '../components/projects/P2V2QualityProductRelease';

afterEach(() => vi.restoreAllMocks());
describe('P2V2QualityProductRelease', () => {
  it('states the release boundary and shows blockers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ctx: {
            project: { po_number: 'PO-9B' },
            productionReview: { revision_number: 1 },
          },
          items: [],
          ncrs: [],
          releases: [],
          holds: [],
          documentManifest: [],
          readiness: {
            state: 'BLOCKED',
            blockers: ['FINAL_INSPECTION_REQUIRED'],
            eligibleQuantity: 0,
          },
          review: null,
          approvals: [],
        }),
      })
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <P2V2QualityProductRelease projectId="project-9b" />
      </QueryClientProvider>
    );
    expect(
      await screen.findByText(/Product Release does not create a shipment/i)
    ).toBeInTheDocument();
    expect(screen.getByText('FINAL_INSPECTION_REQUIRED')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Create revision-controlled Quality review/i,
      })
    ).toBeInTheDocument();
  });
});
