import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
  pool: {},
}));

import { db } from '../db';
import {
  checkLotUsability,
  computeEffectiveOutTimeMinutes,
  computeEffectiveOutTimeMinutesSafe,
  isSentinelExpirationDate,
  enforceAndLockIfNeeded,
} from '../src/services/lotUsability';
import type { MaterialLot } from '../schema';

function makeLot(overrides: Partial<MaterialLot> = {}): MaterialLot {
  return {
    id: 'lot-uuid',
    inventoryItemId: 1,
    materialPartNumber: 'PN-1',
    materialName: 'Test',
    internalControlNumber: 'ICN-TEST',
    supplier: 'X',
    supplierLotNumber: null,
    supplierPartNumber: null,
    purchaseOrderNumber: null,
    receivingRecordNumber: null,
    receivedQty: '10',
    remainingQty: '10',
    unitOfMeasure: 'EA',
    expirationDate: null,
    cureDate: null,
    manufactureDate: null,
    storageLocation: null,
    storageRequirements: null,
    status: 'ACCEPTED',
    totalOutTimeMinutes: 0,
    maxOutTimeMinutes: null,
    currentlyOutOfStorage: false,
    lastOutAt: null,
    lockedReason: null,
    lockedAt: null,
    parentLotId: null,
    cocAttachment: null,
    inspectionAttachment: null,
    receivedBy: 'tester',
    receivedAt: new Date(),
    inspectedBy: null,
    inspectedAt: null,
    acceptedBy: null,
    acceptedAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as MaterialLot;
}

function mockSelectReturnsRows(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn, limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn } as any);
}

describe('isSentinelExpirationDate', () => {
  it('treats epoch / year-0001 as sentinel', () => {
    expect(isSentinelExpirationDate(new Date('1970-01-01'))).toBe(true);
    expect(isSentinelExpirationDate(new Date('0001-01-01'))).toBe(true);
    expect(isSentinelExpirationDate(new Date('1999-12-31'))).toBe(true);
  });
  it('treats real dates as non-sentinel', () => {
    expect(isSentinelExpirationDate(new Date('2026-05-08'))).toBe(false);
    expect(isSentinelExpirationDate(new Date('2000-01-01'))).toBe(false);
  });
  it('treats invalid dates as sentinel', () => {
    expect(isSentinelExpirationDate(new Date('not-a-date'))).toBe(true);
  });
});

describe('checkLotUsability — pure rules', () => {
  it('returns STATUS_LOCKED when status is LOCKED', () => {
    const lot = makeLot({ status: 'LOCKED', lockedReason: 'OUT_TIME_EXCEEDED' });
    const r = checkLotUsability(lot);
    expect(r.usable).toBe(false);
    expect(r.status).toBe('STATUS_LOCKED');
  });

  it('does NOT mark as EXPIRED for a sentinel epoch expirationDate', () => {
    const lot = makeLot({ expirationDate: new Date('1970-01-01') });
    const r = checkLotUsability(lot);
    expect(r.usable).toBe(true);
    expect(r.status).toBe('OK');
  });

  it('marks legitimately expired lots as EXPIRED', () => {
    const lot = makeLot({ expirationDate: new Date('2020-01-01') });
    const r = checkLotUsability(lot, { now: new Date('2026-05-08') });
    expect(r.usable).toBe(false);
    expect(r.status).toBe('EXPIRED');
  });

  it('marks lots over maxOutTimeMinutes as OUT_TIME_EXCEEDED', () => {
    const lot = makeLot({ totalOutTimeMinutes: 600, maxOutTimeMinutes: 480 });
    const r = checkLotUsability(lot);
    expect(r.usable).toBe(false);
    expect(r.status).toBe('OUT_TIME_EXCEEDED');
  });

  it('uses caller-supplied effectiveOutTimeMinutes override', () => {
    // Lot has stale state that would naively overshoot
    const lot = makeLot({
      totalOutTimeMinutes: 100,
      maxOutTimeMinutes: 480,
      currentlyOutOfStorage: true,
      lastOutAt: new Date('2020-01-01'), // very stale
    });
    // But the safe computation said the effective was just 100 (no open OUT)
    const r = checkLotUsability(lot, { effectiveOutTimeMinutes: 100 });
    expect(r.usable).toBe(true);
    expect(r.status).toBe('OK');
  });

  it('falls back to naive compute when no override and tips over the limit', () => {
    // Even with stale flag, naive compute with very-old lastOutAt would
    // yield a huge effective; this is the legacy false-positive scenario.
    const lot = makeLot({
      totalOutTimeMinutes: 10,
      maxOutTimeMinutes: 480,
      currentlyOutOfStorage: true,
      lastOutAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 365),
    });
    const naive = checkLotUsability(lot);
    expect(naive.usable).toBe(false); // legacy bug surface
  });
});

describe('computeEffectiveOutTimeMinutesSafe — stale-flag defense', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns base when currentlyOutOfStorage is false', async () => {
    const lot = makeLot({ totalOutTimeMinutes: 42, currentlyOutOfStorage: false });
    const v = await computeEffectiveOutTimeMinutesSafe(lot);
    expect(v).toBe(42);
  });

  it('returns base (does NOT accumulate) when flag is set but no open OUT_START transaction exists', async () => {
    // Most recent transaction is OUT_END → flag is stale
    mockSelectReturnsRows([{ transactionType: 'OUT_END', createdAt: new Date() }]);
    const lot = makeLot({
      totalOutTimeMinutes: 50,
      maxOutTimeMinutes: 480,
      currentlyOutOfStorage: true,
      lastOutAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // 30 days ago — would naively be 43200 min
    });
    const v = await computeEffectiveOutTimeMinutesSafe(lot);
    expect(v).toBe(50);
  });

  it('returns base when there is no OUT history at all (purely stale flag)', async () => {
    mockSelectReturnsRows([]); // no OUT rows
    const lot = makeLot({
      totalOutTimeMinutes: 10,
      currentlyOutOfStorage: true,
      lastOutAt: new Date('2020-01-01'),
    });
    const v = await computeEffectiveOutTimeMinutesSafe(lot);
    expect(v).toBe(10);
  });

  it('accumulates when there IS a matching open OUT_START transaction', async () => {
    mockSelectReturnsRows([{ transactionType: 'OUT_START', createdAt: new Date() }]);
    const lastOutAt = new Date(Date.now() - 1000 * 60 * 60); // 1h ago
    const lot = makeLot({
      totalOutTimeMinutes: 30,
      currentlyOutOfStorage: true,
      lastOutAt,
    });
    const v = await computeEffectiveOutTimeMinutesSafe(lot);
    expect(v).toBeGreaterThanOrEqual(30 + 59);
    expect(v).toBeLessThanOrEqual(30 + 61);
  });
});

describe('checkLotUsability — out-time legitimately exceeded still locks', () => {
  it('returns OUT_TIME_EXCEEDED when totalOutTimeMinutes alone exceeds the cap', () => {
    const lot = makeLot({ totalOutTimeMinutes: 1000, maxOutTimeMinutes: 480 });
    const r = checkLotUsability(lot);
    expect(r.usable).toBe(false);
    expect(r.status).toBe('OUT_TIME_EXCEEDED');
  });
});

describe('enforceAndLockIfNeeded — persist:false (read path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT write LOCKED when persist:false even if usability fails', async () => {
    mockSelectReturnsRows([]); // no OUT history → effective = base
    const lot = makeLot({ totalOutTimeMinutes: 1000, maxOutTimeMinutes: 480 });
    const updateSpy = vi.fn();
    vi.mocked(db.update).mockImplementation(updateSpy as any);
    const insertSpy = vi.fn();
    vi.mocked(db.insert).mockImplementation(insertSpy as any);

    const r = await enforceAndLockIfNeeded(lot, 'tester', { persist: false });
    expect(r.usability.usable).toBe(false);
    expect(r.usability.status).toBe('OUT_TIME_EXCEEDED');
    expect(updateSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('returns usable:true (no write) when stale-flag defense rescues the lot', async () => {
    // Stale flag + no open OUT — base 100 < cap 480 → usable
    mockSelectReturnsRows([{ transactionType: 'OUT_END', createdAt: new Date() }]);
    const lot = makeLot({
      totalOutTimeMinutes: 100,
      maxOutTimeMinutes: 480,
      currentlyOutOfStorage: true,
      lastOutAt: new Date('2020-01-01'),
    });
    const updateSpy = vi.fn();
    vi.mocked(db.update).mockImplementation(updateSpy as any);

    const r = await enforceAndLockIfNeeded(lot, 'tester', { persist: false });
    expect(r.usability.usable).toBe(true);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe('legacy synchronous computeEffectiveOutTimeMinutes', () => {
  it('still accumulates naively (kept for backwards compat)', () => {
    const lastOutAt = new Date(Date.now() - 60_000 * 30);
    const v = computeEffectiveOutTimeMinutes({
      totalOutTimeMinutes: 5,
      currentlyOutOfStorage: true,
      lastOutAt,
    });
    expect(v).toBeGreaterThanOrEqual(34);
    expect(v).toBeLessThanOrEqual(36);
  });
});
