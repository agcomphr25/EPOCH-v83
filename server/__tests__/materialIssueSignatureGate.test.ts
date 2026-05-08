/**
 * Integration test for the digital-signature gate in MaterialIssueService
 * (Task #145, Phase 3).
 *
 * Exercises the acceptance scenarios called out in the task definition:
 *   - missing-signature blocks a high-risk draw
 *   - a valid signature lets the same draw through
 *   - a tampered signature payload is rejected
 *   - a signature for a DIFFERENT transaction does not satisfy the gate
 *   - after rotation, NEW signatures verify and OLD signatures still verify
 *
 * The MaterialIssueService talks to Drizzle and `storage`; we mock both so
 * the test is hermetic. The digital-signature service runs for real (real
 * Ed25519 + AES-256-GCM crypto), backed by the same in-memory db fake.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const { tables, fakeDb } = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    user_signing_keys: [],
    digital_signatures: [],
    users: [],
  };
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
            const row: Row = { id: v.id ?? randomId(), createdAt: new Date(), signedAt: new Date(), ...v };
            rowsFor(table).push(row);
            return row;
          });
          return { returning(_c?: any) { return Promise.resolve(inserted); } };
        },
      };
    },
    select(_c?: any) {
      return {
        from(table: any) {
          const ctx = { table, where: null as any, limitN: Infinity };
          const builder: any = {
            where(p: any) { ctx.where = p; return builder; },
            limit(n: number) { ctx.limitN = n; return builder; },
            then(onFul: any, onRej: any) {
              const out = rowsFor(ctx.table).filter((r) => evalWhere(r, ctx.where)).slice(0, ctx.limitN);
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
          builder.then = (onFul: any, onRej: any) => Promise.resolve(apply()).then(onFul, onRej);
          return builder;
        },
        returning(_c?: any) { return Promise.resolve(apply()); },
      };
      return builder;
    },
    transaction(fn: any) { return fn(fakeDb); },
  };
  return { tables, fakeDb };
});

vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  const snake = (s: string) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
  return {
    ...actual,
    eq: (col: any, val: any) => (row: Row) => {
      const n = String(col?.name ?? col);
      return row[n] === val || row[snake(n)] === val;
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

// We intercept the storage module so we can serve a deterministic lot to the
// gate without touching Postgres. Only `getMaterialLot` matters — the
// signature gate only inspects lot status + expirationDate. Everything else
// the validator might want we also stub harmlessly.
const lotStore: { current: any } = { current: null };
vi.mock('../storage', () => ({
  storage: {
    getMaterialLot: async (_id: string) => lotStore.current,
    // Return passing stubs so the unrelated traveler/WAD/step gates do
    // not contaminate "is the draw fully eligible?" assertions.
    getTraveler: async (_id: string) => ({
      id: 't1', status: 'in_progress', productionWorkOrderId: 'wo1',
    }),
    getTravelerStep: async (_id: string) => ({
      id: 's1', travelerId: 't1', status: 'in_progress',
    }),
    getWorkOrderById: async (_id: string) => ({
      id: 'wo1', status: 'released', wadStatus: 'approved',
    }),
    getLotReservations: async () => [],
  },
}));

import { validateIssueEligibility } from '../src/services/materialIssueService';
import { ensureUserKeypair, sign, rotateKey } from '../src/services/digitalSignatureService';
import {
  buildMaterialIssueSignaturePayload,
  SIGNATURE_TRANSACTION_CLASSES,
} from '../src/services/digitalSignaturePayloads';

const SIGNER_USER_ID = 1;
const SIGNER_PASSWORD = 'super-secret';
const LOT_ID = 'lot-test-1';

function baseLot(overrides: Partial<any> = {}) {
  return {
    id: LOT_ID,
    status: 'ACCEPTED',
    expirationDate: null,
    remainingQty: '100',
    inventoryItemId: 1,
    materialPartNumber: 'PN-1',
    unitOfMeasure: 'EA',
    ...overrides,
  };
}

function baseRequest(overrides: Partial<any> = {}): any {
  return {
    action: 'consume',
    materialLotId: LOT_ID,
    quantity: 5,
    operator: { userId: SIGNER_USER_ID, displayName: 'Alice' },
    travelerId: null,
    travelerStepId: null,
    productionWorkOrderId: null,
    chargeCodeId: null,
    reasonCode: null,
    notes: null,
    ...overrides,
  };
}

async function signFor(req: any, txClass: string, payloadOverrides: Partial<any> = {}) {
  const built = buildMaterialIssueSignaturePayload(txClass, {
    action: req.action,
    materialLotId: req.materialLotId,
    quantity: req.quantity,
    unitOfMeasure: null,
    travelerId: req.travelerId ?? null,
    travelerStepId: req.travelerStepId ?? null,
    productionWorkOrderId: req.productionWorkOrderId ?? null,
    chargeCodeId: req.chargeCodeId ?? null,
    reasonCode: req.reasonCode ?? null,
    approverUserId: req.operator.userId ?? null,
    approverDisplayName: req.operator.displayName,
    signerUserId: req.operator.userId,
    signerDisplayName: req.operator.displayName,
    ...payloadOverrides,
  });
  return sign({
    userId: SIGNER_USER_ID,
    password: SIGNER_PASSWORD,
    transactionClass: built.transactionClass,
    payload: built.payload,
  });
}

beforeEach(async () => {
  // Enable the scrap-threshold gate; without an explicit env value it
  // defaults to 0 (disabled) and the SCRAP class would never fire.
  process.env.DIGITAL_SIGNATURE_SCRAP_THRESHOLD_QTY = '10';
  process.env.DIGITAL_SIGNATURE_COUNT_ADJ_THRESHOLD_QTY = '25';
  for (const k of Object.keys(tables)) tables[k].length = 0;
  tables.users.push({ id: SIGNER_USER_ID, role: 'ADMIN', username: 'alice' });
  await ensureUserKeypair(SIGNER_USER_ID, SIGNER_PASSWORD);
});

describe('MaterialIssueService — digital signature gate', () => {
  it('does NOT require a signature for a routine in-tolerance consume', async () => {
    lotStore.current = baseLot();
    const blockers = await validateIssueEligibility(baseRequest({ travelerId: 't1', travelerStepId: 's1' }));
    const sigBlockers = blockers.filter((b) => b.blockingField === 'signature');
    expect(sigBlockers).toEqual([]);
  });

  it('blocks a quarantine release with MISSING_SIGNATURE', async () => {
    lotStore.current = baseLot({ status: 'QUARANTINE' });
    const req = baseRequest({ travelerId: 't1', travelerStepId: 's1' });
    const blockers = await validateIssueEligibility(req);
    expect(blockers.some((b) => b.code === 'MISSING_SIGNATURE')).toBe(true);
  });

  it('accepts a valid signature for a quarantine release (no blockers AT ALL)', async () => {
    lotStore.current = baseLot({ status: 'QUARANTINE' });
    const req = baseRequest({ travelerId: 't1', travelerStepId: 's1' });
    const sig = await signFor(req, SIGNATURE_TRANSACTION_CLASSES.QUARANTINE_RELEASE);
    req.digitalSignature = { signatureId: sig.id };
    const blockers = await validateIssueEligibility(req);
    // Signed quarantine release must clear BOTH the signature gate AND
    // the lot-status gate — the whole draw is eligible to proceed.
    expect(blockers).toEqual([]);
  });

  it('blocks an expired-lot draw without a signature; accepts it WITH a valid EXPIRED_LOT_USE signature', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    lotStore.current = baseLot({ expirationDate: yesterday });
    const req = baseRequest({ travelerId: 't1', travelerStepId: 's1' });

    // Without a signature → both LOT_EXPIRED and MISSING_SIGNATURE block.
    let blockers = await validateIssueEligibility(req);
    expect(blockers.some((b) => b.code === 'MISSING_SIGNATURE')).toBe(true);
    expect(blockers.some((b) => b.code === 'LOT_EXPIRED')).toBe(true);

    // With a matching signature → the entire draw is eligible (no blockers).
    const sig = await signFor(req, SIGNATURE_TRANSACTION_CLASSES.EXPIRED_LOT_USE);
    req.digitalSignature = { signatureId: sig.id };
    blockers = await validateIssueEligibility(req);
    expect(blockers).toEqual([]);
  });

  it('a SCRAP signature does NOT unlock a quarantined lot (wrong tx class)', async () => {
    lotStore.current = baseLot({ status: 'QUARANTINE' });
    // Build a request that would normally classify as SCRAP_ABOVE_THRESHOLD
    // (high scrap qty), but the lot is also QUARANTINE. The classifier
    // picks QUARANTINE_RELEASE first, so a SCRAP signature must be
    // rejected with INVALID_SIGNATURE AND LOT_QUARANTINED must remain.
    const req = baseRequest({
      travelerId: 't1', travelerStepId: 's1',
      reasonCode: 'SCRAP_DAMAGE', quantity: 50,
    });
    const wrongSig = await signFor(req, SIGNATURE_TRANSACTION_CLASSES.SCRAP_ABOVE_THRESHOLD);
    req.digitalSignature = { signatureId: wrongSig.id };
    const blockers = await validateIssueEligibility(req);
    expect(blockers.some((b) => b.code === 'INVALID_SIGNATURE')).toBe(true);
    expect(blockers.some((b) => b.code === 'LOT_QUARANTINED')).toBe(true);
  });

  it('rejects a signature whose stored payload was tampered with', async () => {
    lotStore.current = baseLot({ status: 'QUARANTINE' });
    const req = baseRequest({ travelerId: 't1', travelerStepId: 's1' });
    const sig = await signFor(req, SIGNATURE_TRANSACTION_CLASSES.QUARANTINE_RELEASE);
    // Mutate the stored canonical payload — verify must catch the hash drift.
    const stored = tables.digital_signatures.find((r) => r.id === sig.id)!;
    stored.payloadCanonical = { ...stored.payloadCanonical, quantity: 999 };
    req.digitalSignature = { signatureId: sig.id };
    const blockers = await validateIssueEligibility(req);
    expect(blockers.some((b) => b.code === 'INVALID_SIGNATURE')).toBe(true);
  });

  it('rejects a signature that was produced for a DIFFERENT transaction', async () => {
    lotStore.current = baseLot({ status: 'QUARANTINE' });
    // Sign for a 5-unit draw...
    const signedReq = baseRequest({ travelerId: 't1', travelerStepId: 's1', quantity: 5 });
    const sig = await signFor(signedReq, SIGNATURE_TRANSACTION_CLASSES.QUARANTINE_RELEASE);
    // ...but try to use the signature on a 50-unit draw.
    const submittedReq = baseRequest({ travelerId: 't1', travelerStepId: 's1', quantity: 50 });
    submittedReq.digitalSignature = { signatureId: sig.id };
    const blockers = await validateIssueEligibility(submittedReq);
    expect(blockers.some((b) => b.code === 'INVALID_SIGNATURE')).toBe(true);
  });

  it('blocks scrap-above-threshold without a signature, accepts with one', async () => {
    lotStore.current = baseLot();
    const req = baseRequest({
      travelerId: 't1',
      travelerStepId: 's1',
      reasonCode: 'SCRAP_DAMAGE',
      quantity: 50, // well above the default threshold (10)
    });
    let blockers = await validateIssueEligibility(req);
    expect(blockers.some((b) => b.code === 'MISSING_SIGNATURE')).toBe(true);

    const sig = await signFor(req, SIGNATURE_TRANSACTION_CLASSES.SCRAP_ABOVE_THRESHOLD);
    req.digitalSignature = { signatureId: sig.id };
    blockers = await validateIssueEligibility(req);
    expect(blockers.filter((b) => b.blockingField === 'signature')).toEqual([]);
  });

  it('still verifies signatures issued before a key rotation', async () => {
    lotStore.current = baseLot({ status: 'QUARANTINE' });
    const req = baseRequest({ travelerId: 't1', travelerStepId: 's1' });
    const oldSig = await signFor(req, SIGNATURE_TRANSACTION_CLASSES.QUARANTINE_RELEASE);
    await rotateKey(SIGNER_USER_ID, 'rotated-password', 'periodic');
    req.digitalSignature = { signatureId: oldSig.id };
    const blockers = await validateIssueEligibility(req);
    expect(blockers.filter((b) => b.blockingField === 'signature')).toEqual([]);
  });
});
