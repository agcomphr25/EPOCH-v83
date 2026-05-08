/**
 * Unit tests for the digital-signature service (Task #145, Phase 3).
 *
 * The service owns its DB writes through Drizzle. To keep these tests fast
 * and deterministic, we mock the `db` module with an in-memory store that
 * mimics just the fragment of Drizzle's chainable query builder that the
 * service actually calls (insert/values/returning, select/from/where/limit,
 * update/set/where/returning, transaction). This lets us exercise the real
 * crypto code paths — keypair generation, AES-256-GCM wrap/unwrap with a
 * scrypt-derived KEK, Ed25519 sign/verify, key rotation, and tamper detection
 * — without spinning up Postgres.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const { tables, fakeDb } = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    user_signing_keys: [],
    digital_signatures: [],
    users: [],
  };

  function snakeToCamel(s: string): string {
    return s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
  }
  function tableNameOf(t: any): string {
    const symbols = Object.getOwnPropertySymbols(t);
    for (const s of symbols) {
      if (String(s).includes('Name')) return (t as any)[s];
    }
    return (t as any)[Symbol.for('drizzle:Name')] ?? '';
  }
  function rowsFor(t: any): Row[] {
    const name = tableNameOf(t);
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }
  function evalWhere(row: Row, where: any): boolean {
    if (!where) return true;
    if (typeof where === 'function') return where(row);
    return true;
  }
  function randomId(): string {
    return require('crypto').randomBytes(16).toString('hex');
  }

  const fakeDb: any = {
    insert(table: any) {
      return {
        values(vals: Row | Row[]) {
          const arr = Array.isArray(vals) ? vals : [vals];
          const inserted = arr.map((v) => {
            const row: Row = {
              id: v.id ?? randomId(),
              createdAt: new Date(),
              signedAt: new Date(),
              ...v,
            };
            rowsFor(table).push(row);
            return row;
          });
          return { returning(_cols?: any) { return Promise.resolve(inserted); } };
        },
      };
    },
    select(_cols?: any) {
      return {
        from(table: any) {
          const ctx = { table, where: null as any, limitN: Infinity };
          const builder: any = {
            where(p: any) { ctx.where = p; return builder; },
            limit(n: number) { ctx.limitN = n; return builder; },
            then(onFul: any, onRej: any) {
              const out = rowsFor(ctx.table)
                .filter((r) => evalWhere(r, ctx.where))
                .slice(0, ctx.limitN);
              return Promise.resolve(out).then(onFul, onRej);
            },
          };
          return builder;
        },
      };
    },
    update(table: any) {
      const ctx = { table, set: {} as Row, where: null as any };
      const apply = () => {
        const matches = rowsFor(ctx.table).filter((r) => evalWhere(r, ctx.where));
        for (const m of matches) Object.assign(m, ctx.set);
        return matches.map((m) => ({ ...m }));
      };
      const builder: any = {
        set(v: Row) { ctx.set = v; return builder; },
        where(p: any) {
          ctx.where = p;
          // Make the chain awaitable WITHOUT a trailing .returning() — Drizzle
          // allows `await db.update(...).set(...).where(...)`.
          builder.then = (onFul: any, onRej: any) =>
            Promise.resolve(apply()).then(onFul, onRej);
          return builder;
        },
        returning(_cols?: any) { return Promise.resolve(apply()); },
      };
      return builder;
    },
    transaction(fn: any) { return fn(fakeDb); },
    __snakeToCamel: snakeToCamel,
  };

  return { tables, fakeDb };
});

vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
  return {
    ...actual,
    eq: (col: any, val: any) => (row: Row) => {
      const colName = String(col?.name ?? col);
      return row[colName] === val || row[snakeToCamel(colName)] === val;
    },
    and: (...preds: any[]) => (row: Row) => preds.every((p) => p(row)),
    isNull: (col: any) => (row: Row) => {
      const n = String(col?.name ?? col);
      const v = row[n] ?? row[n.replace(/_([a-z])/g, (_m, c) => c.toUpperCase())];
      return v == null;
    },
  };
});

vi.mock('../db', () => ({ db: fakeDb }));
vi.mock('../../db', () => ({ db: fakeDb }));

// Minimal canonicalize stand-in to keep the tests independent of the audit
// ledger service's import graph.
vi.mock('../src/services/auditLedgerService', () => ({
  canonicalize(value: any): string {
    const sortKeys = (v: any): any => {
      if (Array.isArray(v)) return v.map(sortKeys);
      if (v && typeof v === 'object') {
        return Object.keys(v).sort().reduce((acc: any, k) => { acc[k] = sortKeys(v[k]); return acc; }, {});
      }
      return v;
    };
    return JSON.stringify(sortKeys(value));
  },
}));

import {
  ensureUserKeypair,
  rotateKey,
  sign,
  verify,
  verifyAgainstPayload,
  DigitalSignatureError,
} from '../src/services/digitalSignatureService';

beforeEach(() => {
  for (const k of Object.keys(tables)) tables[k].length = 0;
  // Seed a user so getUserRole has something to return.
  tables.users.push({ id: 1, role: 'ADMIN', username: 'alice' });
  tables.users.push({ id: 2, role: 'EMPLOYEE', username: 'bob' });
});

describe('digitalSignatureService — keypair lifecycle', () => {
  it('ensureUserKeypair is idempotent', async () => {
    const id1 = await ensureUserKeypair(1, 'pw-1');
    const id2 = await ensureUserKeypair(1, 'pw-1');
    expect(id1).toBe(id2);
    expect(tables.user_signing_keys.length).toBe(1);
  });

  it('generated keys are wrapped (no plaintext private key field)', async () => {
    await ensureUserKeypair(1, 'pw-1');
    const row = tables.user_signing_keys[0];
    expect(row.publicKey).toBeTruthy();
    expect(row.wrappedPrivateKey).toBeTruthy();
    expect(row.wrapAlgorithm).toBe('AES-256-GCM');
    expect(row.algorithm).toBe('Ed25519');
    // No accidental plaintext fields
    expect((row as any).privateKey).toBeUndefined();
  });
});

describe('digitalSignatureService — sign / verify happy path', () => {
  it('round-trips a signature', async () => {
    await ensureUserKeypair(1, 'hunter2');
    const sig = await sign({
      userId: 1,
      password: 'hunter2',
      transactionClass: 'MATERIAL_OVERRIDE',
      payload: { action: 'consume', lot: 'lot-1', qty: 5 },
    });
    expect(sig.id).toBeTruthy();
    expect(sig.signerRole).toBe('ADMIN');
    const v = await verify({ signatureId: sig.id });
    expect(v.valid).toBe(true);
  });

  it('rejects signing with the wrong password', async () => {
    await ensureUserKeypair(1, 'hunter2');
    await expect(
      sign({
        userId: 1,
        password: 'wrong-password',
        transactionClass: 'MATERIAL_OVERRIDE',
        payload: { x: 1 },
      }),
    ).rejects.toBeInstanceOf(DigitalSignatureError);
  });

  it('verify reports PAYLOAD_HASH_MISMATCH when stored payload is tampered', async () => {
    await ensureUserKeypair(1, 'hunter2');
    const sig = await sign({
      userId: 1,
      password: 'hunter2',
      transactionClass: 'MATERIAL_OVERRIDE',
      payload: { action: 'consume', qty: 5 },
    });
    // Simulate an attacker mutating the stored canonical payload.
    const row = tables.digital_signatures.find((r) => r.id === sig.id)!;
    row.payloadCanonical = { action: 'consume', qty: 99 };
    const result = await verify({ signatureId: sig.id });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('PAYLOAD_HASH_MISMATCH');
  });

  it('verifyAgainstPayload rejects when the supplied payload differs from the signed one', async () => {
    await ensureUserKeypair(1, 'hunter2');
    const sig = await sign({
      userId: 1,
      password: 'hunter2',
      transactionClass: 'MATERIAL_OVERRIDE',
      payload: { action: 'consume', qty: 5 },
    });
    const result = await verifyAgainstPayload(sig.id, {
      transactionClass: 'MATERIAL_OVERRIDE',
      payload: { action: 'consume', qty: 6 }, // qty differs
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('PAYLOAD_MISMATCH');
  });

  it('NO_ACTIVE_KEY when user has no enrolled key', async () => {
    await expect(
      sign({ userId: 999, password: 'x', transactionClass: 'X', payload: {} }),
    ).rejects.toMatchObject({ code: 'NO_ACTIVE_KEY' });
  });
});

describe('digitalSignatureService — admin password reset (rotation without old plaintext)', () => {
  it('after rotateKey under a new password, NEW signing succeeds and OLD signatures remain verifiable', async () => {
    // Simulates the admin password-reset flow used by the user-management
    // route: the admin doesn't know the user's previous password, so the
    // service must rotate (revoke old + insert new) under the new password.
    await ensureUserKeypair(1, 'original-pw');
    const oldSig = await sign({
      userId: 1, password: 'original-pw',
      transactionClass: 'MATERIAL_OVERRIDE', payload: { lot: 'L1', qty: 7 },
    });
    expect((await import('../src/services/digitalSignatureService')).hasActiveSigningKey).toBeDefined();

    // Admin resets the password — previously a real bug: the active key
    // would still be wrapped under the OLD password and signing would fail.
    await rotateKey(1, 'new-admin-set-pw', 'admin_password_reset');

    // (a) New signing works under the NEW password.
    const newSig = await sign({
      userId: 1, password: 'new-admin-set-pw',
      transactionClass: 'MATERIAL_OVERRIDE', payload: { lot: 'L2', qty: 3 },
    });
    const vNew = await verify({ signatureId: newSig.id });
    expect(vNew.valid).toBe(true);

    // (b) The OLD signature still verifies (its certificate is preserved
    //     even though revoked).
    const vOld = await verify({ signatureId: oldSig.id });
    expect(vOld.valid).toBe(true);
    expect(vOld.certificateRevokedAt).toBeTruthy();

    // (c) Trying to sign with the OLD password against the NEW key fails
    //     loudly — no silent acceptance.
    await expect(
      sign({
        userId: 1, password: 'original-pw',
        transactionClass: 'MATERIAL_OVERRIDE', payload: { lot: 'L3', qty: 1 },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
  });
});

describe('digitalSignatureService — rotation', () => {
  it('old signatures still verify after rotation; new signatures use the new cert', async () => {
    await ensureUserKeypair(1, 'pw-old');
    const oldSig = await sign({
      userId: 1, password: 'pw-old', transactionClass: 'X', payload: { a: 1 },
    });
    const newCertId = await rotateKey(1, 'pw-new', 'periodic');
    expect(newCertId).not.toBe(oldSig.certificateId);

    // Old signature still verifies (its certificate row is preserved).
    const v1 = await verify({ signatureId: oldSig.id });
    expect(v1.valid).toBe(true);
    expect(v1.certificateRevokedAt).not.toBeNull(); // surfaced for policy

    // Trying to sign with the OLD password against the NEW key fails.
    await expect(
      sign({ userId: 1, password: 'pw-old', transactionClass: 'X', payload: { a: 2 } }),
    ).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });

    // Signing with the NEW password against the NEW key succeeds.
    const newSig = await sign({
      userId: 1, password: 'pw-new', transactionClass: 'X', payload: { a: 2 },
    });
    expect(newSig.certificateId).toBe(newCertId);
    const v2 = await verify({ signatureId: newSig.id });
    expect(v2.valid).toBe(true);
    expect(v2.certificateRevokedAt ?? null).toBeNull();
  });
});
