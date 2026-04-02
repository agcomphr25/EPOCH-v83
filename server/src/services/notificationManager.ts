import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';
import { parse as parseCookie } from 'cookie';
import { AuthService } from '../../auth';

interface ConnectedClient {
  ws: WebSocket;
  userId: number;
  username: string;
}

interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  timestamp: string;
}

class NotificationManager {
  private clients: Map<number, Set<ConnectedClient>> = new Map();
  private wss: WebSocketServer | null = null;

  initialize(server: Server) {
    // Use noServer mode so the ws library does NOT attach its own upgrade
    // listener to the HTTP server.  When { server, path } is used, the ws
    // library calls abortHandshake(socket, 400) for every upgrade request
    // whose path doesn't match — including Vite's HMR WebSocket — which
    // crashes the Vite dev client and causes the Replit error overlay.
    // Instead, we listen for the 'upgrade' event ourselves and only hand off
    // connections that match /ws/notifications; everything else is ignored so
    // Vite (or any other handler registered first) can handle it.
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      const { pathname } = parseUrl(req.url ?? '');
      if (pathname !== '/ws/notifications') return; // let Vite HMR handle it
      this.wss!.handleUpgrade(req, socket as any, head, (ws) => {
        this.wss!.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      const user = await this.authenticateConnection(req);
      if (!user) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      const client: ConnectedClient = { ws, userId: user.id, username: user.username };

      if (!this.clients.has(user.id)) {
        this.clients.set(user.id, new Set());
      }
      this.clients.get(user.id)!.add(client);

      console.log(`🔔 WebSocket connected: user ${user.username} (${user.id}) — ${this.clients.get(user.id)!.size} tab(s)`);

      ws.on('pong', () => {});

      ws.on('close', () => {
        const userClients = this.clients.get(user.id);
        if (userClients) {
          userClients.delete(client);
          if (userClients.size === 0) {
            this.clients.delete(user.id);
          }
        }
        console.log(`🔔 WebSocket disconnected: user ${user.username} (${user.id})`);
      });

      ws.on('error', (err) => {
        console.error(`WebSocket error for user ${user.username}:`, err.message);
      });

      ws.send(JSON.stringify({ type: 'connected', message: 'Notification channel active' }));
    });

    const heartbeat = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30000);

    this.wss.on('close', () => clearInterval(heartbeat));

    console.log('🔔 WebSocket notification server initialized on /ws/notifications');
  }

  private async authenticateConnection(req: IncomingMessage): Promise<{ id: number; username: string } | null> {
    try {
      if (process.env.DEV_AUTH_BYPASS === 'true') {
        return { id: 2, username: 'admin' };
      }

      const url = parseUrl(req.url || '', true);
      const token = url.query.token as string | undefined;
      if (token) {
        const jwtPayload = AuthService.verifyJWT(token);
        if (jwtPayload) {
          const user = await AuthService.getUserById(jwtPayload.userId);
          if (user && user.isActive) {
            return { id: user.id, username: user.username };
          }
        }

        const sessionUser = await AuthService.getUserBySession(token);
        if (sessionUser) {
          return { id: sessionUser.id, username: sessionUser.username };
        }
      }

      const cookies = req.headers.cookie ? parseCookie(req.headers.cookie) : {};
      const sessionToken = cookies.sessionToken;
      if (sessionToken) {
        const user = await AuthService.getUserBySession(sessionToken);
        if (user) {
          return { id: user.id, username: user.username };
        }
      }

      return null;
    } catch (err) {
      console.error('WebSocket auth error:', err);
      return null;
    }
  }

  sendToUser(userId: number, notification: NotificationPayload) {
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.size === 0) return;

    const payload = JSON.stringify(notification);
    for (const client of userClients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  sendToUsers(userIds: number[], notification: NotificationPayload) {
    for (const userId of userIds) {
      this.sendToUser(userId, notification);
    }
  }

  broadcast(notification: NotificationPayload) {
    if (!this.wss) return;
    const payload = JSON.stringify(notification);
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  getConnectedUserIds(): number[] {
    return Array.from(this.clients.keys());
  }

  isUserOnline(userId: number): boolean {
    return this.clients.has(userId) && this.clients.get(userId)!.size > 0;
  }
}

export const notificationManager = new NotificationManager();
