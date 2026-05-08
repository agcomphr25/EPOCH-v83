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
  validateOperatorSession,
  validateRoutingStep,
  validateTravelerIssueEligibility,
  validateWadApproved,
} from '../src/services/materialIssueGates';

describe('validateOperatorSession (Phase 2 — Task #143)', () => {
  const fresh = (overrides: Partial<any> = {}) => ({
    id: 's1',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    lastActivityAt: new Date(),
    lastReauthAt: new Date(),
    idleTimeoutSeconds: 900,
    ...overrides,
  });

  it('passes for an active, recent session', () => {
    expect(validateOperatorSession(fresh())).toBeNull();
  });

  it('blocks when no session is supplied', () => {
    expect(validateOperatorSession(null)?.code).toBe('OPERATOR_NOT_AUTHENTICATED');
  });

  it('blocks revoked sessions', () => {
    expect(validateOperatorSession(fresh({ revokedAt: new Date() }))?.code).toBe(
      'OPERATOR_NOT_AUTHENTICATED',
    );
  });

  it('blocks absolute-expired sessions', () => {
    expect(
      validateOperatorSession(fresh({ expiresAt: new Date(Date.now() - 1000) }))?.code,
    ).toBe('OPERATOR_NOT_AUTHENTICATED');
  });

  it('blocks idle-timed-out sessions', () => {
    expect(
      validateOperatorSession(
        fresh({ lastActivityAt: new Date(Date.now() - 60_000), idleTimeoutSeconds: 30 }),
      )?.code,
    ).toBe('OPERATOR_NOT_AUTHENTICATED');
  });

  it('blocks high-risk action when reauth is stale', () => {
    expect(
      validateOperatorSession(
        fresh({ lastReauthAt: new Date(Date.now() - 120_000) }),
        { requireFreshReauth: true, freshReauthMaxAgeSeconds: 60 },
      )?.code,
    ).toBe('STALE_OPERATOR_AUTH');
  });

  it('passes high-risk action when reauth is fresh', () => {
    expect(
      validateOperatorSession(fresh(), {
        requireFreshReauth: true,
        freshReauthMaxAgeSeconds: 60,
      }),
    ).toBeNull();
  });
});

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

  it('blocks WRONG_ROUTING_STEP when scanned step is not the active one', () => {
    expect(
      validateRoutingStep(
        { id: 's1', travelerId: 't1', status: 'IN_PROGRESS' } as any,
        't1',
        { id: 's2', status: 'IN_PROGRESS' } as any,
      )?.code,
    ).toBe('WRONG_ROUTING_STEP');
  });

  it('passes when scanned step matches the active step', () => {
    expect(
      validateRoutingStep(
        { id: 's1', travelerId: 't1', status: 'IN_PROGRESS' } as any,
        't1',
        { id: 's1', status: 'IN_PROGRESS' } as any,
      ),
    ).toBeNull();
  });

  it('blocks NO_ACTIVE_ROUTING_STEP when traveler has no active step', () => {
    expect(
      validateRoutingStep(
        { id: 's1', travelerId: 't1', status: 'IN_PROGRESS' } as any,
        't1',
        null,
      )?.code,
    ).toBe('NO_ACTIVE_ROUTING_STEP');
  });

  it('blocks WRONG_ROUTING_STEP when packet intent does not match', () => {
    expect(
      validateRoutingStep(
        { id: 's1', travelerId: 't1', status: 'IN_PROGRESS' } as any,
        't1',
        { id: 's1', status: 'IN_PROGRESS' } as any,
        'sX',
      )?.code,
    ).toBe('WRONG_ROUTING_STEP');
  });

  it('passes when packet intent equals the scanned active step', () => {
    expect(
      validateRoutingStep(
        { id: 's1', travelerId: 't1', status: 'IN_PROGRESS' } as any,
        't1',
        { id: 's1', status: 'IN_PROGRESS' } as any,
        's1',
      ),
    ).toBeNull();
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
