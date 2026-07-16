import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'migrations/0194_layup_schedule_history.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');

describe('layup schedule history migration', () => {
  it('captures every live schedule mutation at the database layer', () => {
    expect(migration).toContain(
      'AFTER INSERT OR UPDATE OR DELETE ON layup_schedule'
    );
    expect(migration).toContain('EXECUTE FUNCTION capture_layup_schedule_history()');
    expect(migration).toContain(
      "CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END"
    );
    expect(migration).toContain('to_jsonb(schedule_row)');
  });

  it('makes recorded history append-only', () => {
    expect(migration).toContain(
      'BEFORE UPDATE OR DELETE ON layup_schedule_history'
    );
    expect(migration).toContain('BEFORE TRUNCATE ON layup_schedule_history');
    expect(migration).toContain(
      "RAISE EXCEPTION 'layup_schedule_history is append-only;"
    );
  });

  it('records durable event and transaction metadata', () => {
    expect(migration).toContain('event_id uuid NOT NULL DEFAULT gen_random_uuid()');
    expect(migration).toContain('transaction_id bigint NOT NULL DEFAULT txid_current()');
    expect(migration).toContain('database_actor text NOT NULL DEFAULT session_user');
    expect(migration).toContain('client_application text');
  });
});
