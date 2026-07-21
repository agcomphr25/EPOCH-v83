import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeMigrationFiles } from '../scripts/migrations/runSafeBootMigrations';

describe('P1 OEM shipment fulfillment reconciliation', () => {
  const migrationName = '0200_reconcile_oem_shipment_fulfillment.sql';
  const migration = readFileSync(join(process.cwd(), 'migrations', migrationName), 'utf8');
  const route = readFileSync(join(process.cwd(), 'server/src/routes/poShippingQC.ts'), 'utf8');

  it('runs the historical OEM shipment repair during safe boot', () => {
    expect(safeMigrationFiles).toContain(migrationName);
  });

  it('marks every persisted production shipment fulfilled and shipped', () => {
    expect(migration).toContain('FROM shipment_items AS item');
    expect(migration).toContain('JOIN shipment_records AS shipment');
    expect(migration).toContain("production_status = 'SHIPPED'");
    expect(migration).toContain("current_department = 'Shipped'");
    expect(migration).toContain('is_fulfilled = true');
    expect(migration).toContain('fulfilled_date = COALESCE');
  });

  it('preserves cancelled history and closes only fully shipped POs', () => {
    expect(migration).toContain("NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED')");
    expect(migration).toContain("NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED', 'SHIPPED')");
    expect(migration).toContain("SET status = 'CLOSED'");
  });

  it('does not report shipment success when fulfillment updates failed', () => {
    expect(route).toContain('fulfillmentUpdateFailures.push');
    expect(route).toContain('failed P1 fulfillment reconciliation');
  });
});
