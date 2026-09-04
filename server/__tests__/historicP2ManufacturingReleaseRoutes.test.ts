import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import workOrdersRouter from '../src/routes/workOrders';

const WORK_ORDER_ID = 'aabbccdd-1111-2222-3333-aabbccddeeff';
const PROJECT_ID = 'ddeeee22-3333-4444-5555-ddeeee223344';
const MISMATCHED_PROJECT_ID = '11223344-5566-7788-99aa-bbccddeeff00';

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  getUserPermissions: vi.fn(),
  userHasScopedCapability: vi.fn(),
  listReadiness: vi.fn(),
  releaseHistoric: vi.fn(),
  releaseUnrelated: vi.fn(),
  updateWorkOrderStatus: vi.fn(),
  resolveAuthority: vi.fn(),
  evaluateReadiness: vi.fn(),
  auditLogEvent: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
  },
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: 11,
      employeeId: 22,
      username: 'release.operator',
      role: 'EMPLOYEE',
      canOverridePrices: false,
      isActive: true,
    };
    next();
  },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) =>
    next(),
}));

vi.mock('../src/services/permissionService', () => ({
  getUserPermissions: (...args: unknown[]) => mocks.getUserPermissions(...args),
  userHasScopedCapability: (...args: unknown[]) =>
    mocks.userHasScopedCapability(...args),
}));

vi.mock('../src/services/historicP2ManufacturingReleaseService', () => {
  class HistoricP2ManufacturingReleaseError extends Error {
    constructor(
      public code: string,
      message: string,
      public status = 409,
      public details: Record<string, unknown> = {}
    ) {
      super(message);
    }
  }

  return {
    HistoricP2ManufacturingReleaseError,
    listHistoricP2ManufacturingReleaseReadiness: (...args: unknown[]) =>
      mocks.listReadiness(...args),
    releaseHistoricP2ManufacturingWorkOrder: (...args: unknown[]) =>
      mocks.releaseHistoric(...args),
    releaseUnrelatedLegacyManufacturingWorkOrder: (...args: unknown[]) =>
      mocks.releaseUnrelated(...args),
    resolveManufacturingOrderReleaseAuthority: (...args: unknown[]) =>
      mocks.resolveAuthority(...args),
  };
});

vi.mock('../src/lib/workOrderReadiness', () => ({
  evaluateWorkOrderReadiness: (...args: unknown[]) =>
    mocks.evaluateReadiness(...args),
}));

vi.mock('../storage', () => ({
  storage: {
    updateWorkOrderStatus: (...args: unknown[]) =>
      mocks.updateWorkOrderStatus(...args),
  },
}));
vi.mock('../src/services/auditService', () => ({
  auditService: {
    logEvent: (...args: unknown[]) => mocks.auditLogEvent(...args),
  },
}));
vi.mock('../src/services/auditLedgerService', () => ({
  recordAuditEvent: vi.fn(),
}));

function selectRows(rows: Record<string, unknown>[]) {
  return {
    from: () => ({
      where: () => ({
        limit: async () => rows,
        orderBy: () => ({ limit: async () => rows }),
      }),
      orderBy: () => ({ limit: async () => rows }),
    }),
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/work-orders', workOrdersRouter);
  return app;
}

describe('historic P2 manufacturing release route dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserPermissions.mockResolvedValue({
      permissionSet: new Set(['work_orders.release']),
      permissions: ['work_orders.release'],
    });
    mocks.userHasScopedCapability.mockResolvedValue(true);
    mocks.resolveAuthority.mockResolvedValue('UNRELATED_LEGACY');
    mocks.evaluateReadiness.mockResolvedValue({ status: 'READY' });
    mocks.auditLogEvent.mockResolvedValue(undefined);
  });

  it('requires the existing work_orders.release permission', async () => {
    mocks.getUserPermissions.mockResolvedValueOnce({
      permissionSet: new Set(),
      permissions: [],
    });
    const app = await buildApp();

    const response = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/historic-p2-release`)
      .send({ projectId: PROJECT_ID });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: 'Forbidden',
      requiredCapability: 'work_orders.release',
    });
    expect(mocks.releaseHistoric).not.toHaveBeenCalled();
  });

  it('fails closed when the project-scoped release capability is denied', async () => {
    mocks.dbSelect.mockReturnValueOnce(selectRows([{ projectId: PROJECT_ID }]));
    mocks.userHasScopedCapability.mockResolvedValueOnce(false);
    const app = await buildApp();

    const response = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/historic-p2-release`)
      .send({ projectId: PROJECT_ID });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Forbidden',
      requiredCapability: 'work_orders.release',
      context: { projectId: PROJECT_ID },
    });
    expect(mocks.userHasScopedCapability).toHaveBeenCalledWith(
      11,
      'EMPLOYEE',
      'work_orders.release',
      { projectId: PROJECT_ID }
    );
    expect(mocks.releaseHistoric).not.toHaveBeenCalled();
  });

  it('rejects a mismatched requested project after scoping against the work-order project', async () => {
    mocks.dbSelect.mockReturnValueOnce(selectRows([{ projectId: PROJECT_ID }]));
    const app = await buildApp();

    const response = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/historic-p2-release`)
      .send({ projectId: MISMATCHED_PROJECT_ID });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'WORK_ORDER_PROJECT_MISMATCH',
      message:
        'The manufacturing order does not belong to the requested project.',
    });
    expect(mocks.userHasScopedCapability).toHaveBeenCalledTimes(1);
    expect(mocks.userHasScopedCapability).toHaveBeenCalledWith(
      11,
      'EMPLOYEE',
      'work_orders.release',
      { projectId: PROJECT_ID }
    );
    expect(mocks.releaseHistoric).not.toHaveBeenCalled();
  });

  it('protects and returns the project-scoped historic readiness projection', async () => {
    mocks.listReadiness.mockResolvedValueOnce({
      authorityMode: 'HISTORIC_P2_COMPATIBILITY',
      projectId: PROJECT_ID,
      workflowVersion: 'legacy_v1',
      orders: [],
    });
    const app = await buildApp();

    const response = await request(app).get(
      `/api/work-orders/project/${PROJECT_ID}/historic-p2-release-readiness`
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      authorityMode: 'HISTORIC_P2_COMPATIBILITY',
      projectId: PROJECT_ID,
    });
    expect(mocks.userHasScopedCapability).toHaveBeenCalledWith(
      11,
      'EMPLOYEE',
      'work_orders.release',
      { projectId: PROJECT_ID }
    );
    expect(mocks.listReadiness).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('releases only the requested project order through the explicit historic endpoint', async () => {
    mocks.dbSelect.mockReturnValueOnce(selectRows([{ projectId: PROJECT_ID }]));
    mocks.releaseHistoric.mockResolvedValueOnce({
      released: true,
      alreadyReleased: false,
      workOrder: { id: WORK_ORDER_ID, status: 'RELEASED' },
    });
    const app = await buildApp();

    const response = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/historic-p2-release`)
      .send({ projectId: PROJECT_ID });

    expect(response.status).toBe(200);
    expect(mocks.releaseHistoric).toHaveBeenCalledWith({
      workOrderId: WORK_ORDER_ID,
      expectedProjectId: PROJECT_ID,
      actor: {
        userId: 11,
        employeeId: 22,
        displayName: 'release.operator',
        role: 'EMPLOYEE',
      },
    });
  });

  it('returns exact historic eligibility blockers over HTTP', async () => {
    const { HistoricP2ManufacturingReleaseError } =
      await import('../src/services/historicP2ManufacturingReleaseService');
    const blockers = [
      {
        code: 'PREPRODUCTION_INCOMPLETE',
        message:
          'Preproduction evidence is missing, incomplete, or linked to another project.',
      },
    ];
    const eligibility = {
      authorityMode: 'HISTORIC_P2_COMPATIBILITY',
      eligible: false,
      alreadyReleased: false,
      evidence: [],
      blockers,
    };
    mocks.dbSelect.mockReturnValueOnce(selectRows([{ projectId: PROJECT_ID }]));
    mocks.releaseHistoric.mockRejectedValueOnce(
      new HistoricP2ManufacturingReleaseError(
        'HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE',
        'Historic P2 release evidence is incomplete or contradictory.',
        409,
        { eligibility, blockers }
      )
    );
    const app = await buildApp();

    const response = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/historic-p2-release`)
      .send({ projectId: PROJECT_ID });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE',
      message: 'Historic P2 release evidence is incomplete or contradictory.',
      eligibility,
      blockers,
    });
  });

  it('dispatches historic orders away from the unrelated legacy release implementation', async () => {
    mocks.dbSelect.mockReturnValueOnce(
      selectRows([
        { id: WORK_ORDER_ID, projectId: PROJECT_ID, status: 'PLANNED' },
      ])
    );
    mocks.resolveAuthority.mockResolvedValueOnce('HISTORIC_P2');
    mocks.releaseHistoric.mockResolvedValueOnce({
      released: true,
      alreadyReleased: false,
      workOrder: { id: WORK_ORDER_ID, status: 'RELEASED' },
    });
    const app = await buildApp();

    const response = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/release`)
      .send({});

    expect(response.status).toBe(200);
    expect(mocks.releaseHistoric).toHaveBeenCalledOnce();
    expect(mocks.releaseUnrelated).not.toHaveBeenCalled();
  });

  it('sanitizes raw database errors from generic historic release dispatch', async () => {
    const sensitiveDetail =
      'duplicate key sequence_number=814; password=do-not-expose';
    const databaseError = Object.assign(new Error(sensitiveDetail), {
      code: '23505',
      constraint: 'unexpected_sensitive_constraint',
      detail: sensitiveDetail,
    });
    mocks.dbSelect.mockReturnValueOnce(
      selectRows([
        { id: WORK_ORDER_ID, projectId: PROJECT_ID, status: 'PLANNED' },
      ])
    );
    mocks.resolveAuthority.mockResolvedValueOnce('HISTORIC_P2');
    mocks.releaseHistoric.mockRejectedValueOnce(databaseError);
    const app = await buildApp();

    const response = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/release`)
      .send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'HISTORIC_P2_RELEASE_FAILED',
      message: 'Historic P2 release evidence could not be verified.',
    });
    expect(response.text).not.toContain(sensitiveDetail);
    expect(mocks.releaseHistoric).toHaveBeenCalledOnce();
    expect(mocks.releaseUnrelated).not.toHaveBeenCalled();
    expect(mocks.updateWorkOrderStatus).not.toHaveBeenCalled();
  });

  it('keeps P2 V2 production release read-only on the generic endpoint', async () => {
    mocks.dbSelect.mockReturnValueOnce(
      selectRows([
        { id: WORK_ORDER_ID, projectId: PROJECT_ID, status: 'PLANNED' },
      ])
    );
    mocks.resolveAuthority.mockResolvedValueOnce('P2_V2');
    const app = await buildApp();

    const response = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/release`)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'P2_V2_PRODUCTION_RELEASE_READ_ONLY',
      message:
        'P2 V2 production release is read-only in this phase and cannot be performed from this endpoint.',
    });
    expect(mocks.evaluateReadiness).not.toHaveBeenCalled();
    expect(mocks.updateWorkOrderStatus).not.toHaveBeenCalled();
    expect(mocks.releaseHistoric).not.toHaveBeenCalled();
    expect(mocks.releaseUnrelated).not.toHaveBeenCalled();
  });

  it('keeps unrelated legacy orders on the existing readiness and release path', async () => {
    mocks.dbSelect.mockReturnValueOnce(
      selectRows([
        { id: WORK_ORDER_ID, projectId: PROJECT_ID, status: 'PLANNED' },
      ])
    );
    mocks.releaseUnrelated.mockResolvedValueOnce({
      id: WORK_ORDER_ID,
      projectId: PROJECT_ID,
      status: 'RELEASED',
    });
    const app = await buildApp();

    const response = await request(app)
      .post(`/api/work-orders/${WORK_ORDER_ID}/release`)
      .send({});

    expect(response.status).toBe(200);
    expect(mocks.evaluateReadiness).toHaveBeenCalledWith(WORK_ORDER_ID);
    expect(mocks.releaseUnrelated).toHaveBeenCalledWith({
      workOrderId: WORK_ORDER_ID,
      expectedProjectId: PROJECT_ID,
      expectedStatus: 'PLANNED',
    });
    expect(mocks.releaseHistoric).not.toHaveBeenCalled();
  });
});
