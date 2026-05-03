import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import type { Employee } from '../schema';

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

vi.mock('../src/events/humanEvents', () => ({
  emitHumanUpserted: vi.fn(),
}));

vi.mock('../utils/trainingAlertReminder', () => ({
  fetchRecertificationRecords: vi.fn().mockResolvedValue([]),
  countRecertificationRecords: vi.fn().mockResolvedValue(0),
  getAlertDays: vi.fn().mockReturnValue(30),
}));

vi.mock('../utils/fileUpload', () => ({
  uploadMiddleware: {
    single: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
  },
  getFileInfo: vi.fn(),
  getFileUrl: vi.fn(),
  validateEmployeeDocumentAccess: vi.fn(),
  getDocumentType: vi.fn(),
}));

const mockPoolQuery = vi.fn().mockResolvedValue([]);

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  },
  pool: { query: mockPoolQuery },
  pgPool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

vi.mock('../storage', () => ({
  storage: {
    getEmployee: vi.fn<(id: number) => Promise<Employee | undefined>>(),
    updateEmployee: vi.fn<(id: number, data: Partial<Employee>) => Promise<Employee>>(),
    getCanonicalIdentityByEmail: vi.fn().mockResolvedValue(null),
    updateCanonicalIdentity: vi.fn().mockResolvedValue({}),
    createCanonicalIdentity: vi.fn().mockResolvedValue({ id: 'canon-1' }),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: 1,
      username: 'admin',
      role: 'ADMIN',
      employeeId: null,
      canOverridePrices: true,
      isActive: true,
    };
    next();
  }),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('@shared/schema', () => {
  const schema = { parse: vi.fn(), safeParse: vi.fn(() => ({ success: true, data: {} })) };
  return {
    insertEmployeeSchema: schema,
    insertCertificationSchema: schema,
    insertEvaluationSchema: schema,
    insertEmployeeDocumentSchema: schema,
    insertTimeClockEntrySchema: schema,
    insertChecklistItemSchema: schema,
    insertOnboardingDocSchema: schema,
    insertEmployeeLayupSettingsSchema: schema,
  };
});

import { storage } from '../storage';

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 42,
    name: 'Jane Doe',
    employeeCode: 'EMP042',
    email: 'jane@example.com',
    userRole: 'EMPLOYEE',
    isActive: true,
    jobTitle: null,
    department: null,
    phone: null,
    address: null,
    emergencyContact: null,
    emergencyPhone: null,
    hireDate: null,
    hourlyRate: null,
    notes: null,
    portalToken: null,
    portalTokenExpiry: null,
    profilePhoto: null,
    canonicalId: 'canon-42',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as Employee;
}

describe('PUT /api/employees/:id — userRole sync to users table', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPoolQuery.mockResolvedValue([]);
    app = express();
    app.use(express.json());
    const employeesRouter = (await import('../src/routes/employees')).default;
    app.use('/api/employees', employeesRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('syncs the new role to the users table when userRole changes from EMPLOYEE to ADMIN', async () => {
    const current = makeEmployee({ userRole: 'EMPLOYEE' });
    const updated = makeEmployee({ userRole: 'ADMIN' });

    vi.mocked(storage.getEmployee).mockResolvedValue(current);
    vi.mocked(storage.updateEmployee).mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/employees/42')
      .send({ userRole: 'ADMIN' });

    expect(res.status).toBe(200);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      ['ADMIN', 42]
    );
  });

  it('does not touch the users table when userRole is unchanged', async () => {
    const current = makeEmployee({ userRole: 'EMPLOYEE' });
    const updated = makeEmployee({ userRole: 'EMPLOYEE' });

    vi.mocked(storage.getEmployee).mockResolvedValue(current);
    vi.mocked(storage.updateEmployee).mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/employees/42')
      .send({ name: 'Jane Updated', userRole: 'EMPLOYEE' });

    expect(res.status).toBe(200);
    const roleSyncCall = mockPoolQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('UPDATE users')
    );
    expect(roleSyncCall).toBeUndefined();
  });

  it('does not error when the employee has no linked user account', async () => {
    const current = makeEmployee({ userRole: 'EMPLOYEE' });
    const updated = makeEmployee({ userRole: 'ADMIN' });

    vi.mocked(storage.getEmployee).mockResolvedValue(current);
    vi.mocked(storage.updateEmployee).mockResolvedValue(updated);

    mockPoolQuery.mockResolvedValue([]);

    const res = await request(app)
      .put('/api/employees/42')
      .send({ userRole: 'ADMIN' });

    expect(res.status).toBe(200);
    expect(res.body.userRole).toBe('ADMIN');
  });

  it('returns 404 when the employee does not exist', async () => {
    vi.mocked(storage.getEmployee).mockResolvedValue(undefined);

    const res = await request(app)
      .put('/api/employees/999')
      .send({ userRole: 'ADMIN' });

    expect(res.status).toBe(404);
    expect(mockPoolQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      expect.anything()
    );
  });
});
