import { describe, expect, it } from 'vitest';

import {
  evaluateImplementationGate,
  evaluateNextRequiredAction,
  type QualityActionState,
} from '../src/services/qualityActionEngine';

const readyPcr = (overrides: Partial<QualityActionState> = {}): QualityActionState => ({
  recordType: 'PCR',
  status: 'APPROVED',
  assessmentSubmitted: true,
  assessmentRecommendationsResolved: true,
  investigatorAssigned: true,
  investigationComplete: true,
  designImpact: false,
  customerApprovalRequired: false,
  customerApprovalComplete: true,
  controlledDocumentsRequired: false,
  controlledDocumentsReleased: true,
  wipDispositionRequired: true,
  wipDispositionComplete: true,
  effectivityComplete: true,
  validationRequired: false,
  validationComplete: true,
  faiDetermined: true,
  faiRequired: false,
  faiComplete: true,
  trainingRequired: false,
  trainingComplete: true,
  requiredApprovalsComplete: true,
  implementationAuthorized: false,
  implementationComplete: false,
  verificationRequired: true,
  verificationComplete: false,
  ...overrides,
});

describe('Quality Action next-required-action engine', () => {
  it('fails closed when no submitted assessment exists', () => {
    expect(evaluateNextRequiredAction(readyPcr({ assessmentSubmitted: false })).code)
      .toBe('QUALITY_INITIAL_REVIEW');
  });

  it('routes possible design impact to Engineering instead of PCR release', () => {
    expect(evaluateNextRequiredAction(readyPcr({ designImpact: null })).code)
      .toBe('ENGINEERING_REVIEW_REQUIRED');
  });

  it('reports every implementation prerequisite, not only the first', () => {
    const gate = evaluateImplementationGate(readyPcr({
      customerApprovalRequired: true,
      customerApprovalComplete: false,
      wipDispositionComplete: false,
      effectivityComplete: false,
      faiDetermined: false,
      requiredApprovalsComplete: false,
    }));
    expect(gate.blockers.map((item) => item.code)).toEqual(expect.arrayContaining([
      'CUSTOMER_APPROVAL_REQUIRED',
      'WIP_INVENTORY_DISPOSITION_REQUIRED',
      'EFFECTIVITY_REQUIRED',
      'FAI_DETERMINATION_REQUIRED',
      'FUNCTIONAL_APPROVALS_REQUIRED',
    ]));
  });

  it('requires immutable implementation authorization after prerequisites pass', () => {
    expect(evaluateNextRequiredAction(readyPcr()).code)
      .toBe('IMPLEMENTATION_AUTHORIZATION_REQUIRED');
  });

  it('only reports complete after required verification and effectiveness evidence', () => {
    expect(evaluateNextRequiredAction({
      ...readyPcr({
        status: 'CLOSED',
        implementationAuthorized: true,
        implementationComplete: true,
        verificationComplete: true,
        effectivenessRequired: true,
        effectivenessComplete: true,
      }),
    }).classification).toBe('COMPLETE');
  });
});
