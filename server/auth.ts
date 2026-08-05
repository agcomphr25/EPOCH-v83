import { createHash, randomBytes } from 'crypto';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { eq, and, lt, gt, sql } from 'drizzle-orm';

import { db } from './db';
import { users, userSessions, employeeAuditLog, auditEvents } from './schema';

const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes
const SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours
const configuredIdleTimeoutMinutes = parseInt(
  process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? '30',
  10,
);
const SESSION_IDLE_TIMEOUT_MINUTES =
  Number.isFinite(configuredIdleTimeoutMinutes) && configuredIdleTimeoutMinutes > 0
    ? configuredIdleTimeoutMinutes
    : 30;

function buildDeviceFingerprint(ipAddress: string | null, userAgent: string | null): string {
  return createHash('sha256').update(`${ipAddress ?? 'unknown'}|${userAgent ?? 'unknown'}`).digest('hex');
}

// SECURITY: JWT_SECRET must be set in production - fail fast if missing
// Also checks PORTAL_JWT_SECRET as fallback for Replit deployment compatibility
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.PORTAL_JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!secret && isProduction) {
    throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET or PORTAL_JWT_SECRET environment variable must be set in production');
  }
  
  if (!secret) {
    console.warn('⚠️ WARNING: JWT_SECRET not set - using development fallback (NOT SAFE FOR PRODUCTION)');
    return 'development-only-secret-not-for-production';
  }
  
  if (process.env.PORTAL_JWT_SECRET && !process.env.JWT_SECRET) {
    console.log('✅ Using PORTAL_JWT_SECRET for authentication');
  }
  
  if (secret.length < 32) {
    console.warn('⚠️ WARNING: JWT secret should be at least 32 characters for security');
  }
  
  return secret;
}

const JWT_SECRET = getJwtSecret();

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  employeeId: number | null;
  canOverridePrices: boolean;
  isActive: boolean;
}

export interface SessionData {
  userId: number;
  sessionToken: string;
  userType: string;
  employeeId: number | null;
  expiresAt: Date;
}

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  static async verifyPassword(
    password: string,
    hash: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateSessionToken(): string {
    return randomBytes(32).toString('hex');
  }

  static generateJWT(
    userId: number,
    role: string,
    employeeId: number | null = null
  ): string {
    const payload = {
      userId,
      role,
      employeeId,
      type: 'access',
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
  }

  static verifyJWT(
    token: string
  ): { userId: number; role: string; employeeId: number | null } | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      return {
        userId: decoded.userId,
        role: decoded.role,
        employeeId: decoded.employeeId || null,
      };
    } catch (error) {
      return null;
    }
  }

  static async createSession(
    userId: number,
    userType: string,
    employeeId: number | null,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<string> {
    const sessionToken = this.generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TIMEOUT);
    const deviceFingerprint = buildDeviceFingerprint(ipAddress, userAgent);
    const [sessionUser] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, userId));

    await db.insert(userSessions).values({
      userId,
      username: sessionUser?.username ?? `user-${userId}`,
      sessionToken,
      employeeId,
      userType,
      expiresAt,
      ipAddress,
      userAgent,
      deviceFingerprint,
      isActive: true,
    });

    return sessionToken;
  }

  static async validateSession(
    sessionToken: string
  ): Promise<SessionData | null> {
    const [session] = await db
      .select({
        id: userSessions.id,
        sessionToken: userSessions.sessionToken,
        userId: userSessions.userId,
        expiresAt: userSessions.expiresAt,
        idleExpired: sql<boolean>`COALESCE(${userSessions.lastActivityAt}, ${userSessions.createdAt}, NOW()) < NOW() - (${SESSION_IDLE_TIMEOUT_MINUTES} * INTERVAL '1 minute')`,
      })
      .from(userSessions)
      .where(
        and(
          eq(userSessions.sessionToken, sessionToken),
          eq(userSessions.isActive, true),
          sql`${userSessions.expiresAt} > NOW()`
        )
      );

    if (!session) {
      return null;
    }

    if (session.idleExpired) {
      await db
        .update(userSessions)
        .set({ isActive: false })
        .where(eq(userSessions.id, session.id));
      return null;
    }

    // Extend session if still valid
    const newExpiresAt = new Date(Date.now() + SESSION_TIMEOUT);
    await db
      .update(userSessions)
      .set({ expiresAt: newExpiresAt, lastActivityAt: new Date() })
      .where(eq(userSessions.id, session.id));

    // Emit SESSION_EXTENDED audit event (best-effort; never block validation on failure)
    try {
      const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, session.userId));
      await db.insert(auditEvents).values({
        entityType: 'user_session',
        entityId: String(session.id),
        action: 'SESSION_EXTENDED',
        actorId: null,
        actorName: session.username,
        actorRole: u?.role ?? 'EMPLOYEE',
        reason: 'Session extended on active use',
        meta: { userId: session.userId, newExpiresAt: newExpiresAt.toISOString() },
      });
    } catch (auditErr) {
      console.error('[SessionAudit] Failed to emit SESSION_EXTENDED for session', session.id, auditErr);
    }

    return {
      userId: session.userId,
      sessionToken: session.sessionToken,
      userType: (session as any).userType,
      employeeId: (session as any).employeeId,
      expiresAt: newExpiresAt,
    };
  }

  static async invalidateSession(sessionToken: string): Promise<void> {
    await db
      .update(userSessions)
      .set({ isActive: false })
      .where(eq(userSessions.sessionToken, sessionToken));
  }

  static async invalidateAllUserSessions(userId: number): Promise<void> {
    await db
      .update(userSessions)
      .set({ isActive: false })
      .where(eq(userSessions.userId, userId));
  }

  /**
   * Clean up expired sessions from the database.
   * Emits SESSION_EXPIRED audit events for each session before removing it.
   */
  static async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();

    // Fetch expiring sessions before deletion so we can audit them
    const expiringSessions = await db
      .select({
        id: userSessions.id,
        userId: userSessions.userId,
        username: userSessions.username,
        expiresAt: userSessions.expiresAt,
      })
      .from(userSessions)
      .where(sql`${userSessions.expiresAt} < ${now} AND ${userSessions.isActive} = true`);

    // Emit SESSION_EXPIRED audit event for each expired session
    if (expiringSessions.length > 0) {
      // Look up roles for each user in one query to avoid N+1
      const userIds = [...new Set(expiringSessions.map(s => s.userId))];
      const roleMap: Record<number, string> = {};
      for (const uid of userIds) {
        const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, uid));
        if (u) roleMap[uid] = u.role;
      }

      for (const session of expiringSessions) {
        try {
          await db.insert(auditEvents).values({
            entityType: 'user_session',
            entityId: String(session.id),
            action: 'SESSION_EXPIRED',
            actorId: null,
            actorName: session.username,
            actorRole: roleMap[session.userId] ?? 'EMPLOYEE',
            reason: 'Session reached its expiry timestamp',
            meta: { userId: session.userId, expiresAt: session.expiresAt },
          });
        } catch (auditErr) {
          console.error('[SessionAudit] Failed to emit SESSION_EXPIRED for session', session.id, auditErr);
        }
      }
    }

    await db
      .delete(userSessions)
      .where(sql`${userSessions.expiresAt} < ${now}`);

    if (expiringSessions.length > 0) {
      console.log(`🧹 Cleaned up ${expiringSessions.length} expired sessions (SESSION_EXPIRED events emitted)`);
    } else {
      console.log(`🧹 Cleaned up expired sessions (none found)`);
    }
  }

  static async authenticate(
    username: string,
    password: string,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<{ user: AuthUser; sessionToken: string } | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));

    if (!user) {
      return null;
    }

    // Check if account is locked
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      throw new Error(
        'Account is temporarily locked due to too many failed login attempts'
      );
    }

    // Check if account is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(
      password,
      user.passwordHash
    );

    if (!isValidPassword) {
      // Increment failed login attempts
      const failedAttempts = (user.failedLoginAttempts || 0) + 1;
      const lockUntil =
        failedAttempts >= MAX_LOGIN_ATTEMPTS
          ? new Date(Date.now() + LOCK_TIME)
          : null;

      await db
        .update(users)
        .set({
          failedLoginAttempts: failedAttempts,
          lockedUntil: lockUntil,
        })
        .where(eq(users.id, user.id));

      if (lockUntil) {
        throw new Error(
          `Account locked for ${LOCK_TIME / 60000} minutes due to too many failed login attempts`
        );
      }

      return null;
    }

    // Reset failed login attempts on successful login
    await db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Create session
    const sessionToken = await this.createSession(
      user.id,
      user.role,
      user.employeeId,
      ipAddress,
      userAgent
    );

    // Log successful login
    if (user.employeeId) {
      await db.insert(employeeAuditLog).values({
        employeeId: user.employeeId,
        action: 'LOGIN',
        details: { loginMethod: 'password' },
        ipAddress,
        userAgent,
      });
    }

    // Generate JWT token
    const jwtToken = this.generateJWT(user.id, user.role, user.employeeId);

    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employeeId: user.employeeId,
        canOverridePrices: user.canOverridePrices,
        isActive: user.isActive,
      },
      sessionToken,
      token: jwtToken, // Add JWT token to response
    };
  }

  static async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user) {
      return false;
    }

    const isValidCurrentPassword = await this.verifyPassword(
      currentPassword,
      user.passwordHash
    );
    if (!isValidCurrentPassword) {
      return false;
    }

    const newPasswordHash = await this.hashPassword(newPassword);
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Invalidate all existing sessions for security
    await this.invalidateAllUserSessions(userId);

    return true;
  }

  static async getUserById(userId: number): Promise<AuthUser | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user || !user.isActive) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
      canOverridePrices: user.canOverridePrices,
      isActive: user.isActive,
    };
  }

  static async getUserBySession(
    sessionToken: string
  ): Promise<AuthUser | null> {
    const session = await this.validateSession(sessionToken);
    if (!session) {
      return null;
    }

    return this.getUserById(session.userId);
  }

  static async validatePortalToken(
    portalToken: string
  ): Promise<{ employeeId: number; isValid: boolean; reason?: string }> {
    const { storage } = await import('./storage');
    return storage.validatePortalToken(portalToken);
  }
}

// Middleware for authentication
export const requireAuth = (allowedRoles?: string[]) => {
  return async (req: any, res: any, next: any) => {
    const sessionToken =
      req.headers.authorization?.replace('Bearer ', '') ||
      req.cookies?.sessionToken;

    if (!sessionToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const user = await AuthService.getUserBySession(sessionToken);
      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      if (allowedRoles && !allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(401).json({ error: 'Authentication failed' });
    }
  };
};

// Middleware for portal access
export const requirePortalAccess = async (req: any, res: any, next: any) => {
  const { portalId } = req.params;

  if (!portalId) {
    return res.status(400).json({ error: 'Portal ID required' });
  }

  try {
    const validation = await AuthService.validatePortalToken(portalId);
    if (!validation.isValid) {
      return res.status(403).json({ error: 'Invalid or expired portal link' });
    }

    req.portalEmployeeId = validation.employeeId;
    next();
  } catch (error) {
    console.error('Portal access error:', error);
    return res.status(403).json({ error: 'Portal access denied' });
  }
};
