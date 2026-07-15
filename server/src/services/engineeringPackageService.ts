import { createHash } from 'crypto';
import { desc, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  engineeringPackageItems,
  engineeringPackages,
  engineeringReleaseBaselineItems,
  engineeringReleaseBaselines,
  engineeringReleases,
} from '../../schema';

type DbClient = typeof db;
type EngineeringRelease = typeof engineeringReleases.$inferSelect;
type EngineeringBaseline = typeof engineeringReleaseBaselines.$inferSelect;
type EngineeringBaselineItem = typeof engineeringReleaseBaselineItems.$inferSelect;
type EngineeringPackage = typeof engineeringPackages.$inferSelect;

export type EngineeringPackageContentItem = {
  category: string;
  label: string;
  sourceTable: string | null;
  sourceModule: string | null;
  sourceRecordId: string | null;
  sourceRevision: string | null;
  sourceStatus: string | null;
  baselineItemId: string | null;
  sourceChecksum: string | null;
  required: boolean;
  present: boolean;
};

export type EngineeringPackagePreview = {
  ready: boolean;
  releaseInformation: {
    id: string;
    rdProjectId: string;
    designControlRecordId: string;
    releaseNumber: string;
    releaseRevision: string;
    releaseStatus: string;
    productName: string;
    releasedBy: string | null;
    releasedAt: string | null;
  } | null;
  packageCompleteness: {
    status: 'READY' | 'BLOCKED' | 'NOT_RELEASED' | 'MISSING_BASELINE';
    requiredCount: number;
    presentRequiredCount: number;
    totalContentCount: number;
  };
  documentSummary: {
    controlledDocumentCount: number;
    drawingCount: number;
    cadCount: number;
    specificationCount: number;
  };
  bomSummary: {
    revision: string | null;
    sourceRecordId: string | null;
    status: string | null;
  };
  revisionSummary: Array<{
    category: string;
    revision: string | null;
    sourceRecordId: string | null;
    status: string | null;
  }>;
  missingEngineeringDocuments: string[];
  missingControlledRecords: string[];
  contents: EngineeringPackageContentItem[];
  existingPackage?: {
    id: string;
    packageNumber: string;
    packageRevision: string;
    packageStatus: string;
    lockedBy: string | null;
    lockedAt: string | null;
  } | null;
};

const packageDefinitions = [
  { category: 'rd_project', label: 'R&D Project', required: true },
  { category: 'engineering_release', label: 'Engineering Release', required: true },
  { category: 'configuration_baseline', label: 'Configuration Baseline', required: true },
  { category: 'released_bom', label: 'Engineering BOM', required: true },
  { category: 'released_cad', label: 'Controlled CAD', required: true },
  { category: 'released_drawings', label: 'Controlled Drawings', required: true },
  { category: 'specifications', label: 'Specifications', required: false },
  { category: 'prototype_reference', label: 'Prototype reference', required: true },
  { category: 'verification', label: 'Verification evidence', required: true },
  { category: 'validation', label: 'Validation evidence', required: true },
  { category: 'design_reviews', label: 'Engineering Review approvals', required: true },
  { category: 'engineering_changes', label: 'Engineering Changes', required: true },
  { category: 'requirements', label: 'Requirements', required: true },
  { category: 'risks', label: 'Risks', required: true },
  { category: 'critical_characteristics', label: 'Critical Characteristics', required: false },
  { category: 'special_processes', label: 'Special Processes', required: false },
  { category: 'approved_inspection_plan', label: 'Inspection Requirements', required: true },
  { category: 'required_certifications_identified', label: 'Certification Requirements', required: true },
  { category: 'packaging_shipping_requirements_defined', label: 'Packaging Requirements', required: true },
  { category: 'manufacturing_notes', label: 'Manufacturing Notes', required: false },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function stableHash(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function statusIsControlled(status: string | null | undefined) {
  const normalized = normalizeKey(status ?? '');
  return ['approved', 'closed', 'complete', 'completed', 'accepted', 'released', 'not applicable', 'resolved', 'controlled', 'locked'].includes(normalized);
}

function packageNumberForRelease(release: EngineeringRelease) {
  return `TDP-${release.releaseNumber.replace(/[^A-Za-z0-9-]+/g, '-')}`;
}

function baselineCategoryForPackageCategory(category: string) {
  if (category === 'configuration_baseline') return 'design_revision_baseline_locked';
  if (category === 'prototype_reference') return 'design_step_8';
  return category;
}

function categoryMatchesPackageItem(item: EngineeringBaselineItem, category: string) {
  const baselineCategory = baselineCategoryForPackageCategory(category);
  if (item.baselineCategory === baselineCategory) return true;
  if (category === 'specifications') {
    return item.sourceModule?.toLowerCase().includes('spec') || item.baselineCategory.includes('spec');
  }
  if (category === 'critical_characteristics') {
    return item.baselineCategory.includes('critical') || stableStringify(item.immutableSnapshot).toLowerCase().includes('critical characteristic');
  }
  if (category === 'special_processes') {
    return item.baselineCategory.includes('special_process') || stableStringify(item.immutableSnapshot).toLowerCase().includes('special process');
  }
  if (category === 'manufacturing_notes') {
    return item.baselineCategory === 'design_step_12' || stableStringify(item.immutableSnapshot).toLowerCase().includes('manufacturing notes');
  }
  return false;
}

function itemPresent(item: EngineeringBaselineItem | undefined, required: boolean) {
  if (!item) return false;
  if (!required) return true;
  if (!statusIsControlled(item.sourceStatus)) return false;
  return Boolean(item.sourceRecordId || item.sourceChecksum);
}

function toContentItem(definition: typeof packageDefinitions[number], item?: EngineeringBaselineItem): EngineeringPackageContentItem {
  const present = itemPresent(item, definition.required);
  return {
    category: definition.category,
    label: definition.label,
    sourceTable: item?.sourceTable ?? null,
    sourceModule: item?.sourceModule ?? null,
    sourceRecordId: item?.sourceRecordId ?? null,
    sourceRevision: item?.sourceRevision ?? null,
    sourceStatus: item?.sourceStatus ?? null,
    baselineItemId: item?.id ?? null,
    sourceChecksum: item?.sourceChecksum ?? null,
    required: definition.required,
    present,
  };
}

function existingPackageSummary(pkg: EngineeringPackage | null | undefined) {
  if (!pkg) return null;
  return {
    id: pkg.id,
    packageNumber: pkg.packageNumber,
    packageRevision: pkg.packageRevision,
    packageStatus: pkg.packageStatus,
    lockedBy: pkg.lockedBy,
    lockedAt: pkg.lockedAt ? pkg.lockedAt.toISOString() : null,
  };
}

export function buildEngineeringPackagePreviewFromRecords(input: {
  release: EngineeringRelease | null;
  baseline: EngineeringBaseline | null;
  baselineItems: EngineeringBaselineItem[];
  existingPackage?: EngineeringPackage | null;
}): EngineeringPackagePreview {
  const { release, baseline, baselineItems, existingPackage = null } = input;
  const contents = packageDefinitions.map((definition) => {
    if (definition.category === 'engineering_release') {
      return {
        category: definition.category,
        label: definition.label,
        sourceTable: 'engineering_releases',
        sourceModule: 'Engineering Release',
        sourceRecordId: release?.id ?? null,
        sourceRevision: release?.releaseRevision ?? null,
        sourceStatus: release?.releaseStatus ?? null,
        baselineItemId: null,
        sourceChecksum: release ? `sha256:${stableHash({
          id: release.id,
          releaseNumber: release.releaseNumber,
          releaseRevision: release.releaseRevision,
          releaseStatus: release.releaseStatus,
          releasedAt: release.releasedAt,
        })}` : null,
        required: definition.required,
        present: Boolean(release && ['RELEASED', 'APPROVED'].includes(release.releaseStatus.toUpperCase())),
      };
    }
    const item = baselineItems.find((candidate) => categoryMatchesPackageItem(candidate, definition.category));
    return toContentItem(definition, item);
  });

  const missingEngineeringDocuments = contents
    .filter((item) => item.required && ['released_bom', 'released_cad', 'released_drawings', 'approved_inspection_plan'].includes(item.category) && !item.present)
    .map((item) => item.label);
  const missingControlledRecords = contents
    .filter((item) => item.required && !item.present && !missingEngineeringDocuments.includes(item.label))
    .map((item) => item.label);

  const requiredCount = contents.filter((item) => item.required).length;
  const presentRequiredCount = contents.filter((item) => item.required && item.present).length;
  const releaseApproved = release ? ['RELEASED', 'APPROVED'].includes(release.releaseStatus.toUpperCase()) : false;
  const baselineLocked = baseline ? baseline.baselineStatus.toUpperCase() === 'LOCKED' : false;
  const ready = Boolean(releaseApproved && baselineLocked && presentRequiredCount === requiredCount);
  const releasedBom = contents.find((item) => item.category === 'released_bom');
  const drawings = contents.filter((item) => item.category === 'released_drawings' && item.present);
  const cad = contents.find((item) => item.category === 'released_cad');
  const specs = contents.filter((item) => item.category === 'specifications' && item.present);
  const status: EngineeringPackagePreview['packageCompleteness']['status'] = !releaseApproved
    ? 'NOT_RELEASED'
    : !baselineLocked
      ? 'MISSING_BASELINE'
      : ready
        ? 'READY'
        : 'BLOCKED';

  return {
    ready,
    releaseInformation: release
      ? {
        id: release.id,
        rdProjectId: release.rdProjectId,
        designControlRecordId: release.designControlRecordId,
        releaseNumber: release.releaseNumber,
        releaseRevision: release.releaseRevision,
        releaseStatus: release.releaseStatus,
        productName: release.productName,
        releasedBy: release.releasedBy,
        releasedAt: release.releasedAt ? release.releasedAt.toISOString() : null,
      }
      : null,
    packageCompleteness: {
      status,
      requiredCount,
      presentRequiredCount,
      totalContentCount: contents.length,
    },
    documentSummary: {
      controlledDocumentCount: contents.filter((item) => item.present && item.sourceTable === 'engineering_controlled_revisions').length,
      drawingCount: drawings.length,
      cadCount: cad?.present ? 1 : 0,
      specificationCount: specs.length,
    },
    bomSummary: {
      revision: releasedBom?.sourceRevision ?? null,
      sourceRecordId: releasedBom?.sourceRecordId ?? null,
      status: releasedBom?.sourceStatus ?? null,
    },
    revisionSummary: contents
      .filter((item) => item.present && (item.sourceRevision || item.sourceRecordId))
      .map((item) => ({
        category: item.category,
        revision: item.sourceRevision,
        sourceRecordId: item.sourceRecordId,
        status: item.sourceStatus,
      })),
    missingEngineeringDocuments,
    missingControlledRecords,
    contents,
    existingPackage: existingPackageSummary(existingPackage),
  };
}

export function buildEngineeringPackageSnapshot(input: {
  release: EngineeringRelease;
  baseline: EngineeringBaseline;
  preview: EngineeringPackagePreview;
}) {
  const contents = jsonClone(input.preview.contents);
  const documentSummary = jsonClone(input.preview.documentSummary);
  const bomSummary = jsonClone(input.preview.bomSummary);
  const revisionSummary = jsonClone(input.preview.revisionSummary);
  const missingEngineeringDocuments = jsonClone(input.preview.missingEngineeringDocuments);
  const missingControlledRecords = jsonClone(input.preview.missingControlledRecords);
  const snapshot = {
    packageKind: 'Engineering Package / Technical Data Package',
    generatedFrom: 'engineering_release',
    release: jsonClone(input.preview.releaseInformation),
    baseline: {
      id: input.baseline.id,
      revision: input.baseline.baselineRevision,
      status: input.baseline.baselineStatus,
      lockedAt: input.baseline.lockedAt,
      lockedBy: input.baseline.lockedBy,
    },
    contents,
    documentSummary,
    bomSummary,
    revisionSummary,
    missingEngineeringDocuments,
    missingControlledRecords,
    digitalThread: {
      rdProjectId: input.release.rdProjectId,
      engineeringReleaseId: input.release.id,
      designControlRecordId: input.release.designControlRecordId,
      requirementRefs: contents.filter((item) => item.category === 'requirements').map((item) => item.sourceRecordId),
      riskRefs: contents.filter((item) => item.category === 'risks').map((item) => item.sourceRecordId),
      reviewRefs: contents.filter((item) => item.category === 'design_reviews').map((item) => item.sourceRecordId),
      verificationRefs: contents.filter((item) => item.category === 'verification').map((item) => item.sourceRecordId),
      validationRefs: contents.filter((item) => item.category === 'validation').map((item) => item.sourceRecordId),
      bomRefs: contents.filter((item) => item.category === 'released_bom').map((item) => item.sourceRecordId),
      cadRefs: contents.filter((item) => item.category === 'released_cad').map((item) => item.sourceRecordId),
      drawingRefs: contents.filter((item) => item.category === 'released_drawings').map((item) => item.sourceRecordId),
    },
  };
  return {
    ...snapshot,
    snapshotChecksum: `sha256:${stableHash(snapshot)}`,
  };
}

async function loadReleasePackageRecords(releaseId: string, client: DbClient = db) {
  const [release] = await client.select().from(engineeringReleases).where(eq(engineeringReleases.id, releaseId)).limit(1);
  if (!release) return null;

  const [baseline] = await client
    .select()
    .from(engineeringReleaseBaselines)
    .where(eq(engineeringReleaseBaselines.engineeringReleaseId, release.id))
    .orderBy(desc(engineeringReleaseBaselines.lockedAt), desc(engineeringReleaseBaselines.createdAt))
    .limit(1);
  const baselineItems = baseline
    ? await client
      .select()
      .from(engineeringReleaseBaselineItems)
      .where(eq(engineeringReleaseBaselineItems.baselineId, baseline.id))
    : [];
  const [existingPackage] = await client
    .select()
    .from(engineeringPackages)
    .where(eq(engineeringPackages.engineeringReleaseId, release.id))
    .limit(1);

  return {
    release,
    baseline: baseline ?? null,
    baselineItems,
    existingPackage: existingPackage ?? null,
  };
}

export async function getEngineeringPackagePreview(releaseId: string, client: DbClient = db) {
  const records = await loadReleasePackageRecords(releaseId, client);
  if (!records) return null;
  return buildEngineeringPackagePreviewFromRecords(records);
}

export async function generateEngineeringPackage(input: {
  releaseId: string;
  actor: string;
}, client: DbClient = db) {
  return client.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM engineering_releases WHERE id = ${input.releaseId} FOR UPDATE`);
    const records = await loadReleasePackageRecords(input.releaseId, tx as DbClient);
    if (!records) return { status: 'not_found' as const };
    if (!records.baseline) {
      return {
        status: 'blocked' as const,
        missingItems: ['Engineering baseline is missing'],
        preview: buildEngineeringPackagePreviewFromRecords(records),
      };
    }

    const preview = buildEngineeringPackagePreviewFromRecords(records);
    if (records.existingPackage) {
      return {
        status: 'existing' as const,
        package: records.existingPackage,
        preview,
      };
    }
    if (!preview.ready) {
      return {
        status: 'blocked' as const,
        missingItems: [...preview.missingEngineeringDocuments, ...preview.missingControlledRecords],
        preview,
      };
    }

    const now = new Date();
    const packageSnapshot = buildEngineeringPackageSnapshot({
      release: records.release,
      baseline: records.baseline,
      preview,
    });
    const packageNumber = packageNumberForRelease(records.release);
    const [createdPackage] = await tx.insert(engineeringPackages).values({
      engineeringReleaseId: records.release.id,
      engineeringBaselineId: records.baseline.id,
      rdProjectId: records.release.rdProjectId,
      designControlRecordId: records.release.designControlRecordId,
      packageNumber,
      packageRevision: records.release.releaseRevision,
      packageStatus: 'LOCKED',
      productName: records.release.productName,
      lockedAt: now,
      lockedBy: input.actor,
      packageSnapshot,
      completenessSnapshot: preview.packageCompleteness,
      contentsSummary: {
        contents: preview.contents,
        documentSummary: preview.documentSummary,
        bomSummary: preview.bomSummary,
        revisionSummary: preview.revisionSummary,
      },
      metadata: {
        source: 'engineering-release-package',
        nextAction: 'Create Manufactured Inventory Item',
        createsManufacturedInventoryItem: false,
      },
    }).returning();

    for (const item of preview.contents) {
      await tx.insert(engineeringPackageItems).values({
        engineeringPackageId: createdPackage.id,
        engineeringReleaseId: records.release.id,
        engineeringBaselineItemId: item.baselineItemId,
        packageCategory: item.category,
        sourceTable: item.sourceTable,
        sourceModule: item.sourceModule,
        sourceRecordId: item.sourceRecordId,
        sourceRevision: item.sourceRevision,
        sourceStatus: item.sourceStatus,
        referenceSnapshot: {
          label: item.label,
          required: item.required,
          present: item.present,
          baselineItemId: item.baselineItemId,
        },
        sourceChecksum: item.sourceChecksum,
        metadata: item,
      });
    }

    return {
      status: 'created' as const,
      package: createdPackage,
      preview: {
        ...preview,
        existingPackage: existingPackageSummary(createdPackage),
      },
    };
  });
}

export const engineeringPackageTestInternals = {
  buildEngineeringPackagePreviewFromRecords,
  buildEngineeringPackageSnapshot,
  packageNumberForRelease,
};
