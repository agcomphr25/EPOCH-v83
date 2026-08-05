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
});
