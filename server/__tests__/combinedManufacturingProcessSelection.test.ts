import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'migrations/0321_combined_manufacturing_process_selection.sql',
  'utf8'
);
const service = readFileSync(
  'server/src/services/combinedManufacturingProcessService.ts',
  'utf8'
);
const routes = readFileSync(
  'server/src/routes/combinedManufacturingProcesses.ts',
  'utf8'
);
const runner = readFileSync(
  'server/scripts/migrations/runSafeBootMigrations.ts',
  'utf8'
);

describe('combined manufacturing process controlled selection', () => {
  it('stores one active selection per released baseline without work orders', () => {
    expect(migration).toContain('combined_manufacturing_process_selections');
    expect(migration).toMatch(/WHERE status='SELECTED'/);
    expect(migration).not.toContain('INSERT INTO production_work_orders');
  });

  it('recomputes the recommendation and verifies the baseline checksum', () => {
    expect(service).toContain('recommendCombinedManufacturingProcesses');
    expect(service).toContain('FROZEN_DEMAND_AUTHORITY_STALE');
    expect(service).toContain('COMBINED_PROCESS_RECOMMENDATION_STALE');
  });

  it('uses a separate planning permission and exact write flag', () => {
    expect(routes).toContain(
      "requirePermission('manufacturing.combined_processes.plan')"
    );
    expect(routes).toContain(
      'areCombinedManufacturingProcessPlanningWritesEnabled()'
    );
  });

  it('registers the migration as safe and critical', () => {
    expect(
      runner.match(/0321_combined_manufacturing_process_selection\.sql/g)
    ).toHaveLength(2);
  });
});
