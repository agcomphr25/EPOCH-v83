/**
 * Unit tests for the Phase-1 material-issue gate validators.
 *
 * Each validator is a pure function over already-loaded entities, so these
 * tests exercise just the policy logic — no DB, no service layer.
 */

import { describe, expect, it } from 'vitest';
import {
  validateAllocation,
  validateLotStatus,
  validateOperatorAuthorization,
  validateRoutingStep,
  validateTravelerIssueEligibility,
  validateWadApproved,
} from '../src/services/materialIssueGates';

describe('validateTravelerIssueEligibility', () => {
  it('passes for RELEASED travelers', () => {
    expect(
      validateTravelerIssueEligibility({ id: 't1', status: 'RELEASED' } as any),
    ).toBeNull();
  });
  it('passes for IN_PROGRESS travelers', () => {
    expect(
      validateTravelerIssueEligibility({ id: 't1', status: 'IN_PROGRESS' } as any),
    ).toBeNull();
  });
  it('blocks DRAFT travelers', () => {
    const b = validateTravelerIssueEligibility({ id: 't1', status: 'DRAFT' } as any);
    expect(b?.code).toBe('TRAVELER_NOT_RELEASED');
  });
  it('blocks missing traveler', () => {
    expect(validateTravelerIssueEligibility(null)?.code).toBe('TRAVELER_NOT_FOUND');
  });
});

describe('validateWadApproved', () => {
  it('passes for APPROVED + RELEASED WAD', () => {
    expect(
      validateWadApproved({ id: 'w', status: 'RELEASED', wadStatus: 'APPROVED' } as any),
    ).toBeNull();
  });
  it('passes for APPROVED + IN_PROGRESS WAD', () => {
    expect(
      validateWadApproved({ id: 'w', status: 'IN_PROGRESS', wadStatus: 'APPROVED' } as any),
    ).toBeNull();
  });
  it('blocks unapproved WAD', () => {
    expect(
      validateWadApproved({ id: 'w', status: 'RELEASED', wadStatus: 'DRAFT' } as any)?.code,
    ).toBe('WAD_NOT_APPROVED');
  });
  it('blocks PLANNED WAD even when approved', () => {
    expect(
      validateWadApproved({ id: 'w', status: 'PLANNED', wadStatus: 'APPROVED' } as any)?.code,
    ).toBe('WAD_NOT_RELEASED');
  });
  it('blocks missing WAD', () => {
    expect(validateWadApproved(null)?.code).toBe('WAD_NOT_FOUND');
  });
});

describe('validateRoutingStep', () => {
  it('passes for IN_PROGRESS step on correct traveler', () => {
    expect(
      validateRoutingStep(
        { id: 's1', travelerId: 't1', status: 'IN_PROGRESS' } as any,
        't1',
      ),
    ).toBeNull();
  });
  it('blocks NOT_STARTED step', () => {
    expect(
      validateRoutingStep(
        { id: 's1', travelerId: 't1', status: 'NOT_STARTED' } as any,
        't1',
      )?.code,
    ).toBe('ROUTING_STEP_NOT_ACTIVE');
  });
  it('blocks step belonging to a different traveler', () => {
    expect(
      validateRoutingStep(
        { id: 's1', travelerId: 'OTHER', status: 'IN_PROGRESS' } as any,
        't1',
      )?.code,
    ).toBe('ROUTING_STEP_MISMATCH');
  });
  it('blocks missing step', () => {
    expect(validateRoutingStep(null, 't1')?.code).toBe('ROUTING_STEP_NOT_FOUND');
  });
});

describe('validateAllocation', () => {
  it('passes when requested fits inside available', () => {
    expect(
      validateAllocation({ requestedQty: 5, remainingQty: 10, reservedByOthers: 2 }),
    ).toBeNull();
  });
  it('blocks negative or zero qty', () => {
    expect(
      validateAllocation({ requestedQty: 0, remainingQty: 10, reservedByOthers: 0 })?.code,
    ).toBe('INVALID_QUANTITY');
  });
  it('blocks when over remaining', () => {
    expect(
      validateAllocation({ requestedQty: 11, remainingQty: 10, reservedByOthers: 0 })?.code,
    ).toBe('LOT_INSUFFICIENT_QTY');
  });
  it('blocks when over available after others’ reservations', () => {
    expect(
      validateAllocation({ requestedQty: 8, remainingQty: 10, reservedByOthers: 5 })?.code,
    ).toBe('ALLOCATION_EXCEEDED');
  });
});

describe('validateLotStatus', () => {
  const baseLot = { id: 'l1', remainingQty: '10', expirationDate: null as any };
  it('passes for ACCEPTED lot on consume', () => {
    expect(validateLotStatus({ ...baseLot, status: 'ACCEPTED' } as any, 'consume')).toBeNull();
  });
  it('blocks QUARANTINE lot on consume', () => {
    expect(
      validateLotStatus({ ...baseLot, status: 'QUARANTINE' } as any, 'consume')?.code,
    ).toBe('LOT_QUARANTINED');
  });
  it('blocks REJECTED lot on consume', () => {
    expect(
      validateLotStatus({ ...baseLot, status: 'REJECTED' } as any, 'consume')?.code,
    ).toBe('LOT_REJECTED');
  });
  it('blocks fully-consumed lot', () => {
    expect(
      validateLotStatus({ ...baseLot, remainingQty: '0', status: 'ACCEPTED' } as any, 'consume')
        ?.code,
    ).toBe('LOT_CONSUMED');
  });
  it('blocks expired lot', () => {
    const expired = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    expect(
      validateLotStatus(
        { ...baseLot, status: 'ACCEPTED', expirationDate: expired } as any,
        'consume',
      )?.code,
    ).toBe('LOT_EXPIRED');
  });
  it('blocks RECEIVED lot on reserve (incoming inspection not cleared)', () => {
    expect(
      validateLotStatus({ ...baseLot, status: 'RECEIVED' } as any, 'reserve')?.code,
    ).toBe('LOT_NOT_AVAILABLE');
  });
});

describe('validateOperatorAuthorization', () => {
  it('passes when displayName is set', () => {
    expect(validateOperatorAuthorization({ displayName: 'glennj' })).toBeNull();
  });
  it('blocks when displayName is empty even if userId is set', () => {
    // The ledger requires a non-empty performedByDisplayName, so the gate
    // must not pass identity-only requests that would crash the ledger insert.
    expect(
      validateOperatorAuthorization({ userId: 1, displayName: '' })?.code,
    ).toBe('OPERATOR_NOT_AUTHENTICATED');
  });
  it('blocks when displayName is whitespace', () => {
    expect(validateOperatorAuthorization({ displayName: '   ' })?.code).toBe(
      'OPERATOR_NOT_AUTHENTICATED',
    );
  });
  it('blocks when no identity at all', () => {
    expect(validateOperatorAuthorization({ displayName: '' })?.code).toBe(
      'OPERATOR_NOT_AUTHENTICATED',
    );
  });
  it('blocks when operator is null', () => {
    expect(validateOperatorAuthorization(null)?.code).toBe('OPERATOR_NOT_AUTHENTICATED');
  });
});
