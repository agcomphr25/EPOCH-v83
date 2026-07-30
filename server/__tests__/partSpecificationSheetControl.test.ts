import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import {
  actorHasSpecCapability,
  assertSpecTransition,
  getSpecActor,
  requireSpecCapability,
  SPEC_SHEET_CAPABILITIES,
} from '../src/lib/partSpecificationSheetControl';
import {
  compareSpecSourceRows,
  refreshSpecSourceRowsPreservingManual,
} from '../src/lib/partSpecificationSheets';

function responseDouble() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe('Part Specification Sheet authorization behavior', () => {
  it('rejects an unauthenticated mutation with 401', () => {
    const response = responseDouble();
    expect(
      requireSpecCapability(
        {} as Request,
        response,
        SPEC_SHEET_CAPABILITIES.create
      )
    ).toBeNull();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it('rejects an authenticated actor without the exact capability', () => {
    const request = {
      user: {
        id: 17,
        username: 'operator',
        role: 'EMPLOYEE',
        capabilities: [],
      },
    } as unknown as Request;
    const response = responseDouble();
    expect(
      requireSpecCapability(request, response, SPEC_SHEET_CAPABILITIES.edit)
    ).toBeNull();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredCapability: SPEC_SHEET_CAPABILITIES.edit,
      })
    );
  });

  it.each([
    ['ENGINEERING', SPEC_SHEET_CAPABILITIES.approveEngineering],
    ['QUALITY', SPEC_SHEET_CAPABILITIES.approveQuality],
    ['PRODUCTION', SPEC_SHEET_CAPABILITIES.approveProduction],
  ])('keeps %s approval authority independent', (_, capability) => {
    const actor = getSpecActor({
      user: {
        id: 19,
        role: 'EMPLOYEE',
        capabilities: [capability],
      },
    } as unknown as Request);
    expect(actor).not.toBeNull();
    expect(actorHasSpecCapability(actor!, capability)).toBe(true);
    const otherCapabilities = [
      SPEC_SHEET_CAPABILITIES.approveEngineering,
      SPEC_SHEET_CAPABILITIES.approveQuality,
      SPEC_SHEET_CAPABILITIES.approveProduction,
    ].filter((entry) => entry !== capability);
    for (const other of otherCapabilities) {
      expect(actorHasSpecCapability(actor!, other)).toBe(false);
    }
  });

  it('does not authorize by username', () => {
    const actor = getSpecActor({
      user: {
        id: 23,
        username: 'admin',
        role: 'EMPLOYEE',
        capabilities: [],
      },
    } as unknown as Request);
    expect(
      actorHasSpecCapability(actor!, SPEC_SHEET_CAPABILITIES.release)
    ).toBe(false);
  });
});

describe('Part Specification Sheet lifecycle behavior', () => {
  it.each([
    ['DRAFT', 'IN_REVIEW'],
    ['IN_REVIEW', 'DRAFT'],
    ['IN_REVIEW', 'RELEASED'],
    ['RELEASED', 'SUPERSEDED'],
    ['RELEASED', 'OBSOLETE'],
    ['SUPERSEDED', 'OBSOLETE'],
  ])('allows %s -> %s', (from, to) => {
    expect(() => assertSpecTransition(from, to)).not.toThrow();
  });

  it.each([
    ['DRAFT', 'RELEASED'],
    ['RELEASED', 'DRAFT'],
    ['SUPERSEDED', 'DRAFT'],
    ['OBSOLETE', 'DRAFT'],
  ])('rejects %s -> %s', (from, to) => {
    expect(() => assertSpecTransition(from, to)).toThrow(
      /Invalid specification lifecycle transition/
    );
  });
});

describe('Part Specification Sheet source refresh behavior', () => {
  const imported = {
    sourceCncOperationId: 'cnc-1',
    programId: 'program-1',
    programRevision: 'A',
    operationName: 'Machine datum',
    manuallyEntered: false,
  };
  const manual = {
    operationName: 'Manual deburr note',
    manuallyEntered: true,
  };

  it('reports changed imported program revisions without mutating the snapshot', () => {
    const captured = [imported, manual];
    const current = [{ ...imported, programRevision: 'B' }];
    const before = JSON.stringify(captured);
    const comparison = compareSpecSourceRows(captured, current);
    expect(comparison.status).toBe('REVIEW_REQUIRED');
    expect(comparison.changes).toHaveLength(1);
    expect(JSON.stringify(captured)).toBe(before);
  });

  it('preserves manual rows while refreshing imported source rows', () => {
    const refreshed = refreshSpecSourceRowsPreservingManual(
      [imported, manual],
      [{ ...imported, programRevision: 'B' }]
    );
    expect(refreshed).toContainEqual(manual);
    expect(refreshed).toContainEqual(
      expect.objectContaining({ programRevision: 'B', manuallyEntered: false })
    );
  });
});
