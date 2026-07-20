import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('P1 Create Missing Orders metal accessory eligibility', () => {
  const routeSource = readFileSync(
    join(process.cwd(), 'server/src/routes/index.ts'),
    'utf8',
  );

  it('treats a metal accessory found in any PO identity field as eligible', () => {
    expect(routeSource).toContain('const isPOItemMetalAccessory = (item: any)');
    expect(routeSource).toContain(
      'isPOItemMetalAccessory(item) || !isPOItemNonStock(item)',
    );
  });

  it('uses the same eligibility rule for preview and generation', () => {
    expect(routeSource).toContain('if (!isPOItemEligibleForProduction(item)) {');
    expect(routeSource).toContain('if (isPOItemMetalAccessory(item)) {');
  });
});
