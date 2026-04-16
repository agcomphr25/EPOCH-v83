/**
 * Tests for reservation quantity accuracy on material lots.
 *
 * Covers:
 *   1. Full reservation lifecycle (create → display reserved qty → cancel → display 0)
 *   2. availableQty clamping to 0 when reserved exceeds remainingQty
 *   3. Error fallback: reservedQty = 0, availableQty = remainingQty when storage throws
 *
 * Tests run against the real route handlers in server/src/routes/materialLots.ts
 * via supertest so regressions in production code are caught.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mocks (hoisted before any imports) ───────────────────────────────────────

vi.mock('../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
  },
  pool: {},
}));

vi.mock('../storage', () => ({
  storage: {
    getMaterialLot: vi.fn(),
    getAllMaterialLots: vi.fn(),
    getMaterialLotsByStatus: vi.fn(),
    getMaterialLotsByInventoryItem: vi.fn(),
    getMaterialLotsExpiringSoon: vi.fn(),
    getMaterialLotsNearingOutTime: vi.fn(),
    getLotReservations: vi.fn(),
    getLotReservation: vi.fn(),
    getReservedQtyForLot: vi.fn(),
    createLotReservation: vi.fn(),
    cancelLotReservation: vi.fn(),
    fulfillLotReservation: vi.fn(),
  },
}));

vi.mock('../src/services/queueReadinessService', () => ({
  evaluateQueueReadiness: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { storage } from '../storage';
import materialLotsRouter from '../src/routes/materialLots';

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', materialLotsRouter);
  return app;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const LOT_ID = '00000000-dead-beef-0000-000000000001';

function makeLot(remainingQty = '100', status = 'ACCEPTED') {
  return {
    id: LOT_ID,
    icn: 'ICN-001',
    materialPartNumber: 'PART-001',
    remainingQty,
    status,
    unitOfMeasure: 'yards',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeReservation(id: number, qty: string, status = 'active') {
  return {
    id,
    materialLotId: LOT_ID,
    quantityReserved: qty,
    unitOfMeasure: 'yards',
    status,
    createdBy: 'test-user',
    notes: null,
    travelerId: null,
    workOrderId: null,
    receivedUnitId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ── Suite 1: GET /:lotId/reservations — reads reservedQty/availableQty ───────

describe('GET /:lotId/reservations — reservation lifecycle', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.getLotReservations).mockResolvedValue([]);
  });

  it('shows reservedQty = 0 and availableQty = remainingQty when no active reservations exist', async () => {
    vi.mocked(storage.getMaterialLot).mockResolvedValue(makeLot('100'));
    vi.mocked(storage.getReservedQtyForLot).mockResolvedValue(0);

    const res = await request(app).get(`/${LOT_ID}/reservations`);

    expect(res.status).toBe(200);
    expect(res.body.reservedQty).toBe(0);
    expect(res.body.availableQty).toBe(100);
    expect(res.body.remaining).toBe(100);
  });

  it('shows correct reservedQty and reduced availableQty after a reservation is created', async () => {
    vi.mocked(storage.getMaterialLot).mockResolvedValue(makeLot('100'));
    vi.mocked(storage.getReservedQtyForLot).mockResolvedValue(40);
    vi.mocked(storage.getLotReservations).mockResolvedValue([makeReservation(1, '40')]);

    const res = await request(app).get(`/${LOT_ID}/reservations`);

    expect(res.status).toBe(200);
    expect(res.body.reservedQty).toBe(40);
    expect(res.body.availableQty).toBe(60);
  });

  it('shows reservedQty = 0 and full availableQty after the reservation is cancelled', async () => {
    vi.mocked(storage.getMaterialLot).mockResolvedValue(makeLot('100'));
    vi.mocked(storage.getReservedQtyForLot).mockResolvedValue(0);
    vi.mocked(storage.getLotReservations).mockResolvedValue([makeReservation(1, '40', 'cancelled')]);

    const res = await request(app).get(`/${LOT_ID}/reservations`);

    expect(res.status).toBe(200);
    expect(res.body.reservedQty).toBe(0);
    expect(res.body.availableQty).toBe(100);
  });

  it('shows reservedQty = 0 and full availableQty after the reservation is fulfilled', async () => {
    vi.mocked(storage.getMaterialLot).mockResolvedValue(makeLot('100'));
    vi.mocked(storage.getReservedQtyForLot).mockResolvedValue(0);
    vi.mocked(storage.getLotReservations).mockResolvedValue([makeReservation(1, '40', 'fulfilled')]);

    const res = await request(app).get(`/${LOT_ID}/reservations`);

    expect(res.status).toBe(200);
    expect(res.body.reservedQty).toBe(0);
    expect(res.body.availableQty).toBe(100);
  });
});

// ── Suite 2: Full lifecycle via multiple routes ───────────────────────────────
// Simulates: POST reserve → GET check qty → DELETE cancel → GET check qty = 0

describe('Full reservation lifecycle: create → read → cancel → read', () => {
  const app = buildApp();

  it('reflects correct quantities at each lifecycle step', async () => {
    const lot = makeLot('100');

    // State machine: tracks what getReservedQtyForLot should return
    let currentReserved = 0;
    let savedReservation = makeReservation(1, '40', 'active');

    vi.mocked(storage.getMaterialLot).mockResolvedValue(lot);
    vi.mocked(storage.getLotReservations).mockResolvedValue([]);
    vi.mocked(storage.getReservedQtyForLot).mockImplementation(async () => currentReserved);

    vi.mocked(storage.createLotReservation).mockImplementation(async (data) => {
      currentReserved += parseFloat(String(data.quantityReserved));
      savedReservation = { ...makeReservation(1, String(data.quantityReserved)), status: 'active' };
      return savedReservation;
    });

    vi.mocked(storage.getLotReservation).mockImplementation(async () => savedReservation);

    vi.mocked(storage.cancelLotReservation).mockImplementation(async (id) => {
      currentReserved = Math.max(0, currentReserved - parseFloat(savedReservation.quantityReserved));
      savedReservation = { ...savedReservation, status: 'cancelled' };
      return { ...savedReservation, id };
    });

    // Step 1: Before any reservation — 0 reserved, 100 available
    let res = await request(app).get(`/${LOT_ID}/reservations`);
    expect(res.status).toBe(200);
    expect(res.body.reservedQty).toBe(0);
    expect(res.body.availableQty).toBe(100);

    // Step 2: Create a reservation for 40 units
    res = await request(app)
      .post(`/${LOT_ID}/reserve`)
      .send({ quantityReserved: 40, createdBy: 'test-user' });
    expect(res.status).toBe(201);
    expect(res.body.reservedQty).toBe(40);
    expect(res.body.availableQty).toBe(60);

    // Step 3: Read again — should reflect the active reservation
    res = await request(app).get(`/${LOT_ID}/reservations`);
    expect(res.status).toBe(200);
    expect(res.body.reservedQty).toBe(40);
    expect(res.body.availableQty).toBe(60);

    // Step 4: Cancel the reservation
    res = await request(app).delete(`/${LOT_ID}/reservations/1`);
    expect(res.status).toBe(200);

    // Step 5: After cancellation — reservedQty = 0, full availability restored
    res = await request(app).get(`/${LOT_ID}/reservations`);
    expect(res.status).toBe(200);
    expect(res.body.reservedQty).toBe(0);
    expect(res.body.availableQty).toBe(100);
  });
});

// ── Suite 3: GET / — lifecycle on the lot list view ─────────────────────────
// The primary "display accuracy" surface: the material inventory list view
// shows every lot with its live reservedQty and availableQty.

describe('GET / — lot list reflects reservation lifecycle', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows reservedQty = 0 and availableQty = remainingQty when no active reservations', async () => {
    vi.mocked(storage.getAllMaterialLots).mockResolvedValue([makeLot('100')]);
    vi.mocked(storage.getReservedQtyForLot).mockResolvedValue(0);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    const lot = res.body[0];
    expect(lot.reservedQty).toBe(0);
    expect(lot.availableQty).toBe(100);
  });

  it('shows reduced availableQty when an active reservation exists', async () => {
    vi.mocked(storage.getAllMaterialLots).mockResolvedValue([makeLot('100')]);
    vi.mocked(storage.getReservedQtyForLot).mockResolvedValue(40);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    const lot = res.body[0];
    expect(lot.reservedQty).toBe(40);
    expect(lot.availableQty).toBe(60);
  });

  it('shows reservedQty = 0 and full availableQty after reservation is cancelled', async () => {
    // After cancellation, only fulfilled/cancelled reservations exist.
    // getReservedQtyForLot filters to status='active', so it returns 0.
    vi.mocked(storage.getAllMaterialLots).mockResolvedValue([makeLot('100')]);
    vi.mocked(storage.getReservedQtyForLot).mockResolvedValue(0);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    const lot = res.body[0];
    expect(lot.reservedQty).toBe(0);
    expect(lot.availableQty).toBe(100);
  });

  it('shows reservedQty = 0 and full availableQty after reservation is fulfilled', async () => {
    vi.mocked(storage.getAllMaterialLots).mockResolvedValue([makeLot('100')]);
    vi.mocked(storage.getReservedQtyForLot).mockResolvedValue(0);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    const lot = res.body[0];
    expect(lot.reservedQty).toBe(0);
    expect(lot.availableQty).toBe(100);
  });

  it('clamps availableQty to 0 (never negative) when reservedQty exceeds remainingQty', async () => {
    vi.mocked(storage.getAllMaterialLots).mockResolvedValue([makeLot('100')]);
    vi.mocked(storage.getReservedQtyForLot).mockResolvedValue(150);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    const lot = res.body[0];
    expect(lot.reservedQty).toBe(150);
    expect(lot.availableQty).toBe(0);
  });

  it('clamps availableQty to 0 when reservedQty exactly equals remainingQty', async () => {
    vi.mocked(storage.getAllMaterialLots).mockResolvedValue([makeLot('100')]);
    vi.mocked(storage.getReservedQtyForLot).mockResolvedValue(100);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    const lot = res.body[0];
    expect(lot.availableQty).toBe(0);
  });
});

// ── Suite 4: GET / — graceful fallbacks ──────────────────────────────────────

describe('GET / — graceful fallback when reservation data is missing or unavailable', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to reservedQty = 0, availableQty = remainingQty when getReservedQtyForLot throws', async () => {
    vi.mocked(storage.getAllMaterialLots).mockResolvedValue([makeLot('100')]);
    vi.mocked(storage.getReservedQtyForLot).mockRejectedValue(new Error('DB connection lost'));

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    const lot = res.body[0];
    expect(lot.reservedQty).toBe(0);
    expect(lot.availableQty).toBe(100);
  });

  it('shows reservedQty = 0, availableQty = remainingQty when storage returns 0 (null aggregate)', async () => {
    // getReservedQtyForLot returns 0 when the DB aggregate is null (no active rows).
    // This is the nullish data path — result is 0, not an error.
    vi.mocked(storage.getAllMaterialLots).mockResolvedValue([makeLot('75')]);
    vi.mocked(storage.getReservedQtyForLot).mockResolvedValue(0);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    const lot = res.body[0];
    expect(lot.reservedQty).toBe(0);
    expect(lot.availableQty).toBe(75);
  });

  it('handles lots with remainingQty = 0 without showing negative availableQty', async () => {
    vi.mocked(storage.getAllMaterialLots).mockResolvedValue([makeLot('0')]);
    vi.mocked(storage.getReservedQtyForLot).mockResolvedValue(0);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    const lot = res.body[0];
    expect(lot.reservedQty).toBe(0);
    expect(lot.availableQty).toBe(0);
  });
});
