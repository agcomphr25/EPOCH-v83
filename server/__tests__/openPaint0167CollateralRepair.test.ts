import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

describe('open Paint orders after migration 0167 collateral', () => {
  it('guards 0167 from overwriting an open active-department transition', () => {
    const sql = fs.readFileSync(
      path.join(root, 'migrations/0167_repair_customer_signature_fulfilled_orders.sql'),
      'utf8',
    );

    expect(sql).toContain("transition.exited_at IS NULL");
    expect(sql).toContain("transition.entity_type = 'p1_order'");
    expect(sql).toContain("transition.department NOT IN");
  });

  it('repairs only the four audited orders with open Paint transitions', () => {
    const sql = fs.readFileSync(
      path.join(root, 'migrations/0243_restore_open_paint_orders_after_0167_collateral.sql'),
      'utf8',
    );

    for (const orderId of ['FC1696', 'FE280', 'FD717', 'FE033']) {
      expect(sql).toContain(`'${orderId}'`);
    }
    expect(sql).toContain("transition.department = 'Paint'");
    expect(sql).toContain("transition.exited_at IS NULL");
    expect(sql).toContain("ao.current_department = 'P1 Production Queue'");
    expect(sql).toContain("reason_code = 'CUSTOMER_SIGNATURE_FULFILLED_REPAIR'");
    expect(sql).toContain("current_department = 'Paint'");
  });
});
