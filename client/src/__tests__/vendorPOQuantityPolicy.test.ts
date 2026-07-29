import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const selectorSource = readFileSync(
  resolve(process.cwd(), 'client/src/components/inventory/VendorPOItemSelector.tsx'),
  'utf8',
);
const schemaSource = readFileSync(resolve(process.cwd(), 'server/schema.ts'), 'utf8');

describe('vendor PO decimal quantity policy', () => {
  it('keeps vendor PO quantities decimal-backed in the database schema', () => {
    const tableStart = schemaSource.indexOf("export const vendorPOItems = pgTable('vendor_po_items'");
    const tableEnd = schemaSource.indexOf('});', tableStart);
    const vendorPOItemsSchema = schemaSource.slice(tableStart, tableEnd);

    expect(tableStart).toBeGreaterThan(-1);
    expect(vendorPOItemsSchema).toMatch(/quantity:\s*real\('quantity'\)\.notNull\(\)/);
    expect(vendorPOItemsSchema).not.toMatch(/quantity:\s*integer\('quantity'\)/);
  });

  it('keeps new and edited quantity inputs decimal-friendly', () => {
    expect(selectorSource.match(/inputMode="decimal"/g)).toHaveLength(2);
    expect(selectorSource.match(/step="any"/g)).toHaveLength(2);
    expect(selectorSource).toContain('quantity: e.target.value');
    expect(selectorSource).toContain('setEditedQuantityInput(e.target.value)');
  });

  it('rejects integer-only coercion in the vendor PO quantity workflow', () => {
    expect(selectorSource).not.toContain('parseWholeQuantity');
    expect(selectorSource).not.toMatch(/quantity:[^\n]*(?:parseInt|Math\.trunc)/);
    expect(selectorSource).toContain('parseVendorPOQuantity(newItem.quantity)');
    expect(selectorSource).toContain('parseVendorPOQuantity(editedQuantityInput)');
  });
});
