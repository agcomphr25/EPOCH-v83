import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
}));

vi.mock('../storage', () => ({
  storage: {},
}));

vi.mock('../schema', () => ({
  productionWorkOrders: {},
  chargeCodes: {},
  travelers: {},
  trainingCertifications: {},
  travelerSteps: {},
  routingOperations: {},
}));

import { findWadDepartmentChargeCode, getDepartmentChargeCodeCandidates } from '../src/lib/resolveChargeCode';

describe('getDepartmentChargeCodeCandidates', () => {
  it('matches Quality Control routing steps to QC charge codes', () => {
    expect(getDepartmentChargeCodeCandidates('Quality Control')).toEqual(['Quality Control', 'QC']);
  });

  it('matches QC charge-code departments to written-out routing departments', () => {
    expect(getDepartmentChargeCodeCandidates('QC')).toEqual(['QC', 'Quality Control']);
  });

  it('matches Final QC routing steps to QC charge codes', () => {
    expect(getDepartmentChargeCodeCandidates('Final QC')).toEqual(['Final QC', 'QC', 'Quality Control']);
  });

  it('keeps non-aliased departments exact', () => {
    expect(getDepartmentChargeCodeCandidates('Layup')).toEqual(['Layup']);
  });
});

describe('findWadDepartmentChargeCode', () => {
  it('uses the WAD Step 4 QC code when routing says Quality Control', () => {
    const wizardData = {
      step4: {
        chargeCodes: [
          { department: 'Layup', chargeCode: 'LAYUP' },
          { department: 'QC', chargeCode: 'QC' },
        ],
      },
    };

    expect(findWadDepartmentChargeCode(wizardData, 'Quality Control')).toBe('QC');
  });

  it('uses the WAD Step 4 Quality Control code when routing says QC', () => {
    const wizardData = {
      step4: {
        chargeCodes: [
          { department: 'Quality Control', chargeCode: 'QC' },
        ],
      },
    };

    expect(findWadDepartmentChargeCode(wizardData, 'QC')).toBe('QC');
  });

  it('uses the WAD Step 4 QC code when routing says Final QC', () => {
    const wizardData = {
      step4: {
        chargeCodes: [
          { department: 'QC', chargeCode: 'QC' },
        ],
      },
    };

    expect(findWadDepartmentChargeCode(wizardData, 'Final QC')).toBe('QC');
  });
});
