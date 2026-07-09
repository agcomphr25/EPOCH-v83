/**
 * Integration tests for `upsertGroupedCuttingQueueEntry`.
 *
 * Background
 * ----------
 * Four endpoints schedule packet work to the Cutting Table manufacturing
 * queue:
 *   1. POST /api/p2/schedule-items                 (P2 Production Scheduler auto-sync)
 *   2. POST /api/cutting-table/bulk-schedule-to-cutting (Schedule All POs)
 *   3. POST /api/cutting-table/schedule-to-cutting      (per-PO Schedule button)
 *   4. POST /api/cutting-table-mfg-queue/sync-p2-demands (manual sync)
 *
 * Each one funnels through `upsertGroupedCuttingQueueEntry` so every
 * contributing PO collapses into a single PENDING manufacturing_queue row per
 * (packet inventory item, due-date day) bucket.  Regressing this would
 * resurrect the duplicate cutting-work-order bug we fixed earlier.
 *
 * The tests below run the helper against an in-memory manufacturing_queue
 * store to cover the merge invariants (Done #1) and then drive the four
 * scheduling paths' helper calls in sequence to assert that no matter which
 * path runs and in which order, exactly one PENDING row exists per
 * packet/bucket (Done #2).
 *
 * Mocking strategy
 * ----------------
 * - `drizzle-orm`: only the operator factories (`eq`, `and`, `or`, `ilike`)
 *   are wrapped to return inspectable tagged objects.  All other exports
 *   pass through via `vi.importActual` so `pgTable` / `createInsertSchema`
 *   continue to load the real schema module.
 * - `../db`: `db.select` / `db.insert` / `db.update` operate against the
 *   in-memory store.  `pool.query` is mocked but never invoked because every
 *   helper call passes an explicit `inventoryItemId` and `bomId`, so the
 *   resolve-* fallbacks (which would query the DB) are skipped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    eq: (column: unknown, value: unknown) => ({
      __mockOp: 'eq',
      column,
      value,
    }),
    and: (...conds: unknown[]) => ({
      __mockOp: 'and',
      conds: conds.filter((c) => c !== undefined && c !== null),
    }),
    or: (...conds: unknown[]) => ({
      __mockOp: 'or',
      conds: conds.filter((c) => c !== undefined && c !== null),
    }),
    ilike: (column: unknown, pattern: unknown) => ({
      __mockOp: 'ilike',
      column,
      pattern,
    }),
  };
});

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  pool: {
    query: vi.fn(),
  },
}));

import { db, pool } from '../db';
import { manufacturingQueue } from '../schema';
import {
  upsertGroupedCuttingQueueEntry,
  type UpsertGroupedCuttingQueueParams,
} from '../src/utils/cuttingQueueGroupingHelper';

// ── In-memory manufacturing_queue store ─────────────────────────────────────

interface QueueRow {
  id: number;
  inventoryItemId: number;
  department: string;
  quantityRequested: number;
  quantityCompleted: number;
  priority: number;
  status: string;
  dueDate: Date | null;
  notes: string | null;
  requestedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Store {
  rows: QueueRow[];
  nextId: number;
}

function makeStore(): Store {
  return { rows: [], nextId: 1 };
}

/** Walk a tagged condition tree and return the value of the first eq() bound to `column`. */
function findEqValue(cond: unknown, column: unknown): unknown {
  if (!cond || typeof cond !== 'object') return undefined;
  const c = cond as {
    __mockOp?: string;
    column?: unknown;
    value?: unknown;
    conds?: unknown[];
  };
  if (c.__mockOp === 'eq' && c.column === column) return c.value;
  if ((c.__mockOp === 'and' || c.__mockOp === 'or') && Array.isArray(c.conds)) {
    for (const sub of c.conds) {
      const r = findEqValue(sub, column);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

function installDbMocks(store: Store): void {
  vi.mocked(db.select).mockImplementation(
    () =>
      ({
        from: (table: unknown) => ({
          // Helper only selects from manufacturingQueue; other tables (cuttingPacketBOMs,
          // inventoryItems) are never queried because we always pass bomId/inventoryItemId.
          where: async (cond: unknown) => {
            if (table !== manufacturingQueue) return [];
            const wantedInventoryId = findEqValue(
              cond,
              manufacturingQueue.inventoryItemId
            );
            const wantedStatus = findEqValue(cond, manufacturingQueue.status);
            const wantedDept = findEqValue(cond, manufacturingQueue.department);
            return store.rows
              .filter((r) =>
                wantedInventoryId === undefined
                  ? true
                  : r.inventoryItemId === wantedInventoryId
              )
              .filter((r) =>
                wantedStatus === undefined ? true : r.status === wantedStatus
              )
              .filter((r) =>
                wantedDept === undefined ? true : r.department === wantedDept
              )
              .map((r) => ({ ...r }));
          },
          limit: async (_n: number) => [],
        }),
      }) as unknown as ReturnType<typeof db.select>
  );

  vi.mocked(db.insert).mockImplementation(((_table: unknown) => ({
    values: (val: Partial<QueueRow>) => ({
      returning: async () => {
        const row: QueueRow = {
          id: store.nextId++,
          inventoryItemId: val.inventoryItemId as number,
          department: (val.department as string) ?? 'Cutting Table',
          quantityRequested: (val.quantityRequested as number) ?? 0,
          quantityCompleted: (val.quantityCompleted as number) ?? 0,
          priority: (val.priority as number) ?? 50,
          status: (val.status as string) ?? 'PENDING',
          dueDate: (val.dueDate as Date | null) ?? null,
          notes: (val.notes as string | null) ?? null,
          requestedBy: (val.requestedBy as string) ?? 'system',
          createdAt: (val.createdAt as Date) ?? new Date(),
          updatedAt: (val.updatedAt as Date) ?? new Date(),
        };
        store.rows.push(row);
        return [{ ...row }];
      },
    }),
  })) as unknown as typeof db.insert);

  vi.mocked(db.update).mockImplementation(((_table: unknown) => ({
    set: (setVal: Partial<QueueRow>) => ({
      where: (cond: unknown) => ({
        returning: async () => {
          const id = findEqValue(cond, manufacturingQueue.id);
          if (typeof id !== 'number') return [];
          const idx = store.rows.findIndex((r) => r.id === id);
          if (idx < 0) return [];
          store.rows[idx] = { ...store.rows[idx], ...setVal };
          return [{ ...store.rows[idx] }];
        },
      }),
    }),
  })) as unknown as typeof db.update);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pendingPacketRows(store: Store, packetName: string): QueueRow[] {
  return store.rows.filter((r) => {
    if (r.status !== 'PENDING') return false;
    if (!r.notes) return false;
    try {
      const parsed = JSON.parse(r.notes) as {
        packetName?: string;
        isP2Packet?: boolean;
      };
      return (
        parsed.isP2Packet === true &&
        typeof parsed.packetName === 'string' &&
        parsed.packetName.toLowerCase() === packetName.toLowerCase()
      );
    } catch {
      return false;
    }
  });
}

function dayKey(d: Date | null): string {
  if (!d) return 'null';
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
    .toISOString()
    .slice(0, 10);
}

const CF_BASE = {
  packetName: 'Carbon Fiber Packet',
  materialType: 'p2_carbon_fiber_packet',
  source: 'P2_SYNC' as const,
  inventoryItemId: 100,
  bomId: 'bom-cf-1' as string | null,
} satisfies Pick<
  UpsertGroupedCuttingQueueParams,
  'packetName' | 'materialType' | 'source' | 'inventoryItemId' | 'bomId'
>;

// ── Suite: unit tests for upsertGroupedCuttingQueueEntry ─────────────────────

describe('upsertGroupedCuttingQueueEntry — grouping invariants', () => {
  let store: Store;

  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    installDbMocks(store);
  });

  // ── Case 1: new-row insert ──────────────────────────────────────────────

  it('inserts a new grouped PENDING row when none exists for the packet+bucket', async () => {
    const dueDate = new Date('2026-05-20T12:00:00Z');

    const result = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      items: [{ poNumber: 'PO-100', quantity: 5, p2PoItemId: 1, p2PoId: 10 }],
    });

    expect(result).not.toBeNull();
    expect(result!.created).toBe(true);
    expect(result!.addedQuantity).toBe(5);
    expect(result!.duplicateCount).toBe(0);
    expect(result!.totalContributors).toBe(1);

    expect(store.rows).toHaveLength(1);
    const row = store.rows[0];
    expect(row.inventoryItemId).toBe(100);
    expect(row.department).toBe('Cutting Table');
    expect(row.status).toBe('PENDING');
    expect(row.quantityRequested).toBe(5);
    expect(row.quantityCompleted).toBe(0);

    const notes = JSON.parse(row.notes!);
    expect(notes.isP2Packet).toBe(true);
    expect(notes.p2BackfillApplied).toBe(true);
    expect(notes.packetName).toBe('Carbon Fiber Packet');
    expect(notes.bomId).toBe('bom-cf-1');
    expect(notes.poNumbers).toHaveLength(1);
    expect(notes.poNumbers[0].poNumber).toBe('PO-100');
    expect(notes.poNumbers[0].quantity).toBe(5);
    expect(notes.poNumbers[0].p2PoItemId).toBe(1);

    // Helper resolved both bomId and inventoryItemId from caller — pool/inventory
    // lookups must be skipped.
    expect(vi.mocked(pool.query)).not.toHaveBeenCalled();
  });

  // ── Case 2: merge with new PO ───────────────────────────────────────────

  it('merges a new PO into the existing grouped row for the same due-date bucket', async () => {
    const dueDate = new Date('2026-05-20T00:00:00Z');

    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      items: [{ poNumber: 'PO-100', quantity: 5, p2PoItemId: 1, p2PoId: 10 }],
    });

    const result = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      items: [{ poNumber: 'PO-200', quantity: 3, p2PoItemId: 2, p2PoId: 20 }],
    });

    expect(result!.created).toBe(false);
    expect(result!.addedQuantity).toBe(3);
    expect(result!.duplicateCount).toBe(0);
    expect(result!.totalContributors).toBe(2);

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].quantityRequested).toBe(8);
    const notes = JSON.parse(store.rows[0].notes!);
    expect(notes.poNumbers).toHaveLength(2);
    expect(
      notes.poNumbers.map((p: { poNumber: string }) => p.poNumber).sort()
    ).toEqual(['PO-100', 'PO-200']);
  });

  it('updates the newest active grouped row for the same inventory item when packet labels or due dates drift', async () => {
    store.rows.push(
      {
        id: store.nextId++,
        inventoryItemId: CF_BASE.inventoryItemId,
        department: 'Cutting Table',
        quantityRequested: 228,
        quantityCompleted: 131,
        priority: 50,
        status: 'IN_PROGRESS',
        dueDate: new Date('2026-05-04T05:00:00Z'),
        notes: JSON.stringify({
          isP2Packet: true,
          packetName: 'Legacy Disruptor Packet Label',
          poNumbers: [{ poNumber: 'FC090', quantity: 1, p2PoItemId: null, p2PoId: null }],
        }),
        requestedBy: 'system',
        createdAt: new Date('2026-05-04T18:44:58Z'),
        updatedAt: new Date('2026-06-15T23:13:23Z'),
      },
      {
        id: store.nextId++,
        inventoryItemId: CF_BASE.inventoryItemId,
        department: 'Cutting Table',
        quantityRequested: 330,
        quantityCompleted: 93,
        priority: 50,
        status: 'IN_PROGRESS',
        dueDate: null,
        notes: JSON.stringify({
          isP2Packet: true,
          packetName: '12" Blank Fuselage Tube Packet 98" long',
          poNumbers: [{ poNumber: 'PO014332', quantity: 330, p2PoItemId: 9, p2PoId: 14 }],
        }),
        requestedBy: 'system',
        createdAt: new Date('2026-05-21T20:09:01Z'),
        updatedAt: new Date('2026-07-09T20:11:32Z'),
      }
    );

    const result = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      packetName: '12" Blank Fuselage Tube Packet 98" long',
      materialType: 'p2_packet',
      dueDate: new Date('2026-07-09T12:00:00Z'),
      items: [{ poNumber: 'PO014333', quantity: 1, p2PoItemId: 10, p2PoId: 14 }],
    });

    expect(result!.created).toBe(false);
    expect(result!.queueItem.id).toBe(2);
    expect(result!.addedQuantity).toBe(1);
    expect(store.rows).toHaveLength(2);
    expect(store.rows[1].quantityRequested).toBe(331);

    const newestNotes = JSON.parse(store.rows[1].notes!);
    expect(newestNotes.packetName).toBe('12" Blank Fuselage Tube Packet 98" long');
    expect(newestNotes.poNumbers.map((p: { poNumber: string }) => p.poNumber)).toContain('PO014333');
  });

  it('does not merge across different times of day on the same calendar bucket (uses date-only key)', async () => {
    // Two times on the same UTC day → same bucket → must merge into one row.
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate: new Date('2026-05-20T08:30:00Z'),
      items: [{ poNumber: 'PO-A', quantity: 2, p2PoItemId: 11, p2PoId: 101 }],
    });
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate: new Date('2026-05-20T17:45:00Z'),
      items: [{ poNumber: 'PO-B', quantity: 4, p2PoItemId: 12, p2PoId: 102 }],
    });

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].quantityRequested).toBe(6);
  });

  // ── Case 3: merge with duplicate PO is idempotent ───────────────────────

  it('is idempotent — re-upserting the same p2PoItemId adds nothing and keeps poNumbers unique', async () => {
    const dueDate = new Date('2026-05-20T00:00:00Z');
    const item = { poNumber: 'PO-100', quantity: 5, p2PoItemId: 1, p2PoId: 10 };

    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      items: [item],
    });

    const result = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      items: [item],
    });

    expect(result!.created).toBe(false);
    expect(result!.addedQuantity).toBe(0);
    expect(result!.duplicateCount).toBe(1);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].quantityRequested).toBe(5); // unchanged

    const notes = JSON.parse(store.rows[0].notes!);
    expect(notes.poNumbers).toHaveLength(1);
  });

  it('dedupes by poNumber when p2PoItemId is null on both sides', async () => {
    const dueDate = new Date('2026-05-20T00:00:00Z');

    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      items: [
        {
          poNumber: 'PO-MANUAL-1',
          quantity: 2,
          p2PoItemId: null,
          p2PoId: null,
        },
      ],
    });

    const result = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      items: [
        {
          poNumber: 'PO-MANUAL-1',
          quantity: 9,
          p2PoItemId: null,
          p2PoId: null,
        },
      ],
    });

    expect(result!.created).toBe(false);
    expect(result!.duplicateCount).toBe(1);
    expect(result!.addedQuantity).toBe(0);
    expect(store.rows[0].quantityRequested).toBe(2);
  });

  it('mixed batch — adds the new PO and skips the duplicate one, keeping the row at one entry per PO', async () => {
    const dueDate = new Date('2026-05-20T00:00:00Z');
    const dup = { poNumber: 'PO-100', quantity: 5, p2PoItemId: 1, p2PoId: 10 };

    await upsertGroupedCuttingQueueEntry({ ...CF_BASE, dueDate, items: [dup] });

    const result = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      items: [
        dup,
        { poNumber: 'PO-300', quantity: 7, p2PoItemId: 3, p2PoId: 30 },
      ],
    });

    expect(result!.addedQuantity).toBe(7);
    expect(result!.duplicateCount).toBe(1);
    expect(result!.totalContributors).toBe(2);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].quantityRequested).toBe(12); // 5 + 7
  });

  // ── Case 4: different due-date buckets stay separate ────────────────────

  it('keeps different due-date buckets in separate grouped rows', async () => {
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate: new Date('2026-05-20T00:00:00Z'),
      items: [{ poNumber: 'PO-100', quantity: 5, p2PoItemId: 1, p2PoId: 10 }],
    });
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate: new Date('2026-05-21T00:00:00Z'),
      items: [{ poNumber: 'PO-200', quantity: 4, p2PoItemId: 2, p2PoId: 20 }],
    });

    const cfRows = pendingPacketRows(store, 'Carbon Fiber Packet');
    expect(cfRows).toHaveLength(2);
    const buckets = cfRows.map((r) => dayKey(r.dueDate));
    expect(new Set(buckets)).toEqual(new Set(['2026-05-20', '2026-05-21']));
    expect(
      cfRows.find((r) => dayKey(r.dueDate) === '2026-05-20')!.quantityRequested
    ).toBe(5);
    expect(
      cfRows.find((r) => dayKey(r.dueDate) === '2026-05-21')!.quantityRequested
    ).toBe(4);
  });

  it('treats null due-date as its own bucket separate from any dated row', async () => {
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate: new Date('2026-05-20T00:00:00Z'),
      items: [{ poNumber: 'PO-100', quantity: 5, p2PoItemId: 1, p2PoId: 10 }],
    });
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate: null,
      items: [{ poNumber: 'PO-200', quantity: 4, p2PoItemId: 2, p2PoId: 20 }],
    });

    const cfRows = pendingPacketRows(store, 'Carbon Fiber Packet');
    expect(cfRows).toHaveLength(2);
    expect(cfRows.find((r) => r.dueDate === null)!.quantityRequested).toBe(4);
    expect(cfRows.find((r) => r.dueDate !== null)!.quantityRequested).toBe(5);
  });

  it('keeps different packet types (different inventoryItemId) in their own grouped rows', async () => {
    const dueDate = new Date('2026-05-20T00:00:00Z');
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      items: [{ poNumber: 'PO-A', quantity: 3, p2PoItemId: 1, p2PoId: 10 }],
    });
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      packetName: 'Fiberglass Packet',
      materialType: 'p2_fiberglass_packet',
      inventoryItemId: 200,
      bomId: 'bom-fg-1',
      dueDate,
      items: [{ poNumber: 'PO-B', quantity: 5, p2PoItemId: 2, p2PoId: 20 }],
    });

    expect(store.rows).toHaveLength(2);
    expect(pendingPacketRows(store, 'Carbon Fiber Packet')).toHaveLength(1);
    expect(pendingPacketRows(store, 'Fiberglass Packet')).toHaveLength(1);
  });

  // ── Case 5: P1 path unaffected ──────────────────────────────────────────

  it('P1 path unaffected — does not merge into a non-P2 (isP2Packet:false) row, even with the same packetName/inventoryItemId/dueDate', async () => {
    // Pre-seed a P1 row that shares packetName + inventoryItemId + dueDate with the
    // P2 call we're about to make. The helper must skip it (because isP2Packet:false
    // disqualifies it) and insert a fresh P2 grouped row.
    const dueDate = new Date('2026-05-20T00:00:00Z');
    const p1Notes = JSON.stringify({
      isP2Packet: false,
      packetName: 'Carbon Fiber Packet',
      source: 'MANUAL',
      poNumber: 'P1-LEGACY-1',
    });
    store.rows.push({
      id: store.nextId++,
      inventoryItemId: 100,
      department: 'Cutting Table',
      quantityRequested: 7,
      quantityCompleted: 0,
      priority: 50,
      status: 'PENDING',
      dueDate,
      notes: p1Notes,
      requestedBy: 'p1-legacy',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const p1RowSnapshot = { ...store.rows[0] };

    const result = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      items: [{ poNumber: 'PO-100', quantity: 5, p2PoItemId: 1, p2PoId: 10 }],
    });

    expect(result!.created).toBe(true);
    expect(store.rows).toHaveLength(2);

    // P1 row must be byte-for-byte unchanged.
    const p1RowAfter = store.rows.find((r) => r.requestedBy === 'p1-legacy')!;
    expect(p1RowAfter.quantityRequested).toBe(p1RowSnapshot.quantityRequested);
    expect(p1RowAfter.notes).toBe(p1RowSnapshot.notes);
    expect(p1RowAfter.updatedAt).toEqual(p1RowSnapshot.updatedAt);

    // The new P2 row has isP2Packet:true and the new quantity.
    const p2Row = store.rows.find((r) => r.requestedBy !== 'p1-legacy')!;
    expect(p2Row.quantityRequested).toBe(5);
    const p2Notes = JSON.parse(p2Row.notes!);
    expect(p2Notes.isP2Packet).toBe(true);
  });

  it('P1 path unaffected — re-running the P2 helper still ignores the P1 row and merges only P2 rows', async () => {
    const dueDate = new Date('2026-05-20T00:00:00Z');
    // Seed P1
    store.rows.push({
      id: store.nextId++,
      inventoryItemId: 100,
      department: 'Cutting Table',
      quantityRequested: 7,
      quantityCompleted: 0,
      priority: 50,
      status: 'PENDING',
      dueDate,
      notes: JSON.stringify({
        isP2Packet: false,
        packetName: 'Carbon Fiber Packet',
      }),
      requestedBy: 'p1-legacy',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // First P2 call → new row
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      items: [{ poNumber: 'PO-A', quantity: 5, p2PoItemId: 1, p2PoId: 10 }],
    });
    // Second P2 call → must merge into the P2 row, NOT the P1 row
    const result = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      items: [{ poNumber: 'PO-B', quantity: 3, p2PoItemId: 2, p2PoId: 20 }],
    });

    expect(result!.created).toBe(false);
    expect(result!.addedQuantity).toBe(3);

    // Three rows? No — exactly 2: one P1, one P2 (merged).
    expect(store.rows).toHaveLength(2);
    const p1 = store.rows.find((r) => r.requestedBy === 'p1-legacy')!;
    const p2 = store.rows.find((r) => r.requestedBy !== 'p1-legacy')!;
    expect(p1.quantityRequested).toBe(7); // P1 untouched
    expect(p2.quantityRequested).toBe(8); // P2 merged 5 + 3
  });
});

// ── Suite: end-to-end across the four scheduling paths ───────────────────────

describe('upsertGroupedCuttingQueueEntry — four-path convergence (Done #2)', () => {
  let store: Store;

  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    installDbMocks(store);
  });

  /**
   * Drives one helper invocation per scheduling endpoint, using the source
   * value and item shape that each route would build at runtime:
   *
   *   - /api/p2/schedule-items                        → source 'P2_SYNC',
   *     resolves p2PoItemId from p2_production_orders
   *   - /api/cutting-table/bulk-schedule-to-cutting   → source 'MANUAL',
   *     items shaped by the request body (Schedule All POs)
   *   - /api/cutting-table/schedule-to-cutting        → source 'P2',
   *     single item with p2PoItemId left null (per route comment, the
   *     trailing orderId segment is a production_order id, not a po_item id)
   *   - /api/cutting-table-mfg-queue/sync-p2-demands  → source 'P2_SYNC',
   *     resolves p2PoItemId from p2_production_orders
   *
   * After all four have run, exactly one PENDING row must exist for the
   * packet/bucket and its quantity must equal the sum of all contributing
   * quantities.  Re-running each path must remain idempotent.
   */
  it('all four scheduling paths converge to a single PENDING row per packet/bucket', async () => {
    const dueDate = new Date('2026-05-20T00:00:00Z');

    // Path 1: /api/p2/schedule-items (auto-sync)
    const r1 = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      source: 'P2_SYNC',
      items: [{ poNumber: 'PO-A', quantity: 3, p2PoItemId: 1, p2PoId: 100 }],
    });
    expect(r1!.created).toBe(true);

    // Path 2: /api/cutting-table/bulk-schedule-to-cutting (Schedule All POs)
    const r2 = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      source: 'MANUAL',
      items: [{ poNumber: 'PO-B', quantity: 4, p2PoItemId: 2, p2PoId: 101 }],
    });
    expect(r2!.created).toBe(false);
    expect(r2!.addedQuantity).toBe(4);

    // Path 3: /api/cutting-table/schedule-to-cutting (per-PO Schedule button)
    // Per-PO path leaves p2PoItemId null and dedupes by poNumber.
    const r3 = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      source: 'P2',
      items: [
        { poNumber: 'PO-C', quantity: 2, p2PoItemId: null, p2PoId: null },
      ],
    });
    expect(r3!.created).toBe(false);
    expect(r3!.addedQuantity).toBe(2);

    // Path 4: /api/cutting-table-mfg-queue/sync-p2-demands (manual sync)
    const r4 = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      source: 'P2_SYNC',
      items: [{ poNumber: 'PO-D', quantity: 1, p2PoItemId: 4, p2PoId: 103 }],
    });
    expect(r4!.created).toBe(false);
    expect(r4!.addedQuantity).toBe(1);

    // INVARIANT: exactly one PENDING row for this packet+bucket
    const cfRows = pendingPacketRows(store, 'Carbon Fiber Packet').filter(
      (r) => dayKey(r.dueDate) === dayKey(dueDate)
    );
    expect(cfRows).toHaveLength(1);

    const row = cfRows[0];
    expect(row.quantityRequested).toBe(3 + 4 + 2 + 1);
    const notes = JSON.parse(row.notes!);
    expect(notes.isP2Packet).toBe(true);
    expect(notes.poNumbers).toHaveLength(4);
    expect(
      notes.poNumbers.map((p: { poNumber: string }) => p.poNumber).sort()
    ).toEqual(['PO-A', 'PO-B', 'PO-C', 'PO-D']);
  });

  it('re-running every scheduling path is fully idempotent — quantities and contributor count stay constant', async () => {
    const dueDate = new Date('2026-05-20T00:00:00Z');
    const path1Items = [
      { poNumber: 'PO-A', quantity: 3, p2PoItemId: 1, p2PoId: 100 },
    ];
    const path2Items = [
      { poNumber: 'PO-B', quantity: 4, p2PoItemId: 2, p2PoId: 101 },
    ];
    const path3Items = [
      { poNumber: 'PO-C', quantity: 2, p2PoItemId: null, p2PoId: null },
    ];
    const path4Items = [
      { poNumber: 'PO-D', quantity: 1, p2PoItemId: 4, p2PoId: 103 },
    ];

    // First pass — populates the row across all four sources
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      source: 'P2_SYNC',
      items: path1Items,
    });
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      source: 'MANUAL',
      items: path2Items,
    });
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      source: 'P2',
      items: path3Items,
    });
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      source: 'P2_SYNC',
      items: path4Items,
    });

    // Second pass — same inputs in the same order
    const idem1 = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      source: 'P2_SYNC',
      items: path1Items,
    });
    const idem2 = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      source: 'MANUAL',
      items: path2Items,
    });
    const idem3 = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      source: 'P2',
      items: path3Items,
    });
    const idem4 = await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate,
      source: 'P2_SYNC',
      items: path4Items,
    });

    for (const r of [idem1, idem2, idem3, idem4]) {
      expect(r!.addedQuantity).toBe(0);
      expect(r!.duplicateCount).toBe(1);
    }

    const cfRows = pendingPacketRows(store, 'Carbon Fiber Packet').filter(
      (r) => dayKey(r.dueDate) === dayKey(dueDate)
    );
    expect(cfRows).toHaveLength(1);
    expect(cfRows[0].quantityRequested).toBe(10);
    expect(JSON.parse(cfRows[0].notes!).poNumbers).toHaveLength(4);
  });

  it('different packets and buckets stay isolated even when all four paths run for each combination', async () => {
    const day1 = new Date('2026-05-20T00:00:00Z');
    const day2 = new Date('2026-05-21T00:00:00Z');

    const FG_BASE = {
      packetName: 'Fiberglass Packet',
      materialType: 'p2_fiberglass_packet',
      source: 'P2_SYNC' as const,
      inventoryItemId: 200,
      bomId: 'bom-fg-1',
    };

    // CF on day1 — drive all four paths
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate: day1,
      source: 'P2_SYNC',
      items: [{ poNumber: 'CF-A', quantity: 1, p2PoItemId: 11, p2PoId: 110 }],
    });
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate: day1,
      source: 'MANUAL',
      items: [{ poNumber: 'CF-B', quantity: 2, p2PoItemId: 12, p2PoId: 111 }],
    });
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate: day1,
      source: 'P2',
      items: [
        { poNumber: 'CF-C', quantity: 3, p2PoItemId: null, p2PoId: null },
      ],
    });
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate: day1,
      source: 'P2_SYNC',
      items: [{ poNumber: 'CF-D', quantity: 4, p2PoItemId: 14, p2PoId: 113 }],
    });

    // CF on day2
    await upsertGroupedCuttingQueueEntry({
      ...CF_BASE,
      dueDate: day2,
      source: 'P2_SYNC',
      items: [{ poNumber: 'CF-E', quantity: 5, p2PoItemId: 15, p2PoId: 114 }],
    });

    // FG on day1 — same calendar bucket, different packet
    await upsertGroupedCuttingQueueEntry({
      ...FG_BASE,
      dueDate: day1,
      source: 'P2_SYNC',
      items: [{ poNumber: 'FG-A', quantity: 6, p2PoItemId: 21, p2PoId: 210 }],
    });
    await upsertGroupedCuttingQueueEntry({
      ...FG_BASE,
      dueDate: day1,
      source: 'MANUAL',
      items: [{ poNumber: 'FG-B', quantity: 7, p2PoItemId: 22, p2PoId: 211 }],
    });

    // INVARIANT: exactly one PENDING row per (packet, bucket)
    expect(store.rows).toHaveLength(3);

    const cfDay1 = pendingPacketRows(store, 'Carbon Fiber Packet').filter(
      (r) => dayKey(r.dueDate) === dayKey(day1)
    );
    const cfDay2 = pendingPacketRows(store, 'Carbon Fiber Packet').filter(
      (r) => dayKey(r.dueDate) === dayKey(day2)
    );
    const fgDay1 = pendingPacketRows(store, 'Fiberglass Packet').filter(
      (r) => dayKey(r.dueDate) === dayKey(day1)
    );

    expect(cfDay1).toHaveLength(1);
    expect(cfDay2).toHaveLength(1);
    expect(fgDay1).toHaveLength(1);
    expect(cfDay1[0].quantityRequested).toBe(1 + 2 + 3 + 4);
    expect(cfDay2[0].quantityRequested).toBe(5);
    expect(fgDay1[0].quantityRequested).toBe(6 + 7);
  });
});
