import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeMigrationFiles } from '../scripts/migrations/runSafeBootMigrations';

const root = process.cwd();
const migration = '0301_repair_0171_manufacturing_bypass.sql';
const affectedOrders = ['FD001', 'FD007', 'FD690', 'FD787', 'FD832', 'FE039', 'FE108', 'FE241'];

describe('migration 0171 manufacturing-bypass containment', () => {
  it('uses the immutable 0257 ledger and fail-closes to the reviewed eight orders', () => {
    const sql = readFileSync(path.join(root, 'migrations', migration), 'utf8');
    expect(sql).toContain("reason_code = 'RESTORE_SHIPPING_QC_AFTER_0171_REPLAY'");
    expect(sql).toContain('expected exactly the reviewed eight 0171 orders');
    for (const orderId of affectedOrders) expect(sql).toContain(`'${orderId}'`);
  });

  it('returns only the four unmanufactured Shipping QC orders to P1', () => {
    const sql = readFileSync(path.join(root, 'migrations', migration), 'utf8');
    expect(sql).toContain("IN ('FD007','FD690','FE108','FE241')");
    expect(sql).toContain("THEN 'RETURN_TO_P1_MANUFACTURING'");
    expect(sql).toContain("current_department = 'P1 Production Queue'");
    expect(sql).toContain("'REPAIR_0171_MANUFACTURING_BYPASS'");
    expect(sql).not.toContain('shipment_accounting_snapshots');
    expect(sql).not.toContain("current_department = 'Shipping Management'");
  });

  it('repairs FD787 transition history without changing its canonical CNC state', () => {
    const sql = readFileSync(path.join(root, 'migrations', migration), 'utf8');
    expect(sql).toContain("orders.order_id = 'FD787'");
    expect(sql).toContain("orders.current_department = 'CNC'");
    expect(sql).toContain("'REPAIR_FD787_STALE_OPEN_TRANSITION'");
    expect(sql).toContain("'canonicalDepartmentChanged', false");
  });

  it('keeps every historical row repair out of recurring safe boot', () => {
    expect(safeMigrationFiles).not.toContain('0257_restore_shipping_qc_after_0171_replay.sql');
    expect(safeMigrationFiles).not.toContain('0281_contain_shipped_p1_auto_populate_regression.sql');
    expect(safeMigrationFiles).not.toContain(migration);
  });
});

describe('Shipping QC manufacturing gate', () => {
  const orders = readFileSync(path.join(root, 'server/src/routes/orders.ts'), 'utf8');
  const productionQueue = readFileSync(path.join(root, 'server/src/routes/productionQueue.ts'), 'utf8');

  it('blocks direct progression from P1 Production Queue to Shipping QC', () => {
    expect(orders).toContain("code: 'SHIPPING_QC_MANUFACTURING_EVIDENCE_REQUIRED'");
    expect(orders).toContain("existingOrder.currentDepartment !== 'Paint'");
    expect(orders).toContain("existingOrder.currentDepartment !== 'Finish QC'");
    expect(orders).not.toContain('has no stock model - routing directly to Shipping QC');
  });

  it('keeps invalid stock models in P1 for attention and performs no auto-move', () => {
    expect(productionQueue).toContain('no departments were changed');
    expect(productionQueue).not.toContain('AUTO-MOVING');
    expect(productionQueue).not.toContain("currentDepartment: 'Shipping QC'");
  });

  it('writes finalized canonical and transition state in one transaction', () => {
    expect(orders).toContain('UPDATE order_department_transitions');
    expect(orders).toContain('INSERT INTO order_department_transitions');
    expect(orders).toContain('if (!isFinalized)');
  });
});
