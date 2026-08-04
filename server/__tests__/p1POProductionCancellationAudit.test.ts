import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const routeSource = fs.readFileSync(
  path.join(root, 'server/src/routes/orders.ts'),
  'utf8',
);

describe('P1 PO/OEM production-order cancellation auditing', () => {
  it('records an actor-attributed cancellation event with PO context', () => {
    expect(routeSource).toContain("action: 'PRODUCTION_ORDER_CANCELLED'");
    expect(routeSource).toContain("source: 'production-order-cancellation'");
    expect(routeSource).toContain("orderType: 'p1_po_oem'");
    expect(routeSource).toContain('before: productionOrder.productionStatus');
    expect(routeSource).toContain("after: 'CANCELLED'");
    expect(routeSource).toContain('poItemId: productionOrder.poItemId');
    expect(routeSource).toContain('poNumber: productionOrder.poNumber');
    expect(routeSource).toContain("reason: reason || 'No reason provided'");
    expect(routeSource).toContain("userAgent: req.get('user-agent')");
  });

  it('closes the open department transition as cancelled', () => {
    const fallbackStart = routeSource.indexOf(
      'Fallback: check if the order exists only in productionOrders',
    );
    const fallbackEnd = routeSource.indexOf(
      "return res.status(404).json({ error: 'Order not found' })",
      fallbackStart,
    );
    const fallback = routeSource.slice(fallbackStart, fallbackEnd);

    expect(fallback).toContain('auditService.closeDepartmentTransition');
    expect(fallback).toContain("'cancelled'");
  });
});
