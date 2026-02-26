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

export interface SendEmailOptions {
  templateKey: string;
  to: string | string[];
  cc?: string | string[];
  variables: Record<string, unknown>;
  attachments?: EmailAttachment[];
  triggeredBy?: string;
  orderId?: string;
  customerId?: string;
  context?: string;
}

export interface EmailAttachment {
  content: string;
  filename: string;
  type?: string;
  disposition?: 'attachment' | 'inline';
}

export interface RenderedEmail {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  templateKey: string;
  templateVersion: number;
}

export interface AuditEntry {
  templateKey: string;
  templateVersion: number;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  providerMessageId?: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
  triggeredBy?: string;
  orderId?: string;
  customerId?: string;
  context?: string;
  attachmentsMeta?: AttachmentMeta[];
}

export interface AttachmentMeta {
  filename: string;
  type?: string;
  sizeBytes?: number;
}
