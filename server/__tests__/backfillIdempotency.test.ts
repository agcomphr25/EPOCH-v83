/**
 * Idempotency integration test for the inventory_transaction_ledger backfill
 * (Task #183). Verifies that running the backfill TWICE inserts the same
 * rows only ONCE — re-runs are no-ops because each source row is keyed by
 * (sourceModule='backfill:<table>', sourceRecordId=<row id>).
 *
 * Mocks the db module to simulate the source tables and the existing-ledger
 * lookup, and counts calls into recordInventoryLedgerEntry to assert the
 * apply/re-run contract.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── State the mock returns ─────────────────────────────────────────────

const sourceMltRows: any[] = [];
const sourceLotRows: any[] = [];
// Tracks rows already in the ledger keyed by (sourceModule, sourceRecordId).
const existingLedger = new Set<string>();
const recordCalls: any[] = [];

function makeQuery(): any {
  let table: any = null;
  const builder: any = {
    from(t: any) { table = t; return builder; },
    where() { return builder; },
    leftJoin() { return builder; },
    orderBy() { return builder; },
    limit() { return builder; },
    then(resolve: (v: any) => any) {
      const sym = Object.getOwnPropertySymbols(table || {}).find(
        (s) => s.description === 'drizzle:Name',
      );
      const name = sym ? (table as any)[sym] : '';
      switch (name) {
        case 'material_lot_transactions':
          return Promise.resolve(sourceMltRows).then(resolve);
        case 'material_lots':
          return Promise.resolve(sourceLotRows).then(resolve);
        case 'inventory_transaction_ledger': {
          // Existing-ledger lookup: return rows whose composite key is in the set.
          // We ignore the WHERE for simplicity and return everything; the script
          // builds a Set<string> of sourceRecordIds it knows about for THAT module.
          const rows = Array.from(existingLedger).map((k) => {
            const [, sourceRecordId] = k.split('||');
            return { id: sourceRecordId };
          });
          return Promise.resolve(rows).then(resolve);
        }
        default:
          return Promise.resolve([]).then(resolve);
      }
    },
  };
  return builder;
}

vi.mock('../db', () => ({
  db: { select: () => makeQuery() },
}));

vi.mock('../src/services/inventoryTransactionLedgerService', async () => {
  // Keep the real type exports; replace recordInventoryLedgerEntry with a spy.
  return {
    recordInventoryLedgerEntry: (input: any) => {
      recordCalls.push(input);
      // Mark this source row as "in the ledger" for the next run.
      existingLedger.add(`${input.sourceModule}||${input.sourceRecordId}`);
      return Promise.resolve({ id: `ledger-${recordCalls.length}` });
    },
  };
});

const { run, SOURCE_MODULE } = await import('../scripts/backfillInventoryTransactionLedger');

// ── Helpers ────────────────────────────────────────────────────────────

beforeEach(() => {
  sourceMltRows.length = 0;
  sourceLotRows.length = 0;
  existingLedger.clear();
  recordCalls.length = 0;
});

// ── Test ───────────────────────────────────────────────────────────────

describe('backfill idempotency — apply then re-run no-op', () => {
  it('inserts each MLT row exactly once across two runs', async () => {
    sourceLotRows.push({
      id: 'lot-uuid-1',
      inventoryItemId: 42,
      materialPartNumber: 'AG-100',
      unitOfMeasure: 'EA',
      receivedQty: '100',
    });
    sourceMltRows.push(
      {
        id: 'mlt-1', materialLotId: 'lot-uuid-1', internalControlNumber: 'ICN-1',
        transactionType: 'RECEIVE', qtyBefore: '0', qtyChange: '10', qtyAfter: '10',
        fromLocation: null, toLocation: 'STAGE',
        referenceType: 'RECEIPT', referenceId: 'rcp-1', receiptId: 'rcp-1',
        performedBy: 'glennj', performedAt: new Date('2025-06-01T00:00:00Z'),
        reason: null, notes: null, wasOverride: false,
        overrideApprovedBy: null, overrideReason: null,
        createdAt: new Date('2025-06-01T00:00:00Z'),
      },
      {
        id: 'mlt-2', materialLotId: 'lot-uuid-1', internalControlNumber: 'ICN-1',
        transactionType: 'ISSUE', qtyBefore: '10', qtyChange: '-3', qtyAfter: '7',
        fromLocation: 'STAGE', toLocation: null,
        referenceType: 'TRAVELER', referenceId: 'trav-uuid-9', receiptId: null,
        performedBy: 'glennj', performedAt: new Date('2025-06-02T00:00:00Z'),
        reason: 'kitting', notes: null, wasOverride: false,
        overrideApprovedBy: null, overrideReason: null,
        createdAt: new Date('2025-06-02T00:00:00Z'),
      },
    );

    // First run: both rows inserted.
    const firstStats = await run(['--source', 'mlt']);
    const firstMlt = firstStats.find((s) => s.source === 'mlt')!;
    expect(firstMlt.scanned).toBe(2);
    expect(firstMlt.inserted).toBe(2);
    expect(firstMlt.skippedExisting).toBe(0);
    expect(recordCalls).toHaveLength(2);
    expect(recordCalls[0].sourceModule).toBe(SOURCE_MODULE.mlt);

    // Second run on the SAME source rows: every row already exists →
    // zero inserts, both rows skippedExisting.
    const beforeSecondRunCallCount = recordCalls.length;
    const secondStats = await run(['--source', 'mlt']);
    const secondMlt = secondStats.find((s) => s.source === 'mlt')!;
    expect(secondMlt.scanned).toBe(2);
    expect(secondMlt.inserted).toBe(0);
    expect(secondMlt.skippedExisting).toBe(2);
    expect(recordCalls.length).toBe(beforeSecondRunCallCount); // no new calls
  });
});
