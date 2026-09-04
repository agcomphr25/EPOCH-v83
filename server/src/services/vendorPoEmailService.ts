import crypto from 'node:crypto';

import { db } from '../../db';
import { storage } from '../../storage';
import { buildAttachments } from '../../communication/attachments';
import { getTemplateByKey } from '../../communication/registry';
import { renderFromObject } from '../../communication/render';
import {
  stripRetiredVendorPoConfirmationContent,
  type SendCommunicationOptions,
} from '../../communication/send';
import {
  appendUniqueEmail,
  DEFAULT_VENDOR_PO_RETURN_EMAIL,
  resolveVendorPoReturnEmail,
} from '../../utils/vendorPoContact';

const DEFAULT_ISSUE_MESSAGE =
  'AG Composites has issued a new Purchase Order to your company. Please see the attached purchase order PDF for details.';
const DEFAULT_RESEND_MESSAGE =
  'AG Composites is resending this Purchase Order. Please see the attached purchase order PDF for details.';
const DEFAULT_RFQ_MESSAGE =
  'AG Composites is requesting a quotation. Please review the attached RFQ and provide pricing, availability, and lead time.';

export type VendorPoEmailPurpose = 'issue' | 'resend' | 'rfq';

export type VendorPoEmailPreview = {
  subject: string;
  to: string;
  cc: string[];
  replyTo: string;
  html: string;
  text: string;
  attachments: Array<{ filename: string; type?: string; sizeBytes?: number }>;
  fingerprint: string;
  officialPoNumberPending: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeMessage(
  raw: unknown,
  fallback: string
): { text: string; html: string } {
  const rawText = typeof raw === 'string' ? raw.trim() : '';
  const text = (rawText || fallback).slice(0, 4000);
  const html = text
    .split(/\n{2,}/)
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`
    )
    .join('\n');
  return { text, html };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function applyRfqMessage(
  html: string,
  text: string,
  message: { html: string; text: string }
): { html: string; text: string } {
  const stockHtml =
    /<p>AG Composites is requesting a quote for the following items\.[\s\S]*?<\/p>/i;
  const nextHtml = stockHtml.test(html)
    ? html.replace(stockHtml, message.html)
    : html.replace(/(<div class=["']rfq-details["']>)/i, `${message.html}\n$1`);
  const stockText =
    /AG Composites is requesting a quote for the following items\.[^\r\n]*(?:\r?\n)?/i;
  const nextText = stockText.test(text)
    ? text.replace(stockText, `${message.text}\n`)
    : text.replace(/(Vendor:\s)/i, `${message.text}\n\n$1`);
  return { html: nextHtml, text: nextText };
}

function deriveToAndCc(
  raw: unknown,
  primaryEmail: string,
  allowed: Set<string>,
  standardCc: string[]
) {
  const selected = Array.isArray(raw)
    ? raw
        .filter((value): value is string => typeof value === 'string')
        .map(normalizeEmail)
        .filter((email) => allowed.has(email))
    : [];
  const primaryNormalized = normalizeEmail(primaryEmail);
  const to =
    selected.length === 0
      ? primaryEmail
      : selected.includes(primaryNormalized)
        ? primaryEmail
        : selected[0];
  const toNormalized = normalizeEmail(to);
  const cc = [...standardCc];
  for (const email of selected.filter(
    (candidate) => candidate !== toNormalized
  )) {
    if (!cc.some((candidate) => normalizeEmail(candidate) === email))
      cc.push(email);
  }
  return { to, cc };
}

export async function prepareVendorPoEmail(input: {
  vendorPo: any;
  vendor: any;
  purpose: VendorPoEmailPurpose;
  recipients?: unknown;
  message?: unknown;
  attachmentIds: number[];
  userEmail?: string | null;
  triggeredBy?: string;
  complianceConfirmation?: {
    dpasRated: boolean;
    dpasRating?: string | null;
    flowdownsRequired: boolean;
  };
}): Promise<{
  preview: VendorPoEmailPreview;
  sendOptions: SendCommunicationOptions;
}> {
  if (!input.vendor?.email) {
    const error: any = new Error(
      'Please add a contact email for this vendor before previewing or sending the PO.'
    );
    error.status = 422;
    throw error;
  }

  const allowed = new Set<string>();
  allowed.add(normalizeEmail(input.vendor.email));
  if (input.vendor.additionalEmail)
    allowed.add(normalizeEmail(input.vendor.additionalEmail));
  for (const contact of await storage.getVendorContacts(
    input.vendorPo.vendorId
  )) {
    if (contact.email) allowed.add(normalizeEmail(contact.email));
  }

  const settings = await storage.getVendorPOSettings();
  const replyTo = resolveVendorPoReturnEmail(settings);
  const standardCc = appendUniqueEmail(
    appendUniqueEmail(
      appendUniqueEmail([], replyTo),
      DEFAULT_VENDOR_PO_RETURN_EMAIL
    ),
    input.userEmail
  );
  const { to, cc } = deriveToAndCc(
    input.recipients,
    input.vendor.email,
    allowed,
    standardCc
  );
  const officialPoNumberPending = !input.vendorPo.poNumber;
  const poNumber =
    input.purpose === 'rfq'
      ? `RFQ-${input.vendorPo.id}`
      : input.vendorPo.poNumber || `Draft #${input.vendorPo.id}`;
  const normalized = normalizeMessage(
    input.message,
    input.purpose === 'issue'
      ? DEFAULT_ISSUE_MESSAGE
      : input.purpose === 'resend'
        ? DEFAULT_RESEND_MESSAGE
        : DEFAULT_RFQ_MESSAGE
  );
  const templateKey =
    input.purpose === 'issue'
      ? 'vendor_po_issue'
      : input.purpose === 'resend'
        ? 'vendor_po_resend'
        : 'vendor_rfq';
  const items =
    input.purpose === 'rfq'
      ? await storage.getVendorPOItems(input.vendorPo.id)
      : [];
  const itemsTableRows = items
    .map(
      (item: any) => `<tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${escapeHtml(String(item.lineNumber ?? ''))}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${escapeHtml(String(item.supplierPartNumber || '-'))}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${escapeHtml(String(item.description || '-'))}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.quantity != null ? Number(item.quantity).toFixed(2) : '0.00'}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${escapeHtml(String(item.vendorUnit || item.uom || '-'))}</td>
      </tr>`
    )
    .join('');
  const itemsTable =
    items.length > 0
      ? `<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead><tr style="background-color: #f5f5f5;">
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Line</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Part #</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Description</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Qty</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Unit</th>
        </tr></thead><tbody>${itemsTableRows}</tbody></table>`
      : '<p><em>No specific items listed. Please contact us for details.</em></p>';
  const itemsList =
    items.length > 0
      ? items
          .map((item: any) =>
            `- ${item.description || 'Item'}: Qty ${item.quantity || 0} ${item.vendorUnit || item.uom || ''}`.trimEnd()
          )
          .join('\n')
      : 'No specific items listed. Please contact us for details.';
  const context = {
    vendor_name: input.vendor.name,
    vendor_contact_person: input.vendor.contactPerson
      ? ` ${input.vendor.contactPerson}`
      : '',
    po_number: poNumber,
    requested_delivery_date: input.vendorPo.expectedDeliveryDate
      ? new Date(input.vendorPo.expectedDeliveryDate).toLocaleDateString()
      : '',
    vendor_message_html: normalized.html,
    vendor_message_text: normalized.text,
    desired_delivery_date: input.vendorPo.expectedDeliveryDate
      ? new Date(input.vendorPo.expectedDeliveryDate).toLocaleDateString()
      : '',
    items_table: itemsTable,
    items_list: itemsList,
    email_attachment_ids: input.attachmentIds,
    vendor_po_pdf_overrides: input.complianceConfirmation
      ? {
          issueDpasRated: input.complianceConfirmation.dpasRated,
          issueDpasRating: input.complianceConfirmation.dpasRated
            ? input.complianceConfirmation.dpasRating?.trim() || null
            : null,
          issueFlowdownsRequired:
            input.complianceConfirmation.flowdownsRequired,
        }
      : undefined,
  };
  const template = await getTemplateByKey(db, templateKey);
  if (!template)
    throw Object.assign(
      new Error(`Email template ${templateKey} is unavailable.`),
      { status: 503 }
    );
  const rendered = renderFromObject(template, context);
  const cleanedBase = stripRetiredVendorPoConfirmationContent(
    templateKey,
    rendered.html,
    rendered.text
  );
  const cleaned =
    input.purpose === 'rfq'
      ? applyRfqMessage(cleanedBase.html, cleanedBase.text, normalized)
      : cleanedBase;
  const built = await buildAttachments(
    templateKey,
    context,
    template,
    String(input.vendorPo.id)
  );
  const attachments = built.meta.map(({ filename, type, sizeBytes }) => ({
    filename,
    type,
    sizeBytes,
  }));
  const fingerprint = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        vendorPoId: input.vendorPo.id,
        purpose: input.purpose,
        templateVersion: template.version,
        subject: rendered.subject,
        to,
        cc,
        replyTo,
        html: cleaned.html,
        text: cleaned.text,
        attachments: built.meta.map(
          ({ filename, type, sizeBytes, contentHash }) => ({
            filename,
            type,
            sizeBytes,
            contentHash,
          })
        ),
      })
    )
    .digest('hex');

  return {
    preview: {
      subject: rendered.subject,
      to,
      cc,
      replyTo,
      html: cleaned.html,
      text: cleaned.text,
      attachments,
      fingerprint,
      officialPoNumberPending,
    },
    sendOptions: {
      templateKey,
      context,
      to,
      cc,
      replyTo,
      triggeredBy: input.triggeredBy,
      capabilityRequired:
        input.purpose === 'issue'
          ? 'issue_vendor_po'
          : input.purpose === 'resend'
            ? 'resend_vendor_po'
            : 'send_vendor_rfq',
      orderId: String(input.vendorPo.id),
      attachments: built.attachments,
      preparedContent: {
        subject: rendered.subject,
        html: cleaned.html,
        text: cleaned.text,
        templateVersion: template.version,
      },
    },
  };
}
