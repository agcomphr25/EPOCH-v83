import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import type { Project, ProjectClosing } from '../schema';

const PROJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CLOSING_ID = 7;
const APPROVER_EMPLOYEE_ID = 42;

vi.mock('../storage', () => ({
  storage: {
    getProject: vi.fn<(id: string) => Promise<Project | undefined>>(),
    getProjectClosingByProjectId: vi.fn<(projectId: string) => Promise<ProjectClosing | null>>(),
    updateProject: vi.fn<(id: string, data: Partial<Project>) => Promise<Project>>(),
    updateProjectClosing: vi.fn<(id: number, data: Partial<ProjectClosing>) => Promise<ProjectClosing>>(),
    createProjectActivityLog: vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
    getProjectSteps: vi.fn().mockResolvedValue([]),
    getEmployee: vi.fn().mockResolvedValue(null),
    getP2CustomerByCustomerId: vi.fn().mockResolvedValue(null),
    getProjectStepAttachmentsByProject: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  },
  pool: {},
}));

vi.mock('../schema', () => ({
  projects: {},
  projectClosings: {},
  employees: {},
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

import { storage } from '../storage';

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
  const closingsRouter = (await import('../src/routes/projectClosings')).default;
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
      }),
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
      makeClosing({ approvedBy: null }),
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
      makeClosing({ approvedBy: APPROVER_EMPLOYEE_ID, approvedAt: new Date('2026-04-10') }),
    );
    vi.mocked(storage.updateProject).mockResolvedValue(makeProject({ status: 'completed' }));

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
    vi.mocked(storage.updateProject).mockResolvedValue(makeProject({ status: 'completed' }));

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

    vi.mocked(storage.getProjectClosingByProjectId).mockResolvedValue(closingBefore);
    vi.mocked(storage.updateProjectClosing).mockResolvedValue(closingAfter);

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/closing/approve`)
      .send({ approvedBy: APPROVER_EMPLOYEE_ID });

    expect(res.status).toBe(200);
    expect(res.body.approvedBy).toBe(APPROVER_EMPLOYEE_ID);
    expect(storage.updateProjectClosing).toHaveBeenCalledWith(
      CLOSING_ID,
      expect.objectContaining({ approvedBy: APPROVER_EMPLOYEE_ID }),
    );
    expect(storage.updateProjectClosing).toHaveBeenCalledWith(
      CLOSING_ID,
      expect.objectContaining({ approvedAt: expect.any(Date) }),
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
