import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runMigrationSafetyCheck } from '../utils/migrationSafetyCheck';

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

  it('creates the expected table, customer relationship, and lookup index', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS p2_customer_contacts/i);
    expect(sql).toMatch(/REFERENCES p2_customers\s*\(id\)/i);
    expect(sql).toMatch(/ON DELETE CASCADE/i);
    expect(sql).toMatch(/p2_customer_contacts_customer_id_idx/i);
  });
});
