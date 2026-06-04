import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
    connect: vi.fn(),
    on: vi.fn(),
  })),
}));

vi.mock('multer', () => {
  const noop = (_req: unknown, _res: unknown, next: () => void) => next();
  function multerFn() {
    return { single: () => noop, array: () => noop, fields: () => noop, none: () => noop };
  }
  multerFn.memoryStorage = () => ({});
  multerFn.diskStorage = () => ({});
  return { default: multerFn };
});

vi.mock('../src/lib/azureDocumentIntelligence', () => ({
  extractTrainingContent: vi.fn(),
  extractTrainingMatrixData: vi.fn(),
}));

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

interface CapturedQuery {
  whereSql: string;
  whereParams: unknown[];
}

const captured: { p2Lookup: CapturedQuery | null; travelerStepsLookup: unknown } = {
  p2Lookup: null,
  travelerStepsLookup: null,
};
let capturedWhereRaw: unknown = null;

let foundItem: Record<string, unknown> | null = null;
const updates: Array<{ set: Record<string, unknown>; where: unknown }> = [];
const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

function renderSqlChunk(chunk: unknown): CapturedQuery {
  if (chunk && typeof chunk === 'object' && 'queryChunks' in (chunk as Record<string, unknown>)) {
    const parts = ((chunk as { queryChunks: unknown[] }).queryChunks) || [];
    let text = '';
    const params: unknown[] = [];
    for (const p of parts) {
      if (p && typeof p === 'object') {
        const pr = p as Record<string, unknown>;
        if (Array.isArray(pr.value) && pr.value.every((v) => typeof v === 'string')) {
          text += (pr.value as string[]).join('');
        } else if (typeof pr.value === 'string') {
          text += pr.value;
        } else if ('name' in pr && typeof pr.name === 'string') {
          text += pr.name;
        } else if ('value' in pr) {
          params.push(pr.value);
          text += '?';
        } else {
          text += JSON.stringify(pr);
        }
      } else if (typeof p === 'string') {
        text += p;
      }
    }
    return { whereSql: text, whereParams: params };
  }
  return { whereSql: String(chunk), whereParams: [] };
}

vi.mock('../db', () => {
  const db = {
    query: {
      p2SerializedItems: {
        findFirst: vi.fn(async ({ where }: { where: unknown }) => {
          captured.p2Lookup = renderSqlChunk(where);
          capturedWhereRaw = where;
          return foundItem;
        }),
      },
      travelerSteps: {
        findMany: vi.fn(async (arg: unknown) => {
          captured.travelerStepsLookup = arg;
          return [];
        }),
      },
    },
    update: vi.fn(() => ({
      set: (data: Record<string, unknown>) => ({
        where: (cond: unknown) => {
          updates.push({ set: data, where: cond });
          return Promise.resolve();
        },
      }),
    })),
    insert: vi.fn((table: { _?: { name?: string } }) => ({
      values: (data: Record<string, unknown>) => {
        const tableName =
          (table && (table as { _?: { name?: string } })._?.name) ||
          (table && (table as { tableName?: string }).tableName) ||
          'unknown';
        inserts.push({ table: tableName, values: data });
        return Promise.resolve();
      },
    })),
  };
  return { db };
});

beforeEach(() => {
  captured.p2Lookup = null;
  captured.travelerStepsLookup = null;
  foundItem = null;
  updates.length = 0;
  inserts.length = 0;
});

describe('syncP2SerializedItemOnStepComplete — whitespace/casing safety (Task #257)', () => {
  it('issues a LOWER(TRIM(...)) lookup that normalizes BOTH sides of the comparison', async () => {
    const mod = await import('../src/routes/travelers');
    await mod.syncP2SerializedItemOnStepComplete(
      { id: 't-1', serialNumber: '  STR2600118  ', partNumber: null },
      { departmentName: 'Layup', stepNumber: 1 },
      'system:test'
    );

    expect(captured.p2Lookup).not.toBeNull();
    const sqlText = (captured.p2Lookup as CapturedQuery).whereSql;
    expect(sqlText).toContain('LOWER(TRIM(');
    const lowerTrimCount = (sqlText.match(/LOWER\(TRIM\(/g) || []).length;
    expect(lowerTrimCount).toBeGreaterThanOrEqual(2);

    // Walk queryChunks to find the param value (trimmed, not raw with spaces).
    const chunks =
      capturedWhereRaw && typeof capturedWhereRaw === 'object'
        ? ((capturedWhereRaw as { queryChunks?: unknown[] }).queryChunks ?? [])
        : [];
    const paramValues: unknown[] = [];
    const visit = (n: unknown) => {
      if (typeof n === 'string' || typeof n === 'number') {
        paramValues.push(n);
        return;
      }
      if (!n || typeof n !== 'object') return;
      const r = n as Record<string, unknown>;
      if ('value' in r && (typeof r.value === 'string' || typeof r.value === 'number')) {
        paramValues.push(r.value);
      }
      if (Array.isArray(r.queryChunks)) r.queryChunks.forEach(visit);
    };
    chunks.forEach(visit);
    expect(paramValues).toContain('STR2600118');
    expect(paramValues).not.toContain('  STR2600118  ');
  });

  it('logs a warn and no-ops cleanly when no normalized match exists', async () => {
    foundItem = null;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('../src/routes/travelers');
    await mod.syncP2SerializedItemOnStepComplete(
      { id: 't-2', serialNumber: 'str2600999', partNumber: null },
      { departmentName: 'Layup', stepNumber: 1 },
      'system:test'
    );
    expect(updates.length).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
