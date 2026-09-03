import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'migrations/0323_reconcile_converted_project_history.sql'
  ),
  'utf8'
);
const registry = readFileSync(
  resolve(process.cwd(), 'server/scripts/migrations/runSafeBootMigrations.ts'),
  'utf8'
);

describe('converted project history migration', () => {
  it('is registered as a critical deployment migration', () => {
    expect(
      registry.match(/0323_reconcile_converted_project_history\.sql/g)
    ).toHaveLength(2);
  });

  it('qualifies only audited conversions with complete legacy and released authority', () => {
    expect(migration).toContain("activity_type='workflow_version_converted'");
    expect(migration).toContain("ps.status='completed'");
    expect(migration).toContain("pwo.status='RELEASED'");
    expect(migration).toContain("pwo.wad_status='APPROVED'");
    expect(migration).toContain("'released','in_production','completed'");
  });

  it('links evidence without modifying preserved source records', () => {
    expect(migration).toContain("'SATISFIES_REQUIREMENT',true");
    expect(migration).not.toMatch(/UPDATE\s+project_steps/i);
    expect(migration).not.toMatch(/UPDATE\s+production_work_orders/i);
    expect(migration).not.toMatch(/UPDATE\s+p2_purchase_orders/i);
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
  });

  it('opens release only after all seven historical stages are reconciled', () => {
    expect(migration).toContain("release_step.step_type='p2_release'");
    expect(migration).toContain('COUNT(DISTINCT e.stage)=7');
    expect(migration).not.toContain("step_type='p2_execution'");
    expect(migration).not.toContain("step_type='project_closing'");
  });
});
