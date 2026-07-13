import { desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  designControlRequirementApplicability,
  draftBomDrafts,
  engineeringControlledRevisions,
  rdProjects,
} from '../../schema';

export type ManufacturingEvidenceStatus =
  | 'NOT_CONFIGURED'
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'RELEASED'
  | 'BLOCKED'
  | 'NOT_APPLICABLE';

export type ManufacturingEvidenceSource = {
  key: string;
  label: string;
  sourceModule: string;
  managedBy: 'SOURCE_MODULE' | 'DESIGN_CONTROL';
  sourceAvailable: boolean;
  status: ManufacturingEvidenceStatus;
  ready: boolean;
  recordId?: string | null;
  revision?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  releasedBy?: string | null;
  releasedAt?: string | null;
  updatedAt?: string | null;
  openUrl?: string | null;
  explanation: string;
  missingItems: string[];
  applicability?: {
    applicable: boolean;
    justification?: string | null;
    approvedBy?: string | null;
    approvedRole?: string | null;
    approvedAt?: string | null;
    approved: boolean;
  };
};

export type DesignManufacturingEvidence = {
  rdProjectId: string | null;
  designControlRecordId: string;
  overallStatus: ManufacturingEvidenceStatus;
  ready: boolean;
  missingItems: string[];
  sources: ManufacturingEvidenceSource[];
};

type DraftBom = typeof draftBomDrafts.$inferSelect;
type RdProject = typeof rdProjects.$inferSelect;
type ControlledRevision = typeof engineeringControlledRevisions.$inferSelect;
type ApplicabilityRecord = typeof designControlRequirementApplicability.$inferSelect;

type EvidenceBuilderInput = {
  rdProjectId: string | null;
  designControlRecordId: string;
  rdProject?: RdProject | null;
  draftBoms?: DraftBom[];
  controlledRevisions?: ControlledRevision[];
  applicability?: ApplicabilityRecord[];
};

export const canonicalManufacturingEvidenceRequirements = [
  {
    key: 'released_cad',
    label: 'released CAD',
    sourceModule: 'Engineering Controlled Revisions / CAD or SPEC',
    artifactTypes: ['SPEC'],
  },
  {
    key: 'released_drawings',
    label: 'released drawings',
    sourceModule: 'Engineering Controlled Revisions / Document Control',
    artifactTypes: ['SPEC'],
  },
  {
    key: 'released_bom',
    label: 'released BOM',
    sourceModule: 'Draft Builder BOM / BOM module',
    artifactTypes: ['BOM'],
  },
  {
    key: 'approved_routing',
    label: 'approved routing',
    sourceModule: 'Routing module',
    artifactTypes: ['ROUTING'],
  },
  {
    key: 'approved_traveler_requirement',
    label: 'approved traveler requirement',
    sourceModule: 'Traveler module',
    artifactTypes: ['TRAVELER_TEMPLATE'],
  },
  {
    key: 'approved_work_instructions',
    label: 'approved work instructions',
    sourceModule: 'Work Instructions module',
    artifactTypes: ['WORK_INSTRUCTION'],
  },
  {
    key: 'approved_inspection_plan',
    label: 'approved inspection plan',
    sourceModule: 'Inspection / QC module',
    artifactTypes: ['QC_FORM'],
  },
  {
    key: 'approved_test_procedure',
    label: 'approved test procedure',
    sourceModule: 'Verification / Test module',
    artifactTypes: ['QC_FORM', 'SPEC'],
  },
  {
    key: 'required_certifications_identified',
    label: 'required certifications identified',
    sourceModule: 'Certifications / Quality module',
    artifactTypes: [],
  },
  {
    key: 'supplier_requirements_flowed_down',
    label: 'supplier requirements flowed down',
    sourceModule: 'Supplier Quality / Procurement module',
    artifactTypes: [],
  },
  {
    key: 'material_requirements_approved',
    label: 'material requirements approved',
    sourceModule: 'Material / Inventory module',
    artifactTypes: [],
  },
  {
    key: 'tooling_and_fixtures_ready',
    label: 'tooling/fixtures ready',
    sourceModule: 'Manufacturing Engineering module',
    artifactTypes: [],
  },
  {
    key: 'cnc_programs_approved',
    label: 'CNC programs approved if applicable',
    sourceModule: 'CNC / Manufacturing module',
    artifactTypes: [],
  },
  {
    key: 'training_certifications_complete',
    label: 'training/certifications complete',
    sourceModule: 'Training module',
    artifactTypes: [],
  },
  {
    key: 'packaging_shipping_requirements_defined',
    label: 'packaging/shipping requirements defined',
    sourceModule: 'Shipping / Packaging module',
    artifactTypes: [],
  },
  {
    key: 'design_revision_baseline_locked',
    label: 'design revision baseline locked',
    sourceModule: 'Engineering Controlled Revisions / Revision baseline',
    artifactTypes: ['BOM', 'ROUTING', 'TRAVELER_TEMPLATE', 'WORK_INSTRUCTION', 'SPEC', 'QC_FORM'],
  },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function valueAtPath(data: Record<string, unknown>, path: string[]) {
  let current: unknown = data;
  for (const part of path) {
    if (!asRecord(current) || !(part in asRecord(current))) return undefined;
    current = asRecord(current)[part];
  }
  return current;
}

function firstString(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const direct = asString(data[key]);
    if (direct) return direct;
    const metadata = asString(valueAtPath(data, ['metadata', key]));
    if (metadata) return metadata;
    const release = asString(valueAtPath(data, ['release', key]));
    if (release) return release;
    const approval = asString(valueAtPath(data, ['approval', key]));
    if (approval) return approval;
  }
  return '';
}

function firstDateString(data: Record<string, unknown>, keys: string[]) {
  const raw = firstString(data, keys);
  if (raw) return raw;
  for (const key of keys) {
    const value = data[key] ?? valueAtPath(data, ['metadata', key]) ?? valueAtPath(data, ['release', key]) ?? valueAtPath(data, ['approval', key]);
    if (value instanceof Date) return value.toISOString();
  }
  return null;
}

function hasBooleanTrue(data: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => data[key] === true || valueAtPath(data, ['metadata', key]) === true || valueAtPath(data, ['release', key]) === true);
}

function statusFromReleaseState(state: string): ManufacturingEvidenceStatus {
  const normalized = state.toLowerCase();
  if (normalized.includes('released')) return 'RELEASED';
  if (normalized.includes('approved')) return 'APPROVED';
  if (normalized.includes('review')) return 'NEEDS_REVIEW';
  if (normalized.includes('draft') || normalized.includes('started')) return 'IN_PROGRESS';
  return 'IN_PROGRESS';
}

function releaseDetailsFromData(data: Record<string, unknown>) {
  const statusText = firstString(data, [
    'manufacturingReleaseStatus',
    'releaseStatus',
    'approvalStatus',
    'status',
    'state',
  ]);
  const status = hasBooleanTrue(data, ['manufacturingReleased', 'released', 'isReleased'])
    ? 'RELEASED'
    : hasBooleanTrue(data, ['approved', 'isApproved'])
      ? 'APPROVED'
      : statusText
        ? statusFromReleaseState(statusText)
        : 'IN_PROGRESS';

  return {
    status,
    approvedBy: firstString(data, ['approvedBy', 'approvalBy']) || null,
    approvedAt: firstDateString(data, ['approvedAt', 'approvalAt']),
    releasedBy: firstString(data, ['releasedBy', 'releaseBy']) || null,
    releasedAt: firstDateString(data, ['releasedAt', 'releaseAt']),
  };
}

function isReady(status: ManufacturingEvidenceStatus) {
  return status === 'APPROVED' || status === 'RELEASED' || status === 'NOT_APPLICABLE';
}

function approvedApplicability(record: ApplicabilityRecord) {
  const role = asString(record.approvedRole).toLowerCase();
  const hasApprovedRole = role.includes('engineering') || role.includes('quality');
  return Boolean(record.justification?.trim() && record.approvedBy?.trim() && record.approvedAt && hasApprovedRole);
}

function applyNotApplicable(
  source: ManufacturingEvidenceSource,
  applicabilityByKey: Map<string, ApplicabilityRecord>
): ManufacturingEvidenceSource {
  const applicability = applicabilityByKey.get(source.key);
  if (!applicability || applicability.applicable !== false) return source;

  const approved = approvedApplicability(applicability);
  return {
    ...source,
    status: approved ? 'NOT_APPLICABLE' : 'BLOCKED',
    ready: approved,
    sourceAvailable: source.sourceAvailable,
    explanation: approved
      ? 'This manufacturing evidence requirement has a controlled Engineering or Quality approved not-applicable disposition.'
      : 'Not-applicable disposition is incomplete.',
    missingItems: approved
      ? []
      : [`${source.label}: not-applicable disposition requires justification and Engineering or Quality approval`],
    applicability: {
      applicable: false,
      justification: applicability.justification,
      approvedBy: applicability.approvedBy,
      approvedRole: applicability.approvedRole,
      approvedAt: applicability.approvedAt ? applicability.approvedAt.toISOString() : null,
      approved,
    },
  };
}

function sourceFromControlledRevision(
  requirement: typeof canonicalManufacturingEvidenceRequirements[number],
  controlledRevisions: ControlledRevision[]
): ManufacturingEvidenceSource | null {
  if (requirement.artifactTypes.length === 0) return null;

  const revisions = controlledRevisions.filter((revision) => requirement.artifactTypes.includes(revision.artifactType as any));
  if (revisions.length === 0) return null;

  const released = revisions.find((revision) => revision.releaseState === 'released');
  const approved = revisions.find((revision) => revision.releaseState === 'approved');
  const review = revisions.find((revision) => revision.releaseState === 'review');
  const selected = released ?? approved ?? review ?? revisions[0];
  const status = statusFromReleaseState(selected.releaseState);

  return {
    key: requirement.key,
    label: requirement.label,
    sourceModule: requirement.sourceModule,
    managedBy: 'SOURCE_MODULE',
    sourceAvailable: true,
    status,
    ready: isReady(status),
    recordId: selected.id,
    revision: selected.revision,
    approvedBy: selected.approvedBy ?? null,
    approvedAt: selected.approvedAt ? selected.approvedAt.toISOString() : null,
    releasedBy: selected.releasedBy ?? null,
    releasedAt: selected.releasedAt ? selected.releasedAt.toISOString() : null,
    updatedAt: selected.updatedAt ? selected.updatedAt.toISOString() : null,
    openUrl: '/engineering/change-control',
    explanation: `${selected.title} is ${selected.releaseState}.`,
    missingItems: isReady(status) ? [] : [`${requirement.label}: linked controlled revision is ${selected.releaseState}`],
  };
}

function sourceFromDraftBom(
  requirement: typeof canonicalManufacturingEvidenceRequirements[number],
  draftBoms: DraftBom[]
): ManufacturingEvidenceSource | null {
  if (requirement.key !== 'released_bom') return null;

  if (draftBoms.length === 0) {
    return {
      key: requirement.key,
      label: requirement.label,
      sourceModule: requirement.sourceModule,
      managedBy: 'SOURCE_MODULE',
      sourceAvailable: false,
      status: 'NOT_CONFIGURED',
      ready: false,
      explanation: 'No linked Draft Builder BOM was found for this R&D project.',
      missingItems: [`${requirement.label}: no linked Draft Builder BOM source is configured`],
      openUrl: '/estimating/bom-drafts',
    };
  }

  const ranked = draftBoms
    .map((draft) => {
      const details = releaseDetailsFromData(asRecord(draft.data));
      return { draft, details };
    })
    .sort((left, right) => {
      const rank = (status: ManufacturingEvidenceStatus) => ({ RELEASED: 4, APPROVED: 3, NEEDS_REVIEW: 2, IN_PROGRESS: 1 }[status] ?? 0);
      return rank(right.details.status) - rank(left.details.status);
    });

  const selected = ranked[0];
  const status = selected.details.status;
  return {
    key: requirement.key,
    label: requirement.label,
    sourceModule: requirement.sourceModule,
    managedBy: 'SOURCE_MODULE',
    sourceAvailable: true,
    status,
    ready: isReady(status),
    recordId: selected.draft.id,
    revision: selected.draft.revision,
    approvedBy: selected.details.approvedBy,
    approvedAt: selected.details.approvedAt,
    releasedBy: selected.details.releasedBy,
    releasedAt: selected.details.releasedAt,
    updatedAt: selected.draft.updatedAt ? selected.draft.updatedAt.toISOString() : null,
    openUrl: `/estimating/bom-drafts?draftId=${encodeURIComponent(selected.draft.id)}`,
    explanation: isReady(status)
      ? `${selected.draft.name} is ${status.toLowerCase()} for manufacturing release.`
      : `${selected.draft.name} is linked but does not carry an approved or released manufacturing status.`,
    missingItems: isReady(status) ? [] : [`${requirement.label}: linked BOM is not approved or released`],
  };
}

function sourceNotConfigured(requirement: typeof canonicalManufacturingEvidenceRequirements[number]): ManufacturingEvidenceSource {
  return {
    key: requirement.key,
    label: requirement.label,
    sourceModule: requirement.sourceModule,
    managedBy: 'SOURCE_MODULE',
    sourceAvailable: false,
    status: 'NOT_CONFIGURED',
    ready: false,
    explanation: `${requirement.sourceModule} is the source of truth, but no R&D-project-linked source record is configured for this requirement.`,
    missingItems: [`${requirement.label}: source module is not configured for this R&D project`],
  };
}

function draftBomBelongsToRdProject(draft: DraftBom, rdProjectId: string | null, rdProject?: RdProject | null) {
  if (!rdProjectId) return false;
  const draftTabIds = Array.isArray(rdProject?.draftTabIds) ? rdProject.draftTabIds : [];
  return draft.projectId === rdProjectId || draftTabIds.includes(draft.id);
}

export function buildDesignManufacturingEvidence(input: EvidenceBuilderInput): DesignManufacturingEvidence {
  const applicabilityByKey = new Map((input.applicability ?? []).map((record) => [record.requirementKey, record]));
  const linkedDraftBoms = (input.draftBoms ?? []).filter((draft) => (
    draftBomBelongsToRdProject(draft, input.rdProjectId, input.rdProject)
  ));

  const sources = canonicalManufacturingEvidenceRequirements.map((requirement) => {
    const source = sourceFromDraftBom(requirement, linkedDraftBoms)
      ?? sourceFromControlledRevision(requirement, input.controlledRevisions ?? [])
      ?? sourceNotConfigured(requirement);

    if (!input.rdProject && input.rdProjectId) {
      return applyNotApplicable({
        ...source,
        status: 'BLOCKED',
        ready: false,
        explanation: `R&D project ${input.rdProjectId} was not found; source evidence cannot be evaluated.`,
        missingItems: [`${requirement.label}: R&D project was not found`],
      }, applicabilityByKey);
    }

    return applyNotApplicable(source, applicabilityByKey);
  });

  const missingItems = sources.flatMap((source) => source.missingItems);
  return {
    rdProjectId: input.rdProjectId,
    designControlRecordId: input.designControlRecordId,
    overallStatus: missingItems.length === 0 ? 'RELEASED' : 'BLOCKED',
    ready: missingItems.length === 0,
    missingItems,
    sources,
  };
}

export async function getDesignManufacturingEvidence(params: {
  rdProjectId: string | null;
  designControlRecordId: string;
}, client: typeof db = db): Promise<DesignManufacturingEvidence> {
  const rdProjectId = params.rdProjectId?.trim() || null;

  const [rdProject] = rdProjectId
    ? await client.select().from(rdProjects).where(eq(rdProjects.id, rdProjectId)).limit(1)
    : [];

  const draftTabIds = Array.isArray(rdProject?.draftTabIds) ? rdProject.draftTabIds : [];
  const draftBomRowsByProject = rdProjectId
    ? await client.select().from(draftBomDrafts).where(eq(draftBomDrafts.projectId, rdProjectId)).orderBy(desc(draftBomDrafts.updatedAt))
    : [];
  const draftBomRowsByTab = draftTabIds.length > 0
    ? await client.select().from(draftBomDrafts).where(inArray(draftBomDrafts.id, draftTabIds)).orderBy(desc(draftBomDrafts.updatedAt))
    : [];
  const draftBoms = Array.from(new Map([...draftBomRowsByProject, ...draftBomRowsByTab].map((draft) => [draft.id, draft])).values());

  const controlledRevisions = rdProjectId
    ? await client
      .select()
      .from(engineeringControlledRevisions)
      .where(sql`
        metadata->>'rdProjectId' = ${rdProjectId}
        OR metadata->>'rd_project_id' = ${rdProjectId}
        OR metadata->>'designControlRecordId' = ${params.designControlRecordId}
        OR metadata->>'design_control_record_id' = ${params.designControlRecordId}
      `)
      .orderBy(desc(engineeringControlledRevisions.updatedAt))
    : [];

  const applicability = await client
    .select()
    .from(designControlRequirementApplicability)
    .where(eq(designControlRequirementApplicability.recordId, params.designControlRecordId));

  return buildDesignManufacturingEvidence({
    rdProjectId,
    designControlRecordId: params.designControlRecordId,
    rdProject: rdProject ?? null,
    draftBoms,
    controlledRevisions,
    applicability,
  });
}
