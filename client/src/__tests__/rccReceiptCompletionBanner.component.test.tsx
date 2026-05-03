import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LineItemsBanner } from '../pages/InventoryReceivingControlCenter';

type Line = Parameters<typeof LineItemsBanner>[0]['lines'][number];

function makeLine(orderedQty: string, receivedQty: string): Line {
  return {
    id: Math.random(),
    receiptId: 1,
    orderedQty,
    receivedQty,
  };
}

describe('LineItemsBanner', () => {
  it('renders nothing when there are no lines', () => {
    const { container } = render(<LineItemsBanner lines={[]} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('line-items-completion-banner')).toBeNull();
  });

  it('shows the completion banner when all lines are exactly fully received', () => {
    const lines = [makeLine('10', '10'), makeLine('5', '5')];
    render(<LineItemsBanner lines={lines} />);
    const banner = screen.getByTestId('line-items-completion-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('All 2 lines fully received');
  });

  it('shows the correct singular form for a single line', () => {
    const lines = [makeLine('3', '3')];
    render(<LineItemsBanner lines={lines} />);
    const banner = screen.getByTestId('line-items-completion-banner');
    expect(banner.textContent).toContain('All 1 line fully received');
    expect(banner.textContent).not.toContain('lines');
  });

  it('shows the correct count in the banner text', () => {
    const lines = [makeLine('2', '2'), makeLine('7', '7'), makeLine('1', '1')];
    render(<LineItemsBanner lines={lines} />);
    const banner = screen.getByTestId('line-items-completion-banner');
    expect(banner.textContent).toContain('All 3 lines fully received');
  });

  it('completion banner is absent when any line is Pending (receivedQty = 0)', () => {
    const lines = [makeLine('10', '10'), makeLine('5', '0')];
    render(<LineItemsBanner lines={lines} />);
    expect(screen.queryByTestId('line-items-completion-banner')).toBeNull();
  });

  it('completion banner is absent when any line is Partial (receivedQty < orderedQty)', () => {
    const lines = [makeLine('10', '10'), makeLine('10', '4')];
    render(<LineItemsBanner lines={lines} />);
    expect(screen.queryByTestId('line-items-completion-banner')).toBeNull();
  });

  it('completion banner is absent when all lines are pending', () => {
    const lines = [makeLine('5', '0'), makeLine('8', '0')];
    render(<LineItemsBanner lines={lines} />);
    expect(screen.queryByTestId('line-items-completion-banner')).toBeNull();
  });

  it('shows the completion banner when a line is over-received, with descriptive text', () => {
    const lines = [makeLine('10', '15'), makeLine('5', '5')];
    render(<LineItemsBanner lines={lines} />);
    const banner = screen.getByTestId('line-items-completion-banner');
    expect(banner.textContent).toContain('1 line over-received');
    expect(banner.textContent).toContain('ready to finalize');
  });

  it('shows only over-received count when all lines are over-received', () => {
    const lines = [makeLine('5', '10'), makeLine('3', '7')];
    render(<LineItemsBanner lines={lines} />);
    const banner = screen.getByTestId('line-items-completion-banner');
    expect(banner.textContent).toContain('2 lines over-received');
    expect(banner.textContent).not.toContain('fully received');
  });

  it('completion banner is absent when all lines have orderedQty of 0', () => {
    const lines = [makeLine('0', '0'), makeLine('0', '0')];
    render(<LineItemsBanner lines={lines} />);
    expect(screen.queryByTestId('line-items-completion-banner')).toBeNull();
  });

  it('includes the "ready to finalize" message when shown', () => {
    const lines = [makeLine('4', '4')];
    render(<LineItemsBanner lines={lines} />);
    const banner = screen.getByTestId('line-items-completion-banner');
    expect(banner.textContent).toContain('ready to finalize');
  });

  it('shows both fully received and over-received counts in mixed case', () => {
    const lines = [makeLine('10', '10'), makeLine('5', '8')];
    render(<LineItemsBanner lines={lines} />);
    const banner = screen.getByTestId('line-items-completion-banner');
    expect(banner.textContent).toContain('1 line fully received');
    expect(banner.textContent).toContain('1 line over-received');
    expect(banner.textContent).toContain('ready to finalize');
  });

  it('shows the over-received warning when any line exceeds ordered quantity', () => {
    const lines = [makeLine('10', '15'), makeLine('5', '5')];
    render(<LineItemsBanner lines={lines} />);
    const warning = screen.getByTestId('line-items-over-received-warning');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('received more than ordered');
  });

  it('over-received warning is absent when no lines are over-received', () => {
    const lines = [makeLine('10', '10'), makeLine('5', '5')];
    render(<LineItemsBanner lines={lines} />);
    expect(screen.queryByTestId('line-items-over-received-warning')).toBeNull();
  });
});
