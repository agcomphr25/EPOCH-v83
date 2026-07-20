import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('layup schedule P1 demand ownership', () => {
  it('does not mutate purchase-order demand while replacing schedule rows', () => {
    const source = readFileSync(
      new URL('../src/routes/layupSchedule.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(
      /UPDATE\s+purchase_order_items\s+SET\s+order_count\s*=\s*(?:GREATEST\([^;]+-\s*\$1|COALESCE\([^;]+\+\s*\$1)/is,
    );
  });
});
