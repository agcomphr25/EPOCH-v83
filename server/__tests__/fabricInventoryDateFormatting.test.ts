/**
 * Tests that `fabricInventory.records` in the `recordVendorPOReceipt` response
 * always returns `receivedDate`, `manufactureDate`, and `expirationDate` as
 * "YYYY-MM-DD" strings (or null), verifying that the `formatDates()` call is
 * applied to every fabric inventory record before being returned.
 *
 * Without this coverage a future change to the insert logic or traceability
 * parsing could silently break the date-format guarantee added in task #1345.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Typed interfaces for the Drizzle ORM fluent-chain mocks ─────────────────

interface WhereChain {
  where: (cond: unknown) => Promise<Record<string, unknown>[]>;
}
interface FromChain {
  from: (table: unknown) => WhereChain;
}
interface InsertReturningChain {
  returning: () => Promise<Record<string, unknown>[]>;
}
interface InsertValuesChain {
  values: (data: unknown) => InsertReturningChain;
}

// ── Module mocks (hoisted by Vitest before any import) ───────────────────────

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
  pool: {},
}));

vi.mock('../src/services/inventoryEventService.js', () => ({
  createInventoryEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/utils/manufacturingQueueHelper', () => ({
  autoPopulateManufacturingQueue: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { DatabaseStorage } from '../storage';
import { db } from '../db';

// ── Constants ────────────────────────────────────────────────────────────────

const PO_ID       = 42;
const LINE_ITEM_ID = 7;
const VENDOR_ID    = 3;
const AG_PART      = 'AG-FABRIC-001';

/** A date safely in the past so the "no future dates" guard never triggers. */
const PAST_DATE = new Date('2025-11-15T00:00:00Z');

/**
 * Simple traceability note that exercises the single-unit parsing path.
 * Uses the `|` delimiter expected by `parseTraceabilityFromNote`.
 */
const SIMPLE_NOTES = [
  'Lot: LOT-123',
  'Manufacture Date: 2024-01-15',
  'Expiration Date: 2026-01-15',
].join(' | ');

/**
 * Per-unit traceability note that exercises the multi-roll path.
 * The `[2 units with individual traceability]` marker triggers `perUnitMatch`,
 * and the two `Unit N:` sections are parsed separately.
 */
const PER_UNIT_NOTES = [
  '[2 units with individual traceability]',
  'Unit 1: Lot: LOT-A | Manufacture Date: 2024-01-15 | Expiration Date: 2026-01-15',
  'Unit 2: Lot: LOT-B | Manufacture Date: 2024-02-20 | Expiration Date: 2026-02-20',
].join(' | ');

// ── Chain-builder helpers ─────────────────────────────────────────────────────

/** Build the `db.select().from(table).where(cond)` chain mock. */
function selectWhere(rows: Record<string, unknown>[]): FromChain {
  const whereFn = vi.fn<(cond: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const fromFn = vi.fn<(table: unknown) => WhereChain>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

/** Build the `db.insert().values().returning()` chain mock. */
function insertReturning(rows: Record<string, unknown>[]): InsertValuesChain {
  const returningFn = vi.fn<() => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
  return { values: valuesFn };
}

// ── Composite setup helpers ───────────────────────────────────────────────────

/**
 * Configure the three outer `db.select()` calls executed before the
 * transaction:
 *   call 1 — PO line item (unitPrice=null skips COGS)
 *   call 2 — vendor PO
 *   call 3 — inventory item (fabric, PL1-enabled)
 */
function setupOuterSelects(): void {
  const poLineItem: Record<string, unknown> = {
    id: LINE_ITEM_ID,
    agPartNumber: AG_PART,
    unitPrice: null,
    vendorPoId: PO_ID,
  };
  const vendorPO: Record<string, unknown> = { vendorId: VENDOR_ID };
  const fabricInventoryItem: Record<string, unknown> = {
    id: 1,
    agPartNumber: AG_PART,
    name: 'Test Fabric',
    source: 'External',
    supplierPartNumber: 'SUP-001',
    vendorUnit: null,
    purchaseUnit: 'YD',
    purchaseQuantity: null,
    consumptionRate: null,
    usageUnit: null,
    utilizedInPL1: true,
    utilizedInPL2: false,
    isFabric: true,
  };

  vi.mocked(db.select)
    .mockReturnValueOnce(selectWhere([poLineItem]))
    .mockReturnValueOnce(selectWhere([vendorPO]))
    .mockReturnValueOnce(selectWhere([fabricInventoryItem]));
}

/**
 * Wire up `db.transaction` so it runs the callback immediately with a minimal
 * `tx` that handles both the line-item update and the PO-status update.
 */
function setupTransaction(): void {
  const txSelectWhere = vi.fn().mockResolvedValue([
    { quantity: 10, receivedQuantity: 5 },
  ]);
  const txSelectFrom = vi.fn().mockReturnValue({ where: txSelectWhere });
  const txSelect     = vi.fn().mockReturnValue({ from: txSelectFrom });
  const txUpdate     = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });

  const mockTx = { select: txSelect, update: txUpdate };
  vi.mocked(db.transaction).mockImplementation(
    async (cb: (tx: typeof mockTx) => Promise<void>) => cb(mockTx),
  );
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('recordVendorPOReceipt — fabricInventory.records date formatting', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it('returns receivedDate, manufactureDate, and expirationDate as YYYY-MM-DD strings when the DB yields raw JS Date objects', async () => {
    setupOuterSelects();
    setupTransaction();

    const rawFabricRecord: Record<string, unknown> = {
      id: 100,
      fabric: 'Test Fabric',
      fabricPartNumber: AG_PART,
      receivedDate:    new Date('2025-11-15T00:00:00Z'),
      manufactureDate: new Date('2024-01-15T00:00:00Z'),
      expirationDate:  new Date('2026-01-15T00:00:00Z'),
    };

    vi.mocked(db.insert).mockReturnValue(
      insertReturning([rawFabricRecord]) as ReturnType<typeof db.insert>,
    );

    const result = await storage.recordVendorPOReceipt({
      poLineItemId: LINE_ITEM_ID,
      receivedQuantity: 5,
      receivedDate: PAST_DATE,
      notes: SIMPLE_NOTES,
    });

    expect(result.fabricInventory).not.toBeNull();
    expect(result.fabricInventory!.records).toHaveLength(1);

    const record = result.fabricInventory!.records[0];
    const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

    expect(record.receivedDate).toMatch(DATE_PATTERN);
    expect(record.manufactureDate).toMatch(DATE_PATTERN);
    expect(record.expirationDate).toMatch(DATE_PATTERN);

    expect(record.receivedDate).toBe('2025-11-15');
    expect(record.manufactureDate).toBe('2024-01-15');
    expect(record.expirationDate).toBe('2026-01-15');
  });

  it('returns null for manufactureDate and expirationDate when the DB returns null for those fields', async () => {
    setupOuterSelects();
    setupTransaction();

    const rawFabricRecord: Record<string, unknown> = {
      id: 101,
      fabric: 'Test Fabric',
      fabricPartNumber: AG_PART,
      receivedDate:    new Date('2025-11-15T00:00:00Z'),
      manufactureDate: null,
      expirationDate:  null,
    };

    vi.mocked(db.insert).mockReturnValue(
      insertReturning([rawFabricRecord]) as ReturnType<typeof db.insert>,
    );

    const result = await storage.recordVendorPOReceipt({
      poLineItemId: LINE_ITEM_ID,
      receivedQuantity: 5,
      receivedDate: PAST_DATE,
      notes: SIMPLE_NOTES,
    });

    expect(result.fabricInventory).not.toBeNull();
    const record = result.fabricInventory!.records[0];

    expect(record.receivedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(record.manufactureDate).toBeNull();
    expect(record.expirationDate).toBeNull();
  });

  it('returns YYYY-MM-DD strings when the DB returns dates as already-formatted strings', async () => {
    setupOuterSelects();
    setupTransaction();

    const rawFabricRecord: Record<string, unknown> = {
      id: 102,
      fabric: 'Test Fabric',
      fabricPartNumber: AG_PART,
      receivedDate:    '2025-11-15',
      manufactureDate: '2024-01-15',
      expirationDate:  '2026-01-15',
    };

    vi.mocked(db.insert).mockReturnValue(
      insertReturning([rawFabricRecord]) as ReturnType<typeof db.insert>,
    );

    const result = await storage.recordVendorPOReceipt({
      poLineItemId: LINE_ITEM_ID,
      receivedQuantity: 5,
      receivedDate: PAST_DATE,
      notes: SIMPLE_NOTES,
    });

    expect(result.fabricInventory).not.toBeNull();
    const record = result.fabricInventory!.records[0];

    const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
    expect(record.receivedDate).toMatch(DATE_PATTERN);
    expect(record.manufactureDate).toMatch(DATE_PATTERN);
    expect(record.expirationDate).toMatch(DATE_PATTERN);
  });

  it('per-unit path: returns YYYY-MM-DD strings (or null) for every record when notes contain [N units with individual traceability]', async () => {
    setupOuterSelects();
    setupTransaction();

    const rawUnit1: Record<string, unknown> = {
      id: 200,
      fabric: 'Test Fabric',
      fabricPartNumber: AG_PART,
      receivedDate:    new Date('2025-11-15T00:00:00Z'),
      manufactureDate: new Date('2024-01-15T00:00:00Z'),
      expirationDate:  new Date('2026-01-15T00:00:00Z'),
    };
    const rawUnit2: Record<string, unknown> = {
      id: 201,
      fabric: 'Test Fabric',
      fabricPartNumber: AG_PART,
      receivedDate:    new Date('2025-11-15T00:00:00Z'),
      manufactureDate: new Date('2024-02-20T00:00:00Z'),
      expirationDate:  null,
    };

    vi.mocked(db.insert)
      .mockReturnValueOnce(insertReturning([rawUnit1]) as ReturnType<typeof db.insert>)
      .mockReturnValueOnce(insertReturning([rawUnit2]) as ReturnType<typeof db.insert>);

    const result = await storage.recordVendorPOReceipt({
      poLineItemId: LINE_ITEM_ID,
      receivedQuantity: 2,
      receivedDate: PAST_DATE,
      notes: PER_UNIT_NOTES,
    });

    expect(result.fabricInventory).not.toBeNull();
    expect(result.fabricInventory!.records).toHaveLength(2);

    const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

    const rec1 = result.fabricInventory!.records[0];
    expect(rec1.receivedDate).toMatch(DATE_PATTERN);
    expect(rec1.manufactureDate).toMatch(DATE_PATTERN);
    expect(rec1.expirationDate).toMatch(DATE_PATTERN);
    expect(rec1.receivedDate).toBe('2025-11-15');
    expect(rec1.manufactureDate).toBe('2024-01-15');
    expect(rec1.expirationDate).toBe('2026-01-15');

    const rec2 = result.fabricInventory!.records[1];
    expect(rec2.receivedDate).toMatch(DATE_PATTERN);
    expect(rec2.manufactureDate).toMatch(DATE_PATTERN);
    expect(rec2.expirationDate).toBeNull();
    expect(rec2.receivedDate).toBe('2025-11-15');
    expect(rec2.manufactureDate).toBe('2024-02-20');
  });
});
