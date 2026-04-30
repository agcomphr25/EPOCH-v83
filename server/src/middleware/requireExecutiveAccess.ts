import { Request, Response, NextFunction } from 'express';

const EXECUTIVE_ROLES = ['ADMIN', 'OWNER'];

/**
 * Shared role-based guard helper.
 * Checks that req.user exists and holds one of the allowed roles.
 * Emits a structured warning log (route, method, timestamp) for unauthenticated (401) attempts
 * and (user id, username, role, route, method, timestamp) for authenticated-but-insufficient (403) denials.
 * Calls next() on success.
 */
export function requireRoleOrCapability(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      console.warn(
        `⚠️ ACCESS DENIED (unauthenticated): action=${req.method} route=${req.originalUrl} timestamp=${new Date().toISOString()}`
      );
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id, username, role } = user;
    const normalizedRole = (role || '').toUpperCase();

    if (allowedRoles.includes(normalizedRole)) {
      return next();
    }

    console.warn(
      `⚠️ ACCESS DENIED: userId=${id} username=${username} role=${role || 'none'} ` +
      `action=${req.method} route=${req.originalUrl} timestamp=${new Date().toISOString()}`
    );
    return res.status(403).json({
      error: 'Access denied',
      message: 'This action requires elevated privileges',
    });
  };
}

/**
 * Restricts access to users with the ADMIN or OWNER role.
 * Used by the executive rundown and accounting-prep routes.
 */
export const requireExecutiveAccess = requireRoleOrCapability(EXECUTIVE_ROLES);
