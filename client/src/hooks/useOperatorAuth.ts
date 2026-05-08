/**
 * Phase 2 (Task #143) — operator session client hook.
 *
 * Owns the active operator session token for the shop-floor UI. The token
 * is stored in `sessionStorage` (NOT `localStorage`) so it dies with the
 * tab — a separate guarantee on top of the server-side absolute / idle
 * timeouts. The token is intentionally distinct from the web-user JWT;
 * shared tablets are typically logged in once per shift to a generic web
 * user, but every individual material draw is attributed to the operator
 * who scanned in here.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'epoch.operatorAuth.token';

export interface OperatorSession {
  id: string;
  employeeId: number;
  employeeDisplayName: string;
  authMethod: 'BADGE' | 'PIN' | 'SSO';
  workstationId: string | null;
  expiresAt: string;
  lastActivityAt: string;
  lastReauthAt: string;
  idleTimeoutSeconds: number;
  hasFreshReauth: boolean;
}

interface IssueResponse {
  token: string;
  session: OperatorSession;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data?.message ?? 'Operator auth failed'), {
      code: data?.error,
      status: res.status,
    });
  }
  return data as T;
}

export function useOperatorAuth(workstationId?: string) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(STORAGE_KEY);
  });
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate session metadata from the server when we restore a token from
  // sessionStorage on mount. If the server says it's no longer valid we
  // clear it so the UI prompts for a fresh scan.
  useEffect(() => {
    if (!token) {
      setSession(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/operator-auth/me?token=${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error('invalid');
        const data = await res.json();
        if (!cancelled) setSession(data.session);
      } catch {
        if (!cancelled) {
          window.sessionStorage.removeItem(STORAGE_KEY);
          setToken(null);
          setSession(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const persist = useCallback((next: IssueResponse) => {
    window.sessionStorage.setItem(STORAGE_KEY, next.token);
    setToken(next.token);
    setSession(next.session);
    setError(null);
  }, []);

  const signInWithBadge = useCallback(
    async (badgeCode: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await postJson<IssueResponse>('/api/operator-auth/badge', {
          badgeCode,
          workstationId: workstationId ?? null,
        });
        persist(data);
        return data.session;
      } catch (e: any) {
        setError(e?.message ?? 'Badge sign-in failed');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [persist, workstationId],
  );

  const signInWithPin = useCallback(
    async (employeeCode: string, pin: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await postJson<IssueResponse>('/api/operator-auth/pin', {
          employeeCode,
          pin,
          workstationId: workstationId ?? null,
        });
        persist(data);
        return data.session;
      } catch (e: any) {
        setError(e?.message ?? 'PIN sign-in failed');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [persist, workstationId],
  );

  /**
   * High-risk re-auth. Requires a FRESH credential (badge or PIN) so a
   * stolen token alone cannot satisfy the freshness check; the server
   * also verifies the credential resolves to the same employee on the
   * session.
   */
  const reauthenticate = useCallback(
    async (
      credential: { badgeCode: string } | { employeeCode: string; pin: string },
    ) => {
      if (!token) throw new Error('No operator session to re-authenticate');
      const data = await postJson<{ session: OperatorSession }>(
        '/api/operator-auth/reauth',
        { token, ...credential },
      );
      setSession(data.session);
      return data.session;
    },
    [token],
  );

  const signOut = useCallback(async () => {
    if (token) {
      try {
        await postJson('/api/operator-auth/revoke', { token, reason: 'operator_signout' });
      } catch {
        /* swallow — server-side revoke is best-effort on logout */
      }
    }
    window.sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setSession(null);
  }, [token]);

  return {
    token,
    session,
    loading,
    error,
    isAuthenticated: !!token && !!session,
    signInWithBadge,
    signInWithPin,
    reauthenticate,
    signOut,
  };
}
