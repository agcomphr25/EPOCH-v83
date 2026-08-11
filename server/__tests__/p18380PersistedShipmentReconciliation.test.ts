import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';

describe('P18380 persisted shipment reconciliation', () => {
  const migrationName = '0267_reconcile_p18380_persisted_shipment.sql';
  const sql = readFileSync(
    join(process.cwd(), 'migrations', migrationName),
    'utf8'
  );

  it('is registered as a critical safe-boot migration', () => {
    expect(safeMigrationFiles).toContain(migrationName);
    expect(criticalMigrationFiles.has(migrationName)).toBe(true);
  });

  it('fails closed around the exact order and persisted shipment evidence', () => {
    expect(sql).toContain("order_id = 'PO-P18380-46-1'");
    expect(sql).toContain("v_order.po_number IS DISTINCT FROM 'P18380'");
    expect(sql).toContain('v_order.po_item_id IS DISTINCT FROM 48');
    expect(sql).toContain(
      "v_order.item_name IS DISTINCT FROM 'AG-FG-ADJ-AHV205-CDN'"
    );
    expect(sql).toContain(
      "shipment.master_tracking_number = '1Z27835W0391723408'"
    );
    expect(sql).toContain(
      "v_shipped_at::date IS DISTINCT FROM DATE '2026-03-25'"
    );
    expect(sql).toContain('IF v_shipment_count <> 1 THEN');
  });

  it('repairs fulfillment and records transition and audit evidence', () => {
    expect(sql).toContain("production_status = 'SHIPPED'");
    expect(sql).toContain("current_department = 'Shipped'");
    expect(sql).toContain('is_fulfilled = true');
    expect(sql).toContain('fulfilled_date = v_shipped_at');
    expect(sql).toContain("'PERSISTED_SHIPMENT_STATE_RECONCILED'");
    expect(sql).toContain('INSERT INTO order_department_transitions');
    expect(sql).toContain('INSERT INTO audit_events');
  });
});
