import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeMigrationFiles } from '../scripts/migrations/runSafeBootMigrations';

describe('P1 purchase order auto-completion', () => {
  const migrationName = '0201_close_fully_shipped_p1_purchase_orders.sql';
  const migration = readFileSync(join(process.cwd(), 'migrations', migrationName), 'utf8');
  const shippingRoute = readFileSync(join(process.cwd(), 'server/src/routes/poShippingQC.ts'), 'utf8');

  it('reads PostgreSQL QueryResult rows before evaluating completion counts', () => {
    expect(shippingRoute).toContain("const row = rowsOf<{\n      total: string;");
    expect(shippingRoute).toContain('}>(rows)[0];');
  });

  it('reconciles existing open POs during safe boot', () => {
    expect(safeMigrationFiles).toContain(migrationName);
    expect(migration).toContain("SET status = 'CLOSED'");
  });

  it('ignores cancelled history but requires every active unit to be shipped', () => {
    expect(migration).toContain("NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED')");
    expect(migration).toContain("NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED', 'SHIPPED')");
  });
});
