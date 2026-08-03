import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LineItemsStep } from '../pages/InventoryReceivingControlCenter';

type Receipt = Parameters<typeof LineItemsStep>[0]['receipt'];
type OnUpdateFn = Parameters<typeof LineItemsStep>[0]['onUpdate'];

const { mockApiRequest, mockToastError } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: mockApiRequest,
  queryClient: { invalidateQueries: vi.fn() },
  getQueryFn: () => async () => [],
  generateIdempotencyKey: () => 'test-key',
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: mockToastError, success: vi.fn() },
  default: { error: mockToastError, success: vi.fn() },
}));

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        queryFn: async () => [],
      },
      mutations: { retry: false },
    },
  });
}

function makeReceipt(
  lines: { id: number; orderedQty: string; receivedQty: string; uom?: string }[]
): Receipt {
  return {
    id: 1,
    receiptNumber: 'REC-001',
    receiptDate: '2026-04-17',
    status: 'draft',
    lines: lines.map(l => ({
      receiptId: 1,
      agPartNumber: 'PART-A',
      description: 'Test Part',
      isPartial: false,
      isOver: false,
      uom: 'EA',
      ...l,
    })),
  };
}

function renderLineItemsStep(
  receipt: Receipt,
  {
    onNext = vi.fn(),
    onUpdate = vi.fn<Parameters<OnUpdateFn>, ReturnType<OnUpdateFn>>(),
    queryClient,
  }: {
    onNext?: () => void;
    onUpdate?: OnUpdateFn;
    queryClient?: QueryClient;
  } = {}
) {
  const qc = queryClient ?? makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LineItemsStep receipt={receipt} onNext={onNext} onUpdate={onUpdate} />
    </QueryClientProvider>
  );
}

describe('LineItemsStep — updateReceivedQtyMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clearly identifies the received quantity as an editable field', () => {
    const lineId = 41;
    renderLineItemsStep(makeReceipt([{ id: lineId, orderedQty: '10', receivedQty: '0' }]));

    expect(screen.getByText('Enter the quantity received for each line.')).toBeTruthy();
    // The column header renders as a sortable <button> inside a <th>, so both
    // elements share the same text content. Use getAllByText and assert at least one.
    expect(screen.getAllByText('Qty Received').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', {
      name: 'Enter quantity received for PART-A. Current quantity: 0 EA',
    })).toBeTruthy();
  });

  it('happy path: clicking a qty and saving calls PATCH with correct body and calls onUpdate', async () => {
    const lineId = 42;
    const updatedReceipt = makeReceipt([{ id: lineId, orderedQty: '10', receivedQty: '8' }]);

    mockApiRequest
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(updatedReceipt);

    const onUpdate = vi.fn<Parameters<OnUpdateFn>, ReturnType<OnUpdateFn>>();
    renderLineItemsStep(makeReceipt([{ id: lineId, orderedQty: '10', receivedQty: '5' }]), { onUpdate });

    fireEvent.click(screen.getByTestId(`line-qty-display-${lineId}`));

    const input = screen.getByTestId(`line-edit-input-${lineId}`);
    fireEvent.change(input, { target: { value: '8' } });

    fireEvent.click(screen.getByTestId(`line-edit-save-${lineId}`));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/receipts/1/lines/42',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ receivedQty: '8', isPartial: true, isOver: false }),
        })
      );
    });

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith('/api/receipts/1');
      expect(onUpdate).toHaveBeenCalledWith(updatedReceipt);
    });
  });

  it('error path: a failed PATCH call shows an error toast', async () => {
    const lineId = 7;

    mockApiRequest.mockRejectedValueOnce(new Error('Network error'));

    renderLineItemsStep(makeReceipt([{ id: lineId, orderedQty: '10', receivedQty: '0' }]));

    fireEvent.click(screen.getByTestId(`line-qty-display-${lineId}`));

    const input = screen.getByTestId(`line-edit-input-${lineId}`);
    fireEvent.change(input, { target: { value: '5' } });

    fireEvent.click(screen.getByTestId(`line-edit-save-${lineId}`));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to update received qty');
    });
  });

  it('sends isPartial=true, isOver=false when receivedQty < orderedQty', async () => {
    const lineId = 10;
    mockApiRequest
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(makeReceipt([{ id: lineId, orderedQty: '20', receivedQty: '5' }]));

    renderLineItemsStep(makeReceipt([{ id: lineId, orderedQty: '20', receivedQty: '0' }]));

    fireEvent.click(screen.getByTestId(`line-qty-display-${lineId}`));
    fireEvent.change(screen.getByTestId(`line-edit-input-${lineId}`), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId(`line-edit-save-${lineId}`));

    await waitFor(() => {
      const patchCall = mockApiRequest.mock.calls.find(
        ([url, opts]: [string, { method: string; body: string }]) =>
          typeof url === 'string' && url.includes('/lines/') && opts?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1].body);
      expect(body.isPartial).toBe(true);
      expect(body.isOver).toBe(false);
    });
  });

  it('sends isOver=true, isPartial=false when receivedQty > orderedQty', async () => {
    const lineId = 11;
    mockApiRequest
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(makeReceipt([{ id: lineId, orderedQty: '10', receivedQty: '15' }]));

    renderLineItemsStep(makeReceipt([{ id: lineId, orderedQty: '10', receivedQty: '0' }]));

    fireEvent.click(screen.getByTestId(`line-qty-display-${lineId}`));
    fireEvent.change(screen.getByTestId(`line-edit-input-${lineId}`), { target: { value: '15' } });
    fireEvent.click(screen.getByTestId(`line-edit-save-${lineId}`));

    await waitFor(() => {
      const patchCall = mockApiRequest.mock.calls.find(
        ([url, opts]: [string, { method: string; body: string }]) =>
          typeof url === 'string' && url.includes('/lines/') && opts?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1].body);
      expect(body.isOver).toBe(true);
      expect(body.isPartial).toBe(false);
    });
  });

  it('sends isPartial=false, isOver=false when receivedQty equals orderedQty', async () => {
    const lineId = 12;
    mockApiRequest
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(makeReceipt([{ id: lineId, orderedQty: '10', receivedQty: '10' }]));

    renderLineItemsStep(makeReceipt([{ id: lineId, orderedQty: '10', receivedQty: '0' }]));

    fireEvent.click(screen.getByTestId(`line-qty-display-${lineId}`));
    fireEvent.change(screen.getByTestId(`line-edit-input-${lineId}`), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId(`line-edit-save-${lineId}`));

    await waitFor(() => {
      const patchCall = mockApiRequest.mock.calls.find(
        ([url, opts]: [string, { method: string; body: string }]) =>
          typeof url === 'string' && url.includes('/lines/') && opts?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1].body);
      expect(body.isPartial).toBe(false);
      expect(body.isOver).toBe(false);
    });
  });

  it('clears edit state after a successful save', async () => {
    const lineId = 20;
    const updatedReceipt = makeReceipt([{ id: lineId, orderedQty: '10', receivedQty: '9' }]);

    mockApiRequest
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(updatedReceipt);

    renderLineItemsStep(makeReceipt([{ id: lineId, orderedQty: '10', receivedQty: '5' }]));

    fireEvent.click(screen.getByTestId(`line-qty-display-${lineId}`));
    expect(screen.getByTestId(`line-edit-input-${lineId}`)).toBeTruthy();

    fireEvent.change(screen.getByTestId(`line-edit-input-${lineId}`), { target: { value: '9' } });
    fireEvent.click(screen.getByTestId(`line-edit-save-${lineId}`));

    await waitFor(() => {
      expect(screen.queryByTestId(`line-edit-input-${lineId}`)).toBeNull();
    });
  });
});
