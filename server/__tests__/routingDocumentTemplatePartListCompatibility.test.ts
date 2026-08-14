import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('document-from-template legacy part-list compatibility', () => {
  const route = readFileSync(join(process.cwd(), 'server/src/routes/routingDocuments.ts'), 'utf8');
  const normalizationStart = route.indexOf('const normalizeTemplateFieldValues');
  const handlerStart = route.indexOf('const createDocumentFromTemplate');
  const handlerEnd = route.indexOf("router.post('/documents/from-template'", handlerStart);
  const normalization = route.slice(normalizationStart, handlerStart);
  const handler = route.slice(handlerStart, handlerEnd);

  it('copies the legacy plural partsList value to the canonical partList key', () => {
    expect(normalizationStart).toBeGreaterThan(-1);
    expect(normalization).toContain('values.partList = values.partsList');
  });

  it('also keeps current partList values available to legacy renderers', () => {
    expect(normalization).toContain('values.partsList = values.partList');
  });

  it('normalizes submitted values before required-field validation and PDF rendering', () => {
    expect(handler).toContain('const values = normalizeTemplateFieldValues(fieldValues)');
    expect(handler.indexOf('normalizeTemplateFieldValues(fieldValues)')).toBeLessThan(
      handler.indexOf('for (const field of templateFields)'),
    );
    expect(handler).toContain('fieldValues: values');
  });
});
