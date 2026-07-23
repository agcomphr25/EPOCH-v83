export type DesignControlWorkflowItem = {
  key: string;
  label: string;
  legacyLabels?: readonly string[];
  requiredCapability?: string;
  allowedRoles?: readonly string[];
  signatureMeaning?: string;
  requiresIndependentReviewer?: boolean;
  incompatibleRoleGroup?: string;
  allowNotApplicable?: boolean;
};

export type DesignControlWorkflowStep = {
  key: string;
  order: number;
  title: string;
  purpose: string;
  fields: readonly DesignControlWorkflowItem[];
  checklist: readonly DesignControlWorkflowItem[];
  approvals: readonly DesignControlWorkflowItem[];
  examples?: readonly string[];
  releaseGate: boolean;
};

const item = (
  label: string,
  key = label,
  legacyLabels?: readonly string[]
): DesignControlWorkflowItem => ({
  key,
  label,
  legacyLabels,
});

type ApprovalSlotPolicy = Required<
  Pick<
    DesignControlWorkflowItem,
    'key' | 'requiredCapability' | 'signatureMeaning'
  >
> &
  Pick<
    DesignControlWorkflowItem,
    | 'allowedRoles'
    | 'requiresIndependentReviewer'
    | 'incompatibleRoleGroup'
    | 'allowNotApplicable'
  >;

const approvalPolicy = (
  key: string,
  requiredCapability: string,
  allowedRoles: readonly string[],
  options: Partial<ApprovalSlotPolicy> = {}
): ApprovalSlotPolicy => ({
  key,
  requiredCapability,
  allowedRoles,
  signatureMeaning: 'I reviewed this exact Design Control step version and approve it for its stated purpose.',
  requiresIndependentReviewer: true,
  ...options,
});

export const DESIGN_CONTROL_APPROVAL_SLOT_POLICIES: Readonly<
  Record<string, ApprovalSlotPolicy>
> = {
  'Engineering intake approval': approvalPolicy(
    'engineering_intake_approval',
    'design.control.approve',
    ['ENGINEERING', 'ENGINEER', 'ADMIN', 'OWNER']
  ),
  'Quality intake approval': approvalPolicy(
    'quality_intake_approval',
    'design.control.approve',
    ['QUALITY', 'QUALITY_MANAGER', 'ADMIN', 'OWNER']
  ),
  'Engineering planning approval': approvalPolicy(
    'engineering_planning_approval',
    'design.control.approve',
    ['ENGINEERING', 'ENGINEER', 'ADMIN', 'OWNER']
  ),
  'Quality planning approval': approvalPolicy(
    'quality_planning_approval',
    'design.control.approve',
    ['QUALITY', 'QUALITY_MANAGER', 'ADMIN', 'OWNER']
  ),
  'Manufacturing planning approval': approvalPolicy(
    'manufacturing_planning_approval',
    'design.control.approve',
    ['MANUFACTURING', 'MANAGER', 'ADMIN', 'OWNER']
  ),
  'Requirements owner approval': approvalPolicy(
    'requirements_owner_approval',
    'design.requirement.approve',
    ['ENGINEERING', 'ENGINEER', 'QUALITY', 'ADMIN', 'OWNER']
  ),
  'Engineering approval': approvalPolicy(
    'engineering_requirements_review_approval',
    'design.requirement.approve',
    ['ENGINEERING', 'ENGINEER', 'ADMIN', 'OWNER']
  ),
  'Quality approval': approvalPolicy(
    'quality_requirements_review_approval',
    'design.requirement.approve',
    ['QUALITY', 'QUALITY_MANAGER', 'ADMIN', 'OWNER']
  ),
  'Engineering risk approval': approvalPolicy(
    'engineering_risk_approval',
    'design.risk.accept',
    ['ENGINEERING', 'ENGINEER', 'ADMIN', 'OWNER']
  ),
  'Quality risk approval': approvalPolicy(
    'quality_risk_approval',
    'design.risk.accept',
    ['QUALITY', 'QUALITY_MANAGER', 'ADMIN', 'OWNER']
  ),
  'Engineering concept approval': approvalPolicy(
    'engineering_concept_approval',
    'design.control.approve',
    ['ENGINEERING', 'ENGINEER', 'ADMIN', 'OWNER']
  ),
  'Quality concept approval': approvalPolicy(
    'quality_concept_approval',
    'design.control.approve',
    ['QUALITY', 'QUALITY_MANAGER', 'ADMIN', 'OWNER']
  ),
  'Manufacturing concept approval': approvalPolicy(
    'manufacturing_concept_approval',
    'design.control.approve',
    ['MANUFACTURING', 'MANAGER', 'ADMIN', 'OWNER']
  ),
  'Engineering output approval': approvalPolicy(
    'engineering_output_approval',
    'design.control.approve',
    ['ENGINEERING', 'ENGINEER', 'ADMIN', 'OWNER']
  ),
  'Document control approval': approvalPolicy(
    'document_control_approval',
    'design.control.approve',
    ['DOCUMENT_MANAGER', 'QUALITY', 'ADMIN', 'OWNER']
  ),
  'Engineering build approval': approvalPolicy(
    'engineering_build_approval',
    'design.control.approve',
    ['ENGINEERING', 'ENGINEER', 'ADMIN', 'OWNER']
  ),
  'Quality build approval': approvalPolicy(
    'quality_build_approval',
    'design.control.approve',
    ['QUALITY', 'QUALITY_MANAGER', 'ADMIN', 'OWNER']
  ),
  'Verification approval': approvalPolicy(
    'verification_approval',
    'design.verify',
    ['ENGINEERING', 'QUALITY', 'QUALITY_MANAGER', 'ADMIN', 'OWNER']
  ),
  'Engineering validation approval': approvalPolicy(
    'engineering_validation_approval',
    'design.validate',
    ['ENGINEERING', 'ENGINEER', 'ADMIN', 'OWNER']
  ),
  'Quality validation approval': approvalPolicy(
    'quality_validation_approval',
    'design.validate',
    ['QUALITY', 'QUALITY_MANAGER', 'ADMIN', 'OWNER']
  ),
  'Customer/program validation approval': approvalPolicy(
    'program_validation_approval',
    'design.validate',
    ['PROGRAM_MANAGER', 'MANAGER', 'ADMIN', 'OWNER'],
    { allowNotApplicable: true }
  ),
  Engineering: approvalPolicy(
    'engineering_final_review_approval',
    'design.control.approve',
    ['ENGINEERING', 'ENGINEER', 'ADMIN', 'OWNER']
  ),
  Quality: approvalPolicy(
    'quality_final_review_approval',
    'design.control.approve',
    ['QUALITY', 'QUALITY_MANAGER', 'ADMIN', 'OWNER']
  ),
  Manufacturing: approvalPolicy(
    'manufacturing_final_review_approval',
    'design.control.approve',
    ['MANUFACTURING', 'MANAGER', 'ADMIN', 'OWNER']
  ),
  'Program Manager': approvalPolicy(
    'program_manager_final_review_approval',
    'design.control.approve',
    ['PROGRAM_MANAGER', 'MANAGER', 'ADMIN', 'OWNER']
  ),
  'Engineering release approval': approvalPolicy(
    'engineering_release_approval',
    'design.release',
    ['ENGINEERING', 'ENGINEER', 'ADMIN', 'OWNER'],
    { incompatibleRoleGroup: 'release' }
  ),
  'Quality release approval': approvalPolicy(
    'quality_release_approval',
    'design.release',
    ['QUALITY', 'QUALITY_MANAGER', 'ADMIN', 'OWNER'],
    { incompatibleRoleGroup: 'release' }
  ),
  'Manufacturing release approval': approvalPolicy(
    'manufacturing_release_approval',
    'design.release',
    ['MANUFACTURING', 'MANAGER', 'ADMIN', 'OWNER'],
    { incompatibleRoleGroup: 'release' }
  ),
  'Program Manager release approval': approvalPolicy(
    'program_manager_release_approval',
    'design.release',
    ['PROGRAM_MANAGER', 'MANAGER', 'ADMIN', 'OWNER'],
    { incompatibleRoleGroup: 'release', allowNotApplicable: true }
  ),
};

const items = (labels: readonly string[]) =>
  labels.map((label) => {
    const policy = DESIGN_CONTROL_APPROVAL_SLOT_POLICIES[label];
    return policy
      ? { ...item(label, policy.key, [label]), ...policy }
      : item(label);
  });

const approvalSlot = (label: string): DesignControlWorkflowItem => {
  const policy = DESIGN_CONTROL_APPROVAL_SLOT_POLICIES[label];
  if (!policy) throw new Error(`Missing Design Control approval policy for ${label}`);
  return { ...item(label, policy.key, [label]), ...policy };
};

export const DESIGN_CONTROL_WORKFLOW = [
  {
    key: '1',
    order: 1,
    title: 'Design Project Intake',
    purpose: 'Capture what is being designed and why.',
    releaseGate: false,
    fields: items([
      'Project / customer / order link',
      'Design type',
      'Product name',
      'Intended use',
      'Customer requirements summary',
      'Target manufacturing date',
      'Responsible engineer',
      'Quality representative',
      'Manufacturing representative',
      'Required deliverables',
    ]),
    checklist: [],
    approvals: items([
      'Engineering intake approval',
      'Quality intake approval',
    ]),
  },
  {
    key: '2',
    order: 2,
    title: 'Design Planning',
    purpose: 'AS9100 design planning.',
    releaseGate: false,
    fields: items([
      'Design scope',
      'Design milestones',
      'Required reviews',
      'Required verification activities',
      'Required validation activities',
      'Required resources',
      'Required suppliers',
      'Required software/tools',
      'Responsibilities',
      'Approval roles',
    ]),
    checklist: [],
    approvals: items([
      'Engineering planning approval',
      'Quality planning approval',
      'Manufacturing planning approval',
    ]),
  },
  {
    key: '3',
    order: 3,
    title: 'Design Inputs / Requirements',
    purpose: 'Capture controlled design inputs.',
    releaseGate: false,
    fields: items([
      'Requirement ID',
      'Requirement category',
      'Source',
      'Requirement statement',
      'Acceptance criteria',
      'Verification method',
      'Priority',
      'Owner',
      'Status',
    ]),
    checklist: items([
      'Customer requirements captured',
      'Performance requirements captured',
      'Regulatory requirements captured',
      'Safety requirements captured',
      'Material requirements captured',
      'Manufacturing requirements captured',
      'Inspection requirements captured',
      'Test requirements captured',
      'Packaging/shipping requirements captured',
    ]),
    approvals: items(['Requirements owner approval']),
  },
  {
    key: '4',
    order: 4,
    title: 'Requirements Review Checklist',
    purpose: 'Confirm requirements are complete before design work proceeds.',
    releaseGate: false,
    fields: items([
      'Review notes',
      'Open requirement gaps',
      'Disposition of conflicts',
    ]),
    checklist: items([
      'Requirements are complete',
      'Requirements are clear',
      'Requirements are measurable',
      'Conflicts resolved',
      'Missing information documented',
      'Manufacturability reviewed',
      'Inspection requirements reviewed',
      'Test requirements reviewed',
      'Quality approval complete',
      'Engineering approval complete',
    ]),
    approvals: items(['Engineering approval', 'Quality approval']),
  },
  {
    key: '5',
    order: 5,
    title: 'Design Risk Assessment',
    purpose:
      'Assess design risk before committing to the selected design path.',
    releaseGate: false,
    fields: items([
      'Risk item',
      'Failure mode',
      'Cause',
      'Effect',
      'Severity',
      'Occurrence',
      'Detection',
      'Risk priority',
      'Mitigation action',
      'Owner',
      'Due date',
      'Residual risk',
      'Approval status',
    ]),
    checklist: [],
    approvals: items(['Engineering risk approval', 'Quality risk approval']),
    examples: [
      'Battery overheating',
      'Composite delamination',
      'Wing flex',
      'CG out of tolerance',
      'Servo mount failure',
      'Material substitution',
      'Supplier component change',
      'Prototype test failure',
    ],
  },
  {
    key: '6',
    order: 6,
    title: 'Concept Design Review',
    purpose: 'Approve the concept before detailed design.',
    releaseGate: false,
    fields: items([
      'Concept summary',
      'Design alternatives considered',
      'Selected concept',
      'Reason selected',
      'Major assumptions',
      'Open questions',
      'Manufacturability concerns',
      'Quality concerns',
      'Attachments',
    ]),
    checklist: items([
      'Concept meets major requirements',
      'Risks reviewed',
      'Manufacturing reviewed',
      'Quality reviewed',
      'Customer needs considered',
      'Approval to proceed',
    ]),
    approvals: items([
      'Engineering concept approval',
      'Quality concept approval',
      'Manufacturing concept approval',
    ]),
  },
  {
    key: '7',
    order: 7,
    title: 'Detailed Design Outputs',
    purpose: 'Control the actual design output package.',
    releaseGate: false,
    fields: items([
      'Output package notes',
      'Linked drawings/BOM/revision package',
      'Design output owner',
    ]),
    checklist: items([
      'CAD model attached',
      'Drawing attached',
      'BOM created',
      'Material specs defined',
      'Critical characteristics defined',
      'Tolerances defined',
      'Special processes defined',
      'Inspection points defined',
      'Test requirements defined',
      'Software/firmware version defined, if applicable',
      'Supplier parts identified',
      'Revision assigned',
      'Design output approved',
    ]),
    approvals: items([
      'Engineering output approval',
      'Document control approval',
    ]),
  },
  {
    key: '8',
    order: 8,
    title: 'Prototype Build Record',
    purpose: 'Document exactly what was built.',
    releaseGate: false,
    fields: items([
      'Prototype serial number',
      'Build revision',
      'Build date',
      'Builder',
      'Linked BOM revision',
      'Linked drawing revisions',
      'Material lots',
      'Purchased component lots/serials',
      'Deviations used',
      'Photos',
      'Build notes',
      'Issues found',
      'Disposition',
    ]),
    checklist: [],
    approvals: items(['Engineering build approval', 'Quality build approval']),
  },
  {
    key: '9',
    order: 9,
    title: 'Design Verification',
    purpose: 'Confirm the design output meets the design inputs.',
    releaseGate: false,
    fields: items([
      'Requirement ID',
      'Verification method',
      'Test/inspection performed',
      'Result',
      'Pass/fail',
      'Evidence attachment',
      'Nonconformance link',
      'Engineering disposition',
      'Verified by',
      'Date',
    ]),
    checklist: [],
    approvals: items(['Verification approval']),
  },
  {
    key: '10',
    order: 10,
    title: 'Design Validation',
    purpose: 'Confirm the product works for the intended use/customer mission.',
    releaseGate: false,
    fields: items([
      'Validation activity',
      'Intended use tested',
      'Mission/profile tested',
      'Customer requirement linked',
      'Result',
      'Pass/fail',
      'Evidence attachment',
      'Customer witness/approval, if applicable',
      'Validation approval',
    ]),
    checklist: [],
    approvals: items([
      'Engineering validation approval',
      'Quality validation approval',
      'Customer/program validation approval',
    ]),
  },
  {
    key: '11',
    order: 11,
    title: 'Final Design Review',
    purpose: 'Cross-functional approval before manufacturing release.',
    releaseGate: false,
    fields: items([
      'Final review notes',
      'Open issue disposition',
      'Configuration baseline',
    ]),
    checklist: items([
      'All requirements reviewed',
      'All high risks closed or accepted',
      'Design outputs approved',
      'Prototype build documented',
      'Verification complete',
      'Validation complete',
      'Open issues dispositioned',
      'Configuration baseline established',
      'Manufacturing reviewed',
      'Quality reviewed',
      'Program management reviewed',
    ]),
    approvals: items([
      'Engineering',
      'Quality',
      'Manufacturing',
      'Program Manager',
    ]),
  },
  {
    key: '12',
    order: 12,
    title: 'Engineering Release Gate',
    purpose:
      'Freeze the controlled engineering baseline before manufactured inventory item creation.',
    releaseGate: true,
    fields: items([
      'Release package notes',
      'Linked project_id / PO / WAD',
      'Locked design revision baseline',
    ]),
    checklist: [
      item('Released CAD', 'released CAD'),
      item('Released drawings', 'released drawings'),
      item('Released BOM', 'released BOM'),
      item('Approved routing', 'approved routing'),
      item('Approved traveler requirement', 'approved traveler requirement'),
      item('Approved work instructions', 'approved work instructions'),
      item('Approved inspection plan', 'approved inspection plan'),
      item('Approved test procedure', 'approved test procedure'),
      item(
        'Required certifications identified',
        'required certifications identified'
      ),
      item(
        'Supplier requirements flowed down',
        'supplier requirements flowed down'
      ),
      item('Material requirements approved', 'material requirements approved'),
      item('Tooling/fixtures ready', 'tooling and fixtures ready', [
        'tooling/fixtures ready',
      ]),
      item(
        'CNC programs approved, if applicable',
        'CNC programs approved when applicable',
        ['CNC programs approved, if applicable']
      ),
      item(
        'Training/certifications complete',
        'training and certifications complete',
        ['training/certifications complete']
      ),
      item(
        'Packaging/shipping requirements defined',
        'packaging and shipping requirements defined',
        ['packaging/shipping requirements defined']
      ),
      item(
        'Design revision baseline locked',
        'design revision baseline locked'
      ),
    ],
    approvals: [
      approvalSlot('Engineering release approval'),
      approvalSlot('Quality release approval'),
      approvalSlot('Manufacturing release approval'),
      approvalSlot('Program Manager release approval'),
    ],
  },
] as const satisfies readonly DesignControlWorkflowStep[];

export const DESIGN_CONTROL_STEP_KEYS = DESIGN_CONTROL_WORKFLOW.map(
  (step) => step.key
);

export function workflowItemLookupKeys(
  value: DesignControlWorkflowItem
): string[] {
  return Array.from(
    new Set([value.key, value.label, ...(value.legacyLabels ?? [])])
  );
}
