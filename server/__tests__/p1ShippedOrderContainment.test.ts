import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migrationName = '0281_contain_shipped_p1_auto_populate_regression.sql';

describe('P1 shipped-order containment', () => {
  it('persists fulfilled shipping state when an order ships', () => {
    const source = readFileSync(
      path.join(root, 'server/src/routes/shipping.ts'),
      'utf8'
    );

    expect(source).toContain("status: 'FULFILLED'");
    expect(source).toContain("currentDepartment: 'Shipping Management'");
    expect(source.match(/status: 'FULFILLED'/g)?.length).toBeGreaterThanOrEqual(4);
    expect(
      source.match(/currentDepartment: 'Shipping Management'/g)?.length
    ).toBeGreaterThanOrEqual(4);
  });

  it('fulfills shipping completions from bulk and badge progression paths', () => {
    const indexRoute = readFileSync(
      path.join(root, 'server/src/routes/index.ts'),
      'utf8'
    );
    const badgeRoute = readFileSync(
      path.join(root, 'server/src/routes/employeeBadges.ts'),
      'utf8'
    );

    expect(indexRoute).toContain("const completingShipping = currentOrder.currentDepartment === 'Shipping'");
    expect(indexRoute).toContain("? 'FULFILLED'");
    expect(indexRoute).toContain("updateData.productionStatus = 'SHIPPED'");
    expect(badgeRoute).toContain("updateData.status = 'FULFILLED'");
    expect(badgeRoute).toContain("productionStatus: 'SHIPPED'");
  });

  it('fails closed before auto-populating any order with shipment evidence', () => {
    const source = readFileSync(
      path.join(root, 'server/src/routes/productionQueue.ts'),
      'utf8'
    );

    expect(source).toContain("NOT IN ('FULFILLED', 'SHIPPED')");
    expect(source).toContain("'Shipping Management', 'Fulfilled', 'Shipped'");
    expect(source).toContain('AND o.shipped_date IS NULL');
    expect(source).toContain('AND o.shipping_completed_at IS NULL');
    expect(source).toContain(
      "NULLIF(TRIM(COALESCE(o.tracking_number, '')), '') IS NULL"
    );
    expect(source).toContain("router.get('/shipped-regression-audit'");
    expect(source).toContain('p1_shipped_order_containment_audit');
    expect(source).toContain('p1-shipped-order-floor-removal-audit.csv');
  });

  it('blocks shipped orders at canonical progression and transfer seams', () => {
    const storage = readFileSync(path.join(root, 'server/storage.ts'), 'utf8');
    const ordersRoute = readFileSync(
      path.join(root, 'server/src/routes/orders.ts'),
      'utf8'
    );

    expect(storage).toContain('SHIPPED_ORDER_MANUFACTURING_BLOCK');
    expect(storage).toContain('hasDurableShipmentEvidence');
    expect(storage.match(/recordsShipmentCompletion/g)?.length).toBeGreaterThanOrEqual(4);
    expect(storage).toContain("updateData.status = 'FULFILLED'");
    expect(storage).toContain("updateData.currentDepartment = 'Shipping Management'");
    expect(ordersRoute).toContain("code: 'SHIPPED_ORDER_MANUFACTURING_BLOCK'");
    expect(ordersRoute).toContain("requiredDepartment: 'Shipping Management'");
    expect(ordersRoute).toContain("updateData.currentDepartment = 'Shipping Management'");
  });

  it('keeps the historical containment migration retired from recurring boot', () => {
    const sql = readFileSync(
      path.join(root, 'migrations', migrationName),
      'utf8'
    );
    const registry = readFileSync(
      path.join(root, 'server/scripts/migrations/runSafeBootMigrations.ts'),
      'utf8'
    );

    expect(registry).not.toContain(`'${migrationName}'`);
    expect(sql).toContain('p1_shipped_order_containment_audit');
    expect(sql).toContain("'Gunsmith', 'Finish', 'Finish QC', 'Paint', 'Shipping QC'");
    expect(sql).toContain("reason_code = 'CONTAIN_SHIPPED_MANUFACTURING_ORDER'");
    expect(sql).toContain('ao.shipped_date IS NOT NULL');
    expect(sql).toContain("current_department = 'Shipping Management'");
    expect(sql).toContain("production_status = 'SHIPPED'");
  });
});
