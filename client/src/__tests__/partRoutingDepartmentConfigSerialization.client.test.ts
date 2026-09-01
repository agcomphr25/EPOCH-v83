import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'client/src/components/PartRoutingWizard.tsx'),
  'utf8',
);

describe('part routing department configuration serialization', () => {
  it('serializes selected departments instead of persisted metadata entries', () => {
    expect(source).toContain('selectedDepartments.forEach((dept) => {');
    expect(source).toContain('const config = getOrCreateDeptConfig(dept);');
    expect(source).toContain('materials: (config.materials ?? []).map');
    expect(source).not.toContain('Object.entries(departmentConfig).forEach');
  });
});
