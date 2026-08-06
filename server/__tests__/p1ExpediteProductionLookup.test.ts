import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/services/p1ExpediteService.ts', import.meta.url),
  'utf8'
);

describe('P1 expedite helper lookup authority', () => {
  it('resolves requested IDs directly from production_orders', () => {
    expect(source).toContain('SELECT * FROM production_orders candidate');
    expect(source).toContain('UPPER(candidate.order_id) = requested.requested_id');
  });

  it('treats all_orders as an optional mirror', () => {
    expect(source).toContain('if (row.allOrderId)');
    expect(source).not.toContain("if (row.order_id && !row.production_order_id)");
  });

  it('allows both approved fast-track customers', () => {
    expect(source).toContain("['pure precision', 'wilson combat']");
    expect(source).toContain('isExpediteCustomer(row.customer_name)');
    expect(source).toContain('not Pure Precision or Wilson Combat');
  });

  it('supports an audited all-or-nothing reversal of a selected batch', () => {
    expect(source).toContain("event_type = 'P1_EXPEDITED_TO_SHIPPING_QC'");
    expect(source).toContain("'P1_EXPEDITE_BATCH_REVERSED'");
    expect(source).toContain("metadata->>'originalCorrelationId'");
    expect(source).toContain('has_later_activity');
    expect(source).toContain("new Error('No orders were changed because the batch is no longer safe to undo')");
    expect(source).toContain("await client.query('ROLLBACK')");
  });

  it('selects an exact historical batch from the requested order IDs', () => {
    expect(source).toContain('matched.order_id = ANY($1::text[])');
    expect(source).toContain('COUNT(DISTINCT matched.order_id) = cardinality($1::text[])');
    expect(source).toContain('COUNT(DISTINCT original.order_id) = cardinality($1::text[])');
    expect(source).toContain('loadSelectedUndoPreview(input.ids');
  });
});
