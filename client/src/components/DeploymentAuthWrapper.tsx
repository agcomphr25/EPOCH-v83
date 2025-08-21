import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import LoginPage from '../pages/LoginPage';

interface DeploymentAuthWrapperProps {
  children: React.ReactNode;
}

function isDeploymentEnvironment(): boolean {
  // Authentication disabled for all environments
  return false;
}

export default function DeploymentAuthWrapper({ children }: DeploymentAuthWrapperProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication status
  const { data: sessionData } = useQuery({
    queryKey: ['/api/auth/session'],
    retry: false,
    enabled: isDeploymentEnvironment(),
  });

  useEffect(() => {
    // Skip authentication in development
    if (!isDeploymentEnvironment()) {
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    // Check for existing session
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('sessionToken') || localStorage.getItem('jwtToken');
        if (token) {
          const response = await fetch('/api/auth/session', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (response.ok) {
            setIsAuthenticated(true);
          } else {
            // Clear invalid tokens
            localStorage.removeItem('sessionToken');
            localStorage.removeItem('jwtToken');
            setIsAuthenticated(false);
          }
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Show loading during auth check
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page if in deployment and not authenticated
  if (isDeploymentEnvironment() && !isAuthenticated) {
    return <LoginPage />;
  }

  // Show main app if authenticated or in development
  return <>{children}</>;
}