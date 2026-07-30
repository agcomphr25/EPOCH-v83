export type ActionClassification = 'BLOCKING' | 'ADVISORY' | 'COMPLETE';

export type NextRequiredAction = {
  code: string;
  statement: string;
  responsibleRole: string;
  responsibleUserId?: number | null;
  dueDate?: string | null;
  classification: ActionClassification;
  evidence: string[];
  controlReference?: string | null;
};

export type QualityActionState = {
  recordType: 'NCR' | 'CAR' | 'PCR' | 'ECR' | 'ECN_ECO';
  status: string;
  ownerUserId?: number | null;
  dueDate?: string | null;
  containmentRequired?: boolean;
  containmentComplete?: boolean;
  rootCauseRequired?: boolean;
  rootCauseComplete?: boolean;
  assessmentSubmitted?: boolean;
  assessmentRecommendationsResolved?: boolean;
  investigatorAssigned?: boolean;
  investigationComplete?: boolean;
  designImpact?: boolean | null;
  approvedEcr?: boolean;
  linkedEcnCount?: number;
  customerApprovalRequired?: boolean;
  customerApprovalComplete?: boolean;
  productionBlocked?: boolean;
  controlledDocumentsRequired?: boolean;
  controlledDocumentsReleased?: boolean;
  trainingRequired?: boolean;
  trainingComplete?: boolean;
  faiRequired?: boolean;
  faiDetermined?: boolean;
  faiComplete?: boolean;
  wipDispositionRequired?: boolean;
  wipDispositionComplete?: boolean;
  validationRequired?: boolean;
  validationComplete?: boolean;
  effectivityComplete?: boolean;
  requiredApprovalsComplete?: boolean;
  implementationAuthorized?: boolean;
  implementationComplete?: boolean;
  verificationRequired?: boolean;
  verificationComplete?: boolean;
  effectivenessRequired?: boolean;
  effectivenessComplete?: boolean;
};

const blocking = (
  code: string,
  statement: string,
  role: string,
  evidence: string[],
  controlReference?: string,
  dueDate?: string | null,
  responsibleUserId?: number | null
): NextRequiredAction => ({
  code,
  statement,
  responsibleRole: role,
  responsibleUserId,
  dueDate,
  classification: 'BLOCKING',
  evidence,
  controlReference,
});

export function evaluateNextRequiredAction(
  state: QualityActionState
): NextRequiredAction {
  if (
    ['CLOSED', 'closed'].includes(state.status) &&
    (!state.effectivenessRequired || state.effectivenessComplete)
  ) {
    return {
      code: 'NO_FURTHER_ACTION',
      statement:
        'No further action; record is closed with required effectiveness evidence.',
      responsibleRole: 'QUALITY',
      classification: 'COMPLETE',
      evidence: [
        'Record status is closed',
        'Required effectiveness review is complete or not applicable',
      ],
      controlReference: 'QMS closure control',
    };
  }
  if (!state.assessmentSubmitted)
    return blocking(
      'QUALITY_INITIAL_REVIEW',
      'Quality must perform and submit the initial workflow assessment.',
      'QUALITY',
      ['No submitted Quality Action assessment exists'],
      'QMS initial review'
    );
  if (!state.assessmentRecommendationsResolved)
    return blocking(
      'QUALITY_RECOMMENDATIONS_UNRESOLVED',
      'Quality must confirm each recommendation or document an override.',
      'QUALITY',
      ['One or more assessment recommendations lack a Quality decision'],
      'QMS assessment decision control'
    );
  if (
    state.recordType === 'NCR' &&
    state.containmentRequired &&
    !state.containmentComplete
  )
    return blocking(
      'CONTAINMENT_EVIDENCE_REQUIRED',
      'Containment evidence is missing.',
      'QUALITY',
      [
        'The NCR requires containment',
        'Containment completion evidence is absent',
      ],
      'Nonconforming output control',
      state.dueDate,
      state.ownerUserId
    );
  if (state.rootCauseRequired && !state.rootCauseComplete)
    return blocking(
      'ROOT_CAUSE_REQUIRED',
      'Root-cause analysis is required.',
      'INVESTIGATOR',
      [
        'The issue is significant, recurring, systemic, audit-related, or customer-facing',
      ],
      'Corrective action root-cause control',
      state.dueDate,
      state.ownerUserId
    );
  if (state.recordType === 'PCR' && !state.investigatorAssigned)
    return blocking(
      'INVESTIGATOR_ASSIGNMENT_REQUIRED',
      'An investigator and due date must be assigned.',
      'QUALITY',
      ['The PCR has no assigned investigator'],
      'PCR investigation control'
    );
  if (state.recordType === 'PCR' && state.designImpact !== false)
    return blocking(
      'ENGINEERING_REVIEW_REQUIRED',
      'Engineering review is required because design impact has not been ruled out.',
      'ENGINEERING',
      ['PCR design-impact determination is YES or UNKNOWN'],
      'Design baseline change control'
    );
  if (state.recordType === 'ECR' && state.approvedEcr && !state.linkedEcnCount)
    return blocking(
      'ECN_REQUIRED',
      'The approved ECR requires a linked ECN before implementation.',
      'ENGINEERING',
      ['ECR is approved', 'No implementing ECN is linked'],
      'Engineering release control'
    );
  if (state.customerApprovalRequired && !state.customerApprovalComplete)
    return blocking(
      'CUSTOMER_APPROVAL_REQUIRED',
      'Customer or design-authority approval evidence is required before disposition or implementation.',
      'PROGRAM_CONTRACTS',
      [
        'Customer/contract approval is required',
        'Immutable approval evidence is missing',
      ],
      'Customer and contract authorization control'
    );
  if (state.productionBlocked)
    return blocking(
      'PRODUCTION_HOLD_ACTIVE',
      'An active production hold must be dispositioned before implementation.',
      'QUALITY',
      ['The unified record is marked production blocked'],
      'Production hold control'
    );
  if (state.controlledDocumentsRequired && !state.controlledDocumentsReleased)
    return blocking(
      'CONTROLLED_DOCUMENT_RELEASE_REQUIRED',
      'Affected controlled documents must be revised and released.',
      'DOCUMENT_CONTROL',
      [
        'Controlled documents are affected',
        'A required replacement revision is not released',
      ],
      'Controlled documented information'
    );
  if (state.wipDispositionRequired && !state.wipDispositionComplete)
    return blocking(
      'WIP_INVENTORY_DISPOSITION_REQUIRED',
      'WIP and inventory disposition is incomplete.',
      'QUALITY',
      ['Existing WIP or inventory is potentially affected'],
      'Configuration effectivity control'
    );
  if (!state.effectivityComplete)
    return blocking(
      'EFFECTIVITY_REQUIRED',
      'Implementation effectivity must be established.',
      'QUALITY',
      ['No approved effective point, lot, serial, order, or date is recorded'],
      'Configuration effectivity control'
    );
  if (state.validationRequired && !state.validationComplete)
    return blocking(
      'VALIDATION_TESTING_REQUIRED',
      'Required validation or testing evidence is incomplete.',
      'TECHNICAL_AUTHORITY',
      ['Validation/testing was determined applicable'],
      'Process validation and verification control'
    );
  if (!state.faiDetermined)
    return blocking(
      'FAI_DETERMINATION_REQUIRED',
      'FAI or partial FAI applicability must be determined.',
      'QUALITY',
      ['No explicit FAI determination is recorded'],
      'First article inspection planning'
    );
  if (state.faiRequired && !state.faiComplete)
    return blocking(
      'FAI_EVIDENCE_REQUIRED',
      'Required FAI or partial FAI evidence is incomplete.',
      'QUALITY',
      ['FAI was determined required', 'Linked completion evidence is absent'],
      'First article inspection control'
    );
  if (state.trainingRequired && !state.trainingComplete)
    return blocking(
      'TRAINING_ACKNOWLEDGMENT_REQUIRED',
      'Affected employees require completed training acknowledgments.',
      'TRAINING_OWNER',
      [
        'Training was determined required',
        'Acknowledgment evidence is incomplete',
      ],
      'Competence and awareness control'
    );
  if (!state.requiredApprovalsComplete)
    return blocking(
      'FUNCTIONAL_APPROVALS_REQUIRED',
      'Required functional approvals are incomplete.',
      'QUALITY',
      ['The impact-based approval matrix has unmet functions'],
      'Segregated functional approval control'
    );
  if (!state.implementationAuthorized)
    return blocking(
      'IMPLEMENTATION_AUTHORIZATION_REQUIRED',
      'Quality must issue implementation authorization after every gate passes.',
      'QUALITY',
      ['No implementation authorization event is recorded'],
      'Controlled implementation authorization'
    );
  if (!state.implementationComplete)
    return blocking(
      'IMPLEMENTATION_INCOMPLETE',
      'Approved implementation actions are incomplete.',
      'IMPLEMENTATION_OWNER',
      ['At least one implementation action remains incomplete'],
      'Change implementation control'
    );
  if (state.verificationRequired && !state.verificationComplete)
    return blocking(
      'IMPLEMENTATION_VERIFICATION_REQUIRED',
      'Implementation verification evidence is required.',
      'QUALITY',
      ['Verification is required', 'Verification results are incomplete'],
      'Change verification control'
    );
  if (state.effectivenessRequired && !state.effectivenessComplete)
    return blocking(
      'EFFECTIVENESS_REVIEW_DUE',
      'Effectiveness review is due.',
      'QUALITY',
      ['Corrective-action effectiveness was required and is incomplete'],
      'Corrective action effectiveness control',
      state.dueDate,
      state.ownerUserId
    );
  return {
    code: 'ELIGIBLE_FOR_CLOSURE',
    statement: 'No further action; record is eligible for Quality closure.',
    responsibleRole: 'QUALITY',
    classification: 'ADVISORY',
    evidence: ['All applicable controlled gates are satisfied'],
    controlReference: 'QMS closure control',
  };
}

export function evaluateImplementationGate(state: QualityActionState) {
  const blockers: NextRequiredAction[] = [];
  let cursor = state;
  const seen = new Set<string>();
  while (true) {
    const action = evaluateNextRequiredAction(cursor);
    if (action.classification !== 'BLOCKING' || seen.has(action.code)) break;
    blockers.push(action);
    seen.add(action.code);
    const resolved: Partial<QualityActionState> = {};
    if (action.code === 'QUALITY_INITIAL_REVIEW')
      resolved.assessmentSubmitted = true;
    if (action.code === 'QUALITY_RECOMMENDATIONS_UNRESOLVED')
      resolved.assessmentRecommendationsResolved = true;
    if (action.code === 'CONTAINMENT_EVIDENCE_REQUIRED')
      resolved.containmentComplete = true;
    if (action.code === 'ROOT_CAUSE_REQUIRED')
      resolved.rootCauseComplete = true;
    if (action.code === 'INVESTIGATOR_ASSIGNMENT_REQUIRED')
      resolved.investigatorAssigned = true;
    if (action.code === 'ENGINEERING_REVIEW_REQUIRED')
      resolved.designImpact = false;
    if (action.code === 'ECN_REQUIRED') resolved.linkedEcnCount = 1;
    if (action.code === 'CUSTOMER_APPROVAL_REQUIRED')
      resolved.customerApprovalComplete = true;
    if (action.code === 'PRODUCTION_HOLD_ACTIVE')
      resolved.productionBlocked = false;
    if (action.code === 'CONTROLLED_DOCUMENT_RELEASE_REQUIRED')
      resolved.controlledDocumentsReleased = true;
    if (action.code === 'WIP_INVENTORY_DISPOSITION_REQUIRED')
      resolved.wipDispositionComplete = true;
    if (action.code === 'EFFECTIVITY_REQUIRED')
      resolved.effectivityComplete = true;
    if (action.code === 'VALIDATION_TESTING_REQUIRED')
      resolved.validationComplete = true;
    if (action.code === 'FAI_DETERMINATION_REQUIRED')
      resolved.faiDetermined = true;
    if (action.code === 'FAI_EVIDENCE_REQUIRED') resolved.faiComplete = true;
    if (action.code === 'TRAINING_ACKNOWLEDGMENT_REQUIRED')
      resolved.trainingComplete = true;
    if (action.code === 'FUNCTIONAL_APPROVALS_REQUIRED')
      resolved.requiredApprovalsComplete = true;
    if (action.code === 'IMPLEMENTATION_AUTHORIZATION_REQUIRED')
      resolved.implementationAuthorized = true;
    if (action.code === 'IMPLEMENTATION_INCOMPLETE')
      resolved.implementationComplete = true;
    if (action.code === 'IMPLEMENTATION_VERIFICATION_REQUIRED')
      resolved.verificationComplete = true;
    if (action.code === 'EFFECTIVENESS_REVIEW_DUE')
      resolved.effectivenessComplete = true;
    cursor = { ...cursor, ...resolved };
  }
  return { allowed: blockers.length === 0, blockers };
}
