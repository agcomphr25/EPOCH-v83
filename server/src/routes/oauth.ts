import { Router, type Request, type Response } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { DatabaseStorage } from '../../storage';
import crypto from 'crypto';

const router = Router();
const storage = new DatabaseStorage();

// Store temporary OAuth state (in production, use Redis or similar)
const oauthStates = new Map<string, { userId: number; integrationType: string; timestamp: number }>();

// Clean up expired states (older than 10 minutes)
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(oauthStates.entries());
  for (const [state, data] of entries) {
    if (now - data.timestamp > 10 * 60 * 1000) {
      oauthStates.delete(state);
    }
  }
}, 60 * 1000);

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/api/oauth/google/callback`;

// Microsoft OAuth configuration
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_REDIRECT_URI = `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/api/oauth/microsoft/callback`;

// Initiate Google OAuth flow
router.get('/google/initiate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const integrationType = (req.query.type as string) || 'google-gmail';
    
    // Generate random state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    oauthStates.set(state, { userId, integrationType, timestamp: Date.now() });

    // Determine scopes based on integration type
    let scopes: string[] = [];
    if (integrationType === 'google-gmail') {
      scopes = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];
    } else if (integrationType === 'google-calendar') {
      scopes = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'];
    } else if (integrationType === 'google-drive') {
      scopes = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.readonly'];
    } else if (integrationType === 'google-sheets') {
      scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/spreadsheets.readonly'];
    }

    // Add email and profile scopes
    scopes.push('https://www.googleapis.com/auth/userinfo.email');
    scopes.push('https://www.googleapis.com/auth/userinfo.profile');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', GOOGLE_CLIENT_ID || '');
    authUrl.searchParams.append('redirect_uri', GOOGLE_REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', scopes.join(' '));
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent');

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Error initiating Google OAuth:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
});

// Google OAuth callback
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.send('<script>window.opener.postMessage({ error: "No authorization code received" }, "*"); window.close();</script>');
    }

    // Verify state
    const stateData = oauthStates.get(state as string);
    if (!stateData) {
      return res.send('<script>window.opener.postMessage({ error: "Invalid or expired state" }, "*"); window.close();</script>');
    }

    oauthStates.delete(state as string);

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: code as string,
        client_id: GOOGLE_CLIENT_ID || '',
        client_secret: GOOGLE_CLIENT_SECRET || '',
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json() as any;

    if (!tokenResponse.ok) {
      console.error('Token exchange error:', tokens);
      return res.send('<script>window.opener.postMessage({ error: "Failed to exchange authorization code" }, "*"); window.close();</script>');
    }

    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    const userInfo = await userInfoResponse.json() as any;

    // Save integration to database
    await storage.createOrUpdateUserIntegration({
      userId: stateData.userId,
      integrationType: stateData.integrationType,
      isConnected: true,
      accountEmail: userInfo.email,
      accountName: userInfo.name,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    });

    // Send success message to parent window and close popup
    res.send(`
      <script>
        window.opener.postMessage({ 
          success: true, 
          integrationType: "${stateData.integrationType}",
          accountEmail: "${userInfo.email}"
        }, "*");
        window.close();
      </script>
    `);
  } catch (error) {
    console.error('Error in Google OAuth callback:', error);
    res.send('<script>window.opener.postMessage({ error: "OAuth callback failed" }, "*"); window.close();</script>');
  }
});

// Initiate Microsoft OAuth flow
router.get('/microsoft/initiate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const integrationType = 'outlook';
    
    const state = crypto.randomBytes(32).toString('hex');
    oauthStates.set(state, { userId, integrationType, timestamp: Date.now() });

    const scopes = [
      'https://graph.microsoft.com/Mail.Read',
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/Calendars.Read',
      'https://graph.microsoft.com/Calendars.ReadWrite',
      'https://graph.microsoft.com/User.Read',
      'offline_access',
    ];

    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    authUrl.searchParams.append('client_id', MICROSOFT_CLIENT_ID || '');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', MICROSOFT_REDIRECT_URI);
    authUrl.searchParams.append('scope', scopes.join(' '));
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('response_mode', 'query');

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Error initiating Microsoft OAuth:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
});

// Microsoft OAuth callback
router.get('/microsoft/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.send('<script>window.opener.postMessage({ error: "No authorization code received" }, "*"); window.close();</script>');
    }

    const stateData = oauthStates.get(state as string);
    if (!stateData) {
      return res.send('<script>window.opener.postMessage({ error: "Invalid or expired state" }, "*"); window.close();</script>');
    }

    oauthStates.delete(state as string);

    // Exchange code for tokens
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID || '',
        client_secret: MICROSOFT_CLIENT_SECRET || '',
        code: code as string,
        redirect_uri: MICROSOFT_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json() as any;

    if (!tokenResponse.ok) {
      console.error('Token exchange error:', tokens);
      return res.send('<script>window.opener.postMessage({ error: "Failed to exchange authorization code" }, "*"); window.close();</script>');
    }

    // Get user info
    const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    const userInfo = await userInfoResponse.json() as any;

    // Save integration to database
    await storage.createOrUpdateUserIntegration({
      userId: stateData.userId,
      integrationType: stateData.integrationType,
      isConnected: true,
      accountEmail: userInfo.mail || userInfo.userPrincipalName,
      accountName: userInfo.displayName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    });

    res.send(`
      <script>
        window.opener.postMessage({ 
          success: true, 
          integrationType: "${stateData.integrationType}",
          accountEmail: "${userInfo.mail || userInfo.userPrincipalName}"
        }, "*");
        window.close();
      </script>
    `);
  } catch (error) {
    console.error('Error in Microsoft OAuth callback:', error);
    res.send('<script>window.opener.postMessage({ error: "OAuth callback failed" }, "*"); window.close();</script>');
  }
});

export default router;
