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
        const buffer = await generateVendorPoPdf(poId, context?.vendor_po_pdf_overrides ?? {});
        const poNumber = context.po_number || `PO-${poId}`;
        const filename = templateKey === 'vendor_rfq'
          ? `Vendor_RFQ_${poNumber}.pdf`
          : `Vendor_PO_${poNumber}.pdf`;
        const result = attachmentFromBuffer(buffer, filename, 'application/pdf');
        attachments.push(result.attachment);
        meta.push(result.meta);
      }
    } catch (err: any) {
      console.error(`[buildAttachments] Failed to generate Vendor PO PDF for orderId=${orderId}:`, err.message);
    }
  }

  if (['vendor_po_issue', 'vendor_po_resend'].includes(templateKey) && orderId) {
    const poId = parseInt(orderId, 10);
    if (!isNaN(poId)) {
      const { storage } = await import('../storage');
      const requestedIds = Array.isArray(context?.email_attachment_ids)
        ? [...new Set(context.email_attachment_ids.map(Number).filter(Number.isInteger))]
        : [];
      for (const attachmentId of requestedIds) {
        const stored = await storage.getVendorPoAttachment(attachmentId);
        if (!stored || stored.vendorPoId !== poId) {
          throw new Error(`Selected attachment #${attachmentId} does not belong to this vendor PO`);
        }
        if (stored.mimeType !== 'application/pdf' || !stored.originalFileName.toLowerCase().endsWith('.pdf')) {
          throw new Error(`Selected attachment "${stored.originalFileName}" is not a PDF`);
        }
        if (!fs.existsSync(stored.filePath)) {
          throw new Error(`Selected attachment "${stored.originalFileName}" is unavailable`);
        }
        const result = attachmentFromFilePath(
          stored.filePath,
          stored.originalFileName,
          stored.mimeType
        );
        attachments.push(result.attachment);
        meta.push(result.meta);
      }
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
