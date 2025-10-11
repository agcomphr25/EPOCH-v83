import { Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import { HARDCODED_USERS } from '../hardcoded-users';

// Extend Express Request type to include user session data
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        role: string;
        employeeId: number | null;
        canOverridePrices: boolean;
        isActive: boolean;
      };
      portalEmployeeId?: number;
    }
  }
}

/**
 * Check if we're running in deployment environment
 */
function isDeploymentEnvironment(req: Request): boolean {
  // Prioritize NODE_ENV for development - always bypass auth in development
  if (process.env.NODE_ENV === 'development') {
    return false;
  }
  
  const host = req.get('host') || '';
  
  // Check for production deployment domains
  return host.includes('.replit.app') || 
         host.includes('.repl.co') || 
         process.env.NODE_ENV === 'production';
}

/**
 * Authentication middleware to verify session tokens (deployment-aware)
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  try {
    // Skip authentication in development environment
    if (!isDeploymentEnvironment(req)) {
      // In development, create a mock user for testing
      req.user = {
        id: 999,
        username: 'dev-user',
        role: 'ADMIN',
        employeeId: null,
        canOverridePrices: true,
        isActive: true
      };
      return next();
    }

    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    const cookieToken = req.cookies?.sessionToken;

    const token = cookieToken || bearerToken;

    if (!token) {
      return res.status(401).json({ error: 'No session token' });
    }

    // Get session from database
    const sessionResult = await pool.query(
      `SELECT us.user_id, us.username, us.last_activity_at, u.role, u.employee_id, u.can_override_prices, u.is_active
       FROM user_sessions us
       LEFT JOIN users u ON us.user_id = u.id
       WHERE us.session_token = $1 AND us.is_active = true`,
      [token]
    );

    if (!sessionResult || sessionResult.length === 0) {
      return res.status(403).json({ error: 'Invalid or expired session' });
    }

    const session = sessionResult[0];
    
    // Get user data from session
    let userRole = session.role;
    let isActive = session.is_active;
    let employeeId = session.employee_id;
    let canOverridePrices = session.can_override_prices || false;

    // If no role found in database, check if it's a hardcoded user
    if (!userRole) {
      const hardcodedUser = HARDCODED_USERS.get(session.username.toLowerCase());
      if (hardcodedUser) {
        userRole = hardcodedUser.role;
        isActive = true; // Hardcoded users are always active
        employeeId = null;
        canOverridePrices = false;
      } else {
        // Unknown user - reject
        await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [token]);
        return res.status(403).json({ error: 'Invalid session - user not found' });
      }
    }

    // Check if user is active
    if (!isActive) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    // Calculate idle timeout based on role
    // ADMIN and OWNER: 30 minutes, EMPLOYEE: 15 minutes
    const timeoutMinutes = (userRole === 'ADMIN' || userRole === 'OWNER') ? 30 : 15;
    const timeoutMs = timeoutMinutes * 60 * 1000;
    
    // Handle NULL last_activity_at (legacy sessions) by treating as current time
    const lastActivity = session.last_activity_at ? new Date(session.last_activity_at).getTime() : Date.now();
    const now = Date.now();

    // Check if session has been idle too long
    if (now - lastActivity > timeoutMs) {
      // Session expired due to inactivity
      await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [token]);
      return res.status(401).json({ error: 'Session expired due to inactivity' });
    }

    // Update last activity timestamp
    await pool.query(
      'UPDATE user_sessions SET last_activity_at = NOW() WHERE session_token = $1',
      [token]
    );

    // Attach user data to request
    req.user = {
      id: session.user_id,
      username: session.username,
      role: userRole,
      employeeId: employeeId,
      canOverridePrices: canOverridePrices,
      isActive: isActive
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Authorization middleware to check user roles
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Employee-specific access middleware
 * Ensures users can only access their own data or admins can access any data
 */
export function requireEmployeeAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const targetEmployeeId = parseInt(req.params.employeeId || req.params.id);
  
  // Admins and HR can access any employee data
  if (req.user.role === 'ADMIN' || req.user.role === 'HR') {
    return next();
  }

  // Employees can only access their own data
  if (req.user.employeeId === targetEmployeeId) {
    return next();
  }

  return res.status(403).json({ error: 'Access denied' });
}

/**
 * Employee portal token authentication (for public portal access)
 */
export async function authenticatePortalToken(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.params.portalId || req.params.token;
    
    if (!token) {
      return res.status(401).json({ error: 'Portal token required' });
    }

    // Query for portal token in database
    const result = await pool.query(
      `SELECT employee_id, expires_at FROM employee_portal_tokens 
       WHERE token = $1 AND is_active = true`,
      [token]
    );

    if (!result || result.length === 0) {
      return res.status(403).json({ error: 'Invalid or expired portal token' });
    }

    const portalToken = result[0];

    // Check if token is expired
    if (new Date(portalToken.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Invalid or expired portal token' });
    }

    // Attach employee data to request for portal access
    req.portalEmployeeId = portalToken.employee_id;
    next();
  } catch (error) {
    console.error('Portal authentication error:', error);
    return res.status(500).json({ error: 'Portal authentication failed' });
  }
}

/**
 * Re-authentication middleware for sensitive actions
 * Requires recent authentication (within 15 minutes) for critical operations
 */
export function requireRecentAuth(maxAge: number = 15 * 60 * 1000) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // For now, we'll skip re-auth checks in development
    // In production, you'd check lastAuthenticationAt timestamp
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    // In production, implement re-authentication check:
    // const lastAuth = await AuthService.getLastAuthenticationTime(req.user.id);
    // if (Date.now() - lastAuth > maxAge) {
    //   return res.status(401).json({ 
    //     error: 'Recent authentication required',
    //     requireReauth: true 
    //   });
    // }

    next();
  };
}

/**
 * Cleanup expired sessions middleware (run periodically)
 */
export async function cleanupExpiredSessions() {
  try {
    // Delete sessions that have been idle for longer than their role-based timeout
    // We'll use a conservative approach and delete sessions older than 30 minutes (max timeout)
    await pool.query(
      `DELETE FROM user_sessions 
       WHERE last_activity_at < NOW() - INTERVAL '30 minutes'`
    );
    console.log('Session cleanup completed');
  } catch (error) {
    console.error('Session cleanup error:', error);
  }
}

// Schedule session cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);