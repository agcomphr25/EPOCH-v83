import { Router, type Request, type Response } from 'express';
import { ConfidentialClientApplication, type AuthorizationUrlRequest, type AuthorizationCodeRequest } from '@azure/msal-node';
import { pool } from '../../db';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const router = Router();

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

// Redirect URI - use production domain if available, fallback to dev domain
const REDIRECT_URI = process.env.PRODUCTION_DOMAIN
  ? `https://${process.env.PRODUCTION_DOMAIN}/api/auth/microsoft/callback`
  : process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/microsoft/callback`
    : 'https://agcompepoch.xyz/api/auth/microsoft/callback'; // Production domain

// Lazy initialize MSAL client only when needed and credentials are available
let msalClient: ConfidentialClientApplication | null = null;

function getMsalClient(): ConfidentialClientApplication {
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    throw new Error('Microsoft OAuth credentials are not configured. Please set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables.');
  }

  if (!msalClient) {
    const msalConfig = {
      auth: {
        clientId: MICROSOFT_CLIENT_ID,
        authority: 'https://login.microsoftonline.com/common',
        clientSecret: MICROSOFT_CLIENT_SECRET,
      },
    };
    msalClient = new ConfidentialClientApplication(msalConfig);
  }

  return msalClient;
}

// In-memory state store with expiration (5 minutes)
interface StateData {
  expiresAt: number;
}

const stateStore = new Map<string, StateData>();

// Cleanup expired states every minute
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(stateStore.entries());
  for (const [state, data] of entries) {
    if (data.expiresAt < now) {
      stateStore.delete(state);
    }
  }
}, 60000);

// Generate cryptographically secure session token
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Initiate Microsoft OAuth flow
router.get('/login', async (req: Request, res: Response) => {
  try {
    const client = getMsalClient();
    
    // Generate cryptographically random state token
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state with expiration (5 minutes)
    const expiresAt = Date.now() + (5 * 60 * 1000);
    stateStore.set(state, { expiresAt });

    const authCodeUrlParameters: AuthorizationUrlRequest = {
      scopes: ['user.read', 'openid', 'profile', 'email'],
      redirectUri: REDIRECT_URI,
      state,
    };

    const authUrl = await client.getAuthCodeUrl(authCodeUrlParameters);
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating Microsoft OAuth:', error);
    res.status(500).send('Failed to initiate Microsoft authentication');
  }
});

// OAuth callback handler
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send('Missing code or state parameter');
    }

    // Validate state token
    const stateData = stateStore.get(state as string);
    
    if (!stateData) {
      console.error('Invalid or expired state token');
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #f87171 0%, #dc2626 100%);
              }
              .container {
                background: white;
                padding: 3rem;
                border-radius: 1rem;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                text-align: center;
                max-width: 400px;
              }
              .error-icon {
                font-size: 4rem;
                margin-bottom: 1rem;
              }
              h1 {
                color: #dc2626;
                margin: 0 0 1rem 0;
              }
              p {
                color: #6b7280;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error-icon">⚠️</div>
              <h1>Security Error</h1>
              <p>Invalid or expired authentication session. Please try again.</p>
            </div>
          </body>
        </html>
      `);
    }

    // Check if state has expired
    if (stateData.expiresAt < Date.now()) {
      stateStore.delete(state as string);
      return res.status(403).send('Authentication state has expired. Please try again.');
    }

    // Delete state token to prevent reuse
    stateStore.delete(state as string);

    // Exchange code for tokens
    const tokenRequest: AuthorizationCodeRequest = {
      code: code as string,
      scopes: ['user.read', 'openid', 'profile', 'email'],
      redirectUri: REDIRECT_URI,
    };

    const client = getMsalClient();
    const response = await client.acquireTokenByCode(tokenRequest);

    if (!response || !response.account) {
      throw new Error('Failed to acquire token or account information');
    }

    const { account } = response;
    const email = account.username; // Microsoft account email
    const name = account.name || email;

    // Check if user exists in database by email
    let userResult = await pool.query(
      `SELECT id, username, email, role, is_active 
       FROM users 
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    let userId: number;
    let username: string;
    let role: string;

    if (userResult && userResult.length > 0) {
      // User exists
      const dbUser = userResult[0];
      
      if (!dbUser.is_active) {
        return res.status(401).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Account Inactive</title>
              <style>
                body {
                  font-family: system-ui, -apple-system, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #f87171 0%, #dc2626 100%);
                }
                .container {
                  background: white;
                  padding: 3rem;
                  border-radius: 1rem;
                  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                  text-align: center;
                  max-width: 400px;
                }
                .error-icon {
                  font-size: 4rem;
                  margin-bottom: 1rem;
                }
                h1 {
                  color: #dc2626;
                  margin: 0 0 1rem 0;
                }
                p {
                  color: #6b7280;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="error-icon">🚫</div>
                <h1>Account Inactive</h1>
                <p>Your account has been deactivated. Please contact your administrator.</p>
              </div>
            </body>
          </html>
        `);
      }

      userId = dbUser.id;
      username = dbUser.username;
      role = dbUser.role || 'EMPLOYEE';

      // Mark existing users as Microsoft-federated on first OAuth sign-in
      await pool.query(
        `UPDATE users SET auth_provider = 'microsoft' WHERE id = $1 AND (auth_provider IS NULL OR auth_provider != 'microsoft')`,
        [userId]
      );
    } else {
      // Auto-create user account for new Microsoft sign-ins
      const generatedUsername = email.split('@')[0];
      const randomPassword = crypto.randomBytes(32).toString('hex');
      // Using 12 salt rounds for security consistency
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      const insertResult = await pool.query(
        `INSERT INTO users (username, email, password_hash, role, is_active, auth_provider) 
         VALUES ($1, $2, $3, $4, true, 'microsoft') 
         RETURNING id, username, role`,
        [generatedUsername, email, passwordHash, 'EMPLOYEE']
      );

      if (!insertResult || insertResult.length === 0) {
        throw new Error('Failed to create user account');
      }

      const newUser = insertResult[0];
      userId = newUser.id;
      username = newUser.username;
      role = newUser.role;

      console.log('✅ Auto-created new user account:', username, email);
    }

    // Generate session token
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // ── Concurrent session enforcement (Microsoft OAuth) ─────────────────────
    // Keep newest (maxSessions - 1) existing sessions; deactivate oldest overflow.
    const oauthMaxSessionsByRole: Record<string, number> = { ADMIN: 1, OWNER: 1, EMPLOYEE: 1 };
    const oauthMaxSessions = oauthMaxSessionsByRole[role] ?? 1;
    const oauthExistingResult = await pool.query(
      `SELECT id FROM user_sessions WHERE user_id = $1 AND is_active = true AND expires_at > NOW() ORDER BY created_at ASC`,
      [userId]
    );
    const oauthExistingRows: Array<{ id: number }> = oauthExistingResult.rows ?? oauthExistingResult ?? [];
    const oauthAllowedToKeep = Math.max(0, oauthMaxSessions - 1);
    const oauthToDeactivate = oauthExistingRows.length > oauthAllowedToKeep
      ? oauthExistingRows.slice(0, oauthExistingRows.length - oauthAllowedToKeep)
      : [];
    for (const old of oauthToDeactivate) {
      await pool.query(`UPDATE user_sessions SET is_active = false WHERE id = $1`, [old.id]);
      await pool.query(
        `INSERT INTO audit_events (entity_type, entity_id, action, actor_id, actor_name, actor_role, meta, created_at)
         VALUES ('user_session', $1, 'SESSION_SUPERSEDED', $2, $3, $4, $5, NOW())`,
        [String(old.id), userId, username, role, JSON.stringify({ reason: 'Microsoft OAuth login exceeded concurrent session limit', maxSessions: oauthMaxSessions })]
      );
    }

    // Store session in database — OAuth login IS credential verification
    const oauthIpAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
    const oauthUserAgent = req.headers['user-agent'] || null;
    await pool.query(
      `INSERT INTO user_sessions (session_token, user_id, username, expires_at, is_active, ip_address, user_agent, last_credential_verified_at) 
       VALUES ($1, $2, $3, $4, true, $5, $6, NOW())
       ON CONFLICT (session_token) DO UPDATE 
       SET expires_at = $4, is_active = true, ip_address = $5, user_agent = $6, last_credential_verified_at = NOW()`,
      [sessionToken, userId, username, expiresAt, oauthIpAddress, oauthUserAgent]
    );

    console.log('✅ Microsoft OAuth session saved for user:', username, email);

    // Emit SESSION_CREATED audit event for Microsoft OAuth login
    {
      const oauthSessionRow = await pool.query(
        `SELECT id FROM user_sessions WHERE session_token = $1`,
        [sessionToken]
      );
      const oauthSessionId = oauthSessionRow.rows?.[0]?.id ?? oauthSessionRow[0]?.id;
      if (oauthSessionId) {
        try {
          await pool.query(
            `INSERT INTO audit_events (entity_type, entity_id, action, actor_id, actor_name, actor_role, meta, created_at)
             VALUES ('user_session', $1, 'SESSION_CREATED', $2, $3, $4, $5, NOW())`,
            [String(oauthSessionId), userId, username, role, JSON.stringify({ loginMethod: 'microsoft_oauth', email, expiresAt: expiresAt.toISOString() })]
          );
        } catch (auditErr) {
          console.error('[SessionAudit] Failed to emit SESSION_CREATED for Microsoft OAuth session', oauthSessionId, auditErr);
        }
      }
    }

    // Set HTTP-only cookie
    const isProduction =
      process.env.NODE_ENV === 'production' ||
      process.env.REPL_DEPLOYMENT === 'true' ||
      process.env.REPLIT_DEPLOYMENT === 'true';

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    };

    res.cookie('sessionToken', sessionToken, cookieOptions);

    // Redirect to dashboard with success
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Login Successful</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 3rem;
              border-radius: 1rem;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 400px;
            }
            .success-icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
            h1 {
              color: #10b981;
              margin: 0 0 1rem 0;
            }
            p {
              color: #6b7280;
              margin: 0 0 2rem 0;
            }
            .countdown {
              color: #9ca3af;
              font-size: 0.875rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✓</div>
            <h1>Welcome, ${name}!</h1>
            <p>You've successfully signed in with Microsoft.</p>
            <div class="countdown">Redirecting to dashboard in <span id="counter">2</span> seconds...</div>
          </div>
          <script>
            let count = 2;
            const counter = document.getElementById('counter');
            const interval = setInterval(() => {
              count--;
              counter.textContent = count;
              if (count === 0) {
                clearInterval(interval);
                window.location.href = '/dashboard';
              }
            }, 1000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error in Microsoft OAuth callback:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Login Error</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #f87171 0%, #dc2626 100%);
            }
            .container {
              background: white;
              padding: 3rem;
              border-radius: 1rem;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 400px;
            }
            .error-icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
            h1 {
              color: #dc2626;
              margin: 0 0 1rem 0;
            }
            p {
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">✗</div>
            <h1>Login Failed</h1>
            <p>Failed to sign in with Microsoft. Please try again or use your username and password.</p>
          </div>
        </body>
      </html>
    `);
  }
});

export default router;
