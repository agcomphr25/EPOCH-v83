import { Request, Response, NextFunction } from 'express';
import { getUserPermissions } from '../src/services/permissionService';

/**
 * Factory that returns Express middleware enforcing a capability key.
 *
 * Usage:
 *   app.post('/api/invoices', requirePermission('finance.invoice.create'), handler)
 *
 * Returns 401 when the request has no authenticated user.
 *   - If a badge code was present in the request but no employee was found (flagged by
 *     badgeAuth via req.badgeLookupFailed), a 422 is returned so the UI can surface a
 *     meaningful "Badge not recognised" message without triggering session-expiry interceptors.
 * Returns 403 when the user lacks the required capability.
 */
export function requirePermission(capabilityKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      if (req.badgeLookupFailed) {
        return res.status(422).json({
          error: 'Badge not recognised',
          detail: 'The badge ID you entered was not found in the employee directory. Please check the badge ID and try again.',
        });
      }
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id, role } = req.user as any;

    // Superuser roles bypass all capability checks
    if (role === 'ADMIN' || role === 'OWNER') {
      return next();
    }

    try {
      const { permissionSet } = await getUserPermissions(id, role);

      if (!permissionSet.has(capabilityKey)) {
        return res.status(403).json({
          error: 'Forbidden',
          requiredCapability: capabilityKey,
        });
      }

      next();
    } catch (err) {
      console.error('[requirePermission] Error checking permissions:', err);
      // Fail closed — deny on error
      return res.status(403).json({ error: 'Permission check failed' });
    }
  };
}
