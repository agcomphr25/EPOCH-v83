import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
}));

import {
  buildEngineeringReleasePreviewFromContext,
} from '../src/services/engineeringReleaseService';
import type { DesignManufacturingEvidence, ManufacturingEvidenceSource } from '../src/services/designManufacturingEvidenceService';

function step(key: string, status = 'approved', overrides: Record<string, unknown> = {}) {
  return {
    id: `step-${key}`,
    recordId: 'dc-1',
    stepKey: key,
    title: `Step ${key}`,
    status,
    rdProjectId: 'rd-1',
    projectId: null,
    productionWorkOrderId: null,
    p2PurchaseOrderId: null,
    formData: {},
    checklist: {},
    approvals: {},
    attachments: [],
    metadata: {},
    approvedAt: status === 'approved' ? new Date('2026-01-02T00:00:00Z') : null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  } as any;
}

function source(overrides: Partial<ManufacturingEvidenceSource> = {}): ManufacturingEvidenceSource {
  return {
    key: 'released_bom',
    label: 'released BOM',
    sourceModule: 'Draft Builder BOM / BOM module',
    managedBy: 'SOURCE_MODULE',
    sourceAvailable: true,
    status: 'RELEASED',
    ready: true,
    recordId: 'bom-1',
    revision: 'B',
    explanation: 'Released BOM is released.',
    missingItems: [],
    ...overrides,
  };
}

function manufacturingEvidence(overrides: Partial<DesignManufacturingEvidence> = {}): DesignManufacturingEvidence {
  const sources = [
    source(),
    source({
      key: 'design_revision_baseline_locked',
      label: 'design revision baseline locked',
      sourceModule: 'Engineering Controlled Revisions / Revision baseline',
      recordId: 'baseline-1',
      revision: 'B',
    }),
  ];
  return {
    rdProjectId: 'rd-1',
    designControlRecordId: 'dc-1',
    overallStatus: 'RELEASED',
    ready: true,
    missingItems: [],
    sources,
    ...overrides,
  };
}

function context(overrides: Record<string, unknown> = {}) {
  const steps = Array.from({ length: 12 }, (_, index) => step(String(index + 1)));
  steps[0] = step('1', 'approved', { formData: { 'Product name': 'Prototype Widget' } });
  steps[7] = step('8', 'approved', { formData: { 'Prototype serial number': 'PROTO-001' } });
  steps[11] = step('12', 'approved', {
    formData: { 'Locked design revision baseline': 'B' },
    approvals: {
      'engineering release approval': true,
      'quality release approval': true,
      'manufacturing release approval': true,
      'program manager release approval': true,
    },
  });

  return {
    record: {
      id: 'dc-1',
      recordNumber: null,
      title: 'Widget Design Control',
      status: 'release_ready',
      rdProjectId: 'rd-1',
      projectId: null,
      productionWorkOrderId: null,
      p2PurchaseOrderId: null,
      formData: {},
      checklist: {},
      approvals: {},
      attachments: [],
      metadata: {},
      submittedAt: null,
      releasedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    },
    rdProject: {
      id: 'rd-1',
      projectName: 'R&D Widget',
      owner: 'Engineering',
      status: 'active',
      engineeringStatus: 'DRAFT',
      signoffRequired: false,
      signoffUserId: '',
      draftTabIds: ['bom-1'],
      description: '',
      createdByUserId: null,
      createdByDisplayName: 'test',
      updatedByUserId: null,
      updatedByDisplayName: 'test',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    },
    steps,
    requirements: [],
    risks: [],
    reviews: [],
    verification: [],
    validation: [],
    changes: [],
    manufacturingEvidence: manufacturingEvidence(),
    ...overrides,
  } as any;
}

describe('engineering release preview', () => {
  it('blocks release when a workflow step is incomplete', () => {
    const ctx = context();
    ctx.steps[2] = step('3', 'needs_approval');

    const preview = buildEngineeringReleasePreviewFromContext(ctx);

    expect(preview.ready).toBe(false);
    expect(preview.missingEvidence).toContain('approved design inputs');
  });

  it('blocks release by open high risk', () => {
    const preview = buildEngineeringReleasePreviewFromContext(context({
      risks: [{
        id: 'risk-1',
        recordId: 'dc-1',
        riskKey: 'R-1',
        title: 'High risk',
        status: 'open',
        formData: { Severity: 'High' },
        metadata: {},
      }],
    }));

    expect(preview.ready).toBe(false);
    expect(preview.missingEvidence.join('\n')).toMatch(/open high risk/i);
  });

  it('blocks release by unapproved source evidence', () => {
    const preview = buildEngineeringReleasePreviewFromContext(context({
      manufacturingEvidence: manufacturingEvidence({
        ready: false,
        overallStatus: 'BLOCKED',
        missingItems: ['released BOM: linked BOM is not approved or released'],
        sources: [source({ status: 'IN_PROGRESS', ready: false, missingItems: ['released BOM: linked BOM is not approved or released'] })],
      }),
    }));

    expect(preview.ready).toBe(false);
    expect(preview.missingEvidence).toContain('manufacturing-source evidence: released BOM: linked BOM is not approved or released');
  });

  it('isolates preview evidence to the linked R&D project', () => {
    const preview = buildEngineeringReleasePreviewFromContext(context({
      manufacturingEvidence: manufacturingEvidence({
        rdProjectId: 'rd-2',
        ready: true,
        overallStatus: 'RELEASED',
        missingItems: [],
      }),
    }));

    expect(preview.rdProjectId).toBe('rd-1');
    expect(preview.ready).toBe(false);
    expect(preview.missingEvidence).toContain('manufacturing-source evidence belongs to a different R&D project');
  });

  it('blocks stale Design Control evidence even when the evidence payload claims ready', () => {
    const preview = buildEngineeringReleasePreviewFromContext(context({
      manufacturingEvidence: manufacturingEvidence({
        designControlRecordId: 'dc-2',
        ready: true,
        overallStatus: 'RELEASED',
        missingItems: [],
      }),
    }));

    expect(preview.ready).toBe(false);
    expect(preview.missingEvidence).toContain('manufacturing-source evidence belongs to a different Design Control record');
  });

  it('blocks release by missing approval', () => {
    const ctx = context();
    ctx.steps[11] = step('12', 'approved', {
      formData: { 'Locked design revision baseline': 'B' },
      approvals: {
        'engineering release approval': true,
        'quality release approval': false,
        'manufacturing release approval': true,
        'program manager release approval': true,
      },
    });

    const preview = buildEngineeringReleasePreviewFromContext(ctx);

    expect(preview.ready).toBe(false);
    expect(preview.missingEvidence).toContain('quality release approval');
  });

  it('creates baseline preview items for successful releases', () => {
    const preview = buildEngineeringReleasePreviewFromContext(context());

    expect(preview.ready).toBe(true);
    expect(preview.baselineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceTable: 'design_control_steps', sourceStatus: 'approved' }),
        expect.objectContaining({ baselineCategory: 'released_bom', sourceTable: 'draft_bom_drafts' }),
        expect.objectContaining({ baselineCategory: 'rd_project', sourceRecordId: 'rd-1' }),
      ]),
    );
    expect(preview.baselineItems.every((item) => item.immutableSnapshotId.startsWith('sha256:'))).toBe(true);
    expect(preview.baselineItems.some((item) => item.baselineCategory === 'manufactured_inventory_item')).toBe(false);
  });

  it('reports changed-since-release without mutating the old baseline snapshot', () => {
    const original = buildEngineeringReleasePreviewFromContext(context());
    const release = {
      id: 'er-1',
      releaseNumber: 'ER-rd-1-A',
      releaseRevision: 'A',
      releaseStatus: 'RELEASED',
      releasedBy: 'tester',
      releasedAt: new Date('2026-01-03T00:00:00Z'),
      sourceEvidenceSnapshot: { baselineItems: original.baselineItems },
    } as any;

    const changed = buildEngineeringReleasePreviewFromContext(context({
      manufacturingEvidence: manufacturingEvidence({
        sources: [
          source({ revision: 'C' }),
          source({
            key: 'design_revision_baseline_locked',
            label: 'design revision baseline locked',
            sourceModule: 'Engineering Controlled Revisions / Revision baseline',
            revision: 'C',
          }),
        ],
      }),
    }), release);

    expect(changed.changedSinceReleaseWarnings.length).toBeGreaterThan(0);
    expect((release.sourceEvidenceSnapshot.baselineItems as any[]).some((item) => item.sourceRevision === 'C')).toBe(false);
  });
});
