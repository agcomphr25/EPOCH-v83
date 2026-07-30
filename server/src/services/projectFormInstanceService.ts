import crypto from 'crypto';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  designControlFormTemplateRevisions,
  designControlFormTemplates,
  designControlRecords,
  designControlSteps,
  documentVersionHistory,
  projectFormApprovals,
  projectFormAttachments,
  projectFormInstanceRevisions,
  projectFormInstances,
  rdProjects,
} from '../../schema';
import {
  DESIGN_CONTROL_FORM_CATALOG_BY_KEY,
  type DesignControlFormDefinition,
} from '../../../shared/designControlFormCatalog';
import {
  canonicalizeProjectFormContent,
  validateProjectFormContent,
  type ProjectFormContent,
} from '../../../shared/projectFormValidation';
import { recordAuditEvent } from './auditLedgerService';
import {
  PROJECT_FORM_PDF_RENDERER_VERSION,
  renderCompletedProjectFormPdf,
  sha256ProjectFormBuffer,
} from './projectFormPdfService';

type Client = typeof db;
export type ProjectFormActor = {
  id: number;
  username: string;
  role: string;
  displayName?: string;
  capabilities?: string[];
};
export type ProjectFormRequestEvidence = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export class ProjectFormError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

const actorSnapshot = (actor: ProjectFormActor) => ({
  id: actor.id,
  username: actor.username,
  displayName: actor.displayName ?? actor.username,
  role: actor.role,
  capabilities: actor.capabilities ?? [],
});

const sha256Canonical = (value: unknown) =>
  crypto
    .createHash('sha256')
    .update(canonicalizeProjectFormContent(value))
    .digest('hex');

const audit = (
  eventType: string,
  instanceId: string,
  actor: ProjectFormActor,
  reason: string,
  payload: Record<string, unknown>,
  request: ProjectFormRequestEvidence,
  tx: any
) =>
  recordAuditEvent(
    {
      eventType,
      subjectType: 'project_form_instance',
      subjectId: instanceId,
      sourceService: 'projectFormInstanceService',
      actor,
      reason,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      payload: payload as any,
    },
    tx
  );

async function loadRecordStep(recordId: string, stepKey: string, client: any) {
  const [record] = await client
    .select()
    .from(designControlRecords)
    .where(eq(designControlRecords.id, recordId))
    .limit(1);
  if (!record) {
    throw new ProjectFormError(
      404,
      'DESIGN_CONTROL_RECORD_NOT_FOUND',
      'Design Control record not found'
    );
  }
  if (!record.rdProjectId) {
    throw new ProjectFormError(
      409,
      'RD_PROJECT_REQUIRED',
      'Project Form Instances require an R&D Design Project; P2 identifiers are not accepted'
    );
  }
  if (record.authorityStatus !== 'authoritative') {
    throw new ProjectFormError(
      409,
      'AUTHORITATIVE_RECORD_REQUIRED',
      'Historical or superseded Design Control records are read-only'
    );
  }
  const [project] = await client
    .select()
    .from(rdProjects)
    .where(eq(rdProjects.id, record.rdProjectId))
    .limit(1);
  const [step] = await client
    .select()
    .from(designControlSteps)
    .where(
      and(
        eq(designControlSteps.recordId, record.id),
        eq(designControlSteps.stepKey, stepKey)
      )
    )
    .limit(1);
  if (!project || !step) {
    throw new ProjectFormError(
      409,
      'DESIGN_PROJECT_LINKAGE_INVALID',
      'The authoritative R&D project and Design Control step must both exist'
    );
  }
  return { record, project, step };
}

async function selectableTemplateForStep(stepKey: string, client: any) {
  if (!/^(?:[1-9]|1[0-2])$/.test(stepKey)) {
    throw new ProjectFormError(
      400,
      'STEP_FORM_NOT_SUPPORTED',
      'Phase 5 supports only the 12 Design Control step forms; ECR and ECN execution is not implemented'
    );
  }
  const [template] = await client
    .select()
    .from(designControlFormTemplates)
    .where(eq(designControlFormTemplates.workflowStepKey, stepKey))
    .limit(1);
  if (!template?.activeTemplateRevisionId) {
    throw new ProjectFormError(
      409,
      'RELEASED_TEMPLATE_REQUIRED',
      'A released template revision mapped to this step is required'
    );
  }
  const [revision] = await client
    .select()
    .from(designControlFormTemplateRevisions)
    .where(
      and(
        eq(
          designControlFormTemplateRevisions.id,
          template.activeTemplateRevisionId
        ),
        eq(designControlFormTemplateRevisions.lifecycleStatus, 'RELEASED')
      )
    )
    .limit(1);
  if (!revision) {
    throw new ProjectFormError(
      409,
      'RELEASED_TEMPLATE_REQUIRED',
      'Draft, superseded, and obsolete template revisions cannot create new instances'
    );
  }
  const [documentRevision] = await client
    .select()
    .from(documentVersionHistory)
    .where(
      and(
        eq(documentVersionHistory.id, revision.documentVersionHistoryId),
        eq(documentVersionHistory.lifecycleStatus, 'RELEASED')
      )
    )
    .limit(1);
  if (!documentRevision) {
    throw new ProjectFormError(
      409,
      'CONTROLLED_REVISION_NOT_SELECTABLE',
      'The exact controlled-document revision is no longer valid for creation'
    );
  }
  return { template, revision, documentRevision };
}

export async function getProjectFormTemplateReadiness(
  recordId: string,
  client: any = db
) {
  await authoritativeContext(recordId, '1', client);
  const steps = [];
  for (let index = 1; index <= 12; index += 1) {
    const stepKey = String(index);
    try {
      const selection = await selectableTemplateForStep(stepKey, client);
      steps.push({
        stepKey,
        ready: true,
        reason: null,
        templateKey: selection.template.templateKey,
        templateRevisionId: selection.revision.id,
        documentRevisionId: selection.documentRevision.id,
      });
    } catch (error) {
      if (!(error instanceof ProjectFormError)) throw error;
      steps.push({
        stepKey,
        ready: false,
        reason: error.message,
        errorCode: error.code,
        templateKey: null,
        templateRevisionId: null,
        documentRevisionId: null,
      });
    }
  }
  return { steps };
}

async function loadInstance(instanceId: string, client: any) {
  const [instance] = await client
    .select()
    .from(projectFormInstances)
    .where(eq(projectFormInstances.id, instanceId))
    .limit(1);
  if (!instance) {
    throw new ProjectFormError(
      404,
      'PROJECT_FORM_NOT_FOUND',
      'Project Form Instance not found'
    );
  }
  const [project, record, step, templateRevision] = await Promise.all([
    client
      .select()
      .from(rdProjects)
      .where(eq(rdProjects.id, instance.rdProjectId))
      .limit(1)
      .then((rows: any[]) => rows[0]),
    client
      .select()
      .from(designControlRecords)
      .where(eq(designControlRecords.id, instance.designControlRecordId))
      .limit(1)
      .then((rows: any[]) => rows[0]),
    client
      .select()
      .from(designControlSteps)
      .where(eq(designControlSteps.id, instance.designControlStepId))
      .limit(1)
      .then((rows: any[]) => rows[0]),
    client
      .select()
      .from(designControlFormTemplateRevisions)
      .where(
        eq(
          designControlFormTemplateRevisions.id,
          instance.templateDefinitionRevisionId
        )
      )
      .limit(1)
      .then((rows: any[]) => rows[0]),
  ]);
  if (!project || !record || !step || !templateRevision) {
    throw new ProjectFormError(
      409,
      'PROJECT_FORM_LINKAGE_BROKEN',
      'Retained Project Form Instance linkage is incomplete'
    );
  }
  return { instance, project, record, step, templateRevision };
}

export async function listProjectForms(recordId: string, client: any = db) {
  return client
    .select()
    .from(projectFormInstances)
    .where(eq(projectFormInstances.designControlRecordId, recordId))
    .orderBy(
      asc(projectFormInstances.stepKey),
      desc(projectFormInstances.createdAt)
    );
}

export async function getProjectForm(instanceId: string, client: any = db) {
  const context = await loadInstance(instanceId, client);
  const [revisions, approvals, attachments] = await Promise.all([
    client
      .select()
      .from(projectFormInstanceRevisions)
      .where(eq(projectFormInstanceRevisions.projectFormInstanceId, instanceId))
      .orderBy(asc(projectFormInstanceRevisions.contentRevisionNumber)),
    client
      .select()
      .from(projectFormApprovals)
      .where(eq(projectFormApprovals.projectFormInstanceId, instanceId))
      .orderBy(asc(projectFormApprovals.signedAt)),
    client
      .select()
      .from(projectFormAttachments)
      .where(eq(projectFormAttachments.projectFormInstanceId, instanceId))
      .orderBy(asc(projectFormAttachments.uploadedAt)),
  ]);
  return { ...context, revisions, approvals, attachments };
}

export async function createProjectForm(input: {
  recordId: string;
  stepKey: string;
  completionMethod: 'ELECTRONIC' | 'PAPER_UPLOAD';
  actor: ProjectFormActor;
  request?: ProjectFormRequestEvidence;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`project-form:${input.recordId}:${input.stepKey}`}))`
    );
    const context = await loadRecordStep(input.recordId, input.stepKey, tx);
    const selected = await selectableTemplateForStep(input.stepKey, tx);
    const [existing] = await tx
      .select()
      .from(projectFormInstances)
      .where(
        and(
          eq(projectFormInstances.designControlRecordId, input.recordId),
          eq(projectFormInstances.stepKey, input.stepKey),
          ne(projectFormInstances.lifecycleStatus, 'SUPERSEDED'),
          ne(projectFormInstances.lifecycleStatus, 'VOID')
        )
      )
      .limit(1);
    if (existing) {
      throw new ProjectFormError(
        409,
        'CURRENT_INSTANCE_EXISTS',
        'Supersede or correct the current instance instead of creating a duplicate'
      );
    }
    const sequenceRows = await tx.execute(sql`
      SELECT count(*)::integer AS count
      FROM project_form_instances
      WHERE rd_project_id = ${context.project.id}
    `);
    const sequence = Number((sequenceRows as any).rows?.[0]?.count ?? 0) + 1;
    const instanceNumber = `DCF-${context.project.id}-${input.stepKey.padStart(2, '0')}-${String(sequence).padStart(3, '0')}`;
    const [instance] = await tx
      .insert(projectFormInstances)
      .values({
        instanceNumber,
        rdProjectId: context.project.id,
        designControlRecordId: context.record.id,
        designControlStepId: context.step.id,
        stepKey: input.stepKey,
        templateRegistrationId: selected.template.id,
        templateDefinitionRevisionId: selected.revision.id,
        documentVersionHistoryId: selected.revision.documentVersionHistoryId,
        templateDocumentNumberSnapshot:
          selected.revision.documentNumberSnapshot,
        templateRevisionSnapshot: selected.revision.documentRevisionSnapshot,
        templateChecksumSnapshot: selected.revision.definitionChecksum,
        rendererVersion: PROJECT_FORM_PDF_RENDERER_VERSION,
        completionMethod: input.completionMethod,
        lifecycleStatus: 'DRAFT',
        createdByUserId: input.actor.id,
        createdBySnapshot: actorSnapshot(input.actor),
      })
      .returning();
    await audit(
      'PROJECT_FORM_INSTANCE_CREATED',
      instance.id,
      input.actor,
      'Create controlled Design Project form instance',
      {
        rdProjectId: context.project.id,
        designControlRecordId: context.record.id,
        designControlStepId: context.step.id,
        templateDefinitionRevisionId: selected.revision.id,
        templateChecksum: selected.revision.definitionChecksum,
        completionMethod: input.completionMethod,
      },
      input.request ?? {},
      tx
    );
    return instance;
  });
}

export async function saveProjectFormDraft(input: {
  instanceId: string;
  content: ProjectFormContent;
  indexedMetadata?: Record<string, unknown>;
  changeReason: string;
  actor: ProjectFormActor;
  request?: ProjectFormRequestEvidence;
}) {
  return db.transaction(async (tx) => {
    const context = await loadInstance(input.instanceId, tx);
    if (
      !['DRAFT', 'IN_PROGRESS', 'RETURNED_FOR_REVISION'].includes(
        context.instance.lifecycleStatus
      )
    ) {
      throw new ProjectFormError(
        409,
        'IMMUTABLE_FORM_STATE',
        'Submitted or approved evidence cannot be overwritten'
      );
    }
    const beforeChecksum = sha256Canonical(context.instance.draftContent);
    const afterChecksum = sha256Canonical(input.content);
    const [instance] = await tx
      .update(projectFormInstances)
      .set({
        draftContent: input.content,
        indexedMetadata:
          input.indexedMetadata ?? context.instance.indexedMetadata,
        lifecycleStatus: 'IN_PROGRESS',
        updatedAt: new Date(),
      })
      .where(eq(projectFormInstances.id, input.instanceId))
      .returning();
    if (beforeChecksum !== afterChecksum) {
      await tx
        .update(projectFormApprovals)
        .set({
          status: 'INVALIDATED',
          invalidatedAt: new Date(),
          invalidatedByUserId: input.actor.id,
          invalidationReason: input.changeReason,
        })
        .where(
          and(
            eq(projectFormApprovals.projectFormInstanceId, input.instanceId),
            eq(projectFormApprovals.status, 'VALID')
          )
        );
    }
    await audit(
      'PROJECT_FORM_DRAFT_MATERIAL_CHANGE',
      input.instanceId,
      input.actor,
      input.changeReason,
      {
        beforeChecksum,
        afterChecksum,
        priorApprovalsInvalidated: beforeChecksum !== afterChecksum,
      },
      input.request ?? {},
      tx
    );
    return instance;
  });
}

export async function submitProjectForm(input: {
  instanceId: string;
  changeReason: string;
  actor: ProjectFormActor;
  request?: ProjectFormRequestEvidence;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM project_form_instances WHERE id = ${input.instanceId} FOR UPDATE`
    );
    const context = await loadInstance(input.instanceId, tx);
    if (
      !['DRAFT', 'IN_PROGRESS', 'RETURNED_FOR_REVISION'].includes(
        context.instance.lifecycleStatus
      )
    ) {
      throw new ProjectFormError(
        409,
        'FORM_NOT_SUBMITTABLE',
        'Only a draft, in-progress, or returned form can be submitted'
      );
    }
    const definition =
      DESIGN_CONTROL_FORM_CATALOG_BY_KEY.get(
        context.templateRevision.templateKeySnapshot
      ) ??
      (context.templateRevision
        .canonicalDefinition as DesignControlFormDefinition);
    if (context.instance.completionMethod === 'ELECTRONIC') {
      const validation = validateProjectFormContent(
        definition,
        context.instance.draftContent as ProjectFormContent
      );
      if (!validation.valid) {
        throw new ProjectFormError(
          422,
          'REQUIRED_FIELDS_MISSING',
          'Required form fields must be complete',
          { missingFields: validation.missing }
        );
      }
    } else {
      const originals = await tx
        .select()
        .from(projectFormAttachments)
        .where(
          and(
            eq(projectFormAttachments.projectFormInstanceId, input.instanceId),
            eq(projectFormAttachments.attachmentKind, 'PAPER_ORIGINAL')
          )
        );
      if (originals.length === 0) {
        throw new ProjectFormError(
          422,
          'PAPER_ORIGINAL_REQUIRED',
          'The immutable original paper scan is required before submission'
        );
      }
    }
    const previous = await tx
      .select()
      .from(projectFormInstanceRevisions)
      .where(
        eq(projectFormInstanceRevisions.projectFormInstanceId, input.instanceId)
      )
      .orderBy(desc(projectFormInstanceRevisions.contentRevisionNumber))
      .limit(1);
    const contentRevisionNumber = (previous[0]?.contentRevisionNumber ?? 0) + 1;
    const canonicalContent = {
      completionMethod: context.instance.completionMethod,
      content: context.instance.draftContent,
      indexedMetadata: context.instance.indexedMetadata,
    };
    const contentChecksum = sha256Canonical(canonicalContent);
    const [revision] = await tx
      .insert(projectFormInstanceRevisions)
      .values({
        projectFormInstanceId: input.instanceId,
        contentRevisionNumber,
        canonicalContent,
        contentChecksum,
        templateDefinitionRevisionId:
          context.instance.templateDefinitionRevisionId,
        templateChecksumSnapshot: context.instance.templateChecksumSnapshot,
        revisionStatus: 'SUBMITTED',
        changeReason: input.changeReason,
        createdByUserId: input.actor.id,
        createdBySnapshot: actorSnapshot(input.actor),
      })
      .returning();
    await tx
      .update(projectFormInstances)
      .set({
        currentContentRevisionId: revision.id,
        lifecycleStatus: 'SUBMITTED',
        submittedAt: new Date(),
        submittedByUserId: input.actor.id,
        submittedBySnapshot: actorSnapshot(input.actor),
        updatedAt: new Date(),
      })
      .where(eq(projectFormInstances.id, input.instanceId));
    await audit(
      'PROJECT_FORM_CONTENT_REVISION_SUBMITTED',
      input.instanceId,
      input.actor,
      input.changeReason,
      {
        contentRevisionId: revision.id,
        contentRevisionNumber,
        contentChecksum,
        templateDefinitionRevisionId:
          context.instance.templateDefinitionRevisionId,
      },
      input.request ?? {},
      tx
    );
    return revision;
  });
}

const approvalKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export async function decideProjectForm(input: {
  instanceId: string;
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION';
  approvalRole: string;
  comment: string;
  actor: ProjectFormActor;
  request?: ProjectFormRequestEvidence;
}) {
  return db.transaction(async (tx) => {
    const context = await loadInstance(input.instanceId, tx);
    if (
      context.instance.lifecycleStatus !== 'SUBMITTED' ||
      !context.instance.currentContentRevisionId
    ) {
      throw new ProjectFormError(
        409,
        'SUBMITTED_REVISION_REQUIRED',
        'Approval decisions bind to the exact submitted content revision'
      );
    }
    const [revision] = await tx
      .select()
      .from(projectFormInstanceRevisions)
      .where(
        eq(
          projectFormInstanceRevisions.id,
          context.instance.currentContentRevisionId
        )
      )
      .limit(1);
    const definition =
      DESIGN_CONTROL_FORM_CATALOG_BY_KEY.get(
        context.templateRevision.templateKeySnapshot
      ) ??
      (context.templateRevision
        .canonicalDefinition as DesignControlFormDefinition);
    const requiredRole = definition.approvalRoles.find(
      (role) => role.toLowerCase() === input.approvalRole.toLowerCase()
    );
    if (!requiredRole) {
      throw new ProjectFormError(
        400,
        'INVALID_APPROVAL_ROLE',
        'Approval role is not required by the exact template definition'
      );
    }
    if (
      input.decision === 'APPROVED' &&
      context.instance.createdByUserId === input.actor.id &&
      /(quality|final|document control)/i.test(requiredRole)
    ) {
      throw new ProjectFormError(
        403,
        'SEGREGATION_OF_DUTIES_REQUIRED',
        'The form creator cannot satisfy an independent Quality or final-review approval'
      );
    }
    const [approval] = await tx
      .insert(projectFormApprovals)
      .values({
        projectFormInstanceId: input.instanceId,
        projectFormInstanceRevisionId: revision.id,
        contentChecksum: revision.contentChecksum,
        templateDefinitionRevisionId:
          context.instance.templateDefinitionRevisionId,
        approvalKey: approvalKey(requiredRole),
        approvalRoleSnapshot: requiredRole,
        requiredCapabilitySnapshot: 'design.forms.approve',
        decision: input.decision,
        signatureMeaning:
          'I reviewed this exact controlled form content and template revision and record my authenticated decision.',
        actorUserId: input.actor.id,
        actorUsernameSnapshot: input.actor.username,
        actorDisplayNameSnapshot:
          input.actor.displayName ?? input.actor.username,
        actorRoleSnapshot: input.actor.role,
        actorCapabilitiesSnapshot: input.actor.capabilities ?? [],
        decisionComment: input.comment,
      })
      .returning();
    let nextStatus = context.instance.lifecycleStatus;
    if (input.decision !== 'APPROVED') {
      nextStatus = 'RETURNED_FOR_REVISION';
    } else {
      const valid = await tx
        .select()
        .from(projectFormApprovals)
        .where(
          and(
            eq(projectFormApprovals.projectFormInstanceRevisionId, revision.id),
            eq(projectFormApprovals.status, 'VALID'),
            eq(projectFormApprovals.decision, 'APPROVED')
          )
        );
      const satisfied = new Set(
        valid.map((item: any) => item.approvalRoleSnapshot.toLowerCase())
      );
      if (
        definition.approvalRoles.every((role) =>
          satisfied.has(role.toLowerCase())
        )
      ) {
        nextStatus = 'APPROVED';
      }
    }
    await tx
      .update(projectFormInstances)
      .set({
        lifecycleStatus: nextStatus,
        approvedAt: nextStatus === 'APPROVED' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(projectFormInstances.id, input.instanceId));
    await audit(
      'PROJECT_FORM_APPROVAL_DECISION',
      input.instanceId,
      input.actor,
      input.comment,
      {
        approvalId: approval.id,
        decision: input.decision,
        approvalRole: requiredRole,
        contentRevisionId: revision.id,
        contentChecksum: revision.contentChecksum,
        templateDefinitionRevisionId:
          context.instance.templateDefinitionRevisionId,
        lifecycleStatus: nextStatus,
      },
      input.request ?? {},
      tx
    );
    return { approval, lifecycleStatus: nextStatus };
  });
}

export async function addProjectFormAttachment(input: {
  instanceId: string;
  kind: 'PAPER_ORIGINAL' | 'EVIDENCE' | 'COMPLETED_PDF';
  originalFilename: string;
  storedPath: string;
  mimeType: string;
  buffer: Buffer;
  indexingMetadata?: Record<string, unknown>;
  actor: ProjectFormActor;
  request?: ProjectFormRequestEvidence;
}) {
  return db.transaction(async (tx) => {
    const context = await loadInstance(input.instanceId, tx);
    if (
      input.kind === 'PAPER_ORIGINAL' &&
      context.instance.completionMethod !== 'PAPER_UPLOAD'
    ) {
      throw new ProjectFormError(
        409,
        'PAPER_INSTANCE_REQUIRED',
        'Original scans belong only to paper-form instances'
      );
    }
    if (
      !['DRAFT', 'IN_PROGRESS', 'RETURNED_FOR_REVISION'].includes(
        context.instance.lifecycleStatus
      )
    ) {
      throw new ProjectFormError(
        409,
        'IMMUTABLE_FORM_STATE',
        'Attachments cannot alter submitted or approved form evidence'
      );
    }
    const checksum = sha256ProjectFormBuffer(input.buffer);
    const [attachment] = await tx
      .insert(projectFormAttachments)
      .values({
        projectFormInstanceId: input.instanceId,
        projectFormInstanceRevisionId:
          context.instance.currentContentRevisionId,
        attachmentKind: input.kind,
        originalFilename: input.originalFilename,
        storedPath: input.storedPath,
        mimeType: input.mimeType,
        byteSize: input.buffer.length,
        sha256Checksum: checksum,
        indexingMetadata: input.indexingMetadata ?? {},
        uploadedByUserId: input.actor.id,
        uploadedBySnapshot: actorSnapshot(input.actor),
      })
      .returning();
    await audit(
      input.kind === 'PAPER_ORIGINAL'
        ? 'PROJECT_FORM_PAPER_ORIGINAL_UPLOADED'
        : 'PROJECT_FORM_ATTACHMENT_ADDED',
      input.instanceId,
      input.actor,
      'Retain immutable Project Form Instance evidence',
      {
        attachmentId: attachment.id,
        kind: input.kind,
        checksum,
        originalFilename: input.originalFilename,
        byteSize: input.buffer.length,
        transcriptionStoredSeparately: true,
      },
      input.request ?? {},
      tx
    );
    return attachment;
  });
}

export async function renderProjectForm(input: {
  instanceId: string;
  retainApproved: boolean;
  actor: ProjectFormActor;
  request?: ProjectFormRequestEvidence;
}) {
  const context = await getProjectForm(input.instanceId);
  const revision = context.revisions.find(
    (item: any) => item.id === context.instance.currentContentRevisionId
  );
  if (!revision) {
    throw new ProjectFormError(
      409,
      'CONTENT_REVISION_REQUIRED',
      'Submit an immutable content revision before rendering'
    );
  }
  const definition =
    DESIGN_CONTROL_FORM_CATALOG_BY_KEY.get(
      context.templateRevision.templateKeySnapshot
    ) ??
    (context.templateRevision
      .canonicalDefinition as DesignControlFormDefinition);
  const generatedAt =
    input.retainApproved && context.instance.approvedAt
      ? new Date(context.instance.approvedAt)
      : new Date();
  const buffer = await renderCompletedProjectFormPdf({
    instanceId: context.instance.id,
    instanceNumber: context.instance.instanceNumber,
    projectId: context.project.id,
    projectName: context.project.projectName,
    recordNumber: context.record.recordNumber ?? context.record.id,
    stepKey: context.step.stepKey,
    contentRevision: revision.contentRevisionNumber,
    definition,
    documentNumber: context.instance.templateDocumentNumberSnapshot,
    documentRevision: context.instance.templateRevisionSnapshot,
    lifecycleStatus: context.instance.lifecycleStatus,
    content: revision.canonicalContent as Record<string, unknown>,
    approvals: context.approvals,
    attachments: context.attachments,
    generatedAt,
    controlled:
      input.retainApproved && context.instance.lifecycleStatus === 'APPROVED',
  });
  const checksum = sha256ProjectFormBuffer(buffer);
  await db.transaction(async (tx) => {
    if (
      input.retainApproved &&
      context.instance.lifecycleStatus === 'APPROVED'
    ) {
      const retainedPath = `internal://project-form/${context.instance.id}/${revision.id}.pdf`;
      await tx
        .update(projectFormInstances)
        .set({
          retainedPdfPath: retainedPath,
          retainedPdfChecksum: checksum,
          retainedPdfSize: buffer.length,
          retainedPdfGeneratedAt: generatedAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projectFormInstances.id, context.instance.id),
            sql`${projectFormInstances.retainedPdfChecksum} IS NULL`
          )
        );
    }
    await audit(
      'PROJECT_FORM_PDF_RENDERED',
      context.instance.id,
      input.actor,
      input.retainApproved
        ? 'Retain approved completed PDF'
        : 'Generate uncontrolled preview',
      {
        contentRevisionId: revision.id,
        checksum,
        byteSize: buffer.length,
        retained: input.retainApproved,
        uncontrolledWhenPrinted: !input.retainApproved,
      },
      input.request ?? {},
      tx
    );
  });
  if (
    context.instance.retainedPdfChecksum &&
    context.instance.retainedPdfChecksum !== checksum
  ) {
    throw new ProjectFormError(
      409,
      'RETAINED_PDF_CHECKSUM_MISMATCH',
      'Regenerated approved PDF does not match retained immutable identity'
    );
  }
  return { buffer, checksum };
}

export async function supersedeProjectForm(input: {
  instanceId: string;
  reason: string;
  actor: ProjectFormActor;
  request?: ProjectFormRequestEvidence;
}) {
  return db.transaction(async (tx) => {
    const context = await loadInstance(input.instanceId, tx);
    if (['SUPERSEDED', 'VOID'].includes(context.instance.lifecycleStatus)) {
      throw new ProjectFormError(
        409,
        'FORM_ALREADY_CLOSED',
        'The Project Form Instance is already closed'
      );
    }
    const [instance] = await tx
      .update(projectFormInstances)
      .set({
        lifecycleStatus: 'SUPERSEDED',
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projectFormInstances.id, input.instanceId))
      .returning();
    await audit(
      'PROJECT_FORM_INSTANCE_SUPERSEDED',
      input.instanceId,
      input.actor,
      input.reason,
      { priorStatus: context.instance.lifecycleStatus },
      input.request ?? {},
      tx
    );
    return instance;
  });
}

export async function getProjectFormReleaseReadiness(
  recordId: string,
  client: any = db
) {
  const forms = await listProjectForms(recordId, client);
  const current = forms.filter(
    (item: any) => !['SUPERSEDED', 'VOID'].includes(item.lifecycleStatus)
  );
  const missingItems: string[] = [];
  for (let index = 1; index <= 12; index += 1) {
    const stepKey = String(index);
    const instance = current.find((item: any) => item.stepKey === stepKey);
    if (!instance) {
      missingItems.push(
        `Step ${stepKey}: approved Project Form Instance missing`
      );
      continue;
    }
    if (instance.lifecycleStatus !== 'APPROVED') {
      missingItems.push(
        `Step ${stepKey}: Project Form Instance is ${instance.lifecycleStatus}`
      );
    }
    const paperOriginal =
      instance.completionMethod === 'PAPER_UPLOAD'
        ? await client
            .select()
            .from(projectFormAttachments)
            .where(
              and(
                eq(projectFormAttachments.projectFormInstanceId, instance.id),
                eq(projectFormAttachments.attachmentKind, 'PAPER_ORIGINAL')
              )
            )
        : [];
    if (
      !instance.currentContentRevisionId ||
      !(
        instance.retainedPdfChecksum ||
        (instance.completionMethod === 'PAPER_UPLOAD' &&
          paperOriginal.length > 0)
      )
    ) {
      missingItems.push(
        `Step ${stepKey}: immutable content and retained PDF or paper scan required`
      );
    }
    const approvals = await client
      .select()
      .from(projectFormApprovals)
      .where(
        and(
          eq(projectFormApprovals.projectFormInstanceId, instance.id),
          eq(projectFormApprovals.status, 'VALID'),
          eq(projectFormApprovals.decision, 'APPROVED')
        )
      );
    const [templateRevision] = await client
      .select()
      .from(designControlFormTemplateRevisions)
      .where(
        eq(
          designControlFormTemplateRevisions.id,
          instance.templateDefinitionRevisionId
        )
      )
      .limit(1);
    const definition =
      templateRevision &&
      (DESIGN_CONTROL_FORM_CATALOG_BY_KEY.get(
        templateRevision.templateKeySnapshot
      ) ??
        (templateRevision.canonicalDefinition as DesignControlFormDefinition));
    const approvedRoles = new Set(
      approvals.map((item: any) => item.approvalRoleSnapshot.toLowerCase())
    );
    if (
      !definition ||
      !definition.approvalRoles.every((role) =>
        approvedRoles.has(role.toLowerCase())
      )
    ) {
      missingItems.push(
        `Step ${stepKey}: all authenticated version-bound form approvals required`
      );
    }
  }
  return {
    ready: missingItems.length === 0,
    missingItems,
    provenance: 'PROJECT_FORM_INSTANCE_AUTHENTICATED_VERSION_BOUND' as const,
  };
}
