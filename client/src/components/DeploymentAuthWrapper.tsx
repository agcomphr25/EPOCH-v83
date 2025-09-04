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
  
  // Development overrides - only skip auth for actual development environments
  const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');
  const isReplitEditor = hostname.includes('replit.dev') && !hostname.includes('.replit.dev');
  
  // Debug logs removed - authentication working correctly
  
  // Skip auth ONLY for localhost and Replit editor (not deployed)
  if (isLocalhost || isReplitEditor) {
      return false;
  }
  
  // For custom domains like agcompepoch.xyz, ALWAYS require auth
  return true;
}

export default function DeploymentAuthWrapper({ children }: DeploymentAuthWrapperProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const hostname = window.location.hostname;
    const isDeployment = isDeploymentEnvironment();
    // Skip authentication in development
    if (!isDeployment) {
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    // Check for existing session
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('sessionToken') || localStorage.getItem('jwtToken');
        if (token) {
          // Add timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
          
          try {
            const response = await fetch('/api/auth/session', {
              headers: {
                'Authorization': `Bearer ${token}`
              },
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (response.ok) {
              const userData = await response.json();
              // Check if user is actually authenticated (not anonymous)
              if (userData.username !== 'anonymous' && userData.id > 0) {
                setIsAuthenticated(true);
              } else {
                // Clear invalid tokens
                localStorage.removeItem('sessionToken');
                localStorage.removeItem('jwtToken');
                setIsAuthenticated(false);
              }
            } else {
              // Clear invalid tokens
              localStorage.removeItem('sessionToken');
              localStorage.removeItem('jwtToken');
              setIsAuthenticated(false);
            }
          } catch (fetchError) {
            clearTimeout(timeoutId);
            console.error('Session fetch failed:', fetchError);
            // Clear invalid tokens on timeout/error
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