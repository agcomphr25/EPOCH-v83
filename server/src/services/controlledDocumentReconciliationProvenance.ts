import { createHash } from 'crypto';
import path from 'path';

import type { LegacyReconciliationAssessment } from './controlledDocumentReconciliationService';

const fingerprint = (value: string) =>
  createHash('sha256').update(value).digest('hex');

export type SafeReconciliationFileIdentity = {
  referenceType: string;
  storageProvider: string;
  identifierHash: string | null;
  basename: string | null;
  checksum: string | null;
  mediaType: string | null;
  fileSize: number | null;
  accessibility: string;
  mutable: boolean;
};

type SnapshotRow = Record<string, string | number | null | undefined>;
const nullableString = (value: SnapshotRow[string]) =>
  value == null ? null : String(value);

export function buildSafeReconciliationFileIdentity(input: {
  reference: string | null;
  referenceType: string;
  checksum: string | null;
  mediaType: string | null;
  fileSize: number | null;
  accessibility: string;
}): SafeReconciliationFileIdentity {
  const reference = input.reference?.split('?')[0] || null;
  const basename = reference
    ? path.win32.basename(path.posix.basename(reference.replace(/\\/g, '/')))
    : null;
  return {
    referenceType: input.referenceType,
    storageProvider: input.referenceType.includes('OBJECT_STORAGE')
      ? 'CONTROLLED_OBJECT_STORAGE'
      : input.referenceType === 'LEGACY_LOCAL_PATH'
        ? 'EPOCH_LOCAL_CONTROLLED_ROOT'
        : input.referenceType === 'EXTERNAL_MUTABLE_URL'
          ? 'EXTERNAL_REFERENCE'
          : 'NONE',
    identifierHash: reference ? fingerprint(reference) : null,
    basename,
    checksum: input.checksum,
    mediaType: input.mediaType,
    fileSize: input.fileSize,
    accessibility: input.accessibility,
    mutable: input.referenceType === 'EXTERNAL_MUTABLE_URL',
  };
}

export function buildReconciliationSnapshot(input: {
  phase: 'BEFORE' | 'AFTER';
  document: SnapshotRow;
  revision: SnapshotRow;
  approvals: SnapshotRow[];
  numberRegistry: SnapshotRow | null;
  assessment: LegacyReconciliationAssessment;
  acceptedEvidence: SnapshotRow[];
  policyVersion: string;
  provenance: string;
  eventId: string | null;
  actionResult: string;
}) {
  const { document: d, revision: r, assessment: a } = input;
  const fileIdentity = buildSafeReconciliationFileIdentity({
    reference: nullableString(r.file_path || d.file_path),
    referenceType: a.fileReferenceType,
    checksum: nullableString(r.file_checksum),
    mediaType: nullableString(r.media_type),
    fileSize: r.file_size == null ? null : Number(r.file_size),
    accessibility: a.fileAccessibility,
  });
  return {
    phase: input.phase,
    policyVersion: input.policyVersion,
    provenance: input.provenance,
    decisionSource: 'DETERMINISTIC_LEGACY_RECONCILIATION',
    proposedAction: a.proposedChanges,
    actionResult: input.actionResult,
    eventIdentity: input.eventId,
    document: {
      id: d.id,
      documentNumber: d.document_number,
      normalizedNumber: String(d.document_number || '')
        .trim()
        .toUpperCase(),
      documentType: d.document_type,
      department: d.department,
      lifecycleStatus: d.lifecycle_status,
      legacyStatus: d.status,
      currentVersion: d.current_version,
      currentRevisionId: d.current_revision_id,
      workingDraftRevisionId: d.working_draft_revision_id,
      currentReleasedRevisionId: d.current_released_revision_id,
      effectiveDate: d.effective_date,
      expirationDate: d.expiration_date,
      createdAt: d.created_at,
    },
    revision: {
      id: r.id,
      documentId: r.document_id,
      versionNumber: r.version_number,
      revisionSequence: r.revision_sequence,
      lifecycleStatus: r.lifecycle_status,
      legacyStatus: r.status,
      storedChecksum: r.file_checksum,
      checksumStatus: r.checksum_status,
      observedChecksum: a.observedChecksum,
      createdBy: r.created_by,
      createdAt: r.created_at,
      submittedByUserId: r.submitted_by_user_id,
      submittedBySnapshot: r.submitted_by_snapshot,
      submittedAt: r.submitted_at,
      reviewedByUserId: r.reviewed_by_user_id,
      reviewedBySnapshot: r.reviewed_by_snapshot,
      reviewedAt: r.reviewed_at,
      approvedBy: r.approved_by,
      approvedByUserId: r.approved_by_user_id,
      approvedBySnapshot: r.approved_by_snapshot,
      approvedAt: r.approved_at,
      releasedByUserId: r.released_by_user_id,
      releasedBySnapshot: r.released_by_snapshot,
      releasedAt: r.released_at,
      effectiveDate: r.effective_date,
      expirationDate: r.expiration_date,
    },
    numberRegistry: input.numberRegistry
      ? {
          id: input.numberRegistry.id,
          normalizedNumber: input.numberRegistry.normalized_number,
          displayNumber: input.numberRegistry.display_number,
          controlledDocumentId: input.numberRegistry.controlled_document_id,
          status: input.numberRegistry.status,
          conflictDocumentIds: input.numberRegistry.conflict_document_ids,
        }
      : null,
    approvals: input.approvals.map((approval) => ({
      id: approval.id,
      revisionId: approval.revision_id,
      fileChecksum: approval.file_checksum,
      decision: approval.decision,
      signatureMeaning: approval.signature_meaning,
      actorUserId: approval.actor_user_id,
      actorUsernameSnapshot: approval.actor_username_snapshot,
      actorRoleSnapshot: approval.actor_role_snapshot,
      approvalStatus: approval.approval_status,
      createdAt: approval.created_at,
    })),
    acceptedEvidence: input.acceptedEvidence.map((evidence) => ({
      id: evidence.id,
      type: evidence.type || evidence.evidence_type,
      revisionId: evidence.revisionId || evidence.revision_id || null,
      confirmedAt: evidence.confirmedAt || evidence.confirmed_at,
      confirmedByUserId:
        evidence.confirmedByUserId || evidence.confirmed_by_user_id,
    })),
    fileIdentity,
    classification: a.classification,
    blockers: a.blockers,
  };
}

export function containsUnsafeReconciliationPath(value: unknown): boolean {
  const serialized = JSON.stringify(value);
  return /(?:[a-zA-Z]:\\|\\\\|\/(?:home|srv|var|opt|Users)\/|file:\/\/)/.test(
    serialized
  );
}
