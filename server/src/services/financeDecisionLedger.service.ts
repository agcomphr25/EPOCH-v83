import crypto from 'crypto';

import {
  canonicalize,
  recordAuditEvent,
  type AuditLedgerTx,
  type AuditPayload,
} from './auditLedgerService';
import type {
  FinanceAuthorityLevel,
  FinancePilotUser,
} from '../lib/financeOperationsPolicy';

export const FINANCE_DECISION_EVENT_TYPES = [
  'FINANCE_DRAFT_PREPARED',
  'FINANCE_DRAFT_APPROVED',
  'FINANCE_DRAFT_APPROVAL_REVOKED',
  'FINANCE_TRANSACTION_POSTED',
  'FINANCE_DOCUMENT_SENT',
  'FINANCE_EXCEPTION_OVERRIDDEN',
  'FINANCE_AI_EXPLANATION_RECORDED',
  'FINANCE_BILLING_RECIPIENT_CREATED',
  'FINANCE_BILLING_RECIPIENT_UPDATED',
  'FINANCE_BILLING_RECIPIENT_DEACTIVATED',
] as const;

export type FinanceDecisionEventType =
  (typeof FINANCE_DECISION_EVENT_TYPES)[number];

export type FinanceDecisionEvidence = {
  eventType: FinanceDecisionEventType;
  subjectType: string;
  subjectId: string;
  authorityLevel: FinanceAuthorityLevel;
  actor: FinancePilotUser;
  sourceVersion: string;
  evidenceSnapshot: AuditPayload;
  reason?: string | null;
  aiAssisted?: boolean;
  modelId?: string | null;
  traceId?: string | null;
};

export function buildFinanceEvidenceHash(input: {
  subjectType: string;
  subjectId: string;
  sourceVersion: string;
  evidenceSnapshot: AuditPayload;
}): string {
  return crypto
    .createHash('sha256')
    .update(
      canonicalize({
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        sourceVersion: input.sourceVersion,
        evidenceSnapshot: input.evidenceSnapshot,
      }),
      'utf8'
    )
    .digest('hex');
}

export async function recordFinanceDecision(
  input: FinanceDecisionEvidence,
  tx?: AuditLedgerTx
) {
  const evidenceSnapshotHash = buildFinanceEvidenceHash(input);
  return recordAuditEvent(
    {
      eventType: input.eventType,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      sourceService: 'financeDecisionLedger.service',
      actor: input.actor,
      reason: input.reason,
      payload: {
        authorityLevel: input.authorityLevel,
        sourceVersion: input.sourceVersion,
        evidenceSnapshotHash,
        evidenceSnapshot: input.evidenceSnapshot,
        aiAssisted: input.aiAssisted === true,
        modelId: input.modelId ?? null,
        traceId: input.traceId ?? null,
      },
    },
    tx
  );
}
