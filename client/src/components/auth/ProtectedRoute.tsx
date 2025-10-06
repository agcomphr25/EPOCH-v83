import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, AlertCircle } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string[];
  fallback?: React.ReactNode;
}

interface User {
  id: number;
  employeeId: number;
  role: string;
  isActive: boolean;
}

export default function ProtectedRoute({ 
  children, 
  requiredRole = [], 
  fallback 
}: ProtectedRouteProps) {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['/api/auth/session'],
    queryFn: async () => {
      const response = await fetch('/api/auth/session');
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Not authenticated');
        }
        throw new Error('Failed to verify session');
      }
      return response.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (error || !user) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="max-w-md border-red-200 bg-red-50">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-red-700 mb-2">Access Required</h2>
            <p className="text-red-600 mb-4">
              Please log in to access this area of the system.
            </p>
            <a href="/login" className="text-blue-600 hover:text-blue-800 underline">
              Go to Login
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check role requirements
  if (requiredRole.length > 0 && !requiredRole.includes(user.role)) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="max-w-md border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-yellow-700 mb-2">Insufficient Permissions</h2>
            <p className="text-yellow-600 mb-4">
              You don't have the required permissions to access this area.
            </p>
            <p className="text-sm text-gray-600">
              Required role: {requiredRole.join(' or ')}
            </p>
            <p className="text-sm text-gray-600">
              Your role: {user.role}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if user is active
  if (!user.isActive) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="max-w-md border-gray-200 bg-gray-50">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Account Inactive</h2>
            <p className="text-gray-600">
              Your account is currently inactive. Please contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}