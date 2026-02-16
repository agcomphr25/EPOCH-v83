import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { hasRouteAccess, hasFullAccess } from '@/config/userPermissions';
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
  '/app/production/timer-history', // Timer History - public access for production floor
  '/app/production/timer-programs', // Timer Programs - public access for production floor
  '/fill-and-sign/', // Fill and sign PDF forms - public access for customers
];

function isDeploymentEnvironment(): boolean {
  const hostname = window.location.hostname;
  const isLocalhost =
    hostname.includes('localhost') || hostname.includes('127.0.0.1');
  const isReplitEditor =
    hostname.includes('replit.dev') && !hostname.includes('.replit.dev');
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

export default function RouteGuard({ children }: RouteGuardProps) {
  const [location] = useLocation();
  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(true);

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
        return { 
          id: 0, 
          username: 'anonymous', 
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

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (isPublicRoute(location)) {
      setHasAccess(true);
      setAccessChecked(true);
      return;
    }

    if (!currentUser) {
      setHasAccess(false);
      setAccessChecked(true);
      return;
    }

    const username = currentUser.username?.toLowerCase() || '';
    const userRole = currentUser.role || '';

    // Always allow users to access their own personal dashboard
    if (isOwnPersonalDashboard(username, location)) {
      setHasAccess(true);
      setAccessChecked(true);
      return;
    }

    if (hasFullAccess(username)) {
      setHasAccess(true);
      setAccessChecked(true);
      return;
    }

    const canAccess = hasRouteAccess(username, location, userRole);
    setHasAccess(canAccess);
    setAccessChecked(true);
  }, [location, currentUser, isLoading]);

  // Show loading spinner ONLY while query is in progress
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Always allow public routes immediately - no auth check needed
  if (isPublicRoute(location)) {
    return <>{children}</>;
  }

  // After loading completes, if accessChecked hasn't been set yet by useEffect,
  // compute access synchronously to avoid white screen on auth failure
  if (!accessChecked) {
    // No user after auth check = auth failure, show Access Denied
    if (!currentUser) {
      return <AccessDenied />;
    }
    // User exists but access not yet computed - will be handled by useEffect on next render
    // For now, show loading briefly while effect runs
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking permissions...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
