import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBomDetailsPrintHtml, buildPartsRequestPrintHtml, openPrintDocument } from '@/lib/draftBomPrint';

const input = {
  draft: {
    name: 'Wing <Assembly>',
    revision: 'B',
    projectName: 'P2 Demo',
    projectCode: 'P2-001',
    owner: 'Quality & Engineering',
    notes: 'Use approved material only.',
    updatedAt: '2026-07-29T12:00:00.000Z',
  },
  lines: [{
    id: 'line-1',
    include: true,
    action: 'Order',
    category: 'Hardware',
    supplier: 'L. Miller & Sons',
    manufacturer: 'ACME',
    supplierItemId: 'SUP-100',
    agPartNumber: 'AG-100',
    description: '<script>alert("x")</script> Bolt',
    unit: 'EA',
    unitCost: 2.5,
    actualCost: 2.25,
    qtyNeeded: 4,
    status: 'Needs Quote',
    targetNeedDate: '2026-08-15',
    note: 'Certificate required',
    partsRequestId: 42,
    partsRequestStatus: 'DRAFT',
    customFields: { Finish: 'Passivated' },
  }],
  summary: {
    lineCount: 1,
    materialTotal: 10,
    laborTotal: 20,
    laborHours: 2,
    nrcTotal: 0,
    selectedTotal: 10,
  },
  customColumns: ['Finish'],
  printedAt: new Date('2026-07-29T15:00:00.000Z'),
};

describe('draft BOM print documents', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('builds a complete, escaped BOM details document', () => {
    const html = buildBomDetailsPrintHtml(input);

    expect(html).toContain('BOM Details');
    expect(html).toContain('Wing &lt;Assembly&gt;');
    expect(html).toContain('P2-001');
    expect(html).toContain('AG-100');
    expect(html).toContain('Passivated');
    expect(html).toContain('$10.00');
    expect(html).toContain('onclick="window.print()"');
    expect(html).not.toContain('<script>');
  });

  it('builds a parts request document with request and cost details', () => {
    const html = buildPartsRequestPrintHtml(input);

    expect(html).toContain('Parts Request');
    expect(html).toContain('PR-42');
    expect(html).toContain('DRAFT');
    expect(html).toContain('L. Miller &amp; Sons');
    expect(html).toContain('$2.25');
    expect(html).toContain('Certificate required');
    expect(html).toContain('Review the document below, then select Print.');
    expect(html).not.toContain('<script>');
  });

  it('writes and prints through a separate browser window', () => {
    const loadHandlers: Array<() => void> = [];
    const printWindow = {
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
      addEventListener: vi.fn((_event: string, handler: () => void) => loadHandlers.push(handler)),
    };
    vi.stubGlobal('window', {
      open: vi.fn(() => printWindow),
      setTimeout: (callback: () => void) => callback(),
    });

    expect(openPrintDocument('<html>print me</html>')).toBe(true);
    expect(printWindow.document.write).toHaveBeenCalledWith('<html>print me</html>');
    loadHandlers[0]();
    expect(printWindow.print).toHaveBeenCalledOnce();
  });

  it('reports a blocked print window', () => {
    vi.stubGlobal('window', { open: vi.fn(() => null) });
    expect(openPrintDocument('<html></html>')).toBe(false);
  });
});
