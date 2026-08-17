import type { DesignControlWorkflowItem } from '@shared/designControlWorkflow';

export type DesignControlFieldKind =
  | 'text'
  | 'textarea'
  | 'date'
  | 'select'
  | 'project'
  | 'person'
  | 'role'
  | 'attachment';

export type DesignControlFieldPresentation = {
  kind: DesignControlFieldKind;
  options?: readonly string[];
  help: string;
  placeholder?: string;
};

export type StructuredDesignControlRecordType =
  'REQUIREMENT' | 'RISK' | 'REVIEW' | 'VERIFICATION' | 'VALIDATION';

export const STRUCTURED_RECORD_TYPE_BY_STEP: Partial<
  Record<string, StructuredDesignControlRecordType>
> = {
  '3': 'REQUIREMENT',
  '5': 'RISK',
  '6': 'REVIEW',
  '9': 'VERIFICATION',
  '10': 'VALIDATION',
  '11': 'REVIEW',
};

const optionSets: Record<string, readonly string[]> = {
  'Design type': [
    'NEW_PRODUCT',
    'DERIVATIVE_DESIGN',
    'DESIGN_CHANGE',
    'RESEARCH_AND_DEVELOPMENT',
  ],
  'Requirement category': [
    'CUSTOMER',
    'FUNCTIONAL',
    'PERFORMANCE',
    'REGULATORY',
    'SAFETY',
    'MATERIAL',
    'MANUFACTURING',
    'INSPECTION',
    'TEST',
    'PACKAGING_SHIPPING',
  ],
  'Verification method': [
    'Inspection',
    'Analysis',
    'Demonstration',
    'Test',
    'Similarity',
    'Alternative calculation',
  ],
  Priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  Status: ['DRAFT', 'OPEN', 'IN_REVIEW', 'APPROVED', 'CLOSED'],
  Severity: ['1', '2', '3', '4', '5'],
  Occurrence: ['1', '2', '3', '4', '5'],
  Detection: ['1', '2', '3', '4', '5'],
  'Risk priority': ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  'Approval status': ['PENDING', 'APPROVED', 'REJECTED', 'RETURNED'],
  'Pass/fail': ['PASS', 'FAIL'],
  Disposition: [
    'ACCEPTED',
    'REWORK_REQUIRED',
    'USE_AS_IS_APPROVED',
    'REJECTED',
  ],
};

const personPattern =
  /responsible engineer|representative|owner|builder|verified by|performed by|responsible person/i;
const rolePattern = /approval roles|responsibilities|role$/i;
const datePattern = /date|due date|target manufacturing/i;
const attachmentPattern = /attachment|photos|linked .*package/i;
const multilinePattern =
  /summary|requirements|deliverables|scope|milestones|activities|resources|suppliers|tools|notes|criteria|statement|gaps|conflicts|risk|failure|cause|effect|mitigation|concept|alternatives|assumptions|questions|concerns|package|lots|deviations|issues|result|disposition|intended use|mission|configuration baseline|baseline|instructions/i;

export function getDesignControlFieldPresentation(
  _stepKey: string,
  item: DesignControlWorkflowItem
): DesignControlFieldPresentation {
  const label = item.label;
  if (label === 'Project / customer / order link') {
    return {
      kind: 'project',
      help: 'Use the linked Design Control project when applicable, or enter another controlled customer or order reference.',
    };
  }
  const options = optionSets[label];
  if (options) {
    return {
      kind: 'select',
      options,
      help: `Choose the controlled ${label.toLowerCase()} value.`,
    };
  }
  if (datePattern.test(label)) {
    return {
      kind: 'date',
      help: 'Use the date applicable to this exact controlled stage version.',
    };
  }
  if (attachmentPattern.test(label)) {
    return {
      kind: 'attachment',
      help: 'Enter the controlled artifact reference, then use Open evidence upload to attach the file to this step form.',
      placeholder: 'Document number, revision, or retained evidence reference',
    };
  }
  if (personPattern.test(label)) {
    return {
      kind: 'person',
      help: 'Select the accountable person assigned to this Design Control project.',
      placeholder: "Enter the accountable person's name",
    };
  }
  if (rolePattern.test(label)) {
    return {
      kind: 'role',
      options: [
        'DESIGN_AUTHORITY',
        'PROJECT_MANAGER',
        'QUALITY',
        'MANUFACTURING',
        'REVIEWER',
        'CONTRIBUTOR',
      ],
      help: 'Use the accountable project role, not an informal job title.',
    };
  }
  if (multilinePattern.test(label)) {
    return {
      kind: 'textarea',
      help: `Record objective ${label.toLowerCase()} evidence for this stage.`,
    };
  }
  return {
    kind: 'text',
    help: `Enter the controlled ${label.toLowerCase()} value.`,
  };
}

export function nextActionForStep(status?: string | null, missingCount = 0) {
  if (status === 'submitted_for_approval')
    return 'An authorized, independent reviewer must record the next decision.';
  if (status === 'approved')
    return 'This controlled stage is approved. Continue to the next lifecycle step.';
  if (missingCount > 0)
    return `Complete the ${missingCount} missing required item${missingCount === 1 ? '' : 's'}, then save the draft.`;
  return 'Save this controlled draft, then submit the exact saved version for review.';
}
