import { describe, expect, it } from 'vitest';
import {
  deriveCanonicalAllOrdersState,
  canonicalizeAllOrdersUpdate,
} from '../src/lib/allOrdersStatusDepartment';

describe('all orders status/department canonicalization', () => {
  it('keeps only P1 Production Queue as FINALIZED', () => {
    expect(
      deriveCanonicalAllOrdersState({
        status: 'IN_PROGRESS',
        currentDepartment: 'P1 Production Queue',
      })
    ).toEqual({
      status: 'FINALIZED',
      currentDepartment: 'P1 Production Queue',
    });
  });

  it('marks active production departments as IN_PROGRESS', () => {
    expect(
      deriveCanonicalAllOrdersState({
        status: 'FINALIZED',
        currentDepartment: 'Shipping QC',
      })
    ).toEqual({
      status: 'IN_PROGRESS',
      currentDepartment: 'Shipping QC',
    });
  });

  it('marks Shipping as READY_TO_SHIP', () => {
    expect(
      deriveCanonicalAllOrdersState({
        status: 'Ready for Shipping',
        currentDepartment: 'Shipping',
      })
    ).toEqual({
      status: 'READY_TO_SHIP',
      currentDepartment: 'Shipping',
    });
  });

  it('keeps cancelled orders in the Cancelled department', () => {
    expect(
      deriveCanonicalAllOrdersState({
        status: 'FINALIZED',
        currentDepartment: 'CNC',
        isCancelled: true,
      })
    ).toEqual({
      status: 'CANCELLED',
      currentDepartment: 'Cancelled',
    });
  });

  it('keeps fulfilled orders in Shipping Management', () => {
    expect(
      deriveCanonicalAllOrdersState({
        status: 'SHIPPED',
        currentDepartment: '',
      })
    ).toEqual({
      status: 'FULFILLED',
      currentDepartment: 'Shipping Management',
    });
  });

  it('canonicalizes partial updates against the current state', () => {
    expect(
      canonicalizeAllOrdersUpdate(
        { status: 'FULFILLED', currentDepartment: 'Shipping Management' },
        { currentDepartment: 'Shipping' }
      )
    ).toEqual({
      status: 'READY_TO_SHIP',
      currentDepartment: 'Shipping',
    });
  });

  it('allows a pending-signature order to be finalized with a status update', () => {
    expect(
      canonicalizeAllOrdersUpdate(
        { status: 'PENDING_SIGNATURE', currentDepartment: 'Awaiting Customer Signature' },
        { status: 'FINALIZED' }
      )
    ).toEqual({
      status: 'FINALIZED',
      currentDepartment: 'P1 Production Queue',
    });
  });
});
