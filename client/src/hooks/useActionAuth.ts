import { useState, useCallback, useEffect } from 'react';
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
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const { data: sessionUser } = useQuery<ActionAuthUser | null>({
    queryKey: ['currentUser'],
    staleTime: 5 * 60 * 1000,
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

  const isAuthenticated = !!sessionUser || authState.isAuthenticated;
  const currentUser = sessionUser || authState.user;

  const requireAuth = useCallback((action: () => void, actionDescription?: string) => {
    if (isAuthenticated) {
      action();
      return;
    }

    setPendingAction(() => action);
    setShowAuthModal(true);
  }, [isAuthenticated]);

  const handleAuthSuccess = useCallback((token: string, user: ActionAuthUser, expiresAt?: string) => {
    const expiry = expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString();
    storeAuth(token, expiry, user);
    setAuthState({
      isAuthenticated: true,
      user,
      token,
      expiresAt: new Date(expiry),
    });

    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const handleAuthModalClose = useCallback(() => {
    setShowAuthModal(false);
    setPendingAction(null);
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (authState.token) {
      return { 'X-Action-Token': authState.token };
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
    requireAuth,
    handleAuthSuccess,
    handleAuthModalClose,
    getAuthHeaders,
    logout,
  };
}
