/* eslint-disable import/order -- test resolver inconsistently classifies supertest in this workspace */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

import request from 'supertest';
import {
  type Project,
  type ProjectStep,
  type ProjectActivityLog,
  type ProductionWorkOrder,
} from '../schema';

// ─────────────────────────────────────────────────────────────────────────────
// Typed interfaces for db query chain mocks
// ─────────────────────────────────────────────────────────────────────────────

interface SelectLimitChain {
  limit: (n: number) => Promise<Record<string, unknown>[]>;
}
interface SelectOrderByChain {
  orderBy: (col: unknown) => Promise<Record<string, unknown>[]>;
}
interface SelectAnyWhereChain {
  where: (
    cond: unknown
  ) =>
    Promise<Record<string, unknown>[]> | SelectLimitChain | SelectOrderByChain;
}
interface SelectFromChain {
  from: (table: unknown) => SelectAnyWhereChain;
}
interface UpdateWhereReturningChain {
  returning: () => Promise<Record<string, unknown>[]>;
}
interface UpdateSetChain {
  where: (cond: unknown) => UpdateWhereReturningChain;
}
interface UpdateFromChain {
  set: (data: unknown) => UpdateSetChain;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module mocks — hoisted above all non-type imports
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../storage', () => ({
  storage: {
    getNextProjectCode: vi.fn<() => Promise<string>>(),
    createProject: vi.fn<(data: unknown) => Promise<Project>>(),
    createProjectStep: vi.fn<(data: unknown) => Promise<ProjectStep>>(),
    createProjectActivityLog:
      vi.fn<(data: unknown) => Promise<ProjectActivityLog>>(),
    getProjectSteps: vi.fn<(id: string) => Promise<ProjectStep[]>>(),
    getWorkOrdersByProject:
      vi.fn<(id: string) => Promise<ProductionWorkOrder[]>>(),
    createProductionWorkOrder:
      vi.fn<(data: unknown) => Promise<ProductionWorkOrder>>(),
    getProject: vi.fn(),
    getP2CustomerByCustomerId: vi.fn(),
    getEmployee: vi.fn(),
    getProjectActivityLog: vi.fn(),
    getProjectClosingByProjectId: vi.fn(),
  },
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn<() => SelectFromChain>(),
    update: vi.fn<(table: unknown) => UpdateFromChain>(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
  pool: { query: vi.fn() },
}));

vi.mock('../schema', () => ({
  customers: { id: {}, customerKey: {}, name: {} },
  projects: { projectCode: {} },
  quotes: {},
  quoteLineItems: {},
  projectSteps: { projectId: {}, linkedQuoteId: {} },
  insertProjectSchema: {
    parse: vi.fn(),
    safeParse: vi.fn(() => ({ success: true, data: {} })),
  },
  insertProjectStepSchema: { parse: vi.fn() },
  insertProjectActivityLogSchema: { parse: vi.fn() },
  insertProjectNotificationSchema: { parse: vi.fn() },
  insertQuoteSchema: { parse: vi.fn() },
  insertQuoteLineItemSchema: { parse: vi.fn() },
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
  apiIntegrationKeys: {},
}));

vi.mock('../identity/userIdentity', () => ({
  createEmployeeIdentitySnapshot: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/lib/projectClosingValidation', () => ({
  validateProjectClosing: vi.fn(),
  deriveClosingStatus: vi.fn().mockReturnValue(null),
}));

vi.mock('../utils/fileUpload', () => ({
  quoteAttachmentUpload: { array: vi.fn() },
  quoteAttachmentsDir: '/tmp/test-quote-uploads',
}));

import { storage } from '../storage';
import { db } from '../db';
import {
  productionWorkOrders,
  projectSteps,
  projects,
  quoteLineItems,
} from '../schema';

// ─────────────────────────────────────────────────────────────────────────────
// Typed mock chain builder functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * db.select().from(table).where(cond) → Promise<rows>
 * Used for the quote fetch: db.select().from(quotes).where(eq(quotes.id, id))
 */
function selectDirect(rows: Record<string, unknown>[]): SelectFromChain {
  const whereFn = vi
    .fn<(cond: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const fromFn = vi
    .fn<(table: unknown) => SelectAnyWhereChain>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

/**
 * db.select({...}).from(table).where(cond).limit(n) → Promise<rows>
 * Used for the project-step lookup: db.select({projectId:...}).from(projectSteps).where(...).limit(1)
 */
function selectLimit(rows: Record<string, unknown>[]): SelectFromChain {
  const limitFn = vi
    .fn<(n: number) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi
    .fn<(cond: unknown) => SelectLimitChain>()
    .mockReturnValue({ limit: limitFn });
  const fromFn = vi
    .fn<(table: unknown) => SelectAnyWhereChain>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

/**
 * db.select().from(table).where(cond).orderBy(col) → Promise<rows>
 * Used for the line-item fetch: db.select().from(quoteLineItems).where(...).orderBy(...)
 */
function selectOrderBy(rows: Record<string, unknown>[]): SelectFromChain {
  const orderByFn = vi
    .fn<(col: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi
    .fn<(cond: unknown) => SelectOrderByChain>()
    .mockReturnValue({ orderBy: orderByFn });
  const fromFn = vi
    .fn<(table: unknown) => SelectAnyWhereChain>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

/**
 * db.update(table).set({...}).where(cond).returning() → Promise<rows>
 */
function updateReturning(rows: Record<string, unknown>[]): UpdateFromChain {
  const returningFn = vi
    .fn<() => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi
    .fn<(cond: unknown) => UpdateWhereReturningChain>()
    .mockReturnValue({ returning: returningFn });
  const setFn = vi
    .fn<(data: unknown) => UpdateSetChain>()
    .mockReturnValue({ where: whereFn });
  return { set: setFn };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_ID = 'proj-aaaa-bbbb-cccc-ddddeeeeeeee';
const QUOTE_ID = 'quote-1111-2222-3333-444455556666';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    projectCode: 'PROJ-001',
    projectName: 'Acme Corp — QUO26-0001',
    customerId: 'cust-1',
    status: 'active',
    description: null,
    targetShipDate: null,
    currentStage: null,
    projectManagerId: null,
    reminderDays: 3,
    createdAt: new Date('2026-01-01'),
    updatedAt: null,
    ...overrides,
  } as Project;
}

function makeWad(
  overrides: Partial<ProductionWorkOrder> = {}
): ProductionWorkOrder {
  return {
    id: 'wad-new-1',
    workOrderNumber: 'WAD-99999',
    projectId: PROJECT_ID,
    partNumber: 'TBD',
    quantity: 1,
    status: 'PLANNED',
    description: 'Auto-created WAD for Acme Corp — QUO26-0001',
    totalBudgetHours: null,
    ...overrides,
  } as ProductionWorkOrder;
}

function setupStorageForProjectCreation(): void {
  vi.mocked(storage.getNextProjectCode).mockResolvedValue('PROJ-001');
  vi.mocked(storage.createProject).mockResolvedValue(makeProject());
  vi.mocked(storage.createProjectStep).mockResolvedValue({} as ProjectStep);
  vi.mocked(storage.createProjectActivityLog).mockResolvedValue(
    {} as ProjectActivityLog
  );
  vi.mocked(storage.getProjectSteps).mockResolvedValue([]);
  vi.mocked(storage.getWorkOrdersByProject).mockResolvedValue([]);
  vi.mocked(storage.createProductionWorkOrder).mockResolvedValue(makeWad());
  vi.mocked(db.select).mockReturnValue(selectLimit([]));
}

/**
 * Configure the three db.select() and one db.update() calls made by
 * PATCH /api/quotes/:id/status → ACCEPTED in the order they execute:
 *   1. select quote by id
 *   2. select project steps linked to quote (limit 1)
 *   3. select line items ordered by line number
 *   4. update quote status (returning)
 */
let transactionInsertValues: Array<{
  table: unknown;
  value: Record<string, unknown>;
}> = [];
function setupDbForAccept(quoteStatus: 'SENT' | 'ACCEPTED' = 'SENT'): void {
  const mockQuote = {
    id: QUOTE_ID,
    quoteNumber: 'QUO26-0001',
    customerName: 'Acme Corp',
    customerId: 'cust-1',
    status: quoteStatus,
    description: null,
    updatedAt: null,
    projectId: quoteStatus === 'ACCEPTED' ? PROJECT_ID : null,
  };
  const updatedQuote = { ...mockQuote, status: 'ACCEPTED' };

  vi.mocked(db.select)
    .mockReturnValueOnce(selectDirect([mockQuote]))
    .mockReturnValueOnce(
      selectDirect([{ ...updatedQuote, projectId: PROJECT_ID }])
    );
  if (quoteStatus === 'ACCEPTED')
    vi.mocked(db.update).mockReturnValueOnce(
      updateReturning([{ ...updatedQuote, projectId: PROJECT_ID }])
    );
  transactionInsertValues = [];
  const tx = {
    select: vi.fn((selection?: unknown) => ({
      from: vi.fn((table: unknown) => {
        if (table === projects && selection)
          return Promise.resolve([{ maxCode: null }]);
        if (table === productionWorkOrders)
          return {
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([{ id: 'wad-existing' }]),
            })),
          };
        if (table === projectSteps) return selectLimit([]).from(table);
        if (table === quoteLineItems) return selectOrderBy([]).from(table);
        return {
          where: vi.fn(() => ({
            for: vi.fn().mockResolvedValue([mockQuote]),
            orderBy: vi.fn().mockResolvedValue([]),
          })),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((value: Record<string, unknown>) => {
        transactionInsertValues.push({ table, value });
        return table === projects
          ? { returning: vi.fn().mockResolvedValue([makeProject()]) }
          : Promise.resolve([]);
      }),
    })),
  };
  vi.mocked(db.transaction as any).mockImplementation(
    async (callback: (transaction: typeof tx) => Promise<string>) =>
      callback(tx)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/projects — creates project AND WAD
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/projects — WAD auto-creation', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupStorageForProjectCreation();
    app = express();
    app.use(express.json());
    const projectsRouter = (await import('../src/routes/projects')).default;
    app.use('/api/projects', projectsRouter);
  });

  it('responds 201 and auto-creates a WAD in PLANNED status alongside the project', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .post('/api/projects')
      .send({ projectName: 'Test Project', customerId: 'cust-1' });

    expect(res.status).toBe(201);
    expect(storage.createProject).toHaveBeenCalledOnce();
    expect(storage.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ workflowVersion: 'legacy_v1' })
    );
    const steps = vi
      .mocked(storage.createProjectStep)
      .mock.calls.map(([value]) => value as any);
    expect(steps.map((step) => step.stepType)).toEqual([
      'rfq_risk_assessment',
      'quote',
      'purchase_review_checklist',
      'preproduction_checklist',
      'p2_order',
    ]);
    expect(steps.map((step) => step.status)).toEqual([
      'in_progress',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);

    expect(storage.createProductionWorkOrder).toHaveBeenCalledOnce();
    const wadArg = vi.mocked(storage.createProductionWorkOrder).mock
      .calls[0][0] as Record<string, unknown>;
    expect(wadArg.status).toBe('PLANNED');
    expect(wadArg.projectId).toBe(PROJECT_ID);
    expect(wadArg.partNumber).toBe('TBD');
    expect(String(wadArg.workOrderNumber)).toMatch(/^WAD-/);

    expect(
      consoleSpy.mock.calls.filter((c) => String(c[0]).includes('[WAD] Failed'))
    ).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it('skips WAD creation when one already exists for the project (duplicate guard)', async () => {
    vi.mocked(storage.getWorkOrdersByProject).mockResolvedValue([makeWad()]);

    const res = await request(app)
      .post('/api/projects')
      .send({ projectName: 'Test Project', customerId: 'cust-1' });

    expect(res.status).toBe(201);
    expect(storage.createProductionWorkOrder).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/quotes/:id/status → ACCEPTED — creates project AND WAD
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/quotes/:id/status → ACCEPTED — WAD auto-creation', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupStorageForProjectCreation();
    app = express();
    app.use(express.json());
    const quotesRouter = (await import('../src/routes/quotes')).default;
    app.use(quotesRouter);
  });

  it('creates a project and a WAD in PLANNED status when a quote is first accepted', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setupDbForAccept('SENT');

    const res = await request(app)
      .patch(`/api/quotes/${QUOTE_ID}/status`)
      .send({ status: 'ACCEPTED' });

    expect(res.status).toBe(200);
    expect(
      consoleSpy.mock.calls.filter((c) => String(c[0]).includes('[WAD] Failed'))
    ).toHaveLength(0);

    const projectArg = transactionInsertValues.find(
      ({ table }) => table === projects
    )?.value!;
    expect(projectArg.projectName).toContain('Acme Corp');
    expect(projectArg.status).toBe('active');
    expect(projectArg.workflowVersion).toBe('legacy_v1');
    const stepArgs = transactionInsertValues
      .filter(({ table }) => table === projectSteps)
      .map(({ value }) => value);
    expect(stepArgs.map((step) => step.stepType)).toEqual([
      'rfq_risk_assessment',
      'quote',
      'purchase_review_checklist',
      'preproduction_checklist',
      'p2_order',
    ]);
    expect(stepArgs.map((step) => step.status)).toEqual([
      'in_progress',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);

    const wadArg = transactionInsertValues.find(
      ({ table }) => table === productionWorkOrders
    )?.value!;
    expect(wadArg.status).toBe('PLANNED');
    expect(wadArg.projectId).toBe(PROJECT_ID);

    consoleSpy.mockRestore();
  });

  it('creates exactly one WAD even when the same quote is accepted a second time', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    setupDbForAccept('SENT');
    const res1 = await request(app)
      .patch(`/api/quotes/${QUOTE_ID}/status`)
      .send({ status: 'ACCEPTED' });
    expect(res1.status).toBe(200);
    expect(
      transactionInsertValues.filter(
        ({ table }) => table === productionWorkOrders
      )
    ).toHaveLength(1);

    setupDbForAccept('ACCEPTED');
    const res2 = await request(app)
      .patch(`/api/quotes/${QUOTE_ID}/status`)
      .send({ status: 'ACCEPTED' });
    expect(res2.status).toBe(200);

    expect(
      transactionInsertValues.filter(
        ({ table }) => table === productionWorkOrders
      )
    ).toHaveLength(0);

    expect(
      consoleSpy.mock.calls.filter((c) => String(c[0]).includes('[WAD] Failed'))
    ).toHaveLength(0);
    consoleSpy.mockRestore();
  });
});
