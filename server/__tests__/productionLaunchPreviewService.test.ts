import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const service = readFileSync(
  resolve(root, 'server/src/services/productionLaunchPreviewService.ts'),
  'utf8'
);
const route = readFileSync(
  resolve(root, 'server/src/routes/projectProductionPlanning.ts'),
  'utf8'
);

describe('Production Launch Phase 1 preview boundary', () => {
  it('executes inside an explicit read-only transaction', () => {
    expect(service).toContain('SET TRANSACTION READ ONLY');
    expect(service).not.toMatch(
      /sql`[^`]*\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^`]*`/i
    );
    expect(service).toContain("mode: 'PREVIEW_ONLY'");
    expect(service).toContain('createsRecords: false');
  });

  it('is permission controlled and separately feature gated', () => {
    expect(route).toMatch(
      /router\.get\('\/launch-preview'[\s\S]*projects\.production_planning\.manage/
    );
    expect(service).toContain('isP2V2ProductionLaunchPreviewEnabled()');
    expect(service).toContain('P2_V2_PRODUCTION_LAUNCH_PREVIEW_DISABLED');
  });

  it('uses the immutable customer-demand event ledger for root quantity authority', () => {
    expect(service).toContain('p2_customer_demand_quantity_events');
    expect(service).toContain('poi.quantity+COALESCE(SUM(e.quantity_delta),0)');
    expect(service).toContain('demandLineIdentity');
    expect(service).toContain("createHash('sha256')");
  });
});
