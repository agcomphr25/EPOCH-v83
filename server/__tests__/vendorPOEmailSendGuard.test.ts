import { describe, expect, it } from 'vitest';

import { vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));
vi.mock('../communication/registry', () => ({ getTemplateByKey: vi.fn() }));
vi.mock('../communication/render', () => ({ renderFromObject: vi.fn() }));
vi.mock('../communication/attachments', () => ({ buildAttachments: vi.fn() }));
vi.mock('../communication/audit', () => ({ logCommunication: vi.fn() }));
vi.mock('../utils/sendgrid', () => ({ sendEmailViaSendGrid: vi.fn() }));

import { stripRetiredVendorPoConfirmationContent } from '../communication/send';

describe('vendor PO email send guard', () => {
  it('removes retired PO confirmation content from issue/resend emails', () => {
    const html = `
      <p>AG Composites has issued a Purchase Order to your company.</p>
      <p><a href="https://example.com/api/magic-link/verify?token=abc">Confirm PO Receipt</a></p>
      <p><strong>Important:</strong> This confirmation link will expire in 7 days. Please confirm your receipt as soon as possible.</p>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p>https://example.com/api/magic-link/verify?token=abc</p>
      <p>Please see the attached purchase order PDF for details.</p>
    `;
    const text = `Purchase Order

AG Composites has issued a Purchase Order to your company.

Confirm PO Receipt

Important: This confirmation link will expire in 7 days. Please confirm your receipt as soon as possible.

If the button doesn't work, copy and paste this link into your browser:
https://example.com/api/magic-link/verify?token=abc

Please see the attached purchase order PDF for details.`;

    const cleaned = stripRetiredVendorPoConfirmationContent('vendor_po_issue', html, text);

    expect(cleaned.html).toContain('attached purchase order PDF');
    expect(cleaned.text).toContain('attached purchase order PDF');
    expect(cleaned.html).not.toContain('Confirm PO Receipt');
    expect(cleaned.html).not.toContain('confirmation link will expire');
    expect(cleaned.html).not.toContain('copy and paste this link');
    expect(cleaned.html).not.toContain('api/magic-link/verify');
    expect(cleaned.text).not.toContain('Confirm PO Receipt');
    expect(cleaned.text).not.toContain('confirmation link will expire');
    expect(cleaned.text).not.toContain('copy and paste this link');
    expect(cleaned.text).not.toContain('api/magic-link/verify');
  });

  it('does not alter RFQ emails', () => {
    const html = '<p>Confirm PO Receipt</p>';
    const text = 'Confirm PO Receipt';

    expect(stripRetiredVendorPoConfirmationContent('vendor_rfq', html, text)).toEqual({ html, text });
  });
});
