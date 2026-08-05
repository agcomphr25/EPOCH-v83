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
  description: string;
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

const P2_V2_DEFINITION_V1_STAGES = freezeItems<ProjectWorkflowStageDefinition>([
  {
    type: 'rfq_risk_assessment',
    order: 1,
    label: 'RFQ & Risk',
    description: 'Capture RFQ scope and risk evidence.',
  },
  {
    type: 'estimate_quote',
    order: 2,
    label: 'Estimate & Quote',
    description: 'Develop and approve the estimate and quote.',
  },
  {
    type: 'contract_review',
    order: 3,
    label: 'PO & Contract Review',
    description: 'Review customer order and contract requirements.',
  },
  {
    type: 'design_applicability',
    order: 4,
    label: 'Design Applicability',
    description: 'Determine and document design-control applicability.',
  },
  {
    type: 'production_planning',
    order: 5,
    label: 'Production Planning',
    description: 'Establish BOM, routing, material, and production plans.',
  },
  {
    type: 'wad_authorization',
    order: 6,
    label: 'WAD Authorization',
    description: 'Authorize work through controlled WAD evidence.',
  },
  {
    type: 'preproduction_release',
    order: 7,
    label: 'Preproduction & Release',
    description: 'Complete preproduction readiness and release evidence.',
  },
  {
    type: 'production_quality',
    order: 8,
    label: 'Production & Quality',
    description: 'Execute production and quality controls.',
  },
  {
    type: 'final_release_shipping',
    order: 9,
    label: 'Final Release & Shipping',
    description: 'Complete final release, shipment, and delivery evidence.',
  },
  {
    type: 'project_closing',
    order: 10,
    label: 'Project Closing',
    description: 'Verify completion and close the controlled project record.',
  },
]);

const P2_V2_DEFINITION_V2_STAGES = freezeItems<ProjectWorkflowStageDefinition>([
  {
    type: 'rfq_risk_assessment',
    order: 1,
    label: 'RFQ Review',
    description:
      'Confirm customer inquiry scope, requirements, and risk evidence.',
  },
  {
    type: 'estimate_quote',
    order: 2,
    label: 'Estimate & Quote',
    description: 'Confirm the approved estimate and released commercial offer.',
  },
  {
    type: 'contract_review',
    order: 3,
    label: 'Contract Review',
    description:
      'Approve the accepted customer order and contractual baseline.',
  },
  {
    type: 'technical_configuration_review',
    order: 4,
    label: 'Technical & Configuration Review',
    description:
      'Confirm the released technical and configuration baseline required to manufacture and inspect the customer order.',
  },
  {
    type: 'production_planning',
    order: 5,
    label: 'Production Planning',
    description:
      'Establish BOM, routing, material, quality, and execution plans.',
  },
  {
    type: 'wad_authorization',
    order: 6,
    label: 'WAD Authorization',
    description: 'Authorize work through controlled WAD evidence.',
  },
  {
    type: 'preproduction_release',
    order: 7,
    label: 'Preproduction Readiness',
    description:
      'Confirm materials, tooling, documents, and readiness before release.',
  },
  {
    type: 'production_quality',
    order: 8,
    label: 'Production',
    description: 'Execute controlled manufacturing operations.',
  },
  {
    type: 'final_release_shipping',
    order: 9,
    label: 'Quality & Product Release',
    description:
      'Complete inspection, acceptance, certification, and product release.',
  },
  {
    type: 'project_closing',
    order: 10,
    label: 'Shipping & Project Closing',
    description:
      'Ship the accepted product and close the customer-order project.',
  },
]);

const P2_V2_DEFINITION_V3_STAGES = freezeItems<ProjectWorkflowStageDefinition>([
  {
    type: 'rfq_risk_assessment',
    order: 1,
    label: 'RFQ Review',
    description:
      'Confirm customer inquiry scope, requirements, and risk evidence.',
  },
  {
    type: 'estimate_quote',
    order: 2,
    label: 'Estimate & Quote',
    description: 'Confirm the approved estimate and released commercial offer.',
  },
  {
    type: 'contract_review',
    order: 3,
    label: 'Purchase/Contract Review',
    description:
      'Confirm the received customer PO against the accepted quote and contractual requirements.',
  },
  {
    type: 'technical_configuration_review',
    order: 4,
    label: 'Technical & Configuration Review',
    description:
      'Confirm the released technical and configuration baseline required to manufacture and inspect the customer order.',
  },
  {
    type: 'production_planning',
    order: 5,
    label: 'Production Planning',
    description:
      'Establish the controlled BOM, routing, material, quality, and execution plan.',
  },
  {
    type: 'wad_authorization',
    order: 6,
    label: 'WAD Authorization',
    description: 'Authorize work through current controlled WAD evidence.',
  },
  {
    type: 'preproduction_release',
    order: 7,
    label: 'Preproduction Readiness',
    description:
      'Confirm materials, tooling, documents, approvals, and readiness before release.',
  },
  {
    type: 'p2_release',
    order: 8,
    label: 'Approve and Release to P2',
    description:
      'Approve the production-release evidence, then separately release the order to the P2 Control Center.',
  },
  {
    type: 'p2_execution',
    order: 9,
    label: 'P2 Execution',
    description:
      'Read-only summary of authoritative scheduling, production, quality, certification, packing, and shipping records in the P2 Control Center.',
  },
  {
    type: 'project_closing',
    order: 10,
    label: 'Project Closing',
    description:
      'Complete the controlled closing review after P2 execution requirements are satisfied.',
  },
]);

export const P2_V2_DEFINITION_VERSION = 3;

export function getP2V2StagesForDefinitionVersion(
  definitionVersion: number
): readonly ProjectWorkflowStageDefinition[] {
  if (definitionVersion === 1) return P2_V2_DEFINITION_V1_STAGES;
  if (definitionVersion === 2) return P2_V2_DEFINITION_V2_STAGES;
  if (definitionVersion === P2_V2_DEFINITION_VERSION)
    return P2_V2_DEFINITION_V3_STAGES;
  throw new ProjectWorkflowDefinitionValidationError(
    `Unknown p2_v2 definition version ${definitionVersion}`
  );
}

// Immutable snapshot source used when a newly-created p2_v2 project is
// initialized in the same transaction as the project row.
export function getInternalP2V2InitializationStages(): readonly ProjectWorkflowStageDefinition[] {
  return getProjectWorkflowDefinition('p2_v2').stages;
}

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
    active: true,
    initializable: true,
    steps: Object.freeze([]),
    stages: P2_V2_DEFINITION_V3_STAGES,
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
  const sortedOrders = Array.from(orders).sort((a, b) => a - b);
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
    if (
      !definition.active ||
      !definition.initializable ||
      definition.steps.length > 0
    )
      throw new ProjectWorkflowDefinitionValidationError(
        'p2_v2 must be active and initializable only through stage instances'
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
