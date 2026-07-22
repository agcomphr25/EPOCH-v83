export type DesignResponsibility =
  | 'CUSTOMER_BUILD_TO_PRINT'
  | 'AG_DESIGN_RESPONSIBLE'
  | 'SHARED_DESIGN_RESPONSIBILITY';

export type DesignInput = {
  responsibilityType: DesignResponsibility;
  agDesignScope?: string | null;
  customerDesignScope?: string | null;
  responsibilityBoundary?: string | null;
  requirementSource: string;
  customerDrawingNumber?: string | null;
  customerDrawingRevision?: string | null;
  customerSpecifications?: unknown[];
  linkedDesignProjectId?: string | null;
  justification: string;
};

export class ProjectDesignApplicabilityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ProjectDesignApplicabilityError';
  }
}

const clean = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export function validateDesignApplicabilityInput(input: DesignInput) {
  const missing: string[] = [];
  if (
    ![
      'CUSTOMER_BUILD_TO_PRINT',
      'AG_DESIGN_RESPONSIBLE',
      'SHARED_DESIGN_RESPONSIBILITY',
    ].includes(input.responsibilityType)
  )
    missing.push('responsibilityType');
  if (!clean(input.requirementSource)) missing.push('requirementSource');
  if (!clean(input.justification)) missing.push('justification');
  if (input.responsibilityType === 'CUSTOMER_BUILD_TO_PRINT') {
    if (!clean(input.customerDrawingNumber))
      missing.push('customerDrawingNumber');
    if (!clean(input.customerDrawingRevision))
      missing.push('customerDrawingRevision');
    if (!clean(input.agDesignScope)) missing.push('agDesignScope');
  }
  if (input.responsibilityType !== 'CUSTOMER_BUILD_TO_PRINT') {
    if (!clean(input.agDesignScope)) missing.push('agDesignScope');
    if (!clean(input.linkedDesignProjectId))
      missing.push('linkedDesignProjectId');
  }
  if (input.responsibilityType === 'SHARED_DESIGN_RESPONSIBILITY') {
    if (!clean(input.customerDesignScope)) missing.push('customerDesignScope');
    if (!clean(input.responsibilityBoundary))
      missing.push('responsibilityBoundary');
  }
  if (missing.length)
    throw new ProjectDesignApplicabilityError(
      'DESIGN_APPLICABILITY_FIELDS_REQUIRED',
      `Required Design Applicability fields are missing: ${missing.join(', ')}.`,
      400,
      { missing }
    );
}
