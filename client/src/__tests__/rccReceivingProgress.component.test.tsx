import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceivingProgressBar, PutawayStep } from '../pages/InventoryReceivingControlCenter';
import { getRccCompleteInvalidationKeys } from '../lib/rccInvalidation';

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

type Line = Parameters<typeof ReceivingProgressBar>[0]['lines'][number];
type Receipt = Parameters<typeof PutawayStep>[0]['receipt'];

function makeLine(orderedQty: string, receivedQty: string): Line {
  return {
    id: Math.random(),
    receiptId: 1,
    orderedQty,
    receivedQty,
  };
}

function makeUnit(id: number): NonNullable<Receipt['units']>[number] {
  return {
    id,
    receiptLineId: 1,
    receiptId: 1,
    unitSequence: id,
    barcode: `UNIT-${id}`,
    disposition: 'accepted',
    quantity: '1',
  };
}

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: 1,
    receiptNumber: 'REC-001',
    receiptDate: '2026-04-17',
    status: 'in_progress',
    units: [makeUnit(1)],
    ...overrides,
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, queryFn: async () => [] },
      mutations: { retry: false },
    },
  });
}

function renderPutawayStep(
  receipt: Receipt,
  {
    onComplete = vi.fn(),
    onUpdate = vi.fn(),
    qc,
  }: { onComplete?: () => void; onUpdate?: (r: Receipt) => void; qc?: QueryClient } = {}
) {
  const client = qc ?? makeQueryClient();
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <PutawayStep receipt={receipt} onComplete={onComplete} onUpdate={onUpdate} />
      </QueryClientProvider>
    ),
  };
}

// ── ReceivingProgressBar ───────────────────────────────────────────────────────

describe('ReceivingProgressBar', () => {
  it('renders nothing when there are no lines', () => {
    const { container } = render(<ReceivingProgressBar lines={[]} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('rcc-receiving-progress')).toBeNull();
  });

  it('shows 100% when all lines are fully received', () => {
    const lines = [
      makeLine('10', '10'),
      makeLine('5', '5'),
      makeLine('20', '25'),
    ];
    render(<ReceivingProgressBar lines={lines} />);
    const bar = screen.getByTestId('rcc-receiving-progress');
    expect(bar).toBeTruthy();
    expect(bar.textContent).toContain('3 / 3 lines received');
    const fill = bar.querySelector('.bg-emerald-500') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('shows 0% when no lines have been received', () => {
    const lines = [
      makeLine('10', '0'),
      makeLine('5', '0'),
    ];
    render(<ReceivingProgressBar lines={lines} />);
    const bar = screen.getByTestId('rcc-receiving-progress');
    expect(bar.textContent).toContain('0 / 2 lines received');
    const fill = bar.querySelector('.bg-emerald-500') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('shows 50% when half the lines are fully received', () => {
    const lines = [
      makeLine('10', '10'),
      makeLine('5', '0'),
    ];
    render(<ReceivingProgressBar lines={lines} />);
    const bar = screen.getByTestId('rcc-receiving-progress');
    expect(bar.textContent).toContain('1 / 2 lines received');
    const fill = bar.querySelector('.bg-emerald-500') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('shows partial breakdown when a line has receivedQty between 0 and orderedQty', () => {
    const lines = [
      makeLine('10', '5'),
      makeLine('8', '8'),
    ];
    render(<ReceivingProgressBar lines={lines} />);
    const bar = screen.getByTestId('rcc-receiving-progress');
    expect(screen.getByTestId('rcc-full-count').textContent).toBe('1 full');
    expect(screen.getByTestId('rcc-partial-count').textContent).toBe('1 partial');
    expect(screen.getByTestId('rcc-open-count').textContent).toBe('0 open');
    const fullFill = bar.querySelector('[data-testid="rcc-progress-full"]') as HTMLElement;
    expect(fullFill.style.width).toBe('50%');
    const partialFill = bar.querySelector('[data-testid="rcc-progress-partial"]') as HTMLElement;
    expect(partialFill.style.width).toBe('50%');
  });

  it('treats lines with orderedQty of 0 as not received even if receivedQty is 0', () => {
    const lines = [
      makeLine('0', '0'),
      makeLine('5', '5'),
    ];
    render(<ReceivingProgressBar lines={lines} />);
    const bar = screen.getByTestId('rcc-receiving-progress');
    expect(bar.textContent).toContain('1 / 2 lines received');
    const fill = bar.querySelector('.bg-emerald-500') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('shows full breakdown with mixed states: fully received, partial, and unreceived', () => {
    const lines = [
      makeLine('10', '10'),
      makeLine('10', '5'),
      makeLine('10', '0'),
      makeLine('10', '10'),
    ];
    render(<ReceivingProgressBar lines={lines} />);
    expect(screen.getByTestId('rcc-full-count').textContent).toBe('2 full');
    expect(screen.getByTestId('rcc-partial-count').textContent).toBe('1 partial');
    expect(screen.getByTestId('rcc-open-count').textContent).toBe('1 open');
    const bar = screen.getByTestId('rcc-receiving-progress');
    const fullFill = bar.querySelector('[data-testid="rcc-progress-full"]') as HTMLElement;
    expect(fullFill.style.width).toBe('50%');
    const partialFill = bar.querySelector('[data-testid="rcc-progress-partial"]') as HTMLElement;
    expect(partialFill.style.width).toBe('25%');
  });

  it('shows multiple partial lines correctly', () => {
    const lines = [
      makeLine('10', '3'),
      makeLine('10', '7'),
      makeLine('10', '10'),
    ];
    render(<ReceivingProgressBar lines={lines} />);
    expect(screen.getByTestId('rcc-full-count').textContent).toBe('1 full');
    expect(screen.getByTestId('rcc-partial-count').textContent).toBe('2 partial');
    expect(screen.getByTestId('rcc-open-count').textContent).toBe('0 open');
  });

  it('rounds percentage to nearest integer', () => {
    const lines = [
      makeLine('5', '5'),
      makeLine('5', '5'),
      makeLine('5', '0'),
    ];
    render(<ReceivingProgressBar lines={lines} />);
    const fill = screen.getByTestId('rcc-receiving-progress').querySelector('.bg-emerald-500') as HTMLElement;
    expect(fill.style.width).toBe('67%');
  });

  it('caps bar at 100% even if somehow receivedLines exceeds totalLines', () => {
    const lines = [makeLine('5', '5')];
    render(<ReceivingProgressBar lines={lines} />);
    const fill = screen.getByTestId('rcc-receiving-progress').querySelector('.bg-emerald-500') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('does not show partial breakdown when all lines are fully received', () => {
    const lines = [makeLine('5', '5'), makeLine('10', '10')];
    render(<ReceivingProgressBar lines={lines} />);
    expect(screen.queryByTestId('rcc-full-count')).toBeNull();
    expect(screen.queryByTestId('rcc-partial-count')).toBeNull();
    expect(screen.getByTestId('rcc-receiving-progress').textContent).toContain('2 / 2 lines received');
  });

  it('does not show partial breakdown when no lines have been received', () => {
    const lines = [makeLine('5', '0'), makeLine('10', '0')];
    render(<ReceivingProgressBar lines={lines} />);
    expect(screen.queryByTestId('rcc-partial-count')).toBeNull();
    expect(screen.getByTestId('rcc-receiving-progress').textContent).toContain('0 / 2 lines received');
  });

  it('amber segment is always visible when a partial line exists even if full lines dominate', () => {
    // 199 full + 1 partial: rawFullPct would round to 100 without the guard
    const lines = [
      ...Array.from({ length: 199 }, () => makeLine('1', '1')),
      makeLine('1', '0.5' as unknown as string),
    ];
    render(<ReceivingProgressBar lines={lines} />);
    const bar = screen.getByTestId('rcc-receiving-progress');
    const partialFill = bar.querySelector('[data-testid="rcc-progress-partial"]') as HTMLElement;
    const pct = parseInt(partialFill.style.width, 10);
    expect(pct).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('rcc-partial-count').textContent).toBe('1 partial');
  });
});

// ── getRccCompleteInvalidationKeys — pure-function contract ────────────────────

describe('getRccCompleteInvalidationKeys — cache invalidation after receipt completion', () => {
  it('always includes the broad /api/vendor-pos list key', () => {
    const keys = getRccCompleteInvalidationKeys();
    const firstSegments = keys.map((k) => k[0]);
    expect(firstSegments).toContain('/api/vendor-pos');
  });

  it('includes the per-PO key ["/api/vendor-pos", vendorPoId] when vendorPoId is provided', () => {
    const vendorPoId = 42;
    const keys = getRccCompleteInvalidationKeys(vendorPoId);
    const match = keys.find(
      (k) => k[0] === '/api/vendor-pos' && k[1] === vendorPoId,
    );
    expect(match).toBeDefined();
  });

  it('does NOT include a per-PO key when vendorPoId is undefined', () => {
    const keys = getRccCompleteInvalidationKeys(undefined);
    const perPoKeys = keys.filter(
      (k) => k[0] === '/api/vendor-pos' && k.length > 1,
    );
    expect(perPoKeys).toHaveLength(0);
  });

  it('does NOT include a per-PO key when vendorPoId is null', () => {
    const keys = getRccCompleteInvalidationKeys(null);
    const perPoKeys = keys.filter(
      (k) => k[0] === '/api/vendor-pos' && k.length > 1,
    );
    expect(perPoKeys).toHaveLength(0);
  });

  it('returns exactly two keys when vendorPoId is present', () => {
    const keys = getRccCompleteInvalidationKeys(7);
    expect(keys).toHaveLength(2);
  });

  it('returns exactly one key when vendorPoId is absent', () => {
    const keys = getRccCompleteInvalidationKeys();
    expect(keys).toHaveLength(1);
  });

  it('per-PO key contains the vendorPoId as a number in the second position', () => {
    const keys = getRccCompleteInvalidationKeys(99);
    const perPoKey = keys.find((k) => k.length === 2 && k[0] === '/api/vendor-pos');
    expect(perPoKey).toBeDefined();
    expect(perPoKey![1]).toBe(99);
  });

  it('includes the per-PO key when vendorPoId is 0 (falsy but defined)', () => {
    const keys = getRccCompleteInvalidationKeys(0);
    const perPoKey = keys.find((k) => k.length === 2 && k[0] === '/api/vendor-pos');
    expect(perPoKey).toBeDefined();
    expect(perPoKey![1]).toBe(0);
  });
});

// ── PutawayStep — completeReceiptMutation cache invalidation behavior ──────────

describe('PutawayStep — completeReceiptMutation invalidates the correct query keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates the broad /api/vendor-pos list key after completing a receipt', async () => {
    const completedReceipt = makeReceipt({ status: 'complete' });
    mockApiRequest.mockResolvedValueOnce(completedReceipt);

    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    renderPutawayStep(makeReceipt(), { qc });

    fireEvent.click(screen.getByText('Complete Receipt'));

    await waitFor(() => {
      const calledKeys = invalidateSpy.mock.calls.map(
        (call) => (call[0] as { queryKey: unknown[] }).queryKey
      );
      const hasBroadKey = calledKeys.some(
        (k) => k.length === 1 && k[0] === '/api/vendor-pos'
      );
      expect(hasBroadKey).toBe(true);
    });
  });

  it('invalidates the per-PO key ["/api/vendor-pos", vendorPoId] when the receipt has a vendorPoId', async () => {
    const vendorPoId = 55;
    const completedReceipt = makeReceipt({ vendorPoId, status: 'complete' });
    mockApiRequest.mockResolvedValueOnce(completedReceipt);

    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    renderPutawayStep(makeReceipt({ vendorPoId }), { qc });

    fireEvent.click(screen.getByText('Complete Receipt'));

    await waitFor(() => {
      const calledKeys = invalidateSpy.mock.calls.map(
        (call) => (call[0] as { queryKey: unknown[] }).queryKey
      );
      const hasPerPoKey = calledKeys.some(
        (k) => k[0] === '/api/vendor-pos' && k[1] === vendorPoId
      );
      expect(hasPerPoKey).toBe(true);
    });
  });

  it('does NOT invalidate a per-PO key when the receipt has no vendorPoId', async () => {
    const completedReceipt = makeReceipt({ status: 'complete' });
    mockApiRequest.mockResolvedValueOnce(completedReceipt);

    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    renderPutawayStep(makeReceipt({ vendorPoId: undefined }), { qc });

    fireEvent.click(screen.getByText('Complete Receipt'));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalled();
    });

    const calledKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey
    );
    const perPoKeys = calledKeys.filter(
      (k) => k[0] === '/api/vendor-pos' && k.length > 1
    );
    expect(perPoKeys).toHaveLength(0);
  });

  it('calls onComplete after a successful receipt completion', async () => {
    const completedReceipt = makeReceipt({ status: 'complete' });
    mockApiRequest.mockResolvedValueOnce(completedReceipt);

    const onComplete = vi.fn();
    renderPutawayStep(makeReceipt(), { onComplete });

    fireEvent.click(screen.getByText('Complete Receipt'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an error toast when the completion API call fails', async () => {
    mockApiRequest.mockRejectedValueOnce(new Error('Server error'));

    renderPutawayStep(makeReceipt());

    fireEvent.click(screen.getByText('Complete Receipt'));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to complete receipt');
    });
  });
});
