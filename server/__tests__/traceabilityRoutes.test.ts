/**
 * HTTP integration tests for the Material Traceability Viewer (Task #147).
 *
 * Exercises the `/api/traceability/*` Express routes end-to-end with the
 * service layer mocked, so we can prove:
 *   - All 8 search keys round-trip through /search → service.buildTraceabilityChain
 *   - Unknown / empty keys are rejected with 400
 *   - /verify returns the verification result, including pass and tampered cases
 *   - /:key/:value/export?format=csv returns the CSV with the embedded
 *     SHA-256 manifest line and the matching X-Trace-Sha256 header
 *   - The branching tree is preserved end-to-end (root + edges)
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../middleware/requirePermission', () => ({
  requirePermission: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../src/services/traceabilityService', async () => {
  const actual = await vi.importActual<typeof import('../src/services/traceabilityService')>(
    '../src/services/traceabilityService',
  );
  return {
    ...actual,
    buildTraceabilityChain: vi.fn(),
    verifyChain: vi.fn(),
    verifyChainByIds: vi.fn(),
    buildChainFromEntryIds: vi.fn(),
  };
});

import {
  buildChainFromEntryIds,
  buildTraceabilityChain,
  verifyChain,
  verifyChainByIds,
  buildGenealogy,
  exportChainCsv,
  TRACEABILITY_MANIFEST_PREFIX,
  TRACEABILITY_SEARCH_KEYS,
  type TraceabilityChain,
  type TraceabilityNode,
} from '../src/services/traceabilityService';

function makeNode(overrides: Partial<TraceabilityNode> = {}): TraceabilityNode {
  return {
    id: 'n1',
    transactionNumber: 'ITL-1',
    step: 'RECEIVED',
    transactionType: 'RECEIVE',
    occurredAt: '2025-01-01T00:00:00.000Z',
    agPartNumber: 'AG-100',
    partName: 'Test Part',
    lotId: 'lot-1',
    lotIcn: 'ICN-MAT-1',
    locationId: 'STAGE',
    quantityDelta: '10.0000',
    quantityBefore: '0.0000',
    quantityAfter: '10.0000',
    unitOfMeasure: 'EA',
    statusBefore: null,
    statusAfter: 'RECEIVED',
    performedByDisplayName: 'glennj',
    performedByUserId: 1,
    approvedByUserId: 7,
    approvedByDisplayName: 'qa-supervisor',
    approvalId: 'approval-uuid',
    digitalSignatureId: 'sig-uuid',
    travelerId: null,
    travelerNumber: null,
    travelerStepId: null,
    travelerStepName: null,
    productionWorkOrderId: null,
    workOrderNumber: null,
    chargeCodeId: null,
    chargeCode: null,
    projectId: null,
    projectName: null,
    reasonCode: null,
    notes: null,
    sourceModule: 'receiving',
    sourceRecordId: 'r1',
    sourceLink: { module: 'receiving', recordId: 'r1', href: '/inventory/receiving?receiptId=r1', label: 'Receiving record' },
    ledgerLink: '/inventory/ledger?id=n1',
    eventHash: 'abc',
    reversedTransactionId: null,
    metadata: null,
    branchKey: 'lot-1::no-job',
    ...overrides,
  };
}

function makeChain(nodes: TraceabilityNode[]): TraceabilityChain {
  // Pre-compute branches for the mocked return — mirrors what the real
  // service would compute via buildBranchesAndEdges.
  const byBranch = new Map<string, TraceabilityNode[]>();
  for (const n of nodes) {
    const arr = byBranch.get(n.branchKey) ?? [];
    arr.push(n);
    byBranch.set(n.branchKey, arr);
  }
  const branches = [...byBranch.entries()].map(([key, list]) => ({
    key,
    label: key,
    rootIds: [list[0].id],
    nodeIds: list.map((n) => n.id),
  }));
  const edges = [...byBranch.values()].flatMap((list) =>
    list.slice(1).map((n, i) => ({ from: list[i].id, to: n.id, kind: 'lineage' as const })),
  );
  const genealogy = buildGenealogy(nodes);
  return {
    query: { key: 'lotIcn', value: 'ICN-MAT-1' },
    resolved: { label: 'Lot ICN-MAT-1', matchedEntities: [] },
    nodes,
    edges,
    branches,
    genealogy,
    ncrs: [],
    generatedAt: '2025-01-01T00:00:00.000Z',
  };
}

async function makeApp() {
  const app = express();
  app.use(express.json());
  const router = (await import('../src/routes/traceability')).default;
  app.use('/api/traceability', router);
  return app;
}

describe('Material Traceability HTTP routes (Task #147)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetModules();
  });

  // ─────────────────────────────────────────────────────────────────────
  // /search — 400 validation + 200 happy path for each of the 8 keys
  // ─────────────────────────────────────────────────────────────────────

  it('GET /requirements returns the department traceability matrix', async () => {
    const app = await makeApp();
    const res = await request(app).get('/api/traceability/requirements');
    expect(res.status).toBe(200);
    expect(res.body.requirements).toEqual([
      { department: 'Layup', requiredTraceability: ['ICN', 'lot', 'expiration', 'out-time'] },
      { department: 'CNC', requiredTraceability: ['serial'] },
      { department: 'Finish', requiredTraceability: ['batch number'] },
      { department: 'QC', requiredTraceability: ['cert package'] },
    ]);
    expect(res.body.generatedAt).toBeDefined();
  });

  it('GET /search rejects an unknown key with 400', async () => {
    const app = await makeApp();
    const res = await request(app).get('/api/traceability/search?key=bogusKey&value=x');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(buildTraceabilityChain).not.toHaveBeenCalled();
  });

  it('GET /search rejects an empty value with 400', async () => {
    const app = await makeApp();
    const res = await request(app).get('/api/traceability/search?key=lotIcn&value=');
    expect(res.status).toBe(400);
    expect(buildTraceabilityChain).not.toHaveBeenCalled();
  });

  for (const key of TRACEABILITY_SEARCH_KEYS) {
    it(`GET /search accepts the "${key}" anchor and returns the chain`, async () => {
      const app = await makeApp();
      vi.mocked(buildTraceabilityChain).mockResolvedValueOnce(makeChain([makeNode()]));
      const res = await request(app).get(
        `/api/traceability/search?key=${encodeURIComponent(key)}&value=ANY`,
      );
      expect(res.status).toBe(200);
      expect(buildTraceabilityChain).toHaveBeenCalledWith({ key, value: 'ANY' });
      expect(res.body.nodes).toHaveLength(1);
      expect(res.body.branches[0].rootIds).toEqual(['n1']);
    });
  }

  it('GET /search preserves branching with multiple branches and lineage edges', async () => {
    const app = await makeApp();
    const nodes = [
      makeNode({ id: 'a', branchKey: 'lot-1::trv-A' }),
      makeNode({ id: 'b', branchKey: 'lot-1::trv-A', occurredAt: '2025-01-02T00:00:00.000Z' }),
      makeNode({ id: 'c', branchKey: 'lot-1::trv-B', occurredAt: '2025-01-03T00:00:00.000Z' }),
    ];
    vi.mocked(buildTraceabilityChain).mockResolvedValueOnce(makeChain(nodes));
    const res = await request(app).get('/api/traceability/search?key=lotIcn&value=ICN-MAT-1');
    expect(res.status).toBe(200);
    expect(res.body.branches).toHaveLength(2);
    expect(res.body.edges).toEqual(
      expect.arrayContaining([{ from: 'a', to: 'b', kind: 'lineage' }]),
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // /verify — pass and tampered fixture paths
  // ─────────────────────────────────────────────────────────────────────

  it('POST /verify operates on the displayed snapshot when entryIds are provided (does NOT rebuild from key/value)', async () => {
    const app = await makeApp();
    vi.mocked(verifyChainByIds).mockResolvedValueOnce({
      checked: 2,
      ok: true,
      mismatches: [],
      verifiedAt: '2025-01-01T00:00:00.000Z',
    });
    const res = await request(app)
      .post('/api/traceability/verify')
      // key/value here intentionally differs from a hypothetical re-resolved
      // chain — the route must verify the entryIds we shipped, not refetch.
      .send({ entryIds: ['n1', 'n2'], key: 'lotIcn', value: 'ANYTHING' });
    expect(res.status).toBe(200);
    expect(verifyChainByIds).toHaveBeenCalledWith(['n1', 'n2']);
    expect(buildTraceabilityChain).not.toHaveBeenCalled();
    expect(verifyChain).not.toHaveBeenCalled();
    expect(res.body.checked).toBe(2);
    expect(res.body.ok).toBe(true);
  });

  it('POST /verify falls back to key/value when no entryIds are provided (back-compat)', async () => {
    const app = await makeApp();
    vi.mocked(buildTraceabilityChain).mockResolvedValueOnce(makeChain([makeNode()]));
    vi.mocked(verifyChain).mockResolvedValueOnce({
      checked: 1,
      ok: false,
      mismatches: [{ id: 'n1', transactionNumber: 'ITL-1', expectedHash: 'aaa', actualHash: 'zzz' }],
      verifiedAt: '2025-01-01T00:00:00.000Z',
    });
    const res = await request(app)
      .post('/api/traceability/verify')
      .send({ key: 'lotIcn', value: 'ICN-MAT-1' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.mismatches[0].id).toBe('n1');
  });

  it('POST /verify rejects an invalid body with 400', async () => {
    const app = await makeApp();
    const res = await request(app).post('/api/traceability/verify').send({ key: 'bogus' });
    expect(res.status).toBe(400);
  });

  // ─────────────────────────────────────────────────────────────────────
  // /:key/:value/export — CSV with embedded SHA-256 manifest
  // ─────────────────────────────────────────────────────────────────────

  it('GET /:key/:value/export?format=csv returns CSV with the embedded SHA manifest', async () => {
    const app = await makeApp();
    const chain = makeChain([makeNode({ id: 'n1' }), makeNode({ id: 'n2', occurredAt: '2025-01-02T00:00:00.000Z' })]);
    vi.mocked(buildTraceabilityChain).mockResolvedValueOnce(chain);

    const res = await request(app).get('/api/traceability/lotIcn/ICN-MAT-1/export?format=csv');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('traceability-lotIcn-ICN-MAT-1');

    const expected = exportChainCsv(chain);
    expect(res.text.startsWith(TRACEABILITY_MANIFEST_PREFIX)).toBe(true);
    // Compare hashable data section (manifest line carries a wall-clock
    // generatedAt that differs between calls).
    const data = (s: string) => s.slice(s.indexOf('\n') + 1);
    expect(data(res.text)).toEqual(data(expected.csv));
    expect(res.headers['x-trace-sha256']).toEqual(expected.manifest.sha256);
    expect(res.headers['x-trace-row-count']).toBe('2');

    // Inline manifest line must also embed the same sha256 as the header.
    const firstLine = res.text.split('\n')[0];
    const inlineManifest = JSON.parse(firstLine.slice(TRACEABILITY_MANIFEST_PREFIX.length).trim());
    expect(inlineManifest.sha256).toEqual(expected.manifest.sha256);
    expect(inlineManifest.rowCount).toBe(2);
  });

  it('GET /:key/:value/export rejects unknown keys with 400', async () => {
    const app = await makeApp();
    const res = await request(app).get('/api/traceability/bogus/x/export');
    expect(res.status).toBe(400);
    expect(buildTraceabilityChain).not.toHaveBeenCalled();
  });

  it('POST /:key/:value/export exports the displayed snapshot via entryIds (does NOT rebuild)', async () => {
    const app = await makeApp();
    const snapshot = makeChain([makeNode({ id: 'snap-1' })]);
    vi.mocked(buildChainFromEntryIds).mockResolvedValueOnce(snapshot);
    const expected = exportChainCsv(snapshot);

    const res = await request(app)
      .post('/api/traceability/lotIcn/ICN-MAT-1/export?format=csv')
      .send({ entryIds: ['snap-1'] });

    expect(res.status).toBe(200);
    expect(buildChainFromEntryIds).toHaveBeenCalledWith(
      ['snap-1'],
      { key: 'lotIcn', value: 'ICN-MAT-1' },
      expect.any(String),
    );
    expect(buildTraceabilityChain).not.toHaveBeenCalled();
    expect(res.headers['x-trace-sha256']).toEqual(expected.manifest.sha256);
    expect(res.headers['x-trace-row-count']).toBe('1');
    expect(res.text.startsWith(TRACEABILITY_MANIFEST_PREFIX)).toBe(true);
  });
});
