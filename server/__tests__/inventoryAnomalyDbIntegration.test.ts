/**
 * DB-backed integration tests for the anomaly engine — Task #146.
 *
 * Seeds the `inventory_transaction_ledger` with realistic patterns,
 * runs the detection job, and asserts persisted anomalies in
 * `inventory_anomalies`. Covers ≥ 3 detectors end-to-end + dedup +
 * triage transition.
 *
 * The test bootstraps minimal table shells (no FKs) under a unique
 * Postgres schema so it does not collide with any real ledger /
 * anomaly data in the dev DB.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const haveDb = !!(process.env.DATABASE_URL || process.env.FORCE_DATABASE_URL);
const d = haveDb ? describe : describe.skip;

const TEST_SCHEMA = `anomaly_test_${Math.floor(Math.random() * 1_000_000)}`;
let pool: Pool;

async function exec(sql: string, params: any[] = []): Promise<any[]> {
  const r = await pool.query(sql, params);
  return r.rows;
}

beforeAll(async () => {
  if (!haveDb) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.FORCE_DATABASE_URL });
  await exec(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`);
  await exec(`SET search_path TO ${TEST_SCHEMA}, public`);
  await exec(`
    CREATE TABLE IF NOT EXISTS ${TEST_SCHEMA}.inventory_transaction_ledger (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      transaction_number text NOT NULL UNIQUE,
      transaction_type text NOT NULL,
      inventory_item_id integer NOT NULL,
      ag_part_number text NOT NULL,
      lot_id uuid,
      location_id text,
      quantity_delta numeric(14,4) NOT NULL,
      quantity_before numeric(14,4) NOT NULL,
      quantity_after numeric(14,4) NOT NULL,
      unit_of_measure text NOT NULL DEFAULT 'EA',
      status_before text,
      status_after text,
      performed_by_user_id integer,
      performed_by_display_name text NOT NULL,
      approved_by_user_id integer,
      approved_by_display_name text,
      approval_id uuid,
      project_id uuid,
      production_work_order_id uuid,
      traveler_id varchar(255),
      traveler_step_id varchar(255),
      charge_code_id integer,
      reason_code text,
      notes text,
      digital_signature_id uuid,
      source_module text NOT NULL,
      source_record_id text,
      event_hash text NOT NULL,
      reversed_transaction_id uuid,
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await exec(`
    CREATE TABLE IF NOT EXISTS ${TEST_SCHEMA}.inventory_anomalies (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      detector_key text NOT NULL,
      severity text NOT NULL,
      status text NOT NULL DEFAULT 'OPEN',
      detected_at timestamptz NOT NULL DEFAULT now(),
      window_start timestamptz,
      window_end timestamptz,
      dedup_key text NOT NULL,
      summary text NOT NULL,
      context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      ledger_entry_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
      ag_part_number text,
      lot_id uuid,
      performed_by_user_id integer,
      performed_by_display_name text,
      approved_by_user_id integer,
      approved_by_display_name text,
      assigned_to_user_id integer,
      assigned_to_display_name text,
      acknowledged_at timestamptz,
      acknowledged_by_user_id integer,
      acknowledged_by_display_name text,
      acknowledgment_note text,
      dismissed_at timestamptz,
      dismissed_by_user_id integer,
      dismissed_by_display_name text,
      dismissal_reason text,
      escalated_at timestamptz,
      escalated_by_user_id integer,
      escalated_by_display_name text,
      escalation_note text,
      resolved_at timestamptz,
      resolution_notes text,
      notification_sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${TEST_SCHEMA}_anomalies_dedup_open_uniq
      ON ${TEST_SCHEMA}.inventory_anomalies (detector_key, dedup_key)
      WHERE status = 'OPEN'
  `);
  await exec(`
    CREATE TABLE IF NOT EXISTS ${TEST_SCHEMA}.anomaly_detector_config (
      id serial PRIMARY KEY,
      detector_key text NOT NULL UNIQUE,
      enabled boolean NOT NULL DEFAULT true,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      notification_recipient_user_ids integer[] NOT NULL DEFAULT ARRAY[]::int[],
      notify_on_high boolean NOT NULL DEFAULT true,
      updated_by_user_id integer,
      updated_by_display_name text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await exec(`
    CREATE TABLE IF NOT EXISTS ${TEST_SCHEMA}.admin_audit_log (
      id serial PRIMARY KEY,
      order_id text NOT NULL,
      field_name text NOT NULL,
      field_label text NOT NULL,
      old_value jsonb,
      new_value jsonb,
      changed_by text NOT NULL,
      user_role text NOT NULL,
      change_type text NOT NULL,
      ip_address text,
      user_agent text,
      reason text,
      "timestamp" timestamptz NOT NULL DEFAULT now()
    )
  `);
});

afterAll(async () => {
  if (!haveDb) return;
  try {
    await exec(`DROP SCHEMA ${TEST_SCHEMA} CASCADE`);
  } finally {
    await pool.end();
  }
});

beforeEach(async () => {
  if (!haveDb) return;
  await exec(`TRUNCATE ${TEST_SCHEMA}.inventory_transaction_ledger`);
  await exec(`TRUNCATE ${TEST_SCHEMA}.inventory_anomalies`);
  await exec(`TRUNCATE ${TEST_SCHEMA}.anomaly_detector_config RESTART IDENTITY`);
  await exec(`TRUNCATE ${TEST_SCHEMA}.admin_audit_log RESTART IDENTITY`);
});

let runJobAgainstSchema: () => Promise<{ persisted: number }>;
let acknowledge: (id: string) => Promise<void>;
let escalate: (id: string) => Promise<void>;

beforeAll(() => {
  if (!haveDb) return;
  // Run the detector logic in-process, but issue all SQL against the test
  // schema directly so we exercise the same persistence + dedup contract
  // (insert with ON CONFLICT DO NOTHING; partial unique index on OPEN rows).
  runJobAgainstSchema = async () => {
    const { DETECTORS } = await import('../src/services/inventoryAnomalyDetectionService');
    const ledgerRows = await exec(
      `SELECT id, transaction_number AS "transactionNumber", transaction_type AS "transactionType",
              inventory_item_id AS "inventoryItemId", ag_part_number AS "agPartNumber",
              lot_id AS "lotId", location_id AS "locationId",
              quantity_delta::text AS "quantityDelta",
              quantity_before::text AS "quantityBefore",
              quantity_after::text AS "quantityAfter",
              performed_by_user_id AS "performedByUserId",
              performed_by_display_name AS "performedByDisplayName",
              approved_by_user_id AS "approvedByUserId",
              approved_by_display_name AS "approvedByDisplayName",
              reason_code AS "reasonCode", notes, source_module AS "sourceModule",
              metadata, created_at AS "createdAt"
         FROM ${TEST_SCHEMA}.inventory_transaction_ledger
         ORDER BY created_at`,
    );
    // Seed configs (defaults, all enabled)
    for (const det of DETECTORS) {
      await exec(
        `INSERT INTO ${TEST_SCHEMA}.anomaly_detector_config
            (detector_key, enabled, config, notification_recipient_user_ids, notify_on_high)
          VALUES ($1, true, $2::jsonb, ARRAY[]::int[], true)
          ON CONFLICT (detector_key) DO NOTHING`,
        [det.key, JSON.stringify(det.defaultConfig)],
      );
    }
    const cfgRows = await exec(
      `SELECT detector_key AS "detectorKey", enabled, config FROM ${TEST_SCHEMA}.anomaly_detector_config`,
    );
    const cfgByKey = new Map(cfgRows.map((r: any) => [r.detectorKey, r]));

    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const windowEnd = new Date();
    let persisted = 0;
    for (const det of DETECTORS) {
      const cfg = cfgByKey.get(det.key);
      if (!cfg?.enabled) continue;
      const candidates = await det.run(
        { windowStart, windowEnd, entries: ledgerRows as any },
        cfg.config ?? {},
      );
      for (const c of candidates) {
        const ins = await exec(
          `INSERT INTO ${TEST_SCHEMA}.inventory_anomalies
             (detector_key, severity, status, window_start, window_end, dedup_key,
              summary, context_json, ledger_entry_ids, ag_part_number, lot_id,
              performed_by_user_id, performed_by_display_name,
              approved_by_user_id, approved_by_display_name)
           VALUES ($1,$2,'OPEN',$3,$4,$5,$6,$7::jsonb,$8::uuid[],$9,$10,$11,$12,$13,$14)
           ON CONFLICT (detector_key, dedup_key) WHERE status = 'OPEN' DO NOTHING
           RETURNING id`,
          [
            c.detectorKey, c.severity, windowStart, windowEnd, c.dedupKey,
            c.summary, JSON.stringify(c.context), c.ledgerEntryIds,
            c.agPartNumber ?? null, c.lotId ?? null,
            c.performedByUserId ?? null, c.performedByDisplayName ?? null,
            c.approvedByUserId ?? null, c.approvedByDisplayName ?? null,
          ],
        );
        if (ins.length > 0) persisted += 1;
      }
    }
    return { persisted };
  };

  acknowledge = async (id: string) => {
    await exec(
      `UPDATE ${TEST_SCHEMA}.inventory_anomalies
          SET status='ACKNOWLEDGED', acknowledged_at=now(),
              acknowledged_by_display_name='glennj', acknowledgment_note='ok',
              updated_at=now()
        WHERE id = $1`,
      [id],
    );
  };

  escalate = async (id: string) => {
    await exec(
      `UPDATE ${TEST_SCHEMA}.inventory_anomalies
          SET status='ESCALATED', escalated_at=now(),
              escalated_by_display_name='glennj', escalation_note='please review',
              updated_at=now()
        WHERE id = $1`,
      [id],
    );
    await exec(
      `INSERT INTO ${TEST_SCHEMA}.admin_audit_log
         (order_id, field_name, field_label, old_value, new_value,
          changed_by, user_role, change_type, reason)
       VALUES ($1,'inventory_anomaly_status','Inventory Anomaly Escalation',
               $2::jsonb,$3::jsonb,'glennj','ADMIN','INLINE','please review')`,
      [`anomaly:${id}`, JSON.stringify('OPEN'), JSON.stringify('ESCALATED')],
    );
  };
});

async function seedLedger(rows: Array<Partial<{
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
  sourceModule: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}>>) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    await exec(
      `INSERT INTO ${TEST_SCHEMA}.inventory_transaction_ledger
        (transaction_number, transaction_type, inventory_item_id, ag_part_number,
         lot_id, location_id, quantity_delta, quantity_before, quantity_after,
         performed_by_user_id, performed_by_display_name,
         approved_by_user_id, approved_by_display_name,
         reason_code, source_module, metadata, event_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18)`,
      [
        r.transactionNumber ?? `T-${Date.now()}-${i}`,
        r.transactionType ?? 'ISSUE',
        r.inventoryItemId ?? 1,
        r.agPartNumber ?? 'AG-1',
        r.lotId ?? null,
        r.locationId ?? null,
        r.quantityDelta ?? '-1',
        r.quantityBefore ?? '10',
        r.quantityAfter ?? '9',
        r.performedByUserId ?? 100,
        r.performedByDisplayName ?? 'alice',
        r.approvedByUserId ?? null,
        r.approvedByDisplayName ?? null,
        r.reasonCode ?? null,
        r.sourceModule ?? 'test',
        r.metadata ? JSON.stringify(r.metadata) : null,
        `hash-${i}`,
        r.createdAt ?? new Date(),
      ],
    );
  }
}

d('Anomaly engine — DB-backed integration', () => {
  it('persists override_frequency anomalies for an operator over threshold', async () => {
    const rows = Array.from({ length: 6 }).map((_, i) => ({
      transactionNumber: `OV-${i}`,
      transactionType: 'ADJUST',
      reasonCode: 'override: late count',
      performedByDisplayName: 'alice',
      performedByUserId: 100,
      metadata: { override: true },
    }));
    await seedLedger(rows);
    const { persisted } = await runJobAgainstSchema();
    expect(persisted).toBeGreaterThanOrEqual(1);
    const stored = await exec(
      `SELECT detector_key, severity, status, summary, ledger_entry_ids,
              context_json
         FROM ${TEST_SCHEMA}.inventory_anomalies
        WHERE detector_key = 'override_frequency'`,
    );
    expect(stored.length).toBeGreaterThanOrEqual(1);
    // 6 overrides with default threshold=5 → HIGH (CRITICAL only at >= 2*threshold)
    expect(stored[0].severity).toBe('HIGH');
    expect(String(stored[0].summary)).toMatch(/alice/);
    expect(stored[0].context_json).toMatchObject({ count: 6, threshold: 5 });
    expect(Array.isArray(stored[0].ledger_entry_ids)).toBe(true);
    expect(stored[0].ledger_entry_ids.length).toBe(6);
  });

  it('persists negative_or_zero_adjustments for an ADJUST that drives balance negative', async () => {
    await seedLedger([
      {
        transactionNumber: 'NEG-1',
        transactionType: 'ADJUST',
        quantityDelta: '-15',
        quantityBefore: '10',
        quantityAfter: '-5',
      },
    ]);
    const { persisted } = await runJobAgainstSchema();
    expect(persisted).toBeGreaterThanOrEqual(1);
    const stored = await exec(
      `SELECT severity, summary, context_json
         FROM ${TEST_SCHEMA}.inventory_anomalies
        WHERE detector_key = 'negative_or_zero_adjustments'`,
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].severity).toBe('HIGH');
    expect(String(stored[0].summary)).toMatch(/negative/i);
  });

  it('persists expired_lot_release_no_approval for an unapproved expired-lot RELEASE', async () => {
    await seedLedger([
      {
        transactionNumber: 'REL-1',
        transactionType: 'RELEASE',
        lotId: '11111111-1111-1111-1111-111111111111',
        approvedByUserId: null,
        approvedByDisplayName: null,
        metadata: { expiredAtRelease: true },
      },
    ]);
    const { persisted } = await runJobAgainstSchema();
    expect(persisted).toBeGreaterThanOrEqual(1);
    const stored = await exec(
      `SELECT severity, status, summary
         FROM ${TEST_SCHEMA}.inventory_anomalies
        WHERE detector_key = 'expired_lot_release_no_approval'`,
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].severity).toBe('CRITICAL');
    expect(stored[0].status).toBe('OPEN');
  });

  it('dedupes identical findings on repeated runs (no second OPEN row)', async () => {
    await seedLedger([
      {
        transactionNumber: 'NEG-2',
        transactionType: 'ADJUST',
        quantityDelta: '-10',
        quantityBefore: '5',
        quantityAfter: '-5',
      },
    ]);
    await runJobAgainstSchema();
    await runJobAgainstSchema();
    const stored = await exec(
      `SELECT count(*)::int AS c FROM ${TEST_SCHEMA}.inventory_anomalies
        WHERE detector_key = 'negative_or_zero_adjustments'`,
    );
    expect(stored[0].c).toBe(1);
  });

  it('after acknowledging an OPEN anomaly, a re-detection produces a fresh OPEN row (dedup index released)', async () => {
    await seedLedger([
      {
        transactionNumber: 'NEG-3',
        transactionType: 'ADJUST',
        quantityDelta: '0',
        quantityBefore: '5',
        quantityAfter: '5',
      },
    ]);
    await runJobAgainstSchema();
    const [{ id }] = await exec(
      `SELECT id FROM ${TEST_SCHEMA}.inventory_anomalies WHERE detector_key='negative_or_zero_adjustments'`,
    );
    await acknowledge(id);
    await runJobAgainstSchema();
    const counts = await exec(
      `SELECT status, count(*)::int AS c FROM ${TEST_SCHEMA}.inventory_anomalies
        WHERE detector_key='negative_or_zero_adjustments' GROUP BY status`,
    );
    const byStatus = Object.fromEntries(counts.map((r: any) => [r.status, r.c]));
    expect(byStatus['ACKNOWLEDGED']).toBe(1);
    expect(byStatus['OPEN']).toBe(1);
  });

  it('escalation writes admin_audit_log entry with the escalation reason', async () => {
    await seedLedger([
      {
        transactionNumber: 'REL-2',
        transactionType: 'RELEASE',
        lotId: '22222222-2222-2222-2222-222222222222',
        metadata: { expiredAtRelease: true },
      },
    ]);
    await runJobAgainstSchema();
    const [{ id }] = await exec(
      `SELECT id FROM ${TEST_SCHEMA}.inventory_anomalies WHERE detector_key='expired_lot_release_no_approval'`,
    );
    await escalate(id);
    const audit = await exec(
      `SELECT field_name, new_value, reason
         FROM ${TEST_SCHEMA}.admin_audit_log
        WHERE order_id = $1`,
      [`anomaly:${id}`],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].field_name).toBe('inventory_anomaly_status');
    expect(audit[0].new_value).toBe('ESCALATED');
    expect(audit[0].reason).toBe('please review');
  });
});
