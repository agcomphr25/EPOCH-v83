/**
 * Tests for the cutting packet barcode alias layer.
 *
 * Background
 * ----------
 * Operators print packet labels of the form `MFG-{queueId}-{partNumber}-{seq}`
 * directly off the manufacturing_queue id.  Three flows currently destroy or
 * replace that id while the printed labels are still in circulation:
 *   1. P2 duplicate-grouping backfill (consolidates multiple PENDING rows
 *      for the same packet+due-date into one canonical row).
 *   2. The unschedule DELETE endpoint on /api/cutting-table-mfg-queue/:id.
 *   3. A fresh P2 sync recreating a row with a new id after the previous one
 *      was deleted.
 *
 * The alias table records `original_queue_id -> successor_queue_id` so old
 * labels keep working.  These tests pin the alias-resolution semantics that
 * the scan-start endpoint relies on.
 *
 * Mocking strategy
 * ----------------
 * All tests run against an in-memory store of alias rows + manufacturing
 * queue rows; `../../db` is mocked so we can drive the resolver
 * deterministically without a live database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    eq: (column: unknown, value: unknown) => ({ __op: 'eq', column, value }),
    and: (...conds: unknown[]) => ({ __op: 'and', conds }),
    isNull: (column: unknown) => ({ __op: 'isNull', column }),
    inArray: (column: unknown, values: unknown[]) => ({ __op: 'inArray', column, values }),
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: true, strings, values }),
      { raw: (s: string) => ({ __raw: true, s }) },
    ),
  };
});

interface AliasRow {
  id: string;
  originalQueueId: number;
  successorQueueId: number | null;
  inventoryItemId: number | null;
  packetName: string | null;
  dueDateBucket: string | null;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

interface QueueRow {
  id: number;
  department: string;
  inventoryItemId: number | null;
  status: string;
}

const aliasStore: AliasRow[] = [];
const queueStore: QueueRow[] = [];

vi.mock('../db', () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock('../schema', () => ({
  cuttingPacketBarcodeAliases: { __table: 'cutting_packet_barcode_aliases' },
  manufacturingQueue: {
    __table: 'manufacturing_queue',
    id: { __col: 'id' },
    department: { __col: 'department' },
  },
}));

import { db } from '../db';
import {
  dueDateBucket,
  resolveAliasedQueueRow,
} from '../src/utils/cuttingPacketBarcodeAlias';

function findAliasFromWhere(where: any): AliasRow | undefined {
  // Resolver calls .where(eq(cuttingPacketBarcodeAliases.originalQueueId, id))
  if (where?.__op === 'eq') {
    return aliasStore.find((a) => a.originalQueueId === where.value);
  }
  return undefined;
}

function findQueueFromWhere(where: any): QueueRow | undefined {
  // Resolver calls .where(and(eq(id, x), eq(department, 'Cutting Table')))
  if (where?.__op === 'and') {
    const idCond = where.conds.find((c: any) => c.__op === 'eq' && (c.column?.__col === 'id' || /id/i.test(String(c.column?.__col))));
    if (idCond) return queueStore.find((r) => r.id === idCond.value && r.department === 'Cutting Table');
  }
  return undefined;
}

function setupSelectMock() {
  (db.select as any).mockImplementation(() => {
    let _table: any = null;
    const chain: any = {
      from(tbl: any) { _table = tbl; return chain; },
      where(w: any) { chain._where = w; return chain; },
      limit(_n: number) {
        if (_table?.__table === 'cutting_packet_barcode_aliases') {
          const a = findAliasFromWhere(chain._where);
          return Promise.resolve(a ? [a] : []);
        }
        if (_table?.__table === 'manufacturing_queue') {
          const r = findQueueFromWhere(chain._where);
          return Promise.resolve(r ? [r] : []);
        }
        return Promise.resolve([]);
      },
    };
    return chain;
  });
}

beforeEach(() => {
  aliasStore.length = 0;
  queueStore.length = 0;
  vi.clearAllMocks();
  setupSelectMock();
});

describe('dueDateBucket', () => {
  it('returns the YYYY-MM-DD calendar day for a Date', () => {
    const d = new Date('2026-03-14T18:30:00.000Z');
    // Local-day dependent — at minimum matches the same calendar partition
    // the grouping helper produces for this same Date.
    expect(dueDateBucket(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns 'null' for null/undefined/invalid", () => {
    expect(dueDateBucket(null)).toBe('null');
    expect(dueDateBucket(undefined)).toBe('null');
    expect(dueDateBucket('not-a-date')).toBe('null');
  });

  it('returns the same bucket for two Dates on the same local day', () => {
    const a = new Date('2026-03-14T01:00:00');
    const b = new Date('2026-03-14T23:00:00');
    expect(dueDateBucket(a)).toBe(dueDateBucket(b));
  });
});

describe('resolveAliasedQueueRow', () => {
  it('returns null when no alias exists for the printed id', async () => {
    const result = await resolveAliasedQueueRow(999);
    expect(result).toBeNull();
  });

  it('resolves a single-hop alias to the live successor queue row', async () => {
    queueStore.push({ id: 200, department: 'Cutting Table', inventoryItemId: 42, status: 'PENDING' });
    aliasStore.push({
      id: 'a1',
      originalQueueId: 100,
      successorQueueId: 200,
      inventoryItemId: 42,
      packetName: 'PKT-X',
      dueDateBucket: '2026-03-14',
      reason: 'merged',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await resolveAliasedQueueRow(100);
    expect(result).not.toBeNull();
    expect(result?.successorRow?.id).toBe(200);
    expect(result?.alias.originalQueueId).toBe(100);
  });

  it('follows the alias chain transitively when the first successor itself was deleted', async () => {
    // 100 -> 200 (gone) -> 300 (live)
    queueStore.push({ id: 300, department: 'Cutting Table', inventoryItemId: 42, status: 'PENDING' });
    aliasStore.push({
      id: 'a1', originalQueueId: 100, successorQueueId: 200, inventoryItemId: 42,
      packetName: 'PKT-X', dueDateBucket: '2026-03-14', reason: 'merged',
      createdAt: new Date(), updatedAt: new Date(),
    });
    aliasStore.push({
      id: 'a2', originalQueueId: 200, successorQueueId: 300, inventoryItemId: 42,
      packetName: 'PKT-X', dueDateBucket: '2026-03-14', reason: 'replaced',
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await resolveAliasedQueueRow(100);
    expect(result?.successorRow?.id).toBe(300);
    // The "first alias" (the one matching the actually-printed id) is what
    // we hand back so callers can build the user-facing notice.
    expect(result?.alias.originalQueueId).toBe(100);
  });

  it('returns the alias with successorRow=null when the packet was unscheduled and never replaced', async () => {
    aliasStore.push({
      id: 'a1', originalQueueId: 100, successorQueueId: null, inventoryItemId: 42,
      packetName: 'PKT-X', dueDateBucket: '2026-03-14', reason: 'unscheduled',
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await resolveAliasedQueueRow(100);
    expect(result).not.toBeNull();
    expect(result?.successorRow).toBeNull();
    expect(result?.alias.reason).toBe('unscheduled');
  });

  it('returns successorRow=null when the recorded successor row is gone and no further alias exists', async () => {
    aliasStore.push({
      id: 'a1', originalQueueId: 100, successorQueueId: 999, inventoryItemId: 42,
      packetName: 'PKT-X', dueDateBucket: '2026-03-14', reason: 'merged',
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await resolveAliasedQueueRow(100);
    expect(result?.successorRow).toBeNull();
    // Still surfaces the original alias so the caller can report it as
    // "scheduled away" rather than emitting a generic 404.
    expect(result?.alias.originalQueueId).toBe(100);
  });

  it('terminates without infinite-looping if aliases form a cycle', async () => {
    // Pathological case: 100 -> 200 -> 100 (no live queue rows for either)
    aliasStore.push({
      id: 'a1', originalQueueId: 100, successorQueueId: 200, inventoryItemId: 42,
      packetName: 'PKT-X', dueDateBucket: '2026-03-14', reason: 'merged',
      createdAt: new Date(), updatedAt: new Date(),
    });
    aliasStore.push({
      id: 'a2', originalQueueId: 200, successorQueueId: 100, inventoryItemId: 42,
      packetName: 'PKT-X', dueDateBucket: '2026-03-14', reason: 'merged',
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await resolveAliasedQueueRow(100);
    // Cycle is broken; resolver returns the first alias with no live successor.
    expect(result).not.toBeNull();
    expect(result?.successorRow).toBeNull();
  });

  it('returns null for non-finite ids', async () => {
    expect(await resolveAliasedQueueRow(NaN)).toBeNull();
    expect(await resolveAliasedQueueRow(Infinity)).toBeNull();
  });
});

describe('boot ordering invariant: alias table must exist before duplicate-grouping backfill runs', () => {
  /**
   * Pin the boot ordering in server/index.ts so a future refactor can't
   * regress alias capture. The duplicate-grouping backfill consolidates
   * merged rows and writes alias mappings; if the alias table is created
   * AFTER the backfill, the inserts are silently swallowed and previously
   * printed `MFG-{queueId}-...` labels are permanently broken.
   *
   * This static-source test asserts that within the cutting boot block, the
   * `CREATE TABLE IF NOT EXISTS cutting_packet_barcode_aliases` statement
   * appears BEFORE the `runP2DuplicateCuttingBackfill` call.
   */
  it('CREATE TABLE cutting_packet_barcode_aliases precedes runP2DuplicateCuttingBackfill in server/index.ts', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const indexPath = path.resolve(__dirname, '..', 'index.ts');
    const src = await fs.readFile(indexPath, 'utf-8');
    const createIdx = src.indexOf('CREATE TABLE IF NOT EXISTS cutting_packet_barcode_aliases');
    const runIdx = src.indexOf('runP2DuplicateCuttingBackfill(pool)');
    expect(createIdx).toBeGreaterThan(-1);
    expect(runIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeLessThan(runIdx);
  });
});
