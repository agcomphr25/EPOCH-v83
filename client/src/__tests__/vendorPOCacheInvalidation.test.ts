/**
 * Tests for getReceiveInvalidationKeys — the function that decides which
 * TanStack Query keys to invalidate after a vendor-PO receive action.
 *
 * The progress bar on InventoryReceivingPage relies on the per-PO query key
 * ['/api/vendor-pos', id] being invalidated so the UI re-fetches fresh
 * totalLines / receivedLines data.  These tests lock that contract in place so
 * a future refactor can't silently drop the targeted invalidation.
 */

import { describe, it, expect } from 'vitest';
import { getReceiveInvalidationKeys, getResendConfirmationKey, getSendRFQInvalidationKeys } from '../lib/vendorPOInvalidation';

describe('getReceiveInvalidationKeys', () => {
  it('always includes the broad /api/vendor-pos list key', () => {
    const keys = getReceiveInvalidationKeys();
    const flat = keys.map((k) => k[0]);
    expect(flat).toContain('/api/vendor-pos');
  });

  it('always includes the /api/inventory/scans key', () => {
    const keys = getReceiveInvalidationKeys();
    const flat = keys.map((k) => k[0]);
    expect(flat).toContain('/api/inventory/scans');
  });

  it('includes the per-PO key ["/api/vendor-pos", id] when vendorPoId is provided', () => {
    const vendorPoId = 42;
    const keys = getReceiveInvalidationKeys(vendorPoId);
    const match = keys.find(
      (k) => k[0] === '/api/vendor-pos' && k[1] === vendorPoId,
    );
    expect(match).toBeDefined();
  });

  it('does NOT include a per-PO key when vendorPoId is undefined', () => {
    const keys = getReceiveInvalidationKeys(undefined);
    const perPoKeys = keys.filter(
      (k) => k[0] === '/api/vendor-pos' && k.length > 1,
    );
    expect(perPoKeys).toHaveLength(0);
  });

  it('does NOT include a per-PO key when vendorPoId is null', () => {
    const keys = getReceiveInvalidationKeys(null);
    const perPoKeys = keys.filter(
      (k) => k[0] === '/api/vendor-pos' && k.length > 1,
    );
    expect(perPoKeys).toHaveLength(0);
  });

  it('returns exactly three keys when vendorPoId is present', () => {
    const keys = getReceiveInvalidationKeys(7);
    expect(keys).toHaveLength(3);
  });

  it('returns exactly two keys when vendorPoId is absent', () => {
    const keys = getReceiveInvalidationKeys();
    expect(keys).toHaveLength(2);
  });
});

/**
 * Tests for getSendRFQInvalidationKeys — the function that decides which
 * TanStack Query keys to invalidate after a successful RFQ send.
 *
 * The vendor PO list relies on the broad ['/api/vendor-pos'] key being
 * invalidated so the UI re-fetches fresh status data.  These tests lock that
 * contract in place so a future refactor can't silently drop the invalidation.
 */
describe('getSendRFQInvalidationKeys', () => {
  it('always includes the broad /api/vendor-pos list key', () => {
    const keys = getSendRFQInvalidationKeys();
    const flat = keys.map((k) => k[0]);
    expect(flat).toContain('/api/vendor-pos');
  });

  it('includes the per-PO key ["/api/vendor-pos", id] when vendorPoId is provided', () => {
    const vendorPoId = 17;
    const keys = getSendRFQInvalidationKeys(vendorPoId);
    const match = keys.find(
      (k) => k[0] === '/api/vendor-pos' && k[1] === vendorPoId,
    );
    expect(match).toBeDefined();
  });

  it('does NOT include a per-PO key when vendorPoId is undefined', () => {
    const keys = getSendRFQInvalidationKeys(undefined);
    const perPoKeys = keys.filter(
      (k) => k[0] === '/api/vendor-pos' && k.length > 1,
    );
    expect(perPoKeys).toHaveLength(0);
  });

  it('does NOT include a per-PO key when vendorPoId is null', () => {
    const keys = getSendRFQInvalidationKeys(null);
    const perPoKeys = keys.filter(
      (k) => k[0] === '/api/vendor-pos' && k.length > 1,
    );
    expect(perPoKeys).toHaveLength(0);
  });

  it('returns exactly two keys when vendorPoId is present', () => {
    const keys = getSendRFQInvalidationKeys(3);
    expect(keys).toHaveLength(2);
  });

  it('returns exactly one key when vendorPoId is absent', () => {
    const keys = getSendRFQInvalidationKeys();
    expect(keys).toHaveLength(1);
  });
});

/**
 * Tests for getResendConfirmationKey — the function that produces the
 * TanStack Query key invalidated after a successful PO resend.
 *
 * The confirmation card on VendorPOManager relies on this key being
 * invalidated unconditionally so it never shows stale confirmation status.
 * These tests lock that three-segment key contract in place so a future
 * refactor cannot silently drop or conditionalize the invalidation.
 */
describe('getResendConfirmationKey', () => {
  it('returns a key whose first segment is /api/vendor-pos', () => {
    const key = getResendConfirmationKey(5);
    expect(key[0]).toBe('/api/vendor-pos');
  });

  it('returns a key whose second segment is the provided vendorPoId', () => {
    const key = getResendConfirmationKey(42);
    expect(key[1]).toBe(42);
  });

  it('returns a key whose third segment is "confirmation"', () => {
    const key = getResendConfirmationKey(5);
    expect(key[2]).toBe('confirmation');
  });

  it('returns exactly three segments so the key targets only confirmation status', () => {
    const key = getResendConfirmationKey(99);
    expect(key).toHaveLength(3);
  });

  it('produces distinct keys for different vendorPoIds', () => {
    const keyA = getResendConfirmationKey(1);
    const keyB = getResendConfirmationKey(2);
    expect(keyA[1]).not.toBe(keyB[1]);
  });

  it('matches the full expected shape ["/api/vendor-pos", id, "confirmation"]', () => {
    const id = 7;
    const key = getResendConfirmationKey(id);
    expect(key).toEqual(['/api/vendor-pos', id, 'confirmation']);
  });
});
