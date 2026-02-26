import type { RenderedEmail, EmailTemplate } from './types';

const PLACEHOLDER_RE = /\{\{(\s*[\w.]+\s*)\}\}/g;

export function renderTemplate(
  template: EmailTemplate,
  variables: Record<string, unknown>
): RenderedEmail {
  const subject = interpolate(template.subject, variables);
  const bodyHtml = interpolate(template.bodyHtml, variables);
  const bodyText = template.bodyText
    ? interpolate(template.bodyText, variables)
    : htmlToPlainText(bodyHtml);

  return { subject, bodyHtml, bodyText };
}

function interpolate(source: string, variables: Record<string, unknown>): string {
  return source.replace(PLACEHOLDER_RE, (_, key: string) => {
    const trimmed = key.trim();
    const value = resolveNestedKey(trimmed, variables);
    return value !== undefined && value !== null ? String(value) : '';
  });
}

function resolveNestedKey(key: string, variables: Record<string, unknown>): unknown {
  return key.split('.').reduce<unknown>((obj, part) => {
    if (obj !== null && obj !== undefined && typeof obj === 'object') {
      return (obj as Record<string, unknown>)[part];
    }
    return undefined;
  }, variables);
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
