/* eslint-disable import/order -- test resolver inconsistently classifies supertest in this workspace */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import request from 'supertest';
import { type Project, type ProjectClosing } from '../schema';

const PROJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CLOSING_ID = 7;
const APPROVER_EMPLOYEE_ID = 42;

vi.mock('../storage', () => ({
  storage: {
    getProject: vi.fn<(id: string) => Promise<Project | undefined>>(),
    getProjectClosingByProjectId:
      vi.fn<(projectId: string) => Promise<ProjectClosing | null>>(),
    updateProject:
      vi.fn<(id: string, data: Partial<Project>) => Promise<Project>>(),
    updateProjectClosing:
      vi.fn<
        (id: number, data: Partial<ProjectClosing>) => Promise<ProjectClosing>
      >(),
    createProjectActivityLog: vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined),
    createProjectNotification: vi.fn().mockResolvedValue(undefined),
    getProjectSteps: vi.fn().mockResolvedValue([]),
    getWorkOrdersByProject: vi.fn().mockResolvedValue([]),
    updateProjectStep: vi.fn(),
    getEmployee: vi.fn().mockResolvedValue(null),
    getP2CustomerByCustomerId: vi.fn().mockResolvedValue(null),
    getProjectStepAttachmentsByProject: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
  },
  pool: { query: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../schema', () => ({
  projects: {},
  projectClosings: {},
  employees: {},
  productionWorkOrders: {
    id: {},
    workOrderNumber: {},
    projectId: {},
    partNumber: {},
    description: {},
    quantity: {},
    status: {},
    departmentBudgets: {},
    totalBudgetHours: {},
    materialBudgetAmount: {},
    startDate: {},
    dueDate: {},
    warningThreshold: {},
    blockedThreshold: {},
    defaultChargeCodeId: {},
    dashboardType: {},
    queueType: {},
    assignedDepartment: {},
    assignedDashboardRoute: {},
    manufacturingQueueId: {},
    wadStatus: {},
    wizardData: {},
    createdAt: {},
    updatedAt: {},
  },
  insertProjectSchema: { safeParse: vi.fn(), parse: vi.fn() },
  insertProjectStepSchema: { safeParse: vi.fn(), parse: vi.fn() },
  insertProjectActivityLogSchema: { safeParse: vi.fn(), parse: vi.fn() },
  insertProjectNotificationSchema: { safeParse: vi.fn(), parse: vi.fn() },
}));

vi.mock('../identity/userIdentity', () => ({
  createEmployeeIdentitySnapshot: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

vi.mock('../src/lib/productionWorkflowReadiness', () => ({
  ensureProductionWorkflowReadSchema: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/services/auditService', () => ({
  auditService: { logEvent: vi.fn().mockResolvedValue(undefined) },
}));
const releaseMocks = vi.hoisted(() => ({
  documentationPackage: {
    samplingPlanId: 'SP-1',
    gates: { routingApproval: { requiresSamplingPlan: false } },
  } as any,
}));
vi.mock('../src/lib/documentationRequirementsEngine', () => ({
  evaluateDocumentationRequirements: vi.fn(
    () => releaseMocks.documentationPackage
  ),
}));
vi.mock('../src/services/quoteContractService', () => ({
  getQuoteContractReviewGate: vi.fn().mockResolvedValue({
    key: 'contract_review',
    label: 'Contract Review',
    passed: true,
  }),
}));
vi.mock('../src/services/permissionService', () => ({
  getUserPermissions: vi.fn(async (_userId: number, role: string) => ({
    permissionSet: new Set(
      role === 'MANAGER' ? ['projects.close', 'projects.approve_closing'] : []
    ),
  })),
  userHasScopedCapability: vi.fn(
    async (_userId: number, role: string) => role === 'MANAGER'
  ),
}));

import { storage } from '../storage';
import { pool } from '../db';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    projectCode: 'PROJ-001',
    projectName: 'Test Project',
    status: 'active',
    currentStepType: 'rfq_risk_assessment',
    currentStage: 'production',
    stageUpdatedAt: new Date('2026-01-01'),
    customerId: 'cust-1',
    description: null,
    targetShipDate: null,
    actualShipDate: null,
    poId: null,
    projectManagerId: null,
    reminderDays: 3,
    lastReminderSentAt: null,
    notes: null,
    defaultChargeCodeId: null,
    createdBy: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeClosing(overrides: Partial<ProjectClosing> = {}): ProjectClosing {
  return {
    id: CLOSING_ID,
    projectId: PROJECT_ID,
    summary: 'All went well',
    whatWentWrong: 'Nothing major',
    strengths: 'Great team',
    opportunities: 'Better tooling',
    similaritiesToPriorProjects: null,
    nextProjectRecommendations: 'Start earlier',
    closedBy: null,
    closedByDisplayName: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
    ...overrides,
  };
}

function buildApp(userRole: string = 'MANAGER'): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user: unknown }).user = {
      id: 'test-user',
      role: userRole,
      employeeId: APPROVER_EMPLOYEE_ID,
    };
    next();
  });
  return app;
}

async function attachProjectsRouter(app: express.Express): Promise<void> {
  const projectsRouter = (await import('../src/routes/projects')).default;
  app.use('/api/projects', projectsRouter);
}

async function attachClosingsRouter(app: express.Express): Promise<void> {
  const closingsRouter = (await import('../src/routes/projectClosings'))
    .default;
  app.use('/api/projects/:projectId/closing', closingsRouter);
}

describe('PATCH /api/projects/:id — closing gate', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    await attachProjectsRouter(app);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 400 when transitioning to completed with no closing record', async () => {
    vi.mocked(storage.getProject).mockResolvedValue(makeProject());
    vi.mocked(storage.getProjectClosingByProjectId).mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/closing record/i);
  });

  it('returns 400 with missingFields when the closing record is incomplete', async () => {
    vi.mocked(storage.getProject).mockResolvedValue(makeProject());
    vi.mocked(storage.getProjectClosingByProjectId).mockResolvedValue(
      makeClosing({
        summary: null,
        whatWentWrong: null,
        strengths: 'Great team',
        opportunities: 'Better tooling',
        nextProjectRecommendations: null,
      })
    );

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(400);
    expect(res.body.missingFields).toBeDefined();
    expect(res.body.missingFields).toContain('summary');
    expect(res.body.missingFields).toContain('whatWentWrong');
    expect(res.body.missingFields).toContain('nextProjectRecommendations');
  });

  it('returns 403 when the closing record is complete but not yet approved', async () => {
    vi.mocked(storage.getProject).mockResolvedValue(makeProject());
    vi.mocked(storage.getProjectClosingByProjectId).mockResolvedValue(
      makeClosing({ approvedBy: null })
    );

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/approved/i);
  });

  it('returns 200 and status=completed when closing is complete and approved', async () => {
    vi.mocked(storage.getProject).mockResolvedValue(makeProject());
    vi.mocked(storage.getProjectClosingByProjectId).mockResolvedValue(
      makeClosing({
        approvedBy: APPROVER_EMPLOYEE_ID,
        approvedAt: new Date('2026-04-10'),
      })
    );
    vi.mocked(storage.updateProject).mockResolvedValue(
      makeProject({ status: 'completed' })
    );

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });

  it('returns 403 when a non-admin user attempts to use force=true', async () => {
    const nonAdminApp = buildApp('MANAGER');
    await attachProjectsRouter(nonAdminApp);

    vi.mocked(storage.getProject).mockResolvedValue(makeProject());

    const res = await request(nonAdminApp)
      .patch(`/api/projects/${PROJECT_ID}`)
      .send({ status: 'completed', force: true });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/admin/i);
  });

  it('bypasses the closing gate and returns 200 when force=true and user is ADMIN', async () => {
    const adminApp = buildApp('ADMIN');
    await attachProjectsRouter(adminApp);

    vi.mocked(storage.getProject).mockResolvedValue(makeProject());
    vi.mocked(storage.updateProject).mockResolvedValue(
      makeProject({ status: 'completed' })
    );

    const res = await request(adminApp)
      .patch(`/api/projects/${PROJECT_ID}`)
      .send({ status: 'completed', force: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(storage.getProjectClosingByProjectId).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/:projectId/closing/approve', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp('MANAGER');
    await attachClosingsRouter(app);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('stamps approvedBy and approvedAt on the closing record', async () => {
    const closingBefore = makeClosing({ approvedBy: null, approvedAt: null });
    const closingAfter = makeClosing({
      approvedBy: APPROVER_EMPLOYEE_ID,
      approvedAt: new Date('2026-04-16T12:00:00Z'),
    });

    vi.mocked(storage.getProjectClosingByProjectId).mockResolvedValue(
      closingBefore
    );
    vi.mocked(storage.updateProjectClosing).mockResolvedValue(closingAfter);

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/closing/approve`)
      .send({ approvedBy: APPROVER_EMPLOYEE_ID });

    expect(res.status).toBe(200);
    expect(res.body.approvedBy).toBe(APPROVER_EMPLOYEE_ID);
    expect(storage.updateProjectClosing).toHaveBeenCalledWith(
      CLOSING_ID,
      expect.objectContaining({ approvedBy: APPROVER_EMPLOYEE_ID })
    );
    expect(storage.updateProjectClosing).toHaveBeenCalledWith(
      CLOSING_ID,
      expect.objectContaining({ approvedAt: expect.any(Date) })
    );
  });

  it('returns 403 when the user does not have MANAGER or ADMIN role', async () => {
    const operatorApp = buildApp('OPERATOR');
    await attachClosingsRouter(operatorApp);

    const res = await request(operatorApp)
      .post(`/api/projects/${PROJECT_ID}/closing/approve`)
      .send({ approvedBy: APPROVER_EMPLOYEE_ID });

    expect(res.status).toBe(403);
    expect(storage.updateProjectClosing).not.toHaveBeenCalled();
  });

  it('returns 404 when no closing record exists for the project', async () => {
    vi.mocked(storage.getProjectClosingByProjectId).mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/closing/approve`)
      .send({ approvedBy: APPROVER_EMPLOYEE_ID });

    expect(res.status).toBe(404);
  });
});

describe('legacy P2 release gate outcomes', () => {
  let app: express.Express;
  let poStatus = 'open';
  const steps = (review = 'completed', prepro = 'completed') =>
    [
      {
        id: 'q',
        stepType: 'quote',
        status: 'completed',
        stepOrder: 2,
        linkedQuoteId: null,
      },
      {
        id: 'r',
        stepType: 'purchase_review_checklist',
        status: review,
        stepOrder: 3,
      },
      {
        id: 'p',
        stepType: 'preproduction_checklist',
        status: prepro,
        stepOrder: 4,
      },
    ] as any;
  beforeEach(async () => {
    vi.clearAllMocks();
    poStatus = 'open';
    releaseMocks.documentationPackage = {
      samplingPlanId: 'SP-1',
      gates: { routingApproval: { requiresSamplingPlan: false } },
    };
    vi.mocked(pool.query).mockImplementation(async (query: any) => {
      const text = String(query);
      if (text.includes('SELECT status FROM p2_purchase_orders'))
        return [{ status: poStatus }] as any;
      if (text.includes('FROM production_work_orders'))
        return [
          {
            id: 'wad',
            workOrderNumber: 'WAD-1',
            status: 'RELEASED',
            wadStatus: 'APPROVED',
            wizardData: {},
          },
        ] as any;
      return [] as any;
    });
    vi.mocked(storage.getProject).mockResolvedValue(
      makeProject({ poId: 77, currentStage: 'po_received' })
    );
    vi.mocked(storage.getProjectSteps).mockResolvedValue(steps());
    vi.mocked(storage.getWorkOrdersByProject).mockResolvedValue([
      { status: 'RELEASED' },
    ] as any);
    vi.mocked(storage.updateProject).mockImplementation(async (_id, data) =>
      makeProject({ poId: 77, currentStage: 'po_received', ...data })
    );
    app = buildApp();
    await attachProjectsRouter(app);
  });
  afterEach(() => vi.resetModules());
  const release = () =>
    request(app).post(`/api/projects/${PROJECT_ID}/release-to-p2`).send({});
  it('rejects missing PO', async () => {
    vi.mocked(storage.getProject).mockResolvedValue(
      makeProject({ poId: null })
    );
    const r = await release();
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('PO_REQUIRED');
  });
  it('rejects incomplete PO review', async () => {
    vi.mocked(storage.getProjectSteps).mockResolvedValue(steps('pending'));
    const r = await release();
    expect(r.status).toBe(422);
    expect(r.body.failedGates).toContain('PO Review');
  });
  it('rejects incomplete preproduction', async () => {
    vi.mocked(storage.getProjectSteps).mockResolvedValue(
      steps('completed', 'pending')
    );
    const r = await release();
    expect(r.status).toBe(422);
    expect(r.body.failedGates).toContain('Preproduction');
  });
  it('rejects missing WAD approval', async () => {
    vi.mocked(storage.getWorkOrdersByProject).mockResolvedValue([]);
    const r = await release();
    expect(r.status).toBe(422);
    expect(r.body.failedGates).toContain('WAD (Work Authorization Document)');
  });
  it('rejects missing required sampling plan', async () => {
    releaseMocks.documentationPackage = {
      samplingPlanId: null,
      gates: { routingApproval: { requiresSamplingPlan: true } },
    };
    const r = await release();
    expect(r.status).toBe(422);
    expect(r.body.failedGates).toContain('WAD Documentation Package');
  });
  it('stages the first release', async () => {
    const r = await release();
    expect(r.status).toBe(200);
    expect(r.body).toEqual(
      expect.objectContaining({
        stage: 'p2_release',
        poStatus: 'ready_for_p2_release',
      })
    );
  });
  it('launches production from staged', async () => {
    poStatus = 'ready_for_p2_release';
    const r = await release();
    expect(r.status).toBe(200);
    expect(r.body).toEqual(
      expect.objectContaining({
        stage: 'production',
        poStatus: 'in_production',
      })
    );
  });
  it('rejects repeated production release', async () => {
    poStatus = 'in_production';
    expect((await release()).status).toBe(409);
  });
});

describe('legacy step transitions remain unchanged', () => {
  let app: express.Express;
  const step = (status: string, extra: Record<string, unknown> = {}) =>
    ({
      id: 's1',
      projectId: PROJECT_ID,
      stepType: 'rfq_risk_assessment',
      stepOrder: 1,
      status,
      notes: null,
      startedAt: null,
      completedAt: null,
      ...extra,
    }) as any;
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(storage.getProject).mockResolvedValue(
      makeProject({ currentStage: 'rfq_received' })
    );
    vi.mocked(storage.updateProjectStep).mockImplementation(async (id, data) =>
      step(String((data as any).status), { id, ...data })
    );
    app = buildApp();
    await attachProjectsRouter(app);
  });
  afterEach(() => vi.resetModules());
  it('starts pending', async () => {
    vi.mocked(storage.getProjectSteps).mockResolvedValue([step('pending')]);
    const r = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/steps/s1`)
      .send({ status: 'in_progress' });
    expect(r.status).toBe(200);
    expect(storage.updateProjectStep).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        status: 'in_progress',
        startedAt: expect.any(Date),
      })
    );
  });
  it('completes and starts next', async () => {
    const next = step('pending', { id: 's2', stepType: 'quote', stepOrder: 2 });
    vi.mocked(storage.getProjectSteps)
      .mockResolvedValueOnce([step('in_progress'), next])
      .mockResolvedValueOnce([step('completed'), next]);
    const r = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/steps/s1`)
      .send({ status: 'completed' });
    expect(r.status).toBe(200);
    expect(storage.updateProjectStep).toHaveBeenCalledWith(
      's2',
      expect.objectContaining({ status: 'in_progress' })
    );
  });
  it('skips with reason', async () => {
    vi.mocked(storage.getProjectSteps).mockResolvedValue([step('pending')]);
    const r = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/steps/s1/skip`)
      .send({ reason: 'Legacy exception' });
    expect(r.status).toBe(200);
    expect(storage.updateProjectStep).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        status: 'skipped',
        notes: '[Skipped] Legacy exception',
      })
    );
  });
  it('reopens completed', async () => {
    vi.mocked(storage.getProjectSteps).mockResolvedValue([step('completed')]);
    const r = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/steps/s1/reopen`)
      .send({});
    expect(r.status).toBe(200);
    expect(storage.updateProjectStep).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ status: 'in_progress', completedAt: null })
    );
  });
  it.each([
    [
      'update',
      `/api/projects/${PROJECT_ID}/steps/s1`,
      { status: 'in_progress' },
    ],
    [
      'skip',
      `/api/projects/${PROJECT_ID}/steps/s1/skip`,
      { reason: 'Not applicable' },
    ],
    ['reopen', `/api/projects/${PROJECT_ID}/steps/s1/reopen`, {}],
  ])('rejects p2_v2 legacy step %s actions', async (_action, url, body) => {
    vi.mocked(storage.getProject).mockResolvedValue(
      makeProject({ workflowVersion: 'p2_v2' })
    );
    const r = await request(app).patch(url).send(body);
    expect(r.status).toBe(409);
    expect(r.body).toEqual(
      expect.objectContaining({
        error: 'PROJECT_WORKFLOW_ACTION_UNAVAILABLE',
        workflowVersion: 'p2_v2',
      })
    );
    expect(storage.updateProjectStep).not.toHaveBeenCalled();
  });
});
