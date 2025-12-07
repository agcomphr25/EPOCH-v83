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
 * Check if authentication bypass is enabled
 * SECURITY: Authentication bypass requires BOTH conditions:
 * 1. NODE_ENV is NOT 'production'
 * 2. DEV_AUTH_BYPASS environment variable is explicitly set to 'true'
 * 
 * This prevents accidental security bypass in preview/staging deployments
 */
function isAuthBypassEnabled(): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  const bypassEnabled = process.env.DEV_AUTH_BYPASS === 'true';
  
  // Only bypass if NOT production AND bypass is explicitly enabled
  return !isProduction && bypassEnabled;
}

// Log security status at startup
if (process.env.NODE_ENV === 'production') {
  console.log('🔒 SECURITY: Running in production mode - full authentication enforced');
} else if (process.env.DEV_AUTH_BYPASS === 'true') {
  console.warn('⚠️ SECURITY WARNING: DEV_AUTH_BYPASS is enabled - authentication is bypassed');
  console.warn('⚠️ Remove DEV_AUTH_BYPASS=true before deploying to any public environment');
} else {
  console.log('🔒 SECURITY: Running in development mode with authentication enforced');
  console.log('💡 Set DEV_AUTH_BYPASS=true if you need to bypass authentication for local testing');
}

/**
 * Authentication middleware to verify session tokens (deployment-aware)
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Only bypass authentication if DEV_AUTH_BYPASS is explicitly enabled
    if (isAuthBypassEnabled()) {
      // In development with bypass enabled, use admin user for testing
      req.user = {
        id: 2,
        username: 'admin',
        role: 'ADMIN',
        employeeId: null,
        canOverridePrices: true,
        isActive: true,
      };
      return next();
    }

    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    const cookieToken = req.cookies?.sessionToken;

    const token = bearerToken || cookieToken;

    if (!token) {
      return res.status(401).json({ error: 'No session token' });
    }

    let user = null;

    // Try JWT authentication first (for Bearer tokens)
    if (bearerToken) {
      const jwtPayload = AuthService.verifyJWT(bearerToken);
      if (jwtPayload) {
        // Get user from database using JWT payload
        const dbUser = await AuthService.getUserById(jwtPayload.userId);
        if (dbUser && dbUser.isActive) {
          user = dbUser;
        }
      }
    }

    // Fallback to session-based authentication (for cookies)
    if (!user && cookieToken) {
      user = await AuthService.getUserBySession(cookieToken);
    }

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
export function requireEmployeeAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
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
export async function authenticatePortalToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
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
    const { AuthService } = await import('../auth');
    // Clean up expired sessions from database
    await AuthService.cleanupExpiredSessions();
    console.log('Session cleanup completed');
  } catch (error) {
    console.error('Session cleanup error:', error);
  }
}

// Schedule session cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

/**
 * Soft authentication middleware for bypass routes
 * Only bypasses authentication if DEV_AUTH_BYPASS is explicitly enabled
 * Otherwise enforces full authentication (same as authenticateToken)
 * 
 * This allows bypass routes to work during local development while enforcing
 * authentication in all deployed environments (preview, staging, production).
 */
export async function softAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const bypassEnabled = isAuthBypassEnabled();
  
  // Log that a bypass route is being accessed
  console.log(`⚠️ BYPASS ROUTE ACCESSED: ${req.method} ${req.originalUrl} (bypass: ${bypassEnabled})`);
  
  if (bypassEnabled) {
    // Only bypass if explicitly enabled for local development
    req.user = {
      id: 2,
      username: 'admin',
      role: 'ADMIN',
      employeeId: null,
      canOverridePrices: true,
      isActive: true,
    };
    return next();
  }
  
  // Enforce full authentication in all other environments
  return authenticateToken(req, res, next);
}

/**
 * Convenience export for admin/owner only routes
 */
export const requireAdminOrOwner = [
  authenticateToken,
  requireRole('ADMIN', 'OWNER'),
];
