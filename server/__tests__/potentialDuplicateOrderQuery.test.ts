import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const duplicateOrderService = readFileSync(
  resolve(
    process.cwd(),
    'server/src/services/potentialDuplicateOrderService.ts'
  ),
  'utf8'
);

describe('potential duplicate order query', () => {
  it('aggregates customer addresses laterally instead of grouping all_orders columns', () => {
    const queryStart = duplicateOrderService.indexOf(
      'const candidatesResult = await pool.query('
    );
    const queryEnd = duplicateOrderService.indexOf(
      '    [input.modelId, input.orderId]',
      queryStart
    );
    expect(queryStart).toBeGreaterThanOrEqual(0);
    expect(queryEnd).toBeGreaterThan(queryStart);

    const query = duplicateOrderService.slice(queryStart, queryEnd);
    expect(query).toContain('LEFT JOIN LATERAL (');
    expect(query).toContain('WHERE ca.customer_id = c.id');
    expect(query).not.toContain('GROUP BY ao.id');
  });
});
