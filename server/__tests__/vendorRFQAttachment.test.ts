import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
}));

vi.mock('../utils/pdf/vendorPoPdf', () => ({
  generateVendorPoPdf: vi.fn().mockResolvedValue(Buffer.from('fake pdf')),
}));

vi.mock('../storage', () => ({
  storage: { getVendorPoAttachment: vi.fn() },
}));

import { buildAttachments } from '../communication/attachments';
import { storage } from '../storage';

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

  it('includes selected supporting PDFs with the RFQ', async () => {
    vi.mocked(storage.getVendorPoAttachment).mockResolvedValue({
      id: 7,
      vendorPoId: 42,
      originalFileName: 'vendor-quote.pdf',
      mimeType: 'application/pdf',
      filePath: __filename,
    } as any);

    const built = await buildAttachments(
      'vendor_rfq',
      { po_number: 'RFQ-123', email_attachment_ids: [7] },
      {
        key: 'vendor_rfq',
        attachmentRules: { attachVendorPOPDF: false },
      } as any,
      '42'
    );

    expect(built.meta.map((item) => item.filename)).toContain(
      'vendor-quote.pdf'
    );
  });
});
