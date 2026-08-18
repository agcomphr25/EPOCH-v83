import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runMigrationSafetyCheck } from '../utils/migrationSafetyCheck';
import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';

const migrationPath = path.resolve(
  process.cwd(),
  'migrations/0284_p2_customer_contacts.sql'
);

describe('P2 customer contacts migration', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('is additive and accepted by the migration safety scanner', () => {
    expect(() =>
      runMigrationSafetyCheck(sql, '0284_p2_customer_contacts.sql')
    ).not.toThrow();
  });

  it('creates the expected table and lookup index without a legacy-incompatible foreign key', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS p2_customer_contacts/i);
    expect(sql).not.toMatch(/REFERENCES p2_customers\s*\(id\)/i);
    expect(sql).not.toMatch(/FOREIGN KEY\s*\(customer_id\)/i);
    expect(sql).toMatch(/p2_customer_contacts_customer_id_idx/i);
  });

  it('runs at production boot without being allowed to take the ERP offline', () => {
    const migrationName = '0284_p2_customer_contacts.sql';
    expect(safeMigrationFiles).toContain(migrationName);
    expect(criticalMigrationFiles.has(migrationName)).toBe(false);
  });

  it('enforces customer existence in the contact API instead of a legacy-incompatible FK', () => {
    const routes = fs.readFileSync(
      path.resolve(process.cwd(), 'server/src/routes/index.ts'),
      'utf8'
    );
    const createRoute = routes.slice(
      routes.indexOf("app.post('/api/p2/customers/:customerId/contacts'"),
      routes.indexOf("app.put('/api/p2/customers/:customerId/contacts/:contactId'")
    );
    expect(createRoute).toContain('storage.getP2Customer(customerId)');
    expect(createRoute).toContain("res.status(404).json({ error: 'P2 customer not found' })");
  });
});
