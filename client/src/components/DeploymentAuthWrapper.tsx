import React, { useState, useEffect } from 'react';

import LoginPage from '../pages/LoginPage';

interface DeploymentAuthWrapperProps {
  children: React.ReactNode;
}

function isDeploymentEnvironment(): boolean {
  // TEMPORARY: Authentication disabled for agcompepoch.xyz to allow access
  // TODO: Re-enable authentication once login issues are fully resolved
  return false;

  // Prioritize NODE_ENV for development - always bypass auth in development
  if (import.meta.env.VITE_NODE_ENV === 'development' || import.meta.env.DEV) {
    return false;
  }

  const hostname = window.location.hostname;
  const viteDeployment = import.meta.env.VITE_REPLIT_DEPLOYMENT === '1';
  const nodeEnv = import.meta.env.VITE_NODE_ENV === 'production';

  const isLocalhost =
    hostname.includes('localhost') || hostname.includes('127.0.0.1');
  const isReplitEditor =
    hostname.includes('replit.dev') && !hostname.includes('.replit.dev');

  if (isLocalhost || isReplitEditor) {
    return false;
  }

  return true;
}

export default function DeploymentAuthWrapper({
  children,
}: DeploymentAuthWrapperProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const isDeployment = isDeploymentEnvironment();

    const maxLoadingTimeout = setTimeout(() => {
      console.warn(
        '⚠️ TIMEOUT FAILSAFE TRIGGERED: Authentication check took too long, stopping loading state'
      );
      // On timeout we do NOT clear tokens — the session may still be valid
      // and a transient network hiccup should not force the user to re-login.
      setIsLoading(false);
      setIsAuthenticated(false);
    }, 8000);

    if (!isDeployment) {
      clearTimeout(maxLoadingTimeout);
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    const checkAuth = async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 300));

        const token =
          localStorage.getItem('sessionToken') ||
          localStorage.getItem('jwtToken');
        console.log('🔍 AUTH WRAPPER: Token found after redirect:', !!token);

        if (token) {
          console.log(
            '🔐 AUTH WRAPPER: Checking authentication for deployment...'
          );

          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.log('Authentication check timed out after 5 seconds');
            controller.abort();
          }, 5000);

          try {
            const response = await fetch('/api/auth/session', {
              headers: {
                Authorization: `Bearer ${token}`,
              },
              credentials: 'include',
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            console.log('Authentication response status:', response.status);

            if (response.ok) {
              const userData = await response.json();
              console.log(
                '✅ AUTH WRAPPER: Authentication successful for user:',
                userData.username
              );
              if (userData.username !== 'anonymous' && userData.id > 0) {
                setIsAuthenticated(true);
              } else {
                console.log(
                  '⚠️ AUTH WRAPPER: Invalid user data, clearing tokens'
                );
                // Only clear on provably invalid user data, not on network errors
                localStorage.removeItem('sessionToken');
                localStorage.removeItem('jwtToken');
                setIsAuthenticated(false);
              }
            } else if (response.status === 401 || response.status === 403) {
              // Definitive auth failure — token is invalid or expired
              console.warn(
                `[AUTH WRAPPER] Session rejected with ${response.status} — clearing tokens`
              );
              localStorage.removeItem('sessionToken');
              localStorage.removeItem('jwtToken');
              setIsAuthenticated(false);
            } else {
              // 5xx or unexpected status — transient server error
              // Do NOT clear tokens; leave them so the next page load can retry
              console.warn(
                `[AUTH WRAPPER] Session check returned ${response.status} (transient) — keeping tokens`
              );
              setIsAuthenticated(false);
            }
          } catch (fetchError: any) {
            clearTimeout(timeoutId);

            if (fetchError.name === 'AbortError') {
              console.warn(
                '[AUTH WRAPPER] Session check timed out — keeping tokens for next attempt'
              );
            } else {
              console.warn(
                '[AUTH WRAPPER] Network error during session check — keeping tokens:',
                fetchError.message
              );
            }
            // Network / timeout errors are transient — do NOT clear tokens
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

  if (isDeploymentEnvironment() && !isAuthenticated) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
