import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import type { Traveler, TravelerStep, TravelerSignature, LaborApproval, ProjectClosing, Project } from '../schema';
import type { ResolvedPermissions } from '../src/services/permissionService';
import type { ReadinessResult } from '../src/lib/workOrderReadiness';
import type { GateResult } from '../src/lib/travelerGates';

const WORK_ORDER_ID = 'aabbccdd-1111-2222-3333-aabbccddeeff';
const TRAVELER_ID = 'bbccddee-2222-3333-4444-bbccddeeff00';
const STEP_ID = 'ccddee11-3333-4444-5555-ccddeeff0011';
const PROJECT_ID = 'ddeeee22-3333-4444-5555-ddeeee223344';

interface DbLimitChain {
  limit: (n: number) => Promise<Record<string, unknown>[]>;
}

interface DbWhereResultChain extends DbLimitChain {
  orderBy: (...args: unknown[]) => DbLimitChain;
}

interface DbWhereChain {
  where: (cond: unknown) => DbWhereResultChain;
  limit: (n: number) => Promise<Record<string, unknown>[]>;
  orderBy: (...args: unknown[]) => DbLimitChain;
}

interface DbFromChain {
  from: (table: unknown) => DbWhereChain;
}

vi.mock('../src/services/permissionService', () => ({
  getUserPermissions: vi.fn<(userId: number, role?: string) => Promise<ResolvedPermissions>>(),
  userHasScopedCapability: vi.fn().mockResolvedValue(true),
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user: { id: number; role: string; username: string } }).user = {
      id: 1,
      role: 'EMPLOYEE',
      username: 'test-user',
    };
    next();
  }),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

vi.mock('../db', () => {
  const limitFn = vi.fn<() => Promise<Record<string, unknown>[]>>().mockResolvedValue([]);
  const orderByFn = vi.fn<() => DbLimitChain>().mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn<() => DbWhereResultChain>().mockReturnValue({ limit: limitFn, orderBy: orderByFn });
  const fromFn = vi.fn<() => DbWhereChain>().mockReturnValue({
    where: whereFn,
    limit: limitFn,
    orderBy: orderByFn,
  });
  return {
    db: {
      select: vi.fn<() => DbFromChain>().mockReturnValue({ from: fromFn }),
      selectDistinct: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    },
    pool: {
      query: vi
        .fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>()
        .mockResolvedValue(Object.assign([], { rows: [] })),
    },
  };
});

vi.mock('../storage', () => ({
  storage: {
    getTraveler: vi.fn<(id: string) => Promise<Traveler | null>>(),
    getTravelerWithDetails: vi.fn(),
    updateTraveler: vi.fn<(id: string, data: Partial<Traveler>) => Promise<Traveler>>(),
    createTravelerEvent: vi.fn().mockResolvedValue({}),
    getTravelerStep: vi.fn<(id: string) => Promise<TravelerStep | undefined>>(),
    getTravelerTasks: vi.fn().mockResolvedValue([]),
    createTravelerSignature: vi.fn<() => Promise<TravelerSignature>>(),
    updateTravelerTask: vi.fn().mockResolvedValue({}),
    updateTravelerStep: vi.fn<(id: string, data: Partial<TravelerStep>) => Promise<TravelerStep>>(),
    getProject: vi.fn<(id: string) => Promise<Project | undefined>>(),
    createProjectClosing: vi.fn<() => Promise<ProjectClosing>>(),
    getProjectClosingByProjectId: vi.fn<(projectId: string) => Promise<ProjectClosing | null>>(),
    updateProjectClosing: vi.fn<() => Promise<ProjectClosing>>(),
    updateWorkOrderStatus: vi.fn(),
    getWorkOrderById: vi.fn().mockResolvedValue(null),
    createLaborApproval: vi.fn<() => Promise<LaborApproval>>(),
    getLaborHoursByWorkOrder: vi.fn().mockResolvedValue(0),
    getLaborHoursByWorkOrderAndDepartment: vi.fn().mockResolvedValue(0),
    getLatestLaborApprovalByWorkOrder: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../schema', () => {
  const t = {};
  const schema = { parse: vi.fn(), safeParse: vi.fn(() => ({ success: true, data: {} })) };
  return {
    workOrders: t, workOrderParts: t, workOrderAttachments: t,
    assets: t, inventoryItems: t, users: t,
    maintenanceSchedules: t, productionWorkOrders: t, employees: t,
    insertWorkOrderSchema: schema, insertWorkOrderPartSchema: schema,
    insertWorkOrderAttachmentSchema: schema, insertProductionWorkOrderSchema: schema,
    insertLaborThresholdSettingsSchema: schema,
    travelers: t, travelerSteps: t, travelerAuthorizedNotes: t,
    partRoutings: t, manufacturingQueue: t,
    getSupplySourceDashboard: t, supplySourceDashboardToLegacyDept: t,
    capabilities: t, employeeCapabilities: t,
    p2SerializedItems: t, p2SerializedItemEvents: t,
    epochExternalEvents: t, epochLaborFacts: t, apiIntegrationKeys: t,
    insertTravelerSchema: schema, insertTravelerStepSchema: schema,
    insertTravelerTaskSchema: schema, insertTravelerTaskFieldSchema: schema,
    insertTravelerSignatureSchema: schema, insertTravelerAuthorizedNoteSchema: schema,
  };
});

vi.mock('../src/helpers/laborBudgetHelper', () => ({
  evaluateWorkOrderLaborStatus: vi.fn().mockResolvedValue({
    totalHours: 10, departmentHours: null, totalBudget: 100,
    departmentBudget: null, percentUsed: 10, departmentPercentUsed: null, status: 'OK',
  }),
}));

vi.mock('../src/lib/workOrderReadiness', () => ({
  evaluateWorkOrderReadiness: vi.fn<(id: string) => Promise<ReadinessResult>>(),
}));

vi.mock('../src/services/historicP2ManufacturingReleaseService', () => ({
  HistoricP2ManufacturingReleaseError: class HistoricP2ManufacturingReleaseError extends Error {},
  listHistoricP2ManufacturingReleaseReadiness: vi.fn(),
  releaseHistoricP2ManufacturingWorkOrder: vi.fn(),
  releaseUnrelatedLegacyManufacturingWorkOrder: vi.fn(),
  resolveManufacturingOrderReleaseAuthority: vi.fn(),
}));

vi.mock('../src/services/auditService', () => ({
  auditService: { logEvent: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../src/lib/travelerGates', () => ({
  evaluateTravelerStartGates: vi.fn<() => Promise<GateResult>>().mockResolvedValue({ allowed: true }),
  evaluateTravelerFinishGates: vi.fn<() => Promise<GateResult>>().mockResolvedValue({ allowed: true }),
  evaluateStartGatesDetailed: vi.fn().mockResolvedValue({ allowed: true, gates: [] }),
}));

import { getUserPermissions } from '../src/services/permissionService';
import { storage } from '../storage';
import { evaluateWorkOrderReadiness } from '../src/lib/workOrderReadiness';
import { evaluateTravelerFinishGates } from '../src/lib/travelerGates';
import {
  releaseUnrelatedLegacyManufacturingWorkOrder,
  resolveManufacturingOrderReleaseAuthority,
} from '../src/services/historicP2ManufacturingReleaseService';

function makeTraveler(overrides: Partial<Traveler> = {}): Traveler {
  return {
    id: TRAVELER_ID,
    travelerNumber: 'TRV-001',
    travelerRevision: 1,
    status: 'DRAFT',
    createdBy: 'test-user',
    inventoryItemId: null,
    partNumber: null,
    partName: null,
    salesOrderId: null,
    workOrderId: null,
    productionWorkOrderId: null,
    projectId: null,
    defaultChargeCodeId: null,
    lotNumber: null,
    serialNumber: null,
    internalControlNumber: null,
    quantity: 1,
    partRoutingId: null,
    partRoutingRevision: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeStep(overrides: Partial<TravelerStep> = {}): TravelerStep {
  return {
    id: STEP_ID,
    travelerId: TRAVELER_ID,
    departmentName: 'WELD',
    stepNumber: 1,
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

function makeLaborApproval(overrides: Partial<LaborApproval> = {}): LaborApproval {
  return {
    id: 1,
    productionWorkOrderId: WORK_ORDER_ID,
    employeeId: 'EMP001',
    approvedBy: 'Admin User (SUP001)',
    department: null,
    reason: 'Critical',
    approvedAt: null,
    hoursAtApproval: '10',
    ...overrides,
  };
}

function makeProjectClosing(overrides: Partial<ProjectClosing> = {}): ProjectClosing {
  return {
    id: 1,
    projectId: PROJECT_ID,
    summary: null,
    whatWentWrong: null,
    strengths: null,
    opportunities: null,
    similaritiesToPriorProjects: null,
    nextProjectRecommendations: null,
    closedBy: null,
    closedByDisplayName: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    projectCode: 'PROJ-001',
    projectName: 'Test Project',
    customerId: 'CUST-001',
    description: null,
    status: null,
    currentStepType: null,
    targetShipDate: null,
    actualShipDate: null,
    currentStage: null,
    stageUpdatedAt: null,
    poId: null,
    projectManagerId: null,
    reminderDays: null,
    lastReminderSentAt: null,
    notes: null,
    defaultChargeCodeId: null,
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeSignature(overrides: Partial<TravelerSignature> = {}): TravelerSignature {
  return {
    id: 'SIG-001',
    travelerStepId: STEP_ID,
    travelerTaskId: null,
    signedBy: '1',
    signedByName: null,
    signatureRole: null,
    badgeScan: null,
    signedAt: null,
    meaning: 'APPROVED',
    notes: null,
    signatureHash: null,
    signatureData: null,
    ...overrides,
  };
}

function allow(capability: string): void {
  vi.mocked(getUserPermissions).mockResolvedValue({
    permissionSet: new Set([capability]),
    permissions: [capability],
  });
}

function deny(): void {
  vi.mocked(getUserPermissions).mockResolvedValue({
    permissionSet: new Set<string>(),
    permissions: [],
  });
}

function injectUser(app: express.Express): void {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!(req as Request & { user?: unknown }).user) {
      (req as Request & { user: { id: number; role: string; username: string } }).user = {
        id: 1,
        role: 'EMPLOYEE',
        username: 'test-user',
      };
    }
    next();
  });
}

function makeDbChain(rows: Record<string, unknown>[]): DbFromChain {
  const limitFn = vi.fn<() => Promise<Record<string, unknown>[]>>().mockResolvedValue(rows);
  const orderByFn = vi.fn<() => DbLimitChain>().mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn<() => DbWhereResultChain>().mockReturnValue({ limit: limitFn, orderBy: orderByFn });
  return {
    from: vi.fn<() => DbWhereChain>().mockReturnValue({ where: whereFn, limit: limitFn, orderBy: orderByFn }),
  };
}

describe('Permission enforcement — work_orders.release', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    injectUser(app);
    const router = (await import('../src/routes/workOrders')).default;
    app.use('/api/work-orders', router);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 403 with correct shape when user lacks work_orders.release', async () => {
    deny();

    const res = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/release`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.body.requiredCapability).toBe('work_orders.release');
  });

  it('proceeds past permission gate when user has work_orders.release', async () => {
    allow('work_orders.release');

    const readyResult: ReadinessResult = { status: 'READY' };
    vi.mocked(evaluateWorkOrderReadiness).mockResolvedValue(readyResult);
    vi.mocked(resolveManufacturingOrderReleaseAuthority).mockResolvedValue(
      'UNRELATED_LEGACY'
    );

    const { db } = await import('../db');
    vi.mocked(db.select).mockReturnValue(
      makeDbChain([
        { id: WORK_ORDER_ID, projectId: PROJECT_ID, status: 'DRAFT' },
      ])
    );

    const released = makeTraveler({ status: 'IN_PROGRESS' });
    vi.mocked(releaseUnrelatedLegacyManufacturingWorkOrder).mockResolvedValue(
      released as never
    );

    const res = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/release`)
      .send({});

    expect(res.status).toBe(200);
    expect(releaseUnrelatedLegacyManufacturingWorkOrder).toHaveBeenCalledWith({
      workOrderId: WORK_ORDER_ID,
      expectedProjectId: PROJECT_ID,
      expectedStatus: 'DRAFT',
    });
  });
});

describe('Permission enforcement — work_orders.approve_overrun', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    injectUser(app);
    const router = (await import('../src/routes/workOrders')).default;
    app.use('/api/work-orders', router);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 403 with correct shape when user lacks work_orders.approve_overrun', async () => {
    deny();

    const res = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/approve-overrun`)
      .send({ employeeId: 'EMP001', supervisorEmployeeId: 'SUP001', reason: 'Critical' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.body.requiredCapability).toBe('work_orders.approve_overrun');
  });

  it('proceeds past permission gate when user has work_orders.approve_overrun', async () => {
    allow('work_orders.approve_overrun');

    const supervisor = { id: 1, name: 'Admin User', employeeCode: 'SUP001', userRole: 'ADMIN' };
    const wad = { id: WORK_ORDER_ID, status: 'IN_PROGRESS' };
    const { db } = await import('../db');
    vi.mocked(db.select)
      .mockReturnValueOnce(makeDbChain([supervisor]))
      .mockReturnValueOnce(makeDbChain([wad]));

    vi.mocked(storage.createLaborApproval).mockResolvedValue(makeLaborApproval());

    const res = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/approve-overrun`)
      .send({ employeeId: 'EMP001', supervisorEmployeeId: 'SUP001', reason: 'Critical' });

    expect(res.status).toBe(201);
    expect(res.body.approval).toBeDefined();
  });
});

describe('Permission enforcement — travelers.start', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    injectUser(app);
    const router = (await import('../src/routes/travelers')).default;
    app.use('/api/travelers', router);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 403 with correct shape when user lacks travelers.start', async () => {
    deny();

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/start`)
      .send({ startedBy: 'op1' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.body.requiredCapability).toBe('travelers.start');
  });

  it('proceeds past permission gate when user has travelers.start', async () => {
    allow('travelers.start');

    const draftTraveler = makeTraveler({ status: 'DRAFT' });
    const startedTraveler = makeTraveler({ status: 'IN_PROGRESS' });
    vi.mocked(storage.getTraveler).mockResolvedValue(draftTraveler);
    vi.mocked(storage.updateTraveler).mockResolvedValue(startedTraveler);

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/start`)
      .send({ startedBy: 'op1' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
  });
});

describe('Permission enforcement — travelers.finish', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    injectUser(app);
    const router = (await import('../src/routes/travelers')).default;
    app.use('/api/travelers', router);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 403 with correct shape when user lacks travelers.finish', async () => {
    deny();

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/complete`)
      .send({ completedBy: 'op1' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.body.requiredCapability).toBe('travelers.finish');
  });

  it('proceeds past permission gate when user has travelers.finish', async () => {
    allow('travelers.finish');

    const traveler = makeTraveler({ status: 'IN_PROGRESS' });
    vi.mocked(storage.getTravelerWithDetails).mockResolvedValue({
      traveler,
      steps: [],
      events: [],
    });
    const completedTraveler = makeTraveler({ status: 'COMPLETE' });
    vi.mocked(storage.updateTraveler).mockResolvedValue(completedTraveler);

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/complete`)
      .send({ completedBy: 'op1' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETE');
  });
});

describe('Permission enforcement — travelers.sign_qc', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    injectUser(app);
    const router = (await import('../src/routes/travelers')).default;
    app.use('/api/travelers', router);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 403 with correct shape when user lacks travelers.sign_qc', async () => {
    deny();

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/sign`)
      .send({ signedBy: 1, meaning: 'APPROVED', signatureData: 'base64data' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.body.requiredCapability).toBe('travelers.sign_qc');
  });

  it('proceeds past permission gate when user has travelers.sign_qc', async () => {
    allow('travelers.sign_qc');

    const passedGate: GateResult = { allowed: true };
    vi.mocked(evaluateTravelerFinishGates).mockResolvedValue(passedGate);

    vi.mocked(storage.getTraveler).mockResolvedValue(makeTraveler({ status: 'IN_PROGRESS' }));
    vi.mocked(storage.getTravelerStep).mockResolvedValue(makeStep({ status: 'IN_PROGRESS' }));
    vi.mocked(storage.getTravelerTasks).mockResolvedValue([]);

    const sig = makeSignature();
    vi.mocked(storage.createTravelerSignature).mockResolvedValue(sig);
    vi.mocked(storage.updateTravelerStep).mockResolvedValue(makeStep({ status: 'COMPLETED' }));

    const res = await request(app)
      .post(`/api/travelers/${TRAVELER_ID}/steps/${STEP_ID}/sign`)
      .send({ signedBy: 1, meaning: 'APPROVED', signatureData: 'base64data' });

    expect(res.status).toBe(200);
    expect(res.body.signature.id).toBe('SIG-001');
  });
});

describe('Permission enforcement — projects.close', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    injectUser(app);
    const router = (await import('../src/routes/projectClosings')).default;
    app.use('/api/projects/:projectId/closing', router);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 403 with correct shape when user lacks projects.close', async () => {
    deny();

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/closing`)
      .send({ summary: 'Done' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.body.requiredCapability).toBe('projects.close');
  });

  it('proceeds past permission gate when user has projects.close', async () => {
    allow('projects.close');

    vi.mocked(storage.getProject).mockResolvedValue(makeProject());
    vi.mocked(storage.createProjectClosing).mockResolvedValue(makeProjectClosing({ summary: 'Done' }));

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/closing`)
      .send({ summary: 'Done' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
  });
});

describe('Permission enforcement — projects.approve_closing', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    injectUser(app);
    const router = (await import('../src/routes/projectClosings')).default;
    app.use('/api/projects/:projectId/closing', router);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 403 with correct shape when user lacks projects.approve_closing', async () => {
    deny();

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/closing/approve`)
      .send({ approvedBy: 5 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
    expect(res.body.requiredCapability).toBe('projects.approve_closing');
  });

  it('proceeds past permission gate when user has projects.approve_closing', async () => {
    allow('projects.approve_closing');

    vi.mocked(storage.getProjectClosingByProjectId).mockResolvedValue(makeProjectClosing());
    vi.mocked(storage.updateProjectClosing).mockResolvedValue(
      makeProjectClosing({ approvedBy: 5, approvedAt: new Date('2026-04-17T00:00:00Z') })
    );

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/closing/approve`)
      .send({ approvedBy: 5 });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });
});

describe('Permission enforcement — ADMIN and OWNER role bypass', () => {
  function injectSuperuser(app: express.Express, role: 'ADMIN' | 'OWNER'): void {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user: { id: number; role: string; username: string } }).user = {
        id: 99,
        role,
        username: `superuser-${role.toLowerCase()}`,
      };
      next();
    });
  }

  afterEach(() => {
    vi.resetModules();
  });

  for (const role of ['ADMIN', 'OWNER'] as const) {
    it(`${role} bypasses requirePermission without calling getUserPermissions`, async () => {
      const app = express();
      app.use(express.json());
      injectSuperuser(app, role);
      const router = (await import('../src/routes/travelers')).default;
      app.use('/api/travelers', router);

      vi.mocked(getUserPermissions).mockClear();

      const draftTraveler = makeTraveler({ status: 'DRAFT' });
      const startedTraveler = makeTraveler({ status: 'IN_PROGRESS' });
      vi.mocked(storage.getTraveler).mockResolvedValue(draftTraveler);
      vi.mocked(storage.updateTraveler).mockResolvedValue(startedTraveler);

      const res = await request(app)
        .post(`/api/travelers/${TRAVELER_ID}/start`)
        .send({ startedBy: 'op1' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('IN_PROGRESS');
      expect(vi.mocked(getUserPermissions)).not.toHaveBeenCalled();
    });
  }
});

describe('userHasScopedCapability — FLOOR_OPERATOR with no scope rows falls back to role check', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns true for FLOOR_OPERATOR with travelers.sign_qc role capability and no scope rows configured', async () => {
    const { pool } = await import('../db');
    vi.mocked(pool.query)
      .mockResolvedValueOnce([])                              // scope query: no rows
      .mockResolvedValueOnce([{ key: 'travelers.sign_qc' }]) // role capabilities
      .mockResolvedValueOnce([]);                             // user overrides

    const { userHasScopedCapability: realFn } =
      await vi.importActual<typeof import('../src/services/permissionService')>(
        '../src/services/permissionService'
      );

    const result = await realFn(42, 'FLOOR_OPERATOR', 'travelers.sign_qc', { department: 'P2' });

    expect(result).toBe(true);
  });

  it('returns false for FLOOR_OPERATOR without travelers.sign_qc in role and no scope rows', async () => {
    const { pool } = await import('../db');
    vi.mocked(pool.query)
      .mockResolvedValueOnce([])  // scope query: no rows
      .mockResolvedValueOnce([])  // role capabilities: empty
      .mockResolvedValueOnce([]);  // user overrides

    const { userHasScopedCapability: realFn } =
      await vi.importActual<typeof import('../src/services/permissionService')>(
        '../src/services/permissionService'
      );

    const result = await realFn(42, 'FLOOR_OPERATOR', 'travelers.sign_qc', { department: 'P2' });

    expect(result).toBe(false);
  });

  it('still enforces department scope when scope rows ARE configured for the user', async () => {
    const { pool } = await import('../db');
    const scopeRows = [{ scope_type: 'DEPARTMENT', department: 'WELD', project_id: null }];
    vi.mocked(pool.query)
      .mockResolvedValueOnce(scopeRows)   // scope query for WELD context (allowed)
      .mockResolvedValueOnce(scopeRows);  // scope query for PAINT context (denied)

    const { userHasScopedCapability: realFn } =
      await vi.importActual<typeof import('../src/services/permissionService')>(
        '../src/services/permissionService'
      );

    const allowedResult = await realFn(42, 'FLOOR_OPERATOR', 'travelers.sign_qc', { department: 'WELD' });
    expect(allowedResult).toBe(true);

    const deniedResult = await realFn(42, 'FLOOR_OPERATOR', 'travelers.sign_qc', { department: 'PAINT' });
    expect(deniedResult).toBe(false);
  });
});
