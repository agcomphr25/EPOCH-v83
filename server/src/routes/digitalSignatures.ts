/**
 * Routes for the digital-signature service (Task #145).
 *
 *   POST   /api/digital-signatures/keys/initialize  — first-time enrollment
 *   POST   /api/digital-signatures/keys/rotate      — rotate active key
 *   POST   /api/digital-signatures/keys/revoke      — emergency revocation (admin)
 *   POST   /api/digital-signatures/sign             — sign a canonical payload
 *   GET    /api/digital-signatures/:id/verify       — re-verify a stored signature
 *   GET    /api/digital-signatures/:id              — fetch signature metadata
 *
 * The keystore is software-managed: the user's password / PIN unwraps their
 * private key inside the request handler and is then immediately discarded.
 * NEVER log the password or any unwrapped key material.
 */

import { Router, type Request, type Response } from 'express';
import { authenticateToken, requireAdminOrOwner, requireRole } from '../../middleware/auth';
import { db } from '../../db';
import { eq } from 'drizzle-orm';
import { digitalSignatures, inventoryTransactionLedger } from '../../schema';
import {
  DigitalSignatureError,
  ensureUserKeypair,
  revokeKey,
  rotateKey,
  sign,
  verify,
} from '../services/digitalSignatureService';

const router = Router();
router.use(authenticateToken);

function currentUser(req: Request): { id?: number; username?: string; role?: string } {
  return (req.user ?? {}) as { id?: number; username?: string; role?: string };
}

function handleError(res: Response, err: unknown, fallback: string) {
  if (err instanceof DigitalSignatureError) {
    const status = err.code === 'NOT_FOUND' ? 404 :
      err.code === 'INVALID_PASSWORD' ? 401 :
      err.code === 'NO_ACTIVE_KEY' ? 412 : 400;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  console.error('[digital-signatures]', fallback, err);
  return res.status(500).json({ error: fallback });
}

router.post('/keys/initialize', async (req: Request, res: Response) => {
  const user = currentUser(req);
  if (!user.id) return res.status(401).json({ error: 'Authentication required' });
  const { password } = req.body ?? {};
  if (!password) return res.status(400).json({ error: 'password is required' });
  try {
    const id = await ensureUserKeypair(user.id, password);
    res.status(201).json({ certificateId: id });
  } catch (err) {
    handleError(res, err, 'Failed to initialize signing key');
  }
});

router.post('/keys/rotate', async (req: Request, res: Response) => {
  const user = currentUser(req);
  if (!user.id) return res.status(401).json({ error: 'Authentication required' });
  const { password, reason } = req.body ?? {};
  if (!password) return res.status(400).json({ error: 'password is required' });
  try {
    const id = await rotateKey(user.id, password, reason ?? 'rotation');
    res.status(201).json({ certificateId: id });
  } catch (err) {
    handleError(res, err, 'Failed to rotate signing key');
  }
});

router.post('/keys/revoke', requireAdminOrOwner, async (req: Request, res: Response) => {
  const { userId, reason } = req.body ?? {};
  if (!userId || !reason) {
    return res.status(400).json({ error: 'userId and reason are required' });
  }
  try {
    const ok = await revokeKey(Number(userId), String(reason));
    res.json({ revoked: ok });
  } catch (err) {
    handleError(res, err, 'Failed to revoke signing key');
  }
});

router.post('/sign', async (req: Request, res: Response) => {
  const user = currentUser(req);
  if (!user.id) return res.status(401).json({ error: 'Authentication required' });
  const { password, transactionClass, payload, signingDeviceFingerprint } = req.body ?? {};
  try {
    const result = await sign({
      userId: user.id,
      password,
      transactionClass,
      payload,
      signingDeviceFingerprint: signingDeviceFingerprint ?? null,
      signerRole: user.role ?? null,
    });
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, 'Failed to produce signature');
  }
});

// Audit-only role gate. Verification responses include the signed payload
// hash and the binding between user / certificate / transaction class — that
// is privileged information that should NOT be exposed to every authenticated
// user. We allow admins/owners and any explicit AUDIT* role.
const requireAuditAccess = requireRole('ADMIN', 'OWNER', 'AUDITOR', 'COMPLIANCE');

/**
 * Audit endpoint: verify a signature by its signature id.
 */
router.get('/:id/verify', requireAuditAccess, async (req: Request, res: Response) => {
  try {
    const result = await verify({ signatureId: req.params.id });
    res.json(result);
  } catch (err) {
    handleError(res, err, 'Failed to verify signature');
  }
});

/**
 * Audit endpoint: verify the signature attached to an
 * inventory_transaction_ledger row by ledger transaction id. Returns 404 if
 * the ledger row has no signature attached. This is the
 * `verifySignature(transactionId)` entry point called for from the original
 * task definition — it lets reviewers check a specific controlled draw
 * without first having to look up the signature id.
 */
router.get(
  '/by-transaction/:transactionId/verify',
  requireAuditAccess,
  async (req: Request, res: Response) => {
    try {
      const txId = Number(req.params.transactionId);
      if (!Number.isFinite(txId) || txId <= 0) {
        return res.status(400).json({ error: 'transactionId must be a positive integer' });
      }
      const [tx] = await db
        .select({
          id: inventoryTransactionLedger.id,
          digitalSignatureId: inventoryTransactionLedger.digitalSignatureId,
        })
        .from(inventoryTransactionLedger)
        .where(eq(inventoryTransactionLedger.id, txId))
        .limit(1);
      if (!tx) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      if (!tx.digitalSignatureId) {
        return res
          .status(404)
          .json({ error: 'Transaction has no associated digital signature' });
      }
      const result = await verify({ signatureId: tx.digitalSignatureId });
      res.json({ transactionId: txId, signatureId: tx.digitalSignatureId, ...result });
    } catch (err) {
      handleError(res, err, 'Failed to verify transaction signature');
    }
  },
);

/** Audit endpoint: fetch signature metadata. Restricted to audit roles. */
router.get('/:id', requireAuditAccess, async (req: Request, res: Response) => {
  const [row] = await db
    .select({
      id: digitalSignatures.id,
      signerUserId: digitalSignatures.signerUserId,
      signerRole: digitalSignatures.signerRole,
      certificateId: digitalSignatures.certificateId,
      algorithm: digitalSignatures.algorithm,
      transactionClass: digitalSignatures.transactionClass,
      payloadHash: digitalSignatures.payloadHash,
      signingDeviceFingerprint: digitalSignatures.signingDeviceFingerprint,
      signedAt: digitalSignatures.signedAt,
    })
    .from(digitalSignatures)
    .where(eq(digitalSignatures.id, req.params.id))
    .limit(1);
  if (!row) return res.status(404).json({ error: 'Signature not found' });
  res.json(row);
});

export default router;
