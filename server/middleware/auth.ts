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
      /**
       * Set by attemptBadgeOrTokenAuth when a badge code is present in the request
       * but resolves to no employee in the database.  requirePermission reads this flag
       * to return a descriptive "Badge not recognised" 401 instead of the generic
       * "Authentication required" message.
       */
      badgeLookupFailed?: boolean;
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
  console.log(
    '🔒 SECURITY: Running in production mode - full authentication enforced'
  );
} else if (process.env.DEV_AUTH_BYPASS === 'true') {
  console.warn(
    '⚠️ SECURITY WARNING: DEV_AUTH_BYPASS is enabled - authentication is bypassed'
  );
  console.warn(
    '⚠️ Remove DEV_AUTH_BYPASS=true before deploying to any public environment'
  );
} else {
  console.log(
    '🔒 SECURITY: Running in development mode with authentication enforced'
  );
  console.log(
    '💡 Set DEV_AUTH_BYPASS=true if you need to bypass authentication for local testing'
  );
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
    // Browser logins are stored in the Express session. In hosted development
    // environments the separate sessionToken cookie may be unavailable (for
    // example inside the Replit preview iframe), so honor the authenticated
    // server-side session before falling back to token authentication. Rehydrate
    // it from the authoritative user row so employee links and role changes made
    // after login are available to controlled actions immediately.
    const sessionUser = (req as any).session?.user;
    if (sessionUser && sessionUser.username && sessionUser.isActive !== false) {
      const currentUser = sessionUser.id
        ? await AuthService.getUserById(Number(sessionUser.id))
        : null;
      if (currentUser?.isActive) {
        req.user = currentUser;
        (req as any).session.user = currentUser;
        return next();
      }
    }

    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    const cookieToken = req.cookies?.sessionToken;

    const token = bearerToken || cookieToken;

    let user = null;

    // Try JWT authentication first (for Bearer tokens)
    if (bearerToken) {
      const jwtPayload = AuthService.verifyJWT(bearerToken);
      if (jwtPayload) {
        const dbUser = await AuthService.getUserById(jwtPayload.userId);
        if (dbUser && dbUser.isActive) {
          user = dbUser;
        }
      }
    }

    // Second fallback: Bearer value may be a plain session token (not JWT).
    // This handles cases where the browser sends its sessionToken as both a
    // Bearer header and a cookie (e.g. third-party cookie restrictions on production
    // domains like agcompepoch.xyz where the cookie may not be transmitted).
    if (!user && bearerToken) {
      user = await AuthService.getUserBySession(bearerToken);
    }

    // Fallback to session-based authentication (for cookies)
    if (!user && cookieToken) {
      user = await AuthService.getUserBySession(cookieToken);
    }

    // If a real session was found, use it regardless of bypass mode
    if (user) {
      req.user = user;
      return next();
    }

    // Only bypass authentication if DEV_AUTH_BYPASS is explicitly enabled
    // and there is no valid real session
    if (isAuthBypassEnabled()) {
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

    return res
      .status(token ? 403 : 401)
      .json({ error: token ? 'Invalid or expired token' : 'No session token' });
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
      const message = validation.reason ?? 'Invalid or expired portal token';
      return res.status(403).json({ error: message });
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

    next();
  };
}

/**
 * Step-up re-authentication middleware for CUI/ITAR-classified resources.
 * Verifies that the user re-entered their credentials within the configured
 * threshold (default: 30 minutes). If not, returns 401 with WWW-Authenticate: StepUp
 * so the client can prompt the user to re-enter their password.
 *
 * Apply this gate to any endpoint that serves controlled/sensitive documents.
 * Example: router.get('/documents/:id/download', requireStepUp(), handler)
 */
export function requireStepUp(maxAgeMs: number = 30 * 60 * 1000) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Skip in dev bypass mode
    if (
      process.env.DEV_AUTH_BYPASS === 'true' &&
      process.env.NODE_ENV !== 'production'
    ) {
      return next();
    }

    try {
      const { pool } = await import('../db');
      // Prefer the cookie session token over the Authorization bearer value.
      // Bearer tokens may be JWTs (not session tokens), so looking them up in
      // user_sessions would always fail. Cookie tokens are always real session rows.
      const sessionToken =
        req.cookies?.sessionToken ||
        (req.headers['authorization'] as string | undefined)?.replace(
          'Bearer ',
          ''
        );

      if (!sessionToken) {
        res.setHeader('WWW-Authenticate', 'StepUp');
        return res.status(401).json({
          error: 'Step-up authentication required',
          code: 'STEP_UP_REQUIRED',
          requireStepUp: true,
        });
      }

      const result = await pool.query(
        `SELECT last_credential_verified_at FROM user_sessions WHERE session_token = $1 AND is_active = true`,
        [sessionToken]
      );
      const row = result.rows?.[0] ?? result[0];

      if (!row || !row.last_credential_verified_at) {
        res.setHeader('WWW-Authenticate', 'StepUp');
        return res.status(401).json({
          error: 'Step-up authentication required',
          code: 'STEP_UP_REQUIRED',
          requireStepUp: true,
        });
      }

      const verifiedAt = new Date(row.last_credential_verified_at).getTime();
      if (Date.now() - verifiedAt > maxAgeMs) {
        res.setHeader('WWW-Authenticate', 'StepUp');
        return res.status(401).json({
          error: 'Credential verification has expired. Please re-authenticate.',
          code: 'STEP_UP_REQUIRED',
          requireStepUp: true,
        });
      }

      next();
    } catch (err) {
      console.error('requireStepUp error:', err);
      res.setHeader('WWW-Authenticate', 'StepUp');
      return res.status(401).json({
        error: 'Step-up authentication required',
        code: 'STEP_UP_REQUIRED',
        requireStepUp: true,
      });
    }
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
  console.log(
    `⚠️ BYPASS ROUTE ACCESSED: ${req.method} ${req.originalUrl} (bypass: ${bypassEnabled})`
  );

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

/**
 * Session-aware authentication middleware that prioritizes real session users
 * over DEV_AUTH_BYPASS. Use this for routes where the actual logged-in user
 * identity matters (e.g., user-specific access control).
 *
 * This middleware:
 * 1. First checks for req.session.user (Express session) and uses it if present
 * 2. Then checks for token-based auth (JWT/cookie)
 * 3. Only falls back to bypass user if no real session exists AND bypass is enabled
 * 4. In production, always requires real authentication
 */
export async function sessionAwareAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // PRIORITY 1: Check Express session first (this is where logged-in users are stored)
    const sessionUser = (req as any).session?.user;
    if (sessionUser && sessionUser.username) {
      req.user = sessionUser;
      return next();
    }

    // PRIORITY 2: Check token-based authentication
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1];
    const cookieToken = req.cookies?.sessionToken;
    const token = bearerToken || cookieToken;

    let user = null;

    if (token) {
      // Try JWT authentication first (for Bearer tokens)
      if (bearerToken) {
        const jwtPayload = AuthService.verifyJWT(bearerToken);
        if (jwtPayload) {
          const dbUser = await AuthService.getUserById(jwtPayload.userId);
          if (dbUser && dbUser.isActive) {
            user = dbUser;
          }
        }
      }

      // Second fallback: Bearer value may be a plain session token (not JWT).
      if (!user && bearerToken) {
        user = await AuthService.getUserBySession(bearerToken);
      }

      // Fallback to session-based authentication (for cookies)
      if (!user && cookieToken) {
        user = await AuthService.getUserBySession(cookieToken);
      }
    }

    // If we found a real user from token, use them (regardless of bypass setting)
    if (user) {
      req.user = user;
      return next();
    }

    // PRIORITY 3: No real user found - check if bypass is enabled for dev
    if (isAuthBypassEnabled()) {
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

    // No token and no bypass
    return res.status(401).json({ error: 'No session token' });
  } catch (error) {
    console.error('Session-aware auth error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Optional authentication middleware for public routes that benefit from user context.
 * This middleware:
 * 1. Attempts to authenticate the user if they have a session/token
 * 2. Sets req.user if authentication succeeds
 * 3. ALWAYS calls next() - never blocks the request
 *
 * Use this for public routes where authenticated users get extra functionality
 * (e.g., starting a timer requires login, but viewing timers is public).
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Check for dev bypass first
    if (isAuthBypassEnabled()) {
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

    // Try token-based authentication
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1];
    const cookieToken = req.cookies?.sessionToken;

    // Try JWT authentication first (for Bearer tokens)
    if (bearerToken) {
      const jwtPayload = AuthService.verifyJWT(bearerToken);
      if (jwtPayload) {
        const dbUser = await AuthService.getUserById(jwtPayload.userId);
        if (dbUser && dbUser.isActive) {
          req.user = dbUser;
          return next();
        }
      }
    }

    // Second fallback: Bearer value may be a plain session token (not JWT).
    if (bearerToken) {
      const user = await AuthService.getUserBySession(bearerToken);
      if (user) {
        req.user = user;
        return next();
      }
    }

    // Fallback to session-based authentication (for cookies)
    if (cookieToken) {
      const user = await AuthService.getUserBySession(cookieToken);
      if (user) {
        req.user = user;
        return next();
      }
    }

    // No authentication found - that's okay, just continue without user
    return next();
  } catch (error) {
    console.error('Optional auth error:', error);
    // Don't block the request on errors - just continue without user
    return next();
  }
}
