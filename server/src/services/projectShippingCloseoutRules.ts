export type ShippingReadinessInput = {
  selectedAllocationCount: number;
  selectedQuantity: number;
  eligibleQuantity: number;
  activeReleaseHold: boolean;
  activeShippingHold: boolean;
  packagingMethod?: string;
  preservationMethod?: string;
  packageCount?: number;
  weightLbs?: number;
  dimensions?: { length?: number; width?: number; height?: number };
  address?: Record<string, unknown>;
  carrier?: string;
  serviceLevel?: string;
  documents: Array<{
    documentId?: string;
    documentNumber?: string;
    revision?: string;
    status?: string;
    checksum?: string;
    inclusionReason?: string;
    required?: boolean;
  }>;
};

export function evaluateShippingReadiness(input: ShippingReadinessInput) {
  const blockers: string[] = [];
  if (input.selectedAllocationCount < 1 || input.selectedQuantity <= 0)
    blockers.push('Select at least one eligible Product Release allocation.');
  if (input.selectedQuantity > input.eligibleQuantity)
    blockers.push('Selected quantity exceeds remaining released quantity.');
  if (input.activeReleaseHold)
    blockers.push('An active Product Release hold blocks Shipping.');
  if (input.activeShippingHold)
    blockers.push('An active Shipping hold blocks shipment authorization.');
  if (!input.packagingMethod?.trim())
    blockers.push('Packaging method is required.');
  if (!input.preservationMethod?.trim())
    blockers.push('Preservation method is required.');
  if (!input.packageCount || input.packageCount < 1)
    blockers.push('At least one package is required.');
  if (!input.weightLbs || input.weightLbs <= 0)
    blockers.push('Package weight is required.');
  if (
    !input.dimensions?.length ||
    !input.dimensions.width ||
    !input.dimensions.height
  )
    blockers.push('Package length, width, and height are required.');
  const address = input.address ?? {};
  for (const field of [
    'name',
    'line1',
    'city',
    'region',
    'postalCode',
    'country',
  ])
    if (!String(address[field] ?? '').trim())
      blockers.push(`Ship-to ${field} is required.`);
  if (!input.carrier?.trim()) blockers.push('Carrier is required.');
  if (!input.serviceLevel?.trim())
    blockers.push('Carrier service is required.');
  if (!input.documents.length)
    blockers.push('A controlled shipment-document manifest is required.');
  for (const document of input.documents) {
    if (
      !document.documentId ||
      !document.documentNumber ||
      !document.revision ||
      !document.inclusionReason
    )
      blockers.push(
        'Every shipment document requires identity, revision, and inclusion reason.'
      );
    if (document.required && document.status !== 'RELEASED')
      blockers.push(
        `Required document ${document.documentNumber ?? document.documentId ?? 'unknown'} is not RELEASED.`
      );
    if (['DRAFT', 'OBSOLETE', 'UNCONTROLLED'].includes(document.status ?? ''))
      blockers.push(
        `Document ${document.documentNumber ?? document.documentId ?? 'unknown'} is not an approved customer deliverable.`
      );
  }
  return {
    blockers: [...new Set(blockers)],
    status:
      blockers.length === 0
        ? ('READY_TO_SHIP' as const)
        : input.selectedAllocationCount > 0 &&
            input.packagingMethod &&
            input.preservationMethod
          ? ('READY_TO_PACK' as const)
          : ('BLOCKED' as const),
  };
}

export type CloseoutReadinessInput = {
  stage8Complete: boolean;
  stage9Complete: boolean;
  authorizedQuantity: number;
  releasedQuantity: number;
  shippedQuantity: number;
  deliveredQuantity: number;
  deliveryRequired: boolean;
  activeHolds: number;
  deliveryExceptions: number;
  unresolvedActions: number;
  archiveDocumentCount: number;
  financeTransferredOrComplete: boolean;
};

export function evaluateCloseoutReadiness(input: CloseoutReadinessInput) {
  const blockers: string[] = [];
  if (!input.stage8Complete)
    blockers.push('Stage 8 Production is not complete.');
  if (!input.stage9Complete) blockers.push('Stage 9 Quality is not complete.');
  if (input.releasedQuantity !== input.authorizedQuantity)
    blockers.push(
      'Customer-order quantity is not fully released and reconciled.'
    );
  if (input.shippedQuantity !== input.authorizedQuantity)
    blockers.push(
      'Customer-order quantity is not fully shipped and reconciled.'
    );
  if (
    input.deliveryRequired &&
    input.deliveredQuantity !== input.authorizedQuantity
  )
    blockers.push('Required delivery evidence is incomplete.');
  if (input.activeHolds > 0)
    blockers.push('Active release or Shipping holds remain.');
  if (input.deliveryExceptions > 0)
    blockers.push('A delivery exception remains unresolved.');
  if (input.unresolvedActions > 0)
    blockers.push('Required closeout actions remain unresolved.');
  if (input.archiveDocumentCount < 1)
    blockers.push('The immutable closeout document archive is empty.');
  if (!input.financeTransferredOrComplete)
    blockers.push(
      'Finance reconciliation is neither complete nor transferred.'
    );
  return {
    blockers,
    ready: blockers.length === 0,
    status: blockers.length
      ? ('BLOCKED' as const)
      : ('READY_FOR_CLOSEOUT_REVIEW' as const),
  };
}
