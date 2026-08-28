import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('stock-build readiness foundation', () => {
  it('lists every active manufactured inventory part without creating work', () => {
    const service = read('server/src/services/stockBuildReadinessService.ts');
    expect(service).toContain(
      "i.is_active=true AND i.item_type='MANUFACTURED'"
    );
    expect(service).toContain('released_bom_count');
    expect(service).toContain('active_routing_count');
    expect(service).toContain('released_traceability_policy_count');
    expect(service).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });

  it('fails closed when P1 or P2 classification authority is ambiguous', () => {
    const service = read('server/src/services/stockBuildReadinessService.ts');
    expect(service).toContain(
      'utilized_in_pl1 === true && row.utilized_in_pl2 !== true'
    );
    expect(service).toContain(
      'utilized_in_pl2 === true && row.utilized_in_pl1 !== true'
    );
    expect(service).toContain('assigned to both P1 and P2');
  });

  it('keeps release disabled in the first UI increment', () => {
    const page = read('client/src/pages/ManufacturingQueue.tsx');
    expect(page).toContain('Search active manufactured parts');
    expect(page).toContain('readyForStockBuildPreview');
    expect(page).toContain('Release Stock Work Order (coming next)');
    expect(page).toContain('<Button type="button" disabled');
  });
});
