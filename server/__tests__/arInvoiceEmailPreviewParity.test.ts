import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildInvoiceEmailEnvelope,
  toInvoiceEmailPreview,
  toSendGridInvoiceMessage,
} from '../src/services/arInvoiceEmailService';

describe('AR invoice email preview parity', () => {
  it('uses identical recipients, subject, body, and attachment names for preview and delivery', () => {
    const envelope = buildInvoiceEmailEnvelope({
      invoiceNumber: 'MI26-300',
      invoiceType: 'MATERIAL_DEPOSIT',
      totalAmount: '25000.00',
      dueDate: '2026-09-17',
      customerMessage: 'Deposit for PO Line 1.',
      isP1: false,
      to: 'ap@example.com',
      cc: ['buyer@example.com'],
      attachments: [{ filename: 'Material-Deposit-Invoice-MI26-300.pdf', content: 'base64-pdf', type: 'application/pdf', disposition: 'attachment' }],
    });
    const preview = toInvoiceEmailPreview(envelope);
    const sent = toSendGridInvoiceMessage(envelope);

    expect(preview.subject).toBe('Material Deposit Invoice MI26-300');
    expect(preview.to).toBe(sent.to);
    expect(preview.cc).toEqual(sent.cc);
    expect(preview.subject).toBe(sent.subject);
    expect(preview.text).toBe(sent.text);
    expect(preview.html).toBe(sent.html);
    expect(preview.attachments.map((item) => item.filename)).toEqual(sent.attachments.map((item) => item.filename));
  });

  it('routes both preview and send through the same server preparation function', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'server/src/routes/arInvoices.ts'), 'utf8');
    const previewRoute = route.slice(route.indexOf("router.post('/:id/email-preview'"), route.indexOf("router.post('/:id/send'"));
    const sendRoute = route.slice(route.indexOf("router.post('/:id/send'"), route.indexOf("router.post('/:id/void'"));
    expect(previewRoute).toContain('prepareInvoiceEmail(invoice, req.body || {})');
    expect(sendRoute).toContain('prepareInvoiceEmail(invoice, req.body || {})');
    expect(sendRoute).toContain('toSendGridInvoiceMessage(envelope)');
  });

  it('does not allow the invoice list shortcut to bypass the reviewed send modal', () => {
    const page = fs.readFileSync(path.join(process.cwd(), 'client/src/pages/InvoicesPage.tsx'), 'utf8');
    expect(page).not.toContain("apiRequest(`/api/ar-invoices/${id}/send`");
    expect(page).toContain('const handleSend = (id: string) => setLocation(`/finance/invoices/${id}`)');
  });
});
