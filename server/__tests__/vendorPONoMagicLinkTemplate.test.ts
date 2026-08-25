import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
}));

import {
  enforceCanonicalVendorPoTemplate,
  VENDOR_PO_ISSUE_TEMPLATE,
  VENDOR_PO_RESEND_TEMPLATE,
} from '../communication/registry';
import { renderFromObject } from '../communication/render';

const context = {
  vendor_name: "Glenn's Metal Supplies",
  vendor_contact_person: ' Glenn',
  po_number: '12345',
  requested_delivery_date: '6/17/2026',
  vendor_message_html: '<p>Please see the attached purchase order PDF for details.</p>',
  vendor_message_text: 'Please see the attached purchase order PDF for details.',
};

function expectNoVendorConfirmationLanguage(body: string) {
  expect(body).not.toMatch(/magic\s+link/i);
  expect(body).not.toMatch(/confirm(?:ation)?\s+(?:this\s+)?(?:purchase\s+)?order/i);
  expect(body).not.toMatch(/vendor\s+portal/i);
  expect(body).not.toMatch(/click\s+here/i);
  expect(body).not.toMatch(/href=/i);
  expect(body).not.toMatch(/https?:\/\//i);
}

describe('vendor PO email templates', () => {
  it('replaces a stale database confirmation template with canonical send content', () => {
    const staleTemplate = {
      id: 'stale-template-id',
      key: 'vendor_po_issue',
      name: 'Purchase Order Confirmation Request',
      subject: 'PO {{po_number}} - Confirmation Requested',
      bodyHtml: '<h1>Purchase Order Confirmation Request</h1>',
      bodyText: 'Purchase Order Confirmation Request',
      allowedVariables: ['po_number'],
      attachmentRules: { attachVendorPOPDF: true, systemNotice: true },
      version: 7,
      currentVersion: 7,
      isActive: true,
      createdAt: null,
      updatedAt: null,
      updatedBy: null,
    };

    const resolved = enforceCanonicalVendorPoTemplate(staleTemplate, staleTemplate.key);
    const rendered = renderFromObject(resolved as any, context);

    expect(resolved.id).toBe('stale-template-id');
    expect(resolved.version).toBe(7);
    expect(resolved.attachmentRules.systemNotice).toBe(false);
    expect(rendered.subject).toBe('PO 12345 from AG Composites');
    expect(rendered.html).toContain(context.vendor_message_html);
    expect(rendered.html).not.toContain('Purchase Order Confirmation Request');
  });

  it('does not add the EPOCH system-generated banner to issue or resend emails', () => {
    expect(VENDOR_PO_ISSUE_TEMPLATE.attachmentRules.systemNotice).toBe(false);
    expect(VENDOR_PO_RESEND_TEMPLATE.attachmentRules.systemNotice).toBe(false);
  });

  it('issue email asks vendors to use the attached PDF without a magic link', () => {
    const rendered = renderFromObject(VENDOR_PO_ISSUE_TEMPLATE as any, context);

    expect(rendered.html).toContain('Please see the attached purchase order PDF for details.');
    expect(rendered.text).toContain('Please see the attached purchase order PDF for details.');
    expectNoVendorConfirmationLanguage(rendered.html);
    expectNoVendorConfirmationLanguage(rendered.text);
  });

  it('resend email asks vendors to use the attached PDF without a magic link', () => {
    const rendered = renderFromObject(VENDOR_PO_RESEND_TEMPLATE as any, context);

    expect(rendered.html).toContain('Please see the attached purchase order PDF for details.');
    expect(rendered.text).toContain('Please see the attached purchase order PDF for details.');
    expectNoVendorConfirmationLanguage(rendered.html);
    expectNoVendorConfirmationLanguage(rendered.text);
  });
});
