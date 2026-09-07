import { buildFinanceEvidenceHash } from './financeDecisionLedger.service';

export const FINANCE_SYNTHETIC_SCENARIO_ID = 'SYN-P2-001';

export type FinanceSyntheticVariant =
  | 'clean'
  | 'missing-contact'
  | 'missing-terms'
  | 'quantity-mismatch'
  | 'duplicate-risk'
  | 'source-changed';

type SyntheticEvidence = {
  orderReference: string;
  productionLine: 'P2';
  customerName: string;
  customerPo: string;
  packingSlipNumber: string;
  packingSlipStatus: 'COMPLETE';
  shippedQuantity: number;
  billableQuantity: number;
  unitPrice: number;
  paymentTerms: 'NET_30' | null;
  billingContact: string | null;
  existingInvoiceCount: number;
};

const allowedVariants = new Set<FinanceSyntheticVariant>([
  'clean',
  'missing-contact',
  'missing-terms',
  'quantity-mismatch',
  'duplicate-risk',
  'source-changed',
]);

function baseEvidence(): SyntheticEvidence {
  return {
    orderReference: FINANCE_SYNTHETIC_SCENARIO_ID,
    productionLine: 'P2',
    customerName: 'SYNTHETIC CUSTOMER — NOT A REAL ACCOUNT',
    customerPo: 'SYNTHETIC-PO-001',
    packingSlipNumber: 'SYNTHETIC-PS-001',
    packingSlipStatus: 'COMPLETE',
    shippedQuantity: 10,
    billableQuantity: 10,
    unitPrice: 875,
    paymentTerms: 'NET_30',
    billingContact: 'synthetic.billing@example.invalid',
    existingInvoiceCount: 0,
  };
}

function evidenceForVariant(
  variant: FinanceSyntheticVariant
): SyntheticEvidence {
  const evidence = baseEvidence();
  if (variant === 'missing-contact') evidence.billingContact = null;
  if (variant === 'missing-terms') evidence.paymentTerms = null;
  if (variant === 'quantity-mismatch') evidence.billableQuantity = 9;
  if (variant === 'duplicate-risk') evidence.existingInvoiceCount = 1;
  if (variant === 'source-changed') evidence.billableQuantity = 8;
  return evidence;
}

function blockersFor(evidence: SyntheticEvidence): string[] {
  const blockers: string[] = [];
  if (!evidence.billingContact)
    blockers.push('Designated billing contact is missing.');
  if (!evidence.paymentTerms)
    blockers.push('Customer payment terms are missing.');
  if (evidence.shippedQuantity !== evidence.billableQuantity) {
    blockers.push('Shipped quantity does not match billable quantity.');
  }
  if (evidence.existingInvoiceCount > 0)
    blockers.push('A possible duplicate invoice already exists.');
  return blockers;
}

function hashEvidence(
  evidence: SyntheticEvidence,
  sourceVersion: string
): string {
  return buildFinanceEvidenceHash({
    subjectType: 'synthetic_p2_ar_candidate',
    subjectId: FINANCE_SYNTHETIC_SCENARIO_ID,
    sourceVersion,
    evidenceSnapshot: evidence,
  });
}

export function parseFinanceSyntheticVariant(
  value: unknown
): FinanceSyntheticVariant {
  const candidate = String(value ?? 'clean')
    .trim()
    .toLowerCase() as FinanceSyntheticVariant;
  return allowedVariants.has(candidate) ? candidate : 'clean';
}

export function buildFinanceSyntheticPilotScenario(
  variant: FinanceSyntheticVariant
) {
  const evidence = evidenceForVariant(variant);
  const sourceVersion =
    variant === 'source-changed' ? 'synthetic-v2' : 'synthetic-v1';
  const blockers = blockersFor(evidence);
  const evidenceHash = hashEvidence(evidence, sourceVersion);
  const approvedEvidenceHash = hashEvidence(baseEvidence(), 'synthetic-v1');
  const sourceChanged = variant === 'source-changed';

  return {
    scenarioId: FINANCE_SYNTHETIC_SCENARIO_ID,
    variant,
    synthetic: true,
    persistent: false,
    disclaimer:
      'TRAINING SIMULATION — no production records are read or written.',
    executionControls: {
      mayCreateProductionPackingSlip: false,
      mayCreatePersistentInvoiceDraft: false,
      mayApprove: false,
      mayPost: false,
      maySend: false,
    },
    candidate: {
      status: blockers.length === 0 ? 'CLEAN' : 'BLOCKED',
      eligibleForDraftPreparation: blockers.length === 0,
      revenueStream: 'P2_NET30',
      invoiceStatusIfPrepared: 'REVIEW',
      subtotal: evidence.billableQuantity * evidence.unitPrice,
      blockers,
      sourceVersion,
      evidenceHash,
      evidence,
    },
    approval: sourceChanged
      ? {
          status: 'REVOKED',
          reason: 'Source evidence changed after the simulated approval.',
          approvedEvidenceHash,
          currentEvidenceHash: evidenceHash,
        }
      : {
          status: 'NOT_REQUESTED',
          reason: 'This read-only harness cannot grant approval.',
          approvedEvidenceHash: null,
          currentEvidenceHash: evidenceHash,
        },
  } as const;
}
