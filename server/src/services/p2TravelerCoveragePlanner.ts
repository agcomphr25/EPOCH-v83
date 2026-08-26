export type TravelerCoveragePlan = {
  start: number;
  end: number;
  quantity: number;
};

export class TravelerCoveragePlanError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export function planTravelerCoverage(
  requiredQuantity: number,
  travelerType: string,
  existingOrdinals: number[],
  requestedBatchQuantity?: number
): TravelerCoveragePlan[] {
  if (!Number.isSafeInteger(requiredQuantity) || requiredQuantity <= 0)
    throw new TravelerCoveragePlanError(
      'WHOLE_TRAVELER_QUANTITY_REQUIRED',
      'Traveler coverage requires positive whole-unit demand.'
    );
  const used = new Set(existingOrdinals);
  const remaining = Array.from(
    { length: requiredQuantity },
    (_, index) => index + 1
  ).filter((ordinal) => !used.has(ordinal));
  if (!remaining.length) return [];
  if (travelerType === 'INDIVIDUAL')
    return remaining.map((ordinal) => ({
      start: ordinal,
      end: ordinal,
      quantity: 1,
    }));
  if (travelerType !== 'BATCH')
    throw new TravelerCoveragePlanError(
      'TRAVELER_TYPE_UNSUPPORTED',
      'Only INDIVIDUAL and BATCH travelers can be provisioned.'
    );
  const quantity = requestedBatchQuantity ?? remaining.length;
  if (
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    quantity > remaining.length
  )
    throw new TravelerCoveragePlanError(
      'BATCH_COVERAGE_QUANTITY_INVALID',
      'Batch coverage must be a positive whole quantity no greater than remaining demand.'
    );
  const selected = remaining.slice(0, quantity);
  if (selected.at(-1)! - selected[0] + 1 !== selected.length)
    throw new TravelerCoveragePlanError(
      'BATCH_COVERAGE_NOT_CONTIGUOUS',
      'Batch coverage must use the next contiguous uncovered demand units.'
    );
  return [{ start: selected[0], end: selected.at(-1)!, quantity }];
}
