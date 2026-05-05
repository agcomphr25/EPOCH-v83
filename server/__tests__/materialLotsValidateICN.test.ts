import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that load these modules
// ---------------------------------------------------------------------------

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
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
// Helper: stub `db.transaction` so backfillPacketFromQueue can run end-to-end
// without throwing (it normally calls `await db.transaction(cb)`).  By default
// the stub short-circuits to 'skipped' (mimicking a missing productCategoryId).
// Tests that want to exercise the "backfill succeeds" path can override this.
// ---------------------------------------------------------------------------

function stubTransactionSucceeds() {
  vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
    const tx = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [{ id: 9999 }],
          }),
          returning: async () => [{ id: 9999 }],
        }),
      }),
    };
    return cb(tx);
  });
}

// ---------------------------------------------------------------------------
// Helper: build a chainable db.select() mock that resolves with `rows`
// regardless of how the chain is terminated (via .limit() or awaiting .where()
// directly after .leftJoin()).
// ---------------------------------------------------------------------------

function makeSelectChain(rows: unknown[]) {
  const resolvedPromise = Promise.resolve(rows);
  const limitFn = vi.fn().mockReturnValue(resolvedPromise);
  // orderBy can be either terminated by .limit() or awaited directly, so make
  // the returned object thenable while also exposing .limit().
  const orderByFn = vi.fn().mockReturnValue({
    limit: limitFn,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolvedPromise.then(onFulfilled, onRejected),
  });
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
    // Must explicitly carry 'planned_materials' so the frontend warning fires.
    expect(res.body.icnSource).toBe('planned_materials');

    expect(res.body.fabricRolls).toHaveLength(1);
    expect(res.body.fabricRolls[0].internalControlNumber).toBe('ICN-FROM-MATERIAL-DETAILS');
    expect(res.body.fabricRolls[0].lotNumber).toBe('LOT-PLANNED');
  });

  // -------------------------------------------------------------------------
  // Scenario 2b: even when the on-the-fly backfill succeeds, the response
  // must NOT be reclassified to 'built_packet' / 'backfilled_from_queue' —
  // the data the operator is about to act on is still planned-order data,
  // so the frontend warning must still fire.  See Task #43 review.
  // -------------------------------------------------------------------------

  it('keeps icnSource as planned_materials even when the backfill side-effect succeeds', async () => {
    const plannedDetails = JSON.stringify([{
      fabricInventoryId: 200,
      fabricType: 'Planned',
      lotNumber: 'LOT-PLANNED',
      internalControlNumber: 'ICN-FROM-MATERIAL-DETAILS',
      isPrimary: true,
    }]);
    const queueItem = {
      ...QUEUE_ITEM,
      id: 56,
      inventoryItemId: 1234,
      materialDetails: plannedDetails,
    };

    // Make backfillPacketFromQueue's productCategoryId lookup succeed and
    // its insert transaction succeed too.
    stubTransactionSucceeds();

    sequenceDbSelects(
      [],                            // 1. outer exact
      [queueItem],                   // 2. queue item
      [],                            // 3. inner exact (attempt 1)
      [{ productCategoryId: 'cat-1' }], // 4. backfill BOM lookup → succeeds
    );

    const res = await request(app).get('/api/material-lots/validate/MFG-56-PART');

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    // Backfill ran as a side-effect, but the response source must stay planned_materials.
    expect(res.body.icnSource).toBe('planned_materials');
    expect(res.body.icnSource).not.toBe('backfilled_from_queue');
    expect(res.body.icnSource).not.toBe('built_packet');
    expect(res.body.fabricRolls[0].internalControlNumber).toBe('ICN-FROM-MATERIAL-DETAILS');
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
  // Regression guard for Task #43: scanning a queue barcode whose packet number
  // does not exist as a built packet must NOT return another packet's fabric
  // rolls.  Historically the route fell back to "any packet for this queue ID"
  // (attempt 3 / attempt 4), which silently autofilled material ICNs from a
  // sibling packet — e.g. scanning MFG-7-712-46 would return packet #1's rolls.
  // After the fix, the route must fall through to the planned-materials branch
  // and surface only the queue item's own materialDetails (or nothing).
  // -------------------------------------------------------------------------

  it('does NOT fall back to another packet when the scanned packet number has no built record', async () => {
    // Queue 7 has built packets for packet #1 only; the scanned packet number
    // 46 does not exist.  The fabric source on packet #1 carries
    // ICN-FROM-SOURCE — that ICN must NOT appear in the response.
    const queueItem = { ...QUEUE_ITEM, id: 7, materialDetails: null };

    // db.select() call sequence for MFG-7-712-46 (queueId=7, packetNumber=46):
    // 1. outer exact → no packet
    // 2. queue item → found
    // 3. inner exact (attempt 1) → no packet
    // 4. seq match (attempt 2, packetNumber=46) → no packet (only #1 exists)
    // → falls through to materialDetails branch (no fabric data)
    sequenceDbSelects(
      [],          // 1. outer exact
      [queueItem], // 2. queue item
      [],          // 3. inner exact (attempt 1)
      [],          // 4. seq match (attempt 2) — strictly no packet #46
    );

    const res = await request(app).get('/api/material-lots/validate/MFG-7-712-46');

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    // Critical: must not be the built_packet path — that would mean a sibling
    // packet's data was returned.  Must explicitly fall through to the planned-
    // materials branch so the frontend warning fires.
    expect(res.body.icnSource).toBe('planned_materials');
    expect(res.body.fabricRolls).toEqual([]);
    // Doubly explicit: the sibling packet's ICN must not be anywhere in the response.
    expect(JSON.stringify(res.body)).not.toContain('ICN-FROM-SOURCE');
  });

  it('returns the queue planned-materials JSON (not a sibling packet) when packet number is unmatched', async () => {
    // Queue 7 has materialDetails for the planned materials, plus built packets
    // exist for packet numbers 1 and 2 (carrying ICN-FROM-SOURCE).  Scanning
    // packet #46 must return ICN-FROM-MATERIAL-DETAILS, not ICN-FROM-SOURCE.
    const plannedDetails = JSON.stringify([{
      fabricInventoryId: 200,
      fabricType: 'Planned',
      lotNumber: 'LOT-PLANNED',
      batchNumber: 'BATCH-PLANNED',
      rollNumber: 'ROLL-PLANNED',
      internalControlNumber: 'ICN-FROM-MATERIAL-DETAILS',
      isPrimary: true,
    }]);
    const queueItem = { ...QUEUE_ITEM, id: 7, materialDetails: plannedDetails };

    sequenceDbSelects(
      [],          // 1. outer exact
      [queueItem], // 2. queue item
      [],          // 3. inner exact (attempt 1)
      [],          // 4. seq match (attempt 2) — packet #46 doesn't exist
    );

    const res = await request(app).get('/api/material-lots/validate/MFG-7-712-46');

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.icnSource).toBe('planned_materials');
    expect(res.body.fabricRolls).toHaveLength(1);
    expect(res.body.fabricRolls[0].internalControlNumber).toBe('ICN-FROM-MATERIAL-DETAILS');
    expect(JSON.stringify(res.body)).not.toContain('ICN-FROM-SOURCE');
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
