import { auditService, type AuditActor, type AuditEntityType } from './auditService';
import { openRequest, type OpenRequestInput } from './escalationService';

export type Phase1FoundationDomain =
  | 'WAD'
  | 'ESTIMATING'
  | 'PROCUREMENT'
  | 'INVENTORY_OVERRIDE'
  | 'NCR'
  | 'ENGINEERING_RELEASE'
  | 'CONTRACT_FLOWDOWN';

export interface Phase1AuditEventCoverage {
  eventType: string;
  subjectType: AuditEntityType | 'approval_request' | 'engineering_revision' | 'contract_review';
  routeOrService: string;
  evidence: string;
}

export interface Phase1ApprovalCoverage {
  requestType: string;
  ownerRoles: string[];
  sourceRouteOrService: string;
  decisionRoute: string;
}

export interface Phase1FoundationCoverage {
  domain: Phase1FoundationDomain;
  auditEvents: Phase1AuditEventCoverage[];
  approvalRequests: Phase1ApprovalCoverage[];
  revisionControl?: {
    framework: string;
    artifacts: string[];
    route: string;
  };
  clauseFlowdown?: {
    sourceOfTruth: string;
    projectContinuity: string;
    poContinuity: string;
  };
}

export const PHASE1_FOUNDATION_COVERAGE: Phase1FoundationCoverage[] = [
  {
    domain: 'WAD',
    auditEvents: [
      {
        eventType: 'WAD_APPROVAL_RECORDED',
        subjectType: 'work_order',
        routeOrService: 'server/src/routes/workOrders.ts',
        evidence: 'WAD wizard approval writes auditService and audit ledger entries.',
      },
      {
        eventType: 'WAD_EXCEPTION_REQUESTED',
        subjectType: 'approval_request',
        routeOrService: 'server/src/routes/workOrders.ts -> escalationService.openRequest',
        evidence: 'WAD overrun, charge-code override, and late-release exceptions enter the enterprise approval inbox.',
      },
    ],
    approvalRequests: [
      {
        requestType: 'WAD_APPROVAL',
        ownerRoles: ['Production Supervisor', 'Production Manager', 'Director of Operations'],
        sourceRouteOrService: 'server/src/routes/workOrders.ts',
        decisionRoute: '/api/approvals/:id/approve',
      },
      {
        requestType: 'WAD_EXCEPTION',
        ownerRoles: ['Production Supervisor', 'Production Manager', 'Director of Operations'],
        sourceRouteOrService: 'server/src/routes/workOrders.ts',
        decisionRoute: '/api/approvals/:id/approve',
      },
    ],
  },
  {
    domain: 'ESTIMATING',
    auditEvents: [
      {
        eventType: 'ESTIMATE_RELEASED',
        subjectType: 'order',
        routeOrService: 'server/src/routes/estimating.ts',
        evidence: 'Estimate release decisions are auditable control events before downstream procurement or production use.',
      },
    ],
    approvalRequests: [
      {
        requestType: 'ESTIMATE_RELEASE',
        ownerRoles: ['Estimator', 'Sales Manager', 'Director of Operations'],
        sourceRouteOrService: 'server/src/routes/estimating.ts',
        decisionRoute: '/api/approvals/:id/approve',
      },
    ],
  },
  {
    domain: 'PROCUREMENT',
    auditEvents: [
      {
        eventType: 'PO_FAR_FLOWDOWNS_RECORDED',
        subjectType: 'order',
        routeOrService: 'server/src/routes/farFlowdownClauses.ts',
        evidence: 'PO-level flowdown selections log applicable clause counts.',
      },
      {
        eventType: 'PROCUREMENT_COMPLIANCE_EFFECTIVE_DATE_CHANGED',
        subjectType: 'order',
        routeOrService: 'server/src/routes/vendorPOs.ts',
        evidence: 'Compliance effective-date changes are written inside the same transaction as audit evidence.',
      },
    ],
    approvalRequests: [
      {
        requestType: 'PURCHASE_REQUISITION_APPROVAL',
        ownerRoles: ['Purchasing', 'Finance', 'Director of Operations'],
        sourceRouteOrService: 'server/src/routes/purchaseRequisitions.ts',
        decisionRoute: '/api/approvals/:id/approve',
      },
      {
        requestType: 'PROCUREMENT_DIRECT_PO_EXCEPTION',
        ownerRoles: ['Purchasing', 'Controller', 'Director of Operations'],
        sourceRouteOrService: 'server/src/routes/vendorPOs.ts',
        decisionRoute: '/api/approvals/:id/approve',
      },
    ],
  },
  {
    domain: 'INVENTORY_OVERRIDE',
    auditEvents: [
      {
        eventType: 'INVENTORY_HIGH_RISK_APPROVAL_EXECUTED',
        subjectType: 'approval_request',
        routeOrService: 'server/src/services/inventoryApprovalExecutor.ts',
        evidence: 'Approved high-risk inventory requests execute through the dedicated executor and ledger path.',
      },
    ],
    approvalRequests: [
      {
        requestType: 'INV_MANUAL_ADJUSTMENT',
        ownerRoles: ['Production Supervisor', 'Production Manager'],
        sourceRouteOrService: 'server/src/routes/materialLots.ts',
        decisionRoute: '/api/approvals/:id/approve',
      },
      {
        requestType: 'INV_ALLOCATION_OVERRIDE',
        ownerRoles: ['Production Supervisor', 'Production Manager'],
        sourceRouteOrService: 'server/src/routes/materialLots.ts',
        decisionRoute: '/api/approvals/:id/approve',
      },
      {
        requestType: 'INV_QUARANTINE_RELEASE',
        ownerRoles: ['Quality Manager', 'Director of Operations'],
        sourceRouteOrService: 'server/src/routes/materialLots.ts',
        decisionRoute: '/api/approvals/:id/approve',
      },
    ],
  },
  {
    domain: 'NCR',
    auditEvents: [
      {
        eventType: 'NCR_DISPOSITION',
        subjectType: 'qc_item',
        routeOrService: 'server/routes/nonconformance.ts',
        evidence: 'Nonconformance disposition is a controlled approval request type with decision history.',
      },
    ],
    approvalRequests: [
      {
        requestType: 'NCR_DISPOSITION',
        ownerRoles: ['Quality Manager', 'Director of Operations'],
        sourceRouteOrService: 'server/routes/nonconformance.ts',
        decisionRoute: '/api/approvals/:id/approve',
      },
    ],
  },
  {
    domain: 'ENGINEERING_RELEASE',
    auditEvents: [
      {
        eventType: 'ENGINEERING_REVISION_TRANSITIONED',
        subjectType: 'engineering_revision',
        routeOrService: 'server/src/routes/engineeringControl.ts',
        evidence: 'Engineering revision transitions are constrained by release-state rules and ECO linkage.',
      },
    ],
    approvalRequests: [
      {
        requestType: 'ENGINEERING_RELEASE',
        ownerRoles: ['Engineering', 'Quality Manager', 'Director of Operations'],
        sourceRouteOrService: 'server/src/routes/engineeringControl.ts',
        decisionRoute: '/api/approvals/:id/approve',
      },
      {
        requestType: 'ENGINEERING_ECO_APPROVAL',
        ownerRoles: ['Engineering', 'Quality Manager', 'Director of Operations'],
        sourceRouteOrService: 'server/src/routes/engineeringControl.ts',
        decisionRoute: '/api/approvals/:id/approve',
      },
    ],
    revisionControl: {
      framework: 'engineering_controlled_revisions + engineering_change_orders + engineering_eco_revision_links',
      artifacts: ['BOM', 'ROUTING', 'TRAVELER_TEMPLATE', 'WORK_INSTRUCTION', 'SPEC', 'QC_FORM'],
      route: '/api/engineering-control',
    },
  },
  {
    domain: 'CONTRACT_FLOWDOWN',
    auditEvents: [
      {
        eventType: 'CONTRACT_FLOWDOWN_RECORDED',
        subjectType: 'contract_review',
        routeOrService: 'server/src/routes/contractReview.ts and server/src/routes/farFlowdownClauses.ts',
        evidence: 'Contract review and FAR clause libraries feed project and PO flowdown records.',
      },
    ],
    approvalRequests: [
      {
        requestType: 'CONTRACT_CLAUSE_FLOWDOWN',
        ownerRoles: ['Contracts', 'Purchasing', 'Director of Operations'],
        sourceRouteOrService: 'server/src/routes/contractReview.ts',
        decisionRoute: '/api/approvals/:id/approve',
      },
    ],
    clauseFlowdown: {
      sourceOfTruth: 'contract review checklist and purchase review checklist',
      projectContinuity: 'project_far_flowdowns',
      poContinuity: 'vendor_po_far_flowdowns',
    },
  },
];

export function getPhase1FoundationCoverage(): Phase1FoundationCoverage[] {
  return PHASE1_FOUNDATION_COVERAGE;
}

export function getPhase1ApprovalRequestTypes(): string[] {
  return PHASE1_FOUNDATION_COVERAGE.flatMap((item) =>
    item.approvalRequests.map((approval) => approval.requestType),
  );
}

export async function openPhase1ApprovalRequest(input: OpenRequestInput) {
  const allowed = new Set(getPhase1ApprovalRequestTypes());
  if (!allowed.has(input.requestType)) {
    throw new Error(`Unsupported Phase 1 approval request type: ${input.requestType}`);
  }
  return openRequest(input);
}

export async function logPhase1ControlEvent(input: {
  domain: Phase1FoundationDomain;
  eventType: string;
  entityType: AuditEntityType;
  entityId: string;
  actor?: AuditActor;
  reason?: string;
  meta?: Record<string, unknown>;
}) {
  const domain = PHASE1_FOUNDATION_COVERAGE.find((item) => item.domain === input.domain);
  if (!domain?.auditEvents.some((event) => event.eventType === input.eventType)) {
    throw new Error(`Unsupported Phase 1 audit event for ${input.domain}: ${input.eventType}`);
  }

  return auditService.logEvent({
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.eventType,
    actor: input.actor,
    reason: input.reason,
    meta: {
      ...(input.meta ?? {}),
      phase: 'Phase 1 Foundation Closure',
      domain: input.domain,
    },
  });
}
