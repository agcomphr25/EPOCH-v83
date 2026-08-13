import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Domain Truth shipped-order production report', () => {
  const source = readFileSync(
    join(process.cwd(), 'client/src/pages/DomainTruthInspector.tsx'),
    'utf8',
  );

  it('exposes the read-only safety report in Domain Truth Inspector', () => {
    expect(source).toContain('Shipped Orders Back in Production');
    expect(source).toContain("apiRequest('/api/admin/domain-truth/shipped-in-production')");
    expect(source).toContain('Read-only safety report');
  });

  it('shows shipment evidence and migration collision details', () => {
    expect(source).toContain('row.shipped_date');
    expect(source).toContain('row.tracking_number');
    expect(source).toContain('row.colliding_order_ids');
    expect(source).toContain('LIKELY_0167_ID_COLLISION');
  });
});
