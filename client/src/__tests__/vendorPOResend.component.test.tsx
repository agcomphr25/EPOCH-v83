/**
 * Component test for VendorPOManager — resend PO success path.
 *
 * Verifies that after a successful resend mutation,
 * queryClient.invalidateQueries is called with the confirmation-status key
 * ['/api/vendor-pos', id, 'confirmation'] UNCONDITIONALLY — both when the
 * email was delivered (emailSent: true) and when it was not (emailSent: false).
 *
 * This prevents the regression where the invalidation was gated inside the
 * `if (data.emailSent)` branch, leaving the confirmation card stale on failures.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import VendorPOManager from '../components/inventory/VendorPOManager';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/inventory/VendorPOItemSelector', () => ({
  default: () => null,
}));

// ── Test data ─────────────────────────────────────────────────────────────────

const VENDOR_PO_ID = 1;

const TEST_PO = {
  id: VENDOR_PO_ID,
  poNumber: 'PO-TEST-001',
  vendorId: 10,
  vendorName: 'Acme Supplies',
  status: 'Sent',
  totalCost: 250,
  barcode: 'BARCODE-TEST',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  isCurrentRevision: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: {
      get: (name: string) =>
        name === 'content-type' ? 'application/json' : null,
    },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function buildFetchMock(resendPayload: { emailSent: boolean; emailRecipient?: string; message?: string }) {
  return vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    const u = String(url);
    const method = (options?.method || 'GET').toUpperCase();

    // POST resend
    if (method === 'POST' && u.includes('/resend')) {
      return makeJsonResponse(resendPayload);
    }
    // Email preview (must match before the broader /vendor-pos checks)
    if (method === 'POST' && u.includes('/email-preview')) {
      return makeJsonResponse({
        subject: 'Purchase Order PO-TEST-001',
        to: 'contact@acme.com',
        cc: [],
        replyTo: 'purchasing@agcomposites.com',
        html: '<p>PO resend preview</p>',
        text: 'PO resend preview',
        attachments: [],
        fingerprint: 'test-preview-fingerprint',
        officialPoNumberPending: false,
      });
    }
    // Email recipients (must match before broader /vendor-pos checks)
    if (u.includes('/email-recipients')) {
      return makeJsonResponse([
        { name: 'Acme Contact', email: 'contact@acme.com', type: 'primary' },
      ]);
    }
    // Confirmation status (3-segment path, match before broad list)
    if (u.includes('/confirmation')) {
      return makeJsonResponse({
        found: true,
        email: 'contact@acme.com',
        expiresAt: '2027-01-01T00:00:00Z',
      });
    }
    // Attachment list
    if (u.includes('/vendor-po-attachments')) {
      return makeJsonResponse([]);
    }
    // Per-PO detail: /api/vendor-pos/1  (no trailing segment)
    if (new RegExp(`/api/vendor-pos/${VENDOR_PO_ID}$`).test(u)) {
      return makeJsonResponse(TEST_PO);
    }
    // Vendor PO list
    if (u.includes('/api/vendor-pos')) {
      return makeJsonResponse({ data: [TEST_PO], meta: {} });
    }
    // Vendors dropdown (used by the create/edit form)
    if (u.includes('/api/vendors')) {
      return makeJsonResponse({ data: [], meta: {} });
    }
    return makeJsonResponse(null);
  });
}

function renderManager(queryClient: QueryClient) {
  render(
    <QueryClientProvider client={queryClient}>
      <VendorPOManager />
    </QueryClientProvider>,
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('VendorPOManager — resend PO cache invalidation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            const res = await fetch((queryKey as string[]).join('/'));
            if (!res.ok) throw new Error(`${res.status}`);
            return res.json();
          },
        },
        mutations: { retry: false },
      },
    });
    vi.spyOn(queryClient, 'invalidateQueries');
  });

  afterEach(() => {
    queryClient.clear();
  });

  async function performResend(resendPayload: { emailSent: boolean; emailRecipient?: string; message?: string }) {
    global.fetch = buildFetchMock(resendPayload);
    renderManager(queryClient);

    // Wait for PO list to render
    await waitFor(() =>
      expect(screen.getByTestId(`accordion-trigger-${VENDOR_PO_ID}`)).toBeInTheDocument(),
    );

    // Expand the accordion so the card buttons are visible
    fireEvent.click(screen.getByTestId(`accordion-trigger-${VENDOR_PO_ID}`));

    // Click "View Items" to navigate into the detail view
    await waitFor(() =>
      expect(screen.getByTestId(`button-view-items-${VENDOR_PO_ID}`)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId(`button-view-items-${VENDOR_PO_ID}`));

    // Wait for detail view with the Resend PO button
    await waitFor(() =>
      expect(screen.getByTestId('button-resend-po')).toBeInTheDocument(),
    );

    // Open the resend dialog
    fireEvent.click(screen.getByTestId('button-resend-po'));

    // Wait for the confirm-resend button to become enabled (recipient loaded)
    await waitFor(() => {
      const confirmBtn = screen.getByTestId('button-confirm-resend-po');
      expect(confirmBtn).not.toBeDisabled();
    });

    // Submit the resend
    fireEvent.click(screen.getByTestId('button-confirm-resend-po'));
  }

  it('invalidates the confirmation-status key when emailSent is true', async () => {
    await performResend({ emailSent: true, emailRecipient: 'contact@acme.com' });

    await waitFor(() => {
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['/api/vendor-pos', VENDOR_PO_ID, 'confirmation'],
        }),
      );
    });
  });

  it('invalidates the confirmation-status key even when emailSent is false', async () => {
    await performResend({ emailSent: false, message: 'SMTP unavailable' });

    await waitFor(() => {
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['/api/vendor-pos', VENDOR_PO_ID, 'confirmation'],
        }),
      );
    });
  });
});
