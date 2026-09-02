import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVendorContacts: vi.fn(),
  getVendorPOSettings: vi.fn(),
  buildAttachments: vi.fn(),
}));

vi.mock('../storage', () => ({
  storage: {
    getVendorContacts: mocks.getVendorContacts,
    getVendorPOSettings: mocks.getVendorPOSettings,
  },
}));
vi.mock('../db', () => ({ db: {} }));
vi.mock('../communication/registry', () => ({
  getTemplateByKey: vi.fn(async (_db, key) => ({
    key,
    version: 7,
    attachmentRules: { systemNotice: false },
  })),
}));
vi.mock('../communication/render', () => ({
  renderFromObject: vi.fn((template, context) => ({
    subject: `${template.key}: ${context.po_number}`,
    html: `<p>${context.vendor_message_text}</p>`,
    text: context.vendor_message_text,
    version: template.version,
  })),
}));
vi.mock('../communication/attachments', () => ({
  buildAttachments: mocks.buildAttachments,
}));
vi.mock('../communication/send', () => ({
  stripRetiredVendorPoConfirmationContent: (
    _key: string,
    html: string,
    text: string
  ) => ({ html, text }),
}));

describe('vendor PO email preview parity', () => {
  beforeEach(() => {
    mocks.getVendorContacts.mockResolvedValue([{ email: 'buyer@example.com' }]);
    mocks.getVendorPOSettings.mockResolvedValue({
      returnEmail: 'purchasing@example.com',
    });
    mocks.buildAttachments.mockResolvedValue({
      attachments: [
        {
          filename: 'Vendor_PO_VPO-26099.pdf',
          content: 'pdf',
          type: 'application/pdf',
        },
      ],
      meta: [
        {
          filename: 'Vendor_PO_VPO-26099.pdf',
          type: 'application/pdf',
          sizeBytes: 3,
          contentHash: 'abc',
        },
      ],
    });
  });

  it('prepares one recipient/body/attachment set for preview and delivery', async () => {
    const { prepareVendorPoEmail } = await import(
      '../src/services/vendorPoEmailService'
    );
    const prepared = await prepareVendorPoEmail({
      vendorPo: {
        id: 99,
        vendorId: 12,
        poNumber: 'VPO-26099',
        expectedDeliveryDate: null,
      },
      vendor: { name: 'Example Vendor', email: 'ap@example.com' },
      purpose: 'issue',
      recipients: ['ap@example.com', 'buyer@example.com'],
      message: 'Please review this PO.',
      attachmentIds: [4],
      userEmail: 'glenn@example.com',
      complianceConfirmation: {
        dpasRated: true,
        dpasRating: 'DO-A1',
        flowdownsRequired: false,
      },
    });

    expect(prepared.preview.subject).toBe('vendor_po_issue: VPO-26099');
    expect(prepared.preview.to).toBe(prepared.sendOptions.to);
    expect(prepared.preview.cc).toEqual(prepared.sendOptions.cc);
    expect(prepared.preview.replyTo).toBe(prepared.sendOptions.replyTo);
    expect(prepared.preview.html).toContain('Please review this PO.');
    expect(prepared.preview.subject).toBe(prepared.sendOptions.preparedContent?.subject);
    expect(prepared.preview.html).toBe(prepared.sendOptions.preparedContent?.html);
    expect(prepared.preview.text).toBe(prepared.sendOptions.preparedContent?.text);
    expect(prepared.preview.attachments.map((item) => item.filename)).toEqual(
      prepared.sendOptions.attachments?.map((item) => item.filename)
    );
    expect(prepared.preview.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.preview.officialPoNumberPending).toBe(false);
  });

  it('routes preview, issue, and resend through the shared preparation function and checks fingerprints', () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), 'server/src/routes/vendorPOs.ts'),
      'utf8'
    );
    expect(
      route.match(/prepareVendorPoEmail\(/g)?.length
    ).toBeGreaterThanOrEqual(4);
    expect(route.match(/previewFingerprint/g)?.length).toBeGreaterThanOrEqual(
      5
    );
    expect(route).toContain('VENDOR_PO_NUMBER_RESERVED_FOR_EMAIL_PREVIEW');
  });

  it('keeps both client send buttons locked to the currently displayed preview', () => {
    const client = fs.readFileSync(
      path.join(
        process.cwd(),
        'client/src/components/inventory/VendorPOManager.tsx'
      ),
      'utf8'
    );
    expect(
      client.match(/VendorPoEmailPreviewPanel/g)?.length
    ).toBeGreaterThanOrEqual(3);
    expect(
      client.match(/!isVendorPoEmailPreviewCurrent/g)?.length
    ).toBeGreaterThanOrEqual(2);
    expect(client.match(/previewFingerprint:/g)?.length).toBeGreaterThanOrEqual(
      2
    );
  });
});
