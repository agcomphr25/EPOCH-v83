import { Request, Response, NextFunction } from 'express';

import { getUserPermissions } from '../src/services/permissionService';
import { recordAuditEvent } from '../src/services/auditLedgerService';

async function recordReconciliationAuthorization(
  req: Request,
  capabilityKey: string,
  decision: 'ALLOWED' | 'DENIED'
) {
  if (!capabilityKey.startsWith('documents.reconciliation_')) return;
  const user = req.user as any;
  try {
    await recordAuditEvent({
      eventType: `CONTROLLED_DOCUMENT_RECONCILIATION_ACCESS_${decision}`,
      subjectType: 'controlled_document_reconciliation',
      subjectId: capabilityKey,
      sourceService: 'requirePermission.middleware',
      actor: user
        ? {
            id: Number(user.id),
            username: String(user.username || ''),
            role: String(user.role || ''),
          }
        : undefined,
      payload: { capabilityKey, method: req.method, path: req.originalUrl },
      ipAddress:
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        null,
      userAgent: req.headers['user-agent'] || null,
    });
  } catch (error) {
    console.error(
      '[requirePermission] Failed to record controlled-document reconciliation authorization',
      error
    );
  }
}

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
          detail:
            'The badge ID you entered was not found in the employee directory. Please check the badge ID and try again.',
        });
      }
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id, role } = req.user as any;

    // Superuser roles bypass all capability checks
    if (role === 'ADMIN' || role === 'OWNER') {
      await recordReconciliationAuthorization(req, capabilityKey, 'ALLOWED');
      return next();
    }

    try {
      const { permissionSet } = await getUserPermissions(id, role);

      if (!permissionSet.has(capabilityKey)) {
        await recordReconciliationAuthorization(req, capabilityKey, 'DENIED');
        return res.status(403).json({
          error: 'Forbidden',
          requiredCapability: capabilityKey,
        });
      }

      await recordReconciliationAuthorization(req, capabilityKey, 'ALLOWED');
      next();
    } catch (err) {
      console.error('[requirePermission] Error checking permissions:', err);
      await recordReconciliationAuthorization(req, capabilityKey, 'DENIED');
      // Fail closed — deny on error
      return res.status(403).json({ error: 'Permission check failed' });
    }
  };
}

export function requireAnyPermission(capabilityKeys: readonly string[]) {
  if (capabilityKeys.length === 0) {
    throw new Error('requireAnyPermission requires at least one capability');
  }
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { id, role } = req.user as any;
    if (role === 'ADMIN' || role === 'OWNER') return next();
    try {
      const { permissionSet } = await getUserPermissions(id, role);
      if (!capabilityKeys.some((key) => permissionSet.has(key))) {
        return res.status(403).json({
          error: 'Forbidden',
          requiredAnyCapability: capabilityKeys,
        });
      }
      next();
    } catch (err) {
      console.error('[requireAnyPermission] Error checking permissions:', err);
      return res.status(403).json({ error: 'Permission check failed' });
    }
  };
}
