import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read(
  'migrations/0309_p2_quality_shipment_release_foundation.sql'
);
const service = read('server/src/services/p2QualityShipmentReleaseService.ts');
const routes = read('server/src/routes/p2ManufacturingWorkOrders.ts');
const flags = read('server/src/lib/featureFlags.ts');
const boot = read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('Phase 12 Quality and shipment-release authority', () => {
  it('is additive, prospective, and registered after Phase 11', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS p2_manufactured_output_quality_acceptances'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS p2_manufactured_output_shipment_releases'
    );
    expect(migration).not.toMatch(/^\s*(UPDATE|DELETE)\s+/im);
    expect(
      boot.indexOf('0309_p2_quality_shipment_release_foundation.sql')
    ).toBeGreaterThan(
      boot.indexOf('0308_p2_manufactured_component_issue_genealogy.sql')
    );
  });

  it('requires released output and its exact available custody', () => {
    expect(service).toContain('RELEASED_OUTPUT_REQUIRED');
    expect(service).toContain("o.status='RELEASED'");
    expect(service).toContain('c.output_authority_id=o.id');
    expect(service).toContain('SHIPMENT_RELEASE_BLOCKED');
    expect(service).toContain('QUALITY_CUSTODY_BLOCKED');
    expect(service).toContain("custody_status !== 'AVAILABLE'");
    expect(service).toContain('Number(row.issued_quantity) !== 0');
    expect(service).toContain('Number(row.reversed_quantity) !== 0');
    expect(service).toContain(
      'Number(row.available_quantity) !== Number(row.received_quantity)'
    );
  });

  it('enforces independent Quality and shipment-release authority', () => {
    expect(service).toContain('INDEPENDENT_QUALITY_REQUIRED');
    expect(service).toContain('INDEPENDENT_SHIPMENT_RELEASE_REQUIRED');
    expect(service).toContain('quality.accepted_by_user_id === actor.userId');
    expect(migration).toContain('accepted_by_employee_id INTEGER NOT NULL');
    expect(migration).toContain('released_by_employee_id INTEGER NOT NULL');
  });

  it('is immutable, concurrent, and retry-idempotent', () => {
    expect(migration).toContain('p2_quality_shipment_evidence_immutable');
    expect(migration).toContain('BEFORE UPDATE OR DELETE');
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('QUALITY_IDEMPOTENCY_CONFLICT');
    expect(service).toContain('SHIPMENT_RELEASE_IDEMPOTENCY_CONFLICT');
    expect(service).toContain('authority_checksum');
  });

  it('keeps mutation permissions narrow and exact-true gates disabled', () => {
    expect(routes).toContain(
      "requirePermission('p2.manufactured_output.quality_accept')"
    );
    expect(routes).toContain(
      "requirePermission('p2.manufactured_output.shipment_release')"
    );
    expect(flags).toContain(
      "envBool('P2_QUALITY_SHIPMENT_RELEASE_READS_ENABLED', false)"
    );
    expect(flags).toContain(
      "envBool('P2_QUALITY_SHIPMENT_RELEASE_WRITES_ENABLED', false)"
    );
  });

  it('creates eligibility evidence only, not shipment, balance, or genealogy behavior', () => {
    expect(migration).toContain("release_scope='SHIPMENT_ELIGIBILITY_ONLY'");
    expect(service).not.toMatch(
      /INSERT INTO (inventory_transaction_ledger|shipments|packing_slips|p2_manufactured_component_genealogy_edges)/i
    );
    expect(routes).not.toContain('VITE_P2_QUALITY_SHIPMENT');
  });
});
