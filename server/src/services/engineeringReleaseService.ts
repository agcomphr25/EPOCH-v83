import { createHash } from 'crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  designControlChanges,
  designControlRecords,
  designControlRequirements,
  designControlReviews,
  designControlRisks,
  designControlSteps,
  designControlValidation,
  designControlVerification,
  engineeringReleaseApprovals,
  engineeringReleaseBaselineItems,
  engineeringReleaseBaselines,
  engineeringReleases,
  rdProjects,
} from '../../schema';
import {
  getDesignManufacturingEvidence,
  type DesignManufacturingEvidence,
  type ManufacturingEvidenceSource,
} from './designManufacturingEvidenceService';

type DbClient = typeof db;
type DesignControlRecord = typeof designControlRecords.$inferSelect;
type DesignControlStep = typeof designControlSteps.$inferSelect;
type RdProject = typeof rdProjects.$inferSelect;
type EngineeringRelease = typeof engineeringReleases.$inferSelect;

type ReleaseContext = {
  record: DesignControlRecord;
  rdProject: RdProject | null;
  steps: DesignControlStep[];
  requirements: Array<typeof designControlRequirements.$inferSelect>;
  risks: Array<typeof designControlRisks.$inferSelect>;
  reviews: Array<typeof designControlReviews.$inferSelect>;
  verification: Array<typeof designControlVerification.$inferSelect>;
  validation: Array<typeof designControlValidation.$inferSelect>;
  changes: Array<typeof designControlChanges.$inferSelect>;
  manufacturingEvidence: DesignManufacturingEvidence;
};

export type EngineeringReleasePreview = {
  ready: boolean;
  rdProjectId: string | null;
  rdProjectName: string | null;
  productName: string;
  proposedReleaseRevision: string;
  releaseNumber: string;
  effectiveDate: string;
  requirementsSummary: string;
  riskSummary: string;
  prototypeIdentifier: string | null;
  bomRevision: string | null;
  drawingRevisions: string[];
  cadRevision: string | null;
  verificationStatus: string;
  validationStatus: string;
  designReviewStatus: string;
  manufacturingEvidenceStatus: string;
  approvers: Array<{ role: string; approved: boolean; approvedBy?: string | null; approvedAt?: string | null }>;
  missingEvidence: string[];
  baselineItems: EngineeringBaselineItemPreview[];
  changedSinceReleaseWarnings: string[];
  existingRelease?: {
    id: string;
    releaseNumber: string;
    releaseRevision: string;
    releaseStatus: string;
    releasedBy: string | null;
    releasedAt: string | null;
  } | null;
};

export type EngineeringBaselineItemPreview = {
  baselineCategory: string;
  sourceTable: string | null;
  sourceModule: string | null;
  sourceRecordId: string | null;
  sourceRevision: string | null;
  sourceStatus: string | null;
  sourceChecksum: string;
  immutableSnapshotId: string;
  metadata: Record<string, unknown>;
};

const requiredStepTitles: Record<string, string> = {
  '1': 'approved design project intake',
  '2': 'approved design plan',
  '3': 'approved design inputs',
  '4': 'approved requirements review',
  '5': 'acceptable design risks',
  '6': 'approved concept review',
  '7': 'approved detailed design outputs',
  '8': 'documented prototype build',
  '9': 'completed verification',
  '10': 'completed validation',
  '11': 'approved final design review',
};

const releaseApprovalLabels = [
  'engineering release approval',
  'quality release approval',
  'manufacturing release approval',
  'program manager release approval',
];

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function canonicalValue(values: unknown, label: string) {
  const record = jsonRecord(values);
  const target = normalizeKey(label);
  const found = Object.entries(record).find(([key]) => normalizeKey(key) === target);
  return found?.[1];
}

function textValue(values: unknown, labels: string[]) {
  for (const label of labels) {
    const value = canonicalValue(values, label);
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return null;
}

function approved(values: unknown, label: string) {
  return canonicalValue(values, label) === true;
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value, Object.keys(jsonRecord(value)).sort())).digest('hex');
}

function sourceTableFor(source: ManufacturingEvidenceSource) {
  if (source.key === 'released_bom') return 'draft_bom_drafts';
  if (source.sourceModule.includes('Engineering Controlled Revisions')) return 'engineering_controlled_revisions';
  return null;
}

function statusIsOpen(status: string | null | undefined) {
  const normalized = normalizeKey(status ?? '');
  return !['approved', 'closed', 'complete', 'completed', 'accepted', 'released', 'not applicable', 'resolved'].includes(normalized);
}

function severityIsHigh(value: unknown) {
  const normalized = normalizeKey(String(value ?? ''));
  return normalized.includes('high') || normalized.includes('critical') || normalized.includes('severe');
}

function riskIsBlocking(risk: typeof designControlRisks.$inferSelect) {
  const formData = jsonRecord(risk.formData);
  const metadata = jsonRecord(risk.metadata);
  const severity = formData.severity ?? formData.Severity ?? metadata.severity ?? metadata.Severity;
  return severityIsHigh(severity) && statusIsOpen(risk.status);
}

function sourceBaselineItem(source: ManufacturingEvidenceSource): EngineeringBaselineItemPreview {
  const metadata = {
    key: source.key,
    label: source.label,
    explanation: source.explanation,
    ready: source.ready,
    sourceAvailable: source.sourceAvailable,
    approvedBy: source.approvedBy ?? null,
    approvedAt: source.approvedAt ?? null,
    releasedBy: source.releasedBy ?? null,
    releasedAt: source.releasedAt ?? null,
    updatedAt: source.updatedAt ?? null,
    missingItems: source.missingItems,
    applicability: source.applicability ?? null,
  };
  const snapshot = {
    sourceTable: sourceTableFor(source),
    sourceModule: source.sourceModule,
    sourceRecordId: source.recordId ?? null,
    sourceRevision: source.revision ?? null,
    sourceStatus: source.status,
    metadata,
  };
  const checksum = stableHash(snapshot);
  return {
    baselineCategory: source.key,
    sourceTable: sourceTableFor(source),
    sourceModule: source.sourceModule,
    sourceRecordId: source.recordId ?? null,
    sourceRevision: source.revision ?? null,
    sourceStatus: source.status,
    sourceChecksum: checksum,
    immutableSnapshotId: `sha256:${checksum}`,
    metadata,
  };
}

function collectApprovers(step12: DesignControlStep | undefined) {
  const approvals = jsonRecord(step12?.approvals);
  return releaseApprovalLabels.map((label) => ({
    role: label,
    approved: approved(approvals, label),
    approvedBy: textValue(step12?.metadata, [`${label} by`, 'approvedBy']) ?? null,
    approvedAt: step12?.approvedAt ? step12.approvedAt.toISOString() : null,
  }));
}

function proposedRevision(record: DesignControlRecord, step12: DesignControlStep | undefined) {
  return textValue(step12?.formData, ['Release revision', 'Locked design revision baseline', 'Configuration baseline'])
    ?? textValue(record.metadata, ['releaseRevision', 'release_revision'])
    ?? 'A';
}

function productName(record: DesignControlRecord, rdProject: RdProject | null, step1?: DesignControlStep, step12?: DesignControlStep) {
  return textValue(step1?.formData, ['Product name'])
    ?? textValue(step12?.formData, ['Product name'])
    ?? rdProject?.projectName
    ?? record.title;
}

function buildBaselineItems(context: ReleaseContext): EngineeringBaselineItemPreview[] {
  const stepItems = context.steps.map((step) => {
    const snapshot = {
      stepKey: step.stepKey,
      title: step.title,
      status: step.status,
      formData: step.formData,
      approvals: step.approvals,
      approvedAt: step.approvedAt,
      updatedAt: step.updatedAt,
    };
    const checksum = stableHash(snapshot);
    return {
      baselineCategory: `design_step_${step.stepKey}`,
      sourceTable: 'design_control_steps',
      sourceModule: 'Design Control',
      sourceRecordId: step.id,
      sourceRevision: step.stepKey,
      sourceStatus: step.status,
      sourceChecksum: checksum,
      immutableSnapshotId: `sha256:${checksum}`,
      metadata: snapshot,
    };
  });

  return [
    ...stepItems,
    ...context.manufacturingEvidence.sources.map(sourceBaselineItem),
  ];
}

function changedWarningsFromRelease(
  release: EngineeringRelease | null,
  currentBaselineItems: EngineeringBaselineItemPreview[]
) {
  const previousItems = Array.isArray(release?.sourceEvidenceSnapshot?.baselineItems)
    ? release!.sourceEvidenceSnapshot.baselineItems as EngineeringBaselineItemPreview[]
    : [];
  const previousByCategory = new Map(previousItems.map((item) => [item.baselineCategory, item]));
  return currentBaselineItems.flatMap((item) => {
    const previous = previousByCategory.get(item.baselineCategory);
    if (!previous || previous.sourceChecksum === item.sourceChecksum) return [];
    return `${item.baselineCategory}: Changed since release`;
  });
}

async function loadContext(recordId: string, client: DbClient = db): Promise<ReleaseContext | null> {
  const [record] = await client.select().from(designControlRecords).where(eq(designControlRecords.id, recordId)).limit(1);
  if (!record) return null;

  const [rdProject] = record.rdProjectId
    ? await client.select().from(rdProjects).where(eq(rdProjects.id, record.rdProjectId)).limit(1)
    : [];

  const [
    steps,
    requirements,
    risks,
    reviews,
    verification,
    validation,
    changes,
    manufacturingEvidence,
  ] = await Promise.all([
    client.select().from(designControlSteps).where(eq(designControlSteps.recordId, record.id)),
    client.select().from(designControlRequirements).where(eq(designControlRequirements.recordId, record.id)),
    client.select().from(designControlRisks).where(eq(designControlRisks.recordId, record.id)),
    client.select().from(designControlReviews).where(eq(designControlReviews.recordId, record.id)),
    client.select().from(designControlVerification).where(eq(designControlVerification.recordId, record.id)),
    client.select().from(designControlValidation).where(eq(designControlValidation.recordId, record.id)),
    client.select().from(designControlChanges).where(eq(designControlChanges.recordId, record.id)),
    getDesignManufacturingEvidence({ rdProjectId: record.rdProjectId, designControlRecordId: record.id }, client),
  ]);

  return {
    record,
    rdProject: rdProject ?? null,
    steps,
    requirements,
    risks,
    reviews,
    verification,
    validation,
    changes,
    manufacturingEvidence,
  };
}

export function buildEngineeringReleasePreviewFromContext(
  context: ReleaseContext,
  existingRelease: EngineeringRelease | null = null
): EngineeringReleasePreview {
  const byStep = new Map(context.steps.map((step) => [step.stepKey, step]));
  const step12 = byStep.get('12');
  const missingEvidence: string[] = [];

  for (const [stepKey, label] of Object.entries(requiredStepTitles)) {
    if (byStep.get(stepKey)?.status !== 'approved') {
      missingEvidence.push(label);
    }
  }

  const blockingRisks = context.risks.filter(riskIsBlocking);
  if (blockingRisks.length > 0) {
    missingEvidence.push(`open high risk: ${blockingRisks.map((risk) => risk.title ?? risk.riskKey ?? risk.id).join(', ')}`);
  }

  const openChanges = context.changes.filter((change) => statusIsOpen(change.status));
  if (openChanges.length > 0) {
    missingEvidence.push(`engineering changes not dispositioned: ${openChanges.map((change) => change.title ?? change.changeKey ?? change.id).join(', ')}`);
  }

  if (!context.manufacturingEvidence.ready) {
    missingEvidence.push(...context.manufacturingEvidence.missingItems.map((item) => `manufacturing-source evidence: ${item}`));
  }

  const baselineLocked = context.manufacturingEvidence.sources.some((source) => (
    source.key === 'design_revision_baseline_locked' && source.ready
  )) || Boolean(textValue(step12?.formData, ['Locked design revision baseline']));
  if (!baselineLocked) {
    missingEvidence.push('locked configuration baseline');
  }

  const approvers = collectApprovers(step12);
  missingEvidence.push(...approvers.filter((approval) => !approval.approved).map((approval) => approval.role));

  const baselineItems = buildBaselineItems(context);
  const releasedBom = context.manufacturingEvidence.sources.find((source) => source.key === 'released_bom');
  const drawings = context.manufacturingEvidence.sources.filter((source) => source.key === 'released_drawings' && source.revision);
  const cad = context.manufacturingEvidence.sources.find((source) => source.key === 'released_cad');

  return {
    ready: missingEvidence.length === 0,
    rdProjectId: context.record.rdProjectId,
    rdProjectName: context.rdProject?.projectName ?? null,
    productName: productName(context.record, context.rdProject, byStep.get('1'), step12),
    proposedReleaseRevision: proposedRevision(context.record, step12),
    releaseNumber: `ER-${context.record.rdProjectId ?? context.record.id}-${proposedRevision(context.record, step12)}`,
    effectiveDate: new Date().toISOString().slice(0, 10),
    requirementsSummary: `${context.requirements.length} persisted requirement record(s); step 3 is ${byStep.get('3')?.status ?? 'missing'}.`,
    riskSummary: blockingRisks.length > 0 ? `${blockingRisks.length} open high risk item(s)` : 'No open high risk items detected.',
    prototypeIdentifier: textValue(byStep.get('8')?.formData, ['Prototype serial number', 'Prototype identifier']),
    bomRevision: releasedBom?.revision ?? null,
    drawingRevisions: drawings.map((source) => source.revision!).filter(Boolean),
    cadRevision: cad?.revision ?? null,
    verificationStatus: byStep.get('9')?.status ?? 'missing',
    validationStatus: byStep.get('10')?.status ?? 'missing',
    designReviewStatus: byStep.get('11')?.status ?? 'missing',
    manufacturingEvidenceStatus: context.manufacturingEvidence.overallStatus,
    approvers,
    missingEvidence,
    baselineItems,
    changedSinceReleaseWarnings: changedWarningsFromRelease(existingRelease, baselineItems),
    existingRelease: existingRelease
      ? {
        id: existingRelease.id,
        releaseNumber: existingRelease.releaseNumber,
        releaseRevision: existingRelease.releaseRevision,
        releaseStatus: existingRelease.releaseStatus,
        releasedBy: existingRelease.releasedBy,
        releasedAt: existingRelease.releasedAt ? existingRelease.releasedAt.toISOString() : null,
      }
      : null,
  };
}

export async function getEngineeringReleasePreview(recordId: string, client: DbClient = db) {
  const context = await loadContext(recordId, client);
  if (!context) return null;
  const releaseRevision = proposedRevision(context.record, context.steps.find((step) => step.stepKey === '12'));
  const [existingRelease] = context.record.rdProjectId
    ? await client
      .select()
      .from(engineeringReleases)
      .where(and(
        eq(engineeringReleases.rdProjectId, context.record.rdProjectId),
        eq(engineeringReleases.designControlRecordId, context.record.id),
        eq(engineeringReleases.releaseRevision, releaseRevision)
      ))
      .limit(1)
    : [];
  return buildEngineeringReleasePreviewFromContext(context, existingRelease ?? null);
}

export async function submitEngineeringRelease(input: {
  recordId: string;
  actor: string;
  effectiveDate?: string | null;
}, client: DbClient = db) {
  return client.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM design_control_records WHERE id = ${input.recordId} FOR UPDATE`);
    const context = await loadContext(input.recordId, tx as DbClient);
    if (!context) return { status: 'not_found' as const };
    if (!context.record.rdProjectId) {
      return {
        status: 'blocked' as const,
        missingEvidence: ['Design Control record is not linked to an R&D project'],
      };
    }

    const preview = buildEngineeringReleasePreviewFromContext(context);
    const [existingRelease] = await tx
      .select()
      .from(engineeringReleases)
      .where(and(
        eq(engineeringReleases.rdProjectId, context.record.rdProjectId),
        eq(engineeringReleases.designControlRecordId, context.record.id),
        eq(engineeringReleases.releaseRevision, preview.proposedReleaseRevision)
      ))
      .limit(1);

    if (existingRelease) {
      return {
        status: 'existing' as const,
        release: existingRelease,
        preview: buildEngineeringReleasePreviewFromContext(context, existingRelease),
      };
    }

    if (!preview.ready) {
      return {
        status: 'blocked' as const,
        missingEvidence: preview.missingEvidence,
        preview,
      };
    }

    const now = new Date();
    const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : now;
    const [release] = await tx.insert(engineeringReleases).values({
      rdProjectId: context.record.rdProjectId,
      designControlRecordId: context.record.id,
      releaseNumber: preview.releaseNumber,
      releaseRevision: preview.proposedReleaseRevision,
      releaseStatus: 'RELEASED',
      productName: preview.productName,
      effectiveDate,
      releasedBy: input.actor,
      releasedAt: now,
      readinessSnapshot: preview as unknown as Record<string, unknown>,
      sourceEvidenceSnapshot: {
        manufacturingEvidence: context.manufacturingEvidence,
        baselineItems: preview.baselineItems,
      },
      approvalSnapshot: { approvers: preview.approvers },
      metadata: {
        source: 'engineering-release-gate',
        nextAction: 'Create Manufactured Inventory Item',
      },
    }).returning();

    const [baseline] = await tx.insert(engineeringReleaseBaselines).values({
      engineeringReleaseId: release.id,
      rdProjectId: context.record.rdProjectId,
      designControlRecordId: context.record.id,
      baselineStatus: 'LOCKED',
      baselineRevision: preview.proposedReleaseRevision,
      lockedAt: now,
      lockedBy: input.actor,
      metadata: {
        releaseNumber: release.releaseNumber,
        immutable: true,
      },
    }).returning();

    for (const item of preview.baselineItems) {
      await tx.insert(engineeringReleaseBaselineItems).values({
        engineeringReleaseId: release.id,
        baselineId: baseline.id,
        baselineCategory: item.baselineCategory,
        sourceTable: item.sourceTable,
        sourceModule: item.sourceModule,
        sourceRecordId: item.sourceRecordId,
        sourceRevision: item.sourceRevision,
        sourceStatus: item.sourceStatus,
        sourceChecksum: item.sourceChecksum,
        immutableSnapshotId: item.immutableSnapshotId,
        metadata: item.metadata,
      });
    }

    for (const approval of preview.approvers) {
      await tx.insert(engineeringReleaseApprovals).values({
        engineeringReleaseId: release.id,
        approvalRole: approval.role,
        approvedBy: approval.approvedBy ?? input.actor,
        approvedAt: approval.approvedAt ? new Date(approval.approvedAt) : now,
        approvalStatus: 'APPROVED',
        metadata: approval,
      }).onConflictDoNothing();
    }

    await tx
      .update(designControlSteps)
      .set({ status: 'approved', approvedAt: now, updatedAt: now })
      .where(and(eq(designControlSteps.recordId, context.record.id), eq(designControlSteps.stepKey, '12')));

    await tx
      .update(designControlRecords)
      .set({ status: 'engineering_released', releasedAt: now, updatedAt: now })
      .where(eq(designControlRecords.id, context.record.id));

    await tx
      .update(rdProjects)
      .set({ status: 'released', engineeringStatus: 'RELEASED', updatedAt: now })
      .where(eq(rdProjects.id, context.record.rdProjectId));

    return {
      status: 'created' as const,
      release,
      baseline,
      preview: {
        ...preview,
        changedSinceReleaseWarnings: [],
      },
    };
  });
}

export async function listEngineeringReleasesForRdProject(rdProjectId: string, client: DbClient = db) {
  return client
    .select()
    .from(engineeringReleases)
    .where(eq(engineeringReleases.rdProjectId, rdProjectId))
    .orderBy(desc(engineeringReleases.releasedAt), desc(engineeringReleases.createdAt));
}
