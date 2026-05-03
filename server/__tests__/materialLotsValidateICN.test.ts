import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that load these modules
// ---------------------------------------------------------------------------

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
  },
  pool: {},
}));

vi.mock('../storage', () => ({
  storage: {
    getMaterialLotByICN: vi.fn(),
  },
}));

// Stub out OpenAI and object-storage integrations pulled in transitively so
// they don't throw in the test environment.
vi.mock('../replit_integrations/object_storage/objectStorage', () => ({
  ObjectStorageService: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('../replit_integrations/openai_ai_integrations/openaiClient', () => ({
  openai: {},
}));

import { storage } from '../storage';
import { db } from '../db';

// ---------------------------------------------------------------------------
// Helper: build a chainable db.select() mock that resolves with `rows`
// regardless of how the chain is terminated (via .limit() or awaiting .where()
// directly after .leftJoin()).
// ---------------------------------------------------------------------------

function makeSelectChain(rows: unknown[]) {
  const resolvedPromise = Promise.resolve(rows);
  const limitFn = vi.fn().mockReturnValue(resolvedPromise);
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn, orderBy: orderByFn });
  const whereAfterJoinFn = vi.fn().mockReturnValue(resolvedPromise);
  const leftJoinFn = vi.fn().mockReturnValue({ where: whereAfterJoinFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn, leftJoin: leftJoinFn });
  return { from: fromFn };
}

// Sequence the db.select() mock so each successive call in a single request
// gets its own chain with its own resolved rows.
function sequenceDbSelects(...rowSets: unknown[][]) {
  let idx = 0;
  vi.mocked(db.select).mockImplementation(() => {
    const rows = rowSets[idx++] ?? [];
    return makeSelectChain(rows) as ReturnType<typeof db.select>;
  });
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const QUEUE_ITEM = {
  id: 42,
  status: 'IN_PROGRESS',
  completedAt: null,
  startedAt: '2026-04-01T08:00:00Z',
  materialDetails: null,
  fabricLot: null,
  fabricBatch: null,
  fabricRoll: null,
};

const BUILT_PACKET = {
  id: 7,
  barcode: 'MFG-42-PART-1',
  packetNumber: 1,
  buildDate: '2026-04-10',
  status: 'BUILT',
  isMixedFabric: false,
};

const FABRIC_SOURCE = {
  sourceId: 1,
  fabricInventoryId: 100,
  fabricType: 'Primary',
  lotNumber: 'LOT-SOURCE-001',
  batchNumber: 'BATCH-S1',
  rollNumber: 'ROLL-S1',
  supplierPartNumber: 'SPN-001',
  internalControlNumber: 'ICN-FROM-SOURCE',
  expirationDate: null,
  quantityUsed: '2.5',
  isPrimary: true,
  invId: 100,
  invSource: 'Vendor A',
  invFabric: 'Nylon',
  invFabricPartNumber: 'FPN-001',
  invSupplierPartNumber: 'SPN-001',
  invInternalControlNumber: 'ICN-FROM-INV',
  invLotNumber: 'LOT-INV-001',
  invBatchNumber: 'BATCH-INV',
  invRollNumber: 'ROLL-INV',
  invExpirationDate: null,
  invReceivedDate: '2026-03-15',
  invSquareMeters: '10.0',
  invLocation: 'SHELF-A1',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/material-lots/validate/:icn — MFG barcode ICN lookup', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Default: no lot found via storage
    vi.mocked(storage.getMaterialLotByICN).mockResolvedValue(undefined);

    app = express();
    app.use(express.json());
    const router = (await import('../src/routes/materialLots')).default;
    app.use('/api/material-lots', router);
  });

  afterEach(() => {
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: built packet exists — fabric sources come from
  // cutting_built_packet_fabric_sources (NOT from materialDetails JSON)
  // -------------------------------------------------------------------------

  it('returns ICNs from cutting_built_packet_fabric_sources when a built packet exists', async () => {
    // Queue item has a stale materialDetails with a *different* ICN to prove the
    // route is reading from the built-packet sources table, not from the JSON.
    const staleDetails = JSON.stringify([{
      fabricInventoryId: 999,
      fabricType: 'Stale',
      lotNumber: 'LOT-STALE',
      batchNumber: 'BATCH-STALE',
      rollNumber: 'ROLL-STALE',
      internalControlNumber: 'ICN-STALE-FROM-JSON',
      isPrimary: true,
    }]);
    const queueItem = { ...QUEUE_ITEM, materialDetails: staleDetails };

    // db.select() call sequence for MFG-42-PART-1 (seq = 1):
    // 1. outer exact barcode lookup → no packet
    // 2. manufacturingQueue lookup → queue item found
    // 3. inner exact barcode (attempt 1) → no packet
    // 4. seq match (attempt 2, packetNumber=1) → built packet found
    // 5. fabric sources join → fabric source with authoritative ICN
    sequenceDbSelects(
      [],              // 1. outer exact: no packet at this barcode
      [queueItem],     // 2. queue item
      [],              // 3. inner exact (attempt 1): miss
      [BUILT_PACKET],  // 4. seq match (attempt 2): packet found
      [FABRIC_SOURCE], // 5. fabric sources from cutting_built_packet_fabric_sources
    );

    const res = await request(app).get('/api/material-lots/validate/MFG-42-PART-1');

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.status).toBe('PACKET');

    // The ICN in the response must come from the fabric-sources table
    // (ICN-FROM-SOURCE), not the stale materialDetails JSON (ICN-STALE-FROM-JSON).
    expect(res.body.fabricRolls).toHaveLength(1);
    expect(res.body.fabricRolls[0].internalControlNumber).toBe('ICN-FROM-SOURCE');
    expect(res.body.fabricRolls[0].internalControlNumber).not.toBe('ICN-STALE-FROM-JSON');

    // Packet metadata should reference the built packet record
    expect(res.body.packet.id).toBe(BUILT_PACKET.id);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: no built packet — falls back to materialDetails JSON
  // -------------------------------------------------------------------------

  it('falls back to materialDetails JSON when no built packet exists for the queue item', async () => {
    const plannedDetails = JSON.stringify([{
      fabricInventoryId: 200,
      fabricType: 'Planned',
      lotNumber: 'LOT-PLANNED',
      batchNumber: 'BATCH-PLANNED',
      rollNumber: 'ROLL-PLANNED',
      internalControlNumber: 'ICN-FROM-MATERIAL-DETAILS',
      quantityUsed: '3.0',
      isPrimary: true,
    }]);
    const queueItem = { ...QUEUE_ITEM, id: 55, materialDetails: plannedDetails };

    // ICN has no sequence component so attempt 2 (seq match) is skipped.
    // db.select() call sequence for MFG-55-PART (no seq):
    // 1. outer exact barcode lookup → no packet
    // 2. manufacturingQueue lookup → queue item found
    // 3. inner exact (attempt 1) → no packet
    // 4. broadest prefix (attempt 3) → no packet
    sequenceDbSelects(
      [],           // 1. outer exact: no packet
      [queueItem],  // 2. queue item
      [],           // 3. inner exact (attempt 1)
      [],           // 4. broadest prefix (attempt 3): no built packet
    );

    const res = await request(app).get('/api/material-lots/validate/MFG-55-PART');

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.status).toBe('PACKET');

    expect(res.body.fabricRolls).toHaveLength(1);
    expect(res.body.fabricRolls[0].internalControlNumber).toBe('ICN-FROM-MATERIAL-DETAILS');
    expect(res.body.fabricRolls[0].lotNumber).toBe('LOT-PLANNED');
  });

  // -------------------------------------------------------------------------
  // Scenario 3: no queue item found — returns valid: false
  // -------------------------------------------------------------------------

  it('returns valid: false when the MFG barcode references a non-existent queue item', async () => {
    // db.select() call sequence for MFG-99-MISSING:
    // 1. outer exact barcode lookup → no packet
    // 2. manufacturingQueue lookup → no queue item
    sequenceDbSelects(
      [], // 1. outer exact: no packet
      [], // 2. queue item: not found
    );

    const res = await request(app).get('/api/material-lots/validate/MFG-99-MISSING');

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.status).toBe('NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // Scenario 3b: queue item exists but has no built packet and no fabric data
  // at all — the route still returns valid: true with an empty fabricRolls array
  // (no crash, no false NOT_FOUND).
  // -------------------------------------------------------------------------

  it('returns valid: true with empty fabricRolls when queue item has no built packet and no fabric data', async () => {
    const emptyQueueItem = {
      id: 77,
      status: 'PENDING',
      completedAt: null,
      startedAt: null,
      materialDetails: null,
      fabricLot: null,
      fabricBatch: null,
      fabricRoll: null,
    };

    // MFG-77-PART has no seq, so attempt 2 is skipped.
    // db.select() call sequence:
    // 1. outer exact → no packet
    // 2. queue item → found (no fabric data at all)
    // 3. inner exact (attempt 1) → no packet
    // 4. broadest prefix (attempt 3) → no packet
    sequenceDbSelects(
      [],              // outer exact
      [emptyQueueItem], // queue item found
      [],              // inner exact (attempt 1)
      [],              // broadest prefix (attempt 3)
    );

    const res = await request(app).get('/api/material-lots/validate/MFG-77-PART');

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.status).toBe('PACKET');
    // No fabric data available — rolls should be empty, not an error
    expect(res.body.fabricRolls).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Regression guard: the ICN preference order must be source > inventory
  // When internalControlNumber is set on the source row, it wins over the
  // inventory table's internalControlNumber.
  // -------------------------------------------------------------------------

  it('prefers the fabric-source row ICN over the joined inventory-table ICN', async () => {
    const queueItem = { ...QUEUE_ITEM, materialDetails: null };

    // FABRIC_SOURCE has internalControlNumber = 'ICN-FROM-SOURCE' while
    // invInternalControlNumber = 'ICN-FROM-INV'.  The route should prefer the
    // source-row value.
    sequenceDbSelects(
      [],              // outer exact
      [queueItem],     // queue item
      [BUILT_PACKET],  // inner exact (attempt 1) — reuse barcode 'MFG-42-PART-1'
      [FABRIC_SOURCE], // fabric sources
    );

    const res = await request(app).get('/api/material-lots/validate/MFG-42-PART-1');

    expect(res.status).toBe(200);
    expect(res.body.fabricRolls[0].internalControlNumber).toBe('ICN-FROM-SOURCE');
  });
});
