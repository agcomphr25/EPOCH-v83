import * as fs from 'fs';
import type { EmailAttachment, AttachmentMeta } from './types';

export function attachmentFromFilePath(
  filePath: string,
  filename?: string,
  mimeType: string = 'application/pdf'
): { attachment: EmailAttachment; meta: AttachmentMeta } {
  const buffer = fs.readFileSync(filePath);
  const content = buffer.toString('base64');
  const resolvedName = filename ?? filePath.split('/').pop() ?? 'attachment';

  return {
    attachment: {
      content,
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

export function attachmentFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string = 'application/pdf'
): { attachment: EmailAttachment; meta: AttachmentMeta } {
  const content = buffer.toString('base64');
  return {
    attachment: {
      content,
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
