import crypto from 'crypto';
import { and, asc, eq, sql } from 'drizzle-orm';

import {
  DESIGN_CONTROL_FORM_CATALOG,
  DESIGN_CONTROL_FORM_CATALOG_BY_KEY,
  DESIGN_CONTROL_FORM_RENDERER_VERSION,
  DESIGN_CONTROL_TEMPLATE_SCHEMA_VERSION,
  type DesignControlFormDefinition,
} from '../../../shared/designControlFormCatalog';
import { db } from '../../db';
import {
  controlledDocumentNumberRegistry,
  controlledDocuments,
  designControlFormTemplateReconciliation,
  designControlFormTemplateRevisions,
  designControlFormTemplates,
  documentTemplates,
  documentVersionHistory,
} from '../../schema';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import { canonicalize, recordAuditEvent } from './auditLedgerService';
import {
  ControlledDocumentError,
  createControlledRevision,
  type ControlledDocumentActor,
  type DocumentLifecycle,
  type RequestEvidence,
} from './controlledDocumentLifecycleService';
import {
  renderDesignControlBlankPdf,
  sha256Buffer,
} from './designControlFormPdfService';
import { getFileStorageProvider } from './fileStorageProvider';
import { getUserPermissions } from './permissionService';

type Client = typeof db;

const definitionBuffer = (definition: DesignControlFormDefinition) =>
  Buffer.from(canonicalize(definition), 'utf8');

export const checksumTemplateDefinition = (
  definition: DesignControlFormDefinition
) =>
  crypto
    .createHash('sha256')
    .update(definitionBuffer(definition))
    .digest('hex');

const actorEvidence = async (actor: ControlledDocumentActor) => {
  if (!Number.isInteger(actor.id) || actor.id <= 0) {
    throw new ControlledDocumentError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authenticated actor is required'
    );
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

const templateAudit = async (
  eventType: string,
  actor: ControlledDocumentActor,
  request: RequestEvidence,
  input: {
    templateId: string;
    templateRevisionId: string;
    documentId: string;
    documentVersionId: string;
    reason: string;
    checksum: string;
    before: string | null;
    after: string;
  },
  client: Client
) =>
  recordAuditEvent(
    {
      eventType,
      subjectType: 'design_control_form_template',
      subjectId: input.templateId,
      sourceService: 'designControlTemplate.service',
      actor,
      reason: input.reason,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      fieldsChanged:
        input.before === null
          ? null
          : {
              lifecycleStatus: { before: input.before, after: input.after },
            },
      payload: {
        controlledDocumentId: input.documentId,
        documentVersionHistoryId: input.documentVersionId,
        templateDefinitionRevisionId: input.templateRevisionId,
        definitionChecksum: input.checksum,
        beforeLifecycle: input.before,
        afterLifecycle: input.after,
      },
    },
    client
  );

export async function listDesignControlTemplates(client: Client = db) {
  const templates = await client
    .select()
    .from(designControlFormTemplates)
    .orderBy(asc(designControlFormTemplates.templateKey));
  const results = [];
  for (const template of templates) {
    const [document] = await client
      .select()
      .from(controlledDocuments)
      .where(eq(controlledDocuments.id, template.controlledDocumentId))
      .limit(1);
    const revisions = await client
      .select()
      .from(designControlFormTemplateRevisions)
      .where(
        eq(
          designControlFormTemplateRevisions.designControlFormTemplateId,
          template.id
        )
      )
      .orderBy(
        asc(designControlFormTemplateRevisions.templateRevisionSequence)
      );
    results.push({ ...template, document, revisions });
  }
  return results;
}

export async function listDesignControlTemplateReconciliation(
  client: Client = db
) {
  const [conflicts, legacyTemplates] = await Promise.all([
    client
      .select()
      .from(designControlFormTemplateReconciliation)
      .where(sql`${designControlFormTemplateReconciliation.resolvedAt} IS NULL`)
      .orderBy(asc(designControlFormTemplateReconciliation.detectedAt)),
    client
      .select({
        id: documentTemplates.id,
        templateName: documentTemplates.templateName,
        templateType: documentTemplates.templateType,
        createdAt: documentTemplates.createdAt,
      })
      .from(documentTemplates)
      .where(eq(documentTemplates.isActive, true))
      .orderBy(asc(documentTemplates.templateName)),
  ]);
  return {
    conflicts,
    legacyTemplates: legacyTemplates.map((template) => ({
      ...template,
      reconciliationStatus: 'RECONCILIATION_REQUIRED',
      reason:
        'Legacy configurable template has no deterministic stable-key and exact MDR revision binding',
    })),
  };
}

export async function seedCanonicalDesignControlTemplates(
  input: {
    actor: ControlledDocumentActor;
    request?: RequestEvidence;
  },
  client: Client = db
) {
  const evidence = await actorEvidence(input.actor);
  const created: string[] = [];
  const existing: string[] = [];
  const conflicts: Array<{
    templateKey: string;
    code: string;
    details: string;
  }> = [];

  for (const definition of DESIGN_CONTROL_FORM_CATALOG) {
    await client.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`design-control-template:${definition.templateKey}`}))`
      );
      const [mapping] = await tx
        .select()
        .from(designControlFormTemplates)
        .where(
          eq(designControlFormTemplates.templateKey, definition.templateKey)
        )
        .limit(1);
      if (mapping) {
        const [mappedDocument] = await tx
          .select()
          .from(controlledDocuments)
          .where(eq(controlledDocuments.id, mapping.controlledDocumentId))
          .limit(1);
        if (
          !mappedDocument ||
          mappedDocument.templateKey !== definition.templateKey
        ) {
          conflicts.push({
            templateKey: definition.templateKey,
            code: 'TEMPLATE_MAPPING_CONFLICT',
            details:
              'Existing mapping does not resolve to the same stable controlled-document template key',
          });
        } else {
          existing.push(definition.templateKey);
        }
        return;
      }

      const [legacyDocument] = await tx
        .select()
        .from(controlledDocuments)
        .where(eq(controlledDocuments.templateKey, definition.templateKey))
        .limit(1);
      const [numberOwner] = await tx
        .select()
        .from(controlledDocuments)
        .where(
          sql`upper(trim(${controlledDocuments.documentNumber})) = ${definition.documentNumber}`
        )
        .limit(1);
      const [numberReservation] = await tx
        .select()
        .from(controlledDocumentNumberRegistry)
        .where(
          eq(
            controlledDocumentNumberRegistry.normalizedNumber,
            definition.documentNumber
          )
        )
        .limit(1);
      if (legacyDocument || numberOwner || numberReservation) {
        await tx
          .insert(designControlFormTemplateReconciliation)
          .values({
            templateKey: definition.templateKey,
            conflictType: 'LEGACY_TEMPLATE_RECONCILIATION_REQUIRED',
            details: {
              expectedDocumentNumber: definition.documentNumber,
              legacyDocumentId: legacyDocument?.id ?? null,
              numberOwnerDocumentId: numberOwner?.id ?? null,
              numberReservationId: numberReservation?.id ?? null,
            },
            detectedByUserId: input.actor.id,
          })
          .onConflictDoNothing();
        conflicts.push({
          templateKey: definition.templateKey,
          code: 'LEGACY_TEMPLATE_RECONCILIATION_REQUIRED',
          details:
            'Stable template key or document number already exists and was not overwritten',
        });
        return;
      }

      const definitionBytes = definitionBuffer(definition);
      const definitionChecksum = checksumTemplateDefinition(definition);
      const [document] = await tx
        .insert(controlledDocuments)
        .values({
          templateKey: definition.templateKey,
          documentNumber: definition.documentNumber,
          documentName: definition.title,
          documentType: definition.identification.documentType,
          department: definition.identification.department,
          category: definition.formCategory,
          description: definition.purpose,
          currentVersion: '1.0',
          status: 'draft',
          lifecycleStatus: 'DRAFT',
          numberControlStatus: 'RESERVED',
          documentOwner: 'Document Control / Engineering',
          filePath: `internal://design-control-template/${definition.templateKey}/1`,
          classification: 'internal',
          accessRule: 'authenticated',
          createdBy: input.actor.username,
        })
        .returning();
      const [documentRevision] = await tx
        .insert(documentVersionHistory)
        .values({
          documentId: document.id,
          versionNumber: '1.0',
          revisionSequence: 1,
          lifecycleStatus: 'DRAFT',
          status: 'draft',
          changeDescription: 'Canonical Design Control blank form template',
          changeType: 'controlled_template_definition',
          revisionReason:
            'Initial canonical Phase 4 Design Control form definition',
          filePath: document.filePath,
          fileName: `${definition.templateKey}.json`,
          mediaType: 'application/json',
          fileSize: definitionBytes.length,
          fileChecksum: definitionChecksum,
          checksumStatus: 'VERIFIED',
          createdBy: input.actor.username,
          metadata: {
            provenance: 'DESIGN_CONTROL_FORM_CATALOG',
            templateKey: definition.templateKey,
            templateSchemaVersion: DESIGN_CONTROL_TEMPLATE_SCHEMA_VERSION,
            rendererVersion: DESIGN_CONTROL_FORM_RENDERER_VERSION,
          },
        })
        .returning();
      await tx
        .update(controlledDocuments)
        .set({
          currentRevisionId: documentRevision.id,
          workingDraftRevisionId: documentRevision.id,
        })
        .where(eq(controlledDocuments.id, document.id));
      await tx.insert(controlledDocumentNumberRegistry).values({
        normalizedNumber: definition.documentNumber,
        displayNumber: definition.documentNumber,
        controlledDocumentId: document.id,
        status: 'RESERVED',
        reservedByUserId: input.actor.id,
        reservedBySnapshot: evidence.snapshot,
      });
      const [template] = await tx
        .insert(designControlFormTemplates)
        .values({
          templateKey: definition.templateKey,
          controlledDocumentId: document.id,
          formCategory: definition.formCategory,
          workflowStepKey: definition.workflowStepKey,
          changeRecordType: definition.changeRecordType,
          createdByUserId: input.actor.id,
        })
        .returning();
      const [templateRevision] = await tx
        .insert(designControlFormTemplateRevisions)
        .values({
          designControlFormTemplateId: template.id,
          documentVersionHistoryId: documentRevision.id,
          templateRevisionSequence: 1,
          templateSchemaVersion: DESIGN_CONTROL_TEMPLATE_SCHEMA_VERSION,
          rendererVersion: DESIGN_CONTROL_FORM_RENDERER_VERSION,
          lifecycleStatus: 'DRAFT',
          canonicalDefinition: definition,
          definitionChecksum,
          documentNumberSnapshot: definition.documentNumber,
          documentRevisionSnapshot: '1.0',
          templateKeySnapshot: definition.templateKey,
          lifecycleStatusAtUse: 'DRAFT',
          revisionReason:
            'Initial canonical Phase 4 Design Control form definition',
          createdByUserId: input.actor.id,
        })
        .returning();
      await templateAudit(
        'DESIGN_CONTROL_FORM_TEMPLATE_CREATED',
        input.actor,
        input.request ?? {},
        {
          templateId: template.id,
          templateRevisionId: templateRevision.id,
          documentId: document.id,
          documentVersionId: documentRevision.id,
          reason: 'Initial canonical Phase 4 Design Control form definition',
          checksum: definitionChecksum,
          before: null,
          after: 'DRAFT',
        },
        tx as unknown as Client
      );
      created.push(definition.templateKey);
    });
  }
  return {
    expected: DESIGN_CONTROL_FORM_CATALOG.length,
    created,
    existing,
    conflicts,
  };
}

async function loadTemplateRevision(
  templateKey: string,
  revisionId?: string,
  client: Client = db
) {
  const [template] = await client
    .select()
    .from(designControlFormTemplates)
    .where(eq(designControlFormTemplates.templateKey, templateKey))
    .limit(1);
  if (!template)
    throw new ControlledDocumentError(
      404,
      'TEMPLATE_NOT_FOUND',
      'Design Control form template not found'
    );
  const revisions = await client
    .select()
    .from(designControlFormTemplateRevisions)
    .where(
      eq(
        designControlFormTemplateRevisions.designControlFormTemplateId,
        template.id
      )
    )
    .orderBy(asc(designControlFormTemplateRevisions.templateRevisionSequence));
  const revision = revisionId
    ? revisions.find((candidate) => candidate.id === revisionId)
    : revisions[revisions.length - 1];
  if (!revision)
    throw new ControlledDocumentError(
      404,
      'TEMPLATE_REVISION_NOT_FOUND',
      'Template revision not found'
    );
  const [document] = await client
    .select()
    .from(controlledDocuments)
    .where(eq(controlledDocuments.id, template.controlledDocumentId))
    .limit(1);
  const [documentRevision] = await client
    .select()
    .from(documentVersionHistory)
    .where(eq(documentVersionHistory.id, revision.documentVersionHistoryId))
    .limit(1);
  if (!document || !documentRevision) {
    throw new ControlledDocumentError(
      409,
      'TEMPLATE_REVISION_MAPPING_MISSING',
      'Exact MDR revision mapping is missing'
    );
  }
  return { template, revision, revisions, document, documentRevision };
}

export async function createDesignControlTemplateRevision(input: {
  templateKey: string;
  expectedDocumentRevisionId?: string;
  documentRevision: string;
  reason: string;
  definition: DesignControlFormDefinition;
  actor: ControlledDocumentActor;
  request?: RequestEvidence;
}) {
  const expected = DESIGN_CONTROL_FORM_CATALOG_BY_KEY.get(input.templateKey);
  if (!expected || input.definition.templateKey !== input.templateKey) {
    throw new ControlledDocumentError(
      400,
      'INVALID_TEMPLATE_KEY',
      'Definition must retain a canonical stable template key'
    );
  }
  const context = await loadTemplateRevision(input.templateKey);
  const buffer = definitionBuffer(input.definition);
  const controlled = await createControlledRevision({
    documentId: context.document.id,
    expectedCurrentRevisionId: input.expectedDocumentRevisionId,
    revisionValue: input.documentRevision,
    reason: input.reason,
    file: {
      path: `internal://design-control-template/${input.templateKey}/${context.revisions.length + 1}`,
      name: `${input.templateKey}.json`,
      mediaType: 'application/json',
      size: buffer.length,
      buffer,
    },
    actor: input.actor,
    request: input.request,
  });
  return db.transaction(async (tx) => {
    const [revision] = await tx
      .insert(designControlFormTemplateRevisions)
      .values({
        designControlFormTemplateId: context.template.id,
        documentVersionHistoryId: controlled.revision.id,
        templateRevisionSequence: context.revisions.length + 1,
        templateSchemaVersion: DESIGN_CONTROL_TEMPLATE_SCHEMA_VERSION,
        rendererVersion: DESIGN_CONTROL_FORM_RENDERER_VERSION,
        lifecycleStatus: 'DRAFT',
        canonicalDefinition: input.definition,
        definitionChecksum: checksumTemplateDefinition(input.definition),
        documentNumberSnapshot: context.document.documentNumber,
        documentRevisionSnapshot: input.documentRevision,
        templateKeySnapshot: input.templateKey,
        lifecycleStatusAtUse: 'DRAFT',
        revisionReason: input.reason,
        createdByUserId: input.actor.id,
      })
      .returning();
    await templateAudit(
      'DESIGN_CONTROL_FORM_TEMPLATE_REVISION_CREATED',
      input.actor,
      input.request ?? {},
      {
        templateId: context.template.id,
        templateRevisionId: revision.id,
        documentId: context.document.id,
        documentVersionId: controlled.revision.id,
        reason: input.reason,
        checksum: revision.definitionChecksum,
        before: context.revision.lifecycleStatus,
        after: 'DRAFT',
      },
      tx as unknown as Client
    );
    return { ...controlled, templateRevision: revision };
  });
}

export async function prepareReleasedBlankPdf(input: {
  templateKey: string;
  revisionId: string;
  actor: ControlledDocumentActor;
  request?: RequestEvidence;
}) {
  const context = await loadTemplateRevision(
    input.templateKey,
    input.revisionId
  );
  if (context.documentRevision.lifecycleStatus !== 'APPROVED') {
    throw new ControlledDocumentError(
      409,
      'APPROVED_REVISION_REQUIRED',
      'Blank artifact preparation requires an approved exact MDR revision'
    );
  }
  if (context.revision.blankPdfPath && context.revision.blankPdfChecksum)
    return context.revision;
  const pdf = await renderDesignControlBlankPdf({
    templateRevisionId: context.revision.id,
    definition: context.revision
      .canonicalDefinition as DesignControlFormDefinition,
    documentNumber: context.revision.documentNumberSnapshot,
    documentRevision: context.revision.documentRevisionSnapshot,
    lifecycleStatus: 'RELEASED',
    generatedAt: context.revision.createdAt,
  });
  const checksum = sha256Buffer(pdf);
  const path = await getFileStorageProvider().uploadBuffer({
    buffer: pdf,
    fileName: `${context.revision.documentNumberSnapshot}-${context.revision.documentRevisionSnapshot}-blank.pdf`,
    contentType: 'application/pdf',
    scope: 'design-control-form-templates',
    entityId: context.revision.id,
  });
  const [updated] = await db
    .update(designControlFormTemplateRevisions)
    .set({
      blankPdfPath: path,
      blankPdfChecksum: checksum,
      blankPdfSize: pdf.length,
      blankPdfGeneratedAt: new Date(),
    })
    .where(
      and(
        eq(designControlFormTemplateRevisions.id, context.revision.id),
        eq(designControlFormTemplateRevisions.lifecycleStatus, 'APPROVED')
      )
    )
    .returning();
  if (!updated)
    throw new ControlledDocumentError(
      409,
      'STALE_TEMPLATE_REVISION',
      'Template lifecycle changed during artifact preparation'
    );
  return updated;
}

export async function synchronizeTemplateLifecycle(input: {
  templateKey: string;
  revisionId: string;
  lifecycleStatus: Exclude<DocumentLifecycle, 'VOID'>;
  reason: string;
  actor: ControlledDocumentActor;
  request?: RequestEvidence;
}) {
  const context = await loadTemplateRevision(
    input.templateKey,
    input.revisionId
  );
  const before = context.revision.lifecycleStatus;
  return db.transaction(async (tx) => {
    const allowedTerminalTransition =
      input.lifecycleStatus === 'OBSOLETE' &&
      ['RELEASED', 'SUPERSEDED'].includes(before);
    if (
      ['RELEASED', 'SUPERSEDED', 'OBSOLETE'].includes(before) &&
      before !== input.lifecycleStatus &&
      !allowedTerminalTransition
    ) {
      throw new ControlledDocumentError(
        409,
        'RELEASED_TEMPLATE_IMMUTABLE',
        'Released template revisions cannot be rewritten'
      );
    }
    if (
      input.lifecycleStatus === 'RELEASED' &&
      (!context.revision.blankPdfPath || !context.revision.blankPdfChecksum)
    ) {
      throw new ControlledDocumentError(
        422,
        'RETAINED_BLANK_PDF_REQUIRED',
        'Release requires a retained checksummed blank PDF'
      );
    }
    const [revision] = await tx
      .update(designControlFormTemplateRevisions)
      .set({
        lifecycleStatus: input.lifecycleStatus,
        lifecycleStatusAtUse: input.lifecycleStatus,
      })
      .where(eq(designControlFormTemplateRevisions.id, context.revision.id))
      .returning();
    if (input.lifecycleStatus === 'RELEASED') {
      if (context.template.activeTemplateRevisionId) {
        await tx
          .update(designControlFormTemplateRevisions)
          .set({
            lifecycleStatus: 'SUPERSEDED',
            lifecycleStatusAtUse: 'SUPERSEDED',
          })
          .where(
            and(
              eq(
                designControlFormTemplateRevisions.id,
                context.template.activeTemplateRevisionId
              ),
              eq(designControlFormTemplateRevisions.lifecycleStatus, 'RELEASED')
            )
          );
      }
      await tx
        .update(designControlFormTemplates)
        .set({
          activeTemplateRevisionId: revision.id,
          updatedAt: new Date(),
        })
        .where(eq(designControlFormTemplates.id, context.template.id));
    }
    if (
      input.lifecycleStatus === 'OBSOLETE' &&
      context.template.activeTemplateRevisionId === revision.id
    ) {
      await tx
        .update(designControlFormTemplates)
        .set({
          activeTemplateRevisionId: null,
          updatedAt: new Date(),
        })
        .where(eq(designControlFormTemplates.id, context.template.id));
    }
    await templateAudit(
      `DESIGN_CONTROL_FORM_TEMPLATE_${input.lifecycleStatus}`,
      input.actor,
      input.request ?? {},
      {
        templateId: context.template.id,
        templateRevisionId: revision.id,
        documentId: context.document.id,
        documentVersionId: context.documentRevision.id,
        reason: input.reason,
        checksum: revision.definitionChecksum,
        before,
        after: input.lifecycleStatus,
      },
      tx as unknown as Client
    );
    return revision;
  });
}

export async function getBlankFormArtifact(
  templateKey: string,
  revisionId: string
) {
  const context = await loadTemplateRevision(templateKey, revisionId);
  if (context.revision.lifecycleStatus === 'RELEASED') {
    if (!context.revision.blankPdfPath || !context.revision.blankPdfChecksum) {
      throw new ControlledDocumentError(
        409,
        'RELEASED_ARTIFACT_MISSING',
        'Released blank form artifact is missing'
      );
    }
    const buffer = await getFileStorageProvider().downloadBuffer(
      context.revision.blankPdfPath
    );
    if (sha256Buffer(buffer) !== context.revision.blankPdfChecksum) {
      throw new ControlledDocumentError(
        409,
        'RELEASED_ARTIFACT_CHECKSUM_MISMATCH',
        'Retained released blank form failed checksum verification'
      );
    }
    return {
      ...context,
      buffer,
      retained: true,
    };
  }
  const buffer = await renderDesignControlBlankPdf({
    templateRevisionId: context.revision.id,
    definition: context.revision
      .canonicalDefinition as DesignControlFormDefinition,
    documentNumber: context.revision.documentNumberSnapshot,
    documentRevision: context.revision.documentRevisionSnapshot,
    lifecycleStatus: context.revision.lifecycleStatus,
    generatedAt: context.revision.createdAt,
  });
  return { ...context, buffer, retained: false };
}

export async function assertReleasedTemplateRevisionSelectable(
  templateKey: string,
  revisionId: string
) {
  const context = await loadTemplateRevision(templateKey, revisionId);
  if (
    context.revision.lifecycleStatus !== 'RELEASED' ||
    context.template.activeTemplateRevisionId !== revisionId
  ) {
    throw new ControlledDocumentError(
      409,
      'RELEASED_TEMPLATE_REVISION_REQUIRED',
      'Only the active RELEASED template revision may be selected for a future controlled form instance'
    );
  }
  return context;
}
