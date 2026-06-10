import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
}));

vi.mock('../utils/pdf/vendorPoPdf', () => ({
  generateVendorPoPdf: vi.fn().mockResolvedValue(Buffer.from('fake pdf')),
}));

import { buildAttachments } from '../communication/attachments';

describe('vendor RFQ email attachments', () => {
  it('attaches the generated RFQ PDF with an RFQ filename', async () => {
    const built = await buildAttachments(
      'vendor_rfq',
      { po_number: 'RFQ-123' },
      {
        key: 'vendor_rfq',
        attachmentRules: { attachVendorPOPDF: true },
      } as any,
      '42'
    );

    expect(built.attachments).toHaveLength(1);
    expect(built.attachments[0].filename).toBe('Vendor_RFQ_RFQ-123.pdf');
    expect(built.attachments[0].type).toBe('application/pdf');
    expect(built.meta[0].filename).toBe('Vendor_RFQ_RFQ-123.pdf');
  });
});
