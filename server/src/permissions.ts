import { userHasScopedCapability, type ScopeContext } from './services/permissionService';

export class ScopedForbiddenError extends Error {
  readonly status = 403;
  readonly payload: {
    error: string;
    requiredCapability: string;
    context: ScopeContext;
  };

  constructor(capabilityKey: string, context: ScopeContext) {
    super('Forbidden');
    this.name = 'ScopedForbiddenError';
    this.payload = {
      error: 'Forbidden',
      requiredCapability: capabilityKey,
      context,
    };
  }
}

/**
 * Check that the authenticated user has a scoped capability grant covering the
 * given context. Throws ScopedForbiddenError (status 403) when the check fails.
 *
 * Usage inside a route handler (after the relevant record is loaded):
 *   await requireScopedCapability(req.user, 'work_orders.release', { projectId: wad.projectId });
 *
 * Callers must handle ScopedForbiddenError in their catch block:
 *   } catch (err: any) {
 *     if (err instanceof ScopedForbiddenError) return res.status(403).json(err.payload);
 *     ...
 *   }
 */
export async function requireScopedCapability(
  user: { id: number; role?: string } | null | undefined,
  capabilityKey: string,
  context: ScopeContext
): Promise<void> {
  if (!user) {
    throw new ScopedForbiddenError(capabilityKey, context);
  }

  const allowed = await userHasScopedCapability(user.id, user.role, capabilityKey, context);
  if (!allowed) {
    throw new ScopedForbiddenError(capabilityKey, context);
  }
}
