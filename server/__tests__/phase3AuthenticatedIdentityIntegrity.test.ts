import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const identityConsumers = [
  'client/src/components/Navigation.tsx',
  'client/src/components/auth/ProtectedRoute.tsx',
  'client/src/components/auth/RouteGuard.tsx',
];

describe('Phase 3 authenticated identity integrity', () => {
  it.each(identityConsumers)(
    '%s rehydrates from the authoritative session and never invents a localhost admin',
    (relativePath) => {
      const source = read(relativePath);

      expect(source).toContain("fetch('/api/auth/session'");
      expect(source).toContain("credentials: 'include'");
      expect(source).not.toMatch(
        /hostname\.(?:includes|endsWith)\([^)]*(?:localhost|127\.0\.0\.1|replit\.dev)/
      );
      expect(source).not.toMatch(
        /return\s*\{[^}]*username:\s*['"]admin['"][^}]*role:\s*['"]ADMIN['"]/s
      );
      expect(source).not.toContain("localStorage.getItem('dev_username')");
    }
  );

  it('login replaces cached identity only with the authenticated server response', () => {
    const source = read('client/src/pages/LoginPage.tsx');

    expect(source).not.toContain("localStorage.setItem('dev_username'");
    expect(source).not.toContain("localStorage.setItem('dev_user_role'");
    expect(source).toContain(
      "queryClient.removeQueries({ queryKey: ['currentUser'] })"
    );
    expect(source).toContain(
      "queryClient.removeQueries({ queryKey: ['/api/permissions/me'] })"
    );
    expect(source).toContain(
      "queryClient.setQueryData(['currentUser'], data.user)"
    );
    expect(source).toContain(
      "queryClient.setQueryData(['currentUser'], sessionData)"
    );
  });

  it('logout clears server session state and both identity caches', () => {
    const source = read('client/src/components/Navigation.tsx');

    expect(source).toContain("fetch('/api/auth/logout'");
    expect(source).toContain(
      "queryClient.removeQueries({ queryKey: ['currentUser'] })"
    );
    expect(source).toContain(
      "queryClient.removeQueries({ queryKey: ['/api/permissions/me'] })"
    );
  });

  it('server current-user routes require a real active session unless bypass is explicitly enabled', () => {
    const source = read('server/src/routes/auth.ts');

    expect(source).toContain(
      "const bypassEnabled = process.env.DEV_AUTH_BYPASS === 'true'"
    );
    expect(source).toMatch(/session_token = \$1 AND is_active = true/);
    expect(source).toContain(
      "router.get('/session', (req, res) => handleGetCurrentSession"
    );
    expect(source).toContain(
      "router.get('/me', (req, res) => handleGetCurrentSession"
    );
    expect(source).toContain('SELECT employee_id FROM users WHERE id = $1');
    expect(source).toContain('actor: { id: actorEmployeeId, username, role }');
    expect(source).toContain('payload: { userId, ...meta }');
  });

  it('validates session expiry and idle age in PostgreSQL time', () => {
    const source = read('server/auth.ts');

    expect(source).toContain('configuredIdleTimeoutMinutes > 0');
    expect(source).toContain("INTERVAL '1 minute'");
    expect(source).toContain(
      'COALESCE(${userSessions.lastActivityAt}, ${userSessions.createdAt}, NOW())'
    );
    expect(source).toContain('sql`${userSessions.expiresAt} > NOW()`');
    expect(source).not.toContain(
      'Date.now() - new Date(lastActivityAt).getTime()'
    );
  });
});
