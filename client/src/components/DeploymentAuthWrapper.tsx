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
    
    // Failsafe: Reduced timeout for better UX during database issues
    const maxLoadingTimeout = setTimeout(() => {
      console.warn('Authentication check took too long, stopping loading state');
      console.warn('This likely indicates database connectivity issues on the deployed site');
      setIsLoading(false);
      // Clear any stale tokens that might be causing issues
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('jwtToken');
      setIsAuthenticated(false);
    }, 8000); // 8 second absolute maximum (reduced from 12)
    
    // Skip authentication in development
    if (!isDeployment) {
      clearTimeout(maxLoadingTimeout);
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    // Check for existing session with enhanced error handling
    const checkAuth = async () => {
      try {
        // Wait a moment for tokens to be written to localStorage after redirect
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const token = localStorage.getItem('sessionToken') || localStorage.getItem('jwtToken');
        
        if (token) {
          console.log('Checking authentication for deployment...');
          
          // Reduced timeout to fail faster and provide better UX
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.log('Authentication check timed out after 5 seconds');
            controller.abort();
          }, 5000); // 5 second timeout
          
          try {
            const response = await fetch('/api/auth/session', {
              headers: {
                'Authorization': `Bearer ${token}`
              },
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            console.log('Authentication response status:', response.status);
            
            if (response.ok) {
              const userData = await response.json();
              console.log('Authentication successful for user:', userData.username);
              // Check if user is actually authenticated (not anonymous)
              if (userData.username !== 'anonymous' && userData.id > 0) {
                setIsAuthenticated(true);
              } else {
                console.log('Invalid user data, clearing tokens');
                // Clear invalid tokens
                localStorage.removeItem('sessionToken');
                localStorage.removeItem('jwtToken');
                setIsAuthenticated(false);
              }
            } else if (response.status === 408) {
              // Database timeout - clear tokens and show login
              console.error('Database timeout detected, clearing authentication tokens');
              localStorage.removeItem('sessionToken');
              localStorage.removeItem('jwtToken');
              setIsAuthenticated(false);
            } else {
              console.log('Authentication failed with status:', response.status);
              // Clear invalid tokens
              localStorage.removeItem('sessionToken');
              localStorage.removeItem('jwtToken');
              setIsAuthenticated(false);
            }
          } catch (fetchError: any) {
            clearTimeout(timeoutId);
            console.error('Session fetch failed:', fetchError);
            
            // Enhanced error handling for specific scenarios
            if (fetchError.name === 'AbortError') {
              console.error('Authentication request timed out - possible database connectivity issue');
            } else if (fetchError.message?.includes('fetch')) {
              console.error('Network error during authentication - check server connectivity');
            }
            
            // Clear invalid tokens on timeout/error
            localStorage.removeItem('sessionToken');
            localStorage.removeItem('jwtToken');
            setIsAuthenticated(false);
          }
        } else {
          console.log('No authentication tokens found');
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
      } finally {
        clearTimeout(maxLoadingTimeout);
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