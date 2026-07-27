import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import P2V2ShippingProjectCloseout from '../components/projects/P2V2ShippingProjectCloseout';

const dashboard = {
  ctx: {
    project: {
      po_number: 'CERT-PO',
      customer_name: 'Certification Customer',
      status: 'active',
    },
    shippingStep: { status: 'IN_PROGRESS' },
  },
  eligibleAllocations: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      release_number: 'PR-1',
      part_number: 'PART-1',
      serial_number: 'SERIAL-1',
      quantity: 1,
    },
  ],
  allocations: [],
  shippingHolds: [],
  review: null,
  authorizations: [],
  closeout: null,
  approvals: [],
  closeoutEvents: [],
};
type FetchOptions = { method?: string; body?: unknown };

function renderComponent() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <P2V2ShippingProjectCloseout projectId="project-9c" />
    </QueryClientProvider>
  );
}

describe('P2V2ShippingProjectCloseout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders separate Shipping and Project Closing controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => dashboard,
      })
    );
    renderComponent();
    expect(
      await screen.findByText('Stage 10 — Shipping & Project Closing')
    ).toBeInTheDocument();
    expect(screen.getByText(/Product Release is required/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Authorize Shipment' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm Shipment' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close Project' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Controlled Reopen' })
    ).toBeInTheDocument();
  });

  it('submits exact allocation, packaging, address, carrier, and document evidence', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => dashboard,
      })
      .mockResolvedValue({
        ok: true,
        json: async () => dashboard,
      });
    vi.stubGlobal('fetch', fetchMock);
    renderComponent();
    const allocation = await screen.findByRole('checkbox');
    fireEvent.click(allocation);
    for (const [label, value] of [
      ['Packaging method', 'Rigid carton'],
      ['Preservation method', 'Clean dry bag'],
      ['Weight (lb)', '4'],
      ['Length', '12'],
      ['Width', '8'],
      ['Height', '4'],
      ['Ship-to name', 'Customer receiving'],
      ['Address', '1 Main St'],
      ['City', 'Tulsa'],
      ['State/region', 'OK'],
      ['Postal code', '74101'],
      ['Carrier', 'UPS'],
      ['Service', 'Ground'],
    ])
      fireEvent.change(screen.getByLabelText(label), {
        target: { value },
      });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Verify packaging and readiness',
      })
    );
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (call) => (call[1] as FetchOptions | undefined)?.method === 'POST'
        )
      ).toBe(true)
    );
    const postCall = fetchMock.mock.calls.find(
      (call) => (call[1] as FetchOptions | undefined)?.method === 'POST'
    );
    const options = postCall?.[1] as FetchOptions;
    const body = JSON.parse(String(options.body));
    expect(body.allocationIds).toEqual([
      '10000000-0000-4000-8000-000000000001',
    ]);
    expect(body.packaging).toMatchObject({
      packagingMethod: 'Rigid carton',
      preservationMethod: 'Clean dry bag',
      weightLbs: 4,
      dimensions: { length: 12, width: 8, height: 4 },
    });
    expect(body.shipTo).toMatchObject({
      line1: '1 Main St',
      postalCode: '74101',
    });
    expect(body.carrier).toMatchObject({
      carrier: 'UPS',
      serviceLevel: 'Ground',
    });
    expect(body.documentManifest[0].status).toBe('RELEASED');
  });

  it('shows controlled hold, delivery, approval, history, and reopen controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => dashboard,
      })
    );
    renderComponent();
    await screen.findByText('Shipment, tracking, delivery, and holds');
    expect(screen.getByText('Immutable shipment history')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Place Shipping hold' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(4);
  });
});
