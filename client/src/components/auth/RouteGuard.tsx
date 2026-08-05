import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { hasRouteAccess, hasFullAccess, getRequiredCapability } from '@/config/userPermissions';
import { getDashboardRoute } from '@/config/dashboardMapping';
import AccessDenied from '@/pages/AccessDenied';
import { Button } from '@/components/ui/button';

interface RouteGuardProps {
  children: React.ReactNode;
}

interface UserData {
  id: number;
  username: string;
  role: string;
  employeeId: number | null;
}

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/access-denied',
  '/qr-error',  // QR code error page - must be public so unauthenticated users see error details
  '/process-runs',  // Timer app integration - read-only reporting
  '/rma-form',  // RMA form - fillable and printable
];

const PUBLIC_ROUTE_PREFIXES = [
  '/sign-order',  // Customer signature page - no auth required
  '/p2-traveler', // P2 traveler viewer - public access for customers/vendors
  '/travelers/',  // Traveler execution - production floor access via barcode scan
  '/employee-portal/', // Employee portal with portalId - public access for employees
  '/onboarding/invite/', // New-hire onboarding invite verification and paperwork
  '/app/production/stations', // Timer Station - public access for production floor
  '/tv-display', // TV Display - public access for production floor screens
  '/app/production/timer-history', // Timer History - public access for production floor
  '/app/production/timer-programs', // Timer Programs - public access for production floor
  '/fill-and-sign/', // Fill and sign PDF forms - public access for customers
  '/kiosk', // Time-clock kiosk — PIN-based auth, no EPOCH login required
];

function normalizeRoute(path: string): string {
  return path.split('?')[0].split('#')[0];
}

function isPublicRoute(path: string): boolean {
  const routePath = normalizeRoute(path);

  if (PUBLIC_ROUTES.includes(routePath)) {
    return true;
  }
  
  for (const prefix of PUBLIC_ROUTE_PREFIXES) {
    if (routePath.startsWith(prefix)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if the route is the user's own personal dashboard
 * Uses the dashboard mapping to handle cases where dashboard URLs don't follow
 * the /{username}-dashboard pattern (e.g., agrace uses /ag-dashboard)
 */
function isOwnPersonalDashboard(username: string, route: string): boolean {
  if (!username) return false;
  const lowerUsername = username.toLowerCase();
  const lowerRoute = route.toLowerCase();
  
  // Check if route matches the user's mapped dashboard
  const userDashboard = getDashboardRoute(lowerUsername);
  if (userDashboard && lowerRoute === userDashboard.toLowerCase()) {
    return true;
  }
  
  // Also check the standard pattern as a fallback
  return lowerRoute === `/${lowerUsername}-dashboard`;
}

function computeAccess(currentUser: UserData | null | undefined, location: string, capabilitySet?: Set<string>): boolean {
  if (isPublicRoute(location)) return true;

  if (!currentUser) return false;

  const username = currentUser.username?.toLowerCase() || '';
  const userRole = currentUser.role || '';

  if (isOwnPersonalDashboard(username, location)) return true;
  if (hasFullAccess(username)) return true;

  const requiredCap = getRequiredCapability(location);
  if (requiredCap) {
    const roleUpper = userRole.toUpperCase();
    if (roleUpper === 'ADMIN' || roleUpper === 'OWNER') return true;
    const requiredCaps = Array.isArray(requiredCap) ? requiredCap : [requiredCap];
    if (capabilitySet && requiredCaps.some((cap) => capabilitySet.has(cap))) return true;
    return hasRouteAccess(username, location, userRole);
  }

  return hasRouteAccess(username, location, userRole);
}

export default function RouteGuard({ children }: RouteGuardProps) {
  const [location, setLocation] = useLocation();

  const { data: currentUser, isLoading } = useQuery<UserData | null>({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const token =
        localStorage.getItem('sessionToken') ||
        localStorage.getItem('jwtToken');

      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'include',
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {},
        });

        if (response.ok) {
          return await response.json();
        }
        return null;
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: permissionsData } = useQuery<{ permissions: string[] }>({
    queryKey: ['/api/permissions/me'],
    staleTime: 5 * 60 * 1000,
    enabled: !!currentUser,
  });
  const capabilitySet = useMemo(
    () => new Set(permissionsData?.permissions ?? []),
    [permissionsData],
  );

  // Redirect unauthenticated users to /login after auth query settles.
  // Using useEffect to keep the redirect as a side effect rather than
  // performing navigation during render, which avoids React strict-mode warnings.
  useEffect(() => {
    if (!isLoading && !isPublicRoute(location) && currentUser === null) {
      setLocation('/login', { replace: true });
    }
  }, [isLoading, currentUser, location, setLocation]);

  // Public routes: render immediately, no auth check needed
  if (isPublicRoute(location)) {
    return <>{children}</>;
  }

  // Render children optimistically while auth resolves to avoid a full-page
  // blocking spinner. Once the query settles the checks below apply.
  if (isLoading) {
    return <>{children}</>;
  }

  // Auth resolved — unauthenticated: render nothing while the useEffect redirects
  if (!currentUser) {
    const redirectTarget = `${location}${window.location.search || ''}`;

    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Sign-in Required</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your session needs to be refreshed before this page can load.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              type="button"
              onClick={() =>
                setLocation(`/login?redirect=${encodeURIComponent(redirectTarget)}`)
              }
            >
              Go to Login
            </Button>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated — check route-level permissions (including capability-gated routes)
  const access = computeAccess(currentUser, location, capabilitySet);

  if (!access) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
