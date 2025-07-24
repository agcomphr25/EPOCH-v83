import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

// Extend Express Request type to include user session data
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        employeeId?: number;
        userType: 'ADMIN' | 'EMPLOYEE' | 'MANAGER';
        sessionToken: string;
      };
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

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const session = await storage.getUserSession(token);
    if (!session) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Attach user data to request
    req.user = {
      userId: session.userId,
      employeeId: session.employeeId || undefined,
      userType: session.userType as 'ADMIN' | 'EMPLOYEE' | 'MANAGER',
      sessionToken: token,
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
export function requireRole(...allowedRoles: ('ADMIN' | 'EMPLOYEE' | 'MANAGER')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.userType)) {
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
  
  // Admins can access any employee data
  if (req.user.userType === 'ADMIN') {
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
    const token = req.params.token;
    
    if (!token) {
      return res.status(401).json({ error: 'Portal token required' });
    }

    const employee = await storage.getEmployeeByToken(token);
    if (!employee) {
      return res.status(403).json({ error: 'Invalid or expired portal token' });
    }

    // Attach employee data to request for portal access
    req.user = {
      userId: 0, // Portal users don't have system user IDs
      employeeId: employee.id,
      userType: 'EMPLOYEE',
      sessionToken: token,
    };

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
    await storage.deleteExpiredSessions();
    console.log('Expired sessions cleaned up');
  } catch (error) {
    console.error('Session cleanup error:', error);
  }
}

// Schedule session cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);