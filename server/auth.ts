import bcrypt from 'bcryptjs';
import { db } from './storage';
import { users, sessions } from './schema';
import { eq, and, gt } from 'drizzle-orm';
import crypto from 'crypto';

const SESSION_EXPIRY_DAYS = 7;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

export class AuthService {
  static async login(username: string, password: string) {
    try {
      const user = await db.select().from(users).where(eq(users.username, username)).limit(1);
      
      if (!user || user.length === 0) {
        return { success: false, error: 'Invalid username or password' };
      }

      const userData = user[0];

      if (!userData.isActive) {
        return { success: false, error: 'Account is inactive' };
      }

      if (userData.accountLockedUntil && new Date() < userData.accountLockedUntil) {
        return { success: false, error: 'Account is locked. Please try again later.' };
      }

      const passwordToCheck = userData.passwordHash || userData.password;
      const isValid = await bcrypt.compare(password, passwordToCheck);

      if (!isValid) {
        const attempts = (userData.failedLoginAttempts || 0) + 1;
        const updates: any = { failedLoginAttempts: attempts };

        if (attempts >= MAX_FAILED_ATTEMPTS) {
          const lockUntil = new Date();
          lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);
          updates.accountLockedUntil = lockUntil;
        }

        await db.update(users).set(updates).where(eq(users.id, userData.id));

        return { success: false, error: 'Invalid username or password' };
      }

      await db.update(users).set({
        failedLoginAttempts: 0,
        accountLockedUntil: null,
        lastLoginAt: new Date(),
      }).where(eq(users.id, userData.id));

      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

      await db.insert(sessions).values({
        userId: userData.id,
        sessionToken,
        expiresAt,
      });

      return {
        success: true,
        user: {
          id: userData.id,
          username: userData.username,
          role: userData.role,
          employeeId: userData.employeeId,
          canOverridePrices: userData.canOverridePrices,
          isActive: userData.isActive,
        },
        sessionToken,
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  }

  static async logout(sessionToken: string) {
    try {
      await db.delete(sessions).where(eq(sessions.sessionToken, sessionToken));
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, error: 'Logout failed' };
    }
  }

  static async validateSession(sessionToken: string) {
    try {
      const session = await db
        .select({
          session: sessions,
          user: users,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(
          and(
            eq(sessions.sessionToken, sessionToken),
            gt(sessions.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!session || session.length === 0) {
        return null;
      }

      const { user } = session[0];

      if (!user.isActive) {
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
    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }

  static async getUserById(userId: number) {
    try {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      if (!user || user.length === 0 || !user[0].isActive) {
        return null;
      }

      const userData = user[0];
      return {
        id: userData.id,
        username: userData.username,
        role: userData.role,
        employeeId: userData.employeeId,
        canOverridePrices: userData.canOverridePrices,
        isActive: userData.isActive,
      };
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  static async getUserBySession(sessionToken: string) {
    return this.validateSession(sessionToken);
  }

  static verifyJWT(token: string) {
    console.warn('JWT verification not implemented - using session-based auth');
    return null;
  }

  static async validatePortalToken(token: string) {
    console.warn('Portal token validation not implemented');
    return { isValid: false, employeeId: null };
  }

  static async cleanupExpiredSessions() {
    try {
      await db.delete(sessions).where(gt(new Date(), sessions.expiresAt));
      console.log('Expired sessions cleaned up');
    } catch (error) {
      console.error('Session cleanup error:', error);
    }
  }
}
