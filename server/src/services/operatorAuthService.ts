/**
 * OperatorAuthService — Phase 2 of Task #143.
 *
 * Issues, validates, refreshes, and revokes short-lived operator sessions
 * that prove WHO is physically scanning material at a shop-floor
 * workstation. The session token returned here is intentionally distinct
 * from the web JWT/cookie session: shared shop-floor tablets are typically
 * logged in once per shift to a generic web session, but every individual
 * material draw must be tied to the operator who actually scanned the
 * material.
 *
 * Token format (opaque to callers):
 *   base64url(`${sessionId}.${expiresAtMs}`).${hex(HMAC-SHA256)}
 * where the HMAC is computed over the body using `OPERATOR_TOKEN_SECRET`
 * (falls back to `PORTAL_TOKEN_SECRET` if not set, mirroring the existing
 * portal token convention). The DB row is the source of truth for revoke /
 * idle / absolute timeout — the HMAC is just a tamper-evident envelope so
 * we can short-circuit obviously-forged tokens without a DB hit.
 */

import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../../db';
import {
  employees,
  operatorAuthSessions,
  type OperatorAuthSession,
  type Employee,
} from '../../schema';

export type OperatorAuthMethod = 'BADGE' | 'PIN' | 'SSO';

/** 15 minutes idle. Configurable via env. */
export const DEFAULT_IDLE_TIMEOUT_SECONDS = Number(
  process.env.OPERATOR_AUTH_IDLE_TIMEOUT_SECONDS ?? 15 * 60,
);

/** 8 hours absolute. Configurable via env. */
export const DEFAULT_ABSOLUTE_TIMEOUT_SECONDS = Number(
  process.env.OPERATOR_AUTH_ABSOLUTE_TIMEOUT_SECONDS ?? 8 * 60 * 60,
);

/** Re-auth window for high-risk actions: must have re-authenticated within this many seconds. */
export const HIGH_RISK_REAUTH_MAX_AGE_SECONDS = Number(
  process.env.OPERATOR_AUTH_HIGH_RISK_REAUTH_SECONDS ?? 60,
);

/** Scrap dollar threshold above which scrap requires fresh re-auth. */
export const HIGH_RISK_SCRAP_USD_THRESHOLD = Number(
  process.env.OPERATOR_AUTH_HIGH_RISK_SCRAP_USD ?? 100,
);

const TOKEN_SECRET =
  process.env.OPERATOR_TOKEN_SECRET ||
  process.env.PORTAL_TOKEN_SECRET ||
  'dev-only-operator-auth-secret-do-not-use-in-prod';

export interface OperatorAuthContext {
  workstationId?: string | null;
  deviceFingerprint?: string | null;
  ipAddress?: string | null;
}

export type OperatorAuthErrorCode =
  | 'BAD_BADGE'
  | 'BAD_PIN'
  | 'EMPLOYEE_INACTIVE'
  | 'EMPLOYEE_NO_PIN'
  | 'EMPLOYEE_NO_BADGE'
  | 'TOKEN_MALFORMED'
  | 'TOKEN_BAD_SIGNATURE'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_REVOKED'
  | 'SESSION_EXPIRED'
  | 'SESSION_IDLE'
  | 'STALE_REAUTH';

export class OperatorAuthError extends Error {
  code: OperatorAuthErrorCode;
  constructor(code: OperatorAuthErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'OperatorAuthError';
  }
}

export interface IssuedSession {
  token: string;
  session: OperatorAuthSession;
  employee: Pick<Employee, 'id' | 'name' | 'employeeCode' | 'userRole' | 'isActive'>;
}

// ---------------------------------------------------------------------------
// Token codec
// ---------------------------------------------------------------------------

function signBody(body: string): string {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('hex');
}

function encodeToken(sessionId: string, expiresAtMs: number): string {
  const body = `${sessionId}.${expiresAtMs}`;
  const bodyB64 = Buffer.from(body).toString('base64url');
  const sig = signBody(body);
  return `${bodyB64}.${sig}`;
}

interface DecodedToken {
  sessionId: string;
  expiresAtMs: number;
}

export function decodeOperatorToken(token: string): DecodedToken {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    throw new OperatorAuthError('TOKEN_MALFORMED', 'Operator session token is malformed.');
  }
  const lastDot = token.lastIndexOf('.');
  const bodyB64 = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  let body: string;
  try {
    body = Buffer.from(bodyB64, 'base64url').toString('utf8');
  } catch {
    throw new OperatorAuthError('TOKEN_MALFORMED', 'Operator session token is malformed.');
  }
  const expected = signBody(body);
  // Constant-time compare to avoid timing oracles.
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new OperatorAuthError('TOKEN_BAD_SIGNATURE', 'Operator session token signature is invalid.');
  }
  const [sessionId, expStr] = body.split('.');
  const expiresAtMs = Number(expStr);
  if (!sessionId || !Number.isFinite(expiresAtMs)) {
    throw new OperatorAuthError('TOKEN_MALFORMED', 'Operator session token is malformed.');
  }
  return { sessionId, expiresAtMs };
}

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

async function lookupEmployeeByBadge(rawBadge: string): Promise<Employee | null> {
  const trimmed = rawBadge.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/-/g, '');
  // Strategy A: badge_scan_code UUID (dashes stripped on both sides for tolerance).
  const [byBadge] = await db
    .select()
    .from(employees)
    .where(sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${normalized}`)
    .limit(1);
  if (byBadge) return byBadge;
  // Strategy B: case-insensitive employee_code match (manual entry fallback).
  const [byCode] = await db
    .select()
    .from(employees)
    .where(sql`LOWER(${employees.employeeCode}) = LOWER(${trimmed})`)
    .limit(1);
  return byCode ?? null;
}

async function lookupEmployeeByCode(employeeCode: string): Promise<Employee | null> {
  const trimmed = employeeCode.trim();
  if (!trimmed) return null;
  const [emp] = await db
    .select()
    .from(employees)
    .where(sql`LOWER(${employees.employeeCode}) = LOWER(${trimmed})`)
    .limit(1);
  return emp ?? null;
}

function displayNameFor(emp: Employee): string {
  const name = (emp.preferredName || emp.name || '').trim();
  if (name) return name;
  return emp.employeeCode || `employee#${emp.id}`;
}

async function createSession(
  emp: Employee,
  authMethod: OperatorAuthMethod,
  ctx: OperatorAuthContext,
): Promise<IssuedSession> {
  if (emp.isActive === false) {
    throw new OperatorAuthError('EMPLOYEE_INACTIVE', 'Employee is inactive.');
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_ABSOLUTE_TIMEOUT_SECONDS * 1000);
  const [row] = await db
    .insert(operatorAuthSessions)
    .values({
      employeeId: emp.id,
      employeeDisplayName: displayNameFor(emp),
      authMethod,
      workstationId: ctx.workstationId ?? null,
      deviceFingerprint: ctx.deviceFingerprint ?? null,
      ipAddress: ctx.ipAddress ?? null,
      issuedAt: now,
      lastActivityAt: now,
      lastReauthAt: now,
      expiresAt,
      idleTimeoutSeconds: DEFAULT_IDLE_TIMEOUT_SECONDS,
    })
    .returning();
  const token = encodeToken(row.id, expiresAt.getTime());
  return {
    token,
    session: row,
    employee: {
      id: emp.id,
      name: emp.name,
      employeeCode: emp.employeeCode,
      userRole: emp.userRole,
      isActive: emp.isActive,
    },
  };
}

export async function issueSessionForBadge(
  badgeCode: string,
  ctx: OperatorAuthContext = {},
): Promise<IssuedSession> {
  const emp = await lookupEmployeeByBadge(badgeCode);
  if (!emp) {
    throw new OperatorAuthError('BAD_BADGE', 'Badge not recognised.');
  }
  if (!emp.badgeScanCode && !emp.employeeCode) {
    throw new OperatorAuthError('EMPLOYEE_NO_BADGE', 'Employee has no badge code on file.');
  }
  return createSession(emp, 'BADGE', ctx);
}

export async function issueSessionForPin(
  employeeCode: string,
  pin: string,
  ctx: OperatorAuthContext = {},
): Promise<IssuedSession> {
  const emp = await lookupEmployeeByCode(employeeCode);
  if (!emp) {
    throw new OperatorAuthError('BAD_PIN', 'Employee not found or PIN invalid.');
  }
  if (!emp.timekeeperPin) {
    throw new OperatorAuthError('EMPLOYEE_NO_PIN', 'Employee has no PIN on file.');
  }
  const ok = await bcrypt.compare(pin, emp.timekeeperPin);
  if (!ok) {
    throw new OperatorAuthError('BAD_PIN', 'Employee not found or PIN invalid.');
  }
  return createSession(emp, 'PIN', ctx);
}

// ---------------------------------------------------------------------------
// Validate / refresh / revoke
// ---------------------------------------------------------------------------

export interface ValidatedSession {
  session: OperatorAuthSession;
}

/**
 * Validate a token end-to-end:
 *   - HMAC signature is intact.
 *   - DB row exists.
 *   - Not revoked.
 *   - Not past absolute expiry.
 *   - Not past idle timeout (now - lastActivityAt <= idleTimeoutSeconds).
 *
 * On success, bumps `lastActivityAt` so the idle timer keeps rolling.
 * Throws `OperatorAuthError` with a precise code on any failure so the
 * caller (route handler or material-issue gate) can surface a structured
 * error to the operator.
 */
export async function validateAndTouchSession(
  token: string,
  options: { touch?: boolean } = {},
): Promise<ValidatedSession> {
  const { sessionId } = decodeOperatorToken(token);
  const [row] = await db
    .select()
    .from(operatorAuthSessions)
    .where(eq(operatorAuthSessions.id, sessionId))
    .limit(1);
  if (!row) {
    throw new OperatorAuthError('SESSION_NOT_FOUND', 'Operator session not found.');
  }
  if (row.revokedAt) {
    throw new OperatorAuthError('SESSION_REVOKED', 'Operator session has been revoked.');
  }
  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    throw new OperatorAuthError('SESSION_EXPIRED', 'Operator session has reached its absolute timeout.');
  }
  const idleMs = now - row.lastActivityAt.getTime();
  if (idleMs > row.idleTimeoutSeconds * 1000) {
    throw new OperatorAuthError(
      'SESSION_IDLE',
      `Operator session expired after ${row.idleTimeoutSeconds}s of inactivity. Re-scan badge.`,
    );
  }
  if (options.touch !== false) {
    await db
      .update(operatorAuthSessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(operatorAuthSessions.id, sessionId));
  }
  return { session: row };
}

/**
 * Re-scan path: validates the token AND requires a fresh credential
 * (badge or PIN) that matches the SAME employee on the session. Without
 * the credential check, a high-risk reauth could be satisfied by anyone
 * who happened to hold an active token, which would let a bystander
 * authorize override / scrap / quarantine-release actions.
 *
 * On success bumps BOTH lastActivityAt and lastReauthAt so the next
 * high-risk action passes the freshness check. The token itself does
 * not change — the caller can keep using it.
 */
export async function reauthSession(
  token: string,
  credential:
    | { badgeCode: string }
    | { employeeCode: string; pin: string },
): Promise<ValidatedSession> {
  const validated = await validateAndTouchSession(token, { touch: false });

  // Resolve the employee implied by the supplied credential and require
  // it to match the session's employee. This blocks "stolen-token +
  // bystander-badge" because the bystander's badge will resolve to a
  // different employee and the check fails.
  let credentialEmployee: Employee | null = null;
  if ('badgeCode' in credential) {
    credentialEmployee = await lookupEmployeeByBadge(credential.badgeCode);
    if (!credentialEmployee) {
      throw new OperatorAuthError('BAD_BADGE', 'Badge not recognised.');
    }
  } else {
    credentialEmployee = await lookupEmployeeByCode(credential.employeeCode);
    if (!credentialEmployee || !credentialEmployee.timekeeperPin) {
      throw new OperatorAuthError('BAD_PIN', 'Employee not found or PIN invalid.');
    }
    const ok = await bcrypt.compare(credential.pin, credentialEmployee.timekeeperPin);
    if (!ok) {
      throw new OperatorAuthError('BAD_PIN', 'Employee not found or PIN invalid.');
    }
  }

  if (credentialEmployee.id !== validated.session.employeeId) {
    // Don't leak which employee the credential resolved to — surface as a
    // generic auth failure.
    throw new OperatorAuthError(
      'BAD_BADGE',
      'Re-auth credential does not match the operator on this session.',
    );
  }

  const now = new Date();
  const [row] = await db
    .update(operatorAuthSessions)
    .set({ lastActivityAt: now, lastReauthAt: now })
    .where(eq(operatorAuthSessions.id, validated.session.id))
    .returning();
  return { session: row };
}

export async function revokeSession(
  sessionId: string,
  revokedBy: string,
  reason?: string,
): Promise<OperatorAuthSession | null> {
  const [row] = await db
    .update(operatorAuthSessions)
    .set({
      revokedAt: new Date(),
      revokedBy,
      revokeReason: reason ?? null,
    })
    .where(and(eq(operatorAuthSessions.id, sessionId), isNull(operatorAuthSessions.revokedAt)))
    .returning();
  return row ?? null;
}

/**
 * High-risk gate: returns true iff the session was re-authenticated within
 * `maxAgeSeconds`. Used by `MaterialIssueService` for overrides, expired-lot
 * release, quarantine release, and scrap above the dollar threshold.
 */
export function hasFreshReauth(
  session: Pick<OperatorAuthSession, 'lastReauthAt'>,
  maxAgeSeconds: number = HIGH_RISK_REAUTH_MAX_AGE_SECONDS,
): boolean {
  const ageMs = Date.now() - new Date(session.lastReauthAt).getTime();
  return ageMs <= maxAgeSeconds * 1000;
}

// ---------------------------------------------------------------------------
// Listing (admin)
// ---------------------------------------------------------------------------

export async function listActiveSessions(): Promise<OperatorAuthSession[]> {
  const now = new Date();
  return db
    .select()
    .from(operatorAuthSessions)
    .where(
      and(
        isNull(operatorAuthSessions.revokedAt),
        gt(operatorAuthSessions.expiresAt, now),
      ),
    )
    .orderBy(desc(operatorAuthSessions.lastActivityAt));
}
