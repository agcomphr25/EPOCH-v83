import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve('client/src/components/POManager.tsx'),
  'utf8'
);

describe('P1 Purchase Orders reconciliation UI contract', () => {
  it('renders the authoritative line-level reconciliation breakdown', () => {
    for (const label of [
      'Original PO Qty',
      'Customer-Canceled Qty',
      'Active PO Qty',
      'Shipped',
      'In Progress',
      'Pending Queue',
      'Available to Progress',
      'Variance',
      'Reconciled',
      'Needs Review',
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain('In Progress detail (included above)');
  });

  it('uses the backend reconciliation rather than the legacy production badge', () => {
    expect(source).toContain('`/api/pos/${po.id}/reconciliation`');
    expect(source).not.toContain(
      '<ProductionStatusBadge productionOrders={productionOrders}'
    );
  });

  it('gates adjustment actions and requires a reason before confirmation', () => {
    expect(source).toContain("can('purchasing.manage_pos')");
    expect(source).toContain('reason.trim().length === 0');
    expect(source).toContain('Cancel Remaining Quantity');
    expect(source).toContain('Restore Canceled Quantity');
    expect(source).toContain('View Quantity Adjustment History');
    expect(source).toContain('It does not cancel or create production units.');
  });
});
