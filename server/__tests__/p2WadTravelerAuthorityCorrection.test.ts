import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

import { evaluateWadTravelerCoverage } from '../src/services/p2WadTravelerCoverage';

const root = resolve(__dirname, '../..');
const migration = readFileSync(
  resolve(root, 'migrations/0299_p2_wad_authority_correction.sql'),
  'utf8'
);
const service = readFileSync(
  resolve(root, 'server/src/services/p2WadTravelerDecisionService.ts'),
  'utf8'
);
const routes = readFileSync(
  resolve(root, 'server/src/routes/projectWadAuthorization.ts'),
  'utf8'
);
const wadService = readFileSync(
  resolve(root, 'server/src/services/projectWadAuthorizationService.ts'),
  'utf8'
);
const registry = readFileSync(
  resolve(root, 'server/scripts/migrations/runSafeBootMigrations.ts'),
  'utf8'
);

const manufactured = (path: string, quantity = 10) => ({
  is_manufactured: true,
  inventory_item_id: path === 'A' ? 101 : 102,
  assembly_path: path,
  extended_project_quantity: quantity,
});
const decision = (path: string, quantity = 10) => ({
  inventory_item_id: path === 'A' ? 101 : 102,
  assembly_path_identity: path,
  required_quantity: quantity,
  traveler_type: 'INDIVIDUAL',
  status: 'VALIDATED',
});

describe('Phase 4 WAD authority correction', () => {
  it('blocks A plus duplicate A when released manufactured path B is missing', () => {
    expect(
      evaluateWadTravelerCoverage(
        [manufactured('A'), manufactured('B')],
        [decision('A'), decision('A')]
      )
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('101::A: exactly one'),
        expect.stringContaining('102::B: exactly one'),
      ])
    );
  });

  it('blocks batch coverage below released demand', () => {
    expect(
      evaluateWadTravelerCoverage(
        [manufactured('A', 10)],
        [
          {
            ...decision('A', 10),
            traveler_type: 'BATCH',
            batch_approved_quantity: 6,
            batch_coverage_scope: 'Assembly A demand',
          },
        ]
      )
    ).toContain(
      '101::A: approved batch coverage does not cover released demand 10.'
    );
  });

  it('returns an identical create replay without inserting a duplicate event', () => {
    expect(service).toContain(
      'existing.rows[0].content_checksum === checksum(content)'
    );
    expect(service).toMatch(
      /content_checksum === checksum\(content\)[\s\S]*?COMMIT[\s\S]*?return existing\.rows\[0\]/
    );
    expect(service).toContain('DECISION_CREATE_CONFLICT');
  });

  it('adds database rejection for direct released-WAD evidence changes', () => {
    expect(migration).toContain(
      'CREATE TRIGGER p2_released_wad_authorization_immutable'
    );
    expect(migration).toContain("OLD.status IN ('RELEASED','SUPERSEDED')");
    expect(migration).toContain(
      "IF TG_OP = 'UPDATE' AND OLD.status = 'RELEASED'"
    );
  });

  it('requires explicit prospective batch coverage without historical backfill', () => {
    expect(migration).toContain('batch_approved_quantity >= required_quantity');
    expect(migration).toContain('NOT VALID');
    expect(migration).not.toMatch(/^[ \t]*(UPDATE|DELETE|TRUNCATE)\b/im);
  });

  it('registers the additive correction after Phase 4 completion', () => {
    expect(
      registry.match(/0299_p2_wad_authority_correction\.sql/g)
    ).toHaveLength(2);
    expect(registry.indexOf('0298_p2_wad')).toBeLessThan(
      registry.indexOf('0299_p2_wad')
    );
  });

  it('uses dedicated WAD permissions and authenticated employee identity', () => {
    for (const capability of [
      'projects.wad_traveler_decisions.manage',
      'projects.wad_traveler_decisions.exception_approve',
      'projects.wad_authorization.manage',
      'projects.wad_authorization.release',
    ])
      expect(routes).toContain(capability);
    expect(routes).toContain('ACTOR_EMPLOYEE_REQUIRED');
    expect(routes).not.toMatch(/inventory\.adjust|projects\.edit/);
    expect(service).toContain('created_by_employee_id');
    expect(service).toContain('actor_employee_id');
  });

  it('separates creator, functional approvers, and releaser', () => {
    expect(wadService).toContain(
      'The WAD creator cannot approve the same controlled revision.'
    );
    expect(wadService).toContain(
      'WAD release requires an independent employee who neither created nor approved the revision.'
    );
    expect(wadService).toContain(
      'evidence.some((entry) => entry.actor_user_id === actor.userId)'
    );
  });
});
