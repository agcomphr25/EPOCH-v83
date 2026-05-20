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

import { getDepartmentChargeCodeCandidates } from '../src/lib/resolveChargeCode';

describe('getDepartmentChargeCodeCandidates', () => {
  it('matches Quality Control routing steps to QC charge codes', () => {
    expect(getDepartmentChargeCodeCandidates('Quality Control')).toEqual(['Quality Control', 'QC']);
  });

  it('matches QC charge-code departments to written-out routing departments', () => {
    expect(getDepartmentChargeCodeCandidates('QC')).toEqual(['QC', 'Quality Control']);
  });

  it('keeps non-aliased departments exact', () => {
    expect(getDepartmentChargeCodeCandidates('Layup')).toEqual(['Layup']);
  });
});
