import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Traveler, TravelerStep, TravelerTask } from '../schema';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports that pull in the modules
// ---------------------------------------------------------------------------

vi.mock('../storage', () => ({
  storage: {
    getTraveler: vi.fn<(id: string) => Promise<Traveler | undefined>>(),
    getTravelerStep: vi.fn<(id: string) => Promise<TravelerStep | undefined>>(),
    getTravelerSteps: vi.fn<(travelerId: string) => Promise<TravelerStep[]>>(),
    getTravelerTasks: vi.fn<(stepId: string) => Promise<TravelerTask[]>>(),
  },
}));

interface SelectLimitChain { limit: (n: number) => Promise<Record<string, unknown>[]> }
interface SelectWhereChain { where: (cond: unknown) => SelectLimitChain }
interface SelectFromChain { from: (table: unknown) => SelectWhereChain }

vi.mock('../db', () => ({
  db: {
    select: vi.fn<() => SelectFromChain>(),
  },
}));

vi.mock('../schema', () => ({
  travelerAuthorizations: {},
  travelerMaterialConsumption: {},
}));

// Import mocked modules AFTER vi.mock() declarations
import { storage } from '../storage';
import { db } from '../db';
import {
  evaluateTravelerStartGates,
  evaluateTravelerFinishGates,
} from '../src/lib/travelerGates';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTraveler(overrides: Partial<Traveler> = {}): Traveler {
  return {
    id: 'trv-1',
    travelerNumber: 'TRV-2026-000001',
    travelerRevision: 1,
    inventoryItemId: null,
    partNumber: null,
    partName: null,
    salesOrderId: null,
    workOrderId: null,
    productionWorkOrderId: null,
    projectId: null,
    defaultChargeCodeId: null,
    lotNumber: 'LOT-001',
    serialNumber: null,
    internalControlNumber: null,
    quantity: 1,
    status: 'IN_PROGRESS',
    partRoutingId: null,
    partRoutingRevision: null,
    createdBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeStep(overrides: Partial<TravelerStep> = {}): TravelerStep {
  return {
    id: 'step-1',
    travelerId: 'trv-1',
    departmentName: 'CNC',
    stepNumber: 1,
    status: 'NOT_STARTED',
    assignedTechnicianId: null,
    startedAt: null,
    startedBy: null,
    completedAt: null,
    completedBy: null,
    blockedAt: null,
    blockedReason: null,
    notes: null,
    ...overrides,
  };
}

function makeTask(overrides: Partial<TravelerTask> = {}): TravelerTask {
  return {
    id: 'task-1',
    travelerStepId: 'step-1',
    taskType: 'QC',
    taskPhase: 'WORK',
    title: 'Inspect dimensions',
    instructions: null,
    required: true,
    sortOrder: 0,
    timePolicy: 'AUTO_ON_COMPLETE',
    requiresSignature: false,
    signatureRole: null,
    requiresCertification: false,
    instructionPack: null,
    status: 'NOT_STARTED',
    startedAt: null,
    completedAt: null,
    completedBy: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper to build a db.select() mock returning a given row set
// ---------------------------------------------------------------------------

function mockDbSelectReturning(rows: Record<string, unknown>[]): void {
  const limitFn = vi.fn<() => Promise<Record<string, unknown>[]>>().mockResolvedValue(rows);
  const whereFn = vi.fn<() => SelectLimitChain>().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn<() => SelectWhereChain>().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn });
}

// ---------------------------------------------------------------------------
// evaluateTravelerStartGates — unit tests
// ---------------------------------------------------------------------------

describe('evaluateTravelerStartGates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows the first step when all gates pass (lot on traveler)', async () => {
    const traveler = makeTraveler({ partNumber: null, lotNumber: 'LOT-001' });
    const step = makeStep({ id: 'step-1', stepNumber: 1 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    // db.select should not be called (no partNumber, lot is on traveler)
    mockDbSelectReturning([]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1');
    expect(result.allowed).toBe(true);
  });

  it('blocks when the previous step is not COMPLETED (sequence gate)', async () => {
    const traveler = makeTraveler({ partNumber: null, lotNumber: 'LOT-001' });
    const prevStep = makeStep({ id: 'step-0', stepNumber: 1, status: 'IN_PROGRESS' });
    const currStep = makeStep({ id: 'step-1', stepNumber: 2 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(currStep);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([prevStep, currStep]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/must be completed/i);
    expect(result.reason).toContain(prevStep.departmentName);
  });

  it('blocks when traveler has a partNumber but no employeeId (training gate)', async () => {
    const traveler = makeTraveler({ partNumber: 'PN-1234', lotNumber: 'LOT-001' });
    const step = makeStep();

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {});
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/could not be verified/i);
    expect(result.reason).toContain('PN-1234');
  });

  it('blocks when employee has no authorization record (training gate)', async () => {
    const traveler = makeTraveler({ partNumber: 'PN-1234', lotNumber: 'LOT-001' });
    const step = makeStep();

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    // No auth record returned from db
    mockDbSelectReturning([]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {
      employeeId: 7,
      employeeName: 'Jane Smith',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/training authorization/i);
    expect(result.reason).toContain('Jane Smith');
    expect(result.reason).toContain('PN-1234');
  });

  it('allows when employee has a valid authorization record', async () => {
    const traveler = makeTraveler({ partNumber: 'PN-1234', lotNumber: 'LOT-001' });
    const step = makeStep();

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    // Auth record found
    mockDbSelectReturning([{ id: 42 }]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {
      employeeId: 7,
      employeeName: 'Jane Smith',
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks when no material (no lot, no ICN, no consumption record)', async () => {
    const traveler = makeTraveler({
      partNumber: null,
      lotNumber: null,
      internalControlNumber: null,
    });
    const step = makeStep();

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    // No consumption record found
    mockDbSelectReturning([]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/no material/i);
  });

  it('allows when material is provided via a consumption record (no lot on traveler)', async () => {
    const traveler = makeTraveler({
      partNumber: null,
      lotNumber: null,
      internalControlNumber: null,
    });
    const step = makeStep();

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    // Consumption record found
    mockDbSelectReturning([{ id: 99 }]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1');
    expect(result.allowed).toBe(true);
  });

  it('allows when material is on traveler as an ICN (no db call needed)', async () => {
    const traveler = makeTraveler({
      partNumber: null,
      lotNumber: null,
      internalControlNumber: 'ICN-555',
    });
    const step = makeStep();

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1');
    expect(result.allowed).toBe(true);
  });

  it('blocks when traveler does not exist', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(undefined);

    const result = await evaluateTravelerStartGates('no-such', 'step-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/traveler not found/i);
  });

  it('blocks when step does not exist', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler());
    vi.mocked(storage.getTravelerStep).mockResolvedValue(undefined);

    const result = await evaluateTravelerStartGates('trv-1', 'no-such-step');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/step not found/i);
  });
});

// ---------------------------------------------------------------------------
// evaluateTravelerFinishGates — unit tests
// ---------------------------------------------------------------------------

describe('evaluateTravelerFinishGates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows sign-off when there are no required QC tasks', async () => {
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([]);

    const result = await evaluateTravelerFinishGates('step-1');
    expect(result.allowed).toBe(true);
  });

  it('allows sign-off when all required QC tasks are COMPLETED', async () => {
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([
      makeTask({ taskType: 'QC', required: true, status: 'COMPLETED' }),
      makeTask({ id: 'task-2', taskType: 'QC', required: true, status: 'COMPLETED', title: 'Check torque' }),
    ]);

    const result = await evaluateTravelerFinishGates('step-1');
    expect(result.allowed).toBe(true);
  });

  it('blocks when a required QC task is not yet COMPLETED', async () => {
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([
      makeTask({ taskType: 'QC', required: true, status: 'COMPLETED' }),
      makeTask({ id: 'task-2', taskType: 'QC', required: true, status: 'NOT_STARTED', title: 'Final dimension check' }),
    ]);

    const result = await evaluateTravelerFinishGates('step-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/required QC tasks must be completed/i);
    expect(result.reason).toContain('Final dimension check');
  });

  it('blocks when multiple required QC tasks are incomplete', async () => {
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([
      makeTask({ taskType: 'QC', required: true, status: 'NOT_STARTED', title: 'Task A' }),
      makeTask({ id: 'task-2', taskType: 'QC', required: true, status: 'NOT_STARTED', title: 'Task B' }),
    ]);

    const result = await evaluateTravelerFinishGates('step-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Task A');
    expect(result.reason).toContain('Task B');
  });

  it('ignores optional QC tasks that are incomplete', async () => {
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([
      makeTask({ taskType: 'QC', required: false, status: 'NOT_STARTED', title: 'Optional visual' }),
    ]);

    const result = await evaluateTravelerFinishGates('step-1');
    expect(result.allowed).toBe(true);
  });

  it('ignores non-QC tasks that are incomplete', async () => {
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([
      makeTask({ taskType: 'START_GATE', required: true, status: 'NOT_STARTED', title: 'Start gate' }),
    ]);

    const result = await evaluateTravelerFinishGates('step-1');
    expect(result.allowed).toBe(true);
  });

  it('ignores END_GATE tasks even if required and incomplete', async () => {
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([
      makeTask({ taskType: 'END_GATE', required: true, status: 'NOT_STARTED', title: 'End gate' }),
    ]);

    const result = await evaluateTravelerFinishGates('step-1');
    expect(result.allowed).toBe(true);
  });
});
