import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getLineStatus, LineStatusBadge } from '../pages/InventoryReceivingControlCenter';

// ── getLineStatus (pure helper) ───────────────────────────────────────────────

describe('getLineStatus', () => {
  it('returns pending when receivedQty is 0 and orderedQty > 0', () => {
    const info = getLineStatus('10', '0');
    expect(info.status).toBe('pending');
    expect(info.isPending).toBe(true);
    expect(info.isPartial).toBe(false);
    expect(info.isComplete).toBe(false);
    expect(info.isOver).toBe(false);
    expect(info.isManual).toBe(false);
  });

  it('returns partial when receivedQty is between 0 and orderedQty', () => {
    const info = getLineStatus('10', '4');
    expect(info.status).toBe('partial');
    expect(info.isPartial).toBe(true);
    expect(info.isPending).toBe(false);
    expect(info.isComplete).toBe(false);
    expect(info.isOver).toBe(false);
  });

  it('returns complete when receivedQty equals orderedQty', () => {
    const info = getLineStatus('10', '10');
    expect(info.status).toBe('complete');
    expect(info.isComplete).toBe(true);
    expect(info.isOver).toBe(false);
    expect(info.isPartial).toBe(false);
    expect(info.isPending).toBe(false);
  });

  it('returns over when receivedQty exceeds orderedQty', () => {
    const info = getLineStatus('10', '15');
    expect(info.status).toBe('over');
    expect(info.isOver).toBe(true);
    expect(info.isComplete).toBe(false);
    expect(info.isPartial).toBe(false);
    expect(info.isPending).toBe(false);
  });

  it('returns manual when orderedQty is 0', () => {
    const info = getLineStatus('0', '0');
    expect(info.status).toBe('manual');
    expect(info.isManual).toBe(true);
    expect(info.isPending).toBe(false);
  });

  it('returns manual when orderedQty is null', () => {
    const info = getLineStatus(null, '5');
    expect(info.status).toBe('manual');
    expect(info.isManual).toBe(true);
  });

  it('returns manual when orderedQty is undefined', () => {
    const info = getLineStatus(undefined, undefined);
    expect(info.status).toBe('manual');
    expect(info.isManual).toBe(true);
  });

  it('accepts numeric arguments', () => {
    const info = getLineStatus(10, 5);
    expect(info.status).toBe('partial');
  });

  // ── rowClassName ─────────────────────────────────────────────────────────────

  it('rowClassName contains green classes for complete', () => {
    const info = getLineStatus('5', '5');
    expect(info.rowClassName).toContain('bg-green-50/60');
    expect(info.rowClassName).toContain('dark:bg-green-900/10');
  });

  it('rowClassName is empty for pending', () => {
    const info = getLineStatus('5', '0');
    expect(info.rowClassName).toBe('');
  });

  it('rowClassName is empty for partial', () => {
    const info = getLineStatus('10', '3');
    expect(info.rowClassName).toBe('');
  });

  it('rowClassName is empty for over', () => {
    const info = getLineStatus('5', '8');
    expect(info.rowClassName).toBe('');
  });

  // ── badgeLabel ───────────────────────────────────────────────────────────────

  it('badgeLabel is "Pending" for pending status', () => {
    expect(getLineStatus('10', '0').badgeLabel).toBe('Pending');
  });

  it('badgeLabel is "Partial" for partial status', () => {
    expect(getLineStatus('10', '3').badgeLabel).toBe('Partial');
  });

  it('badgeLabel is "Fully Received" for complete status', () => {
    expect(getLineStatus('10', '10').badgeLabel).toBe('Fully Received');
  });

  it('badgeLabel is "Over" for over status', () => {
    expect(getLineStatus('10', '12').badgeLabel).toBe('Over');
  });

  it('badgeLabel is "Manual" for manual status', () => {
    expect(getLineStatus('0', '0').badgeLabel).toBe('Manual');
  });

  // ── badgeClassName color hints ────────────────────────────────────────────────

  it('badgeClassName contains orange for over status', () => {
    const { badgeClassName } = getLineStatus('5', '9');
    expect(badgeClassName).toContain('orange');
  });

  it('badgeClassName contains yellow for partial status', () => {
    const { badgeClassName } = getLineStatus('10', '4');
    expect(badgeClassName).toContain('yellow');
  });

  it('badgeClassName contains green for complete status', () => {
    const { badgeClassName } = getLineStatus('8', '8');
    expect(badgeClassName).toContain('green');
  });

  it('badgeClassName contains gray for pending status', () => {
    const { badgeClassName } = getLineStatus('8', '0');
    expect(badgeClassName).toContain('gray');
  });
});

// ── LineStatusBadge (rendered component) ─────────────────────────────────────

describe('LineStatusBadge', () => {
  it('shows "Pending" badge when receivedQty is 0', () => {
    render(<LineStatusBadge orderedQty="10" receivedQty="0" />);
    const badge = screen.getByTestId('line-status-badge');
    expect(badge.textContent).toBe('Pending');
    expect(badge.className).toContain('gray');
  });

  it('shows "Partial" badge when some qty has been received but not all', () => {
    render(<LineStatusBadge orderedQty="10" receivedQty="3" />);
    const badge = screen.getByTestId('line-status-badge');
    expect(badge.textContent).toBe('Partial');
    expect(badge.className).toContain('yellow');
  });

  it('shows "Fully Received" badge when receivedQty equals orderedQty', () => {
    render(<LineStatusBadge orderedQty="10" receivedQty="10" />);
    const badge = screen.getByTestId('line-status-badge');
    expect(badge.textContent).toBe('Fully Received');
    expect(badge.className).toContain('green');
  });

  it('shows "Over" badge when receivedQty exceeds orderedQty', () => {
    render(<LineStatusBadge orderedQty="10" receivedQty="15" />);
    const badge = screen.getByTestId('line-status-badge');
    expect(badge.textContent).toBe('Over');
    expect(badge.className).toContain('orange');
  });

  it('shows "Manual" badge when orderedQty is 0', () => {
    render(<LineStatusBadge orderedQty="0" receivedQty="0" />);
    const badge = screen.getByTestId('line-status-badge');
    expect(badge.textContent).toBe('Manual');
  });

  it('shows "Manual" badge when orderedQty is null', () => {
    render(<LineStatusBadge orderedQty={null} receivedQty={null} />);
    const badge = screen.getByTestId('line-status-badge');
    expect(badge.textContent).toBe('Manual');
  });

  it('shows "Pending" for qty 1 ordered and 0 received', () => {
    render(<LineStatusBadge orderedQty="1" receivedQty="0" />);
    expect(screen.getByTestId('line-status-badge').textContent).toBe('Pending');
  });

  it('shows "Over" badge with orange class for over-received', () => {
    render(<LineStatusBadge orderedQty="5" receivedQty="6" />);
    const badge = screen.getByTestId('line-status-badge');
    expect(badge.textContent).toBe('Over');
    expect(badge.className).toContain('orange');
  });

  it('"Fully Received" badge has a green CSS class', () => {
    render(<LineStatusBadge orderedQty="20" receivedQty="20" />);
    const badge = screen.getByTestId('line-status-badge');
    expect(badge.className).toContain('green');
  });

  it('"Pending" badge has a gray CSS class', () => {
    render(<LineStatusBadge orderedQty="20" receivedQty="0" />);
    const badge = screen.getByTestId('line-status-badge');
    expect(badge.className).toContain('gray');
  });
});
