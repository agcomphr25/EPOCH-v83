import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

describe('P2 traveler generation idempotency', () => {
  it('serializes the full traveler find-or-create sequence by serialized item', () => {
    const route = fs.readFileSync(
      path.join(root, 'server/src/routes/p2Traveler.ts'),
      'utf8',
    );

    expect(route).toContain("const lockNamespace = 'p2-traveler-generation'");
    expect(route).toContain('const lockIdentity = serializedItem.id');
    expect(route).toContain('pg_advisory_lock(hashtext($1), hashtext($2))');
    expect(route).toContain('pg_advisory_unlock(hashtext($1), hashtext($2))');
    expect(route).toContain('lockClient.release()');
  });

  it('retires only empty 000581 and links its audit story to canonical 000582', () => {
    const sql = fs.readFileSync(
      path.join(root, 'migrations/0247_retire_duplicate_traveler_roc2600719.sql'),
      'utf8',
    );

    expect(sql).toContain("duplicate.traveler_number = 'TRV-2026-000581'");
    expect(sql).toContain("canonical.traveler_number = 'TRV-2026-000582'");
    expect(sql).toContain("event.action <> 'CREATED'");
    expect(sql).toContain("SET status = 'CANCELLED'");
    expect(sql).toContain("'CANCELLED_DUPLICATE'");
    expect(sql).toContain("'canonicalTravelerNumber', 'TRV-2026-000582'");
  });
});
