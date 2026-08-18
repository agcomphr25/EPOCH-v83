export type InvoiceEmailAttachment = {
  filename: string;
  content: string;
  type?: string;
  disposition?: string;
};

export type InvoiceEmailEnvelope = {
  to: string;
  cc: string[];
  fromName?: string;
  subject: string;
  text: string;
  html: string;
  attachments: InvoiceEmailAttachment[];
};

export type InvoiceEmailPreview = Omit<InvoiceEmailEnvelope, 'attachments'> & {
  attachments: Array<{ filename: string; type?: string; disposition?: string }>;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export function invoiceDocumentLabel(invoiceType: string | null | undefined): string {
  return invoiceType === 'MATERIAL_DEPOSIT' ? 'Material Deposit Invoice' : 'Invoice';
}

function formatInvoiceCurrency(value: string | number | null | undefined): string {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function buildInvoiceEmailEnvelope(input: {
  invoiceNumber: string;
  invoiceType?: string | null;
  totalAmount: string | number | null | undefined;
  dueDate?: string | Date | null;
  customerVisibleNotes?: string | null;
  customerMessage?: string | null;
  isP1: boolean;
  to: string;
  cc?: string[] | string | null;
  attachments: InvoiceEmailAttachment[];
}): InvoiceEmailEnvelope {
  const label = invoiceDocumentLabel(input.invoiceType);
  const message = String(input.customerMessage || input.customerVisibleNotes || '').trim();
  const amountDue = formatInvoiceCurrency(input.totalAmount);
  const dueDate = input.dueDate ? String(input.dueDate) : '';
  const defaultMessage = `Please find attached ${label.toLowerCase()} ${input.invoiceNumber}.`;
  const bodyMessage = message || defaultMessage;
  const text = [
    bodyMessage,
    '',
    'Invoice summary',
    `Amount due: $${amountDue}`,
    dueDate ? `Due date: ${dueDate}` : '',
  ].filter(Boolean).join('\n');
  const html = [
    `<div style="white-space:normal;line-height:1.5">${escapeHtml(bodyMessage).replace(/\n/g, '<br/>')}</div>`,
    '<div style="margin-top:24px;padding-top:12px;border-top:1px solid #d1d5db">',
    '<div style="margin-bottom:6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#6b7280">Invoice summary</div>',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">',
    `<tr><td style="padding:2px 18px 2px 0;font-weight:600">Amount due</td><td style="padding:2px 0">$${amountDue}</td></tr>`,
    dueDate ? `<tr><td style="padding:2px 18px 2px 0;font-weight:600">Due date</td><td style="padding:2px 0">${escapeHtml(dueDate)}</td></tr>` : '',
    '</table></div>',
  ].filter(Boolean).join('');

  return {
    to: input.to,
    cc: Array.isArray(input.cc) ? input.cc : input.cc ? [input.cc] : [],
    fromName: input.isP1 ? 'AG Composites' : undefined,
    subject: `${label} ${input.invoiceNumber}`,
    text,
    html,
    attachments: input.attachments,
  };
}

export function toInvoiceEmailPreview(envelope: InvoiceEmailEnvelope): InvoiceEmailPreview {
  return {
    to: envelope.to,
    cc: envelope.cc,
    fromName: envelope.fromName,
    subject: envelope.subject,
    text: envelope.text,
    html: envelope.html,
    attachments: envelope.attachments.map(({ filename, type, disposition }) => ({ filename, type, disposition })),
  };
}

export function toSendGridInvoiceMessage(envelope: InvoiceEmailEnvelope): InvoiceEmailEnvelope {
  return envelope;
}
