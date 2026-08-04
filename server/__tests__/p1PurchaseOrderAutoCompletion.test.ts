import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeMigrationFiles } from '../scripts/migrations/runSafeBootMigrations';

describe('P1 purchase order auto-completion', () => {
  const migrationName = '0201_close_fully_shipped_p1_purchase_orders.sql';
  const directShipmentMigrationName =
    '0243_close_direct_shipped_p1_purchase_orders.sql';
  const migration = readFileSync(join(process.cwd(), 'migrations', migrationName), 'utf8');
  const shippingRoute = readFileSync(join(process.cwd(), 'server/src/routes/poShippingQC.ts'), 'utf8');

  it('uses shared line reconciliation for shipment completion', () => {
    expect(shippingRoute).toContain(
      "import { reconcileAndCloseP1PO } from '../services/p1POReconciliationService'"
    );
    expect(shippingRoute).toContain('await tryReconcileAndCloseP1PO(poId)');
    expect(shippingRoute).toContain('detail.po?.id');
  });

  it('reconciles existing open POs during safe boot', () => {
    expect(safeMigrationFiles).toContain(migrationName);
    expect(safeMigrationFiles).toContain(directShipmentMigrationName);
    expect(migration).toContain("SET status = 'CLOSED'");
  });

  it('ignores cancelled history but requires every active unit to be shipped', () => {
    expect(migration).toContain("NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED')");
    expect(migration).toContain("NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED', 'SHIPPED')");
  });
});
