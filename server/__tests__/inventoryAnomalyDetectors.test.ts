/**
 * Unit tests for the inventory-anomaly detector framework — Task #146.
 *
 * The detectors are pure functions over a pre-loaded ledger slice + config,
 * so these tests need no DB and exercise the rule logic directly.
 */

import { describe, expect, it } from 'vitest';
import {
  DETECTORS,
  getDetector,
  type DetectorContext,
  type LedgerSliceEntry,
} from '../src/services/inventoryAnomalyDetectionService';

function entry(overrides: Partial<LedgerSliceEntry> = {}): LedgerSliceEntry {
  return {
    id: overrides.id ?? `00000000-0000-0000-0000-${String(Math.random()).slice(2, 14).padStart(12, '0')}`,
    transactionNumber: overrides.transactionNumber ?? 'T-1',
    transactionType: overrides.transactionType ?? 'ISSUE',
    inventoryItemId: overrides.inventoryItemId ?? 1,
    agPartNumber: overrides.agPartNumber ?? 'AG-1',
    lotId: overrides.lotId ?? null,
    locationId: overrides.locationId ?? null,
    quantityDelta: overrides.quantityDelta ?? '-1',
    quantityBefore: overrides.quantityBefore ?? '10',
    quantityAfter: overrides.quantityAfter ?? '9',
    performedByUserId: overrides.performedByUserId ?? 100,
    performedByDisplayName: overrides.performedByDisplayName ?? 'alice',
    approvedByUserId: overrides.approvedByUserId ?? null,
    approvedByDisplayName: overrides.approvedByDisplayName ?? null,
    reasonCode: overrides.reasonCode ?? null,
    notes: overrides.notes ?? null,
    sourceModule: overrides.sourceModule ?? 'materialIssueService',
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-05-06T10:00:00Z'),
  };
}

function ctx(entries: LedgerSliceEntry[]): DetectorContext {
  return {
    windowStart: new Date('2026-05-06T00:00:00Z'),
    windowEnd: new Date('2026-05-07T00:00:00Z'),
    entries,
  };
}

describe('Anomaly detector registry', () => {
  it('exposes nine detectors with unique keys', () => {
    expect(DETECTORS).toHaveLength(9);
    const keys = new Set(DETECTORS.map((d) => d.key));
    expect(keys.size).toBe(9);
  });
  it('lookup by key works', () => {
    expect(getDetector('override_frequency')?.key).toBe('override_frequency');
    expect(getDetector('does_not_exist')).toBeUndefined();
  });
});

describe('override_frequency detector', () => {
  const detector = getDetector('override_frequency')!;

  it('flags an operator with overrides ≥ threshold', async () => {
    const entries = Array.from({ length: 5 }).map((_, i) =>
      entry({
        id: `e-${i}`,
        metadata: { override: true },
        performedByUserId: 7,
        performedByDisplayName: 'bob',
      }),
    );
    const out = await detector.run(ctx(entries), { threshold: 5 });
    expect(out).toHaveLength(1);
    expect(out[0].detectorKey).toBe('override_frequency');
    expect(out[0].context.count).toBe(5);
    expect(out[0].performedByDisplayName).toBe('bob');
    expect(out[0].ledgerEntryIds).toHaveLength(5);
  });

  it('does not flag below threshold', async () => {
    const entries = Array.from({ length: 3 }).map((_, i) =>
      entry({ id: `e-${i}`, metadata: { override: true }, performedByUserId: 7 }),
    );
    const out = await detector.run(ctx(entries), { threshold: 5 });
    expect(out).toHaveLength(0);
  });

  it('escalates to CRITICAL at 2× threshold', async () => {
    const entries = Array.from({ length: 10 }).map((_, i) =>
      entry({
        id: `e-${i}`,
        metadata: { override: true },
        performedByUserId: 7,
        performedByDisplayName: 'bob',
      }),
    );
    const out = await detector.run(ctx(entries), { threshold: 5 });
    expect(out[0].severity).toBe('CRITICAL');
  });
});

describe('reversal_frequency detector', () => {
  const detector = getDetector('reversal_frequency')!;

  it('flags an operator with reversals ≥ threshold', async () => {
    const entries = [
      entry({ id: 'r1', transactionType: 'REVERSAL', performedByUserId: 5 }),
      entry({ id: 'r2', transactionType: 'REVERSAL', performedByUserId: 5 }),
      entry({ id: 'r3', transactionType: 'REVERSAL', performedByUserId: 5 }),
    ];
    const out = await detector.run(ctx(entries), { threshold: 3 });
    expect(out).toHaveLength(1);
    expect(out[0].context.count).toBe(3);
  });

  it('ignores non-reversals', async () => {
    const entries = [
      entry({ transactionType: 'ISSUE' }),
      entry({ transactionType: 'CONSUME' }),
    ];
    const out = await detector.run(ctx(entries), { threshold: 1 });
    expect(out).toHaveLength(0);
  });
});

describe('negative_or_zero_adjustments detector', () => {
  const detector = getDetector('negative_or_zero_adjustments')!;

  it('flags adjustments that drive balance negative', async () => {
    const out = await detector.run(
      ctx([
        entry({
          transactionType: 'ADJUST',
          quantityDelta: '-15',
          quantityBefore: '10',
          quantityAfter: '-5',
        }),
      ]),
      {},
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('HIGH');
    expect(out[0].context.kind).toBe('NEGATIVE');
  });

  it('flags zero-delta adjustments as MEDIUM', async () => {
    const out = await detector.run(
      ctx([entry({ transactionType: 'ADJUST', quantityDelta: '0', quantityAfter: '10' })]),
      {},
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('MEDIUM');
    expect(out[0].context.kind).toBe('ZERO');
  });

  it('ignores positive non-zero adjustments', async () => {
    const out = await detector.run(
      ctx([entry({ transactionType: 'ADJUST', quantityDelta: '5', quantityAfter: '15' })]),
      {},
    );
    expect(out).toHaveLength(0);
  });
});

describe('after_hours_activity detector', () => {
  const detector = getDetector('after_hours_activity')!;

  it('flags ISSUE outside work hours', async () => {
    const out = await detector.run(
      ctx([
        entry({
          transactionType: 'ISSUE',
          createdAt: new Date('2026-05-06T03:00:00Z'),
        }),
      ]),
      {
        workStartHour: 6,
        workEndHour: 18,
        workdays: [1, 2, 3, 4, 5],
        flaggedTypes: ['ISSUE'],
      },
    );
    expect(out).toHaveLength(1);
  });

  it('does not flag during business hours', async () => {
    const out = await detector.run(
      ctx([
        entry({
          transactionType: 'ISSUE',
          createdAt: new Date('2026-05-06T15:00:00Z'),
        }),
      ]),
      {
        workStartHour: 6,
        workEndHour: 18,
        workdays: [1, 2, 3, 4, 5],
        flaggedTypes: ['ISSUE'],
      },
    );
    expect(out).toHaveLength(0);
  });

  it('respects per-workstation overrides — 24/7 station does not flag at 03:00', async () => {
    const out = await detector.run(
      ctx([
        entry({
          transactionType: 'ISSUE',
          locationId: 'STATION-A',
          createdAt: new Date('2026-05-06T03:00:00Z'),
        }),
      ]),
      {
        workStartHour: 6,
        workEndHour: 18,
        workdays: [1, 2, 3, 4, 5],
        flaggedTypes: ['ISSUE'],
        workstationOverrides: {
          'STATION-A': { workStartHour: 0, workEndHour: 24, workdays: [0, 1, 2, 3, 4, 5, 6] },
        },
      },
    );
    expect(out).toHaveLength(0);
  });

  it('respects per-workstation overrides — flags inside override window even if global allows', async () => {
    const out = await detector.run(
      ctx([
        entry({
          transactionType: 'ISSUE',
          locationId: 'NIGHT-CELL',
          createdAt: new Date('2026-05-06T15:00:00Z'),
        }),
      ]),
      {
        workStartHour: 6,
        workEndHour: 18,
        workdays: [1, 2, 3, 4, 5],
        flaggedTypes: ['ISSUE'],
        workstationOverrides: {
          'NIGHT-CELL': { workStartHour: 18, workEndHour: 24, workdays: [1, 2, 3, 4, 5] },
        },
      },
    );
    expect(out).toHaveLength(1);
    expect((out[0].context as any).appliedOverride).toBe(true);
  });
});

describe('expired_lot_release_no_approval detector', () => {
  const detector = getDetector('expired_lot_release_no_approval')!;

  it('flags expired-lot RELEASE without approval', async () => {
    const out = await detector.run(
      ctx([
        entry({
          transactionType: 'RELEASE',
          lotId: 'lot-1',
          metadata: { lotStatusBefore: 'EXPIRED' },
        }),
      ]),
      {},
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('CRITICAL');
  });

  it('does not flag when approval lineage is present', async () => {
    const out = await detector.run(
      ctx([
        entry({
          transactionType: 'RELEASE',
          lotId: 'lot-1',
          approvedByUserId: 99,
          metadata: { lotStatusBefore: 'EXPIRED', approvalId: 'app-1' },
        }),
      ]),
      {},
    );
    expect(out).toHaveLength(0);
  });
});

describe('approver_rubber_stamping detector', () => {
  const detector = getDetector('approver_rubber_stamping')!;

  it('flags an approver with > 90% of an operators overrides', async () => {
    const entries = Array.from({ length: 10 }).map((_, i) =>
      entry({
        id: `e-${i}`,
        metadata: { override: true },
        performedByUserId: 7,
        performedByDisplayName: 'bob',
        approvedByUserId: 99,
        approvedByDisplayName: 'mallory',
      }),
    );
    const out = await detector.run(ctx(entries), { ratioThreshold: 0.9, minOverrides: 5 });
    expect(out).toHaveLength(1);
    expect(out[0].context.ratio).toBe(1);
  });

  it('does not flag below the ratio threshold', async () => {
    const entries = [
      ...Array.from({ length: 4 }).map((_, i) =>
        entry({
          id: `a-${i}`,
          metadata: { override: true },
          performedByUserId: 7,
          approvedByUserId: 99,
        }),
      ),
      ...Array.from({ length: 6 }).map((_, i) =>
        entry({
          id: `b-${i}`,
          metadata: { override: true },
          performedByUserId: 7,
          approvedByUserId: 88,
        }),
      ),
    ];
    const out = await detector.run(ctx(entries), { ratioThreshold: 0.9, minOverrides: 5 });
    expect(out).toHaveLength(0);
  });
});

describe('cycle_count_variance_spike detector', () => {
  const detector = getDetector('cycle_count_variance_spike')!;

  it('flags a large absolute COUNT_ADJUSTMENT', async () => {
    const out = await detector.run(
      ctx([
        entry({
          transactionType: 'COUNT_ADJUSTMENT',
          quantityDelta: '-150',
          quantityBefore: '500',
          quantityAfter: '350',
        }),
      ]),
      { absQtyThreshold: 100, percentThreshold: 0.5 },
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('HIGH');
  });

  it('flags by percentage even when absolute is small', async () => {
    const out = await detector.run(
      ctx([
        entry({
          transactionType: 'COUNT_ADJUSTMENT',
          quantityDelta: '-8',
          quantityBefore: '10',
          quantityAfter: '2',
        }),
      ]),
      { absQtyThreshold: 1000, percentThreshold: 0.5 },
    );
    expect(out).toHaveLength(1);
  });

  it('skips below both thresholds', async () => {
    const out = await detector.run(
      ctx([
        entry({
          transactionType: 'COUNT_ADJUSTMENT',
          quantityDelta: '-1',
          quantityBefore: '500',
          quantityAfter: '499',
        }),
      ]),
      { absQtyThreshold: 100, percentThreshold: 0.5 },
    );
    expect(out).toHaveLength(0);
  });
});

describe('round_number_scrap detector', () => {
  const detector = getDetector('round_number_scrap')!;

  it('flags repeat round-number scrap by same operator', async () => {
    const entries = Array.from({ length: 3 }).map((_, i) =>
      entry({
        id: `s-${i}`,
        transactionType: 'SCRAP',
        quantityDelta: '-50',
        performedByUserId: 5,
      }),
    );
    const out = await detector.run(ctx(entries), {
      roundValues: [10, 50, 100],
      frequencyThreshold: 3,
    });
    expect(out).toHaveLength(1);
    expect(out[0].context.roundQty).toBe(50);
  });

  it('does not flag non-round qty', async () => {
    const entries = Array.from({ length: 5 }).map((_, i) =>
      entry({ id: `s-${i}`, transactionType: 'SCRAP', quantityDelta: '-37' }),
    );
    const out = await detector.run(ctx(entries), {
      roundValues: [10, 50, 100],
      frequencyThreshold: 3,
    });
    expect(out).toHaveLength(0);
  });
});
