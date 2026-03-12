import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';

interface PermissionsResponse {
  permissions: string[];
}

/**
 * Returns the current user's resolved capability set and a `can()` helper.
 *
 * Usage:
 *   const { can, isLoading } = usePermissions();
 *   if (can('finance.ar.view')) { ... }
 *   {can('finance.invoice.delete') && <DeleteButton />}
 */
export function usePermissions() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<PermissionsResponse>({
    queryKey: ['/api/permissions/me'],
    enabled: !!user,
    staleTime: 60_000, // cache for 1 minute
  });

  const permissionSet = new Set<string>(data?.permissions ?? []);

  function can(capabilityKey: string): boolean {
    return permissionSet.has(capabilityKey);
  }

  return {
    can,
    permissions: data?.permissions ?? [],
    isLoading,
  };
}
