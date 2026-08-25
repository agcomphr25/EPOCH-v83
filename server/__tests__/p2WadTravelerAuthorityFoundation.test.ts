import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Phase 4 WAD traveler authority', () => {
  const foundation = read(
    'migrations/0297_p2_wad_traveler_authority_foundation.sql'
  );
  const completion = read(
    'migrations/0298_p2_wad_traveler_authority_completion.sql'
  );
  const flags = read('server/src/lib/featureFlags.ts');
  const registry = read('server/scripts/migrations/runSafeBootMigrations.ts');
  const routes = read('server/src/routes/projectWadAuthorization.ts');
  const service = read('server/src/services/p2WadTravelerDecisionService.ts');
  const wad = read('server/src/services/projectWadAuthorizationService.ts');
  const client = read(
    'client/src/components/projects/P2V2WadAuthorization.tsx'
  );

  it('is additive, registered, and ordered after Phase 3', () => {
    expect(foundation).not.toMatch(
      /^[ \t]*(UPDATE\b|DELETE FROM\b|TRUNCATE\b)/im
    );
    expect(
      registry.match(/0297_p2_wad_traveler_authority_foundation\.sql/g)
    ).toHaveLength(2);
    expect(
      registry.match(/0298_p2_wad_traveler_authority_completion\.sql/g)
    ).toHaveLength(2);
    expect(registry.indexOf('0296_p2_project')).toBeLessThan(
      registry.indexOf('0297_p2_wad')
    );
    expect(registry.indexOf('0297_p2_wad')).toBeLessThan(
      registry.indexOf('0298_p2_wad')
    );
  });

  it('binds decisions to released identities and immutable snapshots', () => {
    for (const value of [
      'project_configuration_id',
      'inventory_item_id',
      'assembly_path_identity',
      'traceability_policy_id',
      'traceability_policy_revision',
      'content_checksum',
    ])
      expect(foundation).toContain(value);
    expect(completion).toContain(
      'ADD COLUMN IF NOT EXISTS concurrency_version'
    );
    expect(completion).toContain(
      'CREATE TABLE IF NOT EXISTS p2_wad_traveler_decision_events'
    );
    expect(completion).toContain("OLD.status='VALIDATED'");
  });

  it('enforces flags, permissions, independence, and WAD readiness', () => {
    expect(flags).toContain(
      "envBool('P2_WAD_TRAVELER_DECISION_READS_ENABLED', false)"
    );
    expect(flags).toContain(
      "envBool('P2_WAD_TRAVELER_DECISION_WRITES_ENABLED', false)"
    );
    expect(routes).toContain('areP2WadTravelerDecisionWritesEnabled()');
    expect(routes).toContain('projects.wad_traveler_decisions.manage');
    expect(routes).toContain(
      'projects.wad_traveler_decisions.exception_approve'
    );
    expect(service).toContain('d.created_by<>$5');
    expect(wad).toContain('wadTravelerDecisionBlockers');
    expect(wad).toContain('if (areP2WadTravelerDecisionWritesEnabled())');
  });

  it('keeps client reads and writes separately opt-in', () => {
    expect(client).toContain(
      "VITE_P2_WAD_TRAVELER_DECISION_READS_ENABLED === 'true'"
    );
    expect(client).toContain(
      "VITE_P2_WAD_TRAVELER_DECISION_WRITES_ENABLED === 'true'"
    );
    expect(client).toContain('They do not create travelers or');
    expect(client).toContain('if (travelerReadsEnabled)');
  });

  it('creates no execution records', () => {
    for (const table of [
      'production_work_orders',
      'travelers',
      'inventory_transactions',
      'barcodes',
      'genealogy',
    ])
      expect(service).not.toMatch(new RegExp(`INSERT INTO ${table}`, 'i'));
  });
});
