import { Router, type Request, type Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { authenticateToken } from '../../middleware/auth';
import { DatabaseStorage } from '../../storage';
import crypto from 'crypto';

const router = Router();
const storage = new DatabaseStorage();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/oauth/google/callback`
  : 'http://localhost:5000/api/oauth/google/callback';

// Create OAuth2 client
const oauth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

// In-memory state store with expiration (5 minutes)
// In production, consider using Redis or database
interface StateData {
  userId: number;
  integrationType: string;
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

// Define scopes based on integration type
const INTEGRATION_SCOPES: Record<string, string[]> = {
  'google-gmail': [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
  ],
  'google-calendar': [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  'google-drive': [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file',
  ],
  'google-sheets': [
    'https://www.googleapis.com/auth/spreadsheets',
  ],
};

// Get all scopes for Google integrations
const getAllGoogleScopes = () => {
  const allScopes = new Set<string>();
  Object.values(INTEGRATION_SCOPES).forEach(scopes => {
    scopes.forEach(scope => allScopes.add(scope));
  });
  // Add OpenID scope for ID token (CRITICAL FIX)
  allScopes.add('openid');
  allScopes.add('https://www.googleapis.com/auth/userinfo.email');
  allScopes.add('https://www.googleapis.com/auth/userinfo.profile');
  return Array.from(allScopes);
};

// Initiate OAuth flow
router.get('/initiate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const integrationType = req.query.type as string || 'google-gmail';
    const userId = req.user!.id;

    // Generate cryptographically random state token (SECURITY FIX)
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state with user info and expiration (5 minutes)
    const expiresAt = Date.now() + (5 * 60 * 1000);
    stateStore.set(state, {
      userId,
      integrationType,
      expiresAt,
    });

    // Get all Google scopes to allow user to connect multiple services at once
    const scopes = getAllGoogleScopes();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Get refresh token
      scope: scopes,
      state, // Use cryptographically random state
      prompt: 'consent', // Force consent screen to get refresh token
    });

    res.json({ authUrl });
  } catch (error) {
    console.error('Error initiating OAuth:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
});

// OAuth callback handler
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query;

    // Log the callback for debugging
    console.log('OAuth callback received:', { 
      hasCode: !!code, 
      hasState: !!state, 
      error: error || 'none',
      query: req.query 
    });

    if (error) {
      console.error('OAuth error from Google:', error);
      return res.status(400).send(`OAuth error: ${error}`);
    }

    if (!code || !state) {
      console.error('Missing code or state in callback');
      return res.status(400).send('Missing code or state parameter');
    }

    // SECURITY FIX: Validate state token
    const stateData = stateStore.get(state as string);
    
    if (!stateData) {
      console.error('Invalid or expired state token');
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Error</title>
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
      return res.status(403).send('OAuth state has expired. Please try again.');
    }

    // Delete state token to prevent reuse (SECURITY FIX)
    stateStore.delete(state as string);

    const { userId, integrationType } = stateData;

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code as string);
    
    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    // Set credentials
    oauth2Client.setCredentials(tokens);

    let accountEmail: string | null = null;
    let accountName: string | null = null;

    // FUNCTIONALITY FIX: Handle ID token properly with fallback
    if (tokens.id_token) {
      try {
        const ticket = await oauth2Client.verifyIdToken({
          idToken: tokens.id_token,
          audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        accountEmail = payload?.email || null;
        accountName = payload?.name || null;
      } catch (error) {
        console.warn('Failed to verify ID token, falling back to People API:', error);
      }
    }

    // Fallback: Use Google People API if ID token is not available or failed
    if (!accountEmail) {
      try {
        const people = google.people({ version: 'v1', auth: oauth2Client });
        const profile = await people.people.get({
          resourceName: 'people/me',
          personFields: 'emailAddresses,names',
        });
        
        if (profile.data.emailAddresses && profile.data.emailAddresses.length > 0) {
          accountEmail = profile.data.emailAddresses[0].value || null;
        }
        if (profile.data.names && profile.data.names.length > 0) {
          accountName = profile.data.names[0].displayName || null;
        }
      } catch (peopleError) {
        console.error('Failed to fetch user info from People API:', peopleError);
        // Continue without user info rather than failing completely
      }
    }

    // Calculate token expiry
    const tokenExpiresAt = tokens.expiry_date 
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000); // Default to 1 hour

    // Save integration to database
    await storage.createOrUpdateUserIntegration({
      userId,
      integrationType,
      isConnected: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      tokenExpiresAt,
      accountEmail,
      accountName,
      lastSyncedAt: new Date(),
    });

    // Redirect back to settings page with success message
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Success</title>
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
            <h1>Successfully Connected!</h1>
            <p>Your Google account has been connected. You can now close this window.</p>
            <div class="countdown">Redirecting in <span id="counter">3</span> seconds...</div>
          </div>
          <script>
            let count = 3;
            const counter = document.getElementById('counter');
            const interval = setInterval(() => {
              count--;
              counter.textContent = count;
              if (count === 0) {
                clearInterval(interval);
                window.close();
                // If window.close() doesn't work (popup blockers), redirect
                setTimeout(() => {
                  window.location.href = '/settings';
                }, 100);
              }
            }, 1000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Error</title>
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
            <h1>Connection Failed</h1>
            <p>Failed to connect your Google account. Please try again.</p>
          </div>
        </body>
      </html>
    `);
  }
});

// Refresh access token
router.post('/refresh', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { integrationType } = req.body;

    if (!integrationType) {
      return res.status(400).json({ error: 'Integration type is required' });
    }

    // Get existing integration
    const integration = await storage.getUserIntegration(userId, integrationType);
    
    if (!integration || !integration.refreshToken) {
      return res.status(404).json({ error: 'Integration not found or no refresh token available' });
    }

    // Set credentials with refresh token
    oauth2Client.setCredentials({
      refresh_token: integration.refreshToken,
    });

    // Refresh the access token
    const { credentials } = await oauth2Client.refreshAccessToken();

    // Update integration with new tokens
    const tokenExpiresAt = credentials.expiry_date 
      ? new Date(credentials.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    await storage.createOrUpdateUserIntegration({
      userId,
      integrationType,
      isConnected: true,
      accessToken: credentials.access_token!,
      refreshToken: credentials.refresh_token || integration.refreshToken,
      tokenExpiresAt,
      accountEmail: integration.accountEmail,
      accountName: integration.accountName,
      lastSyncedAt: new Date(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh access token' });
  }
});

export default router;
