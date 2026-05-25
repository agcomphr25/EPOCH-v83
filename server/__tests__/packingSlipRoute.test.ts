/**
 * Route-level integration tests for packing slip description priority.
 *
 * The existing tests in packingSlipDescription.test.ts cover
 * `resolvePackingSlipDescription` in isolation.  A regression introduced
 * directly at the `/process-shipment` call site — e.g. accidentally passing
 * stockModelId in place of stockModelName when building the poItem object
 * handed to groupItemsByDescription — would be invisible to those tests.
 *
 * These tests mount the actual poShippingQC Express router, send real HTTP
 * requests to POST /api/po-orders/process-shipment, and inspect the
 * PackingSlipData argument that the route passes to generatePoPackingSlipPdf.
 * Each item's description must be the readable stockModelName, never the raw
 * stockModelId.
 *
 * The multi-PO batch scenario (two items spanning two distinct PO numbers)
 * is required because the regression path lives inside the per-PO loop that
 * builds slipItems via groupItemsByDescription (poShippingQC.ts ~2034).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  CustomerAddress,
} from '../schema';
import type { PackingSlipData } from '../utils/pdf/types';

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest before any imports)
// ---------------------------------------------------------------------------

vi.mock('../db', () => ({
  db: {
    query: {
      p2SerializedItems: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  },
  pool: {
    query: vi.fn().mockResolvedValue([]),
    end: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../storage', () => ({
  storage: {
    getPurchaseOrderItem: vi.fn<(id: number) => Promise<PurchaseOrderItem | undefined>>(),
    getPurchaseOrder: vi.fn<(id: number) => Promise<PurchaseOrder | undefined>>(),
    getCustomer: vi.fn().mockResolvedValue(null),
    getCustomerAddresses: vi.fn<(customerId: string) => Promise<CustomerAddress[]>>(),
    getCustomerDefaultAddress: vi.fn<(customerId: string) => Promise<CustomerAddress | undefined>>(),
    getNextInvoiceNumber: vi.fn<(customerId: string, customerName: string) => Promise<string>>(),
    updatePurchaseOrderItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireRole: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../utils/pdf/packingSlipPdf', () => ({
  generatePoPackingSlipPdf: vi.fn<(data: PackingSlipData) => Promise<Buffer>>(),
}));

vi.mock('../src/utils/upsShipping', () => ({
  createShipment: vi.fn(),
}));

vi.mock('../src/services/orderAuditWrapper', () => ({
  auditUpdateOrders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/services/auditService', () => ({
  auditService: {
    closeDepartmentTransition: vi.fn().mockResolvedValue(undefined),
    recordDepartmentEntry: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

// Minimal schema stub for the dynamic import inside the route:
//   const { p2SerializedItems } = await import('../../schema')
// The columns are passed to drizzle eq/and helpers whose results are only
// consumed by the (mocked) db.query.p2SerializedItems.findMany call.
vi.mock('../schema', () => ({
  p2SerializedItems: {
    poId: {},
    poItemId: {},
    status: {},
  },
}));

// ---------------------------------------------------------------------------
// Import mocked modules after vi.mock declarations
// ---------------------------------------------------------------------------

import { storage } from '../storage';
import { pool } from '../db';
import { generatePoPackingSlipPdf } from '../utils/pdf/packingSlipPdf';

// ---------------------------------------------------------------------------
// Typed fixture factories
// ---------------------------------------------------------------------------

function makePOItem(overrides: Partial<PurchaseOrderItem> & { poId: number }): PurchaseOrderItem {
  return {
    id: 92,
    poId: overrides.poId,
    stockModelId: null,
    stockModelName: null,
    quantity: 1,
    unitPrice: '0',
    totalPrice: '0',
    handedness: null,
    features: null,
    customOptions: null,
    dueDate: null,
    productionNotes: null,
    itemType: null,
    itemId: null,
    itemName: null,
    specifications: null,
    notes: null,
    orderCount: 0,
    overrideP1Priority: null,
    itemPipelineConfig: null,
    stockStatus: 'IN_STOCK',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makePO(overrides: Partial<PurchaseOrder> & { id: number; poNumber: string }): PurchaseOrder {
  return {
    id: overrides.id,
    poNumber: overrides.poNumber,
    customerId: '0',
    customerName: 'ACME Corp',
    itemType: 'single',
    poDate: '2026-01-01',
    expectedDelivery: '2026-06-01',
    status: 'OPEN',
    notes: null,
    attachments: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeAddress(overrides: Partial<CustomerAddress> = {}): CustomerAddress {
  return {
    id: 1,
    customerId: 0,
    street: '123 Test Street',
    street2: null,
    city: 'Test City',
    state: 'AL',
    zipCode: '35801',
    country: 'US',
    type: null,
    isDefault: true,
    isValidated: null,
    validationStatus: null,
    validatedAt: null,
    validationProvider: null,
    dpvMatchCode: null,
    overrideReason: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/po-orders/process-shipment — packing slip description priority', () => {
  let app: express.Express;
  const capturedSlipDataByPo = new Map<string, PackingSlipData>();

  // Snapshot and restore UPS-related env vars so the suite always runs in
  // test mode (no real UPS call) regardless of what CI credentials are set.
  let savedUpsEnv: string | undefined;
  let savedUpsClientId: string | undefined;
  let savedUpsClientSecret: string | undefined;
  let savedUpsAccountNumber: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedSlipDataByPo.clear();

    savedUpsEnv = process.env.UPS_ENV;
    savedUpsClientId = process.env.UPS_CLIENT_ID;
    savedUpsClientSecret = process.env.UPS_CLIENT_SECRET;
    savedUpsAccountNumber = process.env.UPS_ACCOUNT_NUMBER;

    // Force test mode: useRealUps = false → TEST- tracking number, no UPS call
    process.env.UPS_ENV = 'test';
    delete process.env.UPS_CLIENT_ID;
    delete process.env.UPS_CLIENT_SECRET;
    delete process.env.UPS_ACCOUNT_NUMBER;

    // Capture each per-PO slipData so tests can assert on description fields
    vi.mocked(generatePoPackingSlipPdf).mockImplementation(
      async (data: PackingSlipData): Promise<Buffer> => {
        capturedSlipDataByPo.set(data.poNumber, data);
        return Buffer.from('FAKE-PDF');
      }
    );

    // Default stubs — individual tests override as needed
    vi.mocked(storage.getCustomerAddresses).mockResolvedValue([makeAddress()]);
    vi.mocked(storage.getCustomerDefaultAddress).mockResolvedValue(undefined);
    vi.mocked(storage.getNextInvoiceNumber).mockResolvedValue('INV-001');
    vi.mocked(storage.updatePurchaseOrderItem).mockResolvedValue(undefined);

    app = express();
    app.use(express.json());
    const poShippingRouter = (await import('../src/routes/poShippingQC')).default;
    app.use('/api/po-orders', poShippingRouter);
  });

  afterEach(() => {
    vi.resetModules();

    // Restore original UPS env state
    if (savedUpsEnv === undefined) {
      delete process.env.UPS_ENV;
    } else {
      process.env.UPS_ENV = savedUpsEnv;
    }
    if (savedUpsClientId !== undefined) process.env.UPS_CLIENT_ID = savedUpsClientId;
    if (savedUpsClientSecret !== undefined) process.env.UPS_CLIENT_SECRET = savedUpsClientSecret;
    if (savedUpsAccountNumber !== undefined) process.env.UPS_ACCOUNT_NUMBER = savedUpsAccountNumber;
  });

  it('uses stockModelName over stockModelId for a single-PO shipment', async () => {
    vi.mocked(storage.getPurchaseOrderItem).mockResolvedValue(
      makePOItem({
        id: 92,
        poId: 1,
        stockModelName: 'Mesa Universal Suppressor',
        stockModelId: 'mesa_universal',
      })
    );
    vi.mocked(storage.getPurchaseOrder).mockResolvedValue(
      makePO({ id: 1, poNumber: 'PO-0001' })
    );

    const res = await request(app)
      .post('/api/po-orders/process-shipment')
      .send({ items: [{ poItemId: 92, orderId: 'PO-92-1', quantity: 1 }] });

    expect(res.status).toBe(200);
    expect(generatePoPackingSlipPdf).toHaveBeenCalledOnce();

    const slipData = capturedSlipDataByPo.get('PO-0001');
    expect(slipData).toBeDefined();
    expect(slipData!.items[0].description).toBe('Mesa Universal Suppressor');
    expect(slipData!.items[0].description).not.toBe('mesa_universal');
  });

  it('never surfaces a raw stockModelId identifier in the packing slip description', async () => {
    vi.mocked(storage.getPurchaseOrderItem).mockResolvedValue(
      makePOItem({
        id: 92,
        poId: 1,
        stockModelName: 'Readable Product Name',
        stockModelId: 'raw_db_identifier',
      })
    );
    vi.mocked(storage.getPurchaseOrder).mockResolvedValue(
      makePO({ id: 1, poNumber: 'PO-0001' })
    );

    await request(app)
      .post('/api/po-orders/process-shipment')
      .send({ items: [{ poItemId: 92, orderId: 'PO-92-1', quantity: 1 }] });

    const desc = capturedSlipDataByPo.get('PO-0001')?.items[0]?.description;
    expect(desc).toBe('Readable Product Name');
    expect(desc).not.toBe('raw_db_identifier');
  });

  it('generates a separate packing slip for each PO in a multi-PO batch, using stockModelName for each', async () => {
    // Two non-stock items from two distinct purchase orders, same customer
    vi.mocked(storage.getPurchaseOrderItem)
      .mockResolvedValueOnce(
        makePOItem({
          id: 92,
          poId: 1,
          stockModelName: 'Mesa Universal Suppressor',
          stockModelId: 'mesa_universal',
        })
      )
      .mockResolvedValueOnce(
        makePOItem({
          id: 93,
          poId: 2,
          stockModelName: 'Specwar Suppressor',
          stockModelId: 'specwar_raw',
        })
      );

    vi.mocked(storage.getPurchaseOrder)
      .mockResolvedValueOnce(makePO({ id: 1, poNumber: 'PO-0001' }))
      .mockResolvedValueOnce(makePO({ id: 2, poNumber: 'PO-0002' }));

    const res = await request(app)
      .post('/api/po-orders/process-shipment')
      .send({
        items: [
          { poItemId: 92, orderId: 'PO-92-1', quantity: 1 },
          { poItemId: 93, orderId: 'PO-93-1', quantity: 1 },
        ],
      });

    expect(res.status).toBe(200);

    // One packing slip generated per distinct PO number
    expect(generatePoPackingSlipPdf).toHaveBeenCalledTimes(2);

    const po1Data = capturedSlipDataByPo.get('PO-0001');
    const po2Data = capturedSlipDataByPo.get('PO-0002');

    expect(po1Data).toBeDefined();
    expect(po2Data).toBeDefined();

    // Both PO groups must use stockModelName, not the raw stockModelId
    expect(po1Data!.items[0].description).toBe('Mesa Universal Suppressor');
    expect(po1Data!.items[0].description).not.toBe('mesa_universal');

    expect(po2Data!.items[0].description).toBe('Specwar Suppressor');
    expect(po2Data!.items[0].description).not.toBe('specwar_raw');

    // Response includes a packingSlips entry for each PO
    expect(res.body.packingSlips).toHaveLength(2);
    const poNumbers = res.body.packingSlips.map((p: { poNumber: string }) => p.poNumber);
    expect(poNumbers).toContain('PO-0001');
    expect(poNumbers).toContain('PO-0002');
  });

  it('falls back to itemName when stockModelName is absent, rather than using the raw stockModelId', async () => {
    vi.mocked(storage.getPurchaseOrderItem).mockResolvedValue(
      makePOItem({
        id: 92,
        poId: 1,
        stockModelName: null,
        itemName: 'Operator Entered Name',
        stockModelId: 'raw_id',
      })
    );
    vi.mocked(storage.getPurchaseOrder).mockResolvedValue(
      makePO({ id: 1, poNumber: 'PO-0001' })
    );

    await request(app)
      .post('/api/po-orders/process-shipment')
      .send({ items: [{ poItemId: 92, orderId: 'PO-92-1', quantity: 1 }] });

    const desc = capturedSlipDataByPo.get('PO-0001')?.items[0]?.description;
    expect(desc).toBe('Operator Entered Name');
    expect(desc).not.toBe('raw_id');
  });

  it('returns 400 when no items or orderIds are provided', async () => {
    const res = await request(app)
      .post('/api/po-orders/process-shipment')
      .send({});

    expect(res.status).toBe(400);
    expect(generatePoPackingSlipPdf).not.toHaveBeenCalled();
  });

  it('returns success:true and a trackingNumber in test mode (no real UPS credentials)', async () => {
    vi.mocked(storage.getPurchaseOrderItem).mockResolvedValue(
      makePOItem({ id: 92, poId: 1, stockModelName: 'Mesa Universal', stockModelId: 'mesa_universal' })
    );
    vi.mocked(storage.getPurchaseOrder).mockResolvedValue(
      makePO({ id: 1, poNumber: 'PO-0001' })
    );

    const res = await request(app)
      .post('/api/po-orders/process-shipment')
      .send({ items: [{ poItemId: 92, orderId: 'PO-92-1', quantity: 1 }] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.trackingNumber).toBe('string');
    expect(res.body.trackingNumber).toMatch(/^TEST-/);
  });
});

describe('GET /api/po-orders/oem-shipments', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    const poShippingRouter = (await import('../src/routes/poShippingQC')).default;
    app.use('/api/po-orders', poShippingRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('uses only filter params for the total-count query when no filters are set', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ table_exists: true }] } as any)
      .mockResolvedValueOnce({
        rows: [{
          id: '11111111-1111-1111-1111-111111111111',
          customer_id: 'CUST-1',
          customer_name: 'OEM Customer',
          master_tracking_number: '1Z999',
          created_at: '2026-05-20T12:00:00.000Z',
          item_count: 1,
          stock_count: 1,
          accessory_count: 0,
          po_count: 1,
          has_shipping_label: true,
          items: [],
        }],
      } as any)
      .mockResolvedValueOnce({ rows: [{ total: '1' }] } as any);

    const res = await request(app).get('/api/po-orders/oem-shipments');

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(vi.mocked(pool.query).mock.calls[1][1]).toEqual([50, 0, false]);
    expect(vi.mocked(pool.query).mock.calls[2][1]).toEqual([]);
  });

  it('does not hard-reference fulfillment attempts when the artifact table is absent', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [{ table_exists: true, fulfillment_attempts_table_exists: false }],
      } as any)
      .mockResolvedValueOnce({
        rows: [{
          id: '11111111-1111-1111-1111-111111111111',
          customer_id: 'CUST-1',
          customer_name: 'OEM Customer',
          master_tracking_number: '1Z999',
          created_at: '2026-05-20T12:00:00.000Z',
          item_count: 1,
          stock_count: 1,
          accessory_count: 0,
          po_count: 1,
          has_shipping_label: true,
          items: [],
        }],
      } as any)
      .mockResolvedValueOnce({ rows: [{ total: '1' }] } as any);

    const res = await request(app).get('/api/po-orders/oem-shipments');

    expect(res.status).toBe(200);
    expect(res.body.shipments).toHaveLength(1);
    expect(vi.mocked(pool.query).mock.calls[1][0]).not.toContain('p1_fulfillment_attempts');
  });
});
