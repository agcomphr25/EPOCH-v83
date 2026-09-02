import crypto from 'crypto';
import { getTemplateByKey } from './registry';
import { renderFromObject } from './render';
import { buildAttachments } from './attachments';
import { logCommunication } from './audit';
import { sendEmailViaSendGrid } from '../utils/sendgrid';
import { db } from '../db';
import type { EmailAttachment, AttachmentMeta, SendResult } from './types';

export interface SendCommunicationOptions {
  templateKey: string;
  context: Record<string, any>;
  to: string | string[];
  cc?: string | string[];
  triggeredBy?: string;
  capabilityRequired?: string;
  attachments?: EmailAttachment[];
  orderId?: string;
  customerId?: string;
  emailContext?: string;
  replyTo?: string;
  preparedContent?: {
    subject: string;
    html: string;
    text: string;
    templateVersion: number;
  };
}

function wrapWithSystemNotice(html: string): string {
  const notice = `<div style="background:#f3f4f6;padding:10px;font-size:12px;color:#555;text-align:center;font-family:Arial,sans-serif;">This is a system-generated message from EPOCH.</div>`;
  return notice + html;
}

function prependSystemNoticeToText(text: string): string {
  return `This is a system-generated message from EPOCH.\n\n${text}`;
}

const VENDOR_PO_TEMPLATE_KEYS = new Set(['vendor_po_issue', 'vendor_po_resend']);

export function stripRetiredVendorPoConfirmationContent(
  templateKey: string,
  html: string,
  text: string,
): { html: string; text: string } {
  if (!VENDOR_PO_TEMPLATE_KEYS.has(templateKey)) return { html, text };

  const cleanHtml = html
    .replace(/<p[^>]*>\s*<a\b[^>]*>\s*Confirm PO Receipt\s*<\/a>\s*<\/p>/gi, '')
    .replace(/<a\b[^>]*>\s*Confirm PO Receipt\s*<\/a>/gi, '')
    .replace(/<p[^>]*>[\s\S]*?confirmation link will expire[\s\S]*?<\/p>/gi, '')
    .replace(/<p[^>]*>[\s\S]*?copy and paste this link into your browser[\s\S]*?<\/p>/gi, '')
    .replace(/<p[^>]*>[\s\S]*?(?:\/api\/magic-link\/verify|\/vendor-pos\/confirm|confirm\/preview)[\s\S]*?<\/p>/gi, '')
    .replace(/\n{3,}/g, '\n\n');

  const textLines = text.split(/\r?\n/);
  const cleanTextLines: string[] = [];
  let skipNextUrl = false;
  for (const line of textLines) {
    const trimmed = line.trim();
    const isRetiredConfirmationLine =
      /^Confirm PO Receipt$/i.test(trimmed) ||
      /confirmation link will expire/i.test(trimmed) ||
      /copy and paste this link into your browser/i.test(trimmed) ||
      /(?:\/api\/magic-link\/verify|\/vendor-pos\/confirm|confirm\/preview)/i.test(trimmed);

    if (skipNextUrl && /^https?:\/\//i.test(trimmed)) {
      skipNextUrl = false;
      continue;
    }

    if (isRetiredConfirmationLine) {
      skipNextUrl = /copy and paste this link into your browser/i.test(trimmed);
      continue;
    }

    skipNextUrl = false;
    cleanTextLines.push(line);
  }

  const cleanText = cleanTextLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { html: cleanHtml, text: cleanText };
}

export async function sendCommunication(
  opts: SendCommunicationOptions
): Promise<SendResult> {
  if (opts.capabilityRequired) {
    const allowed = checkCapability(opts.capabilityRequired, opts.triggeredBy);
    if (!allowed) {
      const error = `[sendCommunication] Capability "${opts.capabilityRequired}" not granted for triggeredBy="${opts.triggeredBy ?? 'anonymous'}"`;
      console.warn(error);
      await logCommunication({
        templateKey: opts.templateKey,
        templateVersion: 0,
        triggeredBy: opts.triggeredBy,
        to: normalizeList(opts.to),
        cc: opts.cc ? normalizeList(opts.cc) : undefined,
        subject: '(blocked)',
        bodyHtml: '',
        status: 'skipped',
        error,
        orderId: opts.orderId,
        customerId: opts.customerId,
        context: opts.emailContext,
      });
      return { success: false, error, templateKey: opts.templateKey, templateVersion: 0 };
    }
  }

  const template = await getTemplateByKey(db, opts.templateKey);
  if (!template) {
    const error = `[sendCommunication] Template not found or inactive: "${opts.templateKey}"`;
    console.error(error);
    return { success: false, error, templateKey: opts.templateKey, templateVersion: 0 };
  }

  const rendered = opts.preparedContent ?? renderFromObject(template, opts.context);

  let attachments: EmailAttachment[] = opts.attachments ?? [];
  let attachmentsMeta: AttachmentMeta[] = [];

  if (!opts.attachments) {
    try {
      const built = await buildAttachments(opts.templateKey, opts.context, template, opts.orderId);
      attachments = built.attachments;
      attachmentsMeta = built.meta;
    } catch (error: any) {
      const message = error?.message || 'Required email attachments could not be generated';
      await logCommunication({
        templateKey: template.key,
        templateVersion: template.version,
        triggeredBy: opts.triggeredBy,
        to: normalizeList(opts.to),
        cc: opts.cc ? normalizeList(opts.cc) : undefined,
        subject: rendered.subject,
        bodyHtml: rendered.html,
        status: 'failed',
        error: message,
        orderId: opts.orderId,
        customerId: opts.customerId,
        context: opts.emailContext,
      });
      return {
        success: false,
        error: message,
        templateKey: template.key,
        templateVersion: template.version,
      };
    }
  } else {
    attachmentsMeta = opts.attachments.map((a) => {
      const buf = Buffer.from(a.content, 'base64');
      return {
        filename: a.filename,
        type: a.type,
        sizeBytes: buf.length,
        contentHash: crypto.createHash('sha256').update(buf).digest('hex'),
      };
    });
  }

  const rules = (template.attachmentRules ?? {}) as Record<string, any>;
  const includeNotice = rules.systemNotice !== false;

  let finalHtml = rendered.html;
  let finalText = rendered.text;
  if (!opts.preparedContent) {
    ({ html: finalHtml, text: finalText } = stripRetiredVendorPoConfirmationContent(
      opts.templateKey,
      finalHtml,
      finalText,
    ));

    if (includeNotice) {
      finalHtml = wrapWithSystemNotice(finalHtml);
      finalText = prependSystemNoticeToText(finalText);
    }
  }

  const toList = normalizeList(opts.to);
  const ccList = opts.cc ? normalizeList(opts.cc) : undefined;

  const result = await sendEmailViaSendGrid({
    to: toList.join(','),
    cc: ccList,
    replyTo: opts.replyTo,
    subject: rendered.subject,
    text: finalText,
    html: finalHtml,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  await logCommunication({
    templateKey: template.key,
    templateVersion: template.version,
    triggeredBy: opts.triggeredBy,
    to: toList,
    cc: ccList,
    subject: rendered.subject,
    bodyHtml: finalHtml,
    attachmentsMeta: attachmentsMeta.length > 0 ? attachmentsMeta : undefined,
    providerMessageId: result.messageId,
    status: result.success ? 'sent' : 'failed',
    error: result.error,
    orderId: opts.orderId,
    customerId: opts.customerId,
    context: opts.emailContext,
  });

  return {
    success: result.success,
    messageId: result.messageId,
    error: result.error,
    templateKey: template.key,
    templateVersion: template.version,
  };
}

function checkCapability(capability: string, triggeredBy?: string): boolean {
  console.log(
    `[Capability] "${capability}" requested by "${triggeredBy ?? 'anonymous'}" — STUB: allowed`
  );
  return true;
}

function normalizeList(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}
