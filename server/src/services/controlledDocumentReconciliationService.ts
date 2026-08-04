import { createHash } from 'crypto';

export const CONTROLLED_DOCUMENT_RECONCILIATION_POLICY_VERSION =
  'MDR_PHASE_1B_V1';

export type ReconciliationClassification =
  | 'RELEASED_VERIFIED'
  | 'LEGACY_AUTO_RECONCILIATION_ELIGIBLE'
  | 'LEGACY_APPROVED_VERIFICATION_REQUIRED'
  | 'FILE_RECONCILIATION_REQUIRED'
  | 'NUMBER_RECONCILIATION_REQUIRED'
  | 'REVISION_RECONCILIATION_REQUIRED'
  | 'APPROVAL_EVIDENCE_REQUIRED'
  | 'LEGACY_REFERENCE_ONLY'
  | 'OBSOLETE_OR_VOID_REVIEW_REQUIRED';

export type LegacyReconciliationFacts = {
  documentId: string;
  documentNumber: string;
  title: string;
  legacyStatus: string | null;
  lifecycleStatus: string | null;
  currentVersion: string | null;
  currentReleasedRevisionId: string | null;
  revisionId: string | null;
  revisionCount: number;
  revisionVersion: string | null;
  revisionLifecycleStatus: string | null;
  revisionChecksum: string | null;
  fileReference: string | null;
  fileReferenceType: string;
  fileAccessibility:
    'ACCESSIBLE' | 'INACCESSIBLE' | 'EXTERNAL_MUTABLE' | 'MISSING';
  observedChecksum: string | null;
  approvalIdentity: string | null;
  approvalDate: string | null;
  effectiveDate: string | null;
  duplicateNumber: boolean;
  crossDocumentPointer: boolean;
  contradictoryLifecycle: boolean;
};

export type LegacyReconciliationAssessment = LegacyReconciliationFacts & {
  classification: ReconciliationClassification;
  blockers: string[];
  proposedChanges: Record<string, unknown>;
  automatic: boolean;
};

const upper = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase();

export function assessLegacyControlledDocument(
  facts: LegacyReconciliationFacts
): LegacyReconciliationAssessment {
  const blockers: string[] = [];
  const legacyApproved = ['APPROVED', 'ACTIVE'].includes(
    upper(facts.legacyStatus)
  );
  const legacyObsolete =
    ['OBSOLETE', 'VOID'].includes(upper(facts.legacyStatus)) ||
    ['OBSOLETE', 'VOID'].includes(upper(facts.lifecycleStatus));
  const alreadyVerified =
    upper(facts.lifecycleStatus) === 'RELEASED' &&
    facts.currentReleasedRevisionId === facts.revisionId &&
    upper(facts.revisionLifecycleStatus) === 'RELEASED' &&
    Boolean(facts.revisionChecksum) &&
    facts.fileAccessibility === 'ACCESSIBLE';

  let classification: ReconciliationClassification;
  if (alreadyVerified) {
    classification = 'RELEASED_VERIFIED';
  } else if (legacyObsolete) {
    classification = 'OBSOLETE_OR_VOID_REVIEW_REQUIRED';
    blockers.push(
      'Historical obsolete or void disposition requires Quality confirmation'
    );
  } else if (
    facts.crossDocumentPointer ||
    facts.revisionCount !== 1 ||
    !facts.revisionId
  ) {
    classification = 'REVISION_RECONCILIATION_REQUIRED';
    if (facts.crossDocumentPointer)
      blockers.push('A revision pointer identifies another document');
    if (facts.revisionCount !== 1)
      blockers.push('Exactly one matching historical revision is required');
  } else if (facts.duplicateNumber) {
    classification = 'NUMBER_RECONCILIATION_REQUIRED';
    blockers.push('The normalized document number is not unique');
  } else if (facts.fileReferenceType === 'EXTERNAL_MUTABLE_URL') {
    classification = 'LEGACY_REFERENCE_ONLY';
    blockers.push(
      'Mutable external references cannot be authoritative controlled bytes'
    );
  } else if (
    facts.fileAccessibility !== 'ACCESSIBLE' ||
    !facts.observedChecksum
  ) {
    classification = 'FILE_RECONCILIATION_REQUIRED';
    blockers.push('Exact authoritative bytes must be readable by EPOCH');
  } else if (
    !facts.revisionVersion ||
    facts.revisionVersion !== facts.currentVersion
  ) {
    classification = 'REVISION_RECONCILIATION_REQUIRED';
    blockers.push('Historical version evidence is missing or contradictory');
  } else if (
    !facts.approvalIdentity ||
    !facts.approvalDate ||
    !facts.effectiveDate
  ) {
    classification = 'APPROVAL_EVIDENCE_REQUIRED';
    blockers.push(
      'Approval identity, approval date, and effective date are required'
    );
  } else if (!legacyApproved || facts.contradictoryLifecycle) {
    classification = 'LEGACY_APPROVED_VERIFICATION_REQUIRED';
    blockers.push('Lifecycle or approval evidence is not deterministic');
  } else {
    classification = 'LEGACY_AUTO_RECONCILIATION_ELIGIBLE';
  }

  const automatic = classification === 'LEGACY_AUTO_RECONCILIATION_ELIGIBLE';
  return {
    ...facts,
    classification,
    blockers,
    automatic,
    proposedChanges: automatic
      ? {
          'document_version_history.file_checksum': facts.observedChecksum,
          'document_version_history.checksum_status': 'VERIFIED',
          'document_version_history.lifecycle_status': 'RELEASED',
          'controlled_documents.current_released_revision_id': facts.revisionId,
          'controlled_documents.lifecycle_status': 'RELEASED',
          reconciliationProvenance: 'LEGACY_MIGRATION_VERIFIED',
        }
      : {},
  };
}

export function hashReconciliationPreview(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function checksumAuthoritativeBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
