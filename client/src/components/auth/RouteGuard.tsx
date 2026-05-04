import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { hasRouteAccess, hasFullAccess, getRequiredCapability } from '@/config/userPermissions';
import { getDashboardRoute } from '@/config/dashboardMapping';
import AccessDenied from '@/pages/AccessDenied';

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
  '/app/production/stations', // Timer Station - public access for production floor
  '/tv-display', // TV Display - public access for production floor screens
  '/app/production/timer-history', // Timer History - public access for production floor
  '/app/production/timer-programs', // Timer Programs - public access for production floor
  '/fill-and-sign/', // Fill and sign PDF forms - public access for customers
  '/kiosk', // Time-clock kiosk — PIN-based auth, no EPOCH login required
  '/vendor-confirm', // Vendor PO confirmation page - public access for vendors
];

function isDeploymentEnvironment(): boolean {
  const hostname = window.location.hostname;
  const isLocalhost =
    hostname.includes('localhost') || hostname.includes('127.0.0.1');
  const isReplitEditor = hostname.includes('replit.dev');
  return !isLocalhost && !isReplitEditor;
}

function isPublicRoute(path: string): boolean {
  if (PUBLIC_ROUTES.includes(path)) {
    return true;
  }
  
  for (const prefix of PUBLIC_ROUTE_PREFIXES) {
    if (path.startsWith(prefix)) {
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
    if (capabilitySet && capabilitySet.has(requiredCap)) return true;
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

      if (!isDeploymentEnvironment()) {
        const storedUsername = localStorage.getItem('dev_username');
        if (storedUsername) {
          return { 
            id: 0, 
            username: storedUsername, 
            role: 'ADMIN',
            employeeId: null 
          };
        }
        try {
          const response = await fetch('/api/auth/session', {
            credentials: 'include',
          });
          if (response.ok) {
            return await response.json();
          }
        } catch (error) {
          // Fall through to anonymous default
        }
        return { 
          id: 0, 
          username: 'admin', 
          role: 'ADMIN',
          employeeId: null 
        };
      }

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
      setLocation('/login');
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
    return null;
  }

  // Authenticated — check route-level permissions (including capability-gated routes)
  const access = computeAccess(currentUser, location, capabilitySet);

  if (!access) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
