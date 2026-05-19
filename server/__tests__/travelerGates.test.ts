import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Traveler, TravelerStep, TravelerTask, RoutingCncOperation } from '../schema';
import type { RoutingOperation } from '../schema';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports that pull in the modules
// ---------------------------------------------------------------------------

vi.mock('../storage', () => ({
  storage: {
    getTraveler: vi.fn<(id: string) => Promise<Traveler | undefined>>(),
    getTravelerStep: vi.fn<(id: string) => Promise<TravelerStep | undefined>>(),
    getTravelerSteps: vi.fn<(travelerId: string) => Promise<TravelerStep[]>>(),
    getTravelerTasks: vi.fn<(stepId: string) => Promise<TravelerTask[]>>(),
    getRoutingOperationForTravelerStep: vi.fn<(partRoutingId: string, stepNumber: number) => Promise<RoutingOperation | undefined>>(),
    getCertificationById: vi.fn<(certificationId: number) => Promise<{ id: number; name: string } | undefined>>(),
    checkEmployeeHasValidTrainingCertificationForCert: vi.fn<(employeeId: number, certificationId: number) => Promise<{ id: number; status: string; expiresAt: Date | null } | undefined>>(),
    getActiveEmployeeMachineQualificationsForEmployee: vi.fn<(employeeId: number) => Promise<Array<{ id: number; machineClass: string | null; operationType: string | null; department: string | null; expiresAt: Date | null }>>>(),
    getRoutingCncOperationForRoutingOp: vi.fn<(routingOperationId: number) => Promise<RoutingCncOperation | undefined>>(),
    getWorkOrderById: vi.fn<(id: string) => Promise<any>>(),
    updateWorkOrderStatus: vi.fn<(id: string, status: string) => Promise<any>>(),

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
  evaluateWadReleaseGate,
  evaluateTravelerStartGates,
  evaluateTravelerFinishGates,
  evaluateWadReleaseGate,
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

function makeRoutingOp(overrides: Partial<RoutingOperation> = {}): RoutingOperation {
  return {
    id: 10,
    partRoutingId: 'routing-abc',
    stepNumber: 1,
    departmentName: 'CNC',
    operationName: 'Default Op',
    operationType: null,
    workCenter: null,
    estimatedMinutes: null,
    requiresSignature: false,
    requiresCertification: false,
    certificationId: null,
    isOutsideProcess: false,
    vendorId: null,
    outsideProcessType: null,
    expectedLeadDays: null,
    certificateRequired: false,
    receivingInspectionRequired: false,
    instructionPack: {},
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper to build a db.select() mock returning a given row set
// ---------------------------------------------------------------------------

function mockDbSelectReturning(rows: Record<string, unknown>[]): void {
  const limitFn = vi.fn<() => Promise<Record<string, unknown>[]>>().mockResolvedValue(rows);
  const whereFn = vi.fn<() => SelectLimitChain>().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn<() => SelectFromChain>().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn });
}

// ---------------------------------------------------------------------------
// evaluateWadReleaseGate - unit tests
// ---------------------------------------------------------------------------

describe('evaluateWadReleaseGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('promotes an approved stale WAD to IN_PROGRESS so floor work can continue', async () => {
    vi.mocked(storage.getWorkOrderById).mockResolvedValue({
      id: 'wad-1',
      status: 'PLANNED',
      wadStatus: 'APPROVED',
    });

    const result = await evaluateWadReleaseGate('wad-1');

    expect(result.allowed).toBe(true);
    expect(storage.updateWorkOrderStatus).toHaveBeenCalledWith('wad-1', 'IN_PROGRESS');
  });

  it('allows WADs already released or in progress without rewriting status', async () => {
    vi.mocked(storage.getWorkOrderById).mockResolvedValue({
      id: 'wad-1',
      status: 'RELEASED',
      wadStatus: 'APPROVED',
    });

    const result = await evaluateWadReleaseGate('wad-1');

    expect(result.allowed).toBe(true);
    expect(storage.updateWorkOrderStatus).not.toHaveBeenCalled();
  });

  it('still blocks a true draft WAD that has not been approved for floor work', async () => {
    vi.mocked(storage.getWorkOrderById).mockResolvedValue({
      id: 'wad-1',
      status: 'PLANNED',
      wadStatus: 'DRAFT',
    });

    const result = await evaluateWadReleaseGate('wad-1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Current status: PLANNED');
    expect(storage.updateWorkOrderStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// evaluateTravelerStartGates — unit tests
// ---------------------------------------------------------------------------

describe('evaluateTravelerStartGates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default safe values for the new qualification gate methods so existing
    // tests continue to pass without modification.
    vi.mocked(storage.getActiveEmployeeMachineQualificationsForEmployee).mockResolvedValue([]);
    vi.mocked(storage.getRoutingCncOperationForRoutingOp).mockResolvedValue(undefined);
  });

  it('blocks when no-partNumber traveler has no employeeId even without op cert (identity always required)', async () => {
    const traveler = makeTraveler({ partNumber: null, lotNumber: 'LOT-001' });
    const step = makeStep({ id: 'step-1', stepNumber: 1 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/identity/i);
  });

  it('allows the first step when all gates pass (lot on traveler, identity provided)', async () => {
    const traveler = makeTraveler({ partNumber: null, lotNumber: 'LOT-001' });
    const step = makeStep({ id: 'step-1', stepNumber: 1 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    // partRoutingId is null, so routing-op check is skipped
    mockDbSelectReturning([]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', { employeeId: 7, employeeName: 'Alice' });
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
    // No auth record returned from db; partRoutingId is null so no routing-op check
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
    // Auth record found; partRoutingId is null so no routing-op check
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

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', { employeeId: 7 });
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

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', { employeeId: 7 });
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

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', { employeeId: 7 });
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

  // ---------------------------------------------------------------------------
  // Operation cert gate (Gate 2b) — new tests
  // ---------------------------------------------------------------------------

  it('blocks when no-partNumber traveler has an operation cert requirement but no employeeId', async () => {
    const traveler = makeTraveler({
      partNumber: null,
      lotNumber: 'LOT-001',
      partRoutingId: 'routing-abc',
    });
    const step = makeStep({ stepNumber: 2 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    // Even though a cert is configured, identity is checked first so the cert name
    // is not mentioned in the error — the reason is the generic identity message.
    vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
      makeRoutingOp({ id: 10, partRoutingId: 'routing-abc', stepNumber: 2, certificationId: 5 })
    );
    vi.mocked(storage.getCertificationById).mockResolvedValue({ id: 5, name: 'Weld Cert Level II' });

    const result = await evaluateTravelerStartGates('trv-1', 'step-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/identity/i);
  });

  it('blocks when no-partNumber traveler has operation cert requirement and employee is missing the cert', async () => {
    const traveler = makeTraveler({
      partNumber: null,
      lotNumber: 'LOT-001',
      partRoutingId: 'routing-abc',
    });
    const step = makeStep({ stepNumber: 2 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
      makeRoutingOp({ id: 10, partRoutingId: 'routing-abc', stepNumber: 2, certificationId: 5 })
    );
    vi.mocked(storage.getCertificationById).mockResolvedValue({ id: 5, name: 'Weld Cert Level II' });
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue(undefined);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {
      employeeId: 7,
      employeeName: 'Bob Jones',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Weld Cert Level II/);
    expect(result.reason).toContain('Bob Jones');
    // Regression guard: must be called with the specific required cert ID (5), not any other.
    expect(storage.checkEmployeeHasValidTrainingCertificationForCert).toHaveBeenCalledWith(7, 5);
  });

  it('blocks when operation cert is expired (returned as undefined from storage)', async () => {
    const traveler = makeTraveler({
      partNumber: null,
      lotNumber: 'LOT-001',
      partRoutingId: 'routing-abc',
    });
    const step = makeStep({ stepNumber: 2 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
      makeRoutingOp({ id: 10, partRoutingId: 'routing-abc', stepNumber: 2, certificationId: 5 })
    );
    vi.mocked(storage.getCertificationById).mockResolvedValue({ id: 5, name: 'Pressure Test Cert' });
    // Storage returns undefined because the only cert record is expired
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue(undefined);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {
      employeeId: 7,
      employeeName: 'Alice Lee',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Pressure Test Cert/);
    expect(result.reason).toContain('Alice Lee');
  });

  it('allows when no-partNumber traveler has operation cert and employee holds valid cert', async () => {
    const traveler = makeTraveler({
      partNumber: null,
      lotNumber: 'LOT-001',
      partRoutingId: 'routing-abc',
    });
    const step = makeStep({ stepNumber: 2 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
      makeRoutingOp({ id: 10, partRoutingId: 'routing-abc', stepNumber: 2, certificationId: 5 })
    );
    vi.mocked(storage.getCertificationById).mockResolvedValue({ id: 5, name: 'Weld Cert Level II' });
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue({
      id: 88,
      status: 'certified',
      expiresAt: new Date(Date.now() + 86400_000 * 365),
    });

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {
      employeeId: 7,
      employeeName: 'Alice Lee',
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks when partNumber traveler has operation cert requirement and employee is missing the cert (auth present)', async () => {
    const traveler = makeTraveler({
      partNumber: 'PN-9999',
      lotNumber: 'LOT-001',
      partRoutingId: 'routing-xyz',
    });
    const step = makeStep({ stepNumber: 1 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    // Auth record present
    mockDbSelectReturning([{ id: 42 }]);
    vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
      makeRoutingOp({ id: 20, partRoutingId: 'routing-xyz', stepNumber: 1, certificationId: 7 })
    );
    vi.mocked(storage.getCertificationById).mockResolvedValue({ id: 7, name: 'CNC Operator Cert' });
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue(undefined);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {
      employeeId: 7,
      employeeName: 'Dan Wu',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/CNC Operator Cert/);
    expect(result.reason).toContain('Dan Wu');
  });

  it('allows when partNumber traveler has operation cert and all checks pass', async () => {
    const traveler = makeTraveler({
      partNumber: 'PN-9999',
      lotNumber: 'LOT-001',
      partRoutingId: 'routing-xyz',
    });
    const step = makeStep({ stepNumber: 1 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    // Auth record present
    mockDbSelectReturning([{ id: 42 }]);
    vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
      makeRoutingOp({ id: 20, partRoutingId: 'routing-xyz', stepNumber: 1, certificationId: 7 })
    );
    vi.mocked(storage.getCertificationById).mockResolvedValue({ id: 7, name: 'CNC Operator Cert' });
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue({
      id: 99,
      status: 'certified',
      expiresAt: null,
    });

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {
      employeeId: 7,
      employeeName: 'Dan Wu',
    });
    expect(result.allowed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Machine-class qualification gate (Gate 2c) — new tests
  // ---------------------------------------------------------------------------

  it('blocks when the routing CNC op requires a machine class and employee has no machine qualification', async () => {
    const traveler = makeTraveler({ partNumber: null, lotNumber: 'LOT-001', partRoutingId: 'routing-abc' });
    const step = makeStep({ stepNumber: 1 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
      makeRoutingOp({ id: 10, certificationId: null })
    );
    vi.mocked(storage.getRoutingCncOperationForRoutingOp).mockResolvedValue({
      id: 1,
      routingOperationId: 10,
      machineClass: '3-Axis Mill',
      preferredMachineId: null,
      programId: null,
      fixture: null,
      estimatedSetupMinutes: null,
      estimatedCycleMinutes: null,
      proveOutRequired: false,
    });
    vi.mocked(storage.getActiveEmployeeMachineQualificationsForEmployee).mockResolvedValue([]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {
      employeeId: 7,
      employeeName: 'Sam Lee',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/machine-class qualification/i);
    expect(result.reason).toContain('3-Axis Mill');
    expect(result.reason).toContain('Sam Lee');
  });

  it('blocks when machine-class qualification is expired (not returned by getActiveEmployeeMachineQualificationsForEmployee)', async () => {
    const traveler = makeTraveler({ partNumber: null, lotNumber: 'LOT-001', partRoutingId: 'routing-abc' });
    const step = makeStep({ stepNumber: 1 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
      makeRoutingOp({ id: 10, certificationId: null })
    );
    vi.mocked(storage.getRoutingCncOperationForRoutingOp).mockResolvedValue({
      id: 1,
      routingOperationId: 10,
      machineClass: 'Lathe',
      preferredMachineId: null,
      programId: null,
      fixture: null,
      estimatedSetupMinutes: null,
      estimatedCycleMinutes: null,
      proveOutRequired: false,
    });
    // Storage filters out expired qualifications before returning, so the list
    // is empty even though the employee once had a qualification that is now past
    // its expiresAt date.
    vi.mocked(storage.getActiveEmployeeMachineQualificationsForEmployee).mockResolvedValue([]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {
      employeeId: 7,
      employeeName: 'Pat Kim',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/machine-class qualification/i);
    expect(result.reason).toContain('Lathe');
  });

  it('blocks when employee has operation-type qualifications but is missing the required one', async () => {
    const traveler = makeTraveler({ partNumber: null, lotNumber: 'LOT-001', partRoutingId: 'routing-abc' });
    const step = makeStep({ stepNumber: 1 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
      makeRoutingOp({ id: 10, operationType: 'RUN', certificationId: null })
    );
    vi.mocked(storage.getRoutingCncOperationForRoutingOp).mockResolvedValue(undefined);
    // Employee only has a SETUP qualification, not RUN — so the op-type gate fires.
    vi.mocked(storage.getActiveEmployeeMachineQualificationsForEmployee).mockResolvedValue([
      { id: 1, machineClass: null, operationType: 'SETUP', department: null, expiresAt: null },
    ]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {
      employeeId: 7,
      employeeName: 'Chris Green',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/operation-type qualification/i);
    expect(result.reason).toContain('RUN');
    expect(result.reason).toContain('Chris Green');
  });

  it('blocks when employee has NO operation-type qualifications at all and step requires one', async () => {
    const traveler = makeTraveler({ partNumber: null, lotNumber: 'LOT-001', partRoutingId: 'routing-abc' });
    const step = makeStep({ stepNumber: 1 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
      makeRoutingOp({ id: 10, operationType: 'RUN', certificationId: null })
    );
    vi.mocked(storage.getRoutingCncOperationForRoutingOp).mockResolvedValue(undefined);
    // Employee has zero qualifications — gate must still fire.
    vi.mocked(storage.getActiveEmployeeMachineQualificationsForEmployee).mockResolvedValue([]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {
      employeeId: 7,
      employeeName: 'Alex Novak',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/operation-type qualification/i);
    expect(result.reason).toContain('RUN');
    expect(result.reason).toContain('Alex Novak');
  });

  it('allows when employee holds the required machine-class and operation-type qualifications', async () => {
    const traveler = makeTraveler({ partNumber: null, lotNumber: 'LOT-001', partRoutingId: 'routing-abc' });
    const step = makeStep({ stepNumber: 1 });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(step);
    vi.mocked(storage.getTravelerSteps).mockResolvedValue([step]);
    vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
      makeRoutingOp({ id: 10, operationType: 'RUN', certificationId: null })
    );
    vi.mocked(storage.getRoutingCncOperationForRoutingOp).mockResolvedValue({
      id: 1,
      routingOperationId: 10,
      machineClass: '3-Axis Mill',
      preferredMachineId: null,
      programId: null,
      fixture: null,
      estimatedSetupMinutes: null,
      estimatedCycleMinutes: null,
      proveOutRequired: false,
    });
    vi.mocked(storage.getActiveEmployeeMachineQualificationsForEmployee).mockResolvedValue([
      { id: 1, machineClass: '3-Axis Mill', operationType: null, department: null, expiresAt: null },
      { id: 2, machineClass: null, operationType: 'RUN', department: null, expiresAt: null },
    ]);

    const result = await evaluateTravelerStartGates('trv-1', 'step-1', {
      employeeId: 7,
      employeeName: 'Jordan Rivers',
    });
    expect(result.allowed).toBe(true);
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
