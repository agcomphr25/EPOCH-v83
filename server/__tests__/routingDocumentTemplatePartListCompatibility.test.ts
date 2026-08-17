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

  it('reconciles browser and server field names that share the Part List label', () => {
    const result = normalizeTemplateFieldValues(
      { selectedInventoryParts: '1 | 26246 | Body, Heated Pitot' },
      [
        { fieldName: 'selectedInventoryParts', fieldLabel: 'Part List' },
        { field_name: 'requiredMaterials', field_label: 'Part List' },
      ],
    );

    expect(result.requiredMaterials).toBe('1 | 26246 | Body, Heated Pitot');
    expect(result.partList).toBe('1 | 26246 | Body, Heated Pitot');
  });

  it('reconciles PPE field names that share the same visible label', () => {
    const result = normalizeTemplateFieldValues(
      { selectedPpe: 'Safety glasses and nitrile gloves' },
      [
        { fieldName: 'selectedPpe', fieldLabel: 'PPE (Personal Protective Equipment)' },
        { field_name: 'requiredPpe', field_label: 'PPE (Personal Protective Equipment)' },
      ],
    );

    expect(result.requiredPpe).toBe('Safety glasses and nitrile gloves');
  });

  it('does not replace separately populated fields that share a label', () => {
    const result = normalizeTemplateFieldValues(
      { browserPpe: 'Safety glasses', storedPpe: 'Face shield' },
      [
        { fieldName: 'browserPpe', fieldLabel: 'PPE' },
        { fieldName: 'storedPpe', fieldLabel: 'PPE' },
      ],
    );

    expect(result.browserPpe).toBe('Safety glasses');
    expect(result.storedPpe).toBe('Face shield');
  });

  it('normalizes submitted values before required-field validation and PDF rendering', () => {
    expect(handler).toContain(
      'const values = normalizeTemplateFieldValues(fieldValues, [...defaultFields, ...templateFields])',
    );
    expect(handler.indexOf('normalizeTemplateFieldValues(fieldValues,')).toBeLessThan(
      handler.indexOf('for (const field of templateFields)'),
    );
    expect(handler).toContain('fieldValues: values');
  });
});
