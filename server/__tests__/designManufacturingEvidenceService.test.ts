import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {},
}));

import {
  buildDesignManufacturingEvidence,
  canonicalManufacturingEvidenceRequirements,
} from '../src/services/designManufacturingEvidenceService';

function rdProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rd-1',
    projectName: 'R&D Test Project',
    owner: 'Engineering',
    status: 'active',
    signoffRequired: false,
    signoffUserId: '',
    draftTabIds: ['bom-1'],
    description: '',
    createdByUserId: null,
    createdByDisplayName: 'test',
    updatedByUserId: null,
    updatedByDisplayName: 'test',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as any;
}

function draftBom(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bom-1',
    name: 'Released R&D BOM',
    revision: 'B',
    project: 'R&D Test Project',
    projectId: 'rd-1',
    projectCode: null,
    projectName: 'R&D Test Project',
    projectType: 'rd',
    data: {},
    visibility: 'public',
    allowPublicEdit: false,
    createdByUserId: null,
    createdByDisplayName: 'test',
    updatedByUserId: null,
    updatedByDisplayName: 'test',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  } as any;
}

function applicability(overrides: Record<string, unknown> = {}) {
  return {
    id: 'na-1',
    recordId: 'dc-1',
    rdProjectId: 'rd-1',
    requirementKey: 'cnc_programs_approved',
    applicable: false,
    justification: 'No CNC operations are used for this design.',
    approvedBy: 'Quality Lead',
    approvedRole: 'Quality',
    approvedAt: new Date('2026-01-03T00:00:00Z'),
    metadata: {},
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as any;
}

describe('design manufacturing evidence service', () => {
  it('returns all canonical Step 12 evidence requirements', () => {
    const evidence = buildDesignManufacturingEvidence({
      rdProjectId: 'rd-1',
      designControlRecordId: 'dc-1',
      rdProject: rdProject(),
      draftBoms: [],
    });

    expect(evidence.sources.map((source) => source.key)).toEqual(
      canonicalManufacturingEvidenceRequirements.map((requirement) => requirement.key),
    );
  });

  it('blocks an unapproved linked BOM', () => {
    const evidence = buildDesignManufacturingEvidence({
      rdProjectId: 'rd-1',
      designControlRecordId: 'dc-1',
      rdProject: rdProject(),
      draftBoms: [draftBom({ data: { releaseStatus: 'draft' } })],
    });

    const bom = evidence.sources.find((source) => source.key === 'released_bom');
    expect(bom).toMatchObject({
      sourceAvailable: true,
      status: 'IN_PROGRESS',
      ready: false,
    });
    expect(evidence.ready).toBe(false);
    expect(evidence.missingItems).toContain('released BOM: linked BOM is not approved or released');
  });

  it('reports a missing source as NOT_CONFIGURED', () => {
    const evidence = buildDesignManufacturingEvidence({
      rdProjectId: 'rd-1',
      designControlRecordId: 'dc-1',
      rdProject: rdProject(),
      draftBoms: [],
    });

    const routing = evidence.sources.find((source) => source.key === 'approved_routing');
    expect(routing).toMatchObject({
      status: 'NOT_CONFIGURED',
      sourceAvailable: false,
      ready: false,
    });
  });

  it('returns approved source details from a released BOM', () => {
    const evidence = buildDesignManufacturingEvidence({
      rdProjectId: 'rd-1',
      designControlRecordId: 'dc-1',
      rdProject: rdProject(),
      draftBoms: [
        draftBom({
          data: {
            releaseStatus: 'released',
            approvedBy: 'Engineering Lead',
            approvedAt: '2026-01-02T00:00:00Z',
            releasedBy: 'Document Control',
            releasedAt: '2026-01-02T12:00:00Z',
          },
        }),
      ],
    });

    const bom = evidence.sources.find((source) => source.key === 'released_bom');
    expect(bom).toMatchObject({
      status: 'RELEASED',
      ready: true,
      revision: 'B',
      approvedBy: 'Engineering Lead',
      releasedBy: 'Document Control',
    });
  });

  it('requires justification and Engineering or Quality approval for not-applicable requirements', () => {
    const pending = buildDesignManufacturingEvidence({
      rdProjectId: 'rd-1',
      designControlRecordId: 'dc-1',
      rdProject: rdProject(),
      applicability: [applicability({ justification: '', approvedRole: 'Quality' })],
    });
    const pendingCnc = pending.sources.find((source) => source.key === 'cnc_programs_approved');
    expect(pendingCnc).toMatchObject({
      status: 'BLOCKED',
      ready: false,
      applicability: expect.objectContaining({ approved: false }),
    });

    const approved = buildDesignManufacturingEvidence({
      rdProjectId: 'rd-1',
      designControlRecordId: 'dc-1',
      rdProject: rdProject(),
      applicability: [applicability()],
    });
    const approvedCnc = approved.sources.find((source) => source.key === 'cnc_programs_approved');
    expect(approvedCnc).toMatchObject({
      status: 'NOT_APPLICABLE',
      ready: true,
      applicability: expect.objectContaining({ approved: true }),
    });
  });

  it('rejects a BOM linked to a different R&D project', () => {
    const evidence = buildDesignManufacturingEvidence({
      rdProjectId: 'rd-1',
      designControlRecordId: 'dc-1',
      rdProject: rdProject({ draftTabIds: [] }),
      draftBoms: [
        draftBom({
          id: 'bom-other',
          projectId: 'rd-other',
          data: { releaseStatus: 'released' },
        }),
      ],
    });

    const bom = evidence.sources.find((source) => source.key === 'released_bom');
    expect(bom).toMatchObject({
      status: 'NOT_CONFIGURED',
      sourceAvailable: false,
      ready: false,
    });
  });
});
