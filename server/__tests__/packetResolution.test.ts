import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('../replit_integrations/object_storage/objectStorage', () => ({
  ObjectStorageService: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('../replit_integrations/openai_ai_integrations/openaiClient', () => ({
  openai: {},
}));

import { db } from '../db';
import { resolvePacketBarcode } from '../src/lib/packetResolution';

// ---------------------------------------------------------------------------
// Helper: build a chainable db.select() mock that resolves with `rows`
// regardless of how the chain is terminated (via .limit() or awaited
// directly).
// ---------------------------------------------------------------------------

function makeSelectChain(rows: unknown[]) {
  const resolvedPromise = Promise.resolve(rows);
  const limitFn = vi.fn().mockReturnValue(resolvedPromise);
  const orderByFn = vi.fn().mockReturnValue({
    limit: limitFn,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolvedPromise.then(onFulfilled, onRejected),
  });
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn, orderBy: orderByFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

function sequenceDbSelects(...rowSets: unknown[][]) {
  let idx = 0;
  vi.mocked(db.select).mockImplementation(() => {
    const rows = rowSets[idx++] ?? [];
    return makeSelectChain(rows) as ReturnType<typeof db.select>;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolvePacketBarcode — Task #43 sibling-packet leak guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the manufacturing_queue source (not a sibling built packet) when the scanned packet number has no built record', async () => {
    // Queue 7 has a built packet for packet #1 only — packet #46 does NOT exist.
    // The historical "latest packet for queue" / packet-number-index fallbacks
    // would have returned packet #1's record here, leaking its fabric rolls
    // into the P2 Traveler.  After Task #43 the helper must fall through to
    // the manufacturing_queue source and never return packet #1.
    const queueItem = {
      id: 7,
      inventoryItemId: null,
      materialDetails: null,
      fabricLot: null,
      fabricBatch: null,
      fabricRoll: null,
      completedAt: null,
      startedAt: null,
      parentProductionOrderId: null,
      sourceId: null,
    };

    // Call sequence for MFG-7-712-46 (queueId=7, parsedPacketNumber=46):
    // 1. directPacket exact lookup → no packet
    // 2. queueItem lookup → found
    // 3. inner exact lookup → no packet
    // 4. seq match (PKT-%-7-46-%, packetNumber=46) → STRICT no match
    sequenceDbSelects(
      [],          // 1. directPacket
      [queueItem], // 2. queue item
      [],          // 3. inner exact
      [],          // 4. seq match — strictly no packet #46
    );

    const result = await resolvePacketBarcode('MFG-7-712-46');

    expect(result).not.toBeNull();
    // Critical: must not have resolved to a built_packet (which would mean a
    // sibling packet's record was returned).
    expect(result!.source).toBe('manufacturing_queue');
    expect(result!.packetRecord).toBeNull();
    expect(result!.queueItem?.id).toBe(7);
    expect(result!.packetNumber).toBe(46);
  });

  it('returns built_packet when the strict (queueId, packetNumber) match succeeds', async () => {
    const queueItem = {
      id: 7,
      inventoryItemId: null,
      materialDetails: null,
      fabricLot: null,
      fabricBatch: null,
      fabricRoll: null,
      completedAt: null,
      startedAt: null,
      parentProductionOrderId: null,
      sourceId: null,
    };
    const realPacket = {
      id: 99,
      barcode: 'PKT-712-7-46-1700000000000',
      packetNumber: 46,
      buildDate: new Date('2026-04-01'),
      status: 'BUILT',
      isMixedFabric: false,
      allocatedToOrder: null,
    };

    // Call sequence for MFG-7-712-46:
    // 1. directPacket → no packet (display barcode does not match stored PKT- barcode)
    // 2. queueItem → found
    // 3. inner exact → no packet
    // 4. seq match (PKT-%-7-46-%, packetNumber=46) → real packet found
    sequenceDbSelects(
      [],            // 1. direct
      [queueItem],   // 2. queue item
      [],            // 3. inner exact
      [realPacket],  // 4. strict seq match
    );

    const result = await resolvePacketBarcode('MFG-7-712-46');

    expect(result).not.toBeNull();
    expect(result!.source).toBe('built_packet');
    expect(result!.packetRecord?.id).toBe(99);
    expect(result!.packetRecord?.packetNumber).toBe(46);
  });

  it('keeps source as manufacturing_queue even when the backfill side-effect succeeds', async () => {
    // When the helper falls through to the queue branch and the on-the-fly backfill
    // actually creates a built_packet row, it must NOT reclassify the response as
    // `built_packet`.  The data the caller is about to act on is still planned-order
    // data, so downstream callers (traveler completion pre-flight) need to keep
    // treating this as queue-derived.  See Task #43 review.
    const queueItem = {
      id: 7,
      inventoryItemId: 1234,
      materialDetails: JSON.stringify([{
        fabricInventoryId: 200,
        fabricType: 'Planned',
        lotNumber: 'LOT-PLANNED',
        internalControlNumber: 'ICN-PLANNED',
        isPrimary: true,
      }]),
      fabricLot: null,
      fabricBatch: null,
      fabricRoll: null,
      completedAt: null,
      startedAt: null,
      parentProductionOrderId: null,
      sourceId: null,
    };

    // Backfill transaction should report 'created' so the helper would, under the
    // old behavior, re-query and return source: 'built_packet'.  The fix must
    // ignore that side-effect and keep source: 'manufacturing_queue'.
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

    sequenceDbSelects(
      [],                              // 1. directPacket
      [queueItem],                     // 2. queue item
      [],                              // 3. inner exact
      [],                              // 4. seq match — strictly no packet #46
      [{ productCategoryId: 'cat-1' }], // 5. backfill BOM lookup → succeeds
    );

    const result = await resolvePacketBarcode('MFG-7-712-46');

    expect(result).not.toBeNull();
    // Source must stay manufacturing_queue even though backfill succeeded.
    expect(result!.source).toBe('manufacturing_queue');
    expect(result!.packetRecord).toBeNull();
    expect(result!.queueItem?.id).toBe(7);
    expect(result!.backfillResult).toBe('created');
  });

  it('returns built_packet when the scanned barcode matches a stored packet exactly', async () => {
    const directPacket = {
      id: 12,
      barcode: 'PKT-712-7-1-1700000000000',
      packetNumber: 1,
      buildDate: new Date('2026-04-01'),
      status: 'BUILT',
      isMixedFabric: false,
      allocatedToOrder: null,
    };

    // Call sequence: 1. directPacket → found, returns immediately
    sequenceDbSelects([directPacket]);

    const result = await resolvePacketBarcode('PKT-712-7-1-1700000000000');

    expect(result).not.toBeNull();
    expect(result!.source).toBe('built_packet');
    expect(result!.packetRecord?.id).toBe(12);
  });
});
