import { and, desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import {
  designControlFinalReviewExceptions,
  designControlFinalReviewSnapshots,
  designControlReviewActions,
  designControlStructuredRecordLinks,
  designControlStructuredRecordVersions,
  designControlTraceabilitySnapshots,
} from '../../designControlStructuredSchema';
import {
  designControlChanges,
  designControlRecords,
  designControlRequirements,
  designControlReviews,
  designControlRisks,
  designControlSteps,
  designControlValidation,
  designControlVerification,
  engineeringReleases,
} from '../../schema';
import { getDesignManufacturingEvidence } from './designManufacturingEvidenceService';
import {
  assertStructuredProjectAccess,
  DesignControlStructuredError,
  stableChecksum,
  type StructuredActor,
} from './designControlStructuredLifecycleService';

type MatrixStatus =
  | 'FULLY_TRACED'
  | 'MISSING_OUTPUT'
  | 'MISSING_CONFIGURATION_ITEM'
  | 'MISSING_PART_REVISION'
  | 'MISSING_VERIFICATION'
  | 'FAILED_VERIFICATION'
  | 'VALIDATION_REQUIRED_MISSING'
  | 'OPEN_RISK'
  | 'UNAPPROVED_CHANGE'
  | 'NOT_INCLUDED_IN_RELEASE'
  | 'SUPERSEDED'
  | 'APPROVED_NOT_APPLICABLE';

function content(
  version: typeof designControlStructuredRecordVersions.$inferSelect | undefined
) {
  return (version?.contentSnapshot ?? {}) as Record<string, unknown>;
}

function currentVersions(
  versions: Array<typeof designControlStructuredRecordVersions.$inferSelect>
) {
  const current = new Map<
    string,
    typeof designControlStructuredRecordVersions.$inferSelect
  >();
  for (const version of versions) {
    const existing = current.get(version.structuredRecordId);
    if (!existing || version.version > existing.version)
      current.set(version.structuredRecordId, version);
  }
  return current;
}

export async function calculateDesignControlTraceability(
  recordId: string,
  actor: StructuredActor,
  client: typeof db = db
) {
  const [record] = await client
    .select()
    .from(designControlRecords)
    .where(eq(designControlRecords.id, recordId))
    .limit(1);
  if (!record?.rdProjectId)
    throw new DesignControlStructuredError(
      404,
      'DESIGN_CONTROL_RECORD_NOT_FOUND',
      'Design Control record was not found'
    );
  await assertStructuredProjectAccess({
    rdProjectId: record.rdProjectId,
    actor,
    action: 'READ',
  });

  const [requirements, versions, links, releases] = await Promise.all([
    client
      .select()
      .from(designControlRequirements)
      .where(eq(designControlRequirements.recordId, record.id)),
    client
      .select()
      .from(designControlStructuredRecordVersions)
      .where(
        eq(
          designControlStructuredRecordVersions.designControlRecordId,
          record.id
        )
      )
      .orderBy(desc(designControlStructuredRecordVersions.version)),
    client
      .select()
      .from(designControlStructuredRecordLinks)
      .where(
        eq(designControlStructuredRecordLinks.designControlRecordId, record.id)
      ),
    client
      .select()
      .from(engineeringReleases)
      .where(eq(engineeringReleases.designControlRecordId, record.id)),
  ]);
  const byCurrent = currentVersions(versions);
  const versionByTarget = byCurrent;
  const linksByRequirement = new Map<string, typeof links>();
  for (const link of links) {
    if (link.sourceRecordType === 'REQUIREMENT')
      linksByRequirement.set(link.sourceRecordId, [
        ...(linksByRequirement.get(link.sourceRecordId) ?? []),
        link,
      ]);
  }

  const rows = requirements.map((requirement) => {
    const version = byCurrent.get(requirement.id);
    const requirementContent = content(version);
    const rowLinks = linksByRequirement.get(requirement.id) ?? [];
    const has = (target: string) =>
      rowLinks.some((link) => link.targetRecordType === target);
    const targets = (target: string) =>
      rowLinks.filter((link) => link.targetRecordType === target);
    const verificationTargets = targets('VERIFICATION').map((link) =>
      versionByTarget.get(link.targetRecordId)
    );
    const validationTargets = targets('VALIDATION').map((link) =>
      versionByTarget.get(link.targetRecordId)
    );
    const riskTargets = targets('RISK').map((link) =>
      versionByTarget.get(link.targetRecordId)
    );
    const changeTargets = [...targets('ECR'), ...targets('ECN')];
    const statuses: MatrixStatus[] = [];

    if (version?.lifecycleStatus === 'SUPERSEDED') statuses.push('SUPERSEDED');
    if (
      rowLinks.some(
        (link) =>
          link.relationType === 'NOT_APPLICABLE' &&
          link.targetStatusSnapshot === 'APPROVED'
      )
    )
      statuses.push('APPROVED_NOT_APPLICABLE');
    if (!has('DESIGN_OUTPUT')) statuses.push('MISSING_OUTPUT');
    if (!has('CONFIGURATION_ITEM')) statuses.push('MISSING_CONFIGURATION_ITEM');
    if (!has('PART_REVISION')) statuses.push('MISSING_PART_REVISION');
    if (
      verificationTargets.length === 0 ||
      !verificationTargets.some(
        (target) => target?.lifecycleStatus === 'APPROVED'
      )
    )
      statuses.push('MISSING_VERIFICATION');
    if (
      verificationTargets.some((target) => content(target).passFail === 'FAIL')
    )
      statuses.push('FAILED_VERIFICATION');
    if (
      requirementContent.validationRequired === true &&
      !validationTargets.some(
        (target) => target?.lifecycleStatus === 'APPROVED'
      )
    )
      statuses.push('VALIDATION_REQUIRED_MISSING');
    if (riskTargets.some((target) => target?.lifecycleStatus !== 'APPROVED'))
      statuses.push('OPEN_RISK');
    if (
      changeTargets.some(
        (link) =>
          !['APPROVED', 'IMPLEMENTED', 'CLOSED'].includes(
            String(link.targetStatusSnapshot ?? '').toUpperCase()
          )
      )
    )
      statuses.push('UNAPPROVED_CHANGE');
    if (releases.length > 0 && !has('ENGINEERING_RELEASE'))
      statuses.push('NOT_INCLUDED_IN_RELEASE');
    if (statuses.length === 0) statuses.push('FULLY_TRACED');

    const primaryStatus = statuses[0];
    return {
      requirementId: requirement.id,
      requirementNumber: String(
        requirementContent.requirementNumber ??
          requirement.requirementKey ??
          requirement.id
      ),
      statement: String(
        requirementContent.requirementStatement ?? requirement.title ?? ''
      ),
      owner: String(requirementContent.owner ?? ''),
      lifecycleStatus: version?.lifecycleStatus ?? 'LEGACY_UNVERSIONED',
      statuses,
      primaryStatus,
      links: rowLinks.map((link) => ({
        id: link.id,
        type: link.targetRecordType,
        targetId: link.targetRecordId,
        revision: link.targetRevision,
        status: link.targetStatusSnapshot,
        href: `/design-control?project=${encodeURIComponent(record.rdProjectId!)}&record=${record.id}&targetType=${link.targetRecordType}&targetId=${link.targetRecordId}`,
      })),
      remediation:
        primaryStatus === 'FULLY_TRACED'
          ? null
          : {
              reason: primaryStatus.replaceAll('_', ' ').toLowerCase(),
              owner: String(requirementContent.owner ?? 'Design Authority'),
              href: `/design-control?project=${encodeURIComponent(record.rdProjectId!)}&record=${record.id}&workspaceTab=evidence&requirement=${requirement.id}`,
            },
    };
  });

  const counts = rows.reduce<Record<string, number>>((result, row) => {
    for (const status of row.statuses)
      result[status] = (result[status] ?? 0) + 1;
    return result;
  }, {});
  return {
    recordId: record.id,
    rdProjectId: record.rdProjectId,
    calculatedAt: new Date().toISOString(),
    source: 'PERSISTED_DESIGN_CONTROL_RELATIONSHIPS',
    rows,
    totals: {
      requirements: rows.length,
      fullyTraced: counts.FULLY_TRACED ?? 0,
      releaseReady:
        rows.length > 0 &&
        rows.every((row) => row.primaryStatus === 'FULLY_TRACED'),
      byStatus: counts,
    },
  };
}

type ReadinessCategory = {
  key: string;
  label: string;
  status: 'COMPLETE' | 'INCOMPLETE' | 'BLOCKED' | 'NOT_APPLICABLE';
  reason: string;
  owner: string;
  recordId: string;
  href: string;
};

export async function calculateFinalDesignReviewReadiness(
  recordId: string,
  actor: StructuredActor,
  client: typeof db = db
) {
  const [record] = await client
    .select()
    .from(designControlRecords)
    .where(eq(designControlRecords.id, recordId))
    .limit(1);
  if (!record?.rdProjectId)
    throw new DesignControlStructuredError(
      404,
      'DESIGN_CONTROL_RECORD_NOT_FOUND',
      'Design Control record was not found'
    );
  await assertStructuredProjectAccess({
    rdProjectId: record.rdProjectId,
    actor,
    action: 'READ',
  });

  const [
    steps,
    versions,
    requirements,
    risks,
    reviews,
    verification,
    validation,
    actions,
    changes,
    exceptions,
    matrix,
    manufacturing,
  ] = await Promise.all([
    client
      .select()
      .from(designControlSteps)
      .where(eq(designControlSteps.recordId, record.id)),
    client
      .select()
      .from(designControlStructuredRecordVersions)
      .where(
        eq(
          designControlStructuredRecordVersions.designControlRecordId,
          record.id
        )
      ),
    client
      .select()
      .from(designControlRequirements)
      .where(eq(designControlRequirements.recordId, record.id)),
    client
      .select()
      .from(designControlRisks)
      .where(eq(designControlRisks.recordId, record.id)),
    client
      .select()
      .from(designControlReviews)
      .where(eq(designControlReviews.recordId, record.id)),
    client
      .select()
      .from(designControlVerification)
      .where(eq(designControlVerification.recordId, record.id)),
    client
      .select()
      .from(designControlValidation)
      .where(eq(designControlValidation.recordId, record.id)),
    client
      .select()
      .from(designControlReviewActions)
      .where(eq(designControlReviewActions.designControlRecordId, record.id)),
    client
      .select()
      .from(designControlChanges)
      .where(eq(designControlChanges.recordId, record.id)),
    client
      .select()
      .from(designControlFinalReviewExceptions)
      .where(
        and(
          eq(
            designControlFinalReviewExceptions.designControlRecordId,
            record.id
          ),
          eq(designControlFinalReviewExceptions.status, 'APPROVED')
        )
      ),
    calculateDesignControlTraceability(record.id, actor, client),
    getDesignManufacturingEvidence(
      { rdProjectId: record.rdProjectId, designControlRecordId: record.id },
      client
    ),
  ]);
  const byStep = new Map(steps.map((step) => [step.stepKey, step]));
  const current = currentVersions(versions);
  const approved = (rows: Array<{ id: string }>) =>
    rows.length > 0 &&
    rows.every((row) => current.get(row.id)?.lifecycleStatus === 'APPROVED');
  const href = (tab: string) =>
    `/design-control?project=${encodeURIComponent(record.rdProjectId!)}&record=${record.id}&workspaceTab=${tab}`;
  const categories: ReadinessCategory[] = [];
  const add = (
    key: string,
    label: string,
    complete: boolean,
    reason: string,
    owner: string,
    tab: string,
    blocked = false
  ) =>
    categories.push({
      key,
      label,
      status: complete ? 'COMPLETE' : blocked ? 'BLOCKED' : 'INCOMPLETE',
      reason: complete ? 'Authoritative evidence is complete.' : reason,
      owner,
      recordId: record.id,
      href: href(tab),
    });

  add(
    'project_intake',
    'Project Intake',
    byStep.get('1')?.status === 'approved',
    'Approve the Project Intake stage.',
    'Project Manager',
    'lifecycle'
  );
  add(
    'design_plan',
    'Approved Design Plan',
    byStep.get('2')?.status === 'approved',
    'Approve the Design Plan stage.',
    'Project Manager',
    'lifecycle'
  );
  add(
    'design_inputs',
    'Design Inputs',
    approved(requirements),
    'Create, submit, and approve every Design Input requirement.',
    'Design Authority',
    'evidence'
  );
  add(
    'requirements_review',
    'Requirements Review',
    byStep.get('4')?.status === 'approved',
    'Complete the authoritative Requirements Review.',
    'Design Authority',
    'lifecycle'
  );
  const unresolved = requirements.filter((item) => {
    const value = content(current.get(item.id));
    return (
      String(value.clarification ?? '').trim() &&
      !String(value.resolution ?? '').trim()
    );
  });
  add(
    'clarifications',
    'Open clarifications',
    unresolved.length === 0,
    `${unresolved.length} requirement clarification(s) lack resolution.`,
    'Requirement owner',
    'evidence'
  );
  add(
    'design_risks',
    'Design risks and residual acceptance',
    approved(risks),
    'Approve all risk records with verified mitigation and residual-risk acceptance.',
    'Quality',
    'evidence',
    risks.some((item) => current.get(item.id)?.lifecycleStatus === 'REJECTED')
  );
  const preliminary = reviews.filter(
    (item) =>
      String(content(current.get(item.id)).reviewType).toUpperCase() ===
      'PRELIMINARY'
  );
  add(
    'preliminary_review',
    'Preliminary Design Review',
    approved(preliminary),
    'Complete and approve a Preliminary Design Review.',
    'Design Authority',
    'evidence'
  );
  const openActions = actions.filter(
    (item) => item.mandatory && !['CLOSED', 'EXCEPTED'].includes(item.status)
  );
  add(
    'review_actions',
    'Review actions',
    openActions.length === 0,
    `${openActions.length} mandatory review action(s) remain open.`,
    'Action owner',
    'evidence',
    openActions.length > 0
  );
  add(
    'design_outputs',
    'Design Outputs',
    byStep.get('6')?.status === 'approved',
    'Approve the Design Outputs stage.',
    'Design Authority',
    'lifecycle'
  );
  add(
    'configuration',
    'Part and assembly configuration',
    manufacturing.ready,
    manufacturing.missingItems.join('; ') ||
      'Configuration evidence is incomplete.',
    'Engineering',
    'configuration',
    !manufacturing.ready
  );
  for (const source of manufacturing.sources) {
    add(
      `manufacturing_${source.key}`,
      source.label,
      source.ready,
      `${source.label} status is ${source.status}.`,
      'Engineering / Manufacturing',
      'configuration',
      !source.ready
    );
  }
  const verificationFailed = verification.some(
    (item) => content(current.get(item.id)).passFail === 'FAIL'
  );
  add(
    'verification',
    'Verification results',
    approved(verification) && !verificationFailed,
    verificationFailed
      ? 'Failed verification remains visible and requires authorized disposition.'
      : 'Approve requirement-level verification evidence.',
    'Quality',
    'evidence',
    verificationFailed
  );
  const validationRequired = requirements.some(
    (item) => content(current.get(item.id)).validationRequired === true
  );
  if (!validationRequired && validation.length === 0)
    categories.push({
      key: 'validation',
      label: 'Validation results',
      status: 'NOT_APPLICABLE',
      reason: 'No approved requirement currently requires validation.',
      owner: 'Design Authority',
      recordId: record.id,
      href: href('evidence'),
    });
  else
    add(
      'validation',
      'Validation results',
      approved(validation),
      'Approve intended-use validation evidence.',
      'Quality',
      'evidence'
    );
  const openChanges = changes.filter(
    (change) =>
      !['approved', 'implemented', 'closed'].includes(
        change.status.toLowerCase()
      )
  );
  add(
    'changes',
    'ECRs and ECNs',
    openChanges.length === 0,
    `${openChanges.length} linked engineering change(s) remain unapproved.`,
    'Change authority',
    'changes',
    openChanges.length > 0
  );
  add(
    'traceability',
    'Traceability matrix',
    matrix.totals.releaseReady,
    `${matrix.totals.requirements - matrix.totals.fullyTraced} requirement(s) are not fully traced.`,
    'Design Authority',
    'traceability',
    !matrix.totals.releaseReady
  );
  add(
    'dhf',
    'Design History File completeness',
    categories.filter(
      (item) => item.status === 'INCOMPLETE' || item.status === 'BLOCKED'
    ).length === 0,
    'The DHF source set is incomplete because authoritative lifecycle evidence remains open.',
    'Document Control',
    'dhf'
  );
  add('exceptions', 'Open exceptions', true, '', 'Quality', 'final-review');

  for (const exception of exceptions) {
    const category = categories.find(
      (item) => item.key === exception.requirementKey
    );
    if (category && category.status !== 'COMPLETE') {
      category.status = 'NOT_APPLICABLE';
      category.reason = `Approved exception: ${exception.justification}`;
      category.owner = exception.approvingAuthorityDisplayName;
      category.recordId = exception.id;
    }
  }
  const blocking = categories.filter(
    (item) => item.status === 'INCOMPLETE' || item.status === 'BLOCKED'
  );
  return {
    recordId: record.id,
    rdProjectId: record.rdProjectId,
    status: blocking.length === 0 ? 'COMPLETE' : 'BLOCKED',
    categories,
    blocking,
    exceptions,
    matrix,
    calculatedAt: new Date().toISOString(),
    source: 'AUTHORITATIVE_PERSISTED_RECORDS',
  };
}

export async function createFinalDesignReviewSnapshot(input: {
  recordId: string;
  reviewRecordId: string;
  reviewVersionId: string;
  actor: StructuredActor;
}) {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(designControlRecords)
      .where(eq(designControlRecords.id, input.recordId))
      .limit(1);
    if (!record?.rdProjectId)
      throw new DesignControlStructuredError(
        404,
        'DESIGN_CONTROL_RECORD_NOT_FOUND',
        'Design Control record was not found'
      );
    await assertStructuredProjectAccess(
      {
        rdProjectId: record.rdProjectId,
        actor: input.actor,
        action: 'APPROVE',
        recordType: 'REVIEW',
      },
      tx as unknown as typeof db
    );
    const [reviewVersion] = await tx
      .select()
      .from(designControlStructuredRecordVersions)
      .where(
        and(
          eq(designControlStructuredRecordVersions.id, input.reviewVersionId),
          eq(
            designControlStructuredRecordVersions.structuredRecordId,
            input.reviewRecordId
          ),
          eq(
            designControlStructuredRecordVersions.designControlRecordId,
            record.id
          ),
          eq(designControlStructuredRecordVersions.recordType, 'REVIEW'),
          eq(designControlStructuredRecordVersions.lifecycleStatus, 'APPROVED')
        )
      )
      .limit(1);
    if (
      !reviewVersion ||
      String(content(reviewVersion).reviewType).toUpperCase() !== 'FINAL'
    )
      throw new DesignControlStructuredError(
        409,
        'APPROVED_FINAL_REVIEW_REQUIRED',
        'An approved Final Design Review version is required'
      );
    const readiness = await calculateFinalDesignReviewReadiness(
      record.id,
      input.actor,
      tx as unknown as typeof db
    );
    if (readiness.status !== 'COMPLETE')
      throw new DesignControlStructuredError(
        422,
        'FINAL_DESIGN_REVIEW_BLOCKED',
        'Mandatory authoritative evidence is missing',
        { blockers: readiness.blocking }
      );
    const matrixChecksum = stableChecksum(readiness.matrix);
    const [traceSnapshot] = await tx
      .insert(designControlTraceabilitySnapshots)
      .values({
        rdProjectId: record.rdProjectId,
        designControlRecordId: record.id,
        matrixSnapshot: readiness.matrix,
        matrixChecksum,
        capturedByUserId: input.actor.id,
        capturedByDisplayName: input.actor.displayName,
      })
      .returning();
    const readinessChecksum = stableChecksum(readiness);
    const [snapshot] = await tx
      .insert(designControlFinalReviewSnapshots)
      .values({
        rdProjectId: record.rdProjectId,
        designControlRecordId: record.id,
        traceabilitySnapshotId: traceSnapshot.id,
        reviewRecordId: input.reviewRecordId,
        reviewVersionId: input.reviewVersionId,
        readinessStatus: 'COMPLETE',
        readinessSnapshot: readiness,
        readinessChecksum,
        approvedByUserId: input.actor.id,
        approvedByDisplayName: input.actor.displayName,
        approvedRoleSnapshot: input.actor.role,
      })
      .returning();
    return { snapshot, traceabilitySnapshot: traceSnapshot };
  });
}

export async function getLatestFinalReviewSnapshot(recordId: string) {
  const [snapshot] = await db
    .select()
    .from(designControlFinalReviewSnapshots)
    .where(
      eq(designControlFinalReviewSnapshots.designControlRecordId, recordId)
    )
    .orderBy(desc(designControlFinalReviewSnapshots.approvedAt))
    .limit(1);
  return snapshot ?? null;
}

export async function addFinalReviewException(input: {
  recordId: string;
  requirementKey: string;
  justification: string;
  risk: string;
  effectiveAt: string;
  expiresAt?: string;
  followUpAction?: string;
  actor: StructuredActor;
}) {
  if (
    ![
      input.requirementKey,
      input.justification,
      input.risk,
      input.effectiveAt,
    ].every((value) => value.trim())
  )
    throw new DesignControlStructuredError(
      400,
      'EXCEPTION_EVIDENCE_REQUIRED',
      'Exception category, justification, risk, and effectivity are required'
    );
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(designControlRecords)
      .where(eq(designControlRecords.id, input.recordId))
      .limit(1);
    if (!record?.rdProjectId)
      throw new DesignControlStructuredError(
        404,
        'DESIGN_CONTROL_RECORD_NOT_FOUND',
        'Design Control record was not found'
      );
    const access = await assertStructuredProjectAccess(
      {
        rdProjectId: record.rdProjectId,
        actor: input.actor,
        action: 'APPROVE',
        recordType: 'REVIEW',
      },
      tx as unknown as typeof db
    );
    const [exception] = await tx
      .insert(designControlFinalReviewExceptions)
      .values({
        rdProjectId: record.rdProjectId,
        designControlRecordId: record.id,
        requirementKey: input.requirementKey,
        justification: input.justification,
        riskStatement: input.risk,
        approvingAuthorityUserId: input.actor.id,
        approvingAuthorityDisplayName: input.actor.displayName,
        approvingRoleSnapshot:
          access.assignment?.projectRole ?? input.actor.role,
        effectiveAt: new Date(input.effectiveAt),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        followUpAction: input.followUpAction ?? null,
      })
      .returning();
    return exception;
  });
}
