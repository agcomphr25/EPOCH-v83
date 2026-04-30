/**
 * Tests that guarantee the date-formatting contract for vendor PO storage
 * methods.  Each test seeds the DB mock with raw JavaScript Date objects in
 * the date columns and asserts that the storage method converts them to
 * "YYYY-MM-DD" strings before returning — verifying that the formatDates()
 * call cannot be silently removed.
 *
 * Date columns: orderDate, expectedDeliveryDate, actualDeliveryDate
 *
 * Covered methods:
 *   - createVendorPO
 *   - updateVendorPO
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Typed interfaces for the Drizzle ORM fluent-chain mocks ─────────────────

/** insert → values → returning */
interface InsertReturningChain {
  returning: () => Promise<Record<string, unknown>[]>;
}
interface InsertValuesChain {
  values: (data: unknown) => InsertReturningChain;
}

/** update → set → where → returning */
interface UpdateReturningChain {
  returning: () => Promise<Record<string, unknown>[]>;
}
interface UpdateWhereChain {
  where: (cond: unknown) => UpdateReturningChain;
}
interface UpdateSetChain {
  set: (data: unknown) => UpdateWhereChain;
}

// ── Module mocks (hoisted by Vitest before any import) ───────────────────────

vi.mock('../db', () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
  pool: { query: vi.fn() },
  pgPool: {},
  rawSql: vi.fn(),
}));

vi.mock('../src/utils/manufacturingQueueHelper', () => ({
  autoPopulateManufacturingQueue: vi.fn().mockResolvedValue(undefined),
  syncManufacturingQueueOnUpdate: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { DatabaseStorage } from '../storage';
import { db } from '../db';

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeVendorPORow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    poNumber: 'PO-001',
    vendorId: 10,
    status: 'Open',
    barcode: 'abc123',
    orderDate: new Date('2024-01-15T00:00:00.000Z'),
    expectedDeliveryDate: new Date('2024-02-28T00:00:00.000Z'),
    actualDeliveryDate: new Date('2024-03-05T00:00:00.000Z'),
    ...overrides,
  };
}

// ── Chain builder helpers ─────────────────────────────────────────────────────

function insertValuesReturningChain(rows: Record<string, unknown>[]): InsertValuesChain {
  const returningFn = vi.fn<() => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const valuesFn = vi.fn<(data: unknown) => InsertReturningChain>()
    .mockReturnValue({ returning: returningFn });
  return { values: valuesFn };
}

function updateSetWhereReturningChain(rows: Record<string, unknown>[]): UpdateSetChain {
  const returningFn = vi.fn<() => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi.fn<(cond: unknown) => UpdateReturningChain>()
    .mockReturnValue({ returning: returningFn });
  const setFn = vi.fn<(data: unknown) => UpdateWhereChain>()
    .mockReturnValue({ where: whereFn });
  return { set: setFn };
}

// ── Helper: assert date fields are YYYY-MM-DD strings ────────────────────────

function assertVendorPODates(
  row: Record<string, unknown>,
  expected: { orderDate: string | null; expectedDeliveryDate: string | null; actualDeliveryDate: string | null },
) {
  if (expected.orderDate === null) {
    expect(row.orderDate).toBeNull();
  } else {
    expect(typeof row.orderDate).toBe('string');
    expect(row.orderDate).toBe(expected.orderDate);
    expect(row.orderDate).not.toBeInstanceOf(Date);
  }
  if (expected.expectedDeliveryDate === null) {
    expect(row.expectedDeliveryDate).toBeNull();
  } else {
    expect(typeof row.expectedDeliveryDate).toBe('string');
    expect(row.expectedDeliveryDate).toBe(expected.expectedDeliveryDate);
    expect(row.expectedDeliveryDate).not.toBeInstanceOf(Date);
  }
  if (expected.actualDeliveryDate === null) {
    expect(row.actualDeliveryDate).toBeNull();
  } else {
    expect(typeof row.actualDeliveryDate).toBe('string');
    expect(row.actualDeliveryDate).toBe(expected.actualDeliveryDate);
    expect(row.actualDeliveryDate).not.toBeInstanceOf(Date);
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('vendorPO storage — date formatting', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  // ── createVendorPO ─────────────────────────────────────────────────────────

  describe('createVendorPO', () => {
    it('converts raw JS Dates in all three date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.insert).mockReturnValue(
        insertValuesReturningChain([makeVendorPORow()]) as ReturnType<typeof db.insert>,
      );

      const result = await storage.createVendorPO({ vendorId: 10, poNumber: 'PO-001', barcode: 'abc123' });

      assertVendorPODates(result as Record<string, unknown>, {
        orderDate: '2024-01-15',
        expectedDeliveryDate: '2024-02-28',
        actualDeliveryDate: '2024-03-05',
      });
    });

    it('keeps all date columns as null when the DB returns null', async () => {
      vi.mocked(db.insert).mockReturnValue(
        insertValuesReturningChain([makeVendorPORow({ orderDate: null, expectedDeliveryDate: null, actualDeliveryDate: null })]) as ReturnType<typeof db.insert>,
      );

      const result = await storage.createVendorPO({ vendorId: 10, poNumber: 'PO-001', barcode: 'abc123' });

      assertVendorPODates(result as Record<string, unknown>, {
        orderDate: null,
        expectedDeliveryDate: null,
        actualDeliveryDate: null,
      });
    });
  });

  // ── updateVendorPO ─────────────────────────────────────────────────────────

  describe('updateVendorPO', () => {
    it('converts raw JS Dates in all three date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([makeVendorPORow()]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updateVendorPO(1, { status: 'Closed' });

      assertVendorPODates(result as Record<string, unknown>, {
        orderDate: '2024-01-15',
        expectedDeliveryDate: '2024-02-28',
        actualDeliveryDate: '2024-03-05',
      });
    });

    it('keeps all date columns as null when the updated row returns null dates', async () => {
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([makeVendorPORow({ orderDate: null, expectedDeliveryDate: null, actualDeliveryDate: null })]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updateVendorPO(1, { status: 'Closed' });

      assertVendorPODates(result as Record<string, unknown>, {
        orderDate: null,
        expectedDeliveryDate: null,
        actualDeliveryDate: null,
      });
    });
  });
});
