export type P2ArCandidatePolicyInput = {
  packingSlipStatus: string | null;
  shipDate: string | Date | null;
  customerId: string | null;
  poNumber: string | null;
  paymentTerms: string | null;
  billingContact: string | null;
  billingContactDesignated: boolean;
  shippedQuantity: number;
  billableQuantity: number;
  lineCount: number;
  pricingComplete: boolean;
  existingInvoiceCount: number;
  isNoChargeReplacement: boolean;
};

export function evaluateP2ArCandidate(input: P2ArCandidatePolicyInput) {
  const blockers: string[] = [];
  if (input.packingSlipStatus !== 'SHIPPED') {
    blockers.push('Packing slip has not reached SHIPPED status.');
  }
  if (!input.shipDate) blockers.push('Ship date is missing.');
  if (!input.customerId) blockers.push('Customer identifier is missing.');
  if (!input.poNumber) blockers.push('Customer PO number is missing.');
  if (!input.paymentTerms) blockers.push('Customer payment terms are missing.');
  if (!input.billingContact) {
    blockers.push('Designated billing contact is missing.');
  } else if (!input.billingContactDesignated) {
    blockers.push(
      'Available customer email is not explicitly designated for billing.'
    );
  }
  if (input.lineCount === 0)
    blockers.push('Packing slip has no billable lines.');
  if (input.shippedQuantity !== input.billableQuantity) {
    blockers.push('Shipped quantity does not match billable quantity.');
  }
  if (!input.pricingComplete)
    blockers.push('One or more billable lines lack an unambiguous PO price.');
  if (input.existingInvoiceCount > 0)
    blockers.push('A possible duplicate invoice already exists.');
  if (input.isNoChargeReplacement) {
    blockers.push('No-charge replacements require individual review.');
  }

  return {
    status: blockers.length === 0 ? ('CLEAN' as const) : ('BLOCKED' as const),
    eligibleForDraftPreparation: blockers.length === 0,
    blockers,
  };
}
