/**
 * Integration tests for MaterialIssueService routing-step enforcement
 * (Task #144). Exercises the full validation pipeline — including
 * `getActiveRoutingStep` auto-detection and ROUTING_STEP_BYPASS overrides
 * — without standing up a database.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbSelectResults: { current: any[] } = { current: [] };
vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({ limit: async () => dbSelectResults.current }),
      }),
    })),
  },
}));

vi.mock('../storage', () => ({
  storage: {
    getMaterialLot: vi.fn(),
    getTraveler: vi.fn(),
    getWorkOrderById: vi.fn(),
    getTravelerStep: vi.fn(),
    getLotReservations: vi.fn(),
    getTravelerSteps: vi.fn(),
    getUser: vi.fn(),
  },
}));

import { storage } from '../storage';
import { validateIssueEligibility } from '../src/services/materialIssueService';
import { __setTravelerStepLoaderForTests } from '../src/services/routingStepService';

const lot = {
  id: 'lot-1',
  inventoryItemId: 'inv-1',
  materialPartNumber: 'PART-A',
  status: 'ACCEPTED',
  remainingQty: '100',
  unitOfMeasure: 'EA',
  expirationDate: null,
  storageLocation: 'WH',
};
const traveler = { id: 't1', status: 'IN_PROGRESS', productionWorkOrderId: 'wad-1' };
const wad = { id: 'wad-1', status: 'RELEASED', wadStatus: 'APPROVED' };

const operator = { displayName: 'glennj' };

let prevLoader: ((travelerId: string) => Promise<any[]>) | null = null;

beforeEach(() => {
  dbSelectResults.current = [];
  vi.mocked(storage.getMaterialLot).mockResolvedValue(lot as any);
  vi.mocked(storage.getTraveler).mockResolvedValue(traveler as any);
  vi.mocked(storage.getWorkOrderById).mockResolvedValue(wad as any);
  vi.mocked(storage.getLotReservations).mockResolvedValue([]);
  vi.mocked(storage.getTravelerStep).mockImplementation(async (id: string) => {
    if (id === 'step-active') return { id: 'step-active', travelerId: 't1', status: 'IN_PROGRESS' } as any;
    if (id === 'step-wrong') return { id: 'step-wrong', travelerId: 't1', status: 'IN_PROGRESS' } as any;
    return undefined;
  });
});

afterEach(() => {
  if (prevLoader) __setTravelerStepLoaderForTests(prevLoader);
  prevLoader = null;
  vi.clearAllMocks();
});

function withActiveSteps(steps: any[]) {
  prevLoader = __setTravelerStepLoaderForTests(async () => steps);
}

describe('MaterialIssueService routing-step enforcement', () => {
  it('auto-detects the active step and passes when consume targets it', async () => {
    withActiveSteps([{ id: 'step-active', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 1 }]);
    const blockers = await validateIssueEligibility({
      action: 'consume',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
      productionWorkOrderId: 'wad-1',
      travelerStepId: 'step-active',
    });
    expect(blockers).toEqual([]);
  });

  it('rejects WRONG_ROUTING_STEP when consume targets a non-active step', async () => {
    withActiveSteps([
      { id: 'step-active', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 1 },
      { id: 'step-wrong', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 2 },
    ]);
    const blockers = await validateIssueEligibility({
      action: 'consume',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
      productionWorkOrderId: 'wad-1',
      travelerStepId: 'step-wrong',
    });
    expect(blockers.map((b) => b.code)).toContain('WRONG_ROUTING_STEP');
  });

  it('rejects NO_ACTIVE_ROUTING_STEP when traveler has no active or eligible step', async () => {
    withActiveSteps([{ id: 'step-done', travelerId: 't1', status: 'COMPLETED', stepNumber: 1 }]);
    const blockers = await validateIssueEligibility({
      action: 'consume',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
      productionWorkOrderId: 'wad-1',
      travelerStepId: 'step-active',
    });
    // step-active was supplied but the traveler has no active step → NO_ACTIVE.
    expect(blockers.map((b) => b.code)).toContain('NO_ACTIVE_ROUTING_STEP');
  });

  it('clears WRONG_ROUTING_STEP with an authorized ROUTING_STEP_BYPASS override backed by an approval row', async () => {
    withActiveSteps([
      { id: 'step-active', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 1 },
      { id: 'step-wrong', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 2 },
    ]);
    vi.mocked(storage.getUser).mockResolvedValue({
      id: 42,
      role: 'Production Supervisor',
      displayName: 'Sup Sammy',
    } as any);
    dbSelectResults.current = [{
      id: 'apv-1',
      reason: 'ROUTING_STEP_BYPASS',
      bypassesBlocker: 'WRONG_ROUTING_STEP',
      materialLotId: lot.id,
      travelerId: 't1',
      intendedRoutingStepId: null,
      approverUserId: 42,
      approverRoleAtApproval: 'Production Supervisor',
      writtenReason: 'Re-planned per ECO-7421 — see attached',
      status: 'APPROVED',
      approvedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      consumedByLedgerEntryId: null,
      revokedAt: null,
      revokedByUserId: null,
      createdAt: new Date(),
    }];
    const blockers = await validateIssueEligibility({
      action: 'consume',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
      productionWorkOrderId: 'wad-1',
      travelerStepId: 'step-wrong',
      override: {
        reason: 'ROUTING_STEP_BYPASS',
        approvalId: 'apv-1',
        approverUserId: 42,
        approverDisplayName: 'Caller-claimed',
        approverRole: 'Caller-claimed',
        writtenReason: 'Re-planned per ECO-7421 — see attached',
      },
    });
    expect(blockers.find((b) => b.code === 'WRONG_ROUTING_STEP')).toBeUndefined();
  });

  it('does NOT clear WRONG_ROUTING_STEP when override has no approvalId', async () => {
    withActiveSteps([
      { id: 'step-active', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 1 },
      { id: 'step-wrong', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 2 },
    ]);
    vi.mocked(storage.getUser).mockResolvedValue({
      id: 42, role: 'Production Supervisor', displayName: 'Sup Sammy',
    } as any);
    const blockers = await validateIssueEligibility({
      action: 'consume',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
      productionWorkOrderId: 'wad-1',
      travelerStepId: 'step-wrong',
      override: {
        reason: 'ROUTING_STEP_BYPASS',
        approverUserId: 42,
        approverDisplayName: 'Sup Sammy',
        approverRole: 'Production Supervisor',
        writtenReason: 'No approval row — should be rejected',
      } as any,
    });
    expect(blockers.map((b) => b.code)).toContain('WRONG_ROUTING_STEP');
  });

  it('does NOT clear WRONG_ROUTING_STEP when approval row is already CONSUMED', async () => {
    withActiveSteps([
      { id: 'step-active', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 1 },
      { id: 'step-wrong', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 2 },
    ]);
    vi.mocked(storage.getUser).mockResolvedValue({
      id: 42, role: 'Production Supervisor', displayName: 'Sup Sammy',
    } as any);
    dbSelectResults.current = [{
      id: 'apv-2',
      reason: 'ROUTING_STEP_BYPASS',
      bypassesBlocker: 'WRONG_ROUTING_STEP',
      materialLotId: lot.id,
      travelerId: 't1',
      intendedRoutingStepId: null,
      approverUserId: 42,
      approverRoleAtApproval: 'Production Supervisor',
      writtenReason: 'Re-planned',
      status: 'CONSUMED',
      approvedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
      consumedByLedgerEntryId: null,
      revokedAt: null,
      revokedByUserId: null,
      createdAt: new Date(),
    }];
    const blockers = await validateIssueEligibility({
      action: 'consume',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
      productionWorkOrderId: 'wad-1',
      travelerStepId: 'step-wrong',
      override: {
        reason: 'ROUTING_STEP_BYPASS',
        approvalId: 'apv-2',
        approverUserId: 42,
        approverDisplayName: 'Sup Sammy',
        approverRole: 'Production Supervisor',
        writtenReason: 'Trying to reuse consumed approval',
      },
    });
    expect(blockers.map((b) => b.code)).toContain('WRONG_ROUTING_STEP');
  });

  it('rejects reserve when no routing step can be resolved', async () => {
    withActiveSteps([{ id: 'step-done', travelerId: 't1', status: 'COMPLETED', stepNumber: 1 }]);
    const blockers = await validateIssueEligibility({
      action: 'reserve',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
    });
    expect(blockers.map((b) => b.code)).toContain('NO_ACTIVE_ROUTING_STEP');
  });

  it('does NOT clear WRONG_ROUTING_STEP when the server-verified approver role is unauthorized', async () => {
    withActiveSteps([
      { id: 'step-active', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 1 },
      { id: 'step-wrong', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 2 },
    ]);
    // Caller asserts a privileged role; server returns the truth.
    vi.mocked(storage.getUser).mockResolvedValue({
      id: 99,
      role: 'Operator',
      displayName: 'Joe Operator',
    } as any);
    const blockers = await validateIssueEligibility({
      action: 'consume',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
      productionWorkOrderId: 'wad-1',
      travelerStepId: 'step-wrong',
      override: {
        reason: 'ROUTING_STEP_BYPASS',
        approvalId: 'apv-x',
        approverUserId: 99,
        approverDisplayName: 'Joe Operator',
        approverRole: 'Production Supervisor', // claimed; DB says otherwise
        writtenReason: 'Wanted to skip ahead anyway',
      },
    });
    expect(blockers.map((b) => b.code)).toContain('WRONG_ROUTING_STEP');
  });

  it('does NOT clear WRONG_ROUTING_STEP when ADMIN tries ROUTING_STEP_BYPASS (role no longer in catalog)', async () => {
    withActiveSteps([
      { id: 'step-active', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 1 },
      { id: 'step-wrong', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 2 },
    ]);
    vi.mocked(storage.getUser).mockResolvedValue({
      id: 7, role: 'ADMIN', displayName: 'Admin Anne',
    } as any);
    const blockers = await validateIssueEligibility({
      action: 'consume',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
      productionWorkOrderId: 'wad-1',
      travelerStepId: 'step-wrong',
      override: {
        reason: 'ROUTING_STEP_BYPASS',
        approvalId: 'apv-admin',
        approverUserId: 7,
        approverDisplayName: 'Admin Anne',
        approverRole: 'ADMIN',
        writtenReason: 'Trying to override as admin — should be rejected',
      },
    });
    expect(blockers.map((b) => b.code)).toContain('WRONG_ROUTING_STEP');
  });

  it('rejects caller-asserted intendedRoutingStepId that conflicts with persisted packet pin', async () => {
    withActiveSteps([
      { id: 'step-active', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 1 },
      { id: 'step-wrong', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 2 },
    ]);
    dbSelectResults.current = [{ intendedRoutingStepId: 'step-wrong' }];
    const blockers = await validateIssueEligibility({
      action: 'consume',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
      productionWorkOrderId: 'wad-1',
      travelerStepId: 'step-active',
      packetId: 'pkt-1',
      intendedRoutingStepId: 'step-active',
    });
    expect(blockers.map((b) => b.code)).toContain('WRONG_ROUTING_STEP');
  });

  it('replaces caller-asserted override with server-verified identity on the request', async () => {
    withActiveSteps([
      { id: 'step-active', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 1 },
      { id: 'step-wrong', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 2 },
    ]);
    vi.mocked(storage.getUser).mockResolvedValue({
      id: 42,
      role: 'Production Supervisor',
      firstName: 'DB-Sammy',
      lastName: null,
      username: 'sammy',
    } as any);
    const req: any = {
      action: 'consume',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
      productionWorkOrderId: 'wad-1',
      travelerStepId: 'step-wrong',
      override: {
        reason: 'ROUTING_STEP_BYPASS',
        approvalId: 'apv-9',
        approverUserId: 42,
        approverDisplayName: 'CALLER-CLAIMED-NAME',
        approverRole: 'CALLER-CLAIMED-ROLE',
        writtenReason: 'CALLER-CLAIMED-REASON',
      },
    };
    dbSelectResults.current = [{
      id: 'apv-9',
      reason: 'ROUTING_STEP_BYPASS',
      bypassesBlocker: 'WRONG_ROUTING_STEP',
      materialLotId: lot.id,
      travelerId: 't1',
      intendedRoutingStepId: null,
      approverUserId: 42,
      approverRoleAtApproval: 'Production Supervisor',
      writtenReason: 'PERSISTED-REASON-FROM-APPROVAL-ROW',
      status: 'APPROVED',
      approvedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      consumedByLedgerEntryId: null,
      revokedAt: null,
      revokedByUserId: null,
      createdAt: new Date(),
    }];
    await validateIssueEligibility(req);
    expect(req.override.approverDisplayName).toBe('DB-Sammy');
    expect(req.override.writtenReason).toBe('PERSISTED-REASON-FROM-APPROVAL-ROW');
    expect(req.override.approverRole).toBe('Production Supervisor');
    expect(req.override.approverUserId).toBe(42);
  });

  it('reserve auto-pins to active step when caller omits intendedRoutingStepId', async () => {
    withActiveSteps([{ id: 'step-active', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 1 }]);
    const req: any = {
      action: 'reserve',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
      productionWorkOrderId: 'wad-1',
    };
    const blockers = await validateIssueEligibility(req);
    expect(blockers).toEqual([]);
    expect(req.intendedRoutingStepId).toBe('step-active');
  });

  it('reserve rejects intendedRoutingStepId that does not match the active step', async () => {
    withActiveSteps([
      { id: 'step-active', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 1 },
      { id: 'step-downstream', travelerId: 't1', status: 'IN_PROGRESS', stepNumber: 2 },
    ]);
    const blockers = await validateIssueEligibility({
      action: 'reserve',
      materialLotId: lot.id,
      quantity: 5,
      operator,
      travelerId: 't1',
      productionWorkOrderId: 'wad-1',
      intendedRoutingStepId: 'step-downstream',
    });
    expect(blockers.map((b) => b.code)).toContain('WRONG_ROUTING_STEP');
  });
});
