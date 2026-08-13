export const FABRIC_INVENTORY_IN_USE_MESSAGE =
  'This fabric roll has traceability or transaction history and cannot be deleted. Mark it depleted instead.';

export function getFabricInventoryDeleteErrorResponse(error: unknown) {
  const dbError = error as { code?: string };

  if (dbError?.code !== '23503') return null;

  return {
    status: 409,
    body: {
      error: 'FABRIC_INVENTORY_IN_USE',
      message: FABRIC_INVENTORY_IN_USE_MESSAGE,
    },
  };
}
