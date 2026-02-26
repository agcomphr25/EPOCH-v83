import type { SendEmailOptions, SendResult } from './types';
import { getTemplateByKey } from './registry';
import { renderTemplate } from './render';
import { auditEmailSend } from './audit';
import { sendEmailViaSendGrid } from '../utils/sendgrid';

export async function sendTemplatedEmail(
  db: import('../db').Database,
  options: SendEmailOptions
): Promise<SendResult> {
  const template = await getTemplateByKey(db, options.templateKey);

  if (!template) {
    const error = `Email template not found: ${options.templateKey}`;
    console.error(`[Communication] ${error}`);
    return { success: false, error, templateKey: options.templateKey, templateVersion: 0 };
  }

  const rendered = renderTemplate(template, options.variables);

  const toList = Array.isArray(options.to) ? options.to : [options.to];
  const ccList = options.cc
    ? (Array.isArray(options.cc) ? options.cc : [options.cc])
    : undefined;

  const result = await sendEmailViaSendGrid({
    to: toList.join(','),
    cc: ccList,
    subject: rendered.subject,
    text: rendered.bodyText,
    html: rendered.bodyHtml,
    attachments: options.attachments,
  });

  await auditEmailSend(db, {
    templateKey: template.key,
    templateVersion: template.version,
    to: toList,
    cc: ccList,
    subject: rendered.subject,
    bodyHtml: rendered.bodyHtml,
    providerMessageId: result.messageId,
    status: result.success ? 'sent' : 'failed',
    error: result.error,
    triggeredBy: options.triggeredBy,
    orderId: options.orderId,
    customerId: options.customerId,
    context: options.context,
    attachmentsMeta: options.attachments?.map((a) => ({
      filename: a.filename,
      type: a.type,
    })),
  });

  return {
    success: result.success,
    messageId: result.messageId,
    error: result.error,
    templateKey: template.key,
    templateVersion: template.version,
  };
}
