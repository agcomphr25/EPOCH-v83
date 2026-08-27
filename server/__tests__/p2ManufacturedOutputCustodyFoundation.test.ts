import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read(
  'migrations/0306_p2_manufactured_output_custody_foundation.sql'
);
const custody = read(
  'server/src/services/p2ManufacturedOutputCustodyService.ts'
);
const output = read(
  'server/src/services/p2ManufacturedOutputGenealogyService.ts'
);
const routes = read('server/src/routes/p2ManufacturingWorkOrders.ts');
const flags = read('server/src/lib/featureFlags.ts');
const boot = read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('Phase 10 manufactured-output custody correction', () => {
  it('is additive, prospective, and registered after Phase 10', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS p2_manufactured_output_custodies'
    );
    expect(migration).not.toMatch(/^\s*UPDATE\s+/im);
    expect(
      boot.indexOf('0306_p2_manufactured_output_custody_foundation.sql')
    ).toBeGreaterThan(
      boot.indexOf('0305_p2_manufactured_output_genealogy_foundation.sql')
    );
  });

  it('uses immutable inventory-ledger receipt and compensating reversal evidence', () => {
    expect(migration).toContain('receipt_ledger_entry_id UUID NOT NULL UNIQUE');
    expect(migration).toContain(
      'reversal_ledger_entry_id UUID NOT NULL UNIQUE'
    );
    expect(custody).toContain("transactionType: 'RECEIVE'");
    expect(custody).toContain("transactionType: 'REVERSAL'");
    expect(custody).toContain(
      'reversedTransactionId: custody.receipt_ledger_entry_id'
    );
  });

  it('enforces serial, quantity, retry, concurrency, and ledger consistency', () => {
    expect(migration).toContain(
      "traceability_mode <> 'SERIAL' OR received_quantity = 1"
    );
    expect(migration).toContain(
      'issued_quantity + reversed_quantity <= received_quantity'
    );
    expect(custody).toContain('pg_advisory_xact_lock');
    expect(custody).toContain('OUTPUT_RECEIPT_CONFLICT');
    expect(custody).toContain('OUTPUT_LEDGER_CUSTODY_DISAGREEMENT');
    expect(custody).toContain('OUTPUT_CUSTODY_ALREADY_ISSUED');
  });

  it('makes release and receipt one transaction when custody is enabled', () => {
    expect(output).toContain('receiveP2ManufacturedOutputCustodyInTransaction');
    expect(
      output.indexOf('receiveP2ManufacturedOutputCustodyInTransaction')
    ).toBeLessThan(output.lastIndexOf("client.query('COMMIT')"));
  });

  it('uses narrow server capabilities and exact-true disabled flags', () => {
    expect(routes).toContain(
      "requirePermission('p2.manufactured_output.custody_receive')"
    );
    expect(routes).toContain(
      "requirePermission('p2.manufactured_output.custody_reverse')"
    );
    expect(flags).toContain(
      "envBool('P2_MANUFACTURED_OUTPUT_CUSTODY_READS_ENABLED', false)"
    );
    expect(flags).toContain(
      "envBool('P2_MANUFACTURED_OUTPUT_CUSTODY_WRITES_ENABLED', false)"
    );
  });

  it('does not implement Phase 11 parent issue or genealogy', () => {
    expect(custody).not.toMatch(
      /parent_work_order|child_to_parent|multilevel_genealogy/i
    );
    expect(migration).not.toMatch(
      /parent_work_order|child_to_parent|multilevel_genealogy/i
    );
  });
});
