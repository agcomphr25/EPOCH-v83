import { asc, eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  auditObjectRetentionPolicies,
  auditRequiredEventCoverage,
  approvalSignatureEvidence,
} from '../../schema';

export type Section11AuditDomain =
  | 'inventory'
  | 'procurement'
  | 'labor'
  | 'approvals'
  | 'quality'
  | 'engineering'
  | 'shipping'
  | 'security';

export async function listRequiredEventCoverage(domainKey?: Section11AuditDomain) {
  const query = db
    .select()
    .from(auditRequiredEventCoverage)
    .orderBy(
      asc(auditRequiredEventCoverage.domainKey),
      asc(auditRequiredEventCoverage.objectType),
      asc(auditRequiredEventCoverage.requiredEventType),
    );

  if (!domainKey) return await query;

  return await db
    .select()
    .from(auditRequiredEventCoverage)
    .where(eq(auditRequiredEventCoverage.domainKey, domainKey))
    .orderBy(
      asc(auditRequiredEventCoverage.objectType),
      asc(auditRequiredEventCoverage.requiredEventType),
    );
}

export async function listObjectRetentionPolicies() {
  return await db
    .select()
    .from(auditObjectRetentionPolicies)
    .orderBy(asc(auditObjectRetentionPolicies.objectType));
}

export async function getApprovalSignatureEvidence(approvalRequestId: string) {
  return await db
    .select()
    .from(approvalSignatureEvidence)
    .where(eq(approvalSignatureEvidence.approvalRequestId, approvalRequestId))
    .orderBy(asc(approvalSignatureEvidence.recordedAt));
}
