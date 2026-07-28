import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const componentPath = fileURLToPath(
  new URL('../../client/src/components/ProductionQueueManager.tsx', import.meta.url),
);

describe('P1 PO demand and production progression boundary', () => {
  it('sends exact selected PO quantities to layup scheduling', () => {
    const source = readFileSync(componentPath, 'utf8');

    expect(source).toContain('selectedPOItems: poSelections');
    expect(source).toContain('quantity,');
    expect(source).toContain('poNumber,');
    expect(source).toContain('itemId,');
    expect(source).not.toContain('selectedPOItems: []');
  });

  it('keeps Progress to Barcode independent from schedule generation', () => {
    const source = readFileSync(componentPath, 'utf8');

    expect(source).toContain("apiRequest('/api/p1-po-queue/progress'");
    expect(source).toContain("apiRequest('/api/layup-schedule/generate'");
    expect(source).not.toContain("apiRequest('/api/p1-po-queue/select'");
    expect(source).not.toContain("apiRequest('/api/p1-po-queue/schedule'");
    expect(source).toContain('Progress to Barcode');
    expect(source).toContain('Quantity to Progress');
  });

  it('shows Generate Schedule for regular, PO-only, and mixed selections', () => {
    const source = readFileSync(componentPath, 'utf8');

    expect(source).toContain(
      "selectedQueueOrders.size > 0 ||\n                  Array.from(selectedPOItems.values()).some"
    );
    expect(source).toContain('Generate Schedule');
  });

  it('clears and refreshes both queues plus schedule history after approval', () => {
    const source = readFileSync(componentPath, 'utf8');

    expect(source).toContain('setSelectedQueueOrders(new Set())');
    expect(source).toContain('setSelectedPOItems(new Map())');
    expect(source).toContain("queryKey: ['/api/production-queue/prioritized']");
    expect(source).toContain("queryKey: ['/api/p1-po-queue/purchase-orders/open']");
    expect(source).toContain("queryKey: ['/api/layup-schedule/weeks']");
  });
});
