import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'migrations/0195_production_order_transition_history.sql'
  ),
  'utf8'
);

describe('production order transition history migration', () => {
  it('automatically captures department and status changes', () => {
    expect(migration).toContain(
      'AFTER INSERT OR UPDATE OF current_department, production_status, is_fulfilled'
    );
    expect(migration).toContain('OLD.current_department');
    expect(migration).toContain('NEW.current_department');
    expect(migration).toContain('to_jsonb(OLD)');
    expect(migration).toContain('to_jsonb(NEW)');
  });

  it('makes the transition ledger append-only', () => {
    expect(migration).toContain(
      'BEFORE UPDATE OR DELETE ON production_order_transition_history'
    );
    expect(migration).toContain(
      'BEFORE TRUNCATE ON production_order_transition_history'
    );
  });
});
