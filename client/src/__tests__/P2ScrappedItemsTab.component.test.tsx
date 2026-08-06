import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import P2NonconformingTab from '../components/p2/P2ScrappedItemsTab';

const item = {
  id: 'item-1',
  serialNumber: 'ROC2600720',
  barcode: 'ROC2600720',
  partNumber: 'RW-PART',
  partName: 'Rock West Part',
  poId: 72,
  poNumber: 'PO-RW',
  customerName: 'Rock West',
  currentDepartment: 'Pending Layup',
  status: 'SCRAPPED',
  scrapReason: 'Remake required',
  scrapBy: 'Supervisor',
  scrapAt: '2026-08-06T12:00:00.000Z',
  createdAt: '2026-08-06T12:00:00.000Z',
  disposition: {
    id: 91,
    serializedItemId: 'item-1',
    dispositionType: 'Repair',
    poId: 72,
    poNumber: 'PO-RW',
    authorization: 'Supervisor',
    partNumber: 'RW-PART',
    serialNumber: 'ROC2600720',
    dispositionDate: '2026-08-06',
    reasonType: 'other',
    reasonOther: 'Remake required',
    notes: null,
    resolved: false,
    resolvedAt: null,
    createdAt: '2026-08-06T12:00:00.000Z',
  },
};

describe('P2NonconformingTab', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/p2/nonconforming-rmas')
        ? [{
            rma: {
              id: 55,
              dispositionId: 91,
              serializedItemId: 'item-1',
              rmaNumber: 'RMA-P2-20260806-1',
              status: 'open',
              traceableMaterials: [],
              shippedAt: null,
              completedAt: null,
              notes: null,
              createdAt: '2026-08-06T12:00:00.000Z',
            },
            disposition: item.disposition,
            item,
          }]
        : url.includes('/api/p2/serialized-items/scrapped')
          ? [item]
          : [];
      return Promise.resolve({ ok: true, json: async () => body } as Response);
    }));
  });

  it('opens the linked RMA directly from an in-progress Repair row', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          queryFn: async ({ queryKey }) => {
            const url = Array.isArray(queryKey) ? queryKey.join('') : String(queryKey);
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) throw new Error(`HTTP ${(res as any).status ?? 'error'}`);
            return res.json();
          },
          retry: false,
          gcTime: 0,
        },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <P2NonconformingTab />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /manage rma/i }));

    expect(await screen.findByText('RMA-P2-20260806-1')).toBeInTheDocument();
    expect(screen.getByText('Traceable Materials')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark shipped/i })).toBeEnabled();
  });
});
