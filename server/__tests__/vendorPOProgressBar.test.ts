/**
 * Tests that DatabaseStorage.getVendorPO() always returns totalLines and
 * receivedLines on the PO object, regardless of whether the progress query
 * succeeds or encounters an error.
 *
 * The progress bar on InventoryReceivingPage derives its accuracy from these
 * two fields.  Having them guaranteed in the response prevents a silent
 * regression if someone refactors the storage method.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Typed interfaces for the Drizzle ORM fluent-chain mocks ─────────────────

interface LimitChain {
  limit: (n: number) => Promise<Record<string, unknown>[]>;
}
interface WhereChain {
  where: (cond: unknown) => LimitChain | Promise<Record<string, unknown>[]>;
}
interface LeftJoinChain {
  leftJoin: (table: unknown, cond: unknown) => WhereChain;
}
interface FromChain {
  from: (table: unknown) => LeftJoinChain | WhereChain;
}

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
  pool: {},
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { DatabaseStorage } from '../storage';
import { db } from '../db';

// ── Fixture data ─────────────────────────────────────────────────────────────

const PO_ID = 99;

const baseVendorPORow: Record<string, unknown> = {
  id: PO_ID,
  poNumber: 'VPO-26001',
  vendorId: 5,
  vendorName: 'Acme Supplies',
  status: 'Sent',
  orderDate: null,
  expectedDeliveryDate: null,
  actualDeliveryDate: null,
  shipVia: null,
  barcode: null,
  subtotal: '1000.00',
  tax: '80.00',
  shippingCost: '20.00',
  totalCost: '1100.00',
  notes: null,
  createdBy: null,
  revisionNumber: 0,
  parentPoId: null,
  changeReason: null,
  isCurrentRevision: true,
  revisedAt: null,
  revisedBy: null,
  issuedWithoutEmail: false,
  issuedWithoutEmailReason: null,
  issuedWithoutEmailAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  externalPoNumber: null,
};

/**
 * Build a db.select() chain whose calls resolve in order.  The first call is
 * the main PO fetch (select → from → leftJoin → where → limit), and the second
 * is the progress aggregate (select → from → where).
 *
 * We model this by making db.select() return distinct chain objects on each
 * successive call via mockReturnValueOnce.
 */
function setupSelectsForHappyPath(
  totalLines: number,
  receivedLines: number,
): void {
  // ── First call: main PO row ─────────────────────────────────────────────
  const limitFn = vi.fn<(n: number) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue([baseVendorPORow]);
  const whereFn1 = vi.fn().mockReturnValue({ limit: limitFn });
  const leftJoinFn = vi.fn().mockReturnValue({ where: whereFn1 });
  const fromFn1 = vi.fn().mockReturnValue({ leftJoin: leftJoinFn });
  const firstSelect: FromChain = { from: fromFn1 };

  // ── Second call: progress aggregate ────────────────────────────────────
  const whereFn2 = vi.fn<(cond: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue([{ totalLines, receivedLines }]);
  const fromFn2 = vi.fn().mockReturnValue({ where: whereFn2 });
  const secondSelect: FromChain = { from: fromFn2 };

  vi.mocked(db.select)
    .mockReturnValueOnce(firstSelect as ReturnType<typeof db.select>)
    .mockReturnValueOnce(secondSelect as ReturnType<typeof db.select>);
}

/**
 * Same as above but the second db.select() chain rejects, simulating a DB
 * error during the progress query (the try/catch fallback path).
 */
function setupSelectsWithProgressError(): void {
  // ── First call: main PO row ─────────────────────────────────────────────
  const limitFn = vi.fn<(n: number) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue([baseVendorPORow]);
  const whereFn1 = vi.fn().mockReturnValue({ limit: limitFn });
  const leftJoinFn = vi.fn().mockReturnValue({ where: whereFn1 });
  const fromFn1 = vi.fn().mockReturnValue({ leftJoin: leftJoinFn });
  const firstSelect: FromChain = { from: fromFn1 };

  // ── Second call: progress aggregate throws ──────────────────────────────
  const whereFn2 = vi.fn().mockRejectedValue(new Error('DB connection lost'));
  const fromFn2 = vi.fn().mockReturnValue({ where: whereFn2 });
  const secondSelect: FromChain = { from: fromFn2 };

  vi.mocked(db.select)
    .mockReturnValueOnce(firstSelect as ReturnType<typeof db.select>)
    .mockReturnValueOnce(secondSelect as ReturnType<typeof db.select>);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('DatabaseStorage.getVendorPO — totalLines and receivedLines', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it('returns totalLines and receivedLines as numbers in the happy path', async () => {
    setupSelectsForHappyPath(4, 2);

    const po = await storage.getVendorPO(PO_ID);

    expect(po).toBeDefined();
    expect(typeof po!.totalLines).toBe('number');
    expect(typeof po!.receivedLines).toBe('number');
    expect(po!.totalLines).toBe(4);
    expect(po!.receivedLines).toBe(2);
  });

  it('returns totalLines=0 and receivedLines=0 when there are no line items', async () => {
    setupSelectsForHappyPath(0, 0);

    const po = await storage.getVendorPO(PO_ID);

    expect(po!.totalLines).toBe(0);
    expect(po!.receivedLines).toBe(0);
  });

  it('returns totalLines=0 and receivedLines=0 when the progress query fails (non-fatal fallback)', async () => {
    setupSelectsWithProgressError();

    const po = await storage.getVendorPO(PO_ID);

    expect(po).toBeDefined();
    expect(po!.totalLines).toBe(0);
    expect(po!.receivedLines).toBe(0);
  });

  it('returns undefined when the PO is not found', async () => {
    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const leftJoinFn = vi.fn().mockReturnValue({ where: whereFn });
    const fromFn = vi.fn().mockReturnValue({ leftJoin: leftJoinFn });
    vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as ReturnType<typeof db.select>);

    const po = await storage.getVendorPO(9999);

    expect(po).toBeUndefined();
  });

  it('always spreads the core PO fields alongside the progress counters', async () => {
    setupSelectsForHappyPath(3, 1);

    const po = await storage.getVendorPO(PO_ID);

    expect(po!.id).toBe(PO_ID);
    expect(po!.status).toBe('Sent');
    expect(po!.totalLines).toBe(3);
    expect(po!.receivedLines).toBe(1);
  });
});
