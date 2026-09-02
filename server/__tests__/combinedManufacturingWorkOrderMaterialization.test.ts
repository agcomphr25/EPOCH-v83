import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'migrations/0322_combined_manufacturing_work_order_authority.sql',
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

describe('combined manufacturing work-order materialization', () => {
  it('keeps combined authority and every output mapping explicit', () => {
    expect(migration).toContain(
      'combined_manufacturing_work_order_authorities'
    );
    expect(migration).toContain('combined_manufacturing_work_order_outputs');
    expect(migration).toContain('demand_node_ids');
  });

  it('creates one combined work order and blocks default duplicates', () => {
    expect(service).toContain("'P2_COMBINED_MANUFACTURING'");
    expect(service).toContain('DEFAULT_WORK_ORDERS_EXIST');
    expect(service).toContain('request_key');
  });

  it('uses an independent flag and permission', () => {
    expect(routes).toContain(
      'areCombinedManufacturingProcessMaterializationWritesEnabled()'
    );
    expect(routes).toContain(
      "requirePermission('manufacturing.combined_processes.materialize')"
    );
  });

  it('registers the migration as safe and critical', () => {
    expect(
      runner.match(/0322_combined_manufacturing_work_order_authority\.sql/g)
    ).toHaveLength(2);
  });
});
