import { google } from 'googleapis';
import { DatabaseStorage } from '../../storage';

const storage = new DatabaseStorage();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

interface GmailClient {
  userId: number;
  client: any;
}

async function refreshTokenIfNeeded(userId: number, integration: any) {
  if (!integration.tokenExpiresAt || !integration.refreshToken) {
    return integration;
  }

  const expiryTime = new Date(integration.tokenExpiresAt).getTime();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiryTime - now > fiveMinutes) {
    return integration;
  }

  console.log('🔄 Refreshing Gmail access token for user', userId);

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: integration.refreshToken,
  });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();

    const tokenExpiresAt = credentials.expiry_date 
      ? new Date(credentials.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    await storage.createOrUpdateUserIntegration({
      userId,
      integrationType: 'google-gmail',
      isConnected: true,
      accessToken: credentials.access_token!,
      refreshToken: credentials.refresh_token || integration.refreshToken,
      tokenExpiresAt,
      accountEmail: integration.accountEmail,
      accountName: integration.accountName,
      lastSyncedAt: new Date(),
    });

    return {
      ...integration,
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token || integration.refreshToken,
      tokenExpiresAt,
    };
  } catch (error) {
    console.error('Failed to refresh Gmail token:', error);
    const errorData: any = { needsReauth: true };
    throw Object.assign(new Error('Gmail token expired. Please reconnect your account in Settings.'), errorData);
  }
}

export async function getGmailClient(userId: number): Promise<GmailClient> {
  let integration = await storage.getUserIntegration(userId, 'google-gmail');
  
  if (!integration || !integration.isConnected || !integration.accessToken) {
    const errorData: any = { needsReauth: true };
    throw Object.assign(new Error('Gmail not connected. Please connect your Gmail account in Settings.'), errorData);
  }

  integration = await refreshTokenIfNeeded(userId, integration);

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: integration!.accessToken,
    refresh_token: integration!.refreshToken || undefined,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  return {
    userId,
    client: gmail,
  };
}

export async function listMessages(userId: number, maxResults: number = 20, pageToken?: string) {
  const { client } = await getGmailClient(userId);
  
  const listResponse = await client.users.messages.list({
    userId: 'me',
    maxResults,
    pageToken,
  });

  // Fetch metadata for each message to get sender and subject
  if (listResponse.data.messages) {
    const messagesWithMetadata = await Promise.all(
      listResponse.data.messages.map(async (msg: any) => {
        const messageData = await client.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        return messageData.data;
      })
    );
    
    return {
      ...listResponse.data,
      messages: messagesWithMetadata,
    };
  }

  return listResponse.data;
}

export async function getMessage(userId: number, messageId: string) {
  const { client } = await getGmailClient(userId);
  
  const response = await client.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  return response.data;
}

export async function getAttachment(userId: number, messageId: string, attachmentId: string) {
  const { client } = await getGmailClient(userId);
  
  const response = await client.users.messages.attachments.get({
    userId: 'me',
    messageId: messageId,
    id: attachmentId,
  });

  return response.data;
}

export async function searchMessages(userId: number, query: string, maxResults: number = 20) {
  const { client } = await getGmailClient(userId);
  
  const listResponse = await client.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });

  // Fetch metadata for each message to get sender and subject
  if (listResponse.data.messages) {
    const messagesWithMetadata = await Promise.all(
      listResponse.data.messages.map(async (msg: any) => {
        const messageData = await client.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        return messageData.data;
      })
    );
    
    return {
      ...listResponse.data,
      messages: messagesWithMetadata,
    };
  }

  return listResponse.data;
}

export async function sendEmail(userId: number, to: string, subject: string, body: string, threadId?: string) {
  const { client } = await getGmailClient(userId);
  
  // Create the email in RFC 2822 format
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ].join('\n');

  // Encode to base64url
  const encodedEmail = Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const requestBody: any = {
    raw: encodedEmail,
  };

  if (threadId) {
    requestBody.threadId = threadId;
  }

  const response = await client.users.messages.send({
    userId: 'me',
    requestBody,
  });

  return response.data;
}
