import { describe, expect, it } from 'vitest';

import {
  checklistBlockers,
  requiredPreproductionRoles,
  resolveFirstProductionDepartment,
} from '../src/services/projectPreproductionRules';

describe('P2 V2 Preproduction Readiness rules', () => {
  it('accepts satisfied applicable items and does not require irrelevant items', () => {
    expect(
      checklistBlockers([
        {
          key: 'routing',
          category: 'Manufacturing planning',
          label: 'Approved routing',
          applicability: 'REQUIRED',
          satisfied: true,
        },
        {
          key: 'cnc',
          category: 'Manufacturing planning',
          label: 'CNC program',
          applicability: 'NOT_REQUIRED',
          satisfied: false,
        },
      ])
    ).toEqual([]);
  });

  it('blocks unsatisfied required items', () => {
    expect(
      checklistBlockers([
        {
          key: 'inspection',
          category: 'Quality planning',
          label: 'Inspection points defined',
          applicability: 'REQUIRED',
          satisfied: false,
        },
      ])
    ).toEqual(['Quality planning: Inspection points defined']);
  });

  it('requires approved justification for not-applicable decisions', () => {
    const item = {
      key: 'fai',
      category: 'Quality planning',
      label: 'FAI',
      applicability: 'NOT_APPLICABLE' as const,
      satisfied: false,
    };
    expect(checklistBlockers([item])).toHaveLength(1);
    expect(
      checklistBlockers([
        {
          ...item,
          justification: 'Repeat production; no FAI trigger applies.',
          approvedJustification: true,
        },
      ])
    ).toEqual([]);
  });

  it('always requires four independent core functions', () => {
    expect(
      requiredPreproductionRoles({
        supply_chain_required: false,
        finance_required: false,
      })
    ).toEqual(['PROJECT_MANAGEMENT', 'ENGINEERING', 'QUALITY', 'OPERATIONS']);
  });

  it('adds conditional Supply Chain and Finance approvals', () => {
    expect(
      requiredPreproductionRoles({
        supply_chain_required: true,
        finance_required: true,
      })
    ).toEqual([
      'PROJECT_MANAGEMENT',
      'ENGINEERING',
      'QUALITY',
      'OPERATIONS',
      'SUPPLY_CHAIN',
      'FINANCE',
    ]);
  });

  it('routes assembly-first parts to Assembly', () => {
    expect(
      resolveFirstProductionDepartment(['Assembly', 'Quality'], true)
    ).toBe('Assembly');
  });

  it('uses the legacy-safe Layup fallback only when routing is absent', () => {
    expect(resolveFirstProductionDepartment([], false)).toBe('Layup');
    expect(resolveFirstProductionDepartment([], true)).toBeNull();
  });
});
