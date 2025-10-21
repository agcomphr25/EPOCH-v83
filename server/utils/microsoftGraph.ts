import axios from 'axios';

export interface MicrosoftGraphEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string; // Optional: specific sender email address
}

/**
 * Send email using Microsoft Graph API
 * Uses the existing Microsoft OAuth credentials (MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET)
 */
export async function sendEmailViaGraphAPI(
  options: MicrosoftGraphEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';

    if (!clientId || !clientSecret) {
      throw new Error('Microsoft credentials not configured');
    }

    // Get access token using client credentials flow
    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // Prepare email message
    const emailMessage = {
      message: {
        subject: options.subject,
        body: {
          contentType: options.html ? 'HTML' : 'Text',
          content: options.html || options.text,
        },
        toRecipients: [
          {
            emailAddress: {
              address: options.to,
            },
          },
        ],
      },
      saveToSentItems: 'true',
    };

    // Send email using Microsoft Graph API
    // Note: When using client credentials, you need to specify the user to send from
    const senderEmail = options.from || process.env.MICROSOFT_SENDER_EMAIL;
    
    if (!senderEmail) {
      throw new Error('Sender email not configured. Set MICROSOFT_SENDER_EMAIL environment variable.');
    }

    const sendResponse = await axios.post(
      `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`,
      emailMessage,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Microsoft Graph returns 202 Accepted for successful email sending
    if (sendResponse.status === 202) {
      return {
        success: true,
        messageId: sendResponse.headers['request-id'], // Graph API request ID
      };
    }

    return {
      success: false,
      error: 'Unexpected response from Microsoft Graph API',
    };
  } catch (error: any) {
    console.error('Microsoft Graph API error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Unknown error',
    };
  }
}

/**
 * Test Microsoft Graph API connection
 */
export async function testMicrosoftGraphConnection(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';

    if (!clientId || !clientSecret) {
      return {
        success: false,
        error: 'Microsoft credentials not configured',
      };
    }

    // Try to get an access token
    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (tokenResponse.data.access_token) {
      return { success: true };
    }

    return {
      success: false,
      error: 'Failed to obtain access token',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error_description || error.message,
    };
  }
}
