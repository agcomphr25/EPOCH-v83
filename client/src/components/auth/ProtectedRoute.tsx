import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { hasRouteAccess, hasFullAccess } from '@/config/userPermissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: string[];
}

interface UserData {
  id: number;
  username: string;
  role: string;
  employeeId: number | null;
}

export default function ProtectedRoute({
  children,
  requiredRoles,
}: ProtectedRouteProps) {
  const [location, setLocation] = useLocation();
  const [accessState, setAccessState] = useState<'loading' | 'granted' | 'denied' | 'unauthenticated'>('loading');

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

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!currentUser) {
      setAccessState('unauthenticated');
      return;
    }

    const username = currentUser.username?.toLowerCase() || '';
    const userRole = currentUser.role || '';

    if (hasFullAccess(username)) {
      setAccessState('granted');
      return;
    }

    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.some(
        (role) => role.toUpperCase() === userRole.toUpperCase()
      );
      if (!hasRole) {
        setAccessState('denied');
        return;
      }
    }

    const hasAccess = hasRouteAccess(username, location, userRole);
    
    if (!hasAccess) {
      setAccessState('denied');
      return;
    }

    setAccessState('granted');
  }, [currentUser, isLoading, location, requiredRoles]);

  useEffect(() => {
    if (accessState === 'unauthenticated') {
      setLocation('/login', { replace: true });
    } else if (accessState === 'denied') {
      setLocation('/access-denied', { replace: true });
    }
  }, [accessState, setLocation]);

  if (isLoading || accessState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (accessState === 'unauthenticated' || accessState === 'denied') {
    return null;
  }

  return <>{children}</>;
}
