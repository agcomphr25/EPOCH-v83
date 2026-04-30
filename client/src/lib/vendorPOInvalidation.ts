/**
 * Returns the TanStack Query cache keys that must be invalidated after a
 * vendor-PO receive action completes.
 *
 * Keeping this logic in a plain function makes it straightforward to unit-test
 * without mounting any React components.
 */
export function getReceiveInvalidationKeys(
  vendorPoId?: number | null,
): Array<Array<string | number>> {
  const keys: Array<Array<string | number>> = [
    ['/api/inventory/scans'],
    ['/api/vendor-pos'],
  ];

  if (vendorPoId) {
    keys.push(['/api/vendor-pos', vendorPoId]);
  }

  return keys;
}

/**
 * Returns the TanStack Query cache keys that must be invalidated after a
 * successful RFQ send so the vendor PO list never shows stale status.
 *
 * Keeping this logic in a plain function makes it straightforward to unit-test
 * without mounting any React components.
 */
export function getSendRFQInvalidationKeys(
  vendorPoId?: number | null,
): Array<Array<string | number>> {
  const keys: Array<Array<string | number>> = [
    ['/api/vendor-pos'],
  ];

  if (vendorPoId) {
    keys.push(['/api/vendor-pos', vendorPoId]);
  }

  return keys;
}

/**
 * Returns the TanStack Query cache key for the vendor-PO confirmation status.
 *
 * This key must always be invalidated after a successful resend so that the
 * confirmation card never shows stale data.  Extracting it here makes it easy
 * to unit-test the contract independently of the full VendorPOManager component.
 */
export function getResendConfirmationKey(
  vendorPoId: number,
): Array<string | number> {
  return ['/api/vendor-pos', vendorPoId, 'confirmation'];
}
