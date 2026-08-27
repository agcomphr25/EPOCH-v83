import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Inventory Item Utilized In architecture', () => {
  it('persists both additive selections without changing existing defaults', () => {
    const schema = read('server/schema.ts');
    const migration = read('migrations/0307_inventory_utilized_in_balance_eligibility.sql');
    expect(schema).toContain("utilizedInNonInventory: boolean('utilized_in_non_inventory').notNull().default(false)");
    expect(schema).toContain("utilizedInCustomerSupplied: boolean('utilized_in_customer_supplied').notNull().default(false)");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS utilized_in_non_inventory boolean NOT NULL DEFAULT false');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS utilized_in_customer_supplied boolean NOT NULL DEFAULT false');
    expect(migration).not.toMatch(/UPDATE\s+inventory_items/i);
  });

  it('keeps purchasing selection unchanged and suppresses receipt inventory creation centrally', () => {
    const poSelector = read('client/src/components/inventory/VendorPOItemSelector.tsx');
    const storage = read('server/storage.ts');
    expect(poSelector).not.toContain('utilizedInNonInventory');
    expect(storage).toContain('if (inventoryItem && isInventoryBalanceEligible(inventoryItem))');
  });

  it('enforces eligibility in balances, inventory events, allocations, and the database', () => {
    const inventoryRoute = read('server/src/routes/inventory.ts');
    const eventService = read('server/src/services/inventoryEventService.ts');
    const allocationService = read('server/src/services/inventoryAllocationService.ts');
    const migration = read('migrations/0307_inventory_utilized_in_balance_eligibility.sql');
    expect(inventoryRoute).toContain('isInventoryBalanceEligible');
    expect(eventService).toContain("eventType !== 'receipt_pending' && !isInventoryBalanceEligible(item)");
    expect(allocationService).toContain('part ${agPartNumber} is not eligible for inventory allocation');
    expect(migration).toContain('inventory_balances_eligibility_guard');
  });

  it('does not equate Customer-Supplied with Non-Inventory', () => {
    const helper = read('shared/inventoryBalanceEligibility.ts');
    expect(helper).toContain('item?.utilizedInNonInventory !== true');
    expect(helper).not.toMatch(/utilizedInCustomerSupplied\s*!==?\s*true/);
  });
});
