import { Request, Response, NextFunction } from 'express';
import { getUserPermissions } from '../src/services/permissionService';

/**
 * Factory that returns Express middleware enforcing a capability key.
 *
 * Usage:
 *   app.post('/api/invoices', requirePermission('finance.invoice.create'), handler)
 *
 * Returns 401 when the request has no authenticated user.
 * Returns 403 when the user lacks the required capability.
 */
export function requirePermission(capabilityKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id, role } = req.user as any;

    try {
      const { permissionSet } = await getUserPermissions(id, role);

      if (!permissionSet.has(capabilityKey)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `You do not have the required permission: ${capabilityKey}`,
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
