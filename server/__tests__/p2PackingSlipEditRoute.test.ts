/**
 * Route-level integration tests for PATCH /api/p2/packing-slips/:id.
 *
 * The PATCH handler in server/src/routes/p2Shipping.ts edits three fields
 * (packing slip #, ship date, lot #), enforces uniqueness, transactionally
 * updates p2_lot_numbers when a slip is linked to a lot, and writes one
 * audit log entry per changed field.  These tests exercise each of those
 * paths via the actual Express router, mocking the database layer at the
 * pg pool/client boundary so query SQL is observable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest before any imports)
// ---------------------------------------------------------------------------

const p2NumberMocks = vi.hoisted(() => ({
  syncP2InvoiceSequenceFromManualNumber: vi.fn(),
  recordP2InvoiceNumberAudit: vi.fn(),
}));

const pdfMocks = vi.hoisted(() => ({
  generatePackingSlipPdf: vi.fn(),
}));

// Auth: authenticateToken is a no-op (the test middleware below sets req.user).
// requireRole is a faithful re-implementation that returns 403 when the
// authenticated user's role is not in the allowed list — this lets us cover
// the non-admin/owner rejection path.
vi.mock('../middleware/auth', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireRole:
    (...roles: string[]) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    },
}));

// Database mock — pool.query is the read-side; pgPool.connect returns a
// fake transaction client whose query method we observe in tests.
const poolQuery = vi.fn();
const clientQuery = vi.fn();
const clientRelease = vi.fn();
const pgPoolConnect = vi.fn(async () => ({
  query: clientQuery,
  release: clientRelease,
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  pool: {
    query: (...args: any[]) => poolQuery(...args),
  },
  pgPool: {
    connect: () => pgPoolConnect(),
  },
}));

// Stub side-effecting service imports so the route file loads cleanly.
vi.mock('../src/services/invoiceFromPackingSlip', () => ({
  createInvoiceFromPackingSlip: vi.fn(),
}));

vi.mock('../src/services/p2InvoiceNumberService', () => ({
  reserveP2InvoiceNumber: vi.fn(async () => ({
    invoiceNumber: 'RW26-0001',
    prefix: 'RW',
    year: 2026,
    sequenceNumber: 1,
    customerId: 'RWC',
    customerName: 'Rock West Composites',
  })),
  syncP2InvoiceSequenceFromManualNumber: (...args: any[]) =>
    p2NumberMocks.syncP2InvoiceSequenceFromManualNumber(...args),
  recordP2InvoiceNumberAudit: (...args: any[]) =>
    p2NumberMocks.recordP2InvoiceNumberAudit(...args),
}));

vi.mock('../utils/pdf/packingSlipPdf', () => ({
  generatePackingSlipPdf: (...args: any[]) => pdfMocks.generatePackingSlipPdf(...args),
}));

vi.mock('../replit_integrations/object_storage/objectStorage', () => ({
  ObjectStorageService: class {
    constructor() {}
  },
}));

// ---------------------------------------------------------------------------
// Test app helper
// ---------------------------------------------------------------------------

type TestUser = { id: number; username: string; role: string };

async function buildApp(user: TestUser | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) {
      (req as Request).user = {
        id: user.id,
        username: user.username,
        role: user.role,
        employeeId: null,
        canOverridePrices: false,
        isActive: true,
      };
    }
    next();
  });
  const router = (await import('../src/routes/p2Shipping')).default;
  app.use('/api/p2', router);
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SLIP_ID = '11111111-1111-1111-1111-111111111111';
const LOT_ID = '22222222-2222-2222-2222-222222222222';

type SlipRow = {
  id: string;
  packing_slip_number: string;
  invoice_number: string | null;
  ship_date: string | null;
  lot_number: string | null;
  lot_number_id: string | null;
  customer_id: string;
  customer_name: string;
};

function slipRow(overrides: Partial<SlipRow> = {}): SlipRow {
  return {
    id: SLIP_ID,
    packing_slip_number: 'PS-100',
    invoice_number: 'PS-100',
    ship_date: null,
    lot_number: 'LOT-100',
    lot_number_id: LOT_ID,
    customer_id: 'RWC',
    customer_name: 'Rock West Composites',
    ...overrides,
  };
}

/**
 * Build a poolQuery implementation that responds based on SQL substrings.
 * The PATCH handler issues at most three pool.query calls before opening a
 * transaction:
 *   1. SELECT ... FROM p2_packing_slips WHERE id = $1   (fetch current slip)
 *   2. SELECT id FROM p2_packing_slips WHERE packing_slip_number = $1 ...
 *      (uniqueness for slip number — only when slip # is being changed)
 *   3. SELECT id FROM p2_lot_numbers WHERE lot_number = $1 ...
 *      (uniqueness for lot # — only when lot # is being changed)
 * Plus an idempotent ALTER TABLE issued on module init that we ignore.
 */
function setupPoolQuery(opts: {
  slip: SlipRow | null;
  duplicateSlipNumber?: boolean;
  duplicateInvoiceNumber?: boolean;
  duplicateLotNumber?: boolean;
  linkedInvoiceNumber?: string;
}) {
  poolQuery.mockImplementation(async (sql: string, _params?: any[]) => {
    const s = sql.replace(/\s+/g, ' ');
    if (s.includes('FROM user_sessions')) {
      const rows = [{ username: ADMIN.username, expires_at: new Date(Date.now() + 60_000) }];
      return Object.assign(rows, { rowCount: rows.length, rows });
    }
    if (s.includes('FROM users') && s.includes('is_active = true')) {
      const rows = [{ username: ADMIN.username, role: ADMIN.role }];
      return Object.assign(rows, { rowCount: rows.length, rows });
    }
    if (s.includes('ALTER TABLE')) {
      return Object.assign([], { rowCount: 0, rows: [] });
    }
    if (s.includes('FROM p2_packing_slips') && s.includes('WHERE id = $1') && !s.includes('packing_slip_number = $1')) {
      const rows = opts.slip ? [opts.slip] : [];
      return Object.assign(rows, { rowCount: rows.length, rows });
    }
    if (s.includes('FROM p2_packing_slips') && s.includes('packing_slip_number = $1')) {
      const rows = opts.duplicateSlipNumber ? [{ id: 'other-slip' }] : [];
      return Object.assign(rows, { rowCount: rows.length, rows });
    }
    if (s.includes('FROM ar_invoices') && s.includes('packing_slip_id = $1')) {
      const rows = opts.linkedInvoiceNumber
        ? [{ id: 'invoice-1', invoice_number: opts.linkedInvoiceNumber }]
        : [];
      return Object.assign(rows, { rowCount: rows.length, rows });
    }
    if (s.includes('FROM ar_invoices') && s.includes('invoice_number = $1')) {
      const rows = opts.duplicateInvoiceNumber ? [{ id: 'invoice-dup' }] : [];
      return Object.assign(rows, { rowCount: rows.length, rows });
    }
    if (s.includes('FROM p2_lot_numbers') && s.includes('lot_number = $1')) {
      const rows = opts.duplicateLotNumber ? [{ id: 'other-lot' }] : [];
      return Object.assign(rows, { rowCount: rows.length, rows });
    }
    return Object.assign([], { rowCount: 0, rows: [] });
  });
}

/**
 * Default transaction client behaviour: BEGIN/COMMIT succeed, UPDATE returns
 * one row representing the persisted slip, INSERT into the audit log is
 * a no-op.  Tests can introspect clientQuery.mock.calls afterwards.
 */
function setupClientQuery(updatedRow: Record<string, any>) {
  clientQuery.mockImplementation(async (sql: string, _params?: any[]) => {
    const s = sql.trim().toUpperCase();
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }
    if (s.startsWith('UPDATE P2_PACKING_SLIPS')) {
      return { rows: [updatedRow], rowCount: 1 };
    }
    if (s.startsWith('UPDATE P2_LOT_NUMBERS')) {
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith('INSERT INTO P2_SHIPPING_AUDIT_LOG')) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

function auditCalls() {
  return clientQuery.mock.calls.filter(([sql]) =>
    String(sql).toUpperCase().includes('INSERT INTO P2_SHIPPING_AUDIT_LOG'),
  );
}

const ADMIN: TestUser = { id: 1, username: 'admin-user', role: 'ADMIN' };
const OWNER: TestUser = { id: 2, username: 'owner-user', role: 'OWNER' };
const STAFF: TestUser = { id: 3, username: 'staff-user', role: 'STAFF' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/p2/packing-slips/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a historical packing slip without renaming it to its linked invoice number', async () => {
    setupPoolQuery({
      slip: slipRow({
        packing_slip_number: 'ROC26-0004',
        invoice_number: 'ROC26-0004',
      }),
      linkedInvoiceNumber: 'ROC26-0007',
    });

    const app = await buildApp(ADMIN);
    const res = await request(app).get(`/api/p2/packing-slips/${SLIP_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.packingSlipNumber).toBe('ROC26-0004');
    expect(
      poolQuery.mock.calls.some(([sql]) =>
        String(sql).replace(/\s+/g, ' ').includes('UPDATE p2_packing_slips'),
      ),
    ).toBe(false);
  });
});

describe('GET /api/p2/packing-slips/:id/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a historical packing slip with its actually linked invoice number', async () => {
    setupPoolQuery({
      slip: slipRow({
        packing_slip_number: 'ROC26-0002',
        invoice_number: 'ROC26-0004',
      }),
      linkedInvoiceNumber: 'ROC26-0004',
    });
    pdfMocks.generatePackingSlipPdf.mockResolvedValue(Buffer.from('%PDF-test'));

    const app = await buildApp(ADMIN);
    const res = await request(app)
      .get(`/api/p2/packing-slips/${SLIP_ID}/pdf`)
      .set('Authorization', 'Bearer test-session');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/pdf/);
    expect(pdfMocks.generatePackingSlipPdf).toHaveBeenCalledWith(expect.objectContaining({
      packingSlipNumber: 'ROC26-0002',
      invoiceNumber: 'ROC26-0004',
    }));
  });

  it('still renders from the stored invoice number when the linked-invoice lookup fails', async () => {
    setupPoolQuery({
      slip: slipRow({
        packing_slip_number: 'ROC26-0002',
        invoice_number: 'ROC26-0004',
      }),
    });
    poolQuery.mockImplementationOnce(async (sql: string) => {
      const rows = [{ username: ADMIN.username, expires_at: new Date(Date.now() + 60_000) }];
      return Object.assign(rows, { rowCount: rows.length, rows });
    });
    const originalImplementation = poolQuery.getMockImplementation();
    poolQuery.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.replace(/\s+/g, ' ').includes('FROM ar_invoices')) {
        throw new Error('legacy schema mismatch');
      }
      return originalImplementation!(sql, params);
    });
    pdfMocks.generatePackingSlipPdf.mockResolvedValue(Buffer.from('%PDF-test'));

    const app = await buildApp(ADMIN);
    const res = await request(app)
      .get(`/api/p2/packing-slips/${SLIP_ID}/pdf`)
      .set('Authorization', 'Bearer test-session');

    expect(res.status).toBe(200);
    expect(pdfMocks.generatePackingSlipPdf).toHaveBeenCalledWith(expect.objectContaining({
      packingSlipNumber: 'ROC26-0002',
      invoiceNumber: 'ROC26-0004',
    }));
  });
});

describe('PATCH /api/p2/packing-slips/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates packing slip and invoice number together and clears the frozen PDF snapshot', async () => {
    setupPoolQuery({ slip: slipRow() });
    setupClientQuery({ id: SLIP_ID, packing_slip_number: 'RW26-0200', invoice_number: 'RW26-0200' });

    const app = await buildApp(ADMIN);

    const res = await request(app)
      .patch(`/api/p2/packing-slips/${SLIP_ID}`)
      .send({ packingSlipNumber: 'RW26-0200', reason: 'corrected typo' });

    expect(res.status).toBe(200);
    expect(res.body.packing_slip_number).toBe('RW26-0200');

    // Single audit entry, recording the slip-number change with the
    // authenticated session actor — never a body-supplied changedBy.
    const audits = auditCalls();
    expect(audits).toHaveLength(2);
    const fields = audits.map(([, params]) => (params as any[])[2]).sort();
    expect(fields).toEqual(['invoice_number', 'packing_slip_number']);
    for (const [, params] of audits) {
      expect((params as any[])[5]).toBe(ADMIN.username);
      expect((params as any[])[6]).toBe('corrected typo');
    }

    const updateSql = String(clientQuery.mock.calls.find(([sql]) =>
      String(sql).toUpperCase().startsWith('UPDATE P2_PACKING_SLIPS'),
    )?.[0] || '');
    expect(updateSql).toContain('packing_slip_number');
    expect(updateSql).toContain('invoice_number');
    expect(updateSql).toContain('external_pdf_url = NULL');
    expect(p2NumberMocks.syncP2InvoiceSequenceFromManualNumber).toHaveBeenCalledWith({
      customerId: 'RWC',
      customerName: 'Rock West Composites',
      invoiceNumber: 'RW26-0200',
    });
    expect(p2NumberMocks.recordP2InvoiceNumberAudit).toHaveBeenCalledWith(expect.objectContaining({
      packingSlipId: SLIP_ID,
      oldPackingSlipNumber: 'PS-100',
      newPackingSlipNumber: 'RW26-0200',
      oldInvoiceNumber: 'PS-100',
      newInvoiceNumber: 'RW26-0200',
      action: 'MANUAL_EDIT',
      changedBy: ADMIN.username,
    }));

    // No write into p2_lot_numbers when lot # is unchanged.
    const lotUpdates = clientQuery.mock.calls.filter(([sql]) =>
      String(sql).toUpperCase().includes('UPDATE P2_LOT_NUMBERS'),
    );
    expect(lotUpdates).toHaveLength(0);
  });

  it('updates packing slip #, ship date, and lot # together with one audit row per field and propagates lot # to p2_lot_numbers', async () => {
    setupPoolQuery({ slip: slipRow() });
    setupClientQuery({
      id: SLIP_ID,
      packing_slip_number: 'RW26-0201',
      invoice_number: 'RW26-0201',
      ship_date: '2026-04-01T00:00:00.000Z',
      lot_number: 'LOT-201',
    });

    const app = await buildApp(OWNER);

    const res = await request(app)
      .patch(`/api/p2/packing-slips/${SLIP_ID}`)
      .send({
        packingSlipNumber: 'RW26-0201',
        shipDate: '2026-04-01T00:00:00.000Z',
        lotNumber: 'LOT-201',
        reason: 'reissue after carrier reroute',
      });

    expect(res.status).toBe(200);

    const audits = auditCalls();
    expect(audits).toHaveLength(4);
    const fields = audits.map(([, params]) => (params as any[])[2]).sort();
    expect(fields).toEqual(['invoice_number', 'lot_number', 'packing_slip_number', 'ship_date']);

    // Every audit row carries the session actor and supplied reason.
    for (const [, params] of audits) {
      expect((params as any[])[5]).toBe(OWNER.username);
      expect((params as any[])[6]).toBe('reissue after carrier reroute');
    }

    // Linked lot record receives the new lot_number transactionally.
    const lotUpdates = clientQuery.mock.calls.filter(([sql]) =>
      String(sql).toUpperCase().includes('UPDATE P2_LOT_NUMBERS'),
    );
    expect(lotUpdates).toHaveLength(1);
    expect(lotUpdates[0][1]).toEqual(['LOT-201', LOT_ID]);
  });

  it('does NOT update p2_lot_numbers when the slip has no linked lot, even if lot_number changes', async () => {
    setupPoolQuery({
      slip: slipRow({ lot_number: 'LOT-OLD', lot_number_id: null }),
    });
    setupClientQuery({ id: SLIP_ID, lot_number: 'LOT-NEW' });

    const app = await buildApp(ADMIN);

    const res = await request(app)
      .patch(`/api/p2/packing-slips/${SLIP_ID}`)
      .send({ lotNumber: 'LOT-NEW', reason: 'standalone slip relabel' });

    expect(res.status).toBe(200);

    const lotUpdates = clientQuery.mock.calls.filter(([sql]) =>
      String(sql).toUpperCase().includes('UPDATE P2_LOT_NUMBERS'),
    );
    expect(lotUpdates).toHaveLength(0);

    const audits = auditCalls();
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toEqual([
      'packing_slip',
      SLIP_ID,
      'lot_number',
      'LOT-OLD',
      'LOT-NEW',
      ADMIN.username,
      'standalone slip relabel',
    ]);
  });

  it('rejects a duplicate packing slip number with 409 and writes nothing', async () => {
    setupPoolQuery({ slip: slipRow(), duplicateSlipNumber: true });
    setupClientQuery({ id: SLIP_ID });

    const app = await buildApp(ADMIN);

    const res = await request(app)
      .patch(`/api/p2/packing-slips/${SLIP_ID}`)
      .send({ packingSlipNumber: 'PS-DUP', reason: 'attempted relabel' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
    expect(pgPoolConnect).not.toHaveBeenCalled();
    expect(auditCalls()).toHaveLength(0);
  });

  it('rejects a duplicate lot number with 409 and writes nothing', async () => {
    setupPoolQuery({ slip: slipRow(), duplicateLotNumber: true });
    setupClientQuery({ id: SLIP_ID });

    const app = await buildApp(ADMIN);

    const res = await request(app)
      .patch(`/api/p2/packing-slips/${SLIP_ID}`)
      .send({ lotNumber: 'LOT-DUP', reason: 'attempted lot rename' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/lot.*already exists/i);
    expect(pgPoolConnect).not.toHaveBeenCalled();
    expect(auditCalls()).toHaveLength(0);
  });

  it('rejects a blank lot number at the schema level (400) and writes nothing', async () => {
    setupPoolQuery({ slip: slipRow() });
    setupClientQuery({ id: SLIP_ID });

    const app = await buildApp(ADMIN);

    const res = await request(app)
      .patch(`/api/p2/packing-slips/${SLIP_ID}`)
      .send({ lotNumber: '   ', reason: 'should fail' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lot number cannot be empty/i);
    expect(pgPoolConnect).not.toHaveBeenCalled();
    expect(auditCalls()).toHaveLength(0);
  });

  it('rejects a missing reason with 400 and writes nothing', async () => {
    setupPoolQuery({ slip: slipRow() });
    setupClientQuery({ id: SLIP_ID });

    const app = await buildApp(ADMIN);

    const res = await request(app)
      .patch(`/api/p2/packing-slips/${SLIP_ID}`)
      .send({ packingSlipNumber: 'PS-300', reason: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
    expect(pgPoolConnect).not.toHaveBeenCalled();
    expect(auditCalls()).toHaveLength(0);
  });

  it('returns 403 for a non-admin/owner caller and never touches the database', async () => {
    setupPoolQuery({ slip: slipRow() });
    setupClientQuery({ id: SLIP_ID });

    const app = await buildApp(STAFF);

    const res = await request(app)
      .patch(`/api/p2/packing-slips/${SLIP_ID}`)
      .send({ packingSlipNumber: 'PS-401', reason: 'no permission' });

    expect(res.status).toBe(403);
    // requireRole short-circuits before the handler runs — no SELECT, no
    // transaction, no audit row.
    const slipSelects = poolQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('FROM p2_packing_slips') && String(sql).includes('WHERE id = $1'),
    );
    expect(slipSelects).toHaveLength(0);
    expect(pgPoolConnect).not.toHaveBeenCalled();
    expect(auditCalls()).toHaveLength(0);
  });
});
