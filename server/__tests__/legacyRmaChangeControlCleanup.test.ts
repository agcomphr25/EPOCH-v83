import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const migration = fs.readFileSync(
  path.join(
    root,
    'migrations',
    '0283_remove_legacy_rma_change_control_projections.sql'
  ),
  'utf8'
);
const safeBoot = fs.readFileSync(
  path.join(root, 'server/scripts/migrations/runSafeBootMigrations.ts'),
  'utf8'
);

describe('legacy RMA Change Control cleanup', () => {
  it('stops projecting the legacy customer-return table as Quality Action NCRs', () => {
    expect(migration).toMatch(
      /DROP TRIGGER IF EXISTS sync_ncr_quality_action_register_trigger\s+ON nonconformance_records/i
    );
    expect(migration).toMatch(
      /DROP FUNCTION IF EXISTS sync_ncr_quality_action_register\(\)/i
    );
  });

  it('deletes only derived register rows backed by the legacy RMA table', () => {
    expect(migration).toMatch(/DELETE FROM change_control_records r/i);
    expect(migration).toMatch(/r\.authoritative_record_type = 'NCR'/i);
    expect(migration).toMatch(
      /FROM nonconformance_records n\s+WHERE n\.id::text = r\.authoritative_record_id/i
    );
    expect(migration).not.toMatch(/DELETE FROM nonconformance_records/i);
    expect(migration).not.toMatch(/DELETE FROM non_conforming_items/i);
    expect(migration).not.toMatch(/DELETE FROM p2_nonconforming_dispositions/i);
  });

  it('fails closed when a projected row has controlled workflow evidence', () => {
    for (const table of [
      'change_control_record_links',
      'change_control_evidence',
      'change_control_historical_approvals',
      'change_control_audit_events',
      'change_control_assessments',
    ]) {
      expect(migration).toContain(`FROM ${table}`);
    }
    expect(migration).toContain('RAISE EXCEPTION');
  });

  it('is registered as both a safe and critical migration', () => {
    const references = safeBoot.match(
      /0283_remove_legacy_rma_change_control_projections\.sql/g
    );
    expect(references).toHaveLength(2);
  });
});
