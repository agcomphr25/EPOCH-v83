import { describe, expect, it, vi } from 'vitest';
import { PDFParse } from 'pdf-parse';

vi.mock('../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        limit: async () => [],
      }),
    }),
  },
}));

import { generatePackingSlipPdf } from '../utils/pdf/packingSlipPdf';

describe('P2 packing slip PDF document numbers', () => {
  it('keeps the packing slip number in the heading and the invoice number in its own field', async () => {
    const bytes = await generatePackingSlipPdf({
      packingSlipNumber: 'ROC26-0002',
      invoiceNumber: 'ROC26-0004',
      date: 'May 28, 2026',
      customerName: 'Rock West Composites',
      totalQuantity: 18,
      items: [{
        partNumber: '48317-3 Rev E',
        description: '12" Blank Fuselage Tube',
        quantity: 18,
      }],
    });

    const parser = new PDFParse({ data: bytes });
    try {
      const { text } = await parser.getText();
      expect(text).toMatch(/PACKING SLIP\s+ROC26-0002/);
      expect(text).toMatch(/Invoice #\s+ROC26-0004/);
    } finally {
      await parser.destroy();
    }
  });
});
