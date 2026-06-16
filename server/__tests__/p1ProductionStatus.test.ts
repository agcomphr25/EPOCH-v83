import { describe, expect, it } from 'vitest';
import {
  deriveP1ProductionStatus,
  isActiveP1ProductionStatus,
  isClosedP1PurchaseOrderStatus,
} from '../src/utils/p1ProductionStatus';

describe('deriveP1ProductionStatus', () => {
  it('maps the P1 Production Queue to pending', () => {
    expect(deriveP1ProductionStatus({
      currentDepartment: 'P1 Production Queue',
      currentStatus: 'LAID_UP',
      isFulfilled: false,
    })).toBe('PENDING');
  });

  it('maps active departments before shipped or fulfilled to in progress', () => {
    for (const currentDepartment of ['Barcode', 'Layup/Plugging', 'Finish QC', 'Shipping QC']) {
      expect(deriveP1ProductionStatus({
        currentDepartment,
        currentStatus: 'PENDING',
        isFulfilled: false,
      })).toBe('IN_PROGRESS');
    }
  });

  it('maps shipped and fulfilled departments to shipped', () => {
    expect(deriveP1ProductionStatus({
      currentDepartment: 'Shipped',
      currentStatus: 'LAID_UP',
      isFulfilled: false,
    })).toBe('SHIPPED');

    expect(deriveP1ProductionStatus({
      currentDepartment: 'Fulfilled',
      currentStatus: 'PENDING',
      isFulfilled: false,
    })).toBe('SHIPPED');
  });

  it('uses the fulfilled flag only when the department is blank', () => {
    expect(deriveP1ProductionStatus({
      currentDepartment: null,
      currentStatus: 'PENDING',
      isFulfilled: true,
    })).toBe('SHIPPED');

    expect(deriveP1ProductionStatus({
      currentDepartment: 'Shipping QC',
      currentStatus: 'SHIPPED',
      isFulfilled: true,
    })).toBe('IN_PROGRESS');
  });

  it('preserves cancelled status unless the caller is explicitly reactivating', () => {
    expect(deriveP1ProductionStatus({
      currentDepartment: 'Barcode',
      currentStatus: 'CANCELLED',
      isFulfilled: false,
    })).toBe('CANCELLED');

    expect(deriveP1ProductionStatus({
      currentDepartment: 'Barcode',
      currentStatus: 'CANCELLED',
      isFulfilled: false,
      preserveCancelled: false,
    })).toBe('IN_PROGRESS');
  });
});

describe('P1 PO status helpers', () => {
  it('recognizes legacy closed/complete PO statuses', () => {
    expect(isClosedP1PurchaseOrderStatus('CLOSED')).toBe(true);
    expect(isClosedP1PurchaseOrderStatus('Complete')).toBe(true);
    expect(isClosedP1PurchaseOrderStatus('completed')).toBe(true);
    expect(isClosedP1PurchaseOrderStatus('OPEN')).toBe(false);
  });

  it('treats pending and in-progress production statuses as active', () => {
    expect(isActiveP1ProductionStatus('PENDING')).toBe(true);
    expect(isActiveP1ProductionStatus('IN_PROGRESS')).toBe(true);
    expect(isActiveP1ProductionStatus('LAID_UP')).toBe(true);
    expect(isActiveP1ProductionStatus('QC_PASSED')).toBe(true);
    expect(isActiveP1ProductionStatus('SHIPPED')).toBe(false);
    expect(isActiveP1ProductionStatus('CANCELLED')).toBe(false);
    expect(isActiveP1ProductionStatus('SCRAPPED')).toBe(false);
  });
});
