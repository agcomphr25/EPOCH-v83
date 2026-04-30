/**
 * Tests that guarantee the date-formatting contract for cutting fabric
 * inventory storage methods.  Each test seeds the DB mock with raw JavaScript
 * Date objects in the date columns and asserts that the storage method converts
 * them to "YYYY-MM-DD" strings before returning — verifying that the
 * formatDates() call is present in every return path and cannot be silently
 * removed.
 *
 * Covered methods:
 *   - getAllCuttingFabricInventory
 *   - getCuttingFabricInventory
 *   - getCuttingFabricInventoryByMaterial
 *   - createCuttingFabricInventory
 *   - updateCuttingFabricInventory
 *   - getCuttingFabricInventoryFIFO
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Typed interfaces for the Drizzle ORM fluent-chain mocks ─────────────────

/** select().from() → resolves to rows (getAll / FIFO without where) */
interface FromChainDirect {
  from: (table: unknown) => Promise<Record<string, unknown>[]> & WhereOrderByChain;
}

/** where(cond) → resolves to rows */
interface WhereChain {
  where: (cond: unknown) => Promise<Record<string, unknown>[]>;
}

/** from(table) → { where, orderBy } for FIFO builder */
interface WhereOrderByChain {
  where: (cond: unknown) => OrderByChain;
  orderBy: (...cols: unknown[]) => Promise<Record<string, unknown>[]>;
}

interface OrderByChain {
  orderBy: (...cols: unknown[]) => Promise<Record<string, unknown>[]>;
}

/** Simple select → from → where chain */
interface SelectWhereFromChain {
  from: (table: unknown) => WhereChain;
}

/** insert → values → returning */
interface ReturningChain {
  returning: () => Promise<Record<string, unknown>[]>;
}
interface ValuesChain {
  values: (data: unknown) => ReturningChain;
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

// ── Fixture ───────────────────────────────────────────────────────────────────

/**
 * A fabric inventory row whose three date columns are raw JS Date objects,
 * which is what Drizzle / node-postgres returns before our formatDates() call.
 */
function makeFabricRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'fi-001',
    materialId: 'mat-abc',
    lotNumber: 'LOT-1',
    quantity: 50,
    unit: 'yards',
    receivedDate: new Date('2024-03-10T00:00:00.000Z'),
    manufactureDate: new Date('2024-01-01T00:00:00.000Z'),
    expirationDate: new Date('2025-06-30T00:00:00.000Z'),
    notes: null,
    ...overrides,
  };
}

// ── Chain builder helpers ─────────────────────────────────────────────────────

/**
 * Build a `select().from(table).where(cond)` chain that resolves to rows.
 * Used by getCuttingFabricInventory and getCuttingFabricInventoryByMaterial.
 */
function selectFromWhereChain(rows: Record<string, unknown>[]): SelectWhereFromChain {
  const whereFn = vi.fn<(cond: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const fromFn = vi.fn<(table: unknown) => WhereChain>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

/**
 * Build the FIFO builder chain: select().from(table) returns an object with
 * both .where() and .orderBy() — mirrors the mutable builder pattern used in
 * getCuttingFabricInventoryFIFO.
 *
 * Without materialId:  from(table).orderBy() → rows
 * With materialId:     from(table).where(cond).orderBy() → rows
 */
function fifoSelectChain(rows: Record<string, unknown>[]): { from: (table: unknown) => WhereOrderByChain } {
  const orderByFn = vi.fn<(...cols: unknown[]) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi.fn<(cond: unknown) => OrderByChain>()
    .mockReturnValue({ orderBy: orderByFn });
  const fromFn = vi.fn<(table: unknown) => WhereOrderByChain>()
    .mockReturnValue({ where: whereFn, orderBy: orderByFn });
  return { from: fromFn };
}

/**
 * Build the getAllCuttingFabricInventory chain: select().from(table) → rows.
 * from() must be thenable (returns a Promise).
 */
function selectFromDirectChain(rows: Record<string, unknown>[]): FromChainDirect {
  const fromFn = vi.fn<(table: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  return { from: fromFn as unknown as FromChainDirect['from'] };
}

/**
 * Build the insert().values().returning() chain that resolves to rows.
 */
function insertValuesReturningChain(rows: Record<string, unknown>[]): ValuesChain {
  const returningFn = vi.fn<() => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const valuesFn = vi.fn<(data: unknown) => ReturningChain>()
    .mockReturnValue({ returning: returningFn });
  return { values: valuesFn };
}

/**
 * Build the update().set().where().returning() chain that resolves to rows.
 */
function updateSetWhereReturningChain(rows: Record<string, unknown>[]): UpdateSetChain {
  const returningFn = vi.fn<() => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi.fn<(cond: unknown) => UpdateReturningChain>()
    .mockReturnValue({ returning: returningFn });
  const setFn = vi.fn<(data: unknown) => UpdateWhereChain>()
    .mockReturnValue({ where: whereFn });
  return { set: setFn };
}

// ── Helper: assert date fields are YYYY-MM-DD strings (or null) ──────────────

function assertDateFields(
  row: Record<string, unknown>,
  {
    receivedDate,
    manufactureDate,
    expirationDate,
  }: { receivedDate: string | null; manufactureDate: string | null; expirationDate: string | null },
) {
  if (receivedDate === null) {
    expect(row.receivedDate).toBeNull();
  } else {
    expect(typeof row.receivedDate).toBe('string');
    expect(row.receivedDate).toBe(receivedDate);
    expect(row.receivedDate).not.toBeInstanceOf(Date);
  }

  if (manufactureDate === null) {
    expect(row.manufactureDate).toBeNull();
  } else {
    expect(typeof row.manufactureDate).toBe('string');
    expect(row.manufactureDate).toBe(manufactureDate);
    expect(row.manufactureDate).not.toBeInstanceOf(Date);
  }

  if (expirationDate === null) {
    expect(row.expirationDate).toBeNull();
  } else {
    expect(typeof row.expirationDate).toBe('string');
    expect(row.expirationDate).toBe(expirationDate);
    expect(row.expirationDate).not.toBeInstanceOf(Date);
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('cuttingFabricInventory storage — date formatting', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  // ── getAllCuttingFabricInventory ────────────────────────────────────────────

  describe('getAllCuttingFabricInventory', () => {
    it('converts raw JS Dates in all three date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromDirectChain([makeFabricRow()]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getAllCuttingFabricInventory();

      expect(results).toHaveLength(1);
      assertDateFields(results[0] as Record<string, unknown>, {
        receivedDate: '2024-03-10',
        manufactureDate: '2024-01-01',
        expirationDate: '2025-06-30',
      });
    });

    it('keeps all three date columns as null when the DB returns null', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromDirectChain([makeFabricRow({ receivedDate: null, manufactureDate: null, expirationDate: null })]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getAllCuttingFabricInventory();

      expect(results).toHaveLength(1);
      assertDateFields(results[0] as Record<string, unknown>, {
        receivedDate: null,
        manufactureDate: null,
        expirationDate: null,
      });
    });

    it('returns an empty array when no fabric inventory exists', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromDirectChain([]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getAllCuttingFabricInventory();

      expect(results).toEqual([]);
    });
  });

  // ── getCuttingFabricInventory ──────────────────────────────────────────────

  describe('getCuttingFabricInventory', () => {
    it('converts raw JS Dates to YYYY-MM-DD strings', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereChain([makeFabricRow()]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getCuttingFabricInventory('fi-001');

      expect(result).toBeDefined();
      assertDateFields(result as Record<string, unknown>, {
        receivedDate: '2024-03-10',
        manufactureDate: '2024-01-01',
        expirationDate: '2025-06-30',
      });
    });

    it('keeps date columns as null when the DB returns null', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereChain([makeFabricRow({ receivedDate: null, manufactureDate: null, expirationDate: null })]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getCuttingFabricInventory('fi-001');

      expect(result).toBeDefined();
      assertDateFields(result as Record<string, unknown>, {
        receivedDate: null,
        manufactureDate: null,
        expirationDate: null,
      });
    });

    it('returns undefined when no row matches the given id', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereChain([]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getCuttingFabricInventory('does-not-exist');

      expect(result).toBeUndefined();
    });
  });

  // ── getCuttingFabricInventoryByMaterial ────────────────────────────────────

  describe('getCuttingFabricInventoryByMaterial', () => {
    it('converts raw JS Dates to YYYY-MM-DD strings across all returned rows', async () => {
      const row1 = makeFabricRow({ id: 'fi-001', materialId: 'mat-abc' });
      const row2 = makeFabricRow({
        id: 'fi-002',
        materialId: 'mat-abc',
        receivedDate: new Date('2024-04-01T00:00:00.000Z'),
        manufactureDate: new Date('2024-02-01T00:00:00.000Z'),
        expirationDate: new Date('2025-12-31T00:00:00.000Z'),
      });

      vi.mocked(db.select).mockReturnValue(
        selectFromWhereChain([row1, row2]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getCuttingFabricInventoryByMaterial('mat-abc');

      expect(results).toHaveLength(2);
      assertDateFields(results[0] as Record<string, unknown>, {
        receivedDate: '2024-03-10',
        manufactureDate: '2024-01-01',
        expirationDate: '2025-06-30',
      });
      assertDateFields(results[1] as Record<string, unknown>, {
        receivedDate: '2024-04-01',
        manufactureDate: '2024-02-01',
        expirationDate: '2025-12-31',
      });
    });

    it('returns an empty array when no inventory exists for the material', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereChain([]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getCuttingFabricInventoryByMaterial('mat-none');

      expect(results).toEqual([]);
    });
  });

  // ── createCuttingFabricInventory ───────────────────────────────────────────

  describe('createCuttingFabricInventory', () => {
    it('converts raw JS Dates in the inserted row to YYYY-MM-DD strings', async () => {
      vi.mocked(db.insert).mockReturnValue(
        insertValuesReturningChain([makeFabricRow()]) as ReturnType<typeof db.insert>,
      );

      const result = await storage.createCuttingFabricInventory({
        materialId: 'mat-abc',
        lotNumber: 'LOT-1',
        quantity: '50',
        unit: 'yards',
        receivedDate: '2024-03-10',
        manufactureDate: '2024-01-01',
        expirationDate: '2025-06-30',
      } as Parameters<typeof storage.createCuttingFabricInventory>[0]);

      assertDateFields(result as Record<string, unknown>, {
        receivedDate: '2024-03-10',
        manufactureDate: '2024-01-01',
        expirationDate: '2025-06-30',
      });
    });

    it('keeps date columns as null when the inserted row has null dates', async () => {
      vi.mocked(db.insert).mockReturnValue(
        insertValuesReturningChain([makeFabricRow({ receivedDate: null, manufactureDate: null, expirationDate: null })]) as ReturnType<typeof db.insert>,
      );

      const result = await storage.createCuttingFabricInventory({
        materialId: 'mat-abc',
        lotNumber: 'LOT-2',
        quantity: '10',
        unit: 'yards',
      } as Parameters<typeof storage.createCuttingFabricInventory>[0]);

      assertDateFields(result as Record<string, unknown>, {
        receivedDate: null,
        manufactureDate: null,
        expirationDate: null,
      });
    });
  });

  // ── updateCuttingFabricInventory ───────────────────────────────────────────

  describe('updateCuttingFabricInventory', () => {
    it('converts raw JS Dates in the updated row to YYYY-MM-DD strings', async () => {
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([makeFabricRow()]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updateCuttingFabricInventory('fi-001', {
        receivedDate: '2024-03-10',
      });

      assertDateFields(result as Record<string, unknown>, {
        receivedDate: '2024-03-10',
        manufactureDate: '2024-01-01',
        expirationDate: '2025-06-30',
      });
    });

    it('keeps date columns as null when the updated row returns null dates', async () => {
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([makeFabricRow({ receivedDate: null, manufactureDate: null, expirationDate: null })]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updateCuttingFabricInventory('fi-001', { quantity: '45' });

      assertDateFields(result as Record<string, unknown>, {
        receivedDate: null,
        manufactureDate: null,
        expirationDate: null,
      });
    });

    it('does not require date fields in the update payload — non-date fields pass through correctly', async () => {
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([
          makeFabricRow({ quantity: 99, notes: 'updated note' }),
        ]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updateCuttingFabricInventory('fi-001', { quantity: '99' });

      expect((result as Record<string, unknown>).quantity).toBe(99);
      expect((result as Record<string, unknown>).notes).toBe('updated note');
      assertDateFields(result as Record<string, unknown>, {
        receivedDate: '2024-03-10',
        manufactureDate: '2024-01-01',
        expirationDate: '2025-06-30',
      });
    });
  });

  // ── getCuttingFabricInventoryFIFO ──────────────────────────────────────────

  describe('getCuttingFabricInventoryFIFO', () => {
    it('converts raw JS Dates to YYYY-MM-DD strings when called without a materialId', async () => {
      vi.mocked(db.select).mockReturnValue(
        fifoSelectChain([makeFabricRow()]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getCuttingFabricInventoryFIFO();

      expect(results).toHaveLength(1);
      assertDateFields(results[0] as Record<string, unknown>, {
        receivedDate: '2024-03-10',
        manufactureDate: '2024-01-01',
        expirationDate: '2025-06-30',
      });
    });

    it('converts raw JS Dates to YYYY-MM-DD strings when filtered by materialId', async () => {
      vi.mocked(db.select).mockReturnValue(
        fifoSelectChain([makeFabricRow({ materialId: 'mat-xyz' })]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getCuttingFabricInventoryFIFO('mat-xyz');

      expect(results).toHaveLength(1);
      assertDateFields(results[0] as Record<string, unknown>, {
        receivedDate: '2024-03-10',
        manufactureDate: '2024-01-01',
        expirationDate: '2025-06-30',
      });
    });

    it('keeps date columns as null for rows with null dates', async () => {
      vi.mocked(db.select).mockReturnValue(
        fifoSelectChain([makeFabricRow({ receivedDate: null, manufactureDate: null, expirationDate: null })]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getCuttingFabricInventoryFIFO();

      expect(results).toHaveLength(1);
      assertDateFields(results[0] as Record<string, unknown>, {
        receivedDate: null,
        manufactureDate: null,
        expirationDate: null,
      });
    });

    it('returns an empty array when no inventory is found', async () => {
      vi.mocked(db.select).mockReturnValue(
        fifoSelectChain([]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getCuttingFabricInventoryFIFO();

      expect(results).toEqual([]);
    });
  });
});
