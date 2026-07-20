import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const componentPath = fileURLToPath(
  new URL('../../client/src/components/ProductionQueueManager.tsx', import.meta.url),
);

describe('P1 PO demand and production progression boundary', () => {
  it('never sends PO-line selections through progression or scheduling', () => {
    const source = readFileSync(componentPath, 'utf8');

    expect(source).not.toContain("apiRequest('/api/p1-po-queue/progress'");
    expect(source).toContain("apiRequest('/api/p1-po-queue/select'");
    expect(source).toContain("apiRequest('/api/p1-po-queue/schedule'");
    expect(source).toContain('selectedPOItems: []');
    expect(source).toContain('Generate Production Demand');
  });
});
