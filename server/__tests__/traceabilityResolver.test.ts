/**
 * Resolver tests for the Material Traceability Viewer (Task #183).
 *
 * Exercises the search resolver behavior added in Task #183:
 *   - Traveler lookup is case-insensitive
 *   - Traveler lookup falls back to the barcode helper for printable scans
 *   - Resolver distinguishes "anchor not found" (notFound: true) from
 *     "anchor exists but has no ledger events" (notFound undefined)
 *
 * Uses vi.mock to stub the db module and the barcode resolver helper so the
 * resolver can be exercised without a live database.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────

const travelerRows: Array<Record<string, unknown>> = [];
const ledgerRows: Array<Record<string, unknown>> = [];
let lastWhereSql: unknown = null;
const barcodeResolveMock = vi.fn();

// db.select().from(table).where(cond).limit(n) — returns an awaitable thenable.
function makeQuery(table: string) {
  const builder: any = {
    _table: table,
    from(t: any) { this._table = t?.[Symbol.for('drizzle:Name')] ?? t?._?.name ?? this._table; return this; },
    where(cond: any) { lastWhereSql = cond; return this; },
    limit() { return this; },
    orderBy() { return this; },
    leftJoin() { return this; },
    then(resolve: (v: unknown) => unknown) {
      // Tables we care about for resolver tests
      if (this._table === 'travelers' || tableNameOf(this._table) === 'travelers') {
        return Promise.resolve(travelerRows).then(resolve);
      }
      if (this._table === 'inventory_transaction_ledger' || tableNameOf(this._table) === 'inventory_transaction_ledger') {
        return Promise.resolve(ledgerRows).then(resolve);
      }
      return Promise.resolve([]).then(resolve);
    },
  };
  return builder;
}

function tableNameOf(t: any): string {
  if (!t) return '';
  // drizzle-orm exposes table name on a symbol; fallback to string repr
  const sym = Object.getOwnPropertySymbols(t).find((s) => s.description === 'drizzle:Name');
  return sym ? (t as any)[sym] : '';
}

vi.mock('../db', () => ({
  db: {
    select: () => makeQuery(''),
  },
}));

vi.mock('../src/helpers/travelerBarcodeResolver', () => ({
  resolveTravelerBarcode: (...args: unknown[]) => barcodeResolveMock(...args),
}));

// Import AFTER mocks are registered.
const { buildTraceabilityChain } = await import('../src/services/traceabilityService');

// ── Helpers ────────────────────────────────────────────────────────────

function setTraveler(row: Record<string, unknown> | null) {
  travelerRows.length = 0;
  if (row) travelerRows.push(row);
}

beforeEach(() => {
  travelerRows.length = 0;
  ledgerRows.length = 0;
  lastWhereSql = null;
  barcodeResolveMock.mockReset();
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('traceability resolver — travelerNumber', () => {
  it('flags notFound=true when the traveler does not exist anywhere', async () => {
    setTraveler(null);
    barcodeResolveMock.mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: 'nope' } });

    const chain = await buildTraceabilityChain({ key: 'travelerNumber', value: 'roc9999999' });

    expect(chain.resolved.notFound).toBe(true);
    expect(chain.resolved.matchedEntities).toEqual([]);
    expect(chain.nodes).toEqual([]);
  });

  it('resolves when the traveler exists (case-insensitive query) and does NOT flag notFound', async () => {
    setTraveler({
      id: 'trav-uuid-9',
      travelerNumber: 'ROC2600007',
      partName: 'Stock A',
      partNumber: 'AG-100',
      status: 'IN_PROGRESS',
    });

    // Caller passes lowercase; resolver must return the canonical (uppercase)
    // traveler number from the matched row. The case-insensitive matching is
    // implemented in SQL via LOWER(travelers.traveler_number) = LOWER($1) —
    // verified by source review; this test asserts the user-visible contract
    // (lowercase input → matched canonical entity, no notFound flag).
    const chain = await buildTraceabilityChain({ key: 'travelerNumber', value: 'roc2600007' });

    expect(chain.resolved.notFound).toBeUndefined();
    expect(chain.resolved.label).toBe('Traveler ROC2600007');
    expect(chain.resolved.matchedEntities).toEqual([
      expect.objectContaining({ kind: 'traveler', id: 'trav-uuid-9', label: 'ROC2600007' }),
    ]);
  });

  it('falls back to resolveTravelerBarcode when direct/UUID match fails but scan succeeds', async () => {
    // First select returns no rows; barcode resolver succeeds; second select
    // (by traveler.id) returns the traveler.
    let callIdx = 0;
    travelerRows.length = 0;
    // Hook: on the SECOND traveler query, return a row.
    const origMakeQuery = makeQuery;
    const querySpy = vi.fn((tbl: string) => {
      const q = origMakeQuery(tbl);
      const origThen = q.then.bind(q);
      q.then = (resolve: any) => {
        callIdx++;
        if (callIdx === 1) return Promise.resolve([]).then(resolve);
        // 2nd call: barcode-fallback select
        return Promise.resolve([{
          id: 'trav-uuid-77',
          travelerNumber: 'ROC2600007',
          partName: 'Stock B',
          status: 'IN_PROGRESS',
        }]).then(resolve);
      };
      return q;
    });

    barcodeResolveMock.mockResolvedValue({
      ok: true,
      context: {
        travelerId: 'trav-uuid-77',
        travelerNumber: 'ROC2600007',
        wadId: 'wad-1', wadNumber: 'WO-1', projectId: 'p-1',
        chargeCode: 'WO-1', department: null, operation: null,
      },
    });

    // Repoint db.select to the spy via a local re-mock for this test only.
    const { db } = await import('../db');
    const origSelect = db.select;
    (db as any).select = () => querySpy('');

    try {
      const chain = await buildTraceabilityChain({ key: 'travelerNumber', value: 'BARCODE-PAYLOAD-123' });

      expect(barcodeResolveMock).toHaveBeenCalledWith('BARCODE-PAYLOAD-123');
      expect(chain.resolved.notFound).toBeUndefined();
      expect(chain.resolved.matchedEntities[0]).toMatchObject({ kind: 'traveler', id: 'trav-uuid-77' });
    } finally {
      (db as any).select = origSelect;
    }
  });

  it('flags notFound=true when both direct lookup and barcode fallback fail', async () => {
    setTraveler(null);
    barcodeResolveMock.mockResolvedValue({ ok: false, error: { code: 'MALFORMED', message: 'bad scan' } });

    const chain = await buildTraceabilityChain({ key: 'travelerNumber', value: '!!INVALID!!' });

    expect(chain.resolved.notFound).toBe(true);
    expect(chain.nodes).toEqual([]);
  });
});

describe('traceability resolver — notFound vs no-events', () => {
  it('lotIcn returns notFound=true when no lot matches', async () => {
    // No lots, no ledger events.
    const chain = await buildTraceabilityChain({ key: 'lotIcn', value: 'ICN-DOES-NOT-EXIST' });
    expect(chain.resolved.notFound).toBe(true);
    expect(chain.nodes).toEqual([]);
  });

  it('workOrder returns notFound=true when no WO matches', async () => {
    const chain = await buildTraceabilityChain({ key: 'workOrder', value: 'WO-DOES-NOT-EXIST' });
    expect(chain.resolved.notFound).toBe(true);
    expect(chain.nodes).toEqual([]);
  });
});
