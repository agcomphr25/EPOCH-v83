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
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set!');
  console.error('Please set JWT_SECRET before starting the application.');
  process.exit(1);
}

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
    return jwt.sign(payload, JWT_SECRET!, { expiresIn: '2h' });
  }

  static verifyJWT(token: string): { userId: number; role: string; employeeId: number | null } | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET!) as any;
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

    return sessionToken;
  }

  static async validateSession(sessionToken: string): Promise<SessionData | null> {
    const [session] = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.sessionToken, sessionToken),
          eq(userSessions.isActive, true),
          gt(userSessions.expiresAt, new Date())
        )
      );
    
    if (!session) {
      return null;
    }

    // Extend session if still valid
    const newExpiresAt = new Date(Date.now() + SESSION_TIMEOUT);
    await db
      .update(userSessions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(userSessions.id, session.id));

    return {
      userId: session.userId,
      sessionToken: session.sessionToken,
      userType: session.userType,
      employeeId: session.employeeId,
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

  static async authenticate(username: string, password: string, ipAddress: string | null, userAgent: string | null): Promise<{ user: AuthUser; sessionToken: string; token: string } | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));

    if (!user) {
      return null;
    }

    // Check if account is locked
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      throw new Error('Account is temporarily locked due to too many failed login attempts');
    }

    // Check if account is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      // Increment failed login attempts
      const failedAttempts = (user.failedLoginAttempts || 0) + 1;
      const lockUntil = failedAttempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCK_TIME) : null;

      await db
        .update(users)
        .set({
          failedLoginAttempts: failedAttempts,
          lockedUntil: lockUntil,
        })
        .where(eq(users.id, user.id));

      if (lockUntil) {
        throw new Error(`Account locked for ${LOCK_TIME / 60000} minutes due to too many failed login attempts`);
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
        canOverridePrices: user.canOverridePrices ?? false,
        isActive: user.isActive,
      },
      sessionToken,
      token: jwtToken // Add JWT token to response
    };
  }

  static async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<boolean> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return false;
    }

    const isValidCurrentPassword = await this.verifyPassword(currentPassword, user.passwordHash);
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
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user || !user.isActive) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
      canOverridePrices: user.canOverridePrices ?? false,
      isActive: user.isActive,
    };
  }

  static async getUserBySession(sessionToken: string): Promise<AuthUser | null> {
    const session = await this.validateSession(sessionToken);
    if (!session) {
      return null;
    }

    return this.getUserById(session.userId);
  }

  static async createUser(userData: any): Promise<AuthUser> {
    const { username, password, role = 'EMPLOYEE', employeeId, isActive = true, canOverridePrices = false } = userData;
    
    // Check if username already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    
    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Insert new user
    const [newUser] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        role,
        employeeId: employeeId || null,
        isActive,
        canOverridePrices: canOverridePrices || false,
      })
      .returning();

    return {
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
      employeeId: newUser.employeeId,
      canOverridePrices: newUser.canOverridePrices ?? false,
      isActive: newUser.isActive ?? true,
    };
  }

  static async validatePortalToken(portalToken: string): Promise<{ employeeId: number; isValid: boolean }> {
    const { storage } = await import('./storage');
    return storage.validatePortalToken(portalToken);
  }

  static async verifyPortalToken(portalId: string): Promise<any> {
    // Portal verification logic - for now delegate to validatePortalToken
    const validation = await this.validatePortalToken(portalId);
    if (!validation.isValid) {
      return null;
    }
    
    // Return employee data if valid - you may want to expand this
    return { employeeId: validation.employeeId, isValid: validation.isValid };
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