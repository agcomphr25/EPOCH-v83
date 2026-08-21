import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));
vi.mock('../storage', () => ({
  storage: { getVendorPO: vi.fn() },
}));
vi.mock('../utils/pdf/vendorPoPdf', () => ({
  generateVendorPoPdf: vi.fn().mockResolvedValue(Buffer.from('vendor po pdf')),
}));
vi.mock('../src/services/flowdownApplicabilityService', () => ({
  getVendorPoFlowdownWorkspace: vi.fn(),
}));
vi.mock('../utils/pdf/vendorFlowdownExhibitPdf', () => ({
  generateVendorFlowdownExhibitPdf: vi
    .fn()
    .mockResolvedValue(Buffer.from('controlled exhibit pdf')),
}));

import { storage } from '../storage';
import { buildAttachments } from '../communication/attachments';
import { getVendorPoFlowdownWorkspace } from '../src/services/flowdownApplicabilityService';

const pdfSource = fs.readFileSync(
  path.resolve(process.cwd(), 'server/utils/pdf/vendorPoPdf.ts'),
  'utf8'
);

describe('vendor PO compliance documents', () => {
  beforeEach(() => {
    vi.mocked(storage.getVendorPO).mockResolvedValue({
      id: 42,
      poNumber: 'VPO-26042',
      issueFlowdownsRequired: true,
    } as any);
    vi.mocked(getVendorPoFlowdownWorkspace).mockResolvedValue({
      po: { id: 42, poNumber: 'VPO-26042' },
      assessment: { reviewStatus: 'APPROVED', exhibitRevision: 3 },
      clauses: [{ id: 1, savedDecision: 'INCLUDE' }],
    } as any);
  });

  it('prints the DPAS rating and controlled-exhibit reference on the PO PDF', () => {
    expect(pdfSource).toContain("y = drawBlock(state, y, 'DPAS Rating'");
    expect(pdfSource).toContain("'Contractual Flowdowns'");
    expect(pdfSource).toContain('attached Controlled Vendor Flowdown Exhibit');
    expect(pdfSource).toContain('`Revision R${data.flowdownExhibitRevision}`');
  });

  it('attaches the standard PO and approved controlled exhibit with hashed metadata', async () => {
    const built = await buildAttachments(
      'vendor_po_issue',
      { po_number: 'VPO-26042' },
      {
        key: 'vendor_po_issue',
        attachmentRules: { attachVendorPOPDF: true },
      } as any,
      '42'
    );

    expect(built.attachments.map((attachment) => attachment.filename)).toEqual([
      'Vendor_PO_VPO-26042.pdf',
      'Controlled_Flowdown_Exhibit_VPO-26042_R3.pdf',
    ]);
    expect(built.meta).toHaveLength(2);
    expect(built.meta.every((entry) => entry.contentHash.length === 64)).toBe(true);
  });

  it('refuses to silently omit a required but unapproved exhibit', async () => {
    vi.mocked(getVendorPoFlowdownWorkspace).mockResolvedValue({
      po: { id: 42, poNumber: 'VPO-26042' },
      assessment: { reviewStatus: 'DRAFT', exhibitRevision: 0 },
      clauses: [],
    } as any);

    await expect(
      buildAttachments(
        'vendor_po_issue',
        { po_number: 'VPO-26042' },
        {
          key: 'vendor_po_issue',
          attachmentRules: { attachVendorPOPDF: true },
        } as any,
        '42'
      )
    ).rejects.toThrow('Required controlled flowdown exhibit could not be attached');
  });
});
