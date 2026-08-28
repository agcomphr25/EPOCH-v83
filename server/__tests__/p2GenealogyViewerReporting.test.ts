import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');
const service = read('server/src/services/p2GenealogyViewerService.ts');
const routes = read('server/src/routes/p2ManufacturingWorkOrders.ts');
const flags = read('server/src/lib/featureFlags.ts');
const page = read('client/src/pages/P2ControlCenter.tsx');
const viewer = read('client/src/components/p2/P2GenealogyViewer.tsx');

describe('Phase 13 P2 genealogy viewer, search, and reporting', () => {
  it('is read-only and uses existing Phase 10-12 authorities', () => {
    expect(service).toContain('p2_manufactured_output_authorities');
    expect(service).toContain('p2_manufactured_component_genealogy_edges');
    expect(service).toContain('p2_material_genealogy_edges');
    expect(service).toContain('p2_manufactured_output_quality_acceptances');
    expect(service).toContain('p2_manufactured_output_shipment_releases');
    expect(service).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  });

  it('searches authoritative identities and returns checksummed evidence', () => {
    expect(service).toContain('output_identity');
    expect(service).toContain('part_number_snapshot');
    expect(service).toContain('assembly_path_identity');
    expect(service).toContain('production_work_order_id');
    expect(service).toContain('traveler_id');
    expect(service).toContain('authority_checksum');
    expect(service).toContain('GENEALOGY_SEARCH_TOO_BROAD');
    expect(service).toContain('GENEALOGY_PROJECT_TOO_LARGE');
  });

  it('keeps both client and server disabled unless exactly true', () => {
    expect(flags).toContain("envBool('P2_GENEALOGY_VIEWER_ENABLED', false)");
    expect(page).toContain(
      "import.meta.env.VITE_P2_GENEALOGY_VIEWER_ENABLED === 'true'"
    );
    expect(routes).toContain('enabled(isP2GenealogyViewerEnabled())');
  });

  it('requires authenticated P2 view authority on the server', () => {
    expect(routes).toContain("'/p2-genealogy/search'");
    expect(routes).toContain("requirePermission('p2.work_orders.view')");
    expect(routes).toContain('authenticateToken');
  });

  it('reuses P2 Control Center and supports CSV and evidence JSON reporting', () => {
    expect(page).toContain('data-testid="tab-genealogy"');
    expect(page).toContain('<P2GenealogyViewer />');
    expect(viewer).toContain('Export CSV');
    expect(viewer).toContain('Evidence JSON');
    expect(viewer).toContain('Authority checksum:');
  });

  it('adds no Phase 14 mutation, shipment execution, balance, or genealogy writes', () => {
    expect(service).not.toMatch(
      /inventory_transaction_ledger|packing_slip|CREATE TABLE|shipment execution/i
    );
    expect(routes).not.toContain('VITE_P2_GENEALOGY_VIEWER');
  });
});
