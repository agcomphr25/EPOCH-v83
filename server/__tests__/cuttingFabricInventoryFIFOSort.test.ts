/**
 * Tests for the in-memory FIFO sort logic inside getCuttingFabricInventoryFIFO.
 *
 * The method sorts by expirationDate ascending (nulls last), then by
 * receivedDate ascending as a tie-breaker.  These tests pass unsorted rows
 * through the DB mock and assert that the storage method returns them in the
 * correct FIFO order.
 *
 * Covered cases:
 *   - Items with an expirationDate sort before items whose expirationDate is null
 *   - When two items share an equal expirationDate, the earlier receivedDate sorts first
 *   - All items have null expirationDate → sorted by receivedDate ascending
 *   - Single item → returned as-is
 *   - All items have identical expirationDate and receivedDate → stable (original) order preserved
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks (hoisted before any import) ──────────────────────────────────

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  pool: {},
  pgPool: {},
}));

vi.mock('../src/utils/manufacturingQueueHelper', () => ({
  autoPopulateManufacturingQueue: vi.fn().mockResolvedValue(undefined),
  syncManufacturingQueueOnUpdate: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { DatabaseStorage } from '../storage';
import { db } from '../db';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Minimal fabric inventory row with raw JS Date objects (as Drizzle returns
 * before formatDates() runs).  Only the fields relevant to sorting are varied
 * across tests; other fields carry fixed defaults.
 */
function makeRow(
  id: string,
  expirationDate: Date | null,
  receivedDate: Date | null,
): Record<string, unknown> {
  return {
    id,
    materialId: 'mat-abc',
    lotNumber: `LOT-${id}`,
    quantity: 10,
    unit: 'yards',
    receivedDate,
    manufactureDate: null,
    expirationDate,
    notes: null,
  };
}

/** d(str) — shorthand to build a Date from an ISO date string */
function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Build the FIFO builder chain used by getCuttingFabricInventoryFIFO.
 *
 * select().from(table) returns an object with both .where() and .orderBy().
 * Both paths ultimately resolve to the provided rows so the in-memory sort
 * inside the storage method is what determines final order.
 */
function fifoSelectChain(rows: Record<string, unknown>[]) {
  const orderByFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn, orderBy: orderByFn });
  return { from: fromFn };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('getCuttingFabricInventoryFIFO — FIFO sort logic', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  // ── Null handling: items with expirationDate come before nulls ────────────

  it('puts items with an expirationDate before items with null expirationDate', async () => {
    const noExpiry = makeRow('A', null, d('2024-01-01'));
    const hasExpiry = makeRow('B', d('2025-06-30'), d('2024-01-01'));

    // Pass in wrong order: null first, dated second
    vi.mocked(db.select).mockReturnValue(
      fifoSelectChain([noExpiry, hasExpiry]) as ReturnType<typeof db.select>,
    );

    const results = await storage.getCuttingFabricInventoryFIFO();

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('B'); // dated → first
    expect(results[1].id).toBe('A'); // null  → last
  });

  it('puts multiple dated items before all null-expiration items', async () => {
    const nullA = makeRow('nullA', null, d('2024-01-01'));
    const nullB = makeRow('nullB', null, d('2024-03-01'));
    const exp1 = makeRow('exp1', d('2025-01-01'), d('2024-06-01'));
    const exp2 = makeRow('exp2', d('2025-06-30'), d('2024-06-01'));

    // Deliberately interleaved order
    vi.mocked(db.select).mockReturnValue(
      fifoSelectChain([nullA, exp2, nullB, exp1]) as ReturnType<typeof db.select>,
    );

    const results = await storage.getCuttingFabricInventoryFIFO();

    expect(results).toHaveLength(4);
    // First two must have an expirationDate; last two must have null
    expect(results[0].expirationDate).not.toBeNull();
    expect(results[1].expirationDate).not.toBeNull();
    expect(results[2].expirationDate).toBeNull();
    expect(results[3].expirationDate).toBeNull();
    // exp1 expires before exp2
    expect(results[0].id).toBe('exp1');
    expect(results[1].id).toBe('exp2');
  });

  // ── Tie-breaker: equal expirationDate → sort by receivedDate ascending ────

  it('sorts by receivedDate ascending when two items share the same expirationDate', async () => {
    const later = makeRow('later', d('2025-06-30'), d('2024-05-01'));
    const earlier = makeRow('earlier', d('2025-06-30'), d('2024-01-15'));

    // later received first in mock
    vi.mocked(db.select).mockReturnValue(
      fifoSelectChain([later, earlier]) as ReturnType<typeof db.select>,
    );

    const results = await storage.getCuttingFabricInventoryFIFO();

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('earlier'); // older received date → first
    expect(results[1].id).toBe('later');
  });

  it('sorts three items with the same expirationDate by receivedDate ascending', async () => {
    const r3 = makeRow('r3', d('2025-12-31'), d('2024-09-01'));
    const r1 = makeRow('r1', d('2025-12-31'), d('2024-01-01'));
    const r2 = makeRow('r2', d('2025-12-31'), d('2024-06-01'));

    vi.mocked(db.select).mockReturnValue(
      fifoSelectChain([r3, r1, r2]) as ReturnType<typeof db.select>,
    );

    const results = await storage.getCuttingFabricInventoryFIFO();

    expect(results.map(r => r.id)).toEqual(['r1', 'r2', 'r3']);
  });

  // ── All expirationDates are null → sort by receivedDate ascending ─────────

  it('sorts by receivedDate ascending when all expirationDates are null', async () => {
    const c = makeRow('c', null, d('2024-09-01'));
    const a = makeRow('a', null, d('2024-01-01'));
    const b = makeRow('b', null, d('2024-06-01'));

    vi.mocked(db.select).mockReturnValue(
      fifoSelectChain([c, a, b]) as ReturnType<typeof db.select>,
    );

    const results = await storage.getCuttingFabricInventoryFIFO();

    expect(results.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts null receivedDate before a real receivedDate when all expirationDates are also null (null becomes 0 via || 0 fallback)', async () => {
    const withReceived = makeRow('withReceived', null, d('2024-01-01'));
    const noReceived = makeRow('noReceived', null, null);

    vi.mocked(db.select).mockReturnValue(
      fifoSelectChain([noReceived, withReceived]) as ReturnType<typeof db.select>,
    );

    const results = await storage.getCuttingFabricInventoryFIFO();

    // receivedDate=null contributes getTime() of 0 (via || 0),
    // so it sorts before a real date — verify the logic rather than assume order.
    // The sort uses (a.receivedDate?.getTime() || 0): null → 0 which is < any real timestamp.
    // Therefore noReceived (0) sorts before withReceived.
    expect(results[0].id).toBe('noReceived');
    expect(results[1].id).toBe('withReceived');
  });

  // ── Degenerate cases ──────────────────────────────────────────────────────

  it('returns a single item unchanged', async () => {
    const row = makeRow('only', d('2025-06-30'), d('2024-03-10'));

    vi.mocked(db.select).mockReturnValue(
      fifoSelectChain([row]) as ReturnType<typeof db.select>,
    );

    const results = await storage.getCuttingFabricInventoryFIFO();

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('only');
  });

  it('returns an empty array when there are no inventory rows', async () => {
    vi.mocked(db.select).mockReturnValue(
      fifoSelectChain([]) as ReturnType<typeof db.select>,
    );

    const results = await storage.getCuttingFabricInventoryFIFO();

    expect(results).toEqual([]);
  });

  it('preserves relative order when all items have identical expirationDate and receivedDate', async () => {
    const expDate = d('2025-06-30');
    const recDate = d('2024-01-01');
    const x = makeRow('x', expDate, recDate);
    const y = makeRow('y', expDate, recDate);
    const z = makeRow('z', expDate, recDate);

    vi.mocked(db.select).mockReturnValue(
      fifoSelectChain([x, y, z]) as ReturnType<typeof db.select>,
    );

    const results = await storage.getCuttingFabricInventoryFIFO();

    // All comparisons return 0 so JS sort must not move them out of order
    expect(results.map(r => r.id)).toEqual(['x', 'y', 'z']);
  });

  // ── materialId filter path ────────────────────────────────────────────────
  //
  // When a materialId is supplied the implementation branches through .where()
  // before calling .orderBy().  These tests exercise that path end-to-end and
  // confirm that the in-memory FIFO sort still produces the correct order.

  it('with materialId: exercises .where() and still sorts dated rows before null-expiry rows', async () => {
    const noExpiry = makeRow('A', null, d('2024-01-01'));
    const hasExpiry = makeRow('B', d('2025-06-30'), d('2024-01-01'));

    // Capture whereFn so we can assert it was called (regression guard)
    const orderByFn = vi.fn().mockResolvedValue([noExpiry, hasExpiry]);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn, orderBy: orderByFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as ReturnType<typeof db.select>);

    const results = await storage.getCuttingFabricInventoryFIFO('mat-xyz');

    expect(whereFn).toHaveBeenCalledTimes(1); // .where() branch was taken
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('B'); // dated → first
    expect(results[1].id).toBe('A'); // null  → last
  });

  it('with materialId: tie-breaks equal expirationDates by receivedDate ascending', async () => {
    const later = makeRow('later', d('2025-06-30'), d('2024-05-01'));
    const earlier = makeRow('earlier', d('2025-06-30'), d('2024-01-15'));

    const orderByFn = vi.fn().mockResolvedValue([later, earlier]);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn, orderBy: orderByFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as ReturnType<typeof db.select>);

    const results = await storage.getCuttingFabricInventoryFIFO('mat-xyz');

    expect(whereFn).toHaveBeenCalledTimes(1);
    expect(results[0].id).toBe('earlier'); // older received date → first
    expect(results[1].id).toBe('later');
  });

  it('with materialId: correctly orders a mixed set of dated, tie-break, and null-expiry rows', async () => {
    const earlyExp = makeRow('earlyExp', d('2025-01-01'), d('2024-06-01'));
    const lateExpA = makeRow('lateExpA', d('2025-12-31'), d('2024-02-01'));
    const lateExpB = makeRow('lateExpB', d('2025-12-31'), d('2024-08-01'));
    const nullExpA = makeRow('nullExpA', null, d('2024-01-01'));
    const nullExpB = makeRow('nullExpB', null, d('2024-11-01'));

    const orderByFn = vi.fn().mockResolvedValue([nullExpB, lateExpB, nullExpA, lateExpA, earlyExp]);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn, orderBy: orderByFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as ReturnType<typeof db.select>);

    const results = await storage.getCuttingFabricInventoryFIFO('mat-xyz');

    expect(whereFn).toHaveBeenCalledTimes(1);
    expect(results.map(r => r.id)).toEqual([
      'earlyExp',  // earliest expirationDate
      'lateExpA',  // same late expiry, earlier receivedDate
      'lateExpB',  // same late expiry, later receivedDate
      'nullExpA',  // null expiry, earlier receivedDate
      'nullExpB',  // null expiry, later receivedDate
    ]);
  });

  it('with materialId: .where() path does not bypass the in-memory FIFO sort (regression guard)', async () => {
    // This test ensures that even if a future refactor makes the .where() path
    // skip the in-memory sort, the test will catch it.
    const outOfOrder = makeRow('second', d('2025-12-31'), d('2024-06-01'));
    const shouldBeFirst = makeRow('first', d('2025-01-01'), d('2024-01-01'));

    const orderByFn = vi.fn().mockResolvedValue([outOfOrder, shouldBeFirst]);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn, orderBy: orderByFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as ReturnType<typeof db.select>);

    const results = await storage.getCuttingFabricInventoryFIFO('mat-xyz');

    expect(whereFn).toHaveBeenCalledTimes(1);
    // The in-memory sort must have re-ordered the DB results
    expect(results[0].id).toBe('first');
    expect(results[1].id).toBe('second');
  });

  // ── Combined: mix of dated, same-date, and null rows ─────────────────────

  it('correctly orders a mixed set — earlier expiry, tie-break by receivedDate, then nulls', async () => {
    const earlyExp = makeRow('earlyExp', d('2025-01-01'), d('2024-06-01'));
    const lateExpA = makeRow('lateExpA', d('2025-12-31'), d('2024-02-01'));
    const lateExpB = makeRow('lateExpB', d('2025-12-31'), d('2024-08-01'));
    const nullExpA = makeRow('nullExpA', null, d('2024-01-01'));
    const nullExpB = makeRow('nullExpB', null, d('2024-11-01'));

    // Shuffled input
    vi.mocked(db.select).mockReturnValue(
      fifoSelectChain([nullExpB, lateExpB, nullExpA, lateExpA, earlyExp]) as ReturnType<typeof db.select>,
    );

    const results = await storage.getCuttingFabricInventoryFIFO();

    expect(results.map(r => r.id)).toEqual([
      'earlyExp',  // earliest expirationDate
      'lateExpA',  // same late expiry, earlier receivedDate
      'lateExpB',  // same late expiry, later receivedDate
      'nullExpA',  // null expiry, earlier receivedDate
      'nullExpB',  // null expiry, later receivedDate
    ]);
  });
});
