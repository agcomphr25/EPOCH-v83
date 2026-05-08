/**
 * Tests for the Material Traceability Viewer (Task #147, Phase 3).
 *
 * Exercises the pure helpers (no DB needed):
 *   - mapTransactionToStep: ledger transaction enum → narrative step
 *   - deriveSourceLink:     source_module → front-end href + label
 *   - buildBranchesAndEdges: branch grouping, lineage chaining,
 *                            cross-branch REVERSAL edges, root detection
 *   - exportChainCsv:       deterministic CSV + SHA-256 manifest, RFC-4180
 *                           escaping, column ordering, tampering detection
 *   - verifyChainNodes:     pure hash recomputation against fixture rows
 *                            (clean fixture passes, tampered fixture fails)
 */

import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  buildBranchesAndEdges,
  deriveSourceLink,
  exportChainCsv,
  mapTransactionToStep,
  recomputeEventHash,
  verifyChainNodes,
  TRACEABILITY_MANIFEST_PREFIX,
  TRACEABILITY_SEARCH_KEYS,
  type TraceabilityChain,
  type TraceabilityNode,
} from '../src/services/traceabilityService';
import type { InventoryTransactionLedger } from '../schema';

// ─────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────

function node(overrides: Partial<TraceabilityNode>): TraceabilityNode {
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
    approvedByUserId: null,
    approvedByDisplayName: null,
    approvalId: null,
    digitalSignatureId: null,
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

function chain(nodes: TraceabilityNode[]): TraceabilityChain {
  const { edges, branches } = buildBranchesAndEdges(nodes);
  return {
    query: { key: 'lotIcn', value: 'ICN-MAT-1' },
    resolved: { label: 'Lot ICN-MAT-1', matchedEntities: [] },
    nodes,
    edges,
    branches,
    ncrs: [],
    generatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function ledgerRow(overrides: Partial<InventoryTransactionLedger>): InventoryTransactionLedger {
  const base = {
    id: 'row-1',
    transactionNumber: 'ITL-1',
    transactionType: 'RECEIVE',
    inventoryItemId: 1,
    agPartNumber: 'AG-100',
    lotId: 'lot-1',
    locationId: 'STAGE',
    quantityDelta: '10.0000',
    quantityBefore: '0.0000',
    quantityAfter: '10.0000',
    unitOfMeasure: 'EA',
    statusBefore: null,
    statusAfter: 'RECEIVED',
    performedByUserId: 1,
    performedByDisplayName: 'glennj',
    approvedByUserId: null,
    approvedByDisplayName: null,
    approvalId: null,
    projectId: null,
    productionWorkOrderId: null,
    travelerId: null,
    travelerStepId: null,
    chargeCodeId: null,
    reasonCode: null,
    notes: null,
    digitalSignatureId: null,
    sourceModule: 'receiving',
    sourceRecordId: 'r1',
    eventHash: '',
    reversedTransactionId: null,
    metadata: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
  } as InventoryTransactionLedger;
  const merged = { ...base, ...overrides } as InventoryTransactionLedger;
  if (overrides.eventHash === undefined) merged.eventHash = recomputeEventHash(merged);
  return merged;
}

// ─────────────────────────────────────────────────────────────────────
// mapTransactionToStep
// ─────────────────────────────────────────────────────────────────────

describe('mapTransactionToStep', () => {
  const cases: Array<[string, string]> = [
    ['RECEIVE', 'RECEIVED'],
    ['MOVE', 'PUT_AWAY'],
    ['TRANSFER', 'TRANSFERRED'],
    ['RESERVE', 'RESERVED'],
    ['UNRESERVE', 'UNRESERVED'],
    ['ISSUE', 'ISSUED'],
    ['CONSUME', 'CONSUMED'],
    ['STATUS_CHANGE', 'STATUS_CHANGED'],
    ['QUARANTINE', 'QUARANTINED'],
    ['RELEASE', 'RELEASED'],
    ['SCRAP', 'SCRAPPED'],
    ['ADJUST', 'ADJUSTED'],
    ['COUNT_ADJUSTMENT', 'COUNT_ADJUSTED'],
    ['SPLIT', 'SPLIT'],
    ['MERGE', 'MERGED'],
    ['EXPIRE', 'EXPIRED'],
    ['RETURN', 'RETURNED'],
    ['REVERSAL', 'REVERSED'],
  ];
  for (const [input, expected] of cases) {
    it(`maps ${input} → ${expected}`, () => {
      expect(mapTransactionToStep(input)).toBe(expected);
    });
  }
  it('falls back to STATUS_CHANGED for unknown types', () => {
    expect(mapTransactionToStep('UNKNOWN_FUTURE_TYPE')).toBe('STATUS_CHANGED');
  });
});

// ─────────────────────────────────────────────────────────────────────
// deriveSourceLink
// ─────────────────────────────────────────────────────────────────────

describe('deriveSourceLink', () => {
  it('returns a receiving deep-link with the receipt id', () => {
    const l = deriveSourceLink('receiving', 'rcv-99');
    expect(l.href).toBe('/inventory/receiving?receiptId=rcv-99');
    expect(l.label).toBe('Receiving record');
  });
  it('returns an ncr deep-link', () => {
    const l = deriveSourceLink('ncr', '123');
    expect(l.href).toBe('/nonconformance');
    expect(l.label).toBe('NCR #123');
  });
  it('returns a kickback deep-link', () => {
    expect(deriveSourceLink('kickback', null).href).toBe('/kickback-tracking');
  });
  it('returns a packing-slip deep-link', () => {
    const l = deriveSourceLink('packing-slip', 'ps-7');
    expect(l.href).toBe('/p2/packing-slips?id=ps-7');
  });
  it('returns a vendor PO deep-link', () => {
    expect(deriveSourceLink('vendor_po', '4567').href).toBe('/vendor-po?poId=4567');
  });
  it('returns null href for unknown source modules', () => {
    expect(deriveSourceLink('mystery', 'x').href).toBeNull();
  });
  it('safely encodes record ids with special characters', () => {
    const l = deriveSourceLink('receiving', 'rcv 1/2&3');
    expect(l.href).toBe(`/inventory/receiving?receiptId=${encodeURIComponent('rcv 1/2&3')}`);
  });
});

// ─────────────────────────────────────────────────────────────────────
// buildBranchesAndEdges
// ─────────────────────────────────────────────────────────────────────

describe('buildBranchesAndEdges', () => {
  it('groups one-lot/one-traveler nodes into a single branch with chained lineage', () => {
    const nodes = [
      node({ id: 'a', occurredAt: '2025-01-01T00:00:00Z', branchKey: 'lot-1::trv-1' }),
      node({ id: 'b', occurredAt: '2025-01-02T00:00:00Z', branchKey: 'lot-1::trv-1', step: 'ISSUED' }),
      node({ id: 'c', occurredAt: '2025-01-03T00:00:00Z', branchKey: 'lot-1::trv-1', step: 'CONSUMED' }),
    ];
    const { edges, branches } = buildBranchesAndEdges(nodes);
    expect(branches).toHaveLength(1);
    expect(branches[0].nodeIds).toEqual(['a', 'b', 'c']);
    expect(branches[0].rootIds).toEqual(['a']);
    expect(edges).toEqual([
      { from: 'a', to: 'b', kind: 'lineage' },
      { from: 'b', to: 'c', kind: 'lineage' },
    ]);
  });

  it('produces two branches when one lot is consumed by two travelers', () => {
    const nodes = [
      node({ id: 'a', branchKey: 'lot-1::trv-A', occurredAt: '2025-01-01T00:00:00Z' }),
      node({ id: 'b', branchKey: 'lot-1::trv-A', occurredAt: '2025-01-02T00:00:00Z', step: 'ISSUED' }),
      node({ id: 'c', branchKey: 'lot-1::trv-B', occurredAt: '2025-01-02T01:00:00Z', step: 'ISSUED' }),
    ];
    const { branches } = buildBranchesAndEdges(nodes);
    expect(branches).toHaveLength(2);
    const keys = branches.map((b) => b.key).sort();
    expect(keys).toEqual(['lot-1::trv-A', 'lot-1::trv-B']);
  });

  it('adds a reversal edge across nodes when reversedTransactionId points into the chain', () => {
    const nodes = [
      node({ id: 'orig', occurredAt: '2025-01-01T00:00:00Z' }),
      node({
        id: 'rev',
        occurredAt: '2025-01-02T00:00:00Z',
        step: 'REVERSED',
        transactionType: 'REVERSAL',
        reversedTransactionId: 'orig',
      }),
    ];
    const { edges } = buildBranchesAndEdges(nodes);
    expect(edges.some((e) => e.from === 'orig' && e.to === 'rev' && e.kind === 'reversal')).toBe(true);
  });

  it('marks the chronologically-first node as the branch root', () => {
    const nodes = [
      node({ id: 'late', occurredAt: '2025-02-01T00:00:00Z' }),
      node({ id: 'early', occurredAt: '2025-01-01T00:00:00Z' }),
    ];
    const { branches } = buildBranchesAndEdges(nodes);
    expect(branches[0].rootIds).toEqual(['early']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// exportChainCsv: determinism + tampering + RFC-4180
// ─────────────────────────────────────────────────────────────────────

describe('exportChainCsv', () => {
  it('produces a deterministic SHA-256 over identical chains', () => {
    const c = chain([
      node({ id: 'a', transactionNumber: 'ITL-A' }),
      node({
        id: 'b',
        transactionNumber: 'ITL-B',
        step: 'ISSUED',
        transactionType: 'ISSUE',
        occurredAt: '2025-01-02T00:00:00.000Z',
        quantityDelta: '-2.0000',
        quantityBefore: '10.0000',
        quantityAfter: '8.0000',
        statusBefore: 'RECEIVED',
        statusAfter: 'ISSUED',
        sourceModule: 'material-issue',
        sourceRecordId: 'r2',
        eventHash: 'def',
      }),
    ]);

    const e1 = exportChainCsv(c);
    const e2 = exportChainCsv(c);
    // Manifest line includes a generatedAt timestamp, so compare only the
    // hashable data section (everything after the first newline).
    const data = (s: string) => s.slice(s.indexOf('\n') + 1);
    expect(data(e1.csv)).toEqual(data(e2.csv));
    expect(e1.manifest.sha256).toEqual(e2.manifest.sha256);
    expect(e1.manifest.rowCount).toBe(2);

    // The first line is the embedded manifest. The remaining lines form the
    // hashable data section; rehashing them must reproduce the manifest sha.
    const firstNl = e1.csv.indexOf('\n');
    const dataPortion = e1.csv.slice(firstNl + 1);
    const recomputed = crypto.createHash('sha256').update(dataPortion, 'utf8').digest('hex');
    expect(e1.manifest.sha256).toEqual(recomputed);
  });

  it('embeds the SHA-256 manifest as the first line of the CSV payload', () => {
    const c = chain([node({ id: 'a' })]);
    const exp = exportChainCsv(c);
    expect(exp.csv.startsWith(TRACEABILITY_MANIFEST_PREFIX)).toBe(true);
    const firstLine = exp.csv.split('\n')[0];
    const json = firstLine.slice(TRACEABILITY_MANIFEST_PREFIX.length).trim();
    const parsed = JSON.parse(json);
    expect(parsed.sha256).toEqual(exp.manifest.sha256);
    expect(parsed.rowCount).toBe(1);
    expect(parsed.query).toEqual(c.query);
    expect(parsed.columns[0]).toBe('occurred_at');
  });

  it('produces a different sha-256 when any field changes (tampering detection)', () => {
    const a = chain([node({ quantityDelta: '5.0000' })]);
    const b = chain([node({ quantityDelta: '6.0000' })]);
    expect(exportChainCsv(a).manifest.sha256).not.toEqual(exportChainCsv(b).manifest.sha256);

    const c1 = chain([node({ eventHash: 'aaa' })]);
    const c2 = chain([node({ eventHash: 'bbb' })]);
    expect(exportChainCsv(c1).manifest.sha256).not.toEqual(exportChainCsv(c2).manifest.sha256);
  });

  it('recipient-side manifest verification flow detects post-export mutation', () => {
    const c = chain([node({ id: 'a', quantityDelta: '10.0000' })]);
    const exp = exportChainCsv(c);
    const firstNl = exp.csv.indexOf('\n');
    const data = exp.csv.slice(firstNl + 1);
    // Tamper: replace 10.0000 with 99.0000 in the data section.
    const tampered = data.replace('10.0000', '99.0000');
    const tamperedSha = crypto.createHash('sha256').update(tampered, 'utf8').digest('hex');
    expect(tamperedSha).not.toEqual(exp.manifest.sha256);
  });

  it('escapes commas, quotes, and newlines per RFC-4180', () => {
    const c = chain([node({ notes: 'Issued, then re-issued; "second pass"\nnewline' })]);
    const exp = exportChainCsv(c);
    expect(exp.csv).toContain('"Issued, then re-issued; ""second pass""\nnewline"');
  });

  it('emits manifest + header row + one row per node', () => {
    const c = chain([node({ id: 'only' })]);
    const exp = exportChainCsv(c);
    const lines = exp.csv.replace(/\n$/, '').split('\n');
    expect(lines[0].startsWith(TRACEABILITY_MANIFEST_PREFIX)).toBe(true);
    expect(lines[1]).toContain('event_hash');
    expect(lines.length).toBe(3);
  });

  it('includes approval and digital-signature columns in the manifest', () => {
    const c = chain([node({})]);
    const exp = exportChainCsv(c);
    expect(exp.manifest.columns).toContain('approved_by');
    expect(exp.manifest.columns).toContain('approval_id');
    expect(exp.manifest.columns).toContain('digital_signature_id');
    expect(exp.manifest.columns[0]).toBe('occurred_at');
    expect(exp.manifest.columns[exp.manifest.columns.length - 1]).toBe('event_hash');
  });
});

// ─────────────────────────────────────────────────────────────────────
// verifyChainNodes: clean & tampered fixtures
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// TRACEABILITY_SEARCH_KEYS — exhaustive key registry
// ─────────────────────────────────────────────────────────────────────

describe('TRACEABILITY_SEARCH_KEYS', () => {
  it('exposes all 8 supported anchors required by Task #147', () => {
    expect([...TRACEABILITY_SEARCH_KEYS].sort()).toEqual([
      'barcode',
      'chargeCode',
      'lotIcn',
      'ncrId',
      'operatorBadge',
      'project',
      'travelerNumber',
      'workOrder',
    ]);
  });
});

describe('verifyChainNodes', () => {
  it('reports ok=true for a fixture whose hashes match the recomputed values', () => {
    const rows = [
      ledgerRow({ id: 'r1', transactionNumber: 'ITL-A' }),
      ledgerRow({
        id: 'r2',
        transactionNumber: 'ITL-B',
        transactionType: 'ISSUE',
        quantityDelta: '-2.0000',
        quantityBefore: '10.0000',
        quantityAfter: '8.0000',
      }),
    ];
    const result = verifyChainNodes(rows);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(2);
    expect(result.mismatches).toHaveLength(0);
  });

  it('detects tampering when the persisted eventHash does not match the recomputed hash', () => {
    const good = ledgerRow({ id: 'r1', transactionNumber: 'ITL-A' });
    const tampered = { ...good, quantityDelta: '999.0000' } as InventoryTransactionLedger;
    // Persisted hash still reflects the original payload — the new quantity proves tampering.
    const result = verifyChainNodes([tampered]);
    expect(result.ok).toBe(false);
    expect(result.checked).toBe(1);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].id).toBe('r1');
    expect(result.mismatches[0].expectedHash).not.toEqual(result.mismatches[0].actualHash);
  });

  it('returns ok=true and checked=0 for an empty input', () => {
    const result = verifyChainNodes([]);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });
});
