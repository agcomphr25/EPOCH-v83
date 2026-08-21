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
      const po = await storage.getVendorPO(poId);
      if (po?.issueFlowdownsRequired) {
        try {
          const [{ getVendorPoFlowdownWorkspace }, { generateVendorFlowdownExhibitPdf }] =
            await Promise.all([
              import('../src/services/flowdownApplicabilityService'),
              import('../utils/pdf/vendorFlowdownExhibitPdf'),
            ]);
          const workspace = await getVendorPoFlowdownWorkspace(poId);
          const included = workspace.clauses.filter(
            (clause: any) => clause.savedDecision === 'INCLUDE'
          );
          if (workspace.assessment.reviewStatus !== 'APPROVED' || included.length === 0) {
            throw new Error(
              'The controlled flowdown exhibit is not approved or has no included clauses'
            );
          }
          const buffer = await generateVendorFlowdownExhibitPdf(workspace);
          const poNumber = context.po_number || po.poNumber || `PO-${poId}`;
          const revision = Number(workspace.assessment.exhibitRevision) || 0;
          const result = attachmentFromBuffer(
            buffer,
            `Controlled_Flowdown_Exhibit_${poNumber}_R${revision}.pdf`,
            'application/pdf'
          );
          attachments.push(result.attachment);
          meta.push(result.meta);
        } catch (error: any) {
          console.error(
            `[buildAttachments] Failed to generate required flowdown exhibit for orderId=${orderId}:`,
            error?.message || error
          );
          throw new Error(
            `Required controlled flowdown exhibit could not be attached: ${error?.message || 'generation failed'}`
          );
        }
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
