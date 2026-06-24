import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

interface ActionAuthUser {
  id: number;
  username: string;
  role: string;
}

interface ActionAuthState {
  isAuthenticated: boolean;
  user: ActionAuthUser | null;
  token: string | null;
  expiresAt: Date | null;
}

const ACTION_TOKEN_KEY = 'epoch_action_token';
const ACTION_TOKEN_EXPIRY_KEY = 'epoch_action_token_expiry';
const ACTION_TOKEN_USER_KEY = 'epoch_action_token_user';
const ACTION_AUTH_KIOSK_ROUTES = [
  '/app/production/stations',
  '/production/timers',
  '/p2-traveler',
  '/p2-traveler-viewer',
  '/traveler',
  '/travelers',
];

function isActionAuthKioskRoute() {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return ACTION_AUTH_KIOSK_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}

function getStoredAuth(): ActionAuthState {
  try {
    const token = sessionStorage.getItem(ACTION_TOKEN_KEY);
    const expiryStr = sessionStorage.getItem(ACTION_TOKEN_EXPIRY_KEY);
    const userStr = sessionStorage.getItem(ACTION_TOKEN_USER_KEY);

    if (!token || !expiryStr) {
      return { isAuthenticated: false, user: null, token: null, expiresAt: null };
    }

    const expiresAt = new Date(expiryStr);
    if (expiresAt < new Date()) {
      sessionStorage.removeItem(ACTION_TOKEN_KEY);
      sessionStorage.removeItem(ACTION_TOKEN_EXPIRY_KEY);
      sessionStorage.removeItem(ACTION_TOKEN_USER_KEY);
      return { isAuthenticated: false, user: null, token: null, expiresAt: null };
    }

    const user = userStr ? JSON.parse(userStr) : null;
    return { isAuthenticated: true, user, token, expiresAt };
  } catch {
    return { isAuthenticated: false, user: null, token: null, expiresAt: null };
  }
}

function storeAuth(token: string, expiresAt: string, user: ActionAuthUser) {
  sessionStorage.setItem(ACTION_TOKEN_KEY, token);
  sessionStorage.setItem(ACTION_TOKEN_EXPIRY_KEY, expiresAt);
  sessionStorage.setItem(ACTION_TOKEN_USER_KEY, JSON.stringify(user));
}

function clearStoredAuth() {
  sessionStorage.removeItem(ACTION_TOKEN_KEY);
  sessionStorage.removeItem(ACTION_TOKEN_EXPIRY_KEY);
  sessionStorage.removeItem(ACTION_TOKEN_USER_KEY);
}

export function useActionAuth() {
  const [authState, setAuthState] = useState<ActionAuthState>(getStoredAuth);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [actionDescription, setActionDescription] = useState('perform this action');
  const pendingActionRef = useRef<(() => void) | null>(null);
  const authSuccessCloseRef = useRef(false);
  const skipWebSessionProbe = isActionAuthKioskRoute();

  const { data: sessionUser } = useQuery<ActionAuthUser | null>({
    queryKey: ['/api/auth/session'],
    enabled: !skipWebSessionProbe,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    const stored = getStoredAuth();
    setAuthState(stored);
  }, []);

  useEffect(() => {
    if (!authState.expiresAt) return;

    const timeUntilExpiry = authState.expiresAt.getTime() - Date.now();
    if (timeUntilExpiry <= 0) {
      clearStoredAuth();
      setAuthState({ isAuthenticated: false, user: null, token: null, expiresAt: null });
      return;
    }

    const timeout = setTimeout(() => {
      clearStoredAuth();
      setAuthState({ isAuthenticated: false, user: null, token: null, expiresAt: null });
    }, timeUntilExpiry);

    return () => clearTimeout(timeout);
  }, [authState.expiresAt]);

  useEffect(() => {
    if (authState.isAuthenticated && authState.token && pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      action();
    }
  }, [authState.isAuthenticated, authState.token]);

  const isAuthenticated = (!skipWebSessionProbe && !!sessionUser) || authState.isAuthenticated;
  const currentUser = skipWebSessionProbe ? authState.user : sessionUser || authState.user;

  const requireAuth = useCallback((action: () => void, actionDescription?: string) => {
    if (isAuthenticated) {
      action();
      return;
    }

    pendingActionRef.current = action;
    setActionDescription(actionDescription || 'perform this action');
    setShowAuthModal(true);
  }, [isAuthenticated]);

  const requireFreshAuth = useCallback((action: () => void, actionDescription?: string) => {
    clearStoredAuth();
    setAuthState({ isAuthenticated: false, user: null, token: null, expiresAt: null });
    pendingActionRef.current = action;
    setActionDescription(actionDescription || 'perform this action');
    setShowAuthModal(true);
  }, []);

  const handleAuthSuccess = useCallback((token: string, user: ActionAuthUser, expiresAt?: string) => {
    const expiry = expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString();
    storeAuth(token, expiry, user);
    authSuccessCloseRef.current = true;
    setAuthState({
      isAuthenticated: true,
      user,
      token,
      expiresAt: new Date(expiry),
    });
    setShowAuthModal(false);
  }, []);

  const handleAuthModalClose = useCallback(() => {
    setShowAuthModal(false);
    if (authSuccessCloseRef.current) {
      authSuccessCloseRef.current = false;
      return;
    }
    pendingActionRef.current = null;
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = authState.token || sessionStorage.getItem(ACTION_TOKEN_KEY);
    if (token) {
      return { 'X-Action-Token': token };
    }
    return {};
  }, [authState.token]);

  const logout = useCallback(() => {
    clearStoredAuth();
    setAuthState({ isAuthenticated: false, user: null, token: null, expiresAt: null });
  }, []);

  return {
    isAuthenticated,
    user: currentUser,
    actionToken: authState.token,
    showAuthModal,
    actionDescription,
    requireAuth,
    requireFreshAuth,
    handleAuthSuccess,
    handleAuthModalClose,
    getAuthHeaders,
    logout,
  };
}
