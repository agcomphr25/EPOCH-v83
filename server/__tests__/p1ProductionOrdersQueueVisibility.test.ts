import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('P1 production order queue visibility', () => {
  const source = readFileSync(
    join(process.cwd(), 'server/src/routes/productionQueue.ts'),
    'utf8',
  );

  it('includes pending Purchase Order Management children in the prioritized queue', () => {
    expect(source).toContain('FROM production_orders p');
    expect(source).toContain(
      "UPPER(COALESCE(p.production_status, '')) IN ('PENDING', 'IN_PROGRESS', 'ACTIVE')",
    );
  });

  it('deduplicates production children already mirrored into all_orders', () => {
    expect(source).toContain('AND NOT EXISTS (');
    expect(source).toContain('WHERE mirrored.order_id = p.order_id');
  });
});
