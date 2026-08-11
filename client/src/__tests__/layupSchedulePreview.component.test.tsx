import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LayupSchedulePreview } from '@/components/LayupSchedulePreview';

vi.mock('jsbarcode', () => ({
  default: (element: SVGSVGElement) => {
    element.appendChild(
      document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    );
  },
}));

const scheduledItems = [
  {
    orderId: 'PO-RFPO-TEST-73-1',
    fbOrderNumber: '',
    stockModel: 'Test Stock',
    customerName: 'Test Customer',
    scheduledDate: '2026-07-20',
    moldId: 'Test Stock-1',
    dayOfWeek: 1,
    dayName: 'Monday',
  },
];

describe('LayupSchedulePreview printing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves a newly generated schedule before writing printable content', async () => {
    const writes: string[] = [];
    let printWindow: {
      document: {
        write: ReturnType<typeof vi.fn>;
        open: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
      };
      close: ReturnType<typeof vi.fn>;
      print: ReturnType<typeof vi.fn>;
      onload: null | (() => void);
    };
    const printDocument = {
      write: vi.fn((value: string) => writes.push(value)),
      open: vi.fn(),
      close: vi.fn(() => expect(printWindow.onload).toBeTypeOf('function')),
    };
    printWindow = {
      document: printDocument,
      close: vi.fn(),
      print: vi.fn(),
      onload: null,
    };
    vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window);

    let finishApproval: (() => void) | undefined;
    const onApprove = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishApproval = resolve;
        })
    );

    render(
      <LayupSchedulePreview
        open
        onClose={vi.fn()}
        scheduledItems={scheduledItems}
        overflowItems={[]}
        weekStart="2026-07-20"
        totalItems={1}
        onApprove={onApprove}
        isApproving={false}
      />
    );

    await waitFor(() =>
      expect(document.querySelector('svg rect')).not.toBeNull()
    );
    fireEvent.click(screen.getByTestId('button-print-schedule'));

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(writes).toEqual([
      '<p style="font-family: sans-serif; padding: 24px">Saving schedule before printing...</p>',
    ]);

    finishApproval?.();

    await waitFor(() =>
      expect(writes.some((value) => value.startsWith('<!DOCTYPE html>'))).toBe(
        true
      )
    );
    expect(printDocument.open).toHaveBeenCalledTimes(1);
    expect(printDocument.close).toHaveBeenCalledTimes(1);
  });

  it('still saves the schedule when the browser blocks the print popup', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onApprove = vi.fn().mockResolvedValue({ entriesSaved: 1 });

    render(
      <LayupSchedulePreview
        open
        onClose={vi.fn()}
        scheduledItems={scheduledItems}
        overflowItems={[]}
        weekStart="2026-07-20"
        totalItems={1}
        onApprove={onApprove}
        isApproving={false}
      />
    );

    await waitFor(() =>
      expect(document.querySelector('svg rect')).not.toBeNull()
    );
    fireEvent.click(screen.getByTestId('button-print-schedule'));

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(alertSpy).toHaveBeenCalledWith(
      'Schedule saved. Please allow popups, then reprint it from Schedule History.'
    );
  });

  it('still saves the schedule when barcode preparation fails', async () => {
    const printWindow = {
      document: { write: vi.fn(), open: vi.fn(), close: vi.fn() },
      close: vi.fn(),
      print: vi.fn(),
      onload: null,
    };
    vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onApprove = vi.fn().mockResolvedValue({ entriesSaved: 1 });

    render(
      <LayupSchedulePreview
        open
        onClose={vi.fn()}
        scheduledItems={scheduledItems}
        overflowItems={[]}
        weekStart="2026-07-20"
        totalItems={1}
        onApprove={onApprove}
        isApproving={false}
      />
    );

    await waitFor(() =>
      expect(document.querySelector('[data-testid="barcode-svg"] rect')).not.toBeNull()
    );
    document.querySelector('[data-testid="barcode-svg"]')?.replaceChildren();
    fireEvent.click(screen.getByTestId('button-print-schedule'));

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(printWindow.close).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Schedule saved, but the barcode was not ready to print. Reprint it from Schedule History.'
    );
  });
});
