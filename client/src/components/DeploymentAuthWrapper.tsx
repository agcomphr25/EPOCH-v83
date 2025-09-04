import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import LoginPage from '../pages/LoginPage';

interface DeploymentAuthWrapperProps {
  children: React.ReactNode;
}

function isDeploymentEnvironment(): boolean {
  // Multiple methods to detect deployment environment
  const hostname = window.location.hostname;
  const viteDeployment = import.meta.env.VITE_REPLIT_DEPLOYMENT === '1';
  const nodeEnv = import.meta.env.VITE_NODE_ENV === 'production';
  const isReplitDomain = hostname.includes('.replit.app') || hostname.includes('.repl.co');
  
  // Development overrides
  const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');
  const isReplitEditor = hostname.includes('.replit.dev');
  
  console.log('🔐 Auth environment check:', {
    hostname,
    viteDeployment,
    nodeEnv,
    isReplitDomain,
    isLocalhost,
    isReplitEditor,
    env: import.meta.env
  });
  
  // Skip auth for development environments
  if (isLocalhost || isReplitEditor) {
    return false;
  }
  
  // Require auth for any deployed environment
  return viteDeployment || nodeEnv || isReplitDomain || (!isLocalhost && !isReplitEditor);
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