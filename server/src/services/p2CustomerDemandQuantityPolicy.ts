export const P2_DEMAND_EVENT_TYPES = [
  'CUSTOMER_CANCELLATION',
  'CUSTOMER_REINSTATEMENT',
  'QUANTITY_CORRECTION',
  'SCOPE_INCREASE',
  'SCOPE_DECREASE',
  'LINE_SUPERSESSION',
  'REPLACEMENT_DEMAND',
] as const;
export type P2DemandEventType = (typeof P2_DEMAND_EVENT_TYPES)[number];

export class P2DemandQuantityError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409
  ) {
    super(message);
  }
}

export function validateDemandDelta(type: P2DemandEventType, delta: number) {
  if (!Number.isFinite(delta) || delta === 0)
    throw new P2DemandQuantityError(
      'INVALID_QUANTITY_DELTA',
      'Quantity change must be non-zero.',
      400
    );
  const negative = new Set<P2DemandEventType>([
    'CUSTOMER_CANCELLATION',
    'SCOPE_DECREASE',
    'LINE_SUPERSESSION',
  ]);
  const positive = new Set<P2DemandEventType>([
    'CUSTOMER_REINSTATEMENT',
    'SCOPE_INCREASE',
    'REPLACEMENT_DEMAND',
  ]);
  if (negative.has(type) && delta >= 0)
    throw new P2DemandQuantityError(
      'INVALID_EVENT_DIRECTION',
      `${type} requires a negative quantity change.`,
      400
    );
  if (positive.has(type) && delta <= 0)
    throw new P2DemandQuantityError(
      'INVALID_EVENT_DIRECTION',
      `${type} requires a positive quantity change.`,
      400
    );
}
