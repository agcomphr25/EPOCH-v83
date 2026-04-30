import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Typed mock chain interfaces — used throughout this file instead of `any`.
// ---------------------------------------------------------------------------

interface MockWhereChain {
  where: (cond: unknown) => Promise<Record<string, unknown>[]>;
}
interface MockFromChain {
  from: (table: unknown) => MockWhereChain;
}
interface MockReturningChain {
  returning: () => Promise<Record<string, unknown>[]>;
}
interface MockValuesChain {
  values: (data: unknown) => MockReturningChain;
}
interface MockSetChain {
  set: (data: unknown) => { where: (cond: unknown) => { returning: () => Promise<Record<string, unknown>[]> } };
}
interface MockDeleteChain {
  where: (cond: unknown) => Promise<void>;
}
interface MockTx {
  select: () => MockFromChain;
  insert: (table: unknown) => MockValuesChain;
  update: (table: unknown) => MockSetChain;
  delete: (table: unknown) => MockDeleteChain;
}
type TxCallback = (tx: MockTx) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any imports that pull in the modules.
// ---------------------------------------------------------------------------

// Mock 'pg' so training.ts's top-level `new Pool(...)` does not attempt a
// real TCP connection.
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
    connect: vi.fn(),
  })),
}));

// Mock multer so the module-level `multer({ storage: multer.memoryStorage() })`
// call succeeds without real disk/memory storage setup.
vi.mock('multer', () => {
  const noop: (req: Request, res: Response, next: NextFunction) => void =
    (_req, _res, next) => next();

  function multerFn() {
    return { single: () => noop, array: () => noop, fields: () => noop, none: () => noop };
  }
  multerFn.memoryStorage = () => ({});
  multerFn.diskStorage = () => ({});
  return { default: multerFn };
});

// Mock azure document intelligence so importing training.ts doesn't try to
// initialise an Azure SDK at module load time.
vi.mock('../src/lib/azureDocumentIntelligence', () => ({
  extractTrainingContent: vi.fn(),
  extractTrainingMatrixData: vi.fn(),
}));

// Mock connector health service (used by some middleware chains).
vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

// Mock auth middleware so routes do not require real session tokens.
vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn(
    (_req: Request, _res: Response, next: NextFunction) => next()
  ),
  requireRole: vi.fn(
    () => (_req: Request, _res: Response, next: NextFunction) => next()
  ),
}));

// Central db mock — each test configures individual vi.fn() return values.
vi.mock('../db', () => ({
  db: {
    select: vi.fn<() => MockFromChain>(),
    insert: vi.fn<(t: unknown) => MockValuesChain>(),
    update: vi.fn<(t: unknown) => MockSetChain>(),
    transaction: vi.fn<(cb: TxCallback) => Promise<unknown>>(),
    query: {},
  },
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { db } from '../db';
import { DatabaseStorage } from '../storage';

// ---------------------------------------------------------------------------
// Shared select-chain factory
// ---------------------------------------------------------------------------

function makeSelectChain(rows: Record<string, unknown>[]): MockFromChain {
  return { from: () => ({ where: () => Promise.resolve(rows) }) };
}

// ---------------------------------------------------------------------------
// checkEmployeeP2PartCertification — department-name normalisation
// ---------------------------------------------------------------------------

describe('DatabaseStorage.checkEmployeeP2PartCertification — department normalisation', () => {
  let storageInstance: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storageInstance = new DatabaseStorage();
  });

  function makeFullyQualifiedRow(department: string) {
    return {
      id: 1,
      department,
      drawingKnowledge: true,
      specSheetUnderstanding: true,
      procedureCompletion: true,
      certifiedDate: new Date(),
    };
  }

  it('returns true when department in DB has different casing from the request', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([makeFullyQualifiedRow('CNC')])
    );
    expect(
      await storageInstance.checkEmployeeP2PartCertification(1, 'PN-001', 'cnc')
    ).toBe(true);
  });

  it('returns true when department in DB has leading/trailing whitespace', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([makeFullyQualifiedRow('  CNC  ')])
    );
    expect(
      await storageInstance.checkEmployeeP2PartCertification(1, 'PN-001', 'CNC')
    ).toBe(true);
  });

  it('returns true when department in DB has mixed casing and whitespace, request uses clean name', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([makeFullyQualifiedRow('  Cnc  ')])
    );
    expect(
      await storageInstance.checkEmployeeP2PartCertification(1, 'PN-001', 'CNC')
    ).toBe(true);
  });

  it('returns true when department in DB has non-alphanumeric chars that should be stripped', async () => {
    // "CNC-Dept" normalises to "cncdept"; "CNCDept" also normalises to "cncdept".
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([makeFullyQualifiedRow('CNC-Dept')])
    );
    expect(
      await storageInstance.checkEmployeeP2PartCertification(1, 'PN-001', 'CNCDept')
    ).toBe(true);
  });

  it('returns false when department names do not match after normalisation', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([makeFullyQualifiedRow('WELD')])
    );
    expect(
      await storageInstance.checkEmployeeP2PartCertification(1, 'PN-001', 'CNC')
    ).toBe(false);
  });

  it('returns false when department matches but the employee is not fully certified', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([
        {
          id: 2,
          department: 'CNC',
          drawingKnowledge: true,
          specSheetUnderstanding: false, // one checkbox not checked
          procedureCompletion: true,
          certifiedDate: null,
        },
      ])
    );
    expect(
      await storageInstance.checkEmployeeP2PartCertification(1, 'PN-001', 'CNC')
    ).toBe(false);
  });

  it('returns false when department matches but certifiedDate is null', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([
        {
          id: 3,
          department: 'CNC',
          drawingKnowledge: true,
          specSheetUnderstanding: true,
          procedureCompletion: true,
          certifiedDate: null, // missing certified date
        },
      ])
    );
    expect(
      await storageInstance.checkEmployeeP2PartCertification(1, 'PN-001', 'CNC')
    ).toBe(false);
  });

  it('returns false when the DB returns no rows for the employee/partNumber', async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]));
    expect(
      await storageInstance.checkEmployeeP2PartCertification(1, 'PN-001', 'CNC')
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkEmployeeHasValidTrainingCertification — part-number filtering
// ---------------------------------------------------------------------------

describe('DatabaseStorage.checkEmployeeHasValidTrainingCertification — part-number filtering', () => {
  let storageInstance: DatabaseStorage;
  const FUTURE = new Date(Date.now() + 86_400_000 * 365);
  const PAST = new Date(Date.now() - 86_400_000);

  beforeEach(() => {
    vi.clearAllMocks();
    storageInstance = new DatabaseStorage();
  });

  function makeCertRow(
    certPartNumber: string | null,
    expiresAt: Date | null = null,
    id = 1
  ) {
    return { id, status: 'certified', expiresAt, certPartNumber };
  }

  it('returns the cert when certPartNumber matches the requested part number', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([makeCertRow('PN-001')])
    );
    const result = await storageInstance.checkEmployeeHasValidTrainingCertification(1, 'PN-001');
    expect(result).toBeDefined();
    expect(result!.id).toBe(1);
  });

  it('returns undefined when certPartNumber does not match the requested part number', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([makeCertRow('PN-002')])
    );
    const result = await storageInstance.checkEmployeeHasValidTrainingCertification(1, 'PN-001');
    expect(result).toBeUndefined();
  });

  it('returns the cert when certPartNumber is null (legacy/general record) and a partNumber is requested', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([makeCertRow(null)])
    );
    const result = await storageInstance.checkEmployeeHasValidTrainingCertification(1, 'PN-001');
    expect(result).toBeDefined();
    expect(result!.id).toBe(1);
  });

  it('returns undefined when the only matching cert is expired', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([makeCertRow('PN-001', PAST)])
    );
    const result = await storageInstance.checkEmployeeHasValidTrainingCertification(1, 'PN-001');
    expect(result).toBeUndefined();
  });

  it('returns the cert when it has a future expiry and the part number matches', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([makeCertRow('PN-001', FUTURE)])
    );
    const result = await storageInstance.checkEmployeeHasValidTrainingCertification(1, 'PN-001');
    expect(result).toBeDefined();
  });

  it('returns the first active cert when no partNumber is provided', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([makeCertRow('SOME-PN')])
    );
    const result = await storageInstance.checkEmployeeHasValidTrainingCertification(1);
    expect(result).toBeDefined();
    expect(result!.id).toBe(1);
  });

  it('returns undefined when no partNumber is provided but all certs are expired', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([makeCertRow('PN-001', PAST)])
    );
    const result = await storageInstance.checkEmployeeHasValidTrainingCertification(1);
    expect(result).toBeUndefined();
  });

  it('matches a general (null partNumber) cert before a part-specific one when it appears first', async () => {
    // The implementation uses Array.find, so it returns the first matching row.
    // A null certPartNumber always matches any requested partNumber, so the
    // general cert (id 10) is returned here because it is listed first.
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([
        makeCertRow(null, null, 10),      // general — appears first
        makeCertRow('PN-001', null, 20),  // specific
      ])
    );
    const result = await storageInstance.checkEmployeeHasValidTrainingCertification(1, 'PN-001');
    expect(result).toBeDefined();
    expect(result!.id).toBe(10); // general cert wins because it is found first
  });
});

// ---------------------------------------------------------------------------
// POST /api/training/p2-employee-certifications — transaction atomicity
// ---------------------------------------------------------------------------

describe('POST /api/training/p2-employee-certifications — transaction atomicity', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const { default: trainingRouter } = await import('../src/routes/training');
    app.use('/api/training', trainingRouter);
  });

  const validBody = {
    partCertificationId: 1,
    partNumber: 'PN-001',
    employeeId: 7,
    employeeName: 'Alice Smith',
    department: 'CNC',
    drawingKnowledge: true,
    specSheetUnderstanding: true,
    procedureCompletion: true,
  };

  it('returns 201 when the transaction completes successfully', async () => {
    const savedRecord = { id: 42, ...validBody, certifiedDate: new Date().toISOString() };
    vi.mocked(db.transaction).mockImplementation((cb: TxCallback) =>
      cb(buildSuccessTx(savedRecord))
    );

    const res = await request(app)
      .post('/api/training/p2-employee-certifications')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(42);
  });

  it('returns 500 and does not commit when grantP2CertificationCapability throws', async () => {
    // committedRecords tracks what the simulated "database" actually persisted.
    // On a real Postgres transaction, a throw inside the callback causes an
    // automatic rollback; here the mock replicates that contract.
    const committedRecords: Record<string, unknown>[] = [];

    vi.mocked(db.transaction).mockImplementation(async (cb: TxCallback) => {
      let pendingRecord: Record<string, unknown> | null = null;
      const tx = buildFailingGrantTx((r) => { pendingRecord = r; });

      try {
        const result = await cb(tx);
        // Callback completed without throwing → commit
        if (pendingRecord) committedRecords.push(pendingRecord);
        return result;
      } catch (err) {
        // Callback threw → rollback: pendingRecord is discarded
        throw err;
      }
    });

    const res = await request(app)
      .post('/api/training/p2-employee-certifications')
      .send(validBody);

    expect(res.status).toBe(500);
    // Nothing committed — the cert row must not have been persisted.
    expect(committedRecords).toHaveLength(0);
  });

  it('skips grantP2CertificationCapability when not all checkboxes are true', async () => {
    const partialBody = { ...validBody, procedureCompletion: false };
    const savedRecord = { id: 43, ...partialBody, certifiedDate: null };

    let txInsertCount = 0;
    vi.mocked(db.transaction).mockImplementation((cb: TxCallback) => {
      const tx: MockTx = {
        insert: () => ({
          values: () => ({
            returning: async () => {
              txInsertCount++;
              return [savedRecord];
            },
          }),
        }),
        select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
        update: () => ({
          set: () => ({ where: () => ({ returning: async () => [savedRecord] }) }),
        }),
      };
      return cb(tx);
    });

    const res = await request(app)
      .post('/api/training/p2-employee-certifications')
      .send(partialBody);

    expect(res.status).toBe(201);
    // With procedureCompletion: false, certifiedDate is null, so
    // grantP2CertificationCapability is never entered — only one insert fires.
    expect(txInsertCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/training/p2-employee-certifications/:id — transaction atomicity
// ---------------------------------------------------------------------------

describe('PATCH /api/training/p2-employee-certifications/:id — transaction atomicity', () => {
  let app: express.Express;

  const existingRecord = {
    id: 99,
    partCertificationId: 1,
    partNumber: 'PN-001',
    employeeId: 7,
    employeeName: 'Alice Smith',
    department: 'CNC',
    drawingKnowledge: false,
    specSheetUnderstanding: false,
    procedureCompletion: false,
    certifiedDate: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const { default: trainingRouter } = await import('../src/routes/training');
    app.use('/api/training', trainingRouter);
  });

  it('returns 404 when the cert record does not exist', async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]));

    const res = await request(app)
      .patch('/api/training/p2-employee-certifications/99')
      .send({ drawingKnowledge: true });

    expect(res.status).toBe(404);
  });

  it('returns 200 when the transaction completes successfully', async () => {
    const updatedRecord = { ...existingRecord, drawingKnowledge: true };
    vi.mocked(db.select).mockReturnValue(makeSelectChain([existingRecord]));
    vi.mocked(db.transaction).mockImplementation((cb: TxCallback) =>
      cb(buildSuccessUpdateTx(updatedRecord))
    );

    const res = await request(app)
      .patch('/api/training/p2-employee-certifications/99')
      .send({ drawingKnowledge: true });

    expect(res.status).toBe(200);
    expect(res.body.drawingKnowledge).toBe(true);
  });

  it('returns 500 and does not commit when grantP2CertificationCapability throws inside PATCH', async () => {
    // Existing record has all checkboxes false; update sets all to true →
    // triggers the grantP2CertificationCapability branch, which then throws.
    vi.mocked(db.select).mockReturnValue(makeSelectChain([existingRecord]));

    const committedRecords: Record<string, unknown>[] = [];

    vi.mocked(db.transaction).mockImplementation(async (cb: TxCallback) => {
      let pendingRecord: Record<string, unknown> | null = null;
      const tx = buildFailingGrantUpdateTx((r) => { pendingRecord = r; });

      try {
        const result = await cb(tx);
        if (pendingRecord) committedRecords.push(pendingRecord);
        return result;
      } catch (err) {
        // Rollback: pendingRecord is discarded
        throw err;
      }
    });

    const res = await request(app)
      .patch('/api/training/p2-employee-certifications/99')
      .send({
        drawingKnowledge: true,
        specSheetUnderstanding: true,
        procedureCompletion: true,
      });

    expect(res.status).toBe(500);
    // The update row must not have been persisted.
    expect(committedRecords).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Revoke / downgrade path tests
  // -------------------------------------------------------------------------

  const fullyCertifiedRecord = {
    id: 99,
    partCertificationId: 1,
    partNumber: 'PN-001',
    employeeId: 7,
    employeeName: 'Alice Smith',
    department: 'CNC',
    drawingKnowledge: true,
    specSheetUnderstanding: true,
    procedureCompletion: true,
    certifiedDate: new Date().toISOString(),
  };

  it('calls revokeP2CertificationCapability when a fully-certified record is downgraded', async () => {
    const downgradedRecord = { ...fullyCertifiedRecord, procedureCompletion: false, certifiedDate: null };
    vi.mocked(db.select).mockReturnValue(makeSelectChain([fullyCertifiedRecord]));

    let deleteWasCalled = false;
    vi.mocked(db.transaction).mockImplementation((cb: TxCallback) =>
      cb(buildSuccessRevokeTx(downgradedRecord, () => { deleteWasCalled = true; }))
    );

    const res = await request(app)
      .patch('/api/training/p2-employee-certifications/99')
      .send({ procedureCompletion: false });

    expect(res.status).toBe(200);
    expect(deleteWasCalled).toBe(true);
  });

  it('calls revoke then grant when partNumber changes on a fully-certified record', async () => {
    const updatedRecord = { ...fullyCertifiedRecord, partNumber: 'PN-002' };
    vi.mocked(db.select).mockReturnValue(makeSelectChain([fullyCertifiedRecord]));

    let deleteCount = 0;
    let insertCount = 0;
    vi.mocked(db.transaction).mockImplementation((cb: TxCallback) =>
      cb(buildRevokeAndGrantTx(updatedRecord, () => { deleteCount++; }, () => { insertCount++; }))
    );

    const res = await request(app)
      .patch('/api/training/p2-employee-certifications/99')
      .send({ partNumber: 'PN-002' });

    expect(res.status).toBe(200);
    expect(deleteCount).toBe(1);         // revoke fired exactly once
    expect(insertCount).toBeGreaterThanOrEqual(1); // grant fired at least one insert
  });

  it('returns 500 when revokeP2CertificationCapability throws during a downgrade', async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([fullyCertifiedRecord]));

    vi.mocked(db.transaction).mockImplementation(async (cb: TxCallback) => {
      try {
        return await cb(buildFailingRevokeTx(fullyCertifiedRecord));
      } catch (err) {
        throw err;
      }
    });

    const res = await request(app)
      .patch('/api/training/p2-employee-certifications/99')
      .send({ procedureCompletion: false });

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Transaction mock helpers — all typed with MockTx
// ---------------------------------------------------------------------------

function buildSuccessTx(record: Record<string, unknown>): MockTx {
  let insertCount = 0;
  return {
    insert: () => ({
      values: () => ({
        returning: async () => {
          insertCount++;
          if (insertCount === 1) return [record];                           // p2EmployeePartCertifications
          if (insertCount === 2) return [{ id: 1, name: 'P2_CERT_PN-001_CNC' }]; // capabilities
          return [];                                                         // employeeCapabilities
        },
      }),
    }),
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => [record] }) }),
    }),
    delete: () => ({ where: async () => {} }),
  };
}

/** Tx where the capabilities insert (second insert) throws, simulating a DB failure. */
function buildFailingGrantTx(
  onFirstInsert: (record: Record<string, unknown>) => void
): MockTx {
  let insertCount = 0;
  const firstRecord = { id: 42, partNumber: 'PN-001', department: 'CNC', employeeId: 7 };
  return {
    insert: () => ({
      values: () => ({
        returning: async () => {
          insertCount++;
          if (insertCount === 1) {
            onFirstInsert(firstRecord); // cert row "written" (but not yet committed)
            return [firstRecord];
          }
          // capabilities insert inside grantP2CertificationCapability fails
          throw new Error('DB constraint violation: capabilities insert failed');
        },
      }),
    }),
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => [] }) }),
    }),
    delete: () => ({ where: async () => {} }),
  };
}

function buildSuccessUpdateTx(record: Record<string, unknown>): MockTx {
  return {
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => [record] }) }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: 1, name: 'P2_CERT_PN-001_CNC' }],
      }),
    }),
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    delete: () => ({ where: async () => {} }),
  };
}

/** Tx where the update succeeds but the capabilities insert throws. */
function buildFailingGrantUpdateTx(
  onUpdate: (record: Record<string, unknown>) => void
): MockTx {
  let insertCount = 0;
  const updatedRecord = {
    id: 99, partNumber: 'PN-001', department: 'CNC', employeeId: 7,
    drawingKnowledge: true, specSheetUnderstanding: true, procedureCompletion: true,
  };
  return {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            onUpdate(updatedRecord); // update "written" (pending commit)
            return [updatedRecord];
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => {
          insertCount++;
          throw new Error('DB failure inside grantP2CertificationCapability');
        },
      }),
    }),
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    delete: () => ({ where: async () => {} }),
  };
}

/**
 * Tx for a successful revoke (downgrade): update returns the updated record,
 * the select for the capability returns a capability row, and delete succeeds.
 * onDelete is called when the delete's where() executes.
 */
function buildSuccessRevokeTx(
  record: Record<string, unknown>,
  onDelete: () => void
): MockTx {
  return {
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => [record] }) }),
    }),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ id: 1, name: 'P2_CERT_PN-001_CNC' }]),
      }),
    }),
    insert: () => ({
      values: () => ({ returning: async () => [] }),
    }),
    delete: () => ({
      where: async () => { onDelete(); },
    }),
  };
}

/**
 * Tx for a revoke+grant scenario (part-number change on a fully-certified record).
 * onDelete is called when the revoke delete fires.
 * onInsert is called for each insert that fires (capability + employeeCapability).
 */
function buildRevokeAndGrantTx(
  record: Record<string, unknown>,
  onDelete: () => void,
  onInsert: () => void
): MockTx {
  let selectCallCount = 0;
  return {
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => [record] }) }),
    }),
    select: () => ({
      from: () => ({
        where: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // revokeP2CertificationCapability: look up existing capability
            return Promise.resolve([{ id: 1, name: 'P2_CERT_PN-001_CNC' }]);
          }
          // grantP2CertificationCapability: capability not found → will insert
          // subsequent call: employeeCapability not found → will insert
          return Promise.resolve([]);
        },
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => {
          onInsert();
          return [{ id: 2, name: 'P2_CERT_PN-002_CNC' }];
        },
      }),
    }),
    delete: () => ({
      where: async () => { onDelete(); },
    }),
  };
}

/**
 * Tx where the update succeeds but revokeP2CertificationCapability's delete throws,
 * simulating a DB failure during capability revocation.
 */
function buildFailingRevokeTx(record: Record<string, unknown>): MockTx {
  return {
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => [record] }) }),
    }),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ id: 1, name: 'P2_CERT_PN-001_CNC' }]),
      }),
    }),
    insert: () => ({
      values: () => ({ returning: async () => [] }),
    }),
    delete: () => ({
      where: async () => {
        throw new Error('DB failure inside revokeP2CertificationCapability');
      },
    }),
  };
}
