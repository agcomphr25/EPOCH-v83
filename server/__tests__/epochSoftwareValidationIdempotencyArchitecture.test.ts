import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const route = read('server/src/routes/epochSoftwareValidation.ts');
const migration = read(
  'migrations/0242_epoch_validation_create_idempotency.sql'
);
const safeBoot = read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('EPOCH validation package create idempotency architecture', () => {
  it('requires a user-scoped durable idempotency key and rejects payload drift', () => {
    expect(route).toContain("req.header('Idempotency-Key')");
    expect(route).toContain(
      "operation='CREATE_PACKAGE' AND actor_user_id=$1 AND idempotency_key=$2 FOR UPDATE"
    );
    expect(route).toContain('IDEMPOTENCY_KEY_REUSE_CONFLICT');
    expect(migration).toContain(
      'UNIQUE(operation, actor_user_id, idempotency_key)'
    );
    expect(migration).toContain('request_hash text NOT NULL');
  });

  it('serializes same-key requests before allocating a package number', () => {
    const lock = route.indexOf('idempotency_key=$2 FOR UPDATE');
    const allocation = route.indexOf(
      "nextval('qms_epoch_validation_package_number_seq')"
    );
    expect(lock).toBeGreaterThan(0);
    expect(allocation).toBeGreaterThan(lock);
    expect(route).toContain('if(existing)return {package:existing,replay:true');
    expect(route).toContain('res.status(result.replay?200:201)');
  });

  it('keeps allocation, package creation, event logging, and request completion in one transaction', () => {
    const create = route.slice(
      route.indexOf("router.post('/',"),
      route.indexOf("router.post('/:id/void-duplicate'")
    );
    expect(create).toContain('const result=await tx(async q=>');
    expect(create).toContain('INSERT INTO qms_epoch_validation_packages');
    expect(create).toContain("'PACKAGE_CREATED'");
    expect(create).toContain(
      'UPDATE qms_epoch_validation_create_requests SET package_id=$1,completed_at=now()'
    );
    expect(create).not.toMatch(/count\(\*\)[^\n]*package_number/);
  });

  it('registers the additive migration in both boot lists', () => {
    expect(
      safeBoot.match(/0242_epoch_validation_create_idempotency\.sql/g)?.length
    ).toBe(2);
  });

  it('retains voided duplicates and locks them from downstream mutation', () => {
    expect(route).toContain("requirePermission('EPOCH_VALIDATION_ADMIN')");
    expect(route).toContain("status='VOID_DUPLICATE',locked_at=now()");
    expect(route).toContain("'PACKAGE_VOIDED_DUPLICATE'");
    expect(route).toContain("'VOID_DUPLICATE'].includes(p.status)");
    expect(migration).toContain("'VOID_DUPLICATE'");
  });
});
