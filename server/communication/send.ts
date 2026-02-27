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
  // Optional explicit attachments (overrides buildAttachments)
  attachments?: EmailAttachment[];
  // Optional logging context
  orderId?: string;
  customerId?: string;
  emailContext?: string;
}

/**
 * Primary API for the communication control plane.
 *
 * Flow:
 *   1. Capability check (stubbed — enforced when RBAC layer is added)
 *   2. Fetch + render template
 *   3. Resolve attachments
 *   4. Send via SendGrid
 *   5. Audit to communication_logs
 *   6. Return result
 *
 * Does NOT modify any existing route senders — callers opt in explicitly.
 */
export async function sendCommunication(
  opts: SendCommunicationOptions
): Promise<SendResult> {
  // ── 1. Capability check ───────────────────────────────────────────────────
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

  // ── 2. Fetch + render template ────────────────────────────────────────────
  const template = await getTemplateByKey(db, opts.templateKey);
  if (!template) {
    const error = `[sendCommunication] Template not found or inactive: "${opts.templateKey}"`;
    console.error(error);
    return { success: false, error, templateKey: opts.templateKey, templateVersion: 0 };
  }

  const rendered = renderFromObject(template, opts.context);

  // ── 3. Resolve attachments ────────────────────────────────────────────────
  let attachments: EmailAttachment[] = opts.attachments ?? [];
  let attachmentsMeta: AttachmentMeta[] = [];

  if (!opts.attachments) {
    const built = await buildAttachments(opts.templateKey, opts.context);
    attachments = built.attachments;
    attachmentsMeta = built.meta;
  } else {
    attachmentsMeta = opts.attachments.map((a) => ({
      filename: a.filename,
      type: a.type,
    }));
  }

  // ── 4. Send via SendGrid ──────────────────────────────────────────────────
  const toList = normalizeList(opts.to);
  const ccList = opts.cc ? normalizeList(opts.cc) : undefined;

  const result = await sendEmailViaSendGrid({
    to: toList.join(','),
    cc: ccList,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  // ── 5. Audit ──────────────────────────────────────────────────────────────
  await logCommunication({
    templateKey: template.key,
    templateVersion: template.version,
    triggeredBy: opts.triggeredBy,
    to: toList,
    cc: ccList,
    subject: rendered.subject,
    bodyHtml: rendered.html,
    attachmentsMeta: attachmentsMeta.length > 0 ? attachmentsMeta : undefined,
    providerMessageId: result.messageId,
    status: result.success ? 'sent' : 'failed',
    error: result.error,
    orderId: opts.orderId,
    customerId: opts.customerId,
    context: opts.emailContext,
  });

  // ── 6. Return ─────────────────────────────────────────────────────────────
  return {
    success: result.success,
    messageId: result.messageId,
    error: result.error,
    templateKey: template.key,
    templateVersion: template.version,
  };
}

// ─── Capability Check (stub) ──────────────────────────────────────────────────
// When role-based capability enforcement is added, replace this function.
// Currently allows all sends to proceed — returns true unconditionally.
// The capabilityRequired field is recorded in logs for future enforcement.
function checkCapability(capability: string, triggeredBy?: string): boolean {
  // TODO: look up user role/capabilities from DB when RBAC is wired
  console.log(
    `[Capability] "${capability}" requested by "${triggeredBy ?? 'anonymous'}" — STUB: allowed`
  );
  return true;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function normalizeList(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}
