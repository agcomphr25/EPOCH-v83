/**
 * Orchestration tests for the anomaly engine — Task #146.
 *
 * Exercises the persistence + dedup + notification + state-transition paths
 * by mocking the `db` module at the boundary the service uses. Detector
 * trigger-and-persist behavior with a real DB lives in
 * inventoryAnomalyDbIntegration.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Captured = {
  inserts: Array<{ table: string; values: any; conflict: boolean; returning: any[] }>;
  updates: Array<{ table: string; set: any; returning: any[] }>;
  selects: Array<{ table: string }>;
};

const captured: Captured = { inserts: [], updates: [], selects: [] };

let nextDetectorConfigs: any[] = [];
let nextDedupShouldConflict = false;

function tableNameOf(t: any): string {
  return (t && t.__name) || 'unknown';
}

function deterministicSelect(name: string): any[] {
  if (name === 'anomaly_detector_config') return nextDetectorConfigs;
  return [];
}

function deterministicInsert(name: string, values: any, conflict: boolean): any[] {
  if (name === 'inventory_anomalies') {
    if (conflict && nextDedupShouldConflict) return [];
    return [
      {
        id: 'anomaly-1',
        detectorKey: values.detectorKey,
        severity: values.severity,
        status: values.status ?? 'OPEN',
        summary: values.summary,
        agPartNumber: values.agPartNumber ?? null,
        ledgerEntryIds: values.ledgerEntryIds ?? [],
        contextJson: values.contextJson ?? {},
        detectedAt: new Date(),
        windowStart: values.windowStart,
        windowEnd: values.windowEnd,
        dedupKey: values.dedupKey,
      },
    ];
  }
  if (name === 'anomaly_detector_config') {
    return (Array.isArray(values) ? values : [values]).map((v, i) => ({
      id: i + 1,
      detectorKey: v.detectorKey,
      enabled: v.enabled,
      config: v.config ?? {},
      notificationRecipientUserIds: v.notificationRecipientUserIds ?? [],
      notifyOnHigh: v.notifyOnHigh ?? true,
      updatedAt: new Date(),
    }));
  }
  return [{ id: 'inserted-row', ...values }];
}

function makeMockDb() {
  return {
    select(_cols?: any) {
      return {
        from(table: any) {
          const name = tableNameOf(table);
          captured.selects.push({ table: name });
          const chain: any = {
            where: () => chain,
            orderBy: () => chain,
            limit: () => Promise.resolve(deterministicSelect(name)),
            groupBy: () => Promise.resolve([]),
            then: (resolve: any) => Promise.resolve(deterministicSelect(name)).then(resolve),
          };
          return chain;
        },
      };
    },
    insert(table: any) {
      const name = tableNameOf(table);
      return {
        values(values: any) {
          const ctx: any = {
            _conflict: false,
            onConflictDoNothing() {
              ctx._conflict = true;
              return ctx;
            },
            returning() {
              const ret = deterministicInsert(name, values, ctx._conflict);
              captured.inserts.push({ table: name, values, conflict: ctx._conflict, returning: ret });
              return Promise.resolve(ret);
            },
            then(resolve: any) {
              const ret = deterministicInsert(name, values, ctx._conflict);
              captured.inserts.push({ table: name, values, conflict: ctx._conflict, returning: ret });
              return Promise.resolve(ret).then(resolve);
            },
          };
          return ctx;
        },
      };
    },
    update(table: any) {
      const name = tableNameOf(table);
      return {
        set(set: any) {
          return {
            where() {
              return {
                returning() {
                  const ret = [{ id: 'updated-row', ...set }];
                  captured.updates.push({ table: name, set, returning: ret });
                  return Promise.resolve(ret);
                },
              };
            },
          };
        },
      };
    },
  };
}

vi.mock('../db', () => ({ db: makeMockDb() }));
vi.mock('../schema', () => ({
  inventoryAnomalies: { __name: 'inventory_anomalies' },
  anomalyDetectorConfig: { __name: 'anomaly_detector_config' },
  inventoryTransactionLedger: {
    __name: 'inventory_transaction_ledger',
    createdAt: { __col: 'created_at' },
    transactionType: { __col: 'transaction_type' },
    lotId: { __col: 'lot_id' },
    id: { __col: 'id' },
    quantityDelta: { __col: 'quantity_delta' },
  },
  adminAuditLog: { __name: 'admin_audit_log' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...a: any[]) => ({ __op: 'and', a }),
  eq: (...a: any[]) => ({ __op: 'eq', a }),
  gte: (...a: any[]) => ({ __op: 'gte', a }),
  inArray: (...a: any[]) => ({ __op: 'inArray', a }),
  sql: Object.assign((...a: any[]) => ({ __op: 'sql', a }), { raw: (s: string) => s }),
}));
vi.mock('../src/services/auditLedgerService', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import {
  acknowledgeAnomaly,
  dismissAnomaly,
  escalateAnomaly,
  runAnomalyDetectionJob,
  setAnomalyEscalationHandler,
  setAnomalyNotifier,
} from '../src/services/inventoryAnomalyDetectionService';
import { recordAuditEvent } from '../src/services/auditLedgerService';

beforeEach(() => {
  captured.inserts.length = 0;
  captured.updates.length = 0;
  captured.selects.length = 0;
  nextDedupShouldConflict = false;
  nextDetectorConfigs = [];
  vi.mocked(recordAuditEvent).mockClear();
});

afterEach(() => {
  setAnomalyNotifier(async () => {});
  setAnomalyEscalationHandler(async () => {});
});

describe('runAnomalyDetectionJob orchestration', () => {
  it('seeds missing detector configs on first run and emits a scan-complete audit event', async () => {
    const result = await runAnomalyDetectionJob({ windowHours: 24 });
    expect(result.entriesScanned).toBe(0);
    expect(result.perDetector).toHaveLength(9);
    const cfgInsert = captured.inserts.find((i) => i.table === 'anomaly_detector_config');
    expect(cfgInsert).toBeTruthy();
    expect(cfgInsert!.values).toHaveLength(9);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'INVENTORY_ANOMALY_SCAN_COMPLETED' }),
    );
  });

  it('skips disabled detectors', async () => {
    nextDetectorConfigs = [
      'override_frequency',
      'reversal_frequency',
      'after_hours_activity',
      'negative_or_zero_adjustments',
      'round_number_scrap',
      'lot_velocity_outlier',
      'expired_lot_release_no_approval',
      'approver_rubber_stamping',
      'cycle_count_variance_spike',
    ].map((k) => ({
      detectorKey: k,
      enabled: false,
      config: {},
      notificationRecipientUserIds: [],
      notifyOnHigh: true,
    }));
    const result = await runAnomalyDetectionJob({ windowHours: 24 });
    expect(result.detectorsRun).toBe(0);
    expect(result.perDetector.every((d) => d.enabled === false)).toBe(true);
  });
});

describe('Triage state transitions', () => {
  it('acknowledgeAnomaly updates status + emits audit event', async () => {
    const updated = await acknowledgeAnomaly('anomaly-1', { userId: 5, displayName: 'glennj' }, 'reviewed');
    expect(updated).toBeTruthy();
    const upd = captured.updates.find((u) => u.table === 'inventory_anomalies');
    expect(upd?.set.status).toBe('ACKNOWLEDGED');
    expect(upd?.set.acknowledgmentNote).toBe('reviewed');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'INVENTORY_ANOMALY_ACKNOWLEDGED' }),
    );
  });

  it('dismissAnomaly updates status + reason + resolvedAt', async () => {
    const updated = await dismissAnomaly('anomaly-1', { userId: 5, displayName: 'glennj' }, 'false positive');
    expect(updated).toBeTruthy();
    const upd = captured.updates.find((u) => u.table === 'inventory_anomalies');
    expect(upd?.set.status).toBe('DISMISSED');
    expect(upd?.set.dismissalReason).toBe('false positive');
    expect(upd?.set.resolvedAt).toBeTruthy();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'INVENTORY_ANOMALY_DISMISSED' }),
    );
  });

  it('escalateAnomaly updates status, writes admin_audit_log, and invokes the escalation handler', async () => {
    const handler = vi.fn();
    setAnomalyEscalationHandler(handler);
    const updated = await escalateAnomaly('anomaly-1', { userId: 5, displayName: 'glennj' }, 'needs review');
    expect(updated).toBeTruthy();
    const upd = captured.updates.find((u) => u.table === 'inventory_anomalies');
    expect(upd?.set.status).toBe('ESCALATED');
    expect(upd?.set.escalationNote).toBe('needs review');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'INVENTORY_ANOMALY_ESCALATED' }),
    );
    const adminInsert = captured.inserts.find((i) => i.table === 'admin_audit_log');
    expect(adminInsert).toBeTruthy();
    expect(adminInsert!.values.fieldName).toBe('inventory_anomaly_status');
    expect(adminInsert!.values.newValue).toBe('ESCALATED');
    expect(adminInsert!.values.reason).toBe('needs review');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
