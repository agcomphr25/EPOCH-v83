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
  
  console.log('DEPLOYMENT DEBUG - hostname:', hostname);
  console.log('DEPLOYMENT DEBUG - viteDeployment:', viteDeployment);
  console.log('DEPLOYMENT DEBUG - nodeEnv:', nodeEnv);
  console.log('DEPLOYMENT DEBUG - isLocalhost:', isLocalhost);
  console.log('DEPLOYMENT DEBUG - isReplitEditor:', isReplitEditor);
  
  // Skip auth ONLY for localhost and Replit editor (not deployed)
  if (isLocalhost || isReplitEditor) {
    console.log('DEPLOYMENT DEBUG - Skipping auth for development');
    return false;
  }
  
  // For custom domains like agcompepoch.xyz, ALWAYS require auth
  console.log('DEPLOYMENT DEBUG - Requiring auth for deployment environment');
  return true;
}

export default function DeploymentAuthWrapper({ children }: DeploymentAuthWrapperProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const hostname = window.location.hostname;
    const isDeployment = isDeploymentEnvironment();
    console.log('Auth Debug - Hostname:', hostname, 'Is Deployment:', isDeployment);
    
    // Skip authentication in development
    if (!isDeployment) {
      console.log('Auth Debug - Skipping auth for development environment');
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    console.log('Auth Debug - Running auth check for deployment environment');

    // Check for existing session
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('sessionToken') || localStorage.getItem('jwtToken');
        console.log('Auth Debug - Found token:', token ? token.substring(0, 10) + '...' : 'None');
        
        if (token) {
          const response = await fetch('/api/auth/session', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          console.log('Auth Debug - Session response status:', response.status);
          
          if (response.ok) {
            const userData = await response.json();
            console.log('Auth Debug - User data:', userData);
            // Check if user is actually authenticated (not anonymous)
            if (userData.username !== 'anonymous' && userData.id > 0) {
              console.log('Auth Debug - Authentication successful');
              setIsAuthenticated(true);
            } else {
              console.log('Auth Debug - Anonymous user, clearing tokens');
              // Clear invalid tokens
              localStorage.removeItem('sessionToken');
              localStorage.removeItem('jwtToken');
              setIsAuthenticated(false);
            }
          } else {
            console.log('Auth Debug - Session check failed, clearing tokens');
            // Clear invalid tokens
            localStorage.removeItem('sessionToken');
            localStorage.removeItem('jwtToken');
            setIsAuthenticated(false);
          }
        } else {
          console.log('Auth Debug - No token found, requiring login');
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