/**
 * digitalSignatureService — Task #145 (Phase 3).
 *
 * Software-managed Ed25519 signing keystore + signing/verification surface
 * used by controlled inventory transactions (override approvals, scrap above
 * threshold, quarantine release, expired-lot use, high-magnitude cycle-count
 * adjustments) and any other compliance-relevant flow that needs a verifiable
 * tie between a person, a payload, and a moment in time.
 *
 * Key handling invariants:
 *   - Every user has at most ONE active signing key (`revoked_at IS NULL`),
 *     enforced by a partial unique index.
 *   - The private key is never stored in plaintext. It is wrapped at rest
 *     with AES-256-GCM using a key-encryption-key (KEK) derived from the
 *     user's password / PIN via scrypt. The KEK lives in memory only for the
 *     duration of a single sign() call and is overwritten with zeros before
 *     return.
 *   - Rotation = insert a NEW active key + stamp `revoked_at` on the old.
 *     Old signatures still verify against the preserved old public key.
 *   - Tables are append-only (DB triggers enforce this); `verify()` is the
 *     only operation that does not mutate state.
 *
 * The service exposes a small surface intentionally:
 *
 *     ensureUserKeypair(userId, password)        // first-time enrollment / re-wrap
 *     rewrapOnPasswordChange(userId, old, new)   // password change → rewrap private key
 *     rotateKey(userId, password, reason?)       // generate new keypair, revoke old
 *     revokeKey(userId, reason)                  // emergency revocation (no rewrap)
 *     sign({ userId, password, transactionClass, payload })
 *     verify({ signatureId })
 */

import crypto from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { digitalSignatures, userSigningKeys, users } from '../../schema';
import { canonicalize } from './auditLedgerService';

const SIGNING_ALGORITHM = 'Ed25519';
const WRAP_ALGORITHM = 'AES-256-GCM';
const KDF_NAME = 'scrypt';
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 32 } as const;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export interface CanonicalSignaturePayload {
  /** Stable machine identifier for the kind of transaction being authorized. */
  transactionClass: string;
  /** Free-form structured payload — the exact bytes that will be signed. */
  payload: Record<string, unknown>;
}

export interface SignRequest {
  userId: number;
  password: string;
  transactionClass: string;
  payload: Record<string, unknown>;
  signingDeviceFingerprint?: string | null;
  signerRole?: string | null;
}

export interface SignResult {
  id: string;
  signerUserId: number;
  signerRole: string;
  certificateId: string;
  algorithm: string;
  transactionClass: string;
  payloadHash: string;
  signatureBytes: string;
  signedAt: Date;
}

export interface VerifyResult {
  valid: boolean;
  signatureId: string;
  signerUserId: number;
  signerRole: string;
  certificateId: string;
  certificateRevokedAt: Date | null;
  transactionClass: string;
  signedAt: Date;
  reason?: string;
}

export class DigitalSignatureError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`DigitalSignatureService: ${message}`);
    this.code = code;
    this.name = 'DigitalSignatureError';
  }
}

function derivKekFromPassword(password: string, salt: Buffer): Buffer {
  if (typeof password !== 'string' || password.length === 0) {
    throw new DigitalSignatureError('INVALID_PASSWORD', 'password / PIN is required to unwrap the signing key');
  }
  return crypto.scryptSync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_MAXMEM,
  });
}

function wrapPrivateKey(privateKeyDer: Buffer, kek: Buffer): {
  ciphertext: string;
  iv: string;
  authTag: string;
} {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKeyDer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

function unwrapPrivateKey(
  ciphertextB64: string,
  ivB64: string,
  authTagB64: string,
  kek: Buffer,
): Buffer {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    kek,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);
  } catch (err: any) {
    // GCM auth-tag mismatch → wrong password / corrupted ciphertext.
    throw new DigitalSignatureError(
      'INVALID_PASSWORD',
      'Could not unwrap signing key — password / PIN incorrect or key data corrupted',
    );
  }
}

function zero(buf: Buffer): void {
  if (buf && buf.length) buf.fill(0);
}

export function payloadHashHex(p: CanonicalSignaturePayload): string {
  const canonical = canonicalize({
    transactionClass: p.transactionClass,
    payload: p.payload,
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function payloadCanonicalBytes(p: CanonicalSignaturePayload): Buffer {
  return Buffer.from(
    canonicalize({ transactionClass: p.transactionClass, payload: p.payload }),
    'utf8',
  );
}

async function getActiveKey(userId: number) {
  const [row] = await db
    .select()
    .from(userSigningKeys)
    .where(and(eq(userSigningKeys.userId, userId), isNull(userSigningKeys.revokedAt)))
    .limit(1);
  return row ?? null;
}

async function getKeyById(id: string) {
  const [row] = await db.select().from(userSigningKeys).where(eq(userSigningKeys.id, id)).limit(1);
  return row ?? null;
}

async function getUserRole(userId: number): Promise<string> {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.role ?? 'EMPLOYEE';
}

/**
 * Generate an Ed25519 keypair for the user if one does not already exist.
 * Idempotent: if an active key is already present, this is a no-op and the
 * existing key id is returned. Otherwise a new keypair is generated and the
 * private key is wrapped with a KEK derived from the supplied password.
 */
/**
 * Returns true iff the user has an active (non-revoked) signing key.
 * Used by the user-management routes to decide between enroll vs rotate
 * on password changes. Cheap — single indexed lookup.
 */
export async function hasActiveSigningKey(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: userSigningKeys.id })
    .from(userSigningKeys)
    .where(and(eq(userSigningKeys.userId, userId), isNull(userSigningKeys.revokedAt)))
    .limit(1);
  return !!row;
}

export async function ensureUserKeypair(userId: number, password: string): Promise<string> {
  const existing = await getActiveKey(userId);
  if (existing) return existing.id;
  return generateAndStoreKeypair(userId, password, null);
}

async function generateAndStoreKeypair(
  userId: number,
  password: string,
  rotatedFromId: string | null,
): Promise<string> {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ type: 'spki', format: 'der' });
  const privateDer = privateKey.export({ type: 'pkcs8', format: 'der' });

  const salt = crypto.randomBytes(16);
  const kek = derivKekFromPassword(password, salt);
  let wrapped;
  try {
    wrapped = wrapPrivateKey(privateDer, kek);
  } finally {
    zero(kek);
    zero(privateDer);
  }

  const [inserted] = await db
    .insert(userSigningKeys)
    .values({
      userId,
      algorithm: SIGNING_ALGORITHM,
      publicKey: publicDer.toString('base64'),
      wrappedPrivateKey: wrapped.ciphertext,
      wrapAlgorithm: WRAP_ALGORITHM,
      wrapIv: wrapped.iv,
      wrapAuthTag: wrapped.authTag,
      kdf: KDF_NAME,
      kdfSalt: salt.toString('base64'),
      kdfParams: SCRYPT_PARAMS as unknown as Record<string, unknown>,
      rotatedFromId: rotatedFromId,
    })
    .returning({ id: userSigningKeys.id });

  if (!inserted) {
    throw new DigitalSignatureError('STORAGE_FAILED', 'failed to persist new signing key');
  }
  return inserted.id;
}

/**
 * Rewrap the active private key under a new password (e.g. after a password
 * change). Same keypair, same public key, new KEK + new ciphertext.
 *
 * Implementation: insert a new active row carrying the same plaintext public
 * key but the freshly-wrapped private key, and revoke the old row. We don't
 * UPDATE the wrapped ciphertext in-place because the table is append-only.
 * Callers that prefer to keep the FK identity (`certificate_id`) stable
 * should use `rotateKey` instead — rewrap is intentionally a separate, more
 * conservative operation that preserves the public key bytes.
 */
export async function rewrapOnPasswordChange(
  userId: number,
  oldPassword: string,
  newPassword: string,
): Promise<string> {
  const active = await getActiveKey(userId);
  if (!active) {
    // No key yet — generate one under the new password.
    return ensureUserKeypair(userId, newPassword);
  }

  // Decrypt with old, re-encrypt with new.
  const oldKek = derivKekFromPassword(oldPassword, Buffer.from(active.kdfSalt, 'base64'));
  let privateDer: Buffer;
  try {
    privateDer = unwrapPrivateKey(
      active.wrappedPrivateKey,
      active.wrapIv,
      active.wrapAuthTag,
      oldKek,
    );
  } finally {
    zero(oldKek);
  }

  const newSalt = crypto.randomBytes(16);
  const newKek = derivKekFromPassword(newPassword, newSalt);
  let wrapped;
  try {
    wrapped = wrapPrivateKey(privateDer, newKek);
  } finally {
    zero(newKek);
    zero(privateDer);
  }

  return db.transaction(async (tx) => {
    await tx
      .update(userSigningKeys)
      .set({ revokedAt: new Date(), revokedReason: 'password_rewrap' })
      .where(eq(userSigningKeys.id, active.id));

    const [inserted] = await tx
      .insert(userSigningKeys)
      .values({
        userId,
        algorithm: active.algorithm,
        publicKey: active.publicKey, // SAME keypair — public key unchanged
        wrappedPrivateKey: wrapped.ciphertext,
        wrapAlgorithm: WRAP_ALGORITHM,
        wrapIv: wrapped.iv,
        wrapAuthTag: wrapped.authTag,
        kdf: KDF_NAME,
        kdfSalt: newSalt.toString('base64'),
        kdfParams: SCRYPT_PARAMS as unknown as Record<string, unknown>,
        rotatedFromId: active.id,
      })
      .returning({ id: userSigningKeys.id });
    return inserted.id;
  });
}

/**
 * Generate a brand new keypair for the user, revoke the old one. Old
 * signatures still verify against the (preserved, append-only) old key row;
 * new signatures use the new key.
 */
export async function rotateKey(
  userId: number,
  password: string,
  reason: string = 'rotation',
): Promise<string> {
  return db.transaction(async (tx) => {
    const [active] = await tx
      .select()
      .from(userSigningKeys)
      .where(and(eq(userSigningKeys.userId, userId), isNull(userSigningKeys.revokedAt)))
      .limit(1);

    let rotatedFromId: string | null = null;
    if (active) {
      await tx
        .update(userSigningKeys)
        .set({ revokedAt: new Date(), revokedReason: reason })
        .where(eq(userSigningKeys.id, active.id));
      rotatedFromId = active.id;
    }

    // Generate the new keypair inside the same tx by calling the helper,
    // but we need to use the same tx — duplicate the body here to stay tx-local.
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicDer = publicKey.export({ type: 'spki', format: 'der' });
    const privateDer = privateKey.export({ type: 'pkcs8', format: 'der' });

    const salt = crypto.randomBytes(16);
    const kek = derivKekFromPassword(password, salt);
    let wrapped;
    try {
      wrapped = wrapPrivateKey(privateDer, kek);
    } finally {
      zero(kek);
      zero(privateDer);
    }

    const [inserted] = await tx
      .insert(userSigningKeys)
      .values({
        userId,
        algorithm: SIGNING_ALGORITHM,
        publicKey: publicDer.toString('base64'),
        wrappedPrivateKey: wrapped.ciphertext,
        wrapAlgorithm: WRAP_ALGORITHM,
        wrapIv: wrapped.iv,
        wrapAuthTag: wrapped.authTag,
        kdf: KDF_NAME,
        kdfSalt: salt.toString('base64'),
        kdfParams: SCRYPT_PARAMS as unknown as Record<string, unknown>,
        rotatedFromId,
      })
      .returning({ id: userSigningKeys.id });
    return inserted.id;
  });
}

/**
 * Mark the user's currently-active key as revoked WITHOUT generating a
 * replacement. Subsequent sign() calls will fail with NO_ACTIVE_KEY until a
 * new key is enrolled. Existing signatures remain verifiable.
 */
export async function revokeKey(userId: number, reason: string): Promise<boolean> {
  const result = await db
    .update(userSigningKeys)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(userSigningKeys.userId, userId), isNull(userSigningKeys.revokedAt)))
    .returning({ id: userSigningKeys.id });
  return result.length > 0;
}

/**
 * Produce a digital signature over the canonical bytes of `payload`. The
 * caller must supply the user's password / PIN — the wrapped private key is
 * unwrapped only for the duration of this function and then zeroed.
 */
export async function sign(req: SignRequest): Promise<SignResult> {
  if (!req || typeof req.userId !== 'number') {
    throw new DigitalSignatureError('INVALID_REQUEST', 'sign requires a userId');
  }
  if (!req.transactionClass) {
    throw new DigitalSignatureError('INVALID_REQUEST', 'sign requires a transactionClass');
  }
  if (!req.payload || typeof req.payload !== 'object') {
    throw new DigitalSignatureError('INVALID_REQUEST', 'sign requires a payload object');
  }

  const active = await getActiveKey(req.userId);
  if (!active) {
    throw new DigitalSignatureError(
      'NO_ACTIVE_KEY',
      `User ${req.userId} has no active signing key — enroll one before signing`,
    );
  }

  const kek = derivKekFromPassword(req.password, Buffer.from(active.kdfSalt, 'base64'));
  let privateDer: Buffer;
  try {
    privateDer = unwrapPrivateKey(active.wrappedPrivateKey, active.wrapIv, active.wrapAuthTag, kek);
  } finally {
    zero(kek);
  }

  let signatureBytes: Buffer;
  try {
    const privateKeyObject = crypto.createPrivateKey({
      key: privateDer,
      format: 'der',
      type: 'pkcs8',
    });
    const canonical = payloadCanonicalBytes({
      transactionClass: req.transactionClass,
      payload: req.payload,
    });
    signatureBytes = crypto.sign(null, canonical, privateKeyObject);
  } finally {
    zero(privateDer);
  }

  const role = req.signerRole ?? (await getUserRole(req.userId));
  const hash = payloadHashHex({
    transactionClass: req.transactionClass,
    payload: req.payload,
  });

  const [inserted] = await db
    .insert(digitalSignatures)
    .values({
      signerUserId: req.userId,
      signerRole: role,
      certificateId: active.id,
      algorithm: SIGNING_ALGORITHM,
      transactionClass: req.transactionClass,
      payloadHash: hash,
      payloadCanonical: req.payload as Record<string, unknown>,
      signatureBytes: signatureBytes.toString('base64'),
      signingDeviceFingerprint: req.signingDeviceFingerprint ?? null,
    })
    .returning();

  if (!inserted) {
    throw new DigitalSignatureError('STORAGE_FAILED', 'failed to persist signature');
  }

  return {
    id: inserted.id,
    signerUserId: inserted.signerUserId,
    signerRole: inserted.signerRole,
    certificateId: inserted.certificateId,
    algorithm: inserted.algorithm,
    transactionClass: inserted.transactionClass,
    payloadHash: inserted.payloadHash,
    signatureBytes: inserted.signatureBytes,
    signedAt: inserted.signedAt as Date,
  };
}

/**
 * Re-verify a stored signature against its certificate's public key and the
 * exact canonical bytes that were signed. Returns a structured result;
 * `valid: false` carries a `reason` so audit can report WHY a signature
 * failed (tampered payload vs. wrong key vs. revoked-then-tampered etc.).
 *
 * Verification is intentionally tolerant of certificate revocation: a
 * signature produced before the certificate was revoked still verifies as
 * cryptographically valid, but the result surfaces `certificateRevokedAt` so
 * downstream callers can apply policy.
 */
export async function verify(params: { signatureId: string }): Promise<VerifyResult> {
  const [sig] = await db
    .select()
    .from(digitalSignatures)
    .where(eq(digitalSignatures.id, params.signatureId))
    .limit(1);
  if (!sig) {
    throw new DigitalSignatureError('NOT_FOUND', `Signature ${params.signatureId} not found`);
  }

  const cert = await getKeyById(sig.certificateId);
  if (!cert) {
    return {
      valid: false,
      signatureId: sig.id,
      signerUserId: sig.signerUserId,
      signerRole: sig.signerRole,
      certificateId: sig.certificateId,
      certificateRevokedAt: null,
      transactionClass: sig.transactionClass,
      signedAt: sig.signedAt as Date,
      reason: 'CERTIFICATE_NOT_FOUND',
    };
  }

  // Re-derive canonical bytes from the stored payload — if anyone tampered
  // with the JSON in the row, the recomputed hash / signature will diverge.
  const canonical = payloadCanonicalBytes({
    transactionClass: sig.transactionClass,
    payload: sig.payloadCanonical as Record<string, unknown>,
  });
  const recomputedHash = crypto.createHash('sha256').update(canonical).digest('hex');
  if (recomputedHash !== sig.payloadHash) {
    return {
      valid: false,
      signatureId: sig.id,
      signerUserId: sig.signerUserId,
      signerRole: sig.signerRole,
      certificateId: sig.certificateId,
      certificateRevokedAt: cert.revokedAt as Date | null,
      transactionClass: sig.transactionClass,
      signedAt: sig.signedAt as Date,
      reason: 'PAYLOAD_HASH_MISMATCH',
    };
  }

  let cryptoValid = false;
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(cert.publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    cryptoValid = crypto.verify(
      null,
      canonical,
      publicKey,
      Buffer.from(sig.signatureBytes, 'base64'),
    );
  } catch (err: any) {
    cryptoValid = false;
  }

  return {
    valid: cryptoValid,
    signatureId: sig.id,
    signerUserId: sig.signerUserId,
    signerRole: sig.signerRole,
    certificateId: sig.certificateId,
    certificateRevokedAt: cert.revokedAt as Date | null,
    transactionClass: sig.transactionClass,
    signedAt: sig.signedAt as Date,
    reason: cryptoValid ? undefined : 'SIGNATURE_VERIFICATION_FAILED',
  };
}

/**
 * Verify that a freshly-supplied payload still matches the bytes that were
 * originally signed. Used by `MaterialIssueService` to detect cases where a
 * caller signed transaction A but submitted transaction B.
 */
export async function verifyAgainstPayload(
  signatureId: string,
  expected: CanonicalSignaturePayload,
): Promise<VerifyResult> {
  const result = await verify({ signatureId });
  if (!result.valid) return result;
  const expectedHash = payloadHashHex(expected);
  const [sig] = await db
    .select({ payloadHash: digitalSignatures.payloadHash })
    .from(digitalSignatures)
    .where(eq(digitalSignatures.id, signatureId))
    .limit(1);
  if (!sig || sig.payloadHash !== expectedHash) {
    return { ...result, valid: false, reason: 'PAYLOAD_MISMATCH' };
  }
  return result;
}
