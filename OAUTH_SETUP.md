# OAuth Integration Setup

This application supports OAuth-based integrations with Google and Microsoft services. To enable these integrations, you need to configure OAuth credentials.

## Required Environment Variables

Add these environment variables to your Replit Secrets or `.env` file:

### Google OAuth (for Gmail, Calendar, Drive, Sheets)

1. **Create a Google Cloud Project:**
   - Go to https://console.cloud.google.com/
   - Create a new project or select an existing one
   - Enable the required APIs (Gmail API, Calendar API, Drive API, Sheets API)

2. **Create OAuth 2.0 Credentials:**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Application type: "Web application"
   - Authorized redirect URIs: Add `https://your-replit-domain.repl.co/api/oauth/google/callback`

3. **Set Environment Variables:**
   ```
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

### Microsoft OAuth (for Outlook)

1. **Register an Azure AD Application:**
   - Go to https://portal.azure.com/
   - Navigate to "Azure Active Directory" > "App registrations"
   - Click "New registration"
   - Redirect URI: Add `https://your-replit-domain.repl.co/api/oauth/microsoft/callback`

2. **Configure API Permissions:**
   - Add the following Microsoft Graph permissions:
     - Mail.Read
     - Mail.Send
     - Calendars.Read
     - Calendars.ReadWrite
     - User.Read
     - offline_access

3. **Create Client Secret:**
   - Go to "Certificates & secrets"
   - Create a new client secret

4. **Set Environment Variables:**
   ```
   MICROSOFT_CLIENT_ID=your_microsoft_client_id
   MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
   ```

## How It Works

1. User clicks "Connect" button on the Settings page
2. A popup window opens with the OAuth provider's login page
3. User enters their credentials and grants permissions
4. OAuth provider redirects back to the application with an authorization code
5. Backend exchanges the code for access and refresh tokens
6. Tokens are securely stored in the database
7. Popup closes and the integration is marked as connected

## Testing

To test the OAuth flow:

1. Make sure the environment variables are set
2. Navigate to Settings page
3. Click "Connect" on any integration
4. A popup should appear asking you to sign in
5. After successful authentication, the popup closes and the integration shows as connected

## Security Notes

- Access tokens and refresh tokens are stored securely in the database
- OAuth state parameter is used for CSRF protection
- Tokens expire and should be refreshed as needed (refresh token implementation coming soon)
