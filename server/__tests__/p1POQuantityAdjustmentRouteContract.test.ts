import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const routeSource = fs.readFileSync(
  path.resolve('server/src/routes/p1POQuantityAdjustments.ts'),
  'utf8'
);
const generationSource = fs.readFileSync(
  path.resolve('server/src/routes/index.ts'),
  'utf8'
);
const serviceSource = fs.readFileSync(
  path.resolve('server/src/services/p1POReconciliationService.ts'),
  'utf8'
);

describe('P1 PO quantity-adjustment route contract', () => {
  it('authenticates reads and capability-gates writes', () => {
    expect(routeSource).toContain('authenticateToken');
    expect(routeSource).toContain("requirePermission('purchasing.manage_pos')");
  });

  it('derives actor identity on the server and never accepts a browser user ID', () => {
    expect(routeSource).toContain('resolveUserSnapshot(req.user!.id)');
    expect(routeSource).not.toContain('req.body.createdByUserId');
  });

  it('requires positive quantity and a non-empty reason', () => {
    expect(routeSource).toContain('z.number().int().positive()');
    expect(routeSource).toContain('z.string().trim().min(1)');
  });

  it('serializes adjustments with a transaction and row lock', () => {
    expect(serviceSource).toContain("client.query('BEGIN')");
    expect(serviceSource).toContain('FOR UPDATE OF poi, po');
    expect(serviceSource).toContain("client.query('COMMIT')");
    expect(serviceSource).toContain("client.query('ROLLBACK')");
  });

  it('does not mutate production units or original PO-line quantities', () => {
    expect(serviceSource).not.toMatch(/UPDATE\s+production_orders/i);
    expect(serviceSource).not.toMatch(/UPDATE\s+purchase_order_items/i);
    expect(serviceSource).not.toMatch(/DELETE\s+FROM/i);
  });

  it('uses active demand in preview and replacement generation', () => {
    expect(generationSource).toContain(
      'reconciliationByItemId.get(item.id)?.activePoQuantity'
    );
    expect(generationSource).toContain(
      'generationReconciliationByItemId.get(item.id)?.activePoQuantity'
    );
    expect(generationSource).toContain(
      "order.productionStatus !== 'CANCELLED'"
    );
    expect(generationSource).not.toContain(
      'INSERT INTO purchase_order_item_quantity_adjustments'
    );
  });
});
