import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(
    process.cwd(),
    'client/src/components/p2/P2FrozenProductionDemand.tsx'
  ),
  'utf8'
);
describe('P2 Control Center frozen demand surface', () => {
  it('requires exact-true read, write, and release flags', () => {
    expect(
      source.match(
        /VITE_P2_FROZEN_PRODUCTION_DEMAND_[A-Z_]+_ENABLED\s*===\s*['"]true['"]/g
      )
    ).toHaveLength(3);
  });
  it('states the gross-demand-only boundary', () => {
    expect(source).toMatch(
      /does not net, reserve,\s*schedule, provision work, or change inventory/
    );
  });
  it('shows exact corrective actions and controlled assembly paths', () => {
    expect(source).toContain('Corrective action:');
    expect(source).toContain('assembly_path_identity');
  });
  it('does not expose release controls unless the release flag is enabled', () => {
    expect(source).toContain('releases &&');
    expect(source).toContain('list.data?.authority.canRelease');
    expect(source).toMatch(/current\?\.status\s*===\s*['"]VALIDATED['"]/);
  });
});
