import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'client/src/pages/ManufacturingQueue.tsx'),
  'utf8',
);

describe('Manufacturing Queue department selector', () => {
  it('loads all shared departments before applying production queue eligibility', () => {
    expect(source).toContain("apiRequest('/api/shared-departments')");
    expect(source).not.toContain(
      "apiRequest('/api/shared-departments?routingOnly=true')",
    );
    expect(source).toContain('department.productionEnabled !== false');
  });

  it('keeps every legacy manufacturing dashboard available as a fallback', () => {
    for (const department of ['Cutting Table', 'CNC', 'Cores', 'Assembly']) {
      expect(source).toContain(`'${department}'`);
    }
  });
});
