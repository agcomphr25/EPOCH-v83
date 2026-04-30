/**
 * Tests that guarantee the date-formatting contract for vendor storage methods.
 * Each test seeds the DB mock with raw JavaScript Date objects in the date
 * columns and asserts that the storage method converts them to "YYYY-MM-DD"
 * strings before returning — verifying that the formatDates() call cannot be
 * silently removed.
 *
 * Date columns: evaluationDate, startRenewalDate, approvalExpiration
 *
 * Covered methods:
 *   - createVendor
 *   - updateVendor
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

function makeVendorRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    name: 'Test Vendor',
    evaluationDate: new Date('2024-03-15T00:00:00.000Z'),
    startRenewalDate: new Date('2024-06-01T00:00:00.000Z'),
    approvalExpiration: new Date('2025-06-01T00:00:00.000Z'),
    isActive: true,
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

function assertVendorDates(
  row: Record<string, unknown>,
  expected: { evaluationDate: string | null; startRenewalDate: string | null; approvalExpiration: string | null },
) {
  if (expected.evaluationDate === null) {
    expect(row.evaluationDate).toBeNull();
  } else {
    expect(typeof row.evaluationDate).toBe('string');
    expect(row.evaluationDate).toBe(expected.evaluationDate);
    expect(row.evaluationDate).not.toBeInstanceOf(Date);
  }
  if (expected.startRenewalDate === null) {
    expect(row.startRenewalDate).toBeNull();
  } else {
    expect(typeof row.startRenewalDate).toBe('string');
    expect(row.startRenewalDate).toBe(expected.startRenewalDate);
    expect(row.startRenewalDate).not.toBeInstanceOf(Date);
  }
  if (expected.approvalExpiration === null) {
    expect(row.approvalExpiration).toBeNull();
  } else {
    expect(typeof row.approvalExpiration).toBe('string');
    expect(row.approvalExpiration).toBe(expected.approvalExpiration);
    expect(row.approvalExpiration).not.toBeInstanceOf(Date);
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('vendor storage — date formatting', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  // ── createVendor ───────────────────────────────────────────────────────────

  describe('createVendor', () => {
    it('converts raw JS Dates in all three date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.insert).mockReturnValue(
        insertValuesReturningChain([makeVendorRow()]) as ReturnType<typeof db.insert>,
      );

      const result = await storage.createVendor({ name: 'Test Vendor' } as Parameters<typeof storage.createVendor>[0]);

      assertVendorDates(result as Record<string, unknown>, {
        evaluationDate: '2024-03-15',
        startRenewalDate: '2024-06-01',
        approvalExpiration: '2025-06-01',
      });
    });

    it('keeps all date columns as null when the DB returns null', async () => {
      vi.mocked(db.insert).mockReturnValue(
        insertValuesReturningChain([makeVendorRow({ evaluationDate: null, startRenewalDate: null, approvalExpiration: null })]) as ReturnType<typeof db.insert>,
      );

      const result = await storage.createVendor({ name: 'Test Vendor' } as Parameters<typeof storage.createVendor>[0]);

      assertVendorDates(result as Record<string, unknown>, {
        evaluationDate: null,
        startRenewalDate: null,
        approvalExpiration: null,
      });
    });
  });

  // ── updateVendor ───────────────────────────────────────────────────────────

  describe('updateVendor', () => {
    it('converts raw JS Dates in all three date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([makeVendorRow()]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updateVendor(1, { name: 'Updated Vendor' });

      assertVendorDates(result as Record<string, unknown>, {
        evaluationDate: '2024-03-15',
        startRenewalDate: '2024-06-01',
        approvalExpiration: '2025-06-01',
      });
    });

    it('keeps all date columns as null when the updated row returns null dates', async () => {
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([makeVendorRow({ evaluationDate: null, startRenewalDate: null, approvalExpiration: null })]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updateVendor(1, { name: 'Updated Vendor' });

      assertVendorDates(result as Record<string, unknown>, {
        evaluationDate: null,
        startRenewalDate: null,
        approvalExpiration: null,
      });
    });
  });
});
