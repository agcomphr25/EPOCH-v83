/**
 * Returns the TanStack Query cache keys that must be invalidated after a
 * receipt is completed in the RCC (Inventory Receiving Control Center).
 *
 * The progress bar on the LeftPanel relies on the broad /api/vendor-pos list
 * key being invalidated so PO statuses refresh.  For a specific PO, the
 * per-PO key ['/api/vendor-pos', vendorPoId] must also be invalidated so the
 * receivedQuantity totals that drive the progress bar are refetched.
 *
 * Keeping this logic in a plain function makes it straightforward to unit-test
 * without mounting any React components.
 */
export function getRccCompleteInvalidationKeys(
  vendorPoId?: number | null,
): Array<Array<string | number>> {
  const keys: Array<Array<string | number>> = [
    ['/api/vendor-pos'],
  ];

  if (vendorPoId != null) {
    keys.push(['/api/vendor-pos', vendorPoId]);
  }

  return keys;
}
