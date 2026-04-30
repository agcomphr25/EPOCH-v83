/**
 * Tests that guarantee the date-formatting contract for employee storage
 * methods.  Each test seeds the DB mock with raw JavaScript Date objects in
 * the date columns and asserts that the storage method converts them to
 * "YYYY-MM-DD" strings before returning — verifying that the formatDates()
 * call cannot be silently removed.
 *
 * Date columns: hireDate, dateOfBirth, driversLicenseExpiration
 *
 * Covered methods:
 *   - getAllEmployees
 *   - getEmployee
 *   - createEmployee
 *   - updateEmployee
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Typed interfaces for the Drizzle ORM fluent-chain mocks ─────────────────

/** select().from().orderBy() → resolves to rows (getAllEmployees) */
interface OrderByChain {
  orderBy: (col: unknown) => Promise<Record<string, unknown>[]>;
}
interface FromChainWithOrderBy {
  from: (table: unknown) => OrderByChain;
}

/** select().from().where() → resolves to rows (getEmployee) */
interface WhereChain {
  where: (cond: unknown) => Promise<Record<string, unknown>[]>;
}
interface FromChainWithWhere {
  from: (table: unknown) => WhereChain;
}

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
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
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

function makeEmployeeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    name: 'Jane Smith',
    hireDate: new Date('2022-05-10T00:00:00.000Z'),
    dateOfBirth: new Date('1990-08-20T00:00:00.000Z'),
    driversLicenseExpiration: new Date('2026-03-31T00:00:00.000Z'),
    isActive: true,
    userRole: 'operator',
    ...overrides,
  };
}

// ── Chain builder helpers ─────────────────────────────────────────────────────

function selectFromOrderByChain(rows: Record<string, unknown>[]): FromChainWithOrderBy {
  const orderByFn = vi.fn<(col: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const fromFn = vi.fn<(table: unknown) => OrderByChain>()
    .mockReturnValue({ orderBy: orderByFn });
  return { from: fromFn };
}

function selectFromWhereChain(rows: Record<string, unknown>[]): FromChainWithWhere {
  const whereFn = vi.fn<(cond: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const fromFn = vi.fn<(table: unknown) => WhereChain>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

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

function assertEmployeeDates(
  row: Record<string, unknown>,
  expected: { hireDate: string | null; dateOfBirth: string | null; driversLicenseExpiration: string | null },
) {
  if (expected.hireDate === null) {
    expect(row.hireDate).toBeNull();
  } else {
    expect(typeof row.hireDate).toBe('string');
    expect(row.hireDate).toBe(expected.hireDate);
    expect(row.hireDate).not.toBeInstanceOf(Date);
  }
  if (expected.dateOfBirth === null) {
    expect(row.dateOfBirth).toBeNull();
  } else {
    expect(typeof row.dateOfBirth).toBe('string');
    expect(row.dateOfBirth).toBe(expected.dateOfBirth);
    expect(row.dateOfBirth).not.toBeInstanceOf(Date);
  }
  if (expected.driversLicenseExpiration === null) {
    expect(row.driversLicenseExpiration).toBeNull();
  } else {
    expect(typeof row.driversLicenseExpiration).toBe('string');
    expect(row.driversLicenseExpiration).toBe(expected.driversLicenseExpiration);
    expect(row.driversLicenseExpiration).not.toBeInstanceOf(Date);
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('employee storage — date formatting', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  // ── getAllEmployees ─────────────────────────────────────────────────────────

  describe('getAllEmployees', () => {
    it('converts raw JS Dates in all three date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromOrderByChain([makeEmployeeRow()]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getAllEmployees();

      expect(results).toHaveLength(1);
      assertEmployeeDates(results[0] as Record<string, unknown>, {
        hireDate: '2022-05-10',
        dateOfBirth: '1990-08-20',
        driversLicenseExpiration: '2026-03-31',
      });
    });

    it('keeps all date columns as null when the DB returns null', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromOrderByChain([makeEmployeeRow({ hireDate: null, dateOfBirth: null, driversLicenseExpiration: null })]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getAllEmployees();

      expect(results).toHaveLength(1);
      assertEmployeeDates(results[0] as Record<string, unknown>, {
        hireDate: null,
        dateOfBirth: null,
        driversLicenseExpiration: null,
      });
    });

    it('returns an empty array when no employees exist', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromOrderByChain([]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getAllEmployees();

      expect(results).toEqual([]);
    });
  });

  // ── getEmployee ────────────────────────────────────────────────────────────

  describe('getEmployee', () => {
    it('converts raw JS Dates to YYYY-MM-DD strings', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereChain([makeEmployeeRow()]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getEmployee(1);

      expect(result).toBeDefined();
      assertEmployeeDates(result as Record<string, unknown>, {
        hireDate: '2022-05-10',
        dateOfBirth: '1990-08-20',
        driversLicenseExpiration: '2026-03-31',
      });
    });

    it('returns undefined when no employee matches the given id', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereChain([]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getEmployee(999);

      expect(result).toBeUndefined();
    });
  });

  // ── createEmployee ─────────────────────────────────────────────────────────

  describe('createEmployee', () => {
    it('converts raw JS Dates in all three date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.insert).mockReturnValue(
        insertValuesReturningChain([makeEmployeeRow()]) as ReturnType<typeof db.insert>,
      );

      const result = await storage.createEmployee({
        name: 'Jane Smith',
      } as Parameters<typeof storage.createEmployee>[0]);

      assertEmployeeDates(result as Record<string, unknown>, {
        hireDate: '2022-05-10',
        dateOfBirth: '1990-08-20',
        driversLicenseExpiration: '2026-03-31',
      });
    });

    it('keeps all date columns as null when the inserted row has null dates', async () => {
      vi.mocked(db.insert).mockReturnValue(
        insertValuesReturningChain([makeEmployeeRow({ hireDate: null, dateOfBirth: null, driversLicenseExpiration: null })]) as ReturnType<typeof db.insert>,
      );

      const result = await storage.createEmployee({
        name: 'Jane Smith',
      } as Parameters<typeof storage.createEmployee>[0]);

      assertEmployeeDates(result as Record<string, unknown>, {
        hireDate: null,
        dateOfBirth: null,
        driversLicenseExpiration: null,
      });
    });
  });

  // ── updateEmployee ─────────────────────────────────────────────────────────

  describe('updateEmployee', () => {
    it('converts raw JS Dates in all three date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([makeEmployeeRow()]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updateEmployee(1, { name: 'Jane Smith Updated' });

      assertEmployeeDates(result as Record<string, unknown>, {
        hireDate: '2022-05-10',
        dateOfBirth: '1990-08-20',
        driversLicenseExpiration: '2026-03-31',
      });
    });

    it('keeps all date columns as null when the updated row returns null dates', async () => {
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([makeEmployeeRow({ hireDate: null, dateOfBirth: null, driversLicenseExpiration: null })]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updateEmployee(1, { name: 'Jane Smith Updated' });

      assertEmployeeDates(result as Record<string, unknown>, {
        hireDate: null,
        dateOfBirth: null,
        driversLicenseExpiration: null,
      });
    });
  });
});
