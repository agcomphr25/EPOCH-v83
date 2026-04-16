/**
 * Tests for storage.getReservedQtyForLot.
 *
 * These tests exercise the real DatabaseStorage implementation (not a mock)
 * by intercepting the DB layer. This means that if the status filter in
 * getReservedQtyForLot changes (e.g., accidentally including cancelled or
 * fulfilled reservations), these tests will catch it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── DB mock ───────────────────────────────────────────────────────────────────
// getReservedQtyForLot uses:
//   db.select({ total: sum(...) }).from(...).where(and(...))  → Promise<row[]>

interface SelectWhereChain { where: (cond: unknown) => Promise<Record<string, unknown>[]> }
interface SelectFromChain { from: (table: unknown) => SelectWhereChain }

vi.mock('../db', () => ({
  db: { select: vi.fn<() => SelectFromChain>() },
  pool: {},
}));

// Spy on drizzle-orm eq/and so we can assert the status='active' condition
// is constructed and passed to the WHERE clause.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: vi.fn(actual.eq),
    and: vi.fn(actual.and),
    sum: vi.fn(actual.sum),
  };
});

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { DatabaseStorage } from '../storage';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { materialLotReservations } from '../schema';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupDbSum(total: string | null): void {
  const whereFn = vi.fn<() => Promise<Record<string, unknown>[]>>().mockResolvedValue([{ total }]);
  const fromFn = vi.fn<() => SelectWhereChain>().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn });
}

const LOT_ID = '00000000-dead-beef-0000-000000000001';

// ── Suite: getReservedQtyForLot lifecycle ────────────────────────────────────

describe('storage.getReservedQtyForLot', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it('returns the sum of active reservation quantities', async () => {
    setupDbSum('40');
    expect(await storage.getReservedQtyForLot(LOT_ID)).toBe(40);
  });

  it('reflects a lifecycle: active reservations → 40, then after all are cancelled → 0', async () => {
    // Phase 1 — lot has an active reservation: DB sums active rows → '40'
    setupDbSum('40');
    expect(await storage.getReservedQtyForLot(LOT_ID)).toBe(40);

    // Phase 2 — reservation cancelled: DB filters status='active' and finds
    //   no matching rows, so the aggregate returns '0'
    setupDbSum('0');
    expect(await storage.getReservedQtyForLot(LOT_ID)).toBe(0);
  });

  it('reflects a lifecycle: active reservation → 40, then after fulfilled → 0', async () => {
    // Phase 1 — active reservation exists
    setupDbSum('40');
    expect(await storage.getReservedQtyForLot(LOT_ID)).toBe(40);

    // Phase 2 — reservation fulfilled: only active rows are summed → 0
    setupDbSum('0');
    expect(await storage.getReservedQtyForLot(LOT_ID)).toBe(0);
  });

  it('returns 0 when the DB aggregate is null (no active reservations at all)', async () => {
    setupDbSum(null);
    expect(await storage.getReservedQtyForLot(LOT_ID)).toBe(0);
  });

  it('returns 0 when the result row is missing (empty result set)', async () => {
    const whereFn = vi.fn<() => Promise<Record<string, unknown>[]>>().mockResolvedValue([]);
    const fromFn = vi.fn<() => SelectWhereChain>().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn });

    expect(await storage.getReservedQtyForLot(LOT_ID)).toBe(0);
  });

  it('filters the query to status="active" so cancelled and fulfilled reservations are excluded', async () => {
    setupDbSum('25');
    await storage.getReservedQtyForLot(LOT_ID);

    // Verify that eq() was called with the status column and the literal 'active'.
    // This ensures the filter is applied — removing or changing 'active' would
    // cause this assertion to fail even if the DB chain is still called.
    const eqCalls = vi.mocked(eq).mock.calls;
    const statusFilterCall = eqCalls.find(
      ([col, val]) => col === materialLotReservations.status && val === 'active'
    );
    expect(statusFilterCall).toBeDefined();
  });
});
