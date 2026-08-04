import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getP2V2StagesForDefinitionVersion,
  P2_V2_DEFINITION_VERSION,
} from '../src/services/projectWorkflowRegistry';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('prospective P2 V2 definition v3', () => {
  it('is the current immutable ten-stage definition and retains v1/v2 compatibility', () => {
    expect(P2_V2_DEFINITION_VERSION).toBe(3);
    expect(
      getP2V2StagesForDefinitionVersion(3).map((stage) => stage.label)
    ).toEqual([
      'RFQ Review',
      'Estimate & Quote',
      'Purchase/Contract Review',
      'Technical & Configuration Review',
      'Production Planning',
      'WAD Authorization',
      'Preproduction Readiness',
      'Approve and Release to P2',
      'P2 Execution',
      'Project Closing',
    ]);
    expect(getP2V2StagesForDefinitionVersion(1)).toHaveLength(10);
    expect(
      getP2V2StagesForDefinitionVersion(2).map((stage) => stage.label)
    ).toContain('Shipping & Project Closing');
    expect(() => getP2V2StagesForDefinitionVersion(4)).toThrow(
      'Unknown p2_v2 definition version 4'
    );
  });

  it('adds evidence prospectively without rewriting workflow instances', () => {
    const migration = read('migrations/0253_p2_v2_definition_v3_handoff.sql');
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS project_p2_control_center_releases'
    );
    expect(migration).not.toMatch(
      /UPDATE\s+(?:projects|project_workflow_instances|project_workflow_step_instances)\b/i
    );
    expect(
      migration.replace(/ON DELETE (?:RESTRICT|SET NULL)/gi, '')
    ).not.toMatch(/\b(?:DELETE|TRUNCATE)\b/i);
    expect(migration).toContain('definition_version = 3');
    expect(migration).toContain(
      'P2 Control Center release evidence is immutable'
    );
  });

  it('keeps approval and handoff separate, locked, idempotent, and non-duplicating', () => {
    const service = read('server/src/services/projectP2HandoffService.ts');
    const route = read('server/src/routes/projectP2Handoff.ts');
    expect(route).toContain('projects.p2_handoff.release');
    expect(route).toContain('projects.production_release.approve');
    expect(route).toContain("router.post('/approve'");
    expect(route).toContain("router.post('/release'");
    expect(route).toContain("z.literal('RELEASE TO P2 CONTROL CENTER')");
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('IDEMPOTENCY_CONFLICT');
    expect(service).toContain('PRODUCTION_RELEASE_EVIDENCE_STALE');
    expect(service).toContain('productionOrdersCreated: 0');
    expect(service).toContain('travelersCreated: 0');
    expect(service).not.toContain('generateP2ProductionOrders');
    expect(service).not.toContain('INSERT INTO travelers');
  });

  it('derives execution and closing readiness from authoritative P2 quantities and holds', () => {
    const service = read('server/src/services/projectP2HandoffService.ts');
    for (const table of [
      'p2_production_orders',
      'p2_final_inspection_results',
      'project_product_releases',
      'project_shipment_allocation_links',
      'project_production_holds',
      'project_product_release_holds',
      'project_shipping_holds',
      'nonconformance_records',
    ])
      expect(service).toContain(table);
    expect(service).toContain('executionComplete');
    expect(service).toContain('closingUnlocked: executionComplete');
  });
});
