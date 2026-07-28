import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('startup readiness client integration', () => {
  it('routes login and badge login through readiness-aware fetching', () => {
    const login = source('client/src/pages/LoginPage.tsx');
    expect(login).toContain("fetchWhenServerReady('/api/auth/login'");
    expect(login).toContain("fetchWhenServerReady('/api/auth/badge-login'");
    expect(login).toContain('parseResponse<any>(response)');
    expect(login).not.toContain('const data = await response.json()');
  });

  it('uses readiness-aware fetching for shared API and query requests', () => {
    const queryClient = source('client/src/lib/queryClient.ts');
    expect(queryClient).toContain('fetchWhenServerReady(fullUrl, config)');
    expect(queryClient).toContain('fetchWhenServerReady(url, {');
    expect(queryClient).toContain('isDeployment ? 135000 : 120000');
  });

  it('waits for route readiness before opening the notification socket', () => {
    const websocket = source('client/src/hooks/useWebSocketNotifications.ts');
    const readinessIndex = websocket.indexOf('await waitForServerReady()');
    const socketIndex = websocket.indexOf('new WebSocket(wsUrl)');
    expect(readinessIndex).toBeGreaterThan(-1);
    expect(socketIndex).toBeGreaterThan(readinessIndex);
  });
});
