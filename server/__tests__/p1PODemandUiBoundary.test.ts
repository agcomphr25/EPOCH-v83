import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const componentPath = fileURLToPath(
  new URL('../../client/src/components/ProductionQueueManager.tsx', import.meta.url),
);

describe('P1 PO demand and production progression boundary', () => {
  it('progresses existing PO production units without generating new demand', () => {
    const source = readFileSync(componentPath, 'utf8');

    expect(source).toContain("apiRequest('/api/p1-po-queue/progress'");
    expect(source).not.toContain("apiRequest('/api/p1-po-queue/select'");
    expect(source).not.toContain("apiRequest('/api/p1-po-queue/schedule'");
    expect(source).toContain('selectedPOItems: []');
    expect(source).toContain('Progress to Barcode');
    expect(source).toContain('Quantity to Progress');
  });
});
