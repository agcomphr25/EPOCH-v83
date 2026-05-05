/**
 * End-to-end endpoint integration test for the cutting work order grouping fix.
 *
 * Mounts each of the four real Express routers that schedule packet work to
 * the Cutting Table queue, then drives them in sequence via supertest:
 *
 *   1. POST /api/p2/schedule-items                        (P2 auto-sync)
 *   2. POST /api/cutting-table/bulk-schedule-to-cutting   (Schedule All POs)
 *   3. POST /api/cutting-table/schedule-to-cutting        (per-PO Schedule)
 *   4. POST /api/cutting-table-mfg-queue/sync-p2-demands  (manual sync)
 *
 * Hard invariants asserted:
 *   - After all four endpoints have run, exactly ONE PENDING
 *     manufacturing_queue row exists for the (Carbon Fiber Packet, due-date
 *     2026-05-20) bucket.  Its quantityRequested equals the sum of every
 *     contributor across all four paths.
 *   - Re-firing every endpoint a second time is fully idempotent — the row
 *     count, quantity, and contributor list stay constant.
 *
 * Mocking strategy
 * ----------------
 * The four routers run for real.  The DB layer (`server/db.ts`) and
 * `server/storage.ts` are mocked with an in-memory store so the routers
 * exercise their full bucketing/lookup logic but persist into a fixture we
 * can inspect.  drizzle-orm's query operators are wrapped in tagged objects
 * so the mock can replay where-clauses in JS; everything else from
 * drizzle-orm (pgTable, column types, etc.) is the real implementation so
 * the schema module loads normally.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

// ── Mock drizzle-orm operators as tagged objects ────────────────────────────

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    eq: (column: unknown, value: unknown) => ({
      __op: 'eq',
      column,
      value,
    }),
    and: (...conds: unknown[]) => ({
      __op: 'and',
      conds: conds.filter((c) => c !== undefined && c !== null),
    }),
    or: (...conds: unknown[]) => ({
      __op: 'or',
      conds: conds.filter((c) => c !== undefined && c !== null),
    }),
    ilike: (column: unknown, pattern: unknown) => ({
      __op: 'ilike',
      column,
      pattern,
    }),
    inArray: (column: unknown, values: unknown[]) => ({
      __op: 'inArray',
      column,
      values,
    }),
  };
});

// ── Hoisted shared store + db/pool mocks ────────────────────────────────────

const { store, dbMock, poolQueryMock, refreshSchemaMaps } = vi.hoisted(() => {
  type AnyRow = Record<string, unknown>;

  interface Store {
    manufacturingQueue: AnyRow[];
    nextMqId: number;
    inventoryItems: AnyRow[];
    cuttingPacketBOMs: AnyRow[];
    p2ProductionOrders: AnyRow[];
    p2PurchaseOrders: AnyRow[];
    p2SerializedItems: AnyRow[];
    reset: () => void;
  }

  const initial = (): Omit<Store, 'reset'> => ({
    manufacturingQueue: [],
    nextMqId: 1,
    inventoryItems: [],
    cuttingPacketBOMs: [],
    p2ProductionOrders: [],
    p2PurchaseOrders: [],
    p2SerializedItems: [],
  });

  const store = Object.assign(initial(), {
    reset(): void {
      Object.assign(store, initial());
    },
  }) as Store;

  // Map (drizzle column object → column name) per table, populated lazily.
  const columnMaps = new Map<unknown, Map<unknown, string>>();
  const tableMap = new Map<unknown, keyof Store>();

  const refreshSchemaMaps = async (): Promise<void> => {
    if (tableMap.size > 0) return;
    const schema = await import('../schema');
    const mappings: Array<[unknown, keyof Store]> = [
      [schema.manufacturingQueue, 'manufacturingQueue'],
      [schema.inventoryItems, 'inventoryItems'],
      [schema.cuttingPacketBOMs, 'cuttingPacketBOMs'],
      [schema.p2ProductionOrders, 'p2ProductionOrders'],
      [schema.p2PurchaseOrders, 'p2PurchaseOrders'],
      [schema.p2SerializedItems, 'p2SerializedItems'],
    ];
    for (const [table, key] of mappings) {
      tableMap.set(table, key);
      const cmap = new Map<unknown, string>();
      for (const colName of Object.keys(table as Record<string, unknown>)) {
        cmap.set((table as Record<string, unknown>)[colName], colName);
      }
      columnMaps.set(table, cmap);
    }
  };

  type Cond = {
    __op: 'eq' | 'and' | 'or' | 'ilike' | 'inArray';
    column?: unknown;
    value?: unknown;
    pattern?: unknown;
    values?: unknown[];
    conds?: Cond[];
  };

  const evalCond = (
    row: AnyRow,
    cond: Cond | null | undefined,
    cmap: Map<unknown, string>
  ): boolean => {
    if (!cond) return true;
    if (cond.__op === 'eq') {
      const colName = cmap.get(cond.column);
      if (!colName) return true;
      return row[colName] === cond.value;
    }
    if (cond.__op === 'and') {
      return (cond.conds ?? []).every((c) => evalCond(row, c, cmap));
    }
    if (cond.__op === 'or') {
      return (cond.conds ?? []).some((c) => evalCond(row, c, cmap));
    }
    if (cond.__op === 'ilike') {
      const colName = cmap.get(cond.column);
      if (!colName) return true;
      const val = String(row[colName] ?? '').toLowerCase();
      const rawPat = String(cond.pattern ?? '').toLowerCase();
      const startsPercent = rawPat.startsWith('%');
      const endsPercent = rawPat.endsWith('%');
      const inner = rawPat.replace(/^%/, '').replace(/%$/, '');
      if (startsPercent && endsPercent) return val.includes(inner);
      if (endsPercent) return val.startsWith(inner);
      if (startsPercent) return val.endsWith(inner);
      return val === inner;
    }
    if (cond.__op === 'inArray') {
      const colName = cmap.get(cond.column);
      if (!colName) return true;
      return (cond.values ?? []).includes(row[colName]);
    }
    return true;
  };

  const filterTable = (table: unknown, cond: Cond | null): AnyRow[] => {
    const key = tableMap.get(table);
    if (!key) return [];
    const rows = store[key] as AnyRow[];
    const cmap = columnMaps.get(table)!;
    return rows.filter((r) => evalCond(r, cond, cmap));
  };

  const fromBuilder = (table: unknown) => {
    let cond: Cond | null = null;
    let limitN: number | undefined;
    const exec = async (): Promise<AnyRow[]> => {
      await refreshSchemaMaps();
      let rows = filterTable(table, cond);
      if (limitN !== undefined) rows = rows.slice(0, limitN);
      return rows.map((r) => ({ ...r }));
    };
    const chain = {
      then<TResult1 = AnyRow[], TResult2 = never>(
        resolve?:
          | ((value: AnyRow[]) => TResult1 | PromiseLike<TResult1>)
          | null,
        reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ): Promise<TResult1 | TResult2> {
        return exec().then(resolve as never, reject as never);
      },
      where(c: Cond): typeof chain {
        cond = c;
        return chain;
      },
      limit(n: number): typeof chain {
        limitN = n;
        return chain;
      },
    };
    return chain;
  };

  const dbMock = {
    select: (_proj?: unknown) => ({
      from: (table: unknown) => fromBuilder(table),
    }),
    insert: (table: unknown) => ({
      values: (val: AnyRow) => ({
        returning: async (): Promise<AnyRow[]> => {
          await refreshSchemaMaps();
          const key = tableMap.get(table);
          if (!key) return [];
          const rows = store[key] as AnyRow[];
          let row: AnyRow;
          if (key === 'manufacturingQueue') {
            row = {
              id: store.nextMqId++,
              status: 'PENDING',
              quantityCompleted: 0,
              ...val,
            };
          } else if (key === 'inventoryItems') {
            row = { id: 9000 + rows.length, ...val };
          } else {
            row = { ...val };
          }
          rows.push(row);
          return [{ ...row }];
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (setVal: AnyRow) => {
        let cond: Cond | null = null;
        const builder = {
          where(c: Cond): typeof builder {
            cond = c;
            return builder;
          },
          returning: async (_proj?: unknown): Promise<AnyRow[]> => {
            await refreshSchemaMaps();
            const key = tableMap.get(table);
            if (!key) return [];
            const rows = store[key] as AnyRow[];
            const cmap = columnMaps.get(table)!;
            const updated: AnyRow[] = [];
            for (let i = 0; i < rows.length; i++) {
              if (evalCond(rows[i], cond, cmap)) {
                rows[i] = { ...rows[i], ...setVal };
                updated.push({ ...rows[i] });
              }
            }
            return updated;
          },
        };
        return builder;
      },
    }),
  };

  // pool.query is called by:
  //   1. helper.resolveInventoryItemId — hit by bulk-schedule-to-cutting and
  //      schedule-to-cutting (P2 path), which both call the helper without an
  //      explicit inventoryItemId.  Always return the seeded CF packet so all
  //      paths converge on the same inventoryItemId.
  //   2. schedule-to-cutting (P2 path) post-helper — looks up / updates a
  //      p2_production_orders row.  Return empty rows so the update path is a
  //      no-op (it isn't part of the grouping invariant under test).
  const poolQueryMock = vi.fn(
    async (
      sql: string,
      _params?: unknown[]
    ): Promise<unknown[] | { rows: unknown[] }> => {
      if (typeof sql === 'string' && sql.includes('inventory_items')) {
        const cfItem = store.inventoryItems.find(
          (i) =>
            i.isPacket === true &&
            typeof i.name === 'string' &&
            /carbon fiber/i.test(i.name as string)
        );
        return cfItem ? [{ id: cfItem.id }] : [];
      }
      if (typeof sql === 'string' && sql.includes('p2_production_orders')) {
        return { rows: [] };
      }
      return [];
    }
  );

  return { store, dbMock, poolQueryMock, refreshSchemaMaps };
});

vi.mock('../db', () => ({
  db: dbMock,
  pool: { query: poolQueryMock },
}));

vi.mock('../storage', () => ({
  storage: {},
}));

// ── Imports after mocks ─────────────────────────────────────────────────────

let app: Express;

beforeAll(async () => {
  // Force schema column maps to populate before any handler runs.
  await refreshSchemaMaps();

  app = express();
  app.use(express.json());

  const cuttingTableRouter = (await import('../src/routes/cuttingTable'))
    .default;
  const cuttingTableMfgQueueRouter = (
    await import('../src/routes/cuttingTableManufacturingQueue')
  ).default;
  const p2ScheduleItemsRouter = (await import('../src/routes/p2ScheduleItems'))
    .default;

  app.use('/api/cutting-table', cuttingTableRouter);
  app.use('/api/cutting-table-mfg-queue', cuttingTableMfgQueueRouter);
  // p2ScheduleItems registers the absolute path /api/p2/schedule-items, so
  // mount it at the root.
  app.use(p2ScheduleItemsRouter);
});

beforeEach(() => {
  store.reset();
  poolQueryMock.mockClear();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const DUE_DATE_ISO = '2026-05-20T00:00:00.000Z';
const DUE_DATE_DAY = '2026-05-20';

const dayKey = (d: Date | string | null): string => {
  if (!d) return 'null';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return 'null';
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    .toISOString()
    .slice(0, 10);
};

interface PendingRow {
  id: number;
  quantityRequested: number;
  notes: string | null;
  dueDate: Date | string | null;
  packetName: string;
  poNumbers: Array<{ poNumber: string; quantity: number }>;
}

const cfPendingRows = (): PendingRow[] => {
  const out: PendingRow[] = [];
  for (const row of store.manufacturingQueue) {
    if (row.status !== 'PENDING') continue;
    if (!row.notes) continue;
    let parsed: {
      isP2Packet?: boolean;
      packetName?: string;
      poNumbers?: unknown;
    };
    try {
      parsed = JSON.parse(row.notes as string);
    } catch {
      continue;
    }
    if (parsed.isP2Packet !== true) continue;
    const name = typeof parsed.packetName === 'string' ? parsed.packetName : '';
    if (!/carbon fiber/i.test(name)) continue;
    out.push({
      id: row.id as number,
      quantityRequested: row.quantityRequested as number,
      notes: row.notes as string,
      dueDate: row.dueDate as Date | string | null,
      packetName: name,
      poNumbers:
        (parsed.poNumbers as Array<{
          poNumber: string;
          quantity: number;
        }>) ?? [],
    });
  }
  return out;
};

// ── Fixture seeding ─────────────────────────────────────────────────────────

const CF_INVENTORY_ID = 100;
const CF_SKU = 'CF-PKT-1';
const CF_BOM_ID = 'bom-cf-1';
const PO_FROM_SCHEDULE_ITEMS = 'PO-2026-001';
const PO_FROM_SYNC = 'PO-2026-002';
const PO_FROM_PER_PO = 'PO-2026-003';
const PO_FROM_BULK = 'PO-2026-004';

const seedFixtures = (): void => {
  // Carbon Fiber packet inventory item
  store.inventoryItems.push({
    id: CF_INVENTORY_ID,
    name: 'Carbon Fiber Packet',
    agPartNumber: CF_SKU,
    category: 'packet',
    isPacket: true,
    quantityInStock: 0,
  });

  // Active Carbon Fiber BOM keyed off the SKU
  store.cuttingPacketBOMs.push({
    id: CF_BOM_ID,
    partNumber: CF_SKU,
    packetType: 'Carbon Fiber Packet',
    isActive: true,
  });

  // P2 PO 1000: the schedule-items endpoint will move serialized items for it
  // and the route will then read this PO's PENDING production orders for cutting.
  store.p2PurchaseOrders.push({ id: 1000, poNumber: PO_FROM_SCHEDULE_ITEMS });
  store.p2PurchaseOrders.push({ id: 2000, poNumber: PO_FROM_SYNC });

  // P2 production order for PO 1000 — sits in 'Layup' with a packet partName so
  // schedule-items' cutting filter picks it up.  p2PoItemId = 11.
  store.p2ProductionOrders.push({
    id: 5001,
    p2PoId: 1000,
    p2PoItemId: 11,
    sku: CF_SKU,
    partName: 'Carbon Fiber Packet',
    department: 'Layup',
    status: 'PENDING',
    dueDate: DUE_DATE_ISO,
    quantity: 3,
  });

  // P2 production order for PO 2000 — sits in 'Cutting Table' so the
  // sync-p2-demands route picks it up.  p2PoItemId = 22.
  store.p2ProductionOrders.push({
    id: 5002,
    p2PoId: 2000,
    p2PoItemId: 22,
    sku: CF_SKU,
    partName: 'Carbon Fiber Packet',
    department: 'Cutting Table',
    status: 'PENDING',
    dueDate: DUE_DATE_ISO,
    quantity: 5,
  });

  // P2 serialized item in 'Pending Layup' — the schedule-items endpoint will
  // move it to 'Layup' and use its poId to find production orders to bucket.
  store.p2SerializedItems.push({
    id: 7001,
    poId: 1000,
    status: 'ACTIVE',
    currentDepartment: 'Pending Layup',
  });
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Cutting work order grouping — endpoint integration (Done #2)', () => {
  it('all four scheduling endpoints converge to one PENDING row per packet+bucket', async () => {
    seedFixtures();

    // ── Path 1: POST /api/p2/schedule-items ─────────────────────────────────
    // Moves serialized item 7001 (poId=1000) to Layup, then bucketizes the
    // production orders for PO 1000 → contributes p2PoItemId=11, qty=3.
    const r1 = await request(app)
      .post('/api/p2/schedule-items')
      .send({ itemIds: [7001] });
    expect(r1.status).toBe(200);
    expect(r1.body.success).toBe(true);
    expect(r1.body.scheduled).toBe(1);
    expect(r1.body.cuttingTableDemands).toBe(1);

    let pending = cfPendingRows().filter(
      (r) => dayKey(r.dueDate) === DUE_DATE_DAY
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].quantityRequested).toBe(3);

    // ── Path 2: POST /api/cutting-table/bulk-schedule-to-cutting ────────────
    // Caller-supplied items shape (one PO contributing 4 units).  The helper
    // will resolve the inventoryItemId via pool.query and merge into the
    // existing row from path 1.
    const r2 = await request(app)
      .post('/api/cutting-table/bulk-schedule-to-cutting')
      .send({
        packetType: 'Carbon Fiber Packet',
        materialType: 'p2_carbon_fiber_packet',
        dueDate: DUE_DATE_ISO,
        items: [
          {
            poNumber: PO_FROM_BULK,
            quantity: 4,
            p2PoItemId: 33,
            p2PoId: 4000,
          },
        ],
      });
    expect(r2.status).toBe(201);
    expect(r2.body.grouped).toBe(true);
    expect(r2.body.mergedIntoExisting).toBe(true);
    expect(r2.body.addedQuantity).toBe(4);

    pending = cfPendingRows().filter((r) => dayKey(r.dueDate) === DUE_DATE_DAY);
    expect(pending).toHaveLength(1);
    expect(pending[0].quantityRequested).toBe(7); // 3 + 4

    // ── Path 3: POST /api/cutting-table/schedule-to-cutting (per-PO) ────────
    // source=P2 with materialType=p2_* triggers the helper-routed path.
    // Per-PO leaves p2PoItemId null and dedupes by poNumber.
    const r3 = await request(app)
      .post('/api/cutting-table/schedule-to-cutting')
      .send({
        source: 'P2',
        materialType: 'p2_carbon_fiber_packet',
        packetName: 'Carbon Fiber Packet',
        poNumber: PO_FROM_PER_PO,
        orderId: 'P2-9999',
        quantity: 2,
        priority: 50,
        dueDate: DUE_DATE_ISO,
      });
    expect(r3.status).toBe(201);
    expect(r3.body.grouped).toBe(true);
    expect(r3.body.mergedIntoExisting).toBe(true);
    expect(r3.body.addedQuantity).toBe(2);

    pending = cfPendingRows().filter((r) => dayKey(r.dueDate) === DUE_DATE_DAY);
    expect(pending).toHaveLength(1);
    expect(pending[0].quantityRequested).toBe(9); // 3 + 4 + 2

    // ── Path 4: POST /api/cutting-table-mfg-queue/sync-p2-demands ───────────
    // Reads p2_production_orders WHERE department='Cutting Table' AND
    // status='PENDING' — sees order 5002 (p2PoItemId=22, qty=5) which the
    // other paths haven't touched.
    const r4 = await request(app)
      .post('/api/cutting-table-mfg-queue/sync-p2-demands')
      .send({});
    expect(r4.status).toBe(200);
    expect(r4.body.merged + r4.body.created).toBeGreaterThanOrEqual(1);

    pending = cfPendingRows().filter((r) => dayKey(r.dueDate) === DUE_DATE_DAY);

    // HARD INVARIANT: exactly one PENDING grouped row for this packet+bucket.
    expect(pending).toHaveLength(1);

    // The row must hold the sum of every contributor across all four paths.
    expect(pending[0].quantityRequested).toBe(3 + 4 + 2 + 5);

    // Contributors must be deduplicated by p2PoItemId (or by poNumber when
    // p2PoItemId is null), so the four POs each appear exactly once.
    const poNumbers = pending[0].poNumbers.map((p) => p.poNumber).sort();
    expect(poNumbers).toEqual(
      [
        PO_FROM_SCHEDULE_ITEMS,
        PO_FROM_SYNC,
        PO_FROM_PER_PO,
        PO_FROM_BULK,
      ].sort()
    );
  });

  it('re-running every endpoint after the first round is fully idempotent', async () => {
    seedFixtures();

    // First round — populate the row across all four paths.
    await request(app)
      .post('/api/p2/schedule-items')
      .send({ itemIds: [7001] });
    await request(app)
      .post('/api/cutting-table/bulk-schedule-to-cutting')
      .send({
        packetType: 'Carbon Fiber Packet',
        materialType: 'p2_carbon_fiber_packet',
        dueDate: DUE_DATE_ISO,
        items: [
          {
            poNumber: PO_FROM_BULK,
            quantity: 4,
            p2PoItemId: 33,
            p2PoId: 4000,
          },
        ],
      });
    await request(app).post('/api/cutting-table/schedule-to-cutting').send({
      source: 'P2',
      materialType: 'p2_carbon_fiber_packet',
      packetName: 'Carbon Fiber Packet',
      poNumber: PO_FROM_PER_PO,
      orderId: 'P2-9999',
      quantity: 2,
      priority: 50,
      dueDate: DUE_DATE_ISO,
    });
    await request(app)
      .post('/api/cutting-table-mfg-queue/sync-p2-demands')
      .send({});

    const beforeRows = cfPendingRows().filter(
      (r) => dayKey(r.dueDate) === DUE_DATE_DAY
    );
    expect(beforeRows).toHaveLength(1);
    const expectedQty = beforeRows[0].quantityRequested; // 3 + 4 + 2 + 5
    const expectedContribCount = beforeRows[0].poNumbers.length;

    // Second round — same calls, in the same order.  Schedule-items will
    // update its serialized item to 'Layup' on the first round, so the second
    // round's UPDATE matches zero rows; no production orders will be re-
    // bucketed.  Bulk + per-PO + sync-p2-demands will all see duplicate
    // p2PoItemIds (or poNumbers) and merge zero new quantity.
    await request(app)
      .post('/api/p2/schedule-items')
      .send({ itemIds: [7001] });
    await request(app)
      .post('/api/cutting-table/bulk-schedule-to-cutting')
      .send({
        packetType: 'Carbon Fiber Packet',
        materialType: 'p2_carbon_fiber_packet',
        dueDate: DUE_DATE_ISO,
        items: [
          {
            poNumber: PO_FROM_BULK,
            quantity: 4,
            p2PoItemId: 33,
            p2PoId: 4000,
          },
        ],
      });
    await request(app).post('/api/cutting-table/schedule-to-cutting').send({
      source: 'P2',
      materialType: 'p2_carbon_fiber_packet',
      packetName: 'Carbon Fiber Packet',
      poNumber: PO_FROM_PER_PO,
      orderId: 'P2-9999',
      quantity: 2,
      priority: 50,
      dueDate: DUE_DATE_ISO,
    });
    await request(app)
      .post('/api/cutting-table-mfg-queue/sync-p2-demands')
      .send({});

    const afterRows = cfPendingRows().filter(
      (r) => dayKey(r.dueDate) === DUE_DATE_DAY
    );

    // Idempotent: still exactly one PENDING row, same quantity, same
    // contributor count.  No duplicate cutting work orders were created.
    expect(afterRows).toHaveLength(1);
    expect(afterRows[0].id).toBe(beforeRows[0].id);
    expect(afterRows[0].quantityRequested).toBe(expectedQty);
    expect(afterRows[0].poNumbers).toHaveLength(expectedContribCount);
  });
});
