export type Phase2MaterialContractChainDomain =
  | 'CONTRACT_REVIEW_CHECKLIST'
  | 'RECEIVING_INSPECTION_PLAN'
  | 'MATERIAL_GENEALOGY'
  | 'SUPPLIER_APPROVAL'
  | 'SHIPMENT_VALIDATION';

export interface Phase2ChainControl {
  name: string;
  ownerRoles: string[];
  sourceOfTruth: string;
  evidence: string[];
  downstreamHandoff: string;
}

export interface Phase2ChainDomainCoverage {
  domain: Phase2MaterialContractChainDomain;
  objective: string;
  controls: Phase2ChainControl[];
  requiredAuditEvents: string[];
  readinessExitCriteria: string[];
}

export const PHASE2_MATERIAL_CONTRACT_CHAIN: Phase2ChainDomainCoverage[] = [
  {
    domain: 'CONTRACT_REVIEW_CHECKLIST',
    objective: 'Turn contract review into the source-of-truth engine for clauses, material requirements, cert requirements, and receiving/shipping obligations.',
    controls: [
      {
        name: 'Contract review checklist engine',
        ownerRoles: ['Contracts', 'Quality Manager', 'Purchasing', 'Director of Operations'],
        sourceOfTruth: 'contract review checklist',
        evidence: [
          'customer and contract identifiers',
          'material and process requirements',
          'FAR/DFARS and customer flowdown clauses',
          'required cert package outputs',
        ],
        downstreamHandoff: 'project flowdown, supplier selection, receiving inspection planning, and shipment validation',
      },
    ],
    requiredAuditEvents: [
      'CONTRACT_REVIEW_ENGINE_COMPLETED',
      'CONTRACT_REQUIREMENT_CHANGED',
      'CONTRACT_CERT_REQUIREMENT_RECORDED',
    ],
    readinessExitCriteria: [
      'Checklist decisions create structured requirement records instead of free-text-only notes.',
      'Material, supplier, receiving, and shipment obligations can be queried by project or order.',
      'Requirement changes retain before/after evidence and approver identity.',
    ],
  },
  {
    domain: 'RECEIVING_INSPECTION_PLAN',
    objective: 'Generate receipt inspection requirements before material arrives and enforce hold/release decisions when required evidence is missing.',
    controls: [
      {
        name: 'Receiving inspection plans',
        ownerRoles: ['Receiving', 'Quality Inspector', 'Quality Manager'],
        sourceOfTruth: 'contract requirements plus purchase order line requirements',
        evidence: [
          'inspection plan version',
          'required receiving checks',
          'required CoC, cert, SDS, TDS, calibration, or test report documents',
          'hold/release disposition history',
        ],
        downstreamHandoff: 'inventory availability, supplier scorecards, invoice match, and audit retention',
      },
    ],
    requiredAuditEvents: [
      'RECEIVING_INSPECTION_PLAN_CREATED',
      'RECEIVING_INSPECTION_PLAN_APPLIED',
      'RECEIVING_DOCUMENT_HOLD_RELEASED',
    ],
    readinessExitCriteria: [
      'Inspection plan requirements are visible inside receiving before disposition.',
      'Missing required documents place inventory on hold instead of silently releasing it.',
      'Receipt closeout blocks unresolved inspection, document hold, and putaway gaps.',
    ],
  },
  {
    domain: 'MATERIAL_GENEALOGY',
    objective: 'Provide cradle-to-grave material genealogy from contract requirement through receipt, lot storage, allocation, production use, shipment, and signed export.',
    controls: [
      {
        name: 'Material genealogy viewer and signed export',
        ownerRoles: ['Quality Manager', 'Production Manager', 'Contracts'],
        sourceOfTruth: 'receipt units, material lots, inventory ledger, production consumption, and shipment package records',
        evidence: [
          'lot, heat, batch, roll, serial, or expiration identifiers',
          'inventory movement ledger',
          'production allocation and consumption links',
          'signed genealogy export hash',
        ],
        downstreamHandoff: 'customer cert package, audit evidence, and nonconformance trace-back',
      },
    ],
    requiredAuditEvents: [
      'MATERIAL_GENEALOGY_VIEWED',
      'MATERIAL_GENEALOGY_EXPORT_SIGNED',
      'MATERIAL_TRACEABILITY_LINK_CHANGED',
    ],
    readinessExitCriteria: [
      'A user can trace a shipped unit back to accepted receipt evidence and source supplier.',
      'Exports include signer, timestamp, immutable hash, and included evidence list.',
      'Traceability gaps are explicit blockers rather than hidden report omissions.',
    ],
  },
  {
    domain: 'SUPPLIER_APPROVAL',
    objective: 'Make approved supplier status, scope, expiration, and exceptions part of the procurement and receiving chain.',
    controls: [
      {
        name: 'Supplier approval management',
        ownerRoles: ['Purchasing', 'Quality Manager', 'Director of Operations'],
        sourceOfTruth: 'approved supplier list and supplier qualification records',
        evidence: [
          'approved supplier scope',
          'approval expiration and review history',
          'customer or P2 production-line restrictions',
          'supplier exception approvals',
        ],
        downstreamHandoff: 'vendor selection, purchase order release, receiving risk level, and supplier performance review',
      },
    ],
    requiredAuditEvents: [
      'SUPPLIER_APPROVAL_GRANTED',
      'SUPPLIER_APPROVAL_EXPIRED',
      'SUPPLIER_EXCEPTION_APPROVED',
    ],
    readinessExitCriteria: [
      'PO release validates supplier approval against material, process, and project scope.',
      'Expired or out-of-scope supplier use requires an approval exception.',
      'Receiving and shipment records preserve the supplier approval basis used at purchase time.',
    ],
  },
  {
    domain: 'SHIPMENT_VALIDATION',
    objective: 'Validate shipment readiness against contract, material, inspection, and cert requirements before building a customer-facing cert package.',
    controls: [
      {
        name: 'Shipment validation and cert package builder',
        ownerRoles: ['Shipping', 'Quality Manager', 'Contracts'],
        sourceOfTruth: 'contract requirements, genealogy evidence, receiving documents, inspection results, and shipment records',
        evidence: [
          'shipment validation checklist',
          'included cert package document manifest',
          'missing or waived requirement list',
          'final package signature and export hash',
        ],
        downstreamHandoff: 'customer shipment, audit archive, and customer-facing certificate package',
      },
    ],
    requiredAuditEvents: [
      'SHIPMENT_VALIDATION_COMPLETED',
      'CERT_PACKAGE_BUILT',
      'SHIPMENT_REQUIREMENT_WAIVED',
    ],
    readinessExitCriteria: [
      'Shipment cannot close when contract-required documents, genealogy links, or inspection releases are missing.',
      'Cert packages are generated from linked evidence rather than manual file picking alone.',
      'The final package manifest and signed export are retained for audit.',
    ],
  },
];

export function getPhase2MaterialContractChain(): Phase2ChainDomainCoverage[] {
  return PHASE2_MATERIAL_CONTRACT_CHAIN;
}
