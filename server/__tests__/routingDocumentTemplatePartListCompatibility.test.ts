import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeTemplateFieldValues } from '../src/utils/templateFieldValueCompatibility';

describe('document-from-template legacy part-list compatibility', () => {
  const route = readFileSync(join(process.cwd(), 'server/src/routes/routingDocuments.ts'), 'utf8');
  const handlerStart = route.indexOf('const createDocumentFromTemplate');
  const handlerEnd = route.indexOf("router.post('/documents/from-template'", handlerStart);
  const handler = route.slice(handlerStart, handlerEnd);

  it.each(['partList', 'partsList', 'parts_list', 'Part List'])(
    'maps a populated %s payload to both supported Part List keys',
    (fieldName) => {
      const result = normalizeTemplateFieldValues({ [fieldName]: '1 | 26246 | Body, Heated Pitot' });

      expect(result.partList).toBe('1 | 26246 | Body, Heated Pitot');
      expect(result.partsList).toBe('1 | 26246 | Body, Heated Pitot');
    },
  );

  it('does not replace a populated canonical value with a legacy alias', () => {
    const result = normalizeTemplateFieldValues({
      partList: 'canonical',
      parts_list: 'legacy',
    });

    expect(result.partList).toBe('canonical');
    expect(result.partsList).toBe('canonical');
  });

  it('normalizes submitted values before required-field validation and PDF rendering', () => {
    expect(handler).toContain('const values = normalizeTemplateFieldValues(fieldValues)');
    expect(handler.indexOf('normalizeTemplateFieldValues(fieldValues)')).toBeLessThan(
      handler.indexOf('for (const field of templateFields)'),
    );
    expect(handler).toContain('fieldValues: values');
  });
});
