import * as fs from 'fs';
import crypto from 'crypto';
import type { EmailAttachment, AttachmentMeta, EmailTemplate } from './types';
import { generateVendorPoPdf } from '../utils/pdf/vendorPoPdf';
import { getTemplateByKey } from './registry';
import { db } from '../db';

export interface BuiltAttachments {
  attachments: EmailAttachment[];
  meta: AttachmentMeta[];
}

export async function buildAttachments(
  templateKey: string,
  context: any,
  template?: EmailTemplate | null,
  orderId?: string
): Promise<BuiltAttachments> {
  const attachments: EmailAttachment[] = [];
  const meta: AttachmentMeta[] = [];

  let resolvedTemplate = template;
  if (!resolvedTemplate) {
    try {
      resolvedTemplate = await getTemplateByKey(db, templateKey);
    } catch (err: any) {
      console.warn(`[buildAttachments] Could not fetch template "${templateKey}":`, err.message);
    }
  }

  const rules: Record<string, any> = (resolvedTemplate?.attachmentRules as Record<string, any>) ?? {};

  if (rules.attachVendorPOPDF && orderId) {
    try {
      const poId = parseInt(orderId, 10);
      if (!isNaN(poId)) {
        const buffer = await generateVendorPoPdf(poId);
        const poNumber = context.po_number || `PO-${poId}`;
        const filename = `Vendor_PO_${poNumber}.pdf`;
        const result = attachmentFromBuffer(buffer, filename, 'application/pdf');
        attachments.push(result.attachment);
        meta.push(result.meta);
      }
    } catch (err: any) {
      console.error(`[buildAttachments] Failed to generate Vendor PO PDF for orderId=${orderId}:`, err.message);
    }
  }

  return { attachments, meta };
}

export function attachmentFromFilePath(
  filePath: string,
  filename?: string,
  mimeType: string = 'application/pdf'
): { attachment: EmailAttachment; meta: AttachmentMeta } {
  const buffer = fs.readFileSync(filePath);
  const resolvedName = filename ?? filePath.split('/').pop() ?? 'attachment';
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    attachment: {
      content: buffer.toString('base64'),
      filename: resolvedName,
      type: mimeType,
      disposition: 'attachment',
    },
    meta: {
      filename: resolvedName,
      type: mimeType,
      sizeBytes: buffer.length,
      contentHash,
    },
  };
}

export function attachmentFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string = 'application/pdf'
): { attachment: EmailAttachment; meta: AttachmentMeta } {
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    attachment: {
      content: buffer.toString('base64'),
      filename,
      type: mimeType,
      disposition: 'attachment',
    },
    meta: {
      filename,
      type: mimeType,
      sizeBytes: buffer.length,
      contentHash,
    },
  };
}
