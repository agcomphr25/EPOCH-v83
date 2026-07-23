import crypto from 'crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  controlledDocumentNumberRegistry,
  controlledDocumentRevisionApprovals,
  controlledDocuments,
  documentVersionHistory,
} from '../../schema';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import { recordAuditEvent, type AuditPayloadValue } from './auditLedgerService';
import { getUserPermissions } from './permissionService';

type Client = typeof db;
export type DocumentLifecycle =
  | 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'RELEASED'
  | 'SUPERSEDED' | 'OBSOLETE' | 'VOID';
export type ControlledDocumentActor = { id: number; username: string; role: string };
export type RequestEvidence = { ipAddress?: string | null; userAgent?: string | null };

export class ControlledDocumentError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export const normalizeDocumentNumber = (value: unknown) =>
  String(value ?? '').trim().toUpperCase();

export const checksumFile = (buffer: Buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');

const actorEvidence = async (actor: ControlledDocumentActor) => {
  if (!Number.isInteger(actor.id) || actor.id <= 0) {
    throw new ControlledDocumentError(401, 'AUTHENTICATION_REQUIRED', 'Authenticated user identity is required');
  }
  const [snapshot, permissions] = await Promise.all([
    resolveUserSnapshot(actor.id),
    getUserPermissions(actor.id, actor.role),
  ]);
  return {
    snapshot: {
      userId: actor.id,
      username: actor.username,
      displayName: snapshot.displayName,
      role: actor.role,
    },
    capabilities: permissions.permissions,
  };
};

const audit = async (
  eventType: string,
  document: { id: string; documentNumber: string },
  revision: { id: string; versionNumber: string; revisionSequence: number; fileChecksum?: string | null } | null,
  actor: ControlledDocumentActor,
  actorCapabilities: string[],
  reason: string,
  before: DocumentLifecycle | null,
  after: DocumentLifecycle | null,
  request: RequestEvidence,
  client: Client,
  extra: Record<string, AuditPayloadValue> = {}
) => recordAuditEvent({
  eventType,
  subjectType: 'controlled_document',
  subjectId: document.id,
  sourceService: 'controlledDocumentLifecycle.service',
  actor,
  reason,
  ipAddress: request.ipAddress,
  userAgent: request.userAgent,
  fieldsChanged: before && after ? { lifecycleStatus: { before, after } } : null,
  payload: {
    controlledDocumentId: document.id,
    documentNumber: document.documentNumber,
    revisionId: revision?.id ?? null,
    revisionValue: revision?.versionNumber ?? null,
    revisionSequence: revision?.revisionSequence ?? null,
    fileChecksum: revision?.fileChecksum ?? null,
    actorCapabilities,
    beforeLifecycle: before,
    afterLifecycle: after,
    ...extra,
  },
}, client);

async function loadDocument(documentId: string, client: Client, lock = false) {
  if (lock) {
    await client.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`controlled-document:${documentId}`}))`);
  }
  const [document] = await client.select().from(controlledDocuments)
    .where(eq(controlledDocuments.id, documentId)).limit(1);
  if (!document) throw new ControlledDocumentError(404, 'DOCUMENT_NOT_FOUND', 'Controlled document not found');
  const revisions = await client.select().from(documentVersionHistory)
    .where(eq(documentVersionHistory.documentId, documentId))
    .orderBy(asc(documentVersionHistory.revisionSequence));
  const currentRevision = revisions.find((row) => row.id === document.currentRevisionId)
    ?? revisions[revisions.length - 1]
    ?? null;
  return { document, revisions, currentRevision };
}

export async function getControlledDocumentState(documentId: string, client: Client = db) {
  const context = await loadDocument(documentId, client);
  const approvals = await client.select().from(controlledDocumentRevisionApprovals)
    .where(eq(controlledDocumentRevisionApprovals.controlledDocumentId, documentId))
    .orderBy(asc(controlledDocumentRevisionApprovals.createdAt));
  return { ...context, approvals };
}

export async function getDocumentNumberConflicts(client: Client = db) {
  return client.select().from(controlledDocumentNumberRegistry)
    .where(eq(controlledDocumentNumberRegistry.status, 'NUMBER_RECONCILIATION_REQUIRED'))
    .orderBy(asc(controlledDocumentNumberRegistry.normalizedNumber));
}

export async function recordRejectedHardDelete(input: {
  documentId: string;
  actor: ControlledDocumentActor;
  request?: RequestEvidence;
}, client: Client = db) {
  const evidence = await actorEvidence(input.actor);
  const context = await loadDocument(input.documentId, client);
  await audit(
    'CONTROLLED_DOCUMENT_HARD_DELETE_REJECTED',
    context.document,
    context.currentRevision,
    input.actor,
    evidence.capabilities,
    'Application hard deletion is prohibited; use VOID or OBSOLETE',
    context.document.lifecycleStatus as DocumentLifecycle,
    context.document.lifecycleStatus as DocumentLifecycle,
    input.request ?? {},
    client
  );
  return context;
}

export async function attachExternalApprovalEvidence(input: {
  documentId: string;
  revisionId: string;
  externalApprover: string;
  externalOrganization?: string;
  evidenceReference: string;
  comment: string;
  actor: ControlledDocumentActor;
  request?: RequestEvidence;
}, client: Client = db) {
  const evidence = await actorEvidence(input.actor);
  if (!input.externalApprover.trim() || !input.evidenceReference.trim() || !input.comment.trim()) {
    throw new ControlledDocumentError(
      400,
      'EXTERNAL_EVIDENCE_DETAILS_REQUIRED',
      'External approver, evidence reference, and internal custodian comment are required'
    );
  }
  return client.transaction(async (tx) => {
    const context = await loadDocument(input.documentId, tx as unknown as Client, true);
    const revision = context.revisions.find((row) => row.id === input.revisionId);
    if (!revision?.fileChecksum) {
      throw new ControlledDocumentError(422, 'VERIFIED_CHECKSUM_REQUIRED', 'External evidence must reference an exact checksummed revision');
    }
    const [approval] = await tx.insert(controlledDocumentRevisionApprovals).values({
      controlledDocumentId: context.document.id,
      revisionId: revision.id,
      fileChecksum: revision.fileChecksum,
      documentNumberSnapshot: context.document.documentNumber,
      revisionSnapshot: revision.versionNumber,
      decision: 'APPROVED',
      signatureMeaning: 'External approval evidence witnessed and attached by an authenticated internal custodian.',
      decisionComment: input.comment.trim(),
      actorUserId: input.actor.id,
      actorUsernameSnapshot: input.actor.username,
      actorRoleSnapshot: input.actor.role,
      actorCapabilitiesSnapshot: evidence.capabilities,
      approvalStatus: 'EXTERNAL_EVIDENCE',
      metadata: {
        provenance: 'EXTERNAL_APPROVAL_EVIDENCE',
        externalApprover: input.externalApprover.trim(),
        externalOrganization: input.externalOrganization?.trim() || null,
        evidenceReference: input.evidenceReference.trim(),
        internalCustodian: evidence.snapshot,
        satisfiesReleaseGate: false,
      },
    }).returning();
    await audit(
      'CONTROLLED_DOCUMENT_EXTERNAL_APPROVAL_EVIDENCE_ATTACHED',
      context.document,
      revision,
      input.actor,
      evidence.capabilities,
      input.comment.trim(),
      revision.lifecycleStatus as DocumentLifecycle,
      revision.lifecycleStatus as DocumentLifecycle,
      input.request ?? {},
      tx as unknown as Client,
      { approvalEvidenceId: approval.id, evidenceReference: input.evidenceReference.trim() }
    );
    return approval;
  });
}

export async function createControlledDocument(input: {
  document: {
    documentNumber: string;
    documentName: string;
    templateKey?: string | null;
    documentType: string;
    department: string;
    category?: string | null;
    description?: string | null;
    revisionValue: string;
    retentionLength?: string | null;
    documentOwner?: string | null;
    classification?: string;
    cuiCategory?: string | null;
    itarCategory?: string | null;
    exportControlJurisdiction?: string | null;
    customerId?: string | null;
    contractArtifactType?: string | null;
    accessRule?: string;
    mfaRequired?: boolean;
  };
  file?: { path: string; name: string; mediaType: string; size: number; buffer: Buffer } | null;
  actor: ControlledDocumentActor;
  request?: RequestEvidence;
}, client: Client = db) {
  const evidence = await actorEvidence(input.actor);
  const displayNumber = input.document.documentNumber.trim();
  const normalizedNumber = normalizeDocumentNumber(displayNumber);
  if (!normalizedNumber) throw new ControlledDocumentError(400, 'DOCUMENT_NUMBER_REQUIRED', 'Document number is required');
  if (!input.document.documentName?.trim() || !input.document.documentType?.trim() || !input.document.department?.trim()) {
    throw new ControlledDocumentError(400, 'DOCUMENT_METADATA_REQUIRED', 'Document name, type, and department are required');
  }
  return client.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`document-number:${normalizedNumber}`}))`);
    const [reservation] = await tx.select().from(controlledDocumentNumberRegistry)
      .where(eq(controlledDocumentNumberRegistry.normalizedNumber, normalizedNumber)).limit(1);
    if (reservation) {
      throw new ControlledDocumentError(
        409,
        reservation.status === 'NUMBER_RECONCILIATION_REQUIRED'
          ? 'NUMBER_RECONCILIATION_REQUIRED'
          : 'DOCUMENT_NUMBER_CONFLICT',
        `Document number ${displayNumber} is already reserved`,
        { normalizedNumber, reservationStatus: reservation.status }
      );
    }
    const checksum = input.file ? checksumFile(input.file.buffer) : null;
    const [document] = await tx.insert(controlledDocuments).values({
      documentNumber: displayNumber,
      documentName: input.document.documentName.trim(),
      templateKey: input.document.templateKey ?? null,
      documentType: input.document.documentType.trim(),
      department: input.document.department.trim(),
      category: input.document.category ?? null,
      description: input.document.description ?? null,
      currentVersion: input.document.revisionValue,
      status: 'draft',
      lifecycleStatus: 'DRAFT',
      numberControlStatus: 'RESERVED',
      retentionLength: input.document.retentionLength ?? '10 years',
      documentOwner: input.document.documentOwner ?? null,
      filePath: input.file?.path ?? null,
      classification: input.document.classification ?? 'internal',
      cuiCategory: input.document.cuiCategory ?? null,
      itarCategory: input.document.itarCategory ?? null,
      exportControlJurisdiction: input.document.exportControlJurisdiction ?? null,
      customerId: input.document.customerId ?? null,
      contractArtifactType: input.document.contractArtifactType ?? null,
      accessRule: input.document.accessRule ?? 'authenticated',
      mfaRequired: input.document.mfaRequired ?? false,
      downloadTrackingRequired: true,
      createdBy: input.actor.username,
    }).returning();
    const [revision] = await tx.insert(documentVersionHistory).values({
      documentId: document.id,
      versionNumber: input.document.revisionValue,
      revisionSequence: 1,
      lifecycleStatus: 'DRAFT',
      changeDescription: 'Initial controlled revision',
      revisionReason: 'Initial controlled revision',
      changeType: 'major',
      filePath: input.file?.path ?? null,
      fileName: input.file?.name ?? null,
      mediaType: input.file?.mediaType ?? null,
      fileSize: input.file?.size ?? null,
      fileChecksum: checksum,
      checksumStatus: checksum ? 'VERIFIED' : 'NOT_APPLICABLE',
      status: 'draft',
      createdBy: input.actor.username,
      metadata: { provenance: 'CONTROLLED_DOCUMENT_LIFECYCLE_SERVICE' },
    }).returning();
    const [updated] = await tx.update(controlledDocuments).set({
      currentRevisionId: revision.id,
      workingDraftRevisionId: revision.id,
      updatedAt: new Date(),
    }).where(eq(controlledDocuments.id, document.id)).returning();
    await tx.insert(controlledDocumentNumberRegistry).values({
      normalizedNumber,
      displayNumber,
      controlledDocumentId: document.id,
      status: 'RESERVED',
      reservedByUserId: input.actor.id,
      reservedBySnapshot: evidence.snapshot,
    });
    await audit('CONTROLLED_DOCUMENT_CREATED', document, revision, input.actor, evidence.capabilities,
      'Initial controlled document and exact revision created', null, 'DRAFT', input.request ?? {}, tx as unknown as Client);
    await audit('CONTROLLED_DOCUMENT_NUMBER_RESERVED', document, revision, input.actor, evidence.capabilities,
      `Reserved normalized document number ${normalizedNumber}`, null, 'DRAFT', input.request ?? {}, tx as unknown as Client,
      { normalizedNumber });
    return { document: updated, revision };
  });
}

export async function updateDraftMetadata(input: {
  documentId: string;
  patch: Record<string, unknown>;
  containsFile: boolean;
  actor: ControlledDocumentActor;
  request?: RequestEvidence;
}, client: Client = db) {
  const evidence = await actorEvidence(input.actor);
  if (input.containsFile) {
    const context = await loadDocument(input.documentId, client);
    await audit('CONTROLLED_DOCUMENT_FILE_REPLACEMENT_REJECTED', context.document, context.currentRevision,
      input.actor, evidence.capabilities, 'Ordinary metadata route cannot accept file bytes',
      context.document.lifecycleStatus as DocumentLifecycle, context.document.lifecycleStatus as DocumentLifecycle,
      input.request ?? {}, client);
    throw new ControlledDocumentError(409, 'CREATE_REVISION_REQUIRED',
      'New file content must use the controlled Create Revision action with a revision reason');
  }
  return client.transaction(async (tx) => {
    const context = await loadDocument(input.documentId, tx as unknown as Client, true);
    if (context.document.lifecycleStatus !== 'DRAFT') {
      throw new ControlledDocumentError(409, 'DOCUMENT_IMMUTABLE',
        'Only a draft may be edited through the metadata route; use Return for Revision or Create Revision');
    }
    const allowed = ['documentName', 'templateKey', 'category', 'description', 'retentionLength', 'documentOwner'];
    const patch = Object.fromEntries(allowed
      .filter((key) => input.patch[key] !== undefined)
      .map((key) => [key, input.patch[key]]));
    const [document] = await tx.update(controlledDocuments).set({ ...patch, updatedAt: new Date() })
      .where(eq(controlledDocuments.id, input.documentId)).returning();
    await audit('CONTROLLED_DOCUMENT_METADATA_UPDATED', document, context.currentRevision,
      input.actor, evidence.capabilities, 'Draft metadata updated',
      context.document.lifecycleStatus as DocumentLifecycle, context.document.lifecycleStatus as DocumentLifecycle,
      input.request ?? {}, tx as unknown as Client, { updatedFields: Object.keys(patch) });
    return { document, revision: context.currentRevision };
  });
}

export async function createControlledRevision(input: {
  documentId: string;
  expectedCurrentRevisionId?: string;
  revisionValue: string;
  reason: string;
  file: { path: string; name: string; mediaType: string; size: number; buffer: Buffer };
  actor: ControlledDocumentActor;
  request?: RequestEvidence;
}, client: Client = db) {
  const evidence = await actorEvidence(input.actor);
  if (!input.reason.trim()) throw new ControlledDocumentError(400, 'REVISION_REASON_REQUIRED', 'Revision reason is required');
  if (!input.revisionValue.trim()) throw new ControlledDocumentError(400, 'REVISION_VALUE_REQUIRED', 'Revision value is required');
  return client.transaction(async (tx) => {
    const context = await loadDocument(input.documentId, tx as unknown as Client, true);
    if (['OBSOLETE', 'VOID'].includes(context.document.lifecycleStatus)) {
      throw new ControlledDocumentError(409, 'DOCUMENT_NOT_REVISABLE', 'Obsolete or void documents cannot create a new-use revision');
    }
    if (input.expectedCurrentRevisionId && context.currentRevision?.id !== input.expectedCurrentRevisionId) {
      throw new ControlledDocumentError(409, 'STALE_REVISION', 'The current document revision changed; refresh before revising');
    }
    if (context.revisions.some((revision) => revision.versionNumber === input.revisionValue.trim())) {
      throw new ControlledDocumentError(409, 'REVISION_VALUE_CONFLICT', 'That revision value already exists for this document');
    }
    const nextSequence = Math.max(0, ...context.revisions.map((row) => row.revisionSequence)) + 1;
    const [revision] = await tx.insert(documentVersionHistory).values({
      documentId: context.document.id,
      versionNumber: input.revisionValue.trim(),
      revisionSequence: nextSequence,
      lifecycleStatus: 'DRAFT',
      status: 'draft',
      changeDescription: input.reason.trim(),
      revisionReason: input.reason.trim(),
      changeType: 'controlled_revision',
      filePath: input.file.path,
      fileName: input.file.name,
      mediaType: input.file.mediaType,
      fileSize: input.file.size,
      fileChecksum: checksumFile(input.file.buffer),
      checksumStatus: 'VERIFIED',
      createdBy: input.actor.username,
      metadata: { provenance: 'CONTROLLED_DOCUMENT_LIFECYCLE_SERVICE' },
    }).returning();
    const [document] = await tx.update(controlledDocuments).set({
      currentRevisionId: revision.id,
      workingDraftRevisionId: revision.id,
      currentVersion: context.document.currentReleasedRevisionId
        ? context.document.currentVersion
        : revision.versionNumber,
      filePath: context.document.currentReleasedRevisionId
        ? context.document.filePath
        : revision.filePath,
      lifecycleStatus: 'DRAFT',
      lifecycleReason: input.reason.trim(),
      status: 'draft',
      updatedAt: new Date(),
    }).where(eq(controlledDocuments.id, context.document.id)).returning();
    await audit('CONTROLLED_DOCUMENT_REVISION_CREATED', document, revision, input.actor, evidence.capabilities,
      input.reason.trim(), context.document.lifecycleStatus as DocumentLifecycle, 'DRAFT', input.request ?? {},
      tx as unknown as Client, { priorRevisionId: context.currentRevision?.id ?? null });
    return { document, revision };
  });
}

const transitions: Record<string, DocumentLifecycle[]> = {
  submit: ['DRAFT'],
  approve: ['IN_REVIEW'],
  release: ['APPROVED'],
  supersede: ['RELEASED'],
  obsolete: ['RELEASED', 'SUPERSEDED'],
  void: ['DRAFT', 'IN_REVIEW'],
};

export async function transitionControlledRevision(input: {
  documentId: string;
  revisionId?: string;
  action: keyof typeof transitions;
  decision?: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION';
  reason: string;
  effectiveDate?: string | null;
  actor: ControlledDocumentActor;
  request?: RequestEvidence;
}, client: Client = db) {
  const evidence = await actorEvidence(input.actor);
  if (!input.reason.trim()) throw new ControlledDocumentError(400, 'TRANSITION_REASON_REQUIRED', 'Transition reason or comment is required');
  return client.transaction(async (tx) => {
    const context = await loadDocument(input.documentId, tx as unknown as Client, true);
    const revision = input.revisionId
      ? context.revisions.find((row) => row.id === input.revisionId)
      : context.currentRevision;
    if (!revision || revision.id !== context.document.currentRevisionId) {
      throw new ControlledDocumentError(409, 'STALE_REVISION', 'Lifecycle action must target the exact current revision');
    }
    const before = revision.lifecycleStatus as DocumentLifecycle;
    let after: DocumentLifecycle;
    if (input.action === 'approve' && input.decision && input.decision !== 'APPROVED') {
      after = 'DRAFT';
    } else {
      const targets: Record<keyof typeof transitions, DocumentLifecycle> = {
        submit: 'IN_REVIEW', approve: 'APPROVED', release: 'RELEASED',
        supersede: 'SUPERSEDED', obsolete: 'OBSOLETE', void: 'VOID',
      };
      after = targets[input.action];
    }
    if (!transitions[input.action].includes(before)) {
      throw new ControlledDocumentError(409, 'ILLEGAL_LIFECYCLE_TRANSITION',
        `Cannot ${input.action} a ${before} revision`, { before, action: input.action });
    }
    const now = new Date();
    if (input.action === 'approve') {
      if (input.decision && !['APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION'].includes(input.decision)) {
        throw new ControlledDocumentError(400, 'INVALID_APPROVAL_DECISION', 'Approval decision is invalid');
      }
      if (!revision.fileChecksum || revision.checksumStatus !== 'VERIFIED') {
        throw new ControlledDocumentError(422, 'VERIFIED_CHECKSUM_REQUIRED', 'Exact verified file checksum is required for approval');
      }
      await tx.insert(controlledDocumentRevisionApprovals).values({
        controlledDocumentId: context.document.id,
        revisionId: revision.id,
        fileChecksum: revision.fileChecksum,
        documentNumberSnapshot: context.document.documentNumber,
        revisionSnapshot: revision.versionNumber,
        decision: input.decision ?? 'APPROVED',
        signatureMeaning: 'I reviewed this exact controlled document revision and file checksum.',
        decisionComment: input.reason.trim(),
        actorUserId: input.actor.id,
        actorUsernameSnapshot: input.actor.username,
        actorRoleSnapshot: input.actor.role,
        actorCapabilitiesSnapshot: evidence.capabilities,
        approvalStatus: 'VALID',
        metadata: { provenance: 'AUTHENTICATED_REVISION_BOUND_APPROVAL' },
      });
    }
    if (input.action === 'release') {
      const [approval] = await tx.select().from(controlledDocumentRevisionApprovals).where(and(
        eq(controlledDocumentRevisionApprovals.revisionId, revision.id),
        eq(controlledDocumentRevisionApprovals.fileChecksum, revision.fileChecksum!),
        eq(controlledDocumentRevisionApprovals.decision, 'APPROVED'),
        eq(controlledDocumentRevisionApprovals.approvalStatus, 'VALID')
      )).limit(1);
      if (!approval) throw new ControlledDocumentError(422, 'EXACT_APPROVAL_REQUIRED',
        'Release requires valid authenticated approval for this exact revision checksum');
      const previousReleased = context.revisions.find((row) =>
        row.id === context.document.currentReleasedRevisionId && row.id !== revision.id);
      if (previousReleased) {
        await tx.update(documentVersionHistory).set({
          lifecycleStatus: 'SUPERSEDED',
          status: 'superseded',
          supersededByRevisionId: revision.id,
          supersededAt: now,
          supersededByUserId: input.actor.id,
        }).where(eq(documentVersionHistory.id, previousReleased.id));
      }
    }
    const revisionPatch: Record<string, unknown> = { lifecycleStatus: after, status: after.toLowerCase() };
    if (input.action === 'submit') Object.assign(revisionPatch, {
      submittedAt: now, submittedByUserId: input.actor.id, submittedBySnapshot: evidence.snapshot,
    });
    if (input.action === 'approve' && after === 'APPROVED') Object.assign(revisionPatch, {
      approvedAt: now, approvedBy: input.actor.username, approvedByUserId: input.actor.id,
      approvedBySnapshot: evidence.snapshot, reviewedAt: now, reviewedByUserId: input.actor.id,
      reviewedBySnapshot: evidence.snapshot,
    });
    if (input.action === 'release') Object.assign(revisionPatch, {
      releasedAt: now, releasedByUserId: input.actor.id, releasedBySnapshot: evidence.snapshot,
      effectiveDate: input.effectiveDate ?? now.toISOString().slice(0, 10),
    });
    if (input.action === 'obsolete') Object.assign(revisionPatch, {
      obsoletedAt: now, obsoletedByUserId: input.actor.id,
    });
    await tx.update(documentVersionHistory).set(revisionPatch as any)
      .where(eq(documentVersionHistory.id, revision.id));
    const documentPatch: Record<string, unknown> = {
      lifecycleStatus: after,
      lifecycleReason: input.reason.trim(),
      status: after.toLowerCase(),
      updatedAt: now,
    };
    if (input.action === 'release') Object.assign(documentPatch, {
      currentReleasedRevisionId: revision.id,
      workingDraftRevisionId: null,
      currentVersion: revision.versionNumber,
      filePath: revision.filePath,
      effectiveDate: input.effectiveDate ?? now.toISOString().slice(0, 10),
    });
    if (input.action === 'void' || input.action === 'obsolete') {
      Object.assign(documentPatch, { workingDraftRevisionId: null });
    }
    const [document] = await tx.update(controlledDocuments).set(documentPatch as any)
      .where(eq(controlledDocuments.id, context.document.id)).returning();
    await audit(`CONTROLLED_DOCUMENT_${after}`, document, revision,
      input.actor, evidence.capabilities, input.reason.trim(), before, after, input.request ?? {},
      tx as unknown as Client, { decision: input.decision ?? null });
    return getControlledDocumentState(input.documentId, tx as unknown as Client);
  });
}
