import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

describe('migration 0167 duplicate-ID collateral repair', () => {
  it('updates the original migration by unique order ID', () => {
    const sql = fs.readFileSync(
      path.join(root, 'migrations/0167_repair_customer_signature_fulfilled_orders.sql'),
      'utf8',
    );

    expect(sql).toContain('WHERE ao.order_id = tmp.order_id');
    expect(sql).not.toContain('WHERE ao.id = tmp.id');
  });

  it('restores only the verified shipped collision set with audit provenance', () => {
    const sql = fs.readFileSync(
      path.join(root, 'migrations/0244_restore_shipped_orders_after_0167_id_collision.sql'),
      'utf8',
    );

    for (const orderId of [
      'EI145', 'EI156', 'AG060', 'EI150', 'EI151', 'EI153',
      'EI155', 'EI165', 'EI007', 'EI142', 'EI148', 'EI209',
    ]) {
      expect(sql).toContain(`'${orderId}'`);
    }
    expect(sql).toContain("prior.reason_code = 'RESTORE_SHIPPED_AFTER_0167_ID_COLLISION'");
    expect(sql).toContain('collision.id = ao.id');
    expect(sql).toContain('collision.order_id <> ao.order_id');
    expect(sql).toContain("exit_reason = 'historical shipment reconciliation'");
    expect(sql).toContain("current_department = 'Shipping Management'");
  });
});
