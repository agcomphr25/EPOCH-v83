export interface EmailTemplate {
  id: string;
  key: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
  allowedVariables: string[];
  attachmentRules: Record<string, unknown>;
  version: number;
  isActive: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  updatedBy?: string | null;
}

export interface EmailAttachment {
  content: string;
  filename: string;
  type?: string;
  disposition?: 'attachment' | 'inline';
}

export interface AttachmentMeta {
  filename: string;
  type?: string;
  sizeBytes?: number;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  templateKey: string;
  templateVersion: number;
}
