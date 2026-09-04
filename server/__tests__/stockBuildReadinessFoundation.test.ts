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
    const listSection = service.slice(
      service.indexOf('async function loadActiveManufacturedStockBuildParts'),
      service.indexOf('export type StockBuildActor')
    );
    expect(listSection).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });

  it('selects UUID readiness authorities without unsupported UUID aggregates', () => {
    const service = read('server/src/services/stockBuildReadinessService.ts');
    expect(service).not.toMatch(/max\((br|pr|tp)\.id\)/i);
    expect(service).toContain(
      'ORDER BY br.effective_from DESC NULLS LAST,br.created_at DESC,br.id::text DESC'
    );
    expect(service).toContain(
      'ORDER BY tp.effective_from DESC NULLS LAST,tp.created_at DESC,tp.id::text DESC'
    );
    expect(service).toContain(
      'ORDER BY pr.updated_at DESC NULLS LAST,pr.created_at DESC,pr.id::text DESC'
    );
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

  it('creates only a gated controlled draft from the UI', () => {
    const page = read('client/src/pages/ManufacturingQueue.tsx');
    expect(page).toContain('Search active manufactured parts');
    expect(page).toContain('readyForStockBuildPreview');
    expect(page).toContain('VITE_STOCK_BUILD_REQUEST_WRITES_ENABLED');
    expect(page).toContain('Save Controlled Draft');
    expect(page).not.toContain('Release Stock Work Order');
  });

  it('shows all active production queues instead of three hard-coded filters', () => {
    const page = read('client/src/pages/ManufacturingQueue.tsx');
    expect(page).toContain("const ALL_MANUFACTURING_QUEUES = '__ALL__'");
    expect(page).toContain('/api/shared-departments?routingOnly=true');
    expect(page).toContain('department.productionEnabled !== false');
    expect(page).toContain('All Queues');
    expect(page).toContain('manufacturingQueues.map');
  });

  it('registers an additive immutable request and event authority', () => {
    const migration = read('migrations/0311_stock_build_request_authority.sql');
    const registry = read('server/scripts/migrations/runSafeBootMigrations.ts');
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS stock_build_requests'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS stock_build_request_events'
    );
    expect(migration).toContain('Stock-build request events are append-only');
    expect(migration).not.toMatch(
      /UPDATE\s+(inventory_items|manufacturing_queue|production_work_orders)/i
    );
    expect(
      registry.match(/0311_stock_build_request_authority\.sql/g)
    ).toHaveLength(2);
  });

  it('keeps release and inventory posting out of the draft service', () => {
    const service = read('server/src/services/stockBuildReadinessService.ts');
    const route = read('server/src/routes/stockBuildReadiness.ts');
    expect(route).toContain('areStockBuildRequestWritesEnabled()');
    expect(service).not.toMatch(
      /INSERT INTO (production_work_orders|manufacturing_queue|inventory_balances)/i
    );
    expect(service).not.toMatch(
      /UPDATE\s+(inventory_balances|production_work_orders|manufacturing_queue)/i
    );
  });

  it('records only a gated signed release-readiness decision', () => {
    const service = read('server/src/services/stockBuildReadinessService.ts');
    const route = read('server/src/routes/stockBuildReadiness.ts');
    const migration = read('migrations/0312_stock_build_release_readiness.sql');
    const registry = read('server/scripts/migrations/runSafeBootMigrations.ts');
    expect(service).toContain('evaluateReleaseReadiness');
    expect(service).toContain('STOCK_BUILD_STALE_VERSION');
    expect(service).toContain('releasedBomRevisionId');
    expect(service).toContain('activeRoutingId');
    expect(service).toContain('releasedTraceabilityPolicyId');
    expect(service).toContain('recreate it before release');
    expect(service).toContain("status='READY_FOR_RELEASE'");
    expect(service).toContain('authoritativeOpenSupplyQuantity = 0');
    expect(route).toContain('areStockBuildReleaseReadinessWritesEnabled()');
    expect(route).toContain('manufacturing.stock_build.release');
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS stock_build_release_decisions'
    );
    expect(migration).toContain('release decisions are append-only');
    expect(
      registry.match(/0312_stock_build_release_readiness\.sql/g)
    ).toHaveLength(2);
    expect(service).not.toMatch(
      /INSERT INTO (production_work_orders|manufacturing_queue|inventory_balances)/i
    );
  });

  it('keeps the raw stock-build classification column out of the global inventory type', () => {
    const schema = read('server/schema.ts');
    expect(schema).not.toContain(
      "stockBuildProductionSystem: text('stock_build_production_system')"
    );
  });
});
