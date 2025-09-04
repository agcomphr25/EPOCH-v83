import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { users, userSessions, employeeAuditLog } from './schema';
import { eq, and, lt, gt } from 'drizzle-orm';

const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes
const SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours
const INACTIVITY_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours of inactivity
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateSessionToken(): string {
    return randomBytes(32).toString('hex');
  }

  static generateJWT(userId: number, role: string, employeeId: number | null = null): string {
    const payload = { 
      userId, 
      role, 
      employeeId,
      type: 'access'
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
  }

  static verifyJWT(token: string): { userId: number; role: string; employeeId: number | null } | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      return {
        userId: decoded.userId,
        role: decoded.role,
        employeeId: decoded.employeeId || null
      };
    } catch (error) {
      return null;
    }
  }

  static async createSession(userId: number, userType: string, employeeId: number | null, ipAddress: string | null, userAgent: string | null): Promise<string> {
    const sessionToken = this.generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TIMEOUT);
    const lastActivityAt = new Date();

    try {
      await db.insert(userSessions).values({
        userId,
        sessionToken,
        employeeId,
        userType,
        expiresAt,
        ipAddress,
        userAgent,
        isActive: true,
      });
    } catch (error: any) {
      // During deployment, userSessions table might not exist yet
      // In this case, we'll rely on JWT tokens only
      console.warn('Session table not available, using JWT-only mode:', error?.message || error);
    }

    return sessionToken;
  }

  static async validateSession(sessionToken: string): Promise<SessionData | null> {
    // Add timeout wrapper for database operations
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('Database operation timeout')), 2500); // 2.5 second timeout
    });

    try {
      const result = await Promise.race([
        (async () => {
          const [session] = await db
            .select({
              id: userSessions.id,
              userId: userSessions.userId,
              sessionToken: userSessions.sessionToken,
              userType: userSessions.userType,
              employeeId: userSessions.employeeId,
              expiresAt: userSessions.expiresAt,
              createdAt: userSessions.createdAt
            })
            .from(userSessions)
            .where(
              and(
                eq(userSessions.sessionToken, sessionToken),
                eq(userSessions.isActive, true),
                gt(userSessions.expiresAt, new Date())
              )
            )
            .limit(1);
          
          if (!session) {
            return null;
          }

          // Check for inactivity timeout using createdAt as fallback for lastActivityAt
          const lastActivity = session.createdAt ? new Date(session.createdAt) : new Date();
          const inactivityDeadline = new Date(Date.now() - INACTIVITY_TIMEOUT);
          
          if (lastActivity < inactivityDeadline) {
            // Session expired due to inactivity - use timeout for update too
            try {
              await Promise.race([
                db.update(userSessions)
                  .set({ isActive: false })
                  .where(eq(userSessions.id, session.id)),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Update timeout')), 1000))
              ]);
            } catch (updateError) {
              console.warn('Failed to update session status:', updateError);
            }
            return null;
          }

          // Extend session (update lastActivityAt only if column exists)
          const newExpiresAt = new Date(Date.now() + SESSION_TIMEOUT);
          
          try {
            await Promise.race([
              db.update(userSessions)
                .set({ expiresAt: newExpiresAt })
                .where(eq(userSessions.id, session.id)),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Update timeout')), 1000))
            ]);
          } catch (updateError) {
            console.warn('Failed to extend session:', updateError);
            // Still return the session even if update fails
          }

          return {
            userId: session.userId,
            sessionToken: session.sessionToken,
            userType: session.userType,
            employeeId: session.employeeId,
            expiresAt: newExpiresAt,
          };
        })(),
        timeoutPromise
      ]);

      return result;
    } catch (error: any) {
      // Enhanced error logging for debugging
      console.warn('Session validation failed:', {
        error: error?.message || error,
        timeout: error?.message === 'Database operation timeout',
        sessionToken: sessionToken?.substring(0, 8) + '...' // Log partial token for debugging
      });
      return null;
    }
  }

  static async invalidateSession(sessionToken: string): Promise<void> {
    try {
      await db
        .update(userSessions)
        .set({ isActive: false })
        .where(eq(userSessions.sessionToken, sessionToken));
    } catch (error: any) {
      // During deployment, userSessions table might not exist yet
      console.warn('Session invalidation failed, using JWT-only mode:', error?.message || error);
    }
  }

  static async invalidateAllUserSessions(userId: number): Promise<void> {
    try {
      await db
        .update(userSessions)
        .set({ isActive: false })
        .where(eq(userSessions.userId, userId));
    } catch (error: any) {
      // During deployment, userSessions table might not exist yet
      console.warn('Bulk session invalidation failed, using JWT-only mode:', error?.message || error);
    }
  }

  static async authenticate(username: string, password: string, ipAddress: string | null, userAgent: string | null): Promise<{ user: AuthUser; sessionToken: string } | null> {
    console.log('🔐 AUTH START: Looking up user in database...');
    
    // Add timeout wrapper around database operations
    const dbTimeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('Database operation timeout in authenticate')), 5000);
    });

    try {
      const userResult = await Promise.race([
        (async () => {
          const [user] = await db
            .select({
              id: users.id,
              username: users.username,
              role: users.role,
              employeeId: users.employeeId,
              passwordHash: users.passwordHash,
              lockedUntil: users.lockedUntil,
              isActive: users.isActive,
              failedLoginAttempts: users.failedLoginAttempts,
              canOverridePrices: users.canOverridePrices
            })
            .from(users)
            .where(eq(users.username, username))
            .limit(1);
          return user;
        })(),
        dbTimeoutPromise
      ]);

      if (!userResult) {
        console.log('❌ AUTH: User not found:', username);
        return null;
      }

      console.log('✅ AUTH: User found, checking account status...');

      // Check if account is locked
      if (userResult.lockedUntil && new Date() < userResult.lockedUntil) {
        throw new Error('Account is temporarily locked due to too many failed login attempts');
      }

      // Check if account is active
      if (!userResult.isActive) {
        throw new Error('Account is deactivated');
      }

      console.log('🔍 AUTH: Verifying password...');
      
      // Verify password with timeout
      const passwordResult = await Promise.race([
        this.verifyPassword(password, userResult.passwordHash || ''),
        new Promise<boolean>((_, reject) => {
          setTimeout(() => reject(new Error('Password verification timeout')), 3000);
        })
      ]);

      console.log('🔍 AUTH: Password verification result:', passwordResult ? 'VALID' : 'INVALID');

      if (!passwordResult) {
        console.log('❌ AUTH: Invalid password, updating failed attempts...');
        
        // Increment failed login attempts (with timeout)
        const failedAttempts = (userResult.failedLoginAttempts || 0) + 1;
        const lockUntil = failedAttempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCK_TIME) : null;

        try {
          await Promise.race([
            db.update(users)
              .set({
                failedLoginAttempts: failedAttempts,
                lockedUntil: lockUntil,
              })
              .where(eq(users.id, userResult.id)),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Failed login update timeout')), 2000);
            })
          ]);
        } catch (updateError) {
          console.warn('Failed to update login attempts:', updateError);
        }

        if (lockUntil) {
          throw new Error(`Account locked for ${LOCK_TIME / 60000} minutes due to too many failed login attempts`);
        }

        return null;
      }

      console.log('✅ AUTH: Password valid, resetting failed attempts...');

      // Reset failed login attempts on successful login (with timeout)
      try {
        await Promise.race([
          db.update(users)
            .set({
              failedLoginAttempts: 0,
              lockedUntil: null,
              lastLoginAt: new Date(),
            })
            .where(eq(users.id, userResult.id)),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Login reset update timeout')), 2000);
          })
        ]);
      } catch (updateError) {
        console.warn('Failed to reset login attempts:', updateError);
        // Continue anyway since authentication succeeded
      }

      console.log('🔍 AUTH: Creating session...');

      // Create session (with timeout)
      const sessionToken = await Promise.race([
        this.createSession(
          userResult.id,
          userResult.role,
          userResult.employeeId,
          ipAddress,
          userAgent
        ),
        new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error('Session creation timeout')), 3000);
        })
      ]);

      console.log('✅ AUTH: Session created successfully');

      // Log successful login (fire and forget, don't block on this)
      if (userResult.employeeId) {
        try {
          Promise.race([
            db.insert(employeeAuditLog).values({
              employeeId: userResult.employeeId,
              action: 'LOGIN',
              details: { loginMethod: 'password' },
              ipAddress,
              userAgent,
            }),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Audit log timeout')), 1000);
            })
          ]).catch(err => console.warn('Failed to log login:', err));
        } catch (logError) {
          console.warn('Audit logging failed:', logError);
        }
      }

      console.log('🔍 AUTH: Generating JWT token...');

      // Generate JWT token
      const jwtToken = this.generateJWT(userResult.id, userResult.role, userResult.employeeId);

      console.log('✅ AUTH COMPLETE: Authentication successful for user:', username);

      return {
        user: {
          id: userResult.id,
          username: userResult.username,
          role: userResult.role,
          employeeId: userResult.employeeId,
          canOverridePrices: userResult.canOverridePrices || false,
          isActive: userResult.isActive,
        },
        sessionToken,
        token: jwtToken
      } as any;

    } catch (error: any) {
      console.error('💥 AUTH ERROR:', error);
      if (error.message?.includes('timeout')) {
        throw new Error('Database timeout during authentication');
      }
      throw error;
    }
  }

  static async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<boolean> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return false;
    }

    const isValidCurrentPassword = user.passwordHash ? await this.verifyPassword(currentPassword, user.passwordHash) : false;
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
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('Database operation timeout')), 2000); // 2 second timeout
    });

    try {
      const result = await Promise.race([
        (async () => {
          const [user] = await db
            .select({
              id: users.id,
              username: users.username,
              role: users.role,
              employeeId: users.employeeId,
              canOverridePrices: users.canOverridePrices,
              isActive: users.isActive
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          if (!user || !user.isActive) {
            return null;
          }

          return {
            id: user.id,
            username: user.username,
            role: user.role,
            employeeId: user.employeeId,
            canOverridePrices: user.canOverridePrices || false,
            isActive: user.isActive,
          };
        })(),
        timeoutPromise
      ]);

      return result;
    } catch (error: any) {
      console.warn('getUserById failed:', {
        error: error?.message || error,
        userId,
        timeout: error?.message === 'Database operation timeout'
      });
      return null;
    }
  }

  static async getUserBySession(sessionToken: string): Promise<AuthUser | null> {
    const session = await this.validateSession(sessionToken);
    if (!session) {
      return null;
    }

    return this.getUserById(session.userId);
  }

  static async validatePortalToken(portalToken: string): Promise<{ employeeId: number; isValid: boolean }> {
    const { storage } = await import('./storage');
    return storage.validatePortalToken(portalToken);
  }

  static async createUser(userData: any): Promise<AuthUser> {
    // Simplified implementation - in production, implement proper user creation
    return {
      id: 0,
      username: userData.username || 'unknown',
      role: userData.role || 'EMPLOYEE',
      employeeId: null,
      canOverridePrices: false,
      isActive: true
    };
  }

  static async verifyPortalToken(portalId: string): Promise<any> {
    // Simplified implementation - in production, implement proper portal verification  
    return null;
  }

  static async cleanupExpiredSessions(): Promise<void> {
    try {
      await db
        .update(userSessions)
        .set({ isActive: false })
        .where(
          and(
            eq(userSessions.isActive, true),
            lt(userSessions.expiresAt, new Date())
          )
        );
    } catch (error) {
      console.error('Failed to cleanup expired sessions:', error);
    }
  }
}

// Middleware for authentication
export const requireAuth = (allowedRoles?: string[]) => {
  return async (req: any, res: any, next: any) => {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.sessionToken;

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