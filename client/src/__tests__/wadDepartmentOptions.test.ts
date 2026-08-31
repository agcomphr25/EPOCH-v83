import { describe, expect, it } from 'vitest';
import { buildWadDepartmentOptions, syncUnmodifiedBudgetHours } from '@/components/wad/wadDepartmentOptions';

describe('WAD department options', () => {
  it('includes every production-enabled department and excludes non-manufacturing departments', () => {
    const options = buildWadDepartmentOptions([
      { id: 1, name: 'Layup', departmentCode: 'LAYUP', productionEnabled: true },
      { id: 2, name: 'Waterjet', departmentCode: 'WATERJET', productionEnabled: true },
      { id: 3, name: 'Accounting', departmentCode: 'ACCOUNTING', productionEnabled: false },
    ], []);
    expect(options.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: 'LAYUP', label: 'Layup' },
      { key: 'WATERJET', label: 'Waterjet' },
    ]);
  });

  it('retains previously selected departments no longer returned by the active list', () => {
    expect(buildWadDepartmentOptions([], ['CUTTING_KITTING', 'RETIRED_CELL'])).toEqual([
      expect.objectContaining({ key: 'CUTTING_KITTING', label: 'Cutting / Kitting', isHistorical: true }),
      expect.objectContaining({ key: 'RETIRED_CELL', isHistorical: true }),
    ]);
  });
});

describe('WAD budget hour synchronization', () => {
  it('copies changed breakdown hours into an untouched charge-code budget', () => {
    expect(syncUnmodifiedBudgetHours(
      [{ department: 'LAYUP', budgetedHours: 0, chargeCode: '' }],
      [{ department: 'LAYUP', estimatedHours: 12 }],
      [{ department: 'LAYUP', estimatedHours: 0 }]
    )).toEqual([{ department: 'LAYUP', budgetedHours: 12, chargeCode: '' }]);
  });

  it('preserves a positive budget that differs from the prior estimate', () => {
    const current = [{ department: 'LAYUP', budgetedHours: 20, chargeCode: '' }];
    expect(syncUnmodifiedBudgetHours(
      current,
      [{ department: 'LAYUP', estimatedHours: 12 }],
      [{ department: 'LAYUP', estimatedHours: 8 }]
    )).toBe(current);
  });
});
