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
  const amountDue = Number(input.totalAmount || 0).toFixed(2);
  const dueDate = input.dueDate ? String(input.dueDate) : '';
  const opening = `Please find attached ${label.toLowerCase()} ${input.invoiceNumber}.`;
  const text = [
    opening,
    message,
    '',
    `Amount due: $${amountDue}`,
    dueDate ? `Due date: ${dueDate}` : '',
  ].filter(Boolean).join('\n');
  const html = [
    `<p>Please find attached <strong>${escapeHtml(label)} ${escapeHtml(input.invoiceNumber)}</strong>.</p>`,
    message ? `<p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>` : '',
    `<p><strong>Amount due:</strong> $${amountDue}</p>`,
    dueDate ? `<p><strong>Due date:</strong> ${escapeHtml(dueDate)}</p>` : '',
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
