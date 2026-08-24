import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Department management client permission boundary', () => {
  const inventory = read('client/src/components/inventory/InventoryItemsCard.tsx');
  const routing = read('client/src/components/PartRoutingWizard.tsx');

  it('requires the dedicated permission in both management surfaces', () => {
    for (const source of [inventory, routing]) {
      expect(source).toContain("can('inventory.departments.manage')");
      expect(source).toContain('canManageDepartments');
      expect(source).toContain('Department management permission is required');
    }
  });

  it('does not use inventory.adjust or a VITE flag alone as management authority', () => {
    expect(inventory).not.toContain("can('inventory.adjust')");
    expect(routing).not.toContain("can('inventory.adjust')");
    expect(routing).toContain(
      "sharedDepartmentWritesEnabled && can('inventory.departments.manage')"
    );
  });

  it('continues to expose existing Department selection without management permission', () => {
    expect(inventory).toContain('sortedDepartments.map');
    expect(inventory).toContain('onMultiSelectChange');
    expect(routing).toContain('onClick={() => toggleDepartment(dept)}');
    expect(routing).toContain('deptRecord && canManageDepartments');
  });
});
