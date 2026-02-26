import { db } from '../db';
import { getTemplateByKey } from './registry';
import type { EmailTemplate } from './types';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  version: number;
}

const PLACEHOLDER_RE = /\{\{(\s*[\w.]+\s*)\}\}/g;

/**
 * Primary API: fetch template from DB by key and render it with context.
 * Throws if the template does not exist or is inactive.
 */
export async function renderTemplate(
  templateKey: string,
  context: Record<string, any>
): Promise<RenderedEmail> {
  const template = await getTemplateByKey(db, templateKey);

  if (!template) {
    throw new Error(
      `[render] Email template not found or inactive: "${templateKey}"`
    );
  }

  return renderFromObject(template, context);
}

/**
 * Internal: render from an already-fetched template object.
 * Exported so send.ts can use it without a second DB fetch.
 */
export function renderFromObject(
  template: EmailTemplate,
  context: Record<string, any>
): RenderedEmail {
  const subject = interpolate(template.subject, context);
  const html = interpolate(template.bodyHtml, context);
  const text = template.bodyText
    ? interpolate(template.bodyText, context)
    : htmlToPlainText(html);

  return { subject, html, text, version: template.version };
}

// ─── Interpolation ────────────────────────────────────────────────────────────

function interpolate(source: string, context: Record<string, any>): string {
  return source.replace(PLACEHOLDER_RE, (_, key: string) => {
    const trimmed = key.trim();
    const value = resolveKey(trimmed, context);
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

function resolveKey(key: string, context: Record<string, any>): unknown {
  return key.split('.').reduce<unknown>((obj, part) => {
    if (obj !== null && obj !== undefined && typeof obj === 'object') {
      return (obj as Record<string, unknown>)[part];
    }
    return undefined;
  }, context);
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
