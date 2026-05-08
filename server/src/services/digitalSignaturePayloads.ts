/**
 * Canonical signature payload builders — Task #145.
 *
 * Pure helpers that turn a high-risk transaction context into a deterministic,
 * documented JSON payload that the digital-signature service signs. Keeping
 * payload construction in one place guarantees that the bytes a UI signed are
 * the same bytes the verifier checks against; any divergence here would
 * invisibly invalidate every signature in production.
 *
 * Each helper returns `{ transactionClass, payload }`. The `transactionClass`
 * is the stable machine string stored on `digital_signatures.transaction_class`
 * and used by `MaterialIssueService` to decide whether a given draw needs a
 * signature. New transaction classes MUST be added here, not at call sites.
 */

import type { CanonicalSignaturePayload } from './digitalSignatureService';

export const SIGNATURE_TRANSACTION_CLASSES = {
  MATERIAL_OVERRIDE: 'MATERIAL_OVERRIDE',
  SCRAP_ABOVE_THRESHOLD: 'SCRAP_ABOVE_THRESHOLD',
  QUARANTINE_RELEASE: 'QUARANTINE_RELEASE',
  EXPIRED_LOT_USE: 'EXPIRED_LOT_USE',
  COUNT_ADJUSTMENT_HIGH: 'COUNT_ADJUSTMENT_HIGH',
} as const;
export type SignatureTransactionClass =
  (typeof SIGNATURE_TRANSACTION_CLASSES)[keyof typeof SIGNATURE_TRANSACTION_CLASSES];

export interface MaterialIssueSignatureContext {
  action: 'reserve' | 'issue' | 'consume' | 'transferToJob' | 'unreserve';
  materialLotId: string;
  quantity: number;
  unitOfMeasure?: string | null;
  travelerId?: string | null;
  travelerStepId?: string | null;
  productionWorkOrderId?: string | null;
  chargeCodeId?: number | null;
  reasonCode?: string | null;
  approverUserId?: number | null;
  approverDisplayName?: string | null;
  signerUserId: number;
  signerDisplayName: string;
}

/**
 * Build the canonical payload for a controlled material draw. Field order is
 * irrelevant — `canonicalize()` sorts keys before signing — but the *set* of
 * fields MUST stay stable. To add a new field, do it here in a new
 * transaction class so legacy signatures keep verifying.
 */
export function buildMaterialIssueSignaturePayload(
  transactionClass: SignatureTransactionClass,
  ctx: MaterialIssueSignatureContext,
): CanonicalSignaturePayload {
  return {
    transactionClass,
    payload: {
      v: 1,
      action: ctx.action,
      materialLotId: ctx.materialLotId,
      quantity: ctx.quantity,
      unitOfMeasure: ctx.unitOfMeasure ?? null,
      travelerId: ctx.travelerId ?? null,
      travelerStepId: ctx.travelerStepId ?? null,
      productionWorkOrderId: ctx.productionWorkOrderId ?? null,
      chargeCodeId: ctx.chargeCodeId ?? null,
      reasonCode: ctx.reasonCode ?? null,
      approverUserId: ctx.approverUserId ?? null,
      approverDisplayName: ctx.approverDisplayName ?? null,
      signerUserId: ctx.signerUserId,
      signerDisplayName: ctx.signerDisplayName,
    },
  };
}

/**
 * Configurable signature-required policy. The thresholds are intentionally
 * read from environment variables so a deployment can tune them without
 * touching code; defaults match the project-spec described in Task #145.
 */
export interface SignaturePolicyConfig {
  scrapThresholdQty: number;
  countAdjustmentThresholdQty: number;
}

export function loadSignaturePolicy(): SignaturePolicyConfig {
  return {
    scrapThresholdQty: numericEnv('DIGITAL_SIGNATURE_SCRAP_THRESHOLD_QTY', 0),
    countAdjustmentThresholdQty: numericEnv(
      'DIGITAL_SIGNATURE_COUNT_ADJ_THRESHOLD_QTY',
      0,
    ),
  };
}

function numericEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

export interface MaterialIssueSignatureClassificationInput {
  action: MaterialIssueSignatureContext['action'];
  reasonCode?: string | null;
  quantity: number;
  lotStatus?: string | null;
  lotIsExpired?: boolean;
  isOverride?: boolean;
}

/**
 * Decide whether a given material-issue request must be accompanied by a
 * digital signature, and which transaction class governs it. Returns null
 * when no signature is required.
 *
 * Rules (Phase 3 scope):
 *   - Any draw flagged as an override (`isOverride`) → MATERIAL_OVERRIDE.
 *   - Any reason code starting with `OVERRIDE_` → MATERIAL_OVERRIDE.
 *   - Action is `consume`/`issue` against a QUARANTINE lot → QUARANTINE_RELEASE.
 *   - Action is `consume`/`issue` against an expired lot → EXPIRED_LOT_USE.
 *   - reasonCode starts with `SCRAP_` AND quantity ≥ scrapThresholdQty → SCRAP_ABOVE_THRESHOLD.
 *   - reasonCode starts with `COUNT_ADJ` AND |quantity| ≥ countThreshold → COUNT_ADJUSTMENT_HIGH.
 */
export function classifyRequiredSignature(
  input: MaterialIssueSignatureClassificationInput,
  policy: SignaturePolicyConfig = loadSignaturePolicy(),
): SignatureTransactionClass | null {
  const reason = (input.reasonCode ?? '').toUpperCase();
  if (input.isOverride || reason.startsWith('OVERRIDE_') || reason === 'OVERRIDE') {
    return SIGNATURE_TRANSACTION_CLASSES.MATERIAL_OVERRIDE;
  }
  const isWithdrawal = input.action === 'consume' || input.action === 'issue' || input.action === 'transferToJob';
  if (isWithdrawal) {
    if ((input.lotStatus ?? '').toUpperCase() === 'QUARANTINE') {
      return SIGNATURE_TRANSACTION_CLASSES.QUARANTINE_RELEASE;
    }
    if (input.lotIsExpired) {
      return SIGNATURE_TRANSACTION_CLASSES.EXPIRED_LOT_USE;
    }
  }
  if (reason.startsWith('SCRAP') && input.quantity >= policy.scrapThresholdQty && policy.scrapThresholdQty > 0) {
    return SIGNATURE_TRANSACTION_CLASSES.SCRAP_ABOVE_THRESHOLD;
  }
  if (
    (reason.startsWith('COUNT_ADJ') || reason.startsWith('CYCLE_COUNT_ADJ')) &&
    Math.abs(input.quantity) >= policy.countAdjustmentThresholdQty &&
    policy.countAdjustmentThresholdQty > 0
  ) {
    return SIGNATURE_TRANSACTION_CLASSES.COUNT_ADJUSTMENT_HIGH;
  }
  return null;
}
