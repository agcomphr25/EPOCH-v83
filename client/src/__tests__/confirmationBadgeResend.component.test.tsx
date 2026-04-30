/**
 * Tests that the "Awaiting" / "Link Expired" badge inside the PO accordion
 * header does NOT propagate pointer/touch/click events up to the AccordionTrigger
 * when tapped on mobile.
 *
 * Background (task #1138):
 * Radix UI Accordion fires its toggle on the `pointerdown` event (not just
 * `click`).  On touch devices the event order is:
 *   touchstart → pointerdown → pointerup → click
 * The badge span must stop ALL of these from bubbling, otherwise the accordion
 * opens/closes whenever the user taps the badge to open the resend popover.
 *
 * These tests render the REAL ConfirmationBadgeResend component exported from
 * VendorPOManager.tsx, so removing a stopPropagation call from the production
 * code will cause the corresponding test to fail.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmationBadgeResend } from '../components/inventory/VendorPOManager';

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn().mockResolvedValue({ found: false }),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Minimal VendorPO shapes — only the fields ConfirmationBadgeResend actually reads.
// The type is local to VendorPOManager, so we cast via unknown to satisfy TypeScript
// without polluting the import surface.
function makePo(badge: 'awaiting' | 'expired') {
  return { id: 1, confirmationBadge: badge, vendorName: 'Test Vendor' } as unknown as Parameters<
    typeof ConfirmationBadgeResend
  >[0]['vendorPo'];
}

// Wrapper that renders the real badge inside a parent element whose event
// handlers are individually trackable.
function renderBadge(
  badge: 'awaiting' | 'expired',
  onParentPointerDown: () => void,
  onParentTouchStart: () => void,
  onParentClick: () => void,
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <div
        data-testid="accordion-trigger"
        onPointerDown={() => onParentPointerDown()}
        onTouchStart={() => onParentTouchStart()}
        onClick={() => onParentClick()}
      >
        <ConfirmationBadgeResend vendorPo={makePo(badge)} />
      </div>
    </QueryClientProvider>,
  );
}

describe('ConfirmationBadgeResend — event isolation from AccordionTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── "Awaiting" badge ────────────────────────────────────────────────────────

  it('does NOT propagate pointerdown to the parent when the "Awaiting" badge is tapped', () => {
    const parentHandler = vi.fn();
    renderBadge('awaiting', parentHandler, vi.fn(), vi.fn());

    fireEvent.pointerDown(screen.getByRole('button', { name: /awaiting/i }));

    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('does NOT propagate touchstart to the parent when the "Awaiting" badge is tapped', () => {
    const parentHandler = vi.fn();
    renderBadge('awaiting', vi.fn(), parentHandler, vi.fn());

    fireEvent.touchStart(screen.getByRole('button', { name: /awaiting/i }));

    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('does NOT propagate click to the parent when the "Awaiting" badge is clicked', () => {
    const parentHandler = vi.fn();
    renderBadge('awaiting', vi.fn(), vi.fn(), parentHandler);

    fireEvent.click(screen.getByRole('button', { name: /awaiting/i }));

    expect(parentHandler).not.toHaveBeenCalled();
  });

  // ── "Link Expired" badge ────────────────────────────────────────────────────

  it('does NOT propagate pointerdown to the parent when the "Link Expired" badge is tapped', () => {
    const parentHandler = vi.fn();
    renderBadge('expired', parentHandler, vi.fn(), vi.fn());

    fireEvent.pointerDown(screen.getByRole('button', { name: /link expired/i }));

    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('does NOT propagate touchstart to the parent when the "Link Expired" badge is tapped', () => {
    const parentHandler = vi.fn();
    renderBadge('expired', vi.fn(), parentHandler, vi.fn());

    fireEvent.touchStart(screen.getByRole('button', { name: /link expired/i }));

    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('does NOT propagate click to the parent when the "Link Expired" badge is clicked', () => {
    const parentHandler = vi.fn();
    renderBadge('expired', vi.fn(), vi.fn(), parentHandler);

    fireEvent.click(screen.getByRole('button', { name: /link expired/i }));

    expect(parentHandler).not.toHaveBeenCalled();
  });

  // ── Control ─────────────────────────────────────────────────────────────────
  // Confirms that the parent listener itself works — it just doesn't receive
  // events that originated inside the badge span.

  it('DOES fire the parent pointerdown handler when the accordion trigger itself is tapped', () => {
    const parentHandler = vi.fn();
    renderBadge('awaiting', parentHandler, vi.fn(), vi.fn());

    fireEvent.pointerDown(screen.getByTestId('accordion-trigger'));

    expect(parentHandler).toHaveBeenCalledTimes(1);
  });
});
