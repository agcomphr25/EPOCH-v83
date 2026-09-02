import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../P2FrozenProductionDemand.tsx', import.meta.url),
  'utf8'
);

describe('P2 combined-process planning recommendations', () => {
  it('requires the exact combined-process read flag and view capability', () => {
    expect(source).toContain(
      'VITE_COMBINED_MANUFACTURING_PROCESS_READS_ENABLED ==='
    );
    expect(source).toContain("'true'");
    expect(source).toContain("can('manufacturing.combined_processes.view')");
  });

  it('only evaluates the exact released frozen demand baseline', () => {
    expect(source).toContain("current?.status === 'RELEASED'");
    expect(source).toContain('/combined-process-recommendations');
  });

  it('shows run, timing, required, planned, and excess quantities', () => {
    expect(source).toContain('recommendation.recommendedRuns');
    expect(source).toContain('recommendation.estimatedMinutes');
    expect(source).toContain('output.requiredQuantity');
    expect(source).toContain('output.plannedQuantity');
    expect(source).toContain('output.excessQuantity');
  });

  it('keeps recommendations advisory and preserves default work orders', () => {
    expect(source).toMatch(/Recommendation only/);
    expect(source).toMatch(
      /does not create, combine, or replace\s*work orders/
    );
    expect(source).toMatch(/one work order per manufactured part/);
  });

  it('controls planner selection separately from work-order materialization', () => {
    expect(source).toContain(
      'VITE_COMBINED_MANUFACTURING_PROCESS_PLANNING_WRITES_ENABLED'
    );
    expect(source).toContain("can('manufacturing.combined_processes.plan')");
    expect(source).toContain('expectedBaselineChecksum');
    expect(source).toContain('Select for planning');
    expect(source).toContain('Withdraw selection');
  });

  it('gates combined work-order materialization independently', () => {
    expect(source).toContain(
      'VITE_COMBINED_MANUFACTURING_PROCESS_MATERIALIZATION_WRITES_ENABLED'
    );
    expect(source).toMatch(
      /can\(\s*['"]manufacturing\.combined_processes\.materialize['"]\s*\)/
    );
    expect(source).toContain('Create combined work order');
  });
});
