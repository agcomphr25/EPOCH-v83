import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('punch ledger source constraint', () => {
  it('allows every source written by the application', () => {
    const migration = readFileSync(
      join(process.cwd(), 'migrations/0062_punch_ledger_check_constraints.sql'),
      'utf8',
    );

    for (const source of ['KIOSK', 'PORTAL', 'TRAVELER', 'SALARIED_ENTRY']) {
      expect(migration).toContain(`'${source}'`);
    }
  });
});
