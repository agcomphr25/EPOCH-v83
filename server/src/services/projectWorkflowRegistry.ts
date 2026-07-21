import {
  PROJECT_WORKFLOW_VERSIONS,
  type ProjectWorkflowVersion,
  resolveProjectWorkflowVersion,
} from './projectWorkflowVersionService';

export type ProjectWorkflowStepStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'skipped'
  | 'not_applicable';

export type WorkflowStepApplicabilityPolicy = 'always' | 'contextual';
export type WorkflowStepCompletionPolicy = 'manual' | 'release_gate';
export type LegacyProjectWorkflowStepType =
  | 'rfq_risk_assessment'
  | 'quote'
  | 'purchase_review_checklist'
  | 'preproduction_checklist'
  | 'p2_order';

export type ProjectWorkflowStepDefinition = Readonly<{
  type: LegacyProjectWorkflowStepType;
  order: number;
  label: string;
  description: string;
  route: string;
  initialStatus: ProjectWorkflowStepStatus;
  linkedRecordType: string | null;
  legacyLinkedField: string | null;
  stage: string | null;
  skippable: boolean;
  applicabilityPolicy: WorkflowStepApplicabilityPolicy;
  completionPolicy: WorkflowStepCompletionPolicy;
}>;

export type ProjectWorkflowStageDefinition = Readonly<{
  type: string;
  order: number;
  label: string;
}>;

export type ProjectWorkflowDefinition = Readonly<{
  version: ProjectWorkflowVersion;
  label: string;
  active: boolean;
  initializable: boolean;
  steps: readonly ProjectWorkflowStepDefinition[];
  stages: readonly ProjectWorkflowStageDefinition[];
}>;

export class ProjectWorkflowDefinitionValidationError extends Error {
  readonly code = 'INVALID_PROJECT_WORKFLOW_DEFINITION';

  constructor(message: string) {
    super(message);
    this.name = 'ProjectWorkflowDefinitionValidationError';
  }
}

const freezeItems = <T extends object>(
  items: readonly T[]
): readonly Readonly<T>[] =>
  Object.freeze(items.map((item) => Object.freeze({ ...item })));

const LEGACY_V1_STEPS = freezeItems<ProjectWorkflowStepDefinition>([
  {
    type: 'rfq_risk_assessment',
    order: 1,
    label: 'RFQ Risk Assessment',
    description: 'RFQ risk assessment',
    route: '/rfq-risk-assessment',
    initialStatus: 'in_progress',
    linkedRecordType: 'rfq_risk_assessment',
    legacyLinkedField: 'linkedRfqId',
    stage: 'rfq_received',
    skippable: true,
    applicabilityPolicy: 'always',
    completionPolicy: 'manual',
  },
  {
    type: 'quote',
    order: 2,
    label: 'Quote',
    description: 'Quote preparation',
    route: '/p2-quote-form',
    initialStatus: 'pending',
    linkedRecordType: 'quote',
    legacyLinkedField: 'linkedQuoteId',
    stage: 'quote_submitted',
    skippable: true,
    applicabilityPolicy: 'always',
    completionPolicy: 'manual',
  },
  {
    type: 'purchase_review_checklist',
    order: 3,
    label: 'Purchase Review Checklist',
    description: 'Purchase review checklist',
    route: '/purchase-review-checklist',
    initialStatus: 'pending',
    linkedRecordType: 'purchase_review_checklist',
    legacyLinkedField: 'linkedPurchaseReviewId',
    stage: 'purchase_review',
    skippable: true,
    applicabilityPolicy: 'always',
    completionPolicy: 'manual',
  },
  {
    type: 'preproduction_checklist',
    order: 4,
    label: 'Pre-production Checklist',
    description: 'Pre-production checklist',
    route: '/preproduction-checklists',
    initialStatus: 'pending',
    linkedRecordType: 'preproduction_checklist',
    legacyLinkedField: 'linkedPreproductionChecklistId',
    stage: 'po_received',
    skippable: true,
    applicabilityPolicy: 'always',
    completionPolicy: 'manual',
  },
  {
    type: 'p2_order',
    order: 5,
    label: 'P2 Order',
    description: 'P2 order and release',
    route: '/p2-control-center',
    initialStatus: 'pending',
    linkedRecordType: 'p2_purchase_order',
    legacyLinkedField: 'linkedP2OrderId',
    stage: null,
    skippable: true,
    applicabilityPolicy: 'always',
    completionPolicy: 'release_gate',
  },
]);

const P2_V2_STAGES = freezeItems<ProjectWorkflowStageDefinition>([
  { type: 'rfq_risk_assessment', order: 1, label: 'RFQ & Risk' },
  { type: 'estimate_quote', order: 2, label: 'Estimate & Quote' },
  { type: 'contract_review', order: 3, label: 'PO & Contract Review' },
  { type: 'design_applicability', order: 4, label: 'Design Applicability' },
  { type: 'production_planning', order: 5, label: 'Production Planning' },
  { type: 'wad_authorization', order: 6, label: 'WAD Authorization' },
  { type: 'preproduction_release', order: 7, label: 'Preproduction & Release' },
  { type: 'production_quality', order: 8, label: 'Production & Quality' },
  {
    type: 'final_release_shipping',
    order: 9,
    label: 'Final Release & Shipping',
  },
  { type: 'project_closing', order: 10, label: 'Project Closing' },
]);

const DEFINITIONS: Readonly<
  Record<ProjectWorkflowVersion, ProjectWorkflowDefinition>
> = Object.freeze({
  legacy_v1: Object.freeze({
    version: 'legacy_v1',
    label: 'Legacy P2 Project Workflow',
    active: true,
    initializable: true,
    steps: LEGACY_V1_STEPS,
    stages: Object.freeze([]),
  }),
  p2_v2: Object.freeze({
    version: 'p2_v2',
    label: 'P2 Project Workflow V2',
    active: false,
    initializable: false,
    steps: Object.freeze([]),
    stages: P2_V2_STAGES,
  }),
});

function validateOrderedItems(
  version: ProjectWorkflowVersion,
  kind: string,
  items: readonly { type: string; order: number; label: string }[]
): void {
  const types = new Set(items.map((item) => item.type));
  const orders = new Set(items.map((item) => item.order));
  if (types.size !== items.length)
    throw new ProjectWorkflowDefinitionValidationError(
      `${version} has duplicate ${kind} types`
    );
  if (orders.size !== items.length)
    throw new ProjectWorkflowDefinitionValidationError(
      `${version} has duplicate ${kind} orders`
    );
  if (items.some((item) => item.label.trim().length === 0))
    throw new ProjectWorkflowDefinitionValidationError(
      `${version} has an empty ${kind} label`
    );
  const sortedOrders = [...orders].sort((a, b) => a - b);
  if (sortedOrders.some((order, index) => order !== index + 1))
    throw new ProjectWorkflowDefinitionValidationError(
      `${version} ${kind} orders must be contiguous from 1`
    );
}

export function validateProjectWorkflowDefinition(
  definition: ProjectWorkflowDefinition
): void {
  if (!PROJECT_WORKFLOW_VERSIONS.includes(definition.version))
    throw new ProjectWorkflowDefinitionValidationError(
      `Unsupported workflow version: ${definition.version}`
    );
  validateOrderedItems(definition.version, 'step', definition.steps);
  validateOrderedItems(definition.version, 'stage', definition.stages);
  if (definition.version === 'legacy_v1') {
    if (definition.steps.length !== 5)
      throw new ProjectWorkflowDefinitionValidationError(
        'legacy_v1 must have exactly five steps'
      );
    if (
      definition.steps.some(
        (step) => !['pending', 'in_progress'].includes(step.initialStatus)
      )
    )
      throw new ProjectWorkflowDefinitionValidationError(
        'legacy_v1 has an unsupported initial status'
      );
    if (definition.steps.some((step) => !step.route.startsWith('/')))
      throw new ProjectWorkflowDefinitionValidationError(
        'legacy_v1 has an invalid route'
      );
  }
  if (definition.version === 'p2_v2') {
    if (definition.stages.length !== 10)
      throw new ProjectWorkflowDefinitionValidationError(
        'p2_v2 must have exactly ten metadata stages'
      );
    if (definition.initializable || definition.steps.length > 0)
      throw new ProjectWorkflowDefinitionValidationError(
        'p2_v2 must remain inactive and non-initializable'
      );
  }
}

for (const definition of Object.values(DEFINITIONS))
  validateProjectWorkflowDefinition(definition);

export function getProjectWorkflowDefinition(
  version: ProjectWorkflowVersion | unknown
): ProjectWorkflowDefinition {
  return DEFINITIONS[resolveProjectWorkflowVersion(version)];
}

export function getProjectWorkflowStepDefinition(
  version: ProjectWorkflowVersion | unknown,
  stepType: string
): ProjectWorkflowStepDefinition | undefined {
  return getProjectWorkflowDefinition(version).steps.find(
    (step) => step.type === stepType
  );
}

export function getOrderedProjectWorkflowSteps(
  version: ProjectWorkflowVersion | unknown
): readonly ProjectWorkflowStepDefinition[] {
  return getProjectWorkflowDefinition(version).steps;
}

export function getInitializableProjectWorkflowSteps(
  version: ProjectWorkflowVersion | unknown
): readonly ProjectWorkflowStepDefinition[] {
  const definition = getProjectWorkflowDefinition(version);
  if (!definition.initializable) {
    throw new ProjectWorkflowDefinitionValidationError(
      `${definition.version} workflow initialization is not available`
    );
  }
  return definition.steps;
}

export function isLegacyProjectWorkflow(
  version: ProjectWorkflowVersion | unknown
): boolean {
  return resolveProjectWorkflowVersion(version) === 'legacy_v1';
}

// SQL startup repair consumes this immutable projection. Keep it exported so
// equivalence with the central registry can be tested without database writes.
export const LEGACY_STARTUP_REPAIR_STEPS = freezeItems(
  LEGACY_V1_STEPS.map(({ type, order, initialStatus }) => ({
    type,
    order,
    initialStatus,
  }))
);
