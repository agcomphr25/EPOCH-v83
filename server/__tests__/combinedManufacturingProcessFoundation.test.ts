import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('combined manufacturing process foundation', () => {
  it('is additive, opt-in, and registered in both migration lists', () => {
    const migration = read(
      'migrations/0320_combined_manufacturing_process_foundation.sql'
    );
    const runner = read('server/scripts/migrations/runSafeBootMigrations.ts');
    const flags = read('server/src/lib/featureFlags.ts');

    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS combined_manufacturing_processes'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS combined_manufacturing_process_outputs'
    );
    expect(migration).not.toMatch(
      /UPDATE\s+(inventory_items|production_work_orders|p2_manufacturing_work_order_authorities)/i
    );
    expect(
      runner.match(/0320_combined_manufacturing_process_foundation\.sql/g)
    ).toHaveLength(2);
    expect(flags).toContain(
      "envBool('COMBINED_MANUFACTURING_PROCESS_READS_ENABLED', false)"
    );
    expect(flags).toContain(
      "envBool('COMBINED_MANUFACTURING_PROCESS_WRITES_ENABLED', false)"
    );
  });

  it('requires multiple distinct manufactured outputs and never materializes recommendations', () => {
    const service = read(
      'server/src/services/combinedManufacturingProcessService.ts'
    );
    const routes = read('server/src/routes/combinedManufacturingProcesses.ts');

    expect(service).toContain("'MULTIPLE_OUTPUTS_REQUIRED'");
    expect(service).toContain("item_type='MANUFACTURED'");
    expect(service).toContain("status === 'APPROVED'");
    expect(service).toContain('recommendationOnly: true');
    expect(routes).toContain('materializesWorkOrders: false');
    expect(routes).toContain(
      "requirePermission('manufacturing.combined_processes.approve')"
    );
  });

  it('protects approved definitions and outputs from in-place mutation', () => {
    const migration = read(
      'migrations/0320_combined_manufacturing_process_foundation.sql'
    );

    expect(migration).toContain('combined_mfg_approved_process_immutable');
    expect(migration).toContain('combined_mfg_approved_outputs_immutable');
    expect(migration).toContain('combined_mfg_validate_approval');
    expect(migration).toContain('combined_mfg_one_primary_output_uidx');
    expect(migration).toContain('create a new revision');
  });
});
