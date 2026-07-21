import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PO production-order metal accessory reconciliation', () => {
  const source = readFileSync(
    join(process.cwd(), 'server/src/routes/index.ts'),
    'utf8',
  );
  const routeStart = source.indexOf("app.get('/api/production-orders/by-po/:poId'");
  const nextRoute = source.indexOf("app.get('/api/production-orders/:id'", routeStart);
  const routeSource = source.slice(routeStart, nextRoute);

  it('repairs active bottom-metal children from the linked PO line before returning them', () => {
    expect(routeStart).toBeGreaterThanOrEqual(0);
    expect(nextRoute).toBeGreaterThan(routeStart);
    expect(routeSource).toContain('FROM purchase_order_items AS line');
    expect(routeSource).toContain("~ '^(AGM5|AGMS5|AGBDL|AGBM|AGPIC|AGARCA)'");
    expect(routeSource).toContain("material_canonical = 'Metal Accessory'");
    expect(routeSource).toContain("current_department = 'Shipping QC'");
    expect(routeSource).toContain("production_status = 'IN_PROGRESS'");
  });

  it('limits reconciliation to active rows still in the P1 production queue', () => {
    expect(routeSource).toContain("production.current_department = 'P1 Production Queue'");
    expect(routeSource).toContain(
      "UPPER(COALESCE(production.production_status, '')) IN ('PENDING', 'ACTIVE', 'IN_PROGRESS')",
    );
    expect(routeSource).toContain(
      "UPPER(COALESCE(orders.status, '')) NOT IN ('CANCELLED', 'SHIPPED', 'COMPLETED')",
    );
  });
});
