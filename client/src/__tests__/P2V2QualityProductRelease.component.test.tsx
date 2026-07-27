import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import P2V2QualityProductRelease from '../components/projects/P2V2QualityProductRelease';

afterEach(() => vi.restoreAllMocks());
const base = {
  ctx: {
    project: { po_number: 'PO-9B', customer_name: 'Certification Customer' },
    productionReview: {
      revision_number: 1,
      configuration_baseline_id: 'CFG-9B',
      effectivity_reference: 'EFF-9B',
    },
  },
  items: [],
  ncrs: [],
  releases: [],
  holds: [],
  documentManifest: [],
  readiness: { state: 'BLOCKED', blockers: [], eligibleQuantity: 0 },
  review: null,
  approvals: [],
};
function renderDashboard(data: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...base, ...data }),
    })
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <P2V2QualityProductRelease projectId="project-9b" />
    </QueryClientProvider>
  );
}
describe('P2V2QualityProductRelease', () => {
  it('states the release boundary and shows blockers', async () => {
    renderDashboard({
      readiness: {
        state: 'BLOCKED',
        blockers: ['FINAL_INSPECTION_REQUIRED'],
        eligibleQuantity: 0,
      },
    });
    expect(
      await screen.findByText(/Product Release does not create a shipment/i)
    ).toBeInTheDocument();
    expect(screen.getByText('FINAL_INSPECTION_REQUIRED')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Create Quality review/i,
      })
    ).toBeInTheDocument();
  });

  it('provides submit, functional decision, and completion controls', async () => {
    renderDashboard({
      readiness: {
        state: 'READY_FOR_RELEASE',
        blockers: [],
        eligibleQuantity: 2,
      },
      review: {
        status: 'READY_FOR_REVIEW',
        revision_number: 1,
        lock_version: 3,
      },
    });
    expect(
      await screen.findByRole('button', { name: /Approve — Operations/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Reject — Project Management/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Approve — Quality/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Complete Quality review/i })
    ).toBeInTheDocument();
  });

  it('shows exact release confirmation and hold controls', async () => {
    renderDashboard({
      items: [
        {
          id: 'item-1',
          release_serial: 'SER-001',
          part_number: 'PART-9B',
          part_revision: 'A',
          po_item_id: 91,
          overall_result: 'PASS',
          status: 'COMPLETED',
        },
      ],
      documentManifest: [{ number: 'COC-1', revision: 'A' }],
      readiness: {
        state: 'READY_FOR_RELEASE',
        blockers: [],
        eligibleQuantity: 1,
      },
      review: {
        status: 'READY_FOR_RELEASE',
        revision_number: 1,
        lock_version: 5,
      },
      releases: [
        {
          id: 'release-1',
          release_number: 'PR-9B-1',
          part_number: 'PART-9B',
          released_quantity: 1,
          release_decision: 'RELEASED',
          serial_numbers: ['SER-001'],
          batch_lots: [],
        },
      ],
    });
    expect(await screen.findByText(/CFG-9B/)).toBeInTheDocument();
    expect(screen.getByText(/EFF-9B/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Release quantity/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Quality signature meaning/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Confirm and Release Product/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Place release hold/i })
    ).toBeInTheDocument();
  });
});
