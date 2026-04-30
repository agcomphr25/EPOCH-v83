/**
 * Component test for P2ReceivingDialog — receive success path.
 *
 * Verifies that after a successful receive mutation, queryClient.invalidateQueries
 * is called with the per-PO key ['/api/vendor-pos', vendorPoId].  This ensures
 * the progress bar data is always refreshed after an item is received.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import P2ReceivingDialog from '../components/inventory/P2ReceivingDialog';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// SmartLotInput makes its own API calls; replace it with a simple input stub.
vi.mock('@/components/SmartLotInput', () => ({
  default: ({ id, label, value, onChange, placeholder }: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const VENDOR_PO_ID = 99;

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    agPartNumber: 'AG-WIDGET-001',
    name: 'Widget',
    vendorPoId: VENDOR_PO_ID,
    ...overrides,
  };
}

function renderDialog(item: Record<string, unknown>, queryClient: QueryClient) {
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <P2ReceivingDialog open={true} onOpenChange={onOpenChange} item={item} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

function mockFetchSuccess() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/inventory/scan')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 1 }),
      });
    }
    if (String(url).includes('/receive')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('P2ReceivingDialog — cache invalidation after receive', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(queryClient, 'invalidateQueries');
    mockFetchSuccess();
  });

  it('invalidates the per-PO query key ["/api/vendor-pos", vendorPoId] on success', async () => {
    renderDialog(makeItem(), queryClient);

    // Fill in the required fields (Manufacture Date, Expiration Date, Batch Number, Lot Number).
    fireEvent.change(screen.getByLabelText(/manufacturing date/i), {
      target: { value: '2025-01-15' },
    });
    fireEvent.change(screen.getByLabelText(/expiration date/i), {
      target: { value: '2026-01-15' },
    });
    fireEvent.change(screen.getByLabelText(/batch number/i), {
      target: { value: 'BATCH-001' },
    });
    fireEvent.change(screen.getByLabelText(/lot number/i), {
      target: { value: 'LOT-001' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save p2 record/i }));

    await waitFor(() => {
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['/api/vendor-pos', VENDOR_PO_ID] }),
      );
    });
  });

  it('invalidates the broad /api/vendor-pos list key on success', async () => {
    renderDialog(makeItem(), queryClient);

    fireEvent.change(screen.getByLabelText(/manufacturing date/i), {
      target: { value: '2025-01-15' },
    });
    fireEvent.change(screen.getByLabelText(/expiration date/i), {
      target: { value: '2026-01-15' },
    });
    fireEvent.change(screen.getByLabelText(/batch number/i), {
      target: { value: 'BATCH-001' },
    });
    fireEvent.change(screen.getByLabelText(/lot number/i), {
      target: { value: 'LOT-001' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save p2 record/i }));

    await waitFor(() => {
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['/api/vendor-pos'] }),
      );
    });
  });

  it('does NOT call the per-PO invalidation when item has no vendorPoId', async () => {
    renderDialog(makeItem({ vendorPoId: undefined }), queryClient);

    fireEvent.change(screen.getByLabelText(/manufacturing date/i), {
      target: { value: '2025-01-15' },
    });
    fireEvent.change(screen.getByLabelText(/expiration date/i), {
      target: { value: '2026-01-15' },
    });
    fireEvent.change(screen.getByLabelText(/batch number/i), {
      target: { value: 'BATCH-001' },
    });
    fireEvent.change(screen.getByLabelText(/lot number/i), {
      target: { value: 'LOT-001' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save p2 record/i }));

    await waitFor(() => {
      // Broad list key should be invalidated
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['/api/vendor-pos'] }),
      );
    });

    // Per-PO key (with a second segment) should NOT appear
    const calls = vi.mocked(queryClient.invalidateQueries).mock.calls;
    const perPoCall = calls.find(
      ([opts]) =>
        Array.isArray((opts as { queryKey?: unknown[] }).queryKey) &&
        (opts as { queryKey: unknown[] }).queryKey.length > 1 &&
        (opts as { queryKey: unknown[] }).queryKey[0] === '/api/vendor-pos',
    );
    expect(perPoCall).toBeUndefined();
  });
});
