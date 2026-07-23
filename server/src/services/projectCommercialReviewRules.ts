export type CommercialStageRule =
  | 'rfq_risk_assessment'
  | 'estimate_quote'
  | 'contract_review';

export function commercialQuoteEligibility(input: {
  quoteStatus: string;
  validUntil?: string | Date | null;
  hasReleasedSnapshot: boolean;
  estimateStatus?: string | null;
  estimateApprovalStatuses: string[];
  now?: number;
}) {
  const values: string[] = [];
  if (!['SENT', 'ACCEPTED'].includes(input.quoteStatus.toUpperCase()))
    values.push(
      `Quote status ${input.quoteStatus} is not eligible for V2 completion.`
    );
  if (
    input.validUntil &&
    new Date(input.validUntil).getTime() < (input.now ?? Date.now())
  )
    values.push('Quote validity has expired.');
  if (!input.hasReleasedSnapshot)
    values.push('Released quote snapshot is required.');
  if (!input.estimateStatus)
    values.push('An authoritative estimate version is required.');
  else if (
    !['APPROVED', 'RELEASED'].includes(input.estimateStatus.toUpperCase())
  )
    values.push('Estimate version is not approved/released.');
  if (
    input.estimateApprovalStatuses.some(
      (status) => status.toUpperCase() !== 'APPROVED'
    )
  )
    values.push('Estimate has incomplete or rejected authorization evidence.');
  return values;
}

export const requiredCommercialApprovalRoles = (
  stage: CommercialStageRule,
  financeRequired = false
) =>
  stage === 'contract_review'
    ? [
        'PROJECT_MANAGEMENT',
        'ENGINEERING',
        'QUALITY',
        'OPERATIONS',
        ...(financeRequired ? ['FINANCE'] : []),
      ]
    : ['PROJECT_MANAGEMENT'];
