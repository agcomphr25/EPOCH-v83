import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Fabric Inventory Admin configured-item visibility', () => {
  const source = readFileSync(
    join(process.cwd(), 'client/src/pages/FabricInventoryPage.tsx'),
    'utf8'
  );
  const inventoryRoute = readFileSync(
    join(process.cwd(), 'server/src/routes/inventory.ts'),
    'utf8'
  );

  it('builds admin groups from Fabric (Cutting Table) inventory items', () => {
    expect(source).toMatch(/fabricItems\.forEach\(\(?item\)?\s*=>/);
    expect(source).toContain('key = `inventory-item-${item.id}`');
    expect(source).toContain('isConfiguredOnly: true');
    expect(source).toContain('usesInventoryBalance: true');
  });

  it('uses inventory balances as the on-hand quantity authority', () => {
    expect(inventoryRoute).toContain('SUM(ib.quantity_on_hand)');
    expect(inventoryRoute).toContain('as "quantityOnHand"');
    expect(source).toContain('totalQuantity: Number(item.quantityOnHand) || 0');
    expect(source).toContain('if (!groupMap[key].usesInventoryBalance)');
  });

  it('keeps zero-roll configured fabrics visible and actionable', () => {
    expect(source).toContain('fabricGroups.length === 0');
    expect(source).toMatch(/no traceable rolls have been received yet/i);
    expect(source).toContain('handleAddConfiguredFabric(group.configuredItem)');
  });
});
