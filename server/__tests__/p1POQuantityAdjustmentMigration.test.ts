import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve('migrations/0231_p1_po_item_quantity_adjustments.sql'),
  'utf8'
);

describe('P1 PO quantity-adjustment migration', () => {
  it('is additive and preserves the original PO-line quantity', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS purchase_order_item_quantity_adjustments'
    );
    expect(migration).not.toMatch(/UPDATE\s+purchase_order_items/i);
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+purchase_order_items/i);
  });

  it('enforces positive constrained adjustments and immutable history', () => {
    expect(migration).toContain(
      "CHECK (adjustment_type IN ('CANCEL_QUANTITY', 'RESTORE_QUANTITY'))"
    );
    expect(migration).toContain('CHECK (quantity > 0)');
    expect(migration).toContain(
      'BEFORE UPDATE ON purchase_order_item_quantity_adjustments'
    );
    expect(migration).toContain(
      'BEFORE DELETE ON purchase_order_item_quantity_adjustments'
    );
  });

  it('records user identity and supports line-scoped idempotency', () => {
    expect(migration).toContain('created_by_user_id integer NOT NULL');
    expect(migration).toContain('created_by_display_name text NOT NULL');
    expect(migration).toContain(
      'UNIQUE (purchase_order_item_id, idempotency_key)'
    );
  });
});
