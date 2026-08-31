import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'migrations/0315_layup_schedule_order_source_integrity.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');

describe('layup schedule order source integrity migration', () => {
  it('accepts both supported authoritative order sources', () => {
    expect(migration).toContain('FROM production_queue');
    expect(migration).toContain('FROM production_orders');
    expect(migration).toContain('WHERE order_id = NEW.order_id');
  });

  it('retains database-level referential integrity', () => {
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER layup_schedule_order_source_guard');
    expect(migration).toContain("USING ERRCODE = '23503'");
    expect(migration).toContain(
      'layup_schedule contains an order_id with no authoritative source'
    );
  });
});
