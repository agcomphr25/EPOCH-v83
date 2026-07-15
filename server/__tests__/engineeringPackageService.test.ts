import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
}));

import {
  engineeringPackageTestInternals,
} from '../src/services/engineeringPackageService';

const {
  buildEngineeringPackagePreviewFromRecords,
  buildEngineeringPackageSnapshot,
  packageNumberForRelease,
} = engineeringPackageTestInternals;

function release(overrides: Record<string, unknown> = {}) {
  return {
    id: 'er-1',
    rdProjectId: 'rd-1',
    designControlRecordId: 'dc-1',
    releaseNumber: 'ER-rd-1-A',
    releaseRevision: 'A',
    releaseStatus: 'RELEASED',
    productName: 'Prototype Widget',
    effectiveDate: '2026-01-03',
    releasedBy: 'tester',
    releasedAt: new Date('2026-01-03T00:00:00Z'),
    readinessSnapshot: {},
    sourceEvidenceSnapshot: {},
    approvalSnapshot: {},
    metadata: {},
    createdAt: new Date('2026-01-03T00:00:00Z'),
    updatedAt: new Date('2026-01-03T00:00:00Z'),
    ...overrides,
  } as any;
}

function baseline(overrides: Record<string, unknown> = {}) {
  return {
    id: 'baseline-1',
    engineeringReleaseId: 'er-1',
    rdProjectId: 'rd-1',
    designControlRecordId: 'dc-1',
    baselineStatus: 'LOCKED',
    baselineRevision: 'A',
    lockedAt: new Date('2026-01-03T00:00:00Z'),
    lockedBy: 'tester',
    metadata: {},
    createdAt: new Date('2026-01-03T00:00:00Z'),
    updatedAt: new Date('2026-01-03T00:00:00Z'),
    ...overrides,
  } as any;
}

function baselineItem(category: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `item-${category}`,
    engineeringReleaseId: 'er-1',
    baselineId: 'baseline-1',
    baselineCategory: category,
    sourceTable: category.startsWith('released_') ? 'engineering_controlled_revisions' : 'design_control_steps',
    sourceModule: category.startsWith('released_') ? 'Engineering Controlled Revisions' : 'Design Control',
    sourceRecordId: `${category}-record`,
    sourceRevision: 'A',
    sourceStatus: category === 'rd_project' ? 'released' : 'RELEASED',
    capturedAt: new Date('2026-01-03T00:00:00Z'),
    immutableSnapshot: { category, revision: 'A' },
    sourceChecksum: `sha256:${category}`,
    immutableSnapshotId: `sha256:${category}`,
    metadata: {},
    createdAt: new Date('2026-01-03T00:00:00Z'),
    updatedAt: new Date('2026-01-03T00:00:00Z'),
    ...overrides,
  } as any;
}

function completeItems(overrides: Record<string, Record<string, unknown>> = {}) {
  return [
    'rd_project',
    'design_revision_baseline_locked',
    'released_bom',
    'released_cad',
    'released_drawings',
    'design_step_8',
    'verification',
    'validation',
    'design_reviews',
    'engineering_changes',
    'requirements',
    'risks',
    'approved_inspection_plan',
    'required_certifications_identified',
    'packaging_shipping_requirements_defined',
  ].map((category) => baselineItem(category, overrides[category] ?? {}));
}

describe('engineering package preview', () => {
  it('blocks package preview without an Engineering Release', () => {
    const preview = buildEngineeringPackagePreviewFromRecords({
      release: null,
      baseline: null,
      baselineItems: [],
    });

    expect(preview.ready).toBe(false);
    expect(preview.packageCompleteness.status).toBe('NOT_RELEASED');
  });

  it('blocks package generation readiness when the baseline is missing', () => {
    const preview = buildEngineeringPackagePreviewFromRecords({
      release: release(),
      baseline: null,
      baselineItems: [],
    });

    expect(preview.ready).toBe(false);
    expect(preview.packageCompleteness.status).toBe('MISSING_BASELINE');
    expect(preview.missingEngineeringDocuments).toContain('Engineering BOM');
  });

  it('returns an existing package for duplicate generation previews', () => {
    const preview = buildEngineeringPackagePreviewFromRecords({
      release: release(),
      baseline: baseline(),
      baselineItems: completeItems(),
      existingPackage: {
        id: 'pkg-1',
        engineeringReleaseId: 'er-1',
        engineeringBaselineId: 'baseline-1',
        rdProjectId: 'rd-1',
        designControlRecordId: 'dc-1',
        packageNumber: 'TDP-ER-rd-1-A',
        packageRevision: 'A',
        packageStatus: 'LOCKED',
        productName: 'Prototype Widget',
        lockedBy: 'tester',
        lockedAt: new Date('2026-01-04T00:00:00Z'),
        packageSnapshot: {},
        completenessSnapshot: {},
        contentsSummary: {},
        metadata: {},
        createdAt: new Date('2026-01-04T00:00:00Z'),
        updatedAt: new Date('2026-01-04T00:00:00Z'),
      } as any,
    });

    expect(preview.ready).toBe(true);
    expect(preview.existingPackage?.packageNumber).toBe('TDP-ER-rd-1-A');
  });

  it('references the correct source revisions from the released baseline', () => {
    const preview = buildEngineeringPackagePreviewFromRecords({
      release: release({ releaseRevision: 'B' }),
      baseline: baseline({ baselineRevision: 'B' }),
      baselineItems: completeItems({
        released_bom: { sourceRevision: 'BOM-B', sourceRecordId: 'bom-42', sourceTable: 'draft_bom_drafts' },
        released_cad: { sourceRevision: 'CAD-B', sourceRecordId: 'cad-42' },
        released_drawings: { sourceRevision: 'DWG-B', sourceRecordId: 'dwg-42' },
      }),
    });

    expect(preview.ready).toBe(true);
    expect(preview.bomSummary).toEqual(expect.objectContaining({ revision: 'BOM-B', sourceRecordId: 'bom-42' }));
    expect(preview.revisionSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'released_cad', revision: 'CAD-B', sourceRecordId: 'cad-42' }),
        expect.objectContaining({ category: 'released_drawings', revision: 'DWG-B', sourceRecordId: 'dwg-42' }),
      ]),
    );
  });

  it('creates an immutable package snapshot with digital-thread traceability', () => {
    const rel = release();
    const base = baseline();
    const preview = buildEngineeringPackagePreviewFromRecords({
      release: rel,
      baseline: base,
      baselineItems: completeItems(),
    });
    const snapshot = buildEngineeringPackageSnapshot({ release: rel, baseline: base, preview });

    preview.contents[0].sourceRevision = 'MUTATED';

    expect(snapshot.snapshotChecksum).toMatch(/^sha256:/);
    expect((snapshot.contents as any[])[0].sourceRevision).not.toBe('MUTATED');
    expect(snapshot.digitalThread).toEqual(expect.objectContaining({
      rdProjectId: 'rd-1',
      engineeringReleaseId: 'er-1',
      designControlRecordId: 'dc-1',
    }));
    expect(snapshot.digitalThread.bomRefs).toContain('released_bom-record');
    expect((snapshot.contents as any[]).some((item) => item.category === 'manufactured_inventory_item')).toBe(false);
  });

  it('assigns Engineering Package numbers without creating inventory identity', () => {
    expect(packageNumberForRelease(release())).toBe('TDP-ER-rd-1-A');
  });
});
