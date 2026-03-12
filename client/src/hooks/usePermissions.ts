import { useQuery } from '@tanstack/react-query';

interface PermissionsResponse {
  permissions: string[];
}

interface SessionUser {
  id: number;
  username: string;
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
  const { data: sessionUser } = useQuery<SessionUser | null>({
    queryKey: ['/api/auth/session'],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data, isLoading } = useQuery<PermissionsResponse>({
    queryKey: ['/api/permissions/me'],
    enabled: !!sessionUser,
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
