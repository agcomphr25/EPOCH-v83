import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Traveler, TravelerStep, TravelerTask, RoutingOperation } from '../schema';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../storage', () => ({
  storage: {
    getTraveler: vi.fn<(id: string) => Promise<Traveler | undefined>>(),
    getTravelerStep: vi.fn<(id: string) => Promise<TravelerStep | undefined>>(),
    getTravelerTasks: vi.fn<(stepId: string) => Promise<TravelerTask[]>>(),
    getRoutingOperationForTravelerStep: vi.fn<(partRoutingId: string, stepNumber: number) => Promise<RoutingOperation | undefined>>(),
    getCertificationById: vi.fn<(certificationId: number) => Promise<{ id: number; name: string } | undefined>>(),
    anyAuthorizationsExistForPart: vi.fn<(partNumber: string) => Promise<boolean>>(),
    getActiveTravelerAuthorizationForEmployee: vi.fn<(employeeId: number, partNumber: string) => Promise<{ id: number; expiresAt: Date | null } | undefined>>(),
    getP2PartCertificationForStep: vi.fn<(partNumber: string, department: string) => Promise<{ id: number; partNumber: string; departments: string[] } | undefined>>(),
    checkEmployeeP2PartCertification: vi.fn<(employeeId: number, partNumber: string, department: string) => Promise<boolean>>(),
    checkEmployeeHasValidTrainingCertificationForCert: vi.fn<(employeeId: number, certificationId: number) => Promise<{ id: number; status: string; expiresAt: Date | null } | undefined>>(),
    checkEmployeeHasValidTrainingCertification: vi.fn<(employeeId: number, partNumber: string) => Promise<{ id: number; status: string; expiresAt: Date | null } | undefined>>(),
  },
}));

import { storage } from '../storage';
import {
  evaluateTravelerTrainingGate,
  evaluateQcTrainingGate,
} from '../src/lib/trainingEnforcement';

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
    stepNumber: 3,
    status: 'IN_PROGRESS',
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
    status: 'COMPLETED',
    startedAt: null,
    completedAt: null,
    completedBy: null,
    ...overrides,
  };
}

// Shared routing-op setup helpers

function makeRoutingOp(overrides: Partial<RoutingOperation> = {}): RoutingOperation {
  return {
    id: 10,
    partRoutingId: 'routing-abc',
    stepNumber: 3,
    departmentName: 'CNC',
    operationName: 'Default Op',
    operationType: 'RUN',
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

function mockNoRoutingOp(): void {
  vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(undefined);
}

function mockRoutingOpWithCert(certId: number, certName: string): void {
  vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
    makeRoutingOp({ certificationId: certId })
  );
  vi.mocked(storage.getCertificationById).mockResolvedValue({ id: certId, name: certName });
}

// ---------------------------------------------------------------------------
// evaluateTravelerTrainingGate
// ---------------------------------------------------------------------------

describe('evaluateTravelerTrainingGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Identity always required, even for no-partNumber / no-op-cert travelers ---

  it('blocks when traveler has no partNumber, no op cert, and no employeeId (identity always required)', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler({ partNumber: null, partRoutingId: null }));
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());

    const result = await evaluateTravelerTrainingGate('trv-1', 'step-1', undefined);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/identity/i);
    expect(result.requirementType).toBe('traveler_authorization');
  });

  it('allows when traveler has no partNumber, no op cert, and identity is provided', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler({ partNumber: null, partRoutingId: null }));
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());

    const result = await evaluateTravelerTrainingGate('trv-1', 'step-1', 7, 'Alice');
    expect(result.allowed).toBe(true);
  });

  it('allows when traveler has no partNumber, routing op has no certificationId, and identity is provided', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler({ partNumber: null, partRoutingId: 'routing-abc' }));
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    vi.mocked(storage.getRoutingOperationForTravelerStep).mockResolvedValue(
      makeRoutingOp({ certificationId: null })
    );

    const result = await evaluateTravelerTrainingGate('trv-1', 'step-1', 7, 'Alice');
    expect(result.allowed).toBe(true);
  });

  // --- No-partNumber traveler WITH a routing op cert requirement ---

  it('blocks when no-partNumber traveler has operation cert requirement but no employeeId', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler({ partNumber: null, partRoutingId: 'routing-abc' }));
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    mockRoutingOpWithCert(5, 'Weld Cert Level II');

    const result = await evaluateTravelerTrainingGate('trv-1', 'step-1', undefined);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Weld Cert Level II/);
    expect(result.reason).toMatch(/identity/i);
  });

  it('blocks when no-partNumber traveler has operation cert requirement and employee lacks the cert', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler({ partNumber: null, partRoutingId: 'routing-abc' }));
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    mockRoutingOpWithCert(5, 'Weld Cert Level II');
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue(undefined);

    const result = await evaluateTravelerTrainingGate('trv-1', 'step-1', 7, 'Bob Jones');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Weld Cert Level II/);
    expect(result.reason).toContain('Bob Jones');
    expect(result.requirementType).toBe('training_module');
    // Regression guard: cert check must be called with the specific required cert ID (5).
    // If this assertion fails it means the gate is ignoring certificationId and checking
    // for any cert — which would let workers with an unrelated cert pass.
    expect(storage.checkEmployeeHasValidTrainingCertificationForCert).toHaveBeenCalledWith(7, 5);
  });

  it('blocks when no-partNumber traveler has operation cert and the cert is expired', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler({ partNumber: null, partRoutingId: 'routing-abc' }));
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    mockRoutingOpWithCert(5, 'Pressure Test Cert');
    // Storage returns undefined because the only record is expired
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue(undefined);

    const result = await evaluateTravelerTrainingGate('trv-1', 'step-1', 7, 'Alice Lee');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Pressure Test Cert/);
    expect(result.reason).toContain('Alice Lee');
  });

  it('allows when no-partNumber traveler has operation cert and employee holds a valid non-expired cert', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler({ partNumber: null, partRoutingId: 'routing-abc' }));
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    mockRoutingOpWithCert(5, 'Weld Cert Level II');
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue({
      id: 88,
      status: 'certified',
      expiresAt: new Date(Date.now() + 86400_000 * 365),
    });

    const result = await evaluateTravelerTrainingGate('trv-1', 'step-1', 7, 'Bob Jones');
    expect(result.allowed).toBe(true);
  });

  // --- partNumber traveler WITH operation cert requirement ---

  it('blocks when partNumber traveler has valid auth but missing operation cert', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(
      makeTraveler({ partNumber: 'PN-9999', partRoutingId: 'routing-xyz' })
    );
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    vi.mocked(storage.getActiveTravelerAuthorizationForEmployee).mockResolvedValue({ id: 1, expiresAt: null });
    vi.mocked(storage.getP2PartCertificationForStep).mockResolvedValue(undefined);
    mockRoutingOpWithCert(7, 'CNC Operator Cert');
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue(undefined);

    const result = await evaluateTravelerTrainingGate('trv-1', 'step-1', 7, 'Dan Wu');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/CNC Operator Cert/);
    expect(result.reason).toContain('Dan Wu');
    expect(result.requirementType).toBe('training_module');
  });

  it('allows when partNumber traveler has valid auth and valid operation cert', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(
      makeTraveler({ partNumber: 'PN-9999', partRoutingId: 'routing-xyz' })
    );
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    vi.mocked(storage.getActiveTravelerAuthorizationForEmployee).mockResolvedValue({ id: 1, expiresAt: null });
    vi.mocked(storage.getP2PartCertificationForStep).mockResolvedValue(undefined);
    mockRoutingOpWithCert(7, 'CNC Operator Cert');
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue({
      id: 99,
      status: 'certified',
      expiresAt: null,
    });

    const result = await evaluateTravelerTrainingGate('trv-1', 'step-1', 7, 'Dan Wu');
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluateQcTrainingGate — operation cert checks
// ---------------------------------------------------------------------------

describe('evaluateQcTrainingGate — operation cert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows when no tasks require certification (gate short-circuits)', async () => {
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([
      makeTask({ requiresCertification: false }),
    ]);

    const result = await evaluateQcTrainingGate('trv-1', 'step-1', 7, 'Operator');
    expect(result.allowed).toBe(true);
  });

  it('blocks when regulated task present and operation cert is missing', async () => {
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([
      makeTask({ requiresCertification: true }),
    ]);
    vi.mocked(storage.getTraveler).mockResolvedValue(
      makeTraveler({ partNumber: 'PN-1111', partRoutingId: 'routing-qc' })
    );
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    vi.mocked(storage.getActiveTravelerAuthorizationForEmployee).mockResolvedValue({ id: 1, expiresAt: null });
    vi.mocked(storage.getP2PartCertificationForStep).mockResolvedValue(undefined);
    mockRoutingOpWithCert(9, 'QC Inspector Cert');
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue(undefined);

    const result = await evaluateQcTrainingGate('trv-1', 'step-1', 7, 'Inspector Kim');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/QC Inspector Cert/);
    expect(result.reason).toContain('Inspector Kim');
    expect(result.requirementType).toBe('training_module');
    // Regression guard: must be called with the specific cert ID (9).
    expect(storage.checkEmployeeHasValidTrainingCertificationForCert).toHaveBeenCalledWith(7, 9);
  });

  it('allows when regulated task present, operation cert is valid, and training cert is valid', async () => {
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([
      makeTask({ requiresCertification: true }),
    ]);
    vi.mocked(storage.getTraveler).mockResolvedValue(
      makeTraveler({ partNumber: 'PN-1111', partRoutingId: 'routing-qc' })
    );
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    vi.mocked(storage.getActiveTravelerAuthorizationForEmployee).mockResolvedValue({ id: 1, expiresAt: null });
    vi.mocked(storage.getP2PartCertificationForStep).mockResolvedValue(undefined);
    mockRoutingOpWithCert(9, 'QC Inspector Cert');
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue({
      id: 77,
      status: 'certified',
      expiresAt: null,
    });
    vi.mocked(storage.checkEmployeeHasValidTrainingCertification).mockResolvedValue({
      id: 77,
      status: 'certified',
      expiresAt: null,
    });

    const result = await evaluateQcTrainingGate('trv-1', 'step-1', 7, 'Inspector Kim');
    expect(result.allowed).toBe(true);
  });

  it('blocks when regulated task present but general training cert is missing after op-cert passes', async () => {
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([
      makeTask({ requiresCertification: true }),
    ]);
    vi.mocked(storage.getTraveler).mockResolvedValue(
      makeTraveler({ partNumber: 'PN-1111', partRoutingId: 'routing-qc' })
    );
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    vi.mocked(storage.getActiveTravelerAuthorizationForEmployee).mockResolvedValue({ id: 1, expiresAt: null });
    vi.mocked(storage.getP2PartCertificationForStep).mockResolvedValue(undefined);
    mockRoutingOpWithCert(9, 'QC Inspector Cert');
    vi.mocked(storage.checkEmployeeHasValidTrainingCertificationForCert).mockResolvedValue({
      id: 77,
      status: 'certified',
      expiresAt: null,
    });
    // General training cert missing
    vi.mocked(storage.checkEmployeeHasValidTrainingCertification).mockResolvedValue(undefined);

    const result = await evaluateQcTrainingGate('trv-1', 'step-1', 7, 'Inspector Kim');
    expect(result.allowed).toBe(false);
    expect(result.requirementType).toBe('training_module');
    expect(result.reason).toMatch(/training certification/i);
  });

  it('allows QC gate when no routing op cert is required but all other checks pass', async () => {
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([
      makeTask({ requiresCertification: true }),
    ]);
    vi.mocked(storage.getTraveler).mockResolvedValue(
      makeTraveler({ partNumber: 'PN-2222', partRoutingId: null })
    );
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    vi.mocked(storage.getActiveTravelerAuthorizationForEmployee).mockResolvedValue({ id: 1, expiresAt: null });
    vi.mocked(storage.getP2PartCertificationForStep).mockResolvedValue(undefined);
    vi.mocked(storage.checkEmployeeHasValidTrainingCertification).mockResolvedValue({
      id: 55,
      status: 'certified',
      expiresAt: null,
    });

    const result = await evaluateQcTrainingGate('trv-1', 'step-1', 7, 'Operator');
    expect(result.allowed).toBe(true);
  });
});
