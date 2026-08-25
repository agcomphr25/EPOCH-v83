import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../components/inventory/InventoryTraceabilityPolicySection.tsx'),
  'utf8'
);

describe('Inventory Item traceability policy authoring surface', () => {
  it('is opt-in and never silently saves suggested controlled values', () => {
    expect(source).toContain("VITE_INVENTORY_TRACEABILITY_POLICY_READS_ENABLED === 'true'");
    expect(source).toContain("VITE_INVENTORY_TRACEABILITY_POLICY_WRITES_ENABLED === 'true'");
    expect(source).toContain('I reviewed these suggested values');
    expect(source).toContain('disabled={!writesEnabled || !confirmed');
  });

  it('shows the required plain-language configuration questions', () => {
    for (const text of [
      'How is this item tracked?',
      'Does each unit need its own barcode?',
      'Must a lot be scanned?',
      'Must a batch be scanned?',
      'Can partial quantities be used?',
      'Does it expire?',
      'Certificate of Conformance required?',
      'Is receiving inspection required?',
      'Is customer custody tracking required?',
      'Information missing',
    ]) expect(source).toContain(text);
  });

  it('requires stable Inventory Item identity before policy creation', () => {
    expect(source).toContain('Save the Inventory Item first');
    expect(source).toContain('A stable Inventory Item ID is required');
  });
});
