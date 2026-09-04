import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getInventoryMachineRequirementIssues,
  inventoryCategoryUsesMachineDetails,
} from '../../shared/utils/inventoryMachineRequirements';
import {
  assertInventoryMachineRequirementsForCreate,
  assertInventoryMachineRequirementsForUpdate,
} from '../src/lib/inventoryMachineRequirements';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('3d Printing/Cutting inventory machine requirements', () => {
  it('shows machine details for machined and 3d-printed inventory categories', () => {
    expect(inventoryCategoryUsesMachineDetails('MACHINED_PART')).toBe(true);
    expect(
      inventoryCategoryUsesMachineDetails('THREE_D_PRINTING_CUTTING')
    ).toBe(true);
    expect(inventoryCategoryUsesMachineDetails('COMPONENT')).toBe(false);
  });

  it('requires both a machine and positive whole-minute machine time for 3d printing', () => {
    expect(
      getInventoryMachineRequirementIssues({
        manufacturedCategory: 'THREE_D_PRINTING_CUTTING',
        machineType: '   ',
        machiningTimeMinutes: '',
      })
    ).toEqual([
      {
        field: 'machineType',
        message: 'Machine is required for 3d Printing/Cutting items.',
      },
      {
        field: 'machiningTimeMinutes',
        message: 'Machine time is required for 3d Printing/Cutting items.',
      },
    ]);

    for (const invalidMinutes of [0, -1, 1.5, 'not-a-number']) {
      expect(
        getInventoryMachineRequirementIssues({
          manufacturedCategory: 'THREE_D_PRINTING_CUTTING',
          machineType: 'Bambu X1 Carbon',
          machiningTimeMinutes: invalidMinutes,
        })
      ).toEqual([expect.objectContaining({ field: 'machiningTimeMinutes' })]);
    }
  });

  it('accepts complete 3d printing machine details', () => {
    expect(
      getInventoryMachineRequirementIssues({
        manufacturedCategory: 'THREE_D_PRINTING_CUTTING',
        machineType: 'Bambu X1 Carbon',
        machiningTimeMinutes: '95',
      })
    ).toEqual([]);

    expect(() =>
      assertInventoryMachineRequirementsForCreate({
        manufacturedCategory: 'THREE_D_PRINTING_CUTTING',
        machineType: 'Bambu X1 Carbon',
        machiningTimeMinutes: 95,
      })
    ).not.toThrow();
  });

  it('does not add requirements to other inventory categories', () => {
    expect(() =>
      assertInventoryMachineRequirementsForCreate({
        manufacturedCategory: 'MACHINED_PART',
        machineType: null,
        machiningTimeMinutes: null,
      })
    ).not.toThrow();
  });

  it('preserves unrelated partial updates on legacy 3d printing records', () => {
    expect(() =>
      assertInventoryMachineRequirementsForUpdate(
        {},
        {
          manufacturedCategory: 'THREE_D_PRINTING_CUTTING',
          machineType: null,
          machiningTimeMinutes: null,
        }
      )
    ).not.toThrow();
  });

  it('enforces the merged record when category or machine details change', () => {
    expect(() =>
      assertInventoryMachineRequirementsForUpdate(
        { manufacturedCategory: 'THREE_D_PRINTING_CUTTING' },
        { machineType: null, machiningTimeMinutes: null }
      )
    ).toThrow('Machine is required for 3d Printing/Cutting items.');

    expect(() =>
      assertInventoryMachineRequirementsForUpdate(
        { machiningTimeMinutes: 120 },
        {
          manufacturedCategory: 'THREE_D_PRINTING_CUTTING',
          machineType: 'Bambu X1 Carbon',
          machiningTimeMinutes: null,
        }
      )
    ).not.toThrow();
  });

  it('wires the requirement into every inventory write alias and the shared form', () => {
    const routes = read('server/src/routes/inventory.ts');
    const inventoryUi = read(
      'client/src/components/inventory/InventoryItemsCard.tsx'
    );

    expect(
      routes.match(/assertInventoryMachineRequirementsForCreate\(itemData\)/g)
    ).toHaveLength(3);
    expect(
      routes.match(
        /assertInventoryMachineRequirementsForUpdate\(updates, existingItem\)/g
      )
    ).toHaveLength(3);
    expect(inventoryUi).toContain(
      'if (!inventoryCategoryUsesMachineDetails(value))'
    );
    expect(inventoryUi).toContain('{usesMachineDetails && (');
    expect(inventoryUi).toContain('getInventoryMachineRequirementIssues(data)');
    expect(inventoryUi).toContain(
      'machineType: storesMachineDetails && formData.machineType'
    );
    expect(inventoryUi).toContain(
      'machiningTimeMinutes: storesMachineDetails && formData.machiningTimeMinutes'
    );
    expect(inventoryUi).toContain('Number(formData.machiningTimeMinutes)');
  });
});
