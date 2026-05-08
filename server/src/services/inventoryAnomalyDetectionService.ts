/**
 * Inventory Anomaly Detection Engine — Task #146 (Phase 3)
 *
 * Rules-based engine that scans `inventory_transaction_ledger` over a
 * configurable rolling window and surfaces suspicious patterns into
 * `inventory_anomalies` for human triage.
 *
 * Detectors are individually toggleable + threshold-configurable via
 * `anomaly_detector_config`. Each detector implements:
 *   { key, severity, defaultConfig, run(slice, config) → AnomalyCandidate[] }
 *
 * The scheduler loop:
 *   1. Loads the slice of recent ledger entries.
 *   2. For each ENABLED detector, runs the detector.
 *   3. Deduplicates candidates against existing OPEN anomalies via
 *      detector_key + dedup_key (DB unique partial index enforces this).
 *   4. Persists new anomalies and emits HIGH/CRITICAL notifications.
 */

import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  adminAuditLog,
  anomalyDetectorConfig,
  inventoryAnomalies,
  inventoryTransactionLedger,
  type InventoryAnomaly,
  type AnomalyDetectorConfig,
} from '../../schema';
import { recordAuditEvent } from './auditLedgerService';

// Optional escalation hook — wired by server/index.ts. Implementations may
// hand off to email, paging, or a workflow engine. Default is a no-op so the
// service stays decoupled and unit-testable.
export type AnomalyEscalationHandler = (anomaly: InventoryAnomaly, note: string) => Promise<void> | void;
let escalationHandler: AnomalyEscalationHandler = async () => {
  /* no-op default */
};
export function setAnomalyEscalationHandler(fn: AnomalyEscalationHandler): void {
  escalationHandler = fn;
}

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type LedgerSliceEntry = {
  id: string;
  transactionNumber: string;
  transactionType: string;
  inventoryItemId: number;
  agPartNumber: string;
  lotId: string | null;
  locationId: string | null;
  quantityDelta: string;
  quantityBefore: string;
  quantityAfter: string;
  performedByUserId: number | null;
  performedByDisplayName: string;
  approvedByUserId: number | null;
  approvedByDisplayName: string | null;
  reasonCode: string | null;
  notes: string | null;
  sourceModule: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type AnomalyCandidate = {
  detectorKey: string;
  severity: Severity;
  dedupKey: string;
  summary: string;
  context: Record<string, unknown>;
  ledgerEntryIds: string[];
  agPartNumber?: string | null;
  lotId?: string | null;
  performedByUserId?: number | null;
  performedByDisplayName?: string | null;
  approvedByUserId?: number | null;
  approvedByDisplayName?: string | null;
};

export type DetectorContext = {
  windowStart: Date;
  windowEnd: Date;
  entries: LedgerSliceEntry[];
  /** Loader for historical lot consumption (lot velocity detector). */
  loadLotHistory?: (lotId: string) => Promise<{ deltaPerDay: number[] }>;
};

export interface AnomalyDetector {
  key: string;
  description: string;
  defaultSeverity: Severity;
  defaultEnabled: boolean;
  defaultConfig: Record<string, unknown>;
  run(ctx: DetectorContext, config: Record<string, unknown>): AnomalyCandidate[] | Promise<AnomalyCandidate[]>;
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function actorKey(e: LedgerSliceEntry): string {
  return e.performedByUserId != null ? `u:${e.performedByUserId}` : `n:${e.performedByDisplayName}`;
}

function approverKey(e: LedgerSliceEntry): string | null {
  if (e.approvedByUserId != null) return `u:${e.approvedByUserId}`;
  if (e.approvedByDisplayName) return `n:${e.approvedByDisplayName}`;
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Detectors
// ──────────────────────────────────────────────────────────────────────

const overrideFrequencyDetector: AnomalyDetector = {
  key: 'override_frequency',
  description: 'Same operator or approver associated with N+ override events in a rolling window.',
  defaultSeverity: 'HIGH',
  defaultEnabled: true,
  defaultConfig: { threshold: 5, considerApprovers: true },
  run(ctx, config) {
    const threshold = Math.max(1, num(config.threshold, 5));
    const considerApprovers = config.considerApprovers !== false;
    const overrides = ctx.entries.filter(
      (e) =>
        e.metadata?.override === true ||
        (e.reasonCode != null && /override/i.test(e.reasonCode)) ||
        (e.sourceModule != null && /override/i.test(e.sourceModule)),
    );
    const operatorBuckets = new Map<string, LedgerSliceEntry[]>();
    const approverBuckets = new Map<string, LedgerSliceEntry[]>();
    for (const e of overrides) {
      const ok = actorKey(e);
      operatorBuckets.set(ok, [...(operatorBuckets.get(ok) ?? []), e]);
      const ak = approverKey(e);
      if (considerApprovers && ak) {
        approverBuckets.set(ak, [...(approverBuckets.get(ak) ?? []), e]);
      }
    }
    const out: AnomalyCandidate[] = [];
    for (const [key, list] of operatorBuckets) {
      if (list.length >= threshold) {
        out.push({
          detectorKey: 'override_frequency',
          severity: list.length >= threshold * 2 ? 'CRITICAL' : 'HIGH',
          dedupKey: `operator:${key}:${ctx.windowStart.toISOString().slice(0, 10)}`,
          summary: `Operator ${list[0].performedByDisplayName} performed ${list.length} overrides in window`,
          context: { actor: 'operator', actorKey: key, count: list.length, threshold },
          ledgerEntryIds: list.map((e) => e.id),
          performedByUserId: list[0].performedByUserId,
          performedByDisplayName: list[0].performedByDisplayName,
        });
      }
    }
    for (const [key, list] of approverBuckets) {
      if (list.length >= threshold) {
        out.push({
          detectorKey: 'override_frequency',
          severity: list.length >= threshold * 2 ? 'CRITICAL' : 'HIGH',
          dedupKey: `approver:${key}:${ctx.windowStart.toISOString().slice(0, 10)}`,
          summary: `Approver ${list[0].approvedByDisplayName ?? key} approved ${list.length} overrides in window`,
          context: { actor: 'approver', actorKey: key, count: list.length, threshold },
          ledgerEntryIds: list.map((e) => e.id),
          approvedByUserId: list[0].approvedByUserId,
          approvedByDisplayName: list[0].approvedByDisplayName,
        });
      }
    }
    return out;
  },
};

const reversalFrequencyDetector: AnomalyDetector = {
  key: 'reversal_frequency',
  description: 'Same operator producing N+ reversals in a rolling window.',
  defaultSeverity: 'HIGH',
  defaultEnabled: true,
  defaultConfig: { threshold: 3 },
  run(ctx, config) {
    const threshold = Math.max(1, num(config.threshold, 3));
    const reversals = ctx.entries.filter((e) => e.transactionType === 'REVERSAL');
    const buckets = new Map<string, LedgerSliceEntry[]>();
    for (const e of reversals) {
      const k = actorKey(e);
      buckets.set(k, [...(buckets.get(k) ?? []), e]);
    }
    const out: AnomalyCandidate[] = [];
    for (const [key, list] of buckets) {
      if (list.length >= threshold) {
        out.push({
          detectorKey: 'reversal_frequency',
          severity: list.length >= threshold * 2 ? 'CRITICAL' : 'HIGH',
          dedupKey: `${key}:${ctx.windowStart.toISOString().slice(0, 10)}`,
          summary: `Operator ${list[0].performedByDisplayName} produced ${list.length} reversals in window`,
          context: { actorKey: key, count: list.length, threshold },
          ledgerEntryIds: list.map((e) => e.id),
          performedByUserId: list[0].performedByUserId,
          performedByDisplayName: list[0].performedByDisplayName,
        });
      }
    }
    return out;
  },
};

type WorkstationSchedule = {
  workStartHour: number;
  workEndHour: number;
  workdays: number[];
};

const afterHoursActivityDetector: AnomalyDetector = {
  key: 'after_hours_activity',
  description:
    'Issues / scrap / overrides occurring outside configured working hours. Per-workstation overrides via `workstationOverrides[locationId]`.',
  defaultSeverity: 'MEDIUM',
  defaultEnabled: true,
  defaultConfig: {
    workStartHour: 6,
    workEndHour: 18,
    workdays: [1, 2, 3, 4, 5], // Mon..Fri
    flaggedTypes: ['ISSUE', 'CONSUME', 'SCRAP'],
    // Per-workstation overrides keyed by `locationId`. Each override may
    // specify its own `workStartHour` / `workEndHour` / `workdays`. Any
    // missing fields fall back to the global defaults above.
    //   { "STATION-A": { "workStartHour": 0, "workEndHour": 24 },
    //     "NIGHT-CELL": { "workStartHour": 18, "workEndHour": 30, "workdays": [1,2,3,4,5,6,0] } }
    workstationOverrides: {} as Record<string, Partial<WorkstationSchedule>>,
  },
  run(ctx, config) {
    const globalStart = num(config.workStartHour, 6);
    const globalEnd = num(config.workEndHour, 18);
    const globalDays = Array.isArray(config.workdays)
      ? (config.workdays as number[])
      : [1, 2, 3, 4, 5];
    const flagged = new Set(
      Array.isArray(config.flaggedTypes)
        ? (config.flaggedTypes as string[])
        : ['ISSUE', 'CONSUME', 'SCRAP'],
    );
    const overrides =
      (config.workstationOverrides as Record<string, Partial<WorkstationSchedule>>) ?? {};

    const scheduleFor = (locationId: string | null): WorkstationSchedule => {
      const ov = locationId ? overrides[locationId] : undefined;
      return {
        workStartHour: num(ov?.workStartHour, globalStart),
        workEndHour: num(ov?.workEndHour, globalEnd),
        workdays: Array.isArray(ov?.workdays) ? (ov!.workdays as number[]) : globalDays,
      };
    };

    const out: AnomalyCandidate[] = [];
    for (const e of ctx.entries) {
      const isOverride =
        e.metadata?.override === true || (e.reasonCode != null && /override/i.test(e.reasonCode));
      if (!flagged.has(e.transactionType) && !isOverride) continue;
      const sched = scheduleFor(e.locationId);
      const d = new Date(e.createdAt);
      const day = d.getUTCDay();
      const hour = d.getUTCHours();
      const offHours = hour < sched.workStartHour || hour >= sched.workEndHour;
      const offDay = !sched.workdays.includes(day);
      if (!offHours && !offDay) continue;
      out.push({
        detectorKey: 'after_hours_activity',
        severity: 'MEDIUM',
        dedupKey: `entry:${e.id}`,
        summary: `${e.transactionType} on ${e.agPartNumber} by ${e.performedByDisplayName} outside working hours${e.locationId ? ` at ${e.locationId}` : ''}`,
        context: {
          hour,
          day,
          transactionType: e.transactionType,
          locationId: e.locationId,
          schedule: sched,
          appliedOverride: e.locationId ? !!overrides[e.locationId] : false,
        },
        ledgerEntryIds: [e.id],
        agPartNumber: e.agPartNumber,
        lotId: e.lotId,
        performedByUserId: e.performedByUserId,
        performedByDisplayName: e.performedByDisplayName,
      });
    }
    return out;
  },
};

const negativeOrZeroAdjustmentsDetector: AnomalyDetector = {
  key: 'negative_or_zero_adjustments',
  description: 'Adjustments that result in negative balances or are exactly zero.',
  defaultSeverity: 'HIGH',
  defaultEnabled: true,
  defaultConfig: {},
  run(ctx) {
    const out: AnomalyCandidate[] = [];
    for (const e of ctx.entries) {
      if (e.transactionType !== 'ADJUST' && e.transactionType !== 'COUNT_ADJUSTMENT') continue;
      const delta = Number(e.quantityDelta);
      const after = Number(e.quantityAfter);
      const isZero = delta === 0;
      const goesNegative = after < 0;
      if (!isZero && !goesNegative) continue;
      out.push({
        detectorKey: 'negative_or_zero_adjustments',
        severity: goesNegative ? 'HIGH' : 'MEDIUM',
        dedupKey: `entry:${e.id}`,
        summary: goesNegative
          ? `Adjustment on ${e.agPartNumber} drives balance negative (${after})`
          : `Zero-delta adjustment recorded on ${e.agPartNumber}`,
        context: { quantityDelta: delta, quantityAfter: after, kind: goesNegative ? 'NEGATIVE' : 'ZERO' },
        ledgerEntryIds: [e.id],
        agPartNumber: e.agPartNumber,
        lotId: e.lotId,
        performedByUserId: e.performedByUserId,
        performedByDisplayName: e.performedByDisplayName,
      });
    }
    return out;
  },
};

const roundNumberScrapDetector: AnomalyDetector = {
  key: 'round_number_scrap',
  description: 'Scrap quantities that are suspiciously round (10, 50, 100) above a frequency threshold.',
  defaultSeverity: 'MEDIUM',
  defaultEnabled: true,
  defaultConfig: { roundValues: [10, 25, 50, 100], frequencyThreshold: 3 },
  run(ctx, config) {
    const rounds = new Set<number>(
      Array.isArray(config.roundValues) ? (config.roundValues as number[]) : [10, 25, 50, 100],
    );
    const threshold = Math.max(1, num(config.frequencyThreshold, 3));
    const buckets = new Map<string, LedgerSliceEntry[]>();
    for (const e of ctx.entries) {
      if (e.transactionType !== 'SCRAP') continue;
      const qty = Math.abs(Number(e.quantityDelta));
      if (!rounds.has(qty)) continue;
      const k = `${actorKey(e)}|${qty}`;
      buckets.set(k, [...(buckets.get(k) ?? []), e]);
    }
    const out: AnomalyCandidate[] = [];
    for (const [key, list] of buckets) {
      if (list.length >= threshold) {
        out.push({
          detectorKey: 'round_number_scrap',
          severity: list.length >= threshold * 2 ? 'HIGH' : 'MEDIUM',
          dedupKey: `${key}:${ctx.windowStart.toISOString().slice(0, 10)}`,
          summary: `${list[0].performedByDisplayName} scrapped suspiciously round qty ${key.split('|')[1]} ${list.length} times`,
          context: { count: list.length, roundQty: Number(key.split('|')[1]), threshold },
          ledgerEntryIds: list.map((e) => e.id),
          performedByUserId: list[0].performedByUserId,
          performedByDisplayName: list[0].performedByDisplayName,
        });
      }
    }
    return out;
  },
};

const lotVelocityOutlierDetector: AnomalyDetector = {
  key: 'lot_velocity_outlier',
  description: 'A lot consumed at a rate that deviates >N standard deviations from its historical pace.',
  defaultSeverity: 'MEDIUM',
  defaultEnabled: true,
  defaultConfig: { stddevThreshold: 3, minHistoryDays: 5 },
  async run(ctx, config) {
    if (!ctx.loadLotHistory) return [];
    const threshold = num(config.stddevThreshold, 3);
    const minHistory = num(config.minHistoryDays, 5);
    const lotConsumption = new Map<string, number>();
    const lotEntries = new Map<string, LedgerSliceEntry[]>();
    for (const e of ctx.entries) {
      if (!e.lotId) continue;
      if (e.transactionType !== 'ISSUE' && e.transactionType !== 'CONSUME') continue;
      const qty = Math.abs(Number(e.quantityDelta));
      lotConsumption.set(e.lotId, (lotConsumption.get(e.lotId) ?? 0) + qty);
      lotEntries.set(e.lotId, [...(lotEntries.get(e.lotId) ?? []), e]);
    }
    const windowDays = Math.max(
      1,
      (ctx.windowEnd.getTime() - ctx.windowStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const out: AnomalyCandidate[] = [];
    for (const [lotId, totalQty] of lotConsumption) {
      const history = await ctx.loadLotHistory(lotId);
      if (!history.deltaPerDay || history.deltaPerDay.length < minHistory) continue;
      const mean = history.deltaPerDay.reduce((s, x) => s + x, 0) / history.deltaPerDay.length;
      const variance =
        history.deltaPerDay.reduce((s, x) => s + (x - mean) ** 2, 0) /
        history.deltaPerDay.length;
      const stddev = Math.sqrt(variance);
      const recentRate = totalQty / windowDays;
      if (stddev <= 0) continue;
      const z = Math.abs(recentRate - mean) / stddev;
      if (z < threshold) continue;
      const list = lotEntries.get(lotId) ?? [];
      out.push({
        detectorKey: 'lot_velocity_outlier',
        severity: z >= threshold * 1.5 ? 'HIGH' : 'MEDIUM',
        dedupKey: `lot:${lotId}:${ctx.windowStart.toISOString().slice(0, 10)}`,
        summary: `Lot ${lotId} consumption rate ${recentRate.toFixed(2)}/day deviates ${z.toFixed(2)}σ from baseline`,
        context: { lotId, recentRate, mean, stddev, zScore: z, threshold },
        ledgerEntryIds: list.map((e) => e.id),
        agPartNumber: list[0]?.agPartNumber ?? null,
        lotId,
      });
    }
    return out;
  },
};

const expiredLotReleaseDetector: AnomalyDetector = {
  key: 'expired_lot_release_no_approval',
  description: 'Catches expired-lot release without override approval lineage (regression guard).',
  defaultSeverity: 'CRITICAL',
  defaultEnabled: true,
  defaultConfig: {},
  run(ctx) {
    const out: AnomalyCandidate[] = [];
    for (const e of ctx.entries) {
      if (e.transactionType !== 'RELEASE') continue;
      const md = e.metadata ?? {};
      const wasExpired = md.expiredAtRelease === true || md.lotStatusBefore === 'EXPIRED';
      if (!wasExpired) continue;
      const hasApproval =
        e.approvedByUserId != null ||
        (typeof md.approvalId === 'string' && md.approvalId.length > 0);
      if (hasApproval) continue;
      out.push({
        detectorKey: 'expired_lot_release_no_approval',
        severity: 'CRITICAL',
        dedupKey: `entry:${e.id}`,
        summary: `Expired lot ${e.lotId ?? '?'} released without override approval`,
        context: { lotStatusBefore: md.lotStatusBefore, lotId: e.lotId },
        ledgerEntryIds: [e.id],
        agPartNumber: e.agPartNumber,
        lotId: e.lotId,
        performedByUserId: e.performedByUserId,
        performedByDisplayName: e.performedByDisplayName,
      });
    }
    return out;
  },
};

const approverRubberStampingDetector: AnomalyDetector = {
  key: 'approver_rubber_stamping',
  description: 'Same approver approving above N% of an operator’s overrides.',
  defaultSeverity: 'HIGH',
  defaultEnabled: true,
  defaultConfig: { ratioThreshold: 0.9, minOverrides: 5 },
  run(ctx, config) {
    const ratio = num(config.ratioThreshold, 0.9);
    const minOverrides = Math.max(1, num(config.minOverrides, 5));
    const overrides = ctx.entries.filter(
      (e) =>
        e.metadata?.override === true ||
        (e.reasonCode != null && /override/i.test(e.reasonCode)),
    );
    type Stat = { total: number; perApprover: Map<string, LedgerSliceEntry[]> };
    const operators = new Map<string, Stat>();
    for (const e of overrides) {
      const op = actorKey(e);
      const ap = approverKey(e);
      if (!ap) continue;
      let s = operators.get(op);
      if (!s) {
        s = { total: 0, perApprover: new Map() };
        operators.set(op, s);
      }
      s.total += 1;
      s.perApprover.set(ap, [...(s.perApprover.get(ap) ?? []), e]);
    }
    const out: AnomalyCandidate[] = [];
    for (const [op, s] of operators) {
      if (s.total < minOverrides) continue;
      for (const [ap, list] of s.perApprover) {
        const r = list.length / s.total;
        if (r < ratio) continue;
        out.push({
          detectorKey: 'approver_rubber_stamping',
          severity: r >= 0.99 ? 'CRITICAL' : 'HIGH',
          dedupKey: `${op}|${ap}:${ctx.windowStart.toISOString().slice(0, 10)}`,
          summary: `Approver ${list[0].approvedByDisplayName ?? ap} approved ${(r * 100).toFixed(0)}% of ${list[0].performedByDisplayName}'s overrides`,
          context: {
            operatorKey: op,
            approverKey: ap,
            ratio: r,
            count: list.length,
            totalForOperator: s.total,
            threshold: ratio,
          },
          ledgerEntryIds: list.map((e) => e.id),
          performedByUserId: list[0].performedByUserId,
          performedByDisplayName: list[0].performedByDisplayName,
          approvedByUserId: list[0].approvedByUserId,
          approvedByDisplayName: list[0].approvedByDisplayName,
        });
      }
    }
    return out;
  },
};

const cycleCountVarianceDetector: AnomalyDetector = {
  key: 'cycle_count_variance_spike',
  description: 'Cycle-count adjustments above a configurable dollar / percentage threshold.',
  defaultSeverity: 'HIGH',
  defaultEnabled: true,
  defaultConfig: { absQtyThreshold: 100, percentThreshold: 0.25 },
  run(ctx, config) {
    const absThreshold = num(config.absQtyThreshold, 100);
    const pct = num(config.percentThreshold, 0.25);
    const out: AnomalyCandidate[] = [];
    for (const e of ctx.entries) {
      if (e.transactionType !== 'COUNT_ADJUSTMENT') continue;
      const delta = Math.abs(Number(e.quantityDelta));
      const before = Math.abs(Number(e.quantityBefore));
      const pctDelta = before > 0 ? delta / before : 1;
      if (delta < absThreshold && pctDelta < pct) continue;
      out.push({
        detectorKey: 'cycle_count_variance_spike',
        severity: delta >= absThreshold * 5 || pctDelta >= 0.75 ? 'CRITICAL' : 'HIGH',
        dedupKey: `entry:${e.id}`,
        summary: `Cycle-count adjustment of ${delta} (${(pctDelta * 100).toFixed(1)}%) on ${e.agPartNumber}`,
        context: { delta, before, pctDelta, absThreshold, pct },
        ledgerEntryIds: [e.id],
        agPartNumber: e.agPartNumber,
        lotId: e.lotId,
        performedByUserId: e.performedByUserId,
        performedByDisplayName: e.performedByDisplayName,
      });
    }
    return out;
  },
};

// ──────────────────────────────────────────────────────────────────────
// Registry
// ──────────────────────────────────────────────────────────────────────

export const DETECTORS: AnomalyDetector[] = [
  overrideFrequencyDetector,
  reversalFrequencyDetector,
  afterHoursActivityDetector,
  negativeOrZeroAdjustmentsDetector,
  roundNumberScrapDetector,
  lotVelocityOutlierDetector,
  expiredLotReleaseDetector,
  approverRubberStampingDetector,
  cycleCountVarianceDetector,
];

export function getDetector(key: string): AnomalyDetector | undefined {
  return DETECTORS.find((d) => d.key === key);
}

// ──────────────────────────────────────────────────────────────────────
// Slice loader
// ──────────────────────────────────────────────────────────────────────

export async function loadLedgerSlice(windowStart: Date): Promise<LedgerSliceEntry[]> {
  const rows = await db
    .select()
    .from(inventoryTransactionLedger)
    .where(gte(inventoryTransactionLedger.createdAt, windowStart))
    .orderBy(inventoryTransactionLedger.createdAt);
  return rows.map((r) => ({
    id: r.id,
    transactionNumber: r.transactionNumber,
    transactionType: r.transactionType as string,
    inventoryItemId: r.inventoryItemId,
    agPartNumber: r.agPartNumber,
    lotId: r.lotId,
    locationId: r.locationId,
    quantityDelta: String(r.quantityDelta),
    quantityBefore: String(r.quantityBefore),
    quantityAfter: String(r.quantityAfter),
    performedByUserId: r.performedByUserId,
    performedByDisplayName: r.performedByDisplayName,
    approvedByUserId: r.approvedByUserId,
    approvedByDisplayName: r.approvedByDisplayName,
    reasonCode: r.reasonCode,
    notes: r.notes,
    sourceModule: r.sourceModule,
    metadata: (r.metadata ?? null) as Record<string, unknown> | null,
    createdAt: r.createdAt,
  }));
}

async function loadLotHistory(lotId: string, before: Date): Promise<{ deltaPerDay: number[] }> {
  const sinceDate = new Date(before.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      day: sql<string>`date_trunc('day', ${inventoryTransactionLedger.createdAt})::text`,
      total: sql<string>`SUM(ABS(${inventoryTransactionLedger.quantityDelta}))::text`,
    })
    .from(inventoryTransactionLedger)
    .where(
      and(
        eq(inventoryTransactionLedger.lotId, lotId),
        gte(inventoryTransactionLedger.createdAt, sinceDate),
        inArray(inventoryTransactionLedger.transactionType, ['ISSUE', 'CONSUME']),
        sql`${inventoryTransactionLedger.createdAt} < ${before}`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${inventoryTransactionLedger.createdAt})`);
  return { deltaPerDay: rows.map((r) => Number(r.total) || 0) };
}

// ──────────────────────────────────────────────────────────────────────
// Config loader (with defaults)
// ──────────────────────────────────────────────────────────────────────

export async function loadAllDetectorConfigs(): Promise<AnomalyDetectorConfig[]> {
  const existing = await db.select().from(anomalyDetectorConfig);
  const byKey = new Map(existing.map((r) => [r.detectorKey, r]));
  const missing = DETECTORS.filter((d) => !byKey.has(d.key));
  if (missing.length > 0) {
    const inserted = await db
      .insert(anomalyDetectorConfig)
      .values(
        missing.map((d) => ({
          detectorKey: d.key,
          enabled: d.defaultEnabled,
          config: d.defaultConfig,
          notificationRecipientUserIds: [],
          notifyOnHigh: true,
        })),
      )
      .returning();
    for (const r of inserted) byKey.set(r.detectorKey, r);
  }
  return DETECTORS.map((d) => byKey.get(d.key)!).filter(Boolean);
}

// ──────────────────────────────────────────────────────────────────────
// Notifier (decoupled — injectable for testability)
// ──────────────────────────────────────────────────────────────────────

export type AnomalyNotifier = (
  anomaly: InventoryAnomaly,
  recipients: number[],
) => Promise<void> | void;

let notifier: AnomalyNotifier = async () => {
  /* no-op default; wired up at server start */
};

export function setAnomalyNotifier(fn: AnomalyNotifier): void {
  notifier = fn;
}

// ──────────────────────────────────────────────────────────────────────
// Persistence + dedup
// ──────────────────────────────────────────────────────────────────────

async function persistCandidates(
  candidates: AnomalyCandidate[],
  windowStart: Date,
  windowEnd: Date,
  cfg: AnomalyDetectorConfig,
): Promise<InventoryAnomaly[]> {
  const out: InventoryAnomaly[] = [];
  for (const c of candidates) {
    try {
      const inserted = await db
        .insert(inventoryAnomalies)
        .values({
          detectorKey: c.detectorKey,
          severity: c.severity,
          status: 'OPEN',
          windowStart,
          windowEnd,
          dedupKey: c.dedupKey,
          summary: c.summary,
          contextJson: c.context,
          ledgerEntryIds: c.ledgerEntryIds,
          agPartNumber: c.agPartNumber ?? null,
          lotId: c.lotId ?? null,
          performedByUserId: c.performedByUserId ?? null,
          performedByDisplayName: c.performedByDisplayName ?? null,
          approvedByUserId: c.approvedByUserId ?? null,
          approvedByDisplayName: c.approvedByDisplayName ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) {
        out.push(inserted[0]);
      }
    } catch (err) {
      console.error(`[anomaly] failed to persist candidate ${c.detectorKey}/${c.dedupKey}:`, err);
    }
  }
  // Notifications
  for (const a of out) {
    const isHigh = a.severity === 'HIGH' || a.severity === 'CRITICAL';
    if (isHigh && cfg.notifyOnHigh) {
      try {
        await notifier(a, cfg.notificationRecipientUserIds ?? []);
        await db
          .update(inventoryAnomalies)
          .set({ notificationSentAt: new Date() })
          .where(eq(inventoryAnomalies.id, a.id));
      } catch (err) {
        console.error(`[anomaly] notify failed for ${a.id}:`, err);
      }
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Main job entry point
// ──────────────────────────────────────────────────────────────────────

export type AnomalyJobOptions = {
  windowHours?: number; // default 24
  now?: Date;
};

export type AnomalyJobResult = {
  ranAt: Date;
  windowStart: Date;
  windowEnd: Date;
  entriesScanned: number;
  detectorsRun: number;
  candidatesProduced: number;
  anomaliesPersisted: number;
  perDetector: Array<{
    key: string;
    enabled: boolean;
    candidates: number;
    persisted: number;
    error?: string;
  }>;
};

export async function runAnomalyDetectionJob(
  opts: AnomalyJobOptions = {},
): Promise<AnomalyJobResult> {
  const now = opts.now ?? new Date();
  const windowHours = Math.max(1, opts.windowHours ?? 24);
  const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const entries = await loadLedgerSlice(windowStart);
  const configs = await loadAllDetectorConfigs();

  const ctx: DetectorContext = {
    windowStart,
    windowEnd: now,
    entries,
    loadLotHistory: (lotId) => loadLotHistory(lotId, windowStart),
  };

  const result: AnomalyJobResult = {
    ranAt: now,
    windowStart,
    windowEnd: now,
    entriesScanned: entries.length,
    detectorsRun: 0,
    candidatesProduced: 0,
    anomaliesPersisted: 0,
    perDetector: [],
  };

  for (const detector of DETECTORS) {
    const cfg = configs.find((c) => c.detectorKey === detector.key);
    if (!cfg || !cfg.enabled) {
      result.perDetector.push({
        key: detector.key,
        enabled: false,
        candidates: 0,
        persisted: 0,
      });
      continue;
    }
    try {
      const candidates = await detector.run(ctx, cfg.config ?? {});
      const persisted = await persistCandidates(candidates, windowStart, now, cfg);
      result.detectorsRun += 1;
      result.candidatesProduced += candidates.length;
      result.anomaliesPersisted += persisted.length;
      result.perDetector.push({
        key: detector.key,
        enabled: true,
        candidates: candidates.length,
        persisted: persisted.length,
      });
    } catch (err: any) {
      console.error(`[anomaly] detector ${detector.key} failed:`, err);
      result.perDetector.push({
        key: detector.key,
        enabled: true,
        candidates: 0,
        persisted: 0,
        error: err?.message ?? String(err),
      });
    }
  }

  await recordAuditEvent({
    eventType: 'INVENTORY_ANOMALY_SCAN_COMPLETED',
    subjectType: 'inventory_anomalies',
    subjectId: now.toISOString(),
    sourceService: 'inventoryAnomalyDetectionService',
    actor: { username: 'system:cron', role: 'system' },
    payload: {
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      entriesScanned: result.entriesScanned,
      anomaliesPersisted: result.anomaliesPersisted,
      perDetector: result.perDetector,
    },
  }).catch((err) => console.error('[anomaly] audit emit failed:', err));

  return result;
}

// ──────────────────────────────────────────────────────────────────────
// Triage state transitions
// ──────────────────────────────────────────────────────────────────────

export type Actor = {
  userId?: number | null;
  displayName?: string | null;
};

export async function acknowledgeAnomaly(
  id: string,
  actor: Actor,
  note: string,
): Promise<InventoryAnomaly> {
  const [updated] = await db
    .update(inventoryAnomalies)
    .set({
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(),
      acknowledgedByUserId: actor.userId ?? null,
      acknowledgedByDisplayName: actor.displayName ?? null,
      acknowledgmentNote: note,
      updatedAt: new Date(),
    })
    .where(eq(inventoryAnomalies.id, id))
    .returning();
  if (!updated) throw new Error(`Anomaly ${id} not found`);
  await recordAuditEvent({
    eventType: 'INVENTORY_ANOMALY_ACKNOWLEDGED',
    subjectType: 'inventory_anomalies',
    subjectId: id,
    sourceService: 'inventoryAnomalyDetectionService',
    actor: { id: actor.userId ?? undefined, username: actor.displayName ?? undefined },
    payload: { note },
  });
  return updated;
}

export async function dismissAnomaly(
  id: string,
  actor: Actor,
  reason: string,
): Promise<InventoryAnomaly> {
  const [updated] = await db
    .update(inventoryAnomalies)
    .set({
      status: 'DISMISSED',
      dismissedAt: new Date(),
      dismissedByUserId: actor.userId ?? null,
      dismissedByDisplayName: actor.displayName ?? null,
      dismissalReason: reason,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(inventoryAnomalies.id, id))
    .returning();
  if (!updated) throw new Error(`Anomaly ${id} not found`);
  await recordAuditEvent({
    eventType: 'INVENTORY_ANOMALY_DISMISSED',
    subjectType: 'inventory_anomalies',
    subjectId: id,
    sourceService: 'inventoryAnomalyDetectionService',
    actor: { id: actor.userId ?? undefined, username: actor.displayName ?? undefined },
    payload: { reason },
  });
  return updated;
}

export async function escalateAnomaly(
  id: string,
  actor: Actor,
  note: string,
): Promise<InventoryAnomaly> {
  const [updated] = await db
    .update(inventoryAnomalies)
    .set({
      status: 'ESCALATED',
      escalatedAt: new Date(),
      escalatedByUserId: actor.userId ?? null,
      escalatedByDisplayName: actor.displayName ?? null,
      escalationNote: note,
      updatedAt: new Date(),
    })
    .where(eq(inventoryAnomalies.id, id))
    .returning();
  if (!updated) throw new Error(`Anomaly ${id} not found`);
  await recordAuditEvent({
    eventType: 'INVENTORY_ANOMALY_ESCALATED',
    subjectType: 'inventory_anomalies',
    subjectId: id,
    sourceService: 'inventoryAnomalyDetectionService',
    actor: { id: actor.userId ?? undefined, username: actor.displayName ?? undefined },
    payload: { note },
  });
  // Hand off to admin_audit_log so the escalation appears alongside other
  // governance/compliance review queues, and to the registered escalation
  // handler (email/paging) so on-call admins receive immediate notice.
  try {
    await db.insert(adminAuditLog).values({
      orderId: `anomaly:${id}`,
      fieldName: 'inventory_anomaly_status',
      fieldLabel: 'Inventory Anomaly Escalation',
      oldValue: 'OPEN',
      newValue: 'ESCALATED',
      changedBy: actor.displayName ?? 'system',
      userRole: 'ADMIN',
      changeType: 'INLINE',
      reason: note,
    });
  } catch (err) {
    console.error('[anomaly] admin_audit_log escalation insert failed:', err);
  }
  try {
    await escalationHandler(updated, note);
  } catch (err) {
    console.error('[anomaly] escalation handler failed:', err);
  }
  return updated;
}

export async function assignAnomaly(
  id: string,
  assignee: Actor,
): Promise<InventoryAnomaly> {
  const [updated] = await db
    .update(inventoryAnomalies)
    .set({
      assignedToUserId: assignee.userId ?? null,
      assignedToDisplayName: assignee.displayName ?? null,
      updatedAt: new Date(),
    })
    .where(eq(inventoryAnomalies.id, id))
    .returning();
  if (!updated) throw new Error(`Anomaly ${id} not found`);
  return updated;
}

// ──────────────────────────────────────────────────────────────────────
// Listing / detail
// ──────────────────────────────────────────────────────────────────────

export async function listAnomalies(filters: {
  status?: string;
  detectorKey?: string;
  severity?: string;
  limit?: number;
} = {}): Promise<InventoryAnomaly[]> {
  const conditions = [];
  if (filters.status) conditions.push(eq(inventoryAnomalies.status, filters.status));
  if (filters.detectorKey) conditions.push(eq(inventoryAnomalies.detectorKey, filters.detectorKey));
  if (filters.severity) conditions.push(eq(inventoryAnomalies.severity, filters.severity));
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
  return db
    .select()
    .from(inventoryAnomalies)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`detected_at DESC`)
    .limit(limit);
}

export async function getAnomalyById(id: string): Promise<InventoryAnomaly | null> {
  const [row] = await db.select().from(inventoryAnomalies).where(eq(inventoryAnomalies.id, id));
  return row ?? null;
}

export async function updateDetectorConfig(
  detectorKey: string,
  patch: {
    enabled?: boolean;
    config?: Record<string, unknown>;
    notificationRecipientUserIds?: number[];
    notifyOnHigh?: boolean;
  },
  actor: Actor,
): Promise<AnomalyDetectorConfig> {
  if (!getDetector(detectorKey)) {
    throw new Error(`Unknown detector ${detectorKey}`);
  }
  const set: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedByUserId: actor.userId ?? null,
    updatedByDisplayName: actor.displayName ?? null,
  };
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.config !== undefined) set.config = patch.config;
  if (patch.notificationRecipientUserIds !== undefined) {
    set.notificationRecipientUserIds = patch.notificationRecipientUserIds;
  }
  if (patch.notifyOnHigh !== undefined) set.notifyOnHigh = patch.notifyOnHigh;

  await loadAllDetectorConfigs(); // ensure row exists
  const [updated] = await db
    .update(anomalyDetectorConfig)
    .set(set)
    .where(eq(anomalyDetectorConfig.detectorKey, detectorKey))
    .returning();

  await recordAuditEvent({
    eventType: 'ANOMALY_DETECTOR_CONFIG_UPDATED',
    subjectType: 'anomaly_detector_config',
    subjectId: detectorKey,
    sourceService: 'inventoryAnomalyDetectionService',
    actor: { id: actor.userId ?? undefined, username: actor.displayName ?? undefined },
    payload: { patch },
  });
  return updated;
}
