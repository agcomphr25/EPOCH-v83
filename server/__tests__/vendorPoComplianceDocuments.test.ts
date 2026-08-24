import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));
vi.mock('../storage', () => ({
  storage: { getVendorPoAttachment: vi.fn() },
}));
vi.mock('../utils/pdf/vendorPoPdf', () => ({
  generateVendorPoPdf: vi.fn().mockResolvedValue(Buffer.from('vendor po pdf')),
}));
import { storage } from '../storage';
import { buildAttachments } from '../communication/attachments';

const pdfSource = fs.readFileSync(
  path.resolve(process.cwd(), 'server/utils/pdf/vendorPoPdf.ts'),
  'utf8'
);

describe('vendor PO compliance documents', () => {
  beforeEach(() => {
    vi.mocked(storage.getVendorPoAttachment).mockResolvedValue({
      id: 7,
      vendorPoId: 42,
      originalFileName: 'Customer FAR Schedule.pdf',
      mimeType: 'application/pdf',
      filePath: path.resolve(process.cwd(), 'server/__tests__/vendorPoComplianceDocuments.test.ts'),
    } as any);
  });

  it('prints the DPAS rating on the PO PDF without forcing flowdown text', () => {
    expect(pdfSource).toContain("y = drawBlock(state, y, 'DPAS Rating'");
    expect(pdfSource).not.toContain("'Contractual Flowdowns'");
  });

  it('attaches the standard PO and any selected PDF with hashed metadata', async () => {
    const built = await buildAttachments(
      'vendor_po_issue',
      { po_number: 'VPO-26042', email_attachment_ids: [7] },
      {
        key: 'vendor_po_issue',
        attachmentRules: { attachVendorPOPDF: true },
      } as any,
      '42'
    );

    expect(built.attachments.map((attachment) => attachment.filename)).toEqual([
      'Vendor_PO_VPO-26042.pdf',
      'Customer FAR Schedule.pdf',
    ]);
    expect(built.meta).toHaveLength(2);
    expect(built.meta.every((entry) => entry.contentHash.length === 64)).toBe(true);
  });

  it('rejects a selected PDF belonging to a different PO', async () => {
    vi.mocked(storage.getVendorPoAttachment).mockResolvedValue({
      id: 7,
      vendorPoId: 99,
      originalFileName: 'Other PO.pdf',
      mimeType: 'application/pdf',
      filePath: path.resolve(process.cwd(), 'server/__tests__/vendorPoComplianceDocuments.test.ts'),
    } as any);

    await expect(
      buildAttachments(
        'vendor_po_issue',
        { po_number: 'VPO-26042', email_attachment_ids: [7] },
        {
          key: 'vendor_po_issue',
          attachmentRules: { attachVendorPOPDF: true },
        } as any,
        '42'
      )
    ).rejects.toThrow('does not belong to this vendor PO');
  });
});
