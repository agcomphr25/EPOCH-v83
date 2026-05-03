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
  it('shows no banner when lines array is empty', () => {
    const { container } = render(<LineItemsBanner lines={[]} />);
    expect(screen.queryByTestId('line-items-completion-banner')).toBeNull();
    expect(screen.queryByTestId('line-items-over-received-warning')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('shows no banner when some lines are still pending', () => {
    const lines = [
      makeLine('10', '10'),
      makeLine('5', '0'),
    ];
    render(<LineItemsBanner lines={lines} />);
    expect(screen.queryByTestId('line-items-completion-banner')).toBeNull();
    expect(screen.queryByTestId('line-items-over-received-warning')).toBeNull();
  });

  it('shows no banner when all lines are partially received but not complete', () => {
    const lines = [
      makeLine('10', '5'),
      makeLine('8', '4'),
    ];
    render(<LineItemsBanner lines={lines} />);
    expect(screen.queryByTestId('line-items-completion-banner')).toBeNull();
    expect(screen.queryByTestId('line-items-over-received-warning')).toBeNull();
  });

  it('shows green completion banner (no warning) when all lines are exactly received', () => {
    const lines = [
      makeLine('10', '10'),
      makeLine('5', '5'),
      makeLine('20', '20'),
    ];
    render(<LineItemsBanner lines={lines} />);
    const banner = screen.getByTestId('line-items-completion-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('All 3 lines fully received — ready to finalize');
    expect(screen.queryByTestId('line-items-over-received-warning')).toBeNull();
  });

  it('uses singular "line" when there is exactly 1 line exactly received', () => {
    const lines = [makeLine('5', '5')];
    render(<LineItemsBanner lines={lines} />);
    const banner = screen.getByTestId('line-items-completion-banner');
    expect(banner.textContent).toContain('All 1 line fully received — ready to finalize');
  });

  it('shows green banner with mixed text and amber warning when some lines are over-received', () => {
    const lines = [
      makeLine('10', '10'),
      makeLine('5', '8'),
    ];
    render(<LineItemsBanner lines={lines} />);
    const banner = screen.getByTestId('line-items-completion-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('ready to finalize');
    expect(banner.textContent).toContain('1 line fully received');
    expect(banner.textContent).toContain('1 line over-received');
    const warning = screen.getByTestId('line-items-over-received-warning');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('1 line received more than ordered');
    expect(warning.textContent).toContain('verify quantities before finalizing');
  });

  it('shows amber warning with plural "lines" when multiple lines are over-received', () => {
    const lines = [
      makeLine('5', '10'),
      makeLine('3', '6'),
    ];
    render(<LineItemsBanner lines={lines} />);
    const banner = screen.getByTestId('line-items-completion-banner');
    expect(banner.textContent).toContain('2 lines over-received');
    const warning = screen.getByTestId('line-items-over-received-warning');
    expect(warning.textContent).toContain('2 lines received more than ordered');
  });

  it('shows amber warning without green banner when only some lines are over-received but others are still pending', () => {
    const lines = [
      makeLine('5', '10'),
      makeLine('10', '0'),
    ];
    render(<LineItemsBanner lines={lines} />);
    expect(screen.queryByTestId('line-items-completion-banner')).toBeNull();
    const warning = screen.getByTestId('line-items-over-received-warning');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('1 line received more than ordered');
  });

  it('shows only over-received count in banner text when no lines are exactly received', () => {
    const lines = [
      makeLine('5', '10'),
      makeLine('3', '9'),
    ];
    render(<LineItemsBanner lines={lines} />);
    const banner = screen.getByTestId('line-items-completion-banner');
    expect(banner.textContent).not.toContain('fully received');
    expect(banner.textContent).toContain('2 lines over-received — ready to finalize');
  });

  it('ignores lines with orderedQty of 0 for banner calculation', () => {
    const lines = [
      makeLine('0', '0'),
      makeLine('10', '10'),
    ];
    render(<LineItemsBanner lines={lines} />);
    expect(screen.queryByTestId('line-items-completion-banner')).toBeNull();
    expect(screen.queryByTestId('line-items-over-received-warning')).toBeNull();
  });
});
