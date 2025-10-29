import sgMail from '@sendgrid/mail';

let connectionSettings: any;

async function getCredentials() {
  // Always use environment variables for consistent behavior
  // This ensures dev and production work the same way
  console.log('🔍 SendGrid credentials check:', {
    hasEnvApiKey: !!process.env.SENDGRID_API_KEY,
    hasEnvFromEmail: !!process.env.SENDGRID_FROM_EMAIL,
    nodeEnv: process.env.NODE_ENV,
  });

  // Fallback to environment variables
  const apiKey = process.env.SENDGRID_API_KEY;
  const email = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !email) {
    console.error('❌ SendGrid not configured - missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL');
    throw new Error('SendGrid not configured. Please set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL environment variables.');
  }

  console.log('✅ Using SendGrid credentials from environment variables');
  return { apiKey, email };
}

// Legacy connector code (disabled for reliability)
async function getCredentialsViaConnector() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  // Try Replit connector if available
  if (xReplitToken && hostname) {
    try {
      const url = 'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid';
      console.log('📡 Fetching SendGrid connection from Replit connector:', url);

      connectionSettings = await fetch(url, {
        headers: {
          Accept: 'application/json',
          X_REPLIT_TOKEN: xReplitToken,
        },
      })
        .then((res) => res.json())
        .then((data: any) => {
          console.log('📥 SendGrid connection response:', data);
          return data.items?.[0];
        });

      console.log('🔐 Connector settings:', {
        exists: !!connectionSettings,
        hasApiKey: !!connectionSettings?.settings?.api_key,
        hasFromEmail: !!connectionSettings?.settings?.from_email,
      });

      if (
        connectionSettings &&
        connectionSettings.settings?.api_key &&
        connectionSettings.settings?.from_email
      ) {
        console.log('✅ Using SendGrid credentials from Replit connector');
        return {
          apiKey: connectionSettings.settings.api_key,
          email: connectionSettings.settings.from_email,
        };
      }
    } catch (error) {
      console.warn('⚠️ Failed to fetch from Replit connector:', error);
    }
  }
  
  throw new Error('Connector not configured');
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableSendGridClient() {
  const { apiKey, email } = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email,
  };
}

export async function sendEmailViaSendGrid(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    content: string;
    filename: string;
    type?: string;
    disposition?: string;
  }>;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();

    const msg: any = {
      to: options.to,
      from: fromEmail,
      subject: options.subject,
      text: options.text,
      html: options.html || options.text,
    };

    // Add attachments if provided
    if (options.attachments && options.attachments.length > 0) {
      msg.attachments = options.attachments;
    }

    console.log('📧 Sending email via SendGrid:', {
      to: options.to,
      subject: options.subject,
      hasText: !!options.text,
      textLength: options.text?.length || 0,
      hasHTML: !!options.html,
      htmlLength: options.html?.length || 0,
      hasAttachments: !!options.attachments,
      attachmentCount: options.attachments?.length || 0,
    });

    const [response] = await client.send(msg);

    return {
      success: true,
      messageId: response.headers['x-message-id'] as string,
    };
  } catch (error) {
    console.error('SendGrid error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
