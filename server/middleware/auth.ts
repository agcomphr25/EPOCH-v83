import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../auth';

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
 * Authentication middleware to verify session tokens
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    const cookieToken = req.cookies?.sessionToken;

    const sessionToken = token || cookieToken;

    if (!sessionToken) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const user = await AuthService.getUserBySession(sessionToken);
    if (!user) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Attach user data to request
    req.user = user;
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

    const validation = await AuthService.validatePortalToken(token);
    if (!validation.isValid) {
      return res.status(403).json({ error: 'Invalid or expired portal token' });
    }

    // Attach employee data to request for portal access
    req.portalEmployeeId = validation.employeeId;
    next();
  } catch (error) {
    console.error('Portal authentication error:', error);
    return res.status(500).json({ error: 'Portal authentication failed' });
  }
}

/**
 * Cleanup expired sessions middleware (run periodically)
 */
export async function cleanupExpiredSessions() {
  try {
    // This would be implemented in the AuthService or storage layer
    console.log('Session cleanup would run here');
  } catch (error) {
    console.error('Session cleanup error:', error);
  }
}

// Schedule session cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);