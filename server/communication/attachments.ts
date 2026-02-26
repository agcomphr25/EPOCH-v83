import * as fs from 'fs';
import type { EmailAttachment, AttachmentMeta } from './types';

export interface BuiltAttachments {
  attachments: EmailAttachment[];
  meta: AttachmentMeta[];
}

/**
 * Primary API: resolve attachments for a given template + context.
 * Currently returns empty — structure supports future attachment_rules logic.
 *
 * Future: read template.attachmentRules from DB, then conditionally pull
 * PDFs from object storage, filesystem, or dynamic generators.
 */
export async function buildAttachments(
  templateKey: string,
  context: any
): Promise<BuiltAttachments> {
  // Placeholder for attachment_rules evaluation
  // When rules are implemented, they will be keyed by templateKey
  // and evaluated against context to decide which PDFs to attach.
  void templateKey;
  void context;

  return { attachments: [], meta: [] };
}

// ─── Helpers for callers that supply attachments explicitly ───────────────────

/**
 * Build an attachment from a filesystem path.
 * Used by callers that pre-generate a PDF and want to append it.
 */
export function attachmentFromFilePath(
  filePath: string,
  filename?: string,
  mimeType: string = 'application/pdf'
): { attachment: EmailAttachment; meta: AttachmentMeta } {
  const buffer = fs.readFileSync(filePath);
  const resolvedName = filename ?? filePath.split('/').pop() ?? 'attachment';

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
    },
  };
}

/**
 * Build an attachment from an in-memory Buffer.
 */
export function attachmentFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string = 'application/pdf'
): { attachment: EmailAttachment; meta: AttachmentMeta } {
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
    },
  };
}
