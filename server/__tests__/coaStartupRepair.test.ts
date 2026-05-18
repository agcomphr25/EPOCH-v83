import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('COA startup repair', () => {
  const source = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');

  it('normalizes legacy account 10300 during normal app startup', () => {
    expect(source).toContain("account_number = '10300'");
    expect(source).toContain("account_name = 'Undeposited Funds'");
    expect(source).toContain("account_name = 'Customer Payment Clearing'");
    expect(source).toContain('Individually traceable customer payments awaiting bank reconciliation or settlement matching');
  });

  it('adds the COA foundation columns needed by the startup repair if missing', () => {
    expect(source).toContain('ADD COLUMN IF NOT EXISTS account_number TEXT');
    expect(source).toContain("ADD COLUMN IF NOT EXISTS normal_balance TEXT NOT NULL DEFAULT 'DEBIT'");
    expect(source).toContain("ADD COLUMN IF NOT EXISTS billing_treatment TEXT NOT NULL DEFAULT 'NOT_BILLABLE'");
  });
});
