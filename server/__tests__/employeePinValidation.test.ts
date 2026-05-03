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
    timekeeperPin: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as Employee;
}

describe('PUT /api/employees/:id — timekeeperPin validation and hashing', () => {
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

  it('returns 400 when timekeeperPin has fewer than 4 digits', async () => {
    vi.mocked(storage.getEmployee).mockResolvedValue(makeEmployee());

    const res = await request(app)
      .put('/api/employees/42')
      .send({ timekeeperPin: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly 4 digits/i);
  });

  it('returns 400 when timekeeperPin has more than 4 digits', async () => {
    vi.mocked(storage.getEmployee).mockResolvedValue(makeEmployee());

    const res = await request(app)
      .put('/api/employees/42')
      .send({ timekeeperPin: '12345' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly 4 digits/i);
  });

  it('returns 400 when timekeeperPin contains non-digit characters', async () => {
    vi.mocked(storage.getEmployee).mockResolvedValue(makeEmployee());

    const res = await request(app)
      .put('/api/employees/42')
      .send({ timekeeperPin: 'abcd' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly 4 digits/i);
  });

  it('returns 400 when timekeeperPin mixes digits and letters', async () => {
    vi.mocked(storage.getEmployee).mockResolvedValue(makeEmployee());

    const res = await request(app)
      .put('/api/employees/42')
      .send({ timekeeperPin: '12ab' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly 4 digits/i);
  });

  it('hashes a valid 4-digit timekeeperPin before persisting', async () => {
    const current = makeEmployee();
    const updated = makeEmployee({ timekeeperPin: '$2b$10$hashedvalue' });

    vi.mocked(storage.getEmployee).mockResolvedValue(current);
    vi.mocked(storage.updateEmployee).mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/employees/42')
      .send({ timekeeperPin: '1234' });

    expect(res.status).toBe(200);

    const updateCall = vi.mocked(storage.updateEmployee).mock.calls[0];
    const savedPin: string | null | undefined = (updateCall[1] as Record<string, unknown>).timekeeperPin as string;

    expect(typeof savedPin).toBe('string');
    expect(savedPin).not.toBe('1234');
    expect(savedPin!.startsWith('$2')).toBe(true);
  });

  it('does not expose the raw or hashed PIN in the API response', async () => {
    const current = makeEmployee();
    const updated = makeEmployee({ timekeeperPin: '$2b$10$hashedvalue' });

    vi.mocked(storage.getEmployee).mockResolvedValue(current);
    vi.mocked(storage.updateEmployee).mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/employees/42')
      .send({ timekeeperPin: '1234' });

    expect(res.status).toBe(200);
    expect(res.body.timekeeperPin).toBeUndefined();
    expect(res.body.hasPin).toBe(true);
  });

  it('allows clearing the PIN by sending null', async () => {
    const current = makeEmployee({ timekeeperPin: '$2b$10$someoldhash' });
    const updated = makeEmployee({ timekeeperPin: null });

    vi.mocked(storage.getEmployee).mockResolvedValue(current);
    vi.mocked(storage.updateEmployee).mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/employees/42')
      .send({ timekeeperPin: null });

    expect(res.status).toBe(200);

    const updateCall = vi.mocked(storage.updateEmployee).mock.calls[0];
    const savedPin = (updateCall[1] as Record<string, unknown>).timekeeperPin;
    expect(savedPin).toBeNull();
  });

  it('allows clearing the PIN by sending an empty string', async () => {
    const current = makeEmployee({ timekeeperPin: '$2b$10$someoldhash' });
    const updated = makeEmployee({ timekeeperPin: null });

    vi.mocked(storage.getEmployee).mockResolvedValue(current);
    vi.mocked(storage.updateEmployee).mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/employees/42')
      .send({ timekeeperPin: '' });

    expect(res.status).toBe(200);

    const updateCall = vi.mocked(storage.updateEmployee).mock.calls[0];
    const savedPin = (updateCall[1] as Record<string, unknown>).timekeeperPin;
    expect(savedPin).toBeNull();
  });

  it('leaves timekeeperPin unchanged when the field is omitted from the update payload', async () => {
    const current = makeEmployee({ timekeeperPin: '$2b$10$existinghash' });
    const updated = makeEmployee({ timekeeperPin: '$2b$10$existinghash' });

    vi.mocked(storage.getEmployee).mockResolvedValue(current);
    vi.mocked(storage.updateEmployee).mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/employees/42')
      .send({ name: 'Jane Updated' });

    expect(res.status).toBe(200);

    const updateCall = vi.mocked(storage.updateEmployee).mock.calls[0];
    expect((updateCall[1] as Record<string, unknown>).timekeeperPin).toBeUndefined();
  });

  it('returns 404 when the employee does not exist', async () => {
    vi.mocked(storage.getEmployee).mockResolvedValue(undefined);

    const res = await request(app)
      .put('/api/employees/999')
      .send({ timekeeperPin: '1234' });

    expect(res.status).toBe(404);
    expect(vi.mocked(storage.updateEmployee)).not.toHaveBeenCalled();
  });
});
