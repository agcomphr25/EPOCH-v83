import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { Traveler, TravelerStep, TravelerTask } from '../schema';
import type { GateResult } from '../src/lib/travelerGates';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../src/lib/travelerGates', () => ({
  evaluateTravelerStartGates: vi.fn<() => Promise<GateResult>>(),
  evaluateTravelerFinishGates: vi.fn<() => Promise<GateResult>>(),
  evaluateStartGatesDetailed: vi.fn().mockResolvedValue({ allowed: true }),
  evaluateWadReleaseGate: vi.fn().mockResolvedValue({ allowed: true }),
  buildGateErrorBody: (code: string, error: string, reason: string) => ({ error, reason, code }),
  buildTrainingGateErrorBody: (
    error: string,
    reason: string,
    missingRequirement?: unknown,
    requirementType?: unknown,
  ) => ({ error, reason, code: 'training_gate', missingRequirement, requirementType }),
}));

vi.mock('../src/lib/trainingEnforcement', () => ({
  evaluateTravelerTrainingGate: vi.fn().mockResolvedValue({ allowed: true }),
  evaluateQcTrainingGate: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('../src/lib/resolveChargeCode', () => ({
  resolveChargeCode: vi.fn().mockResolvedValue({ error: 'no work order linked' }),
  deriveProjectId: vi.fn().mockResolvedValue(null),
  resolveCertificationStatus: vi.fn().mockResolvedValue({ status: 'OK', certificationName: null, reason: null }),
  resolveBudgetOverrunState: vi.fn().mockResolvedValue({ isOverrun: false, nearlyExhausted: false, overrunReason: null }),
}));

vi.mock('../src/lib/featureFlags', () => ({
  laborAllocationsEnabled: false,
}));

vi.mock('../src/lib/productionWorkflowReadiness', () => ({
  ensureProductionWorkflowReadSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/packetResolution', () => ({
  resolvePacketBarcode: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/services/laborAllocationService', () => ({
  switchAllocation: vi.fn().mockResolvedValue(undefined),
  closeAllocation: vi.fn().mockResolvedValue(undefined),
  openAllocation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/helpers/travelerBarcodeResolver', () => ({
  buildChargeContextFromTraveler: vi.fn().mockResolvedValue({ ok: false, error: { code: 'NO_WO', message: 'no wo' } }),
}));

vi.mock('../src/routes/timeClock', () => ({
  executeTravelerAutoPunch: vi.fn().mockResolvedValue({ ok: true, action: 'unchanged', chargeContext: null }),
}));

vi.mock('../src/services/auditService', () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue(undefined),
    getEventSetting: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../middleware/requirePermission', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../middleware/actionToken', () => ({
  validateActionToken: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../src/permissions', () => ({
  requireScopedCapability: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  ScopedForbiddenError: class ScopedForbiddenError extends Error {},
}));

vi.mock('../src/services/routingStepService', () => ({
  getActiveRoutingStep: vi.fn().mockResolvedValue(null),
}));

vi.mock('../storage', () => ({
  storage: {
    getTraveler: vi.fn<(id: string) => Promise<Traveler | undefined>>(),
    getTravelerStep: vi.fn<(id: string) => Promise<TravelerStep | undefined>>(),
    getTravelerSteps: vi.fn<(travelerId: string) => Promise<TravelerStep[]>>(),
    getTravelerTasks: vi.fn<(stepId: string) => Promise<TravelerTask[]>>(),
    updateTravelerStep: vi.fn<(id: string, data: unknown) => Promise<TravelerStep>>(),
    updateTravelerTask: vi.fn<(id: string, data: unknown) => Promise<TravelerTask>>(),
    createTravelerSignature: vi.fn<(data: unknown) => Promise<unknown>>(),
    createTravelerEvent: vi.fn<(data: unknown) => Promise<unknown>>(),
    updateTraveler: vi.fn<(id: string, data: unknown) => Promise<Traveler>>(),
  },
}));

interface SelectLimitChain { limit: (n: number) => Promise<Record<string, unknown>[]> }
interface SelectWhereChain { where: (cond: unknown) => SelectLimitChain }
interface SelectFromChain { from: (table: unknown) => SelectWhereChain }
interface MockDbQueryChain { findFirst: (opts?: unknown) => Promise<unknown> }

vi.mock('../db', () => ({
  db: {
    select: vi.fn<() => SelectFromChain>(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    query: {
      p2SerializedItems: { findFirst: vi.fn<() => Promise<unknown>>().mockResolvedValue(null) },
      partRoutings: { findFirst: vi.fn<() => Promise<unknown>>().mockResolvedValue(null) },
    },
  },
  pool: {
    query: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    end: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

// Minimal schema mock — the route imports many table definitions but for
// these endpoints it only runs db.select against `employees` for badge scans.
vi.mock('../schema', () => ({
  employees: {},
  p2SerializedItems: {},
  p2SerializedItemEvents: {},
  travelers: {},
  travelerSteps: {},
  travelerAuthorizedNotes: {},
  partRoutings: {},
  inventoryItems: {},
  manufacturingQueue: {},
  productionWorkOrders: {},
  travelerAuthorizations: {},
  travelerMaterialConsumption: {},
  insertTravelerSchema: { parse: vi.fn() },
  insertTravelerStepSchema: { parse: vi.fn() },
  insertTravelerTaskSchema: { parse: vi.fn() },
  insertTravelerTaskFieldSchema: { parse: vi.fn() },
  insertTravelerSignatureSchema: { parse: vi.fn() },
  insertTravelerAuthorizedNoteSchema: { parse: vi.fn() },
  getSupplySourceDashboard: vi.fn().mockResolvedValue([]),
  supplySourceDashboardToLegacyDept: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { evaluateTravelerStartGates, evaluateTravelerFinishGates } from '../src/lib/travelerGates';
import { storage } from '../storage';
import { db } from '../db';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const TRAVELER_ID = 'trv-aabbccdd-1111';
const STEP_ID = 'step-aabbccdd-2222';

function makeTraveler(overrides: Partial<Traveler> = {}): Traveler {
  return {
    id: TRAVELER_ID,
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
    id: STEP_ID,
    travelerId: TRAVELER_ID,
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
    travelerStepId: STEP_ID,
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
    completedAt: new Date(),
    completedBy: 'operator',
    ...overrides,
  };
}

// Build the db.select() chain so badge scan lookup returns empty (no badge match)
function mockNoBadgeScan(): void {
  const limitFn = vi.fn<() => Promise<Record<string, unknown>[]>>().mockResolvedValue([]);
  const whereFn = vi.fn<() => SelectLimitChain>().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn<() => SelectFromChain>().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn });
}

// ---------------------------------------------------------------------------
// POST /:travelerId/steps/:stepId/start — integration tests
// ---------------------------------------------------------------------------

describe('POST /api/travelers/:travelerId/steps/:stepId/start', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const travelersRouter = (await import('../src/routes/travelers')).default;
    app.use('/api/travelers', travelersRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 403 with a reason field when a start gate blocks the step', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler());
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    mockNoBadgeScan();
    vi.mocked(evaluateTravelerStartGates).mockResolvedValue({
      allowed: false,
      reason: 'Step 1 (Layup) must be completed before this step can be started.',
    });

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/start`)
      .send({ startedBy: 'operator1' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/blocked by process gate/i);
    expect(res.body.reason).toBeTruthy();
    expect(res.body.reason).toContain('must be completed');
  });

  it('returns 403 with a training reason when the training gate blocks the step', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler({ partNumber: 'PN-1234' }));
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    mockNoBadgeScan();
    vi.mocked(evaluateTravelerStartGates).mockResolvedValue({
      allowed: false,
      reason: 'Employee identity could not be verified for part PN-1234. Scan a valid badge or enter a recognized employee code before starting this step.',
    });

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/start`)
      .send({ startedBy: 'operator1' });

    expect(res.status).toBe(403);
    expect(res.body.reason).toMatch(/could not be verified/i);
  });

  it('returns 403 with a material reason when the material gate blocks the step', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(
      makeTraveler({ lotNumber: null, internalControlNumber: null })
    );
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    mockNoBadgeScan();
    vi.mocked(evaluateTravelerStartGates).mockResolvedValue({
      allowed: false,
      reason: 'No material (lot number or ICN) has been allocated to this traveler. Assign material before starting.',
    });

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/start`)
      .send({ startedBy: 'operator1' });

    expect(res.status).toBe(403);
    expect(res.body.reason).toMatch(/no material/i);
  });

  it('returns 400 when the traveler is not IN_PROGRESS', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler({ status: 'DRAFT' }));
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep());
    mockNoBadgeScan();

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/start`)
      .send({ startedBy: 'operator1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/IN_PROGRESS/i);
  });

  it('returns 404 when the traveler does not exist', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(undefined);
    mockNoBadgeScan();

    const res = await request(app)
      .post(`/api/travelers/no-such/steps/${STEP_ID}/start`)
      .send({ startedBy: 'operator1' });

    expect(res.status).toBe(404);
  });

  it('returns 200 when all gates pass and step is updated', async () => {
    const layupStep = makeStep({ departmentName: 'Layup' }); // non-CNC to avoid pool.query branch
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler());
    vi.mocked(storage.getTravelerStep).mockResolvedValue(layupStep);
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([]);
    vi.mocked(storage.createTravelerEvent).mockResolvedValue({});
    mockNoBadgeScan();
    vi.mocked(evaluateTravelerStartGates).mockResolvedValue({ allowed: true });
    const updatedStep = makeStep({ departmentName: 'Layup', status: 'IN_PROGRESS', startedAt: new Date(), startedBy: 'operator1' });
    vi.mocked(storage.updateTravelerStep).mockResolvedValue(updatedStep);

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/start`)
      .send({ startedBy: 'operator1' });

    expect(res.status).toBe(200);
    // The start route returns the updated step object directly (not wrapped)
    expect(res.body.id).toBe(STEP_ID);
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(evaluateTravelerStartGates).toHaveBeenCalledWith(
      TRAVELER_ID,
      STEP_ID,
      expect.objectContaining({ employeeName: 'operator1' })
    );
  });
});

// ---------------------------------------------------------------------------
// Task #212 regression — A Badge Scan task with requiresCertification: true
// must be auto-completed during /start (it was previously excluded by the
// auto-complete filter because of the cert flag) so the subsequent /sign
// call does not fail with `incomplete_tasks` for the hidden Badge Scan
// task. Exercised end-to-end through the route handler.
// ---------------------------------------------------------------------------

describe('Task #212: Badge Scan task with requiresCertification auto-completes on /start', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const travelersRouter = (await import('../src/routes/travelers')).default;
    app.use('/api/travelers', travelersRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('auto-completes a Badge Scan CHECK task with requiresCertification: true and lets /sign succeed', async () => {
    // Traveler with no production work order → skips auto-punch / WAD code paths,
    // keeping the test focused on the badge-gate auto-completion fix.
    const traveler = makeTraveler({ productionWorkOrderId: null, partRoutingId: null });
    const startedStep = makeStep({
      departmentName: 'Layup', // non-CNC → skips CNC auto-create branch
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      startedBy: 'operator1',
    });
    const badgeTask: TravelerTask = makeTask({
      id: 'task-badge-cert-1',
      taskType: 'CHECK',
      taskPhase: 'START',
      title: 'Badge Scan',
      requiresSignature: false,
      requiresCertification: true,
      required: true,
      status: 'NOT_STARTED',
      completedAt: null,
      completedBy: null,
    });

    vi.mocked(storage.getTraveler).mockResolvedValue(traveler);
    vi.mocked(storage.getTravelerStep).mockResolvedValue(
      makeStep({ departmentName: 'Layup', status: 'NOT_STARTED' }),
    );
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([badgeTask]);
    vi.mocked(storage.updateTravelerStep).mockResolvedValue(startedStep);
    vi.mocked(storage.createTravelerEvent).mockResolvedValue({});
    mockNoBadgeScan();
    vi.mocked(evaluateTravelerStartGates).mockResolvedValue({ allowed: true });

    // Capture every updateTravelerTask call so we can assert the badge task
    // was completed AND replay the same completion shape into the /sign call.
    const taskUpdates: Array<{ id: string; data: Partial<TravelerTask> }> = [];
    vi.mocked(storage.updateTravelerTask).mockImplementation(
      async (id: string, data: Partial<TravelerTask>) => {
        taskUpdates.push({ id, data });
        return { ...badgeTask, ...data, id };
      },
    );

    // ---- /start ----------------------------------------------------------
    const startRes = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/start`)
      .send({ startedBy: 'operator1', badgeScan: 'BADGE-001' });

    expect(startRes.status).toBe(200);
    expect(startRes.body.id).toBe(STEP_ID);
    expect(startRes.body.status).toBe('IN_PROGRESS');

    // The Badge Scan task — even with requiresCertification: true — must
    // have been auto-completed during /start with completedAt + completedBy.
    const badgeUpdate = taskUpdates.find((u) => u.id === 'task-badge-cert-1');
    expect(badgeUpdate).toBeDefined();
    expect(badgeUpdate?.data.status).toBe('COMPLETED');
    expect(badgeUpdate?.data.completedBy).toBe('operator1');
    expect(badgeUpdate?.data.completedAt).toBeInstanceOf(Date);

    // ---- /sign -----------------------------------------------------------
    // Replay the completed badge task into storage so the sign endpoint sees
    // the same state the database would after the /start handler ran.
    const completedBadgeTask: TravelerTask = {
      ...badgeTask,
      status: 'COMPLETED',
      completedBy: 'operator1',
      completedAt: new Date(),
    };
    vi.mocked(storage.getTravelerStep).mockResolvedValue(
      makeStep({ departmentName: 'Layup', status: 'IN_PROGRESS' }),
    );
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([completedBadgeTask]);
    vi.mocked(evaluateTravelerFinishGates).mockResolvedValue({ allowed: true });
    vi.mocked(storage.createTravelerSignature).mockResolvedValue({ id: 'sig-task212' });
    vi.mocked(storage.updateTravelerStep).mockResolvedValue(makeStep({ status: 'COMPLETED' }));
    vi.mocked(storage.updateTraveler).mockResolvedValue(traveler);

    const signRes = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/sign`)
      .send({
        signedBy: 'operator1',
        meaning: 'OPERATOR_SIGN_OFF',
        signatureData: 'data:image/png;base64,abc123',
      });

    // Most importantly: no `incomplete_tasks` rejection for the hidden Badge
    // Scan task. Either we get the success path (200) or, if a downstream
    // mock is incomplete, anything BUT the regression-specific 403 with
    // `incomplete_tasks` for a badge-named task.
    expect(signRes.status).toBe(200);
    expect(signRes.body.error).toBeUndefined();
    expect(signRes.body.signature?.id).toBe('sig-task212');
    // Defense-in-depth: if the regression returned, this would surface here.
    if (signRes.body.code) {
      expect(signRes.body.code).not.toBe('incomplete_tasks');
    }
  });
});

// ---------------------------------------------------------------------------
// POST /:travelerId/steps/:stepId/sign — integration tests
// ---------------------------------------------------------------------------

describe('POST /api/travelers/:travelerId/steps/:stepId/sign', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const travelersRouter = (await import('../src/routes/travelers')).default;
    app.use('/api/travelers', travelersRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  const validSignBody = {
    signedBy: 'operator1',
    meaning: 'OPERATOR_SIGN_OFF',
    signatureData: 'data:image/png;base64,abc123',
  };

  it('returns 403 with a reason field when required QC tasks are incomplete', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler());
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep({ status: 'IN_PROGRESS' }));
    vi.mocked(evaluateTravelerFinishGates).mockResolvedValue({
      allowed: false,
      reason: 'The following required QC tasks must be completed before signing off: Inspect dimensions.',
    });

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/sign`)
      .send(validSignBody);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/blocked by process gate/i);
    expect(res.body.reason).toBeTruthy();
    expect(res.body.reason).toMatch(/required QC tasks/i);
  });

  it('returns 403 when no signature drawing is provided', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler());
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep({ status: 'IN_PROGRESS' }));

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/sign`)
      .send({ signedBy: 'operator1', meaning: 'OPERATOR_SIGN_OFF' }); // no signatureData

    expect(res.status).toBe(403);
    expect(res.body.reason).toMatch(/drawn signature is required/i);
  });

  it('returns 400 when the step is not IN_PROGRESS', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler());
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep({ status: 'COMPLETED' }));

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/sign`)
      .send(validSignBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/IN_PROGRESS/i);
  });

  it('returns 404 when the traveler does not exist', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(undefined);

    const res = await request(app)
      .post(`/api/travelers/no-such/steps/${STEP_ID}/sign`)
      .send(validSignBody);

    expect(res.status).toBe(404);
  });

  it('returns 400 when signedBy or meaning is missing', async () => {
    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/sign`)
      .send({ signatureData: 'data:image/png;base64,abc123' }); // no signedBy/meaning

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signedBy and meaning are required/i);
  });

  it('returns 200 with step/signature/stepCompleted when all QC tasks are complete', async () => {
    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler());
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep({ status: 'IN_PROGRESS' }));
    // A single completed QC task — no pending gates, so the step completes
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([
      makeTask({ status: 'COMPLETED' }),
    ]);
    vi.mocked(evaluateTravelerFinishGates).mockResolvedValue({ allowed: true });
    vi.mocked(storage.createTravelerSignature).mockResolvedValue({ id: 'sig-1' });
    vi.mocked(storage.updateTravelerStep).mockResolvedValue(
      makeStep({ status: 'COMPLETED' })
    );
    vi.mocked(storage.updateTraveler).mockResolvedValue(makeTraveler());
    vi.mocked(storage.createTravelerEvent).mockResolvedValue({});

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/sign`)
      .send(validSignBody);

    expect(res.status).toBe(200);
    expect(res.body.signature).toBeDefined();
    expect(res.body.signature.id).toBe('sig-1');
    expect(res.body).toHaveProperty('stepCompleted');
    expect(evaluateTravelerFinishGates).toHaveBeenCalledWith(STEP_ID);
  });
});
