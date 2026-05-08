/**
 * Operator authentication routes — Phase 2 of Task #143.
 *
 * Endpoints exposed under `/api/operator-auth`:
 *   POST /badge     — exchange a badge scan for a short-lived operator session token
 *   POST /pin       — exchange employeeCode + PIN for a token (badge reader fallback)
 *   POST /refresh   — bump idle timer (does NOT bump last-reauth)
 *   POST /reauth    — full re-scan; bumps last-reauth so high-risk actions pass
 *   POST /revoke    — explicit logout (operator OR admin)
 *   GET  /sessions  — admin: list active sessions
 *   GET  /me        — return the session backing the supplied token (debug / "who am I")
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  HIGH_RISK_REAUTH_MAX_AGE_SECONDS,
  OperatorAuthError,
  decodeOperatorToken,
  hasFreshReauth,
  issueSessionForBadge,
  issueSessionForPin,
  listActiveSessions,
  reauthSession,
  revokeSession,
  validateAndTouchSession,
} from '../services/operatorAuthService';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

const ctxSchema = z.object({
  workstationId: z.string().trim().max(120).optional().nullable(),
  deviceFingerprint: z.string().trim().max(255).optional().nullable(),
});

function clientIp(req: any): string | null {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim();
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

function asAuthError(err: unknown, fallbackStatus = 500) {
  if (err instanceof OperatorAuthError) {
    const status =
      err.code === 'BAD_BADGE' || err.code === 'BAD_PIN' || err.code === 'EMPLOYEE_INACTIVE'
        ? 401
        : err.code === 'EMPLOYEE_NO_PIN' || err.code === 'EMPLOYEE_NO_BADGE'
          ? 422
          : err.code === 'TOKEN_MALFORMED' || err.code === 'TOKEN_BAD_SIGNATURE'
            ? 400
            : err.code === 'SESSION_NOT_FOUND'
              ? 404
              : err.code === 'SESSION_REVOKED' || err.code === 'SESSION_EXPIRED' || err.code === 'SESSION_IDLE'
                ? 401
                : 400;
    return { status, body: { error: err.code, message: err.message } };
  }
  return {
    status: fallbackStatus,
    body: { error: 'INTERNAL', message: (err as Error)?.message ?? 'Unknown error' },
  };
}

function serializeSession(s: any) {
  // Never expose the token here; only metadata.
  return {
    id: s.id,
    employeeId: s.employeeId,
    employeeDisplayName: s.employeeDisplayName,
    authMethod: s.authMethod,
    workstationId: s.workstationId,
    deviceFingerprint: s.deviceFingerprint,
    ipAddress: s.ipAddress,
    issuedAt: s.issuedAt,
    lastActivityAt: s.lastActivityAt,
    lastReauthAt: s.lastReauthAt,
    expiresAt: s.expiresAt,
    idleTimeoutSeconds: s.idleTimeoutSeconds,
    revokedAt: s.revokedAt,
    revokedBy: s.revokedBy,
    revokeReason: s.revokeReason,
    hasFreshReauth: hasFreshReauth(s),
  };
}

// ---------------------------------------------------------------------------
// POST /badge — issue session from badge scan
// ---------------------------------------------------------------------------
const badgeSchema = ctxSchema.extend({
  badgeCode: z.string().trim().min(1, 'badgeCode is required'),
});
router.post('/badge', async (req, res) => {
  const parsed = badgeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }
  try {
    const issued = await issueSessionForBadge(parsed.data.badgeCode, {
      workstationId: parsed.data.workstationId ?? null,
      deviceFingerprint: parsed.data.deviceFingerprint ?? null,
      ipAddress: clientIp(req),
    });
    return res.status(201).json({
      token: issued.token,
      session: serializeSession(issued.session),
      employee: issued.employee,
    });
  } catch (err) {
    const { status, body } = asAuthError(err);
    return res.status(status).json(body);
  }
});

// ---------------------------------------------------------------------------
// POST /pin — fallback when the badge reader is unavailable
// ---------------------------------------------------------------------------
const pinSchema = ctxSchema.extend({
  employeeCode: z.string().trim().min(1, 'employeeCode is required'),
  pin: z.string().min(1, 'pin is required'),
});
router.post('/pin', async (req, res) => {
  const parsed = pinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }
  try {
    const issued = await issueSessionForPin(parsed.data.employeeCode, parsed.data.pin, {
      workstationId: parsed.data.workstationId ?? null,
      deviceFingerprint: parsed.data.deviceFingerprint ?? null,
      ipAddress: clientIp(req),
    });
    return res.status(201).json({
      token: issued.token,
      session: serializeSession(issued.session),
      employee: issued.employee,
    });
  } catch (err) {
    const { status, body } = asAuthError(err);
    return res.status(status).json(body);
  }
});

// ---------------------------------------------------------------------------
// POST /refresh — keep the idle timer alive
// ---------------------------------------------------------------------------
const tokenBody = z.object({ token: z.string().min(1, 'token is required') });
router.post('/refresh', async (req, res) => {
  const parsed = tokenBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }
  try {
    const { session } = await validateAndTouchSession(parsed.data.token);
    return res.json({ session: serializeSession(session) });
  } catch (err) {
    const { status, body } = asAuthError(err);
    return res.status(status).json(body);
  }
});

// ---------------------------------------------------------------------------
// POST /reauth — fresh badge re-scan; bumps lastReauthAt for high-risk.
// REQUIRES a credential (badge or PIN) that resolves to the SAME employee
// on the session — token-only reauth is intentionally disallowed so a
// stolen token cannot satisfy high-risk re-auth without physical badge
// presentation or PIN entry.
// ---------------------------------------------------------------------------
const reauthSchema = z.union([
  z.object({
    token: z.string().min(1),
    badgeCode: z.string().trim().min(1),
  }),
  z.object({
    token: z.string().min(1),
    employeeCode: z.string().trim().min(1),
    pin: z.string().min(1),
  }),
]);
router.post('/reauth', async (req, res) => {
  const parsed = reauthSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }
  try {
    const credential =
      'badgeCode' in parsed.data
        ? { badgeCode: parsed.data.badgeCode }
        : { employeeCode: parsed.data.employeeCode, pin: parsed.data.pin };
    const { session } = await reauthSession(parsed.data.token, credential);
    return res.json({
      session: serializeSession(session),
      reauthMaxAgeSeconds: HIGH_RISK_REAUTH_MAX_AGE_SECONDS,
    });
  } catch (err) {
    const { status, body } = asAuthError(err);
    return res.status(status).json(body);
  }
});

// ---------------------------------------------------------------------------
// POST /revoke — explicit logout. Operators may revoke their own session
//   by presenting the token; admins may revoke any sessionId.
// ---------------------------------------------------------------------------
const revokeSchema = z.union([
  z.object({ token: z.string().min(1), reason: z.string().max(255).optional() }),
  z.object({ sessionId: z.string().uuid(), reason: z.string().max(255).optional() }),
]);
router.post('/revoke', async (req, res) => {
  const parsed = revokeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION', details: parsed.error.flatten() });
  }

  let sessionId: string;
  let actor = 'operator';

  if ('token' in parsed.data) {
    try {
      const decoded = decodeOperatorToken(parsed.data.token);
      sessionId = decoded.sessionId;
    } catch (err) {
      const { status, body } = asAuthError(err);
      return res.status(status).json(body);
    }
  } else {
    // Admin revoke-by-id requires an authenticated web user with ADMIN/OWNER.
    return authenticateToken(req as any, res as any, async () => {
      const role = (req as any).user?.role;
      if (role !== 'ADMIN' && role !== 'OWNER') {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin role required.' });
      }
      const adminActor = (req as any).user?.username || `user#${(req as any).user?.id}`;
      const row = await revokeSession(parsed.data.sessionId, adminActor, parsed.data.reason);
      if (!row) return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
      return res.json({ session: serializeSession(row) });
    });
  }

  const row = await revokeSession(sessionId, actor, parsed.data.reason);
  if (!row) return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
  return res.json({ session: serializeSession(row) });
});

// ---------------------------------------------------------------------------
// GET /me — return the session for a presented token (debug / UI bootstrap)
// ---------------------------------------------------------------------------
router.get('/me', async (req, res) => {
  const token =
    (req.headers['x-operator-token'] as string | undefined) ||
    (typeof req.query.token === 'string' ? req.query.token : undefined);
  if (!token) return res.status(400).json({ error: 'TOKEN_REQUIRED' });
  try {
    const { session } = await validateAndTouchSession(token, { touch: false });
    return res.json({ session: serializeSession(session) });
  } catch (err) {
    const { status, body } = asAuthError(err);
    return res.status(status).json(body);
  }
});

// ---------------------------------------------------------------------------
// GET /sessions — admin: list all active sessions (read-only)
// ---------------------------------------------------------------------------
router.get('/sessions', authenticateToken, async (req, res) => {
  const role = (req as any).user?.role;
  if (role !== 'ADMIN' && role !== 'OWNER') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin role required.' });
  }
  const rows = await listActiveSessions();
  return res.json({ sessions: rows.map(serializeSession) });
});

export default router;
