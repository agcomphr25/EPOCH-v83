import sgMail from '@sendgrid/mail';

let connectionSettings: any;

async function getCredentials() {
  const apiKey = process.env.SENDGRID_API_KEY;
  const email = process.env.SENDGRID_FROM_EMAIL || process.env.SENDGRID_FROM;
  const source = process.env.SENDGRID_FROM_EMAIL ? 'SENDGRID_FROM_EMAIL' : 'SENDGRID_FROM';

  console.log('🔍 SendGrid credentials check:', {
    hasApiKey: !!apiKey,
    hasFromEmail: !!email,
    nodeEnv: process.env.NODE_ENV,
  });
  console.log(`📧 SendGrid FROM email resolved from: ${source}`);

  if (!apiKey) {
    console.error('❌ SENDGRID_API_KEY is required');
    throw new Error('SENDGRID_API_KEY is required');
  }

  if (!email) {
    console.error('❌ SENDGRID_FROM_EMAIL or SENDGRID_FROM is required and must be a verified SendGrid sender');
    throw new Error('SENDGRID_FROM_EMAIL or SENDGRID_FROM is required and must be a verified SendGrid sender');
  }

  console.log('✅ SendGrid configured with sender:', email);
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
  
  // Validate sender email is explicitly configured
  if (!email) {
    throw new Error('SENDGRID_FROM_EMAIL or SENDGRID_FROM is required and must be a verified SendGrid sender');
  }
  
  sgMail.setApiKey(apiKey);
  
  const fromEmail = { email, name: 'A G Composites' };
  
  // Log resolved sender for debugging (on each send)
  console.log('📧 SendGrid sender resolved:', fromEmail.email);
  
  return {
    client: sgMail,
    fromEmail,
  };
}

export async function sendEmailViaSendGrid(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  fromName?: string;
  cc?: string | string[];
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
      from: options.fromName ? { ...fromEmail, name: options.fromName } : fromEmail,
      replyTo: options.replyTo || { email: 'laurie.tandy@agadvanced.com', name: 'Laurie Tandy' },
      subject: options.subject,
      text: options.text,
      html: options.html || options.text,
    };

    // Add CC recipients if provided
    if (Array.isArray(options.cc) ? options.cc.length > 0 : !!options.cc) {
      msg.cc = options.cc;
    }

    // Add attachments if provided
    if (options.attachments && options.attachments.length > 0) {
      msg.attachments = options.attachments;
    }

    console.log('📧 Sending email via SendGrid:', {
      to: options.to,
      cc: options.cc,
      from: fromEmail,
      replyTo: msg.replyTo,
      subject: options.subject,
      hasText: !!options.text,
      textLength: options.text?.length || 0,
      hasHTML: !!options.html,
      htmlLength: options.html?.length || 0,
      hasAttachments: !!options.attachments,
      attachmentCount: options.attachments?.length || 0,
    });

    // DIAGNOSTIC: Log runtime configuration before send
    console.log('[Email Debug] Provider: SendGrid');
    console.log('[Email Debug] From:', fromEmail.email);
    console.log('[Email Debug] Using Key:', process.env.SENDGRID_API_KEY ? 'present' : 'missing');
    console.log('[Compare] HealthCheck From vs Notification From');
    console.log('[Compare] Notification From:', fromEmail.email);
    console.log('[Compare] ENV SENDGRID_FROM_EMAIL:', process.env.SENDGRID_FROM_EMAIL || 'NOT SET');

    try {
      const [response] = await client.send(msg);

      console.log('✅ SendGrid response:', {
        statusCode: response.statusCode,
        messageId: response.headers['x-message-id'],
      });

      return {
        success: true,
        messageId: response.headers['x-message-id'] as string,
      };
    } catch (sendErr: any) {
      // DIAGNOSTIC: Capture and log full SendGrid error response
      console.error('[SendGrid Error Response]', sendErr?.response?.body || sendErr);
      console.error('[SendGrid Error Status]', sendErr?.code || sendErr?.response?.statusCode);
      
      const errorPayload = sendErr?.response?.body || { message: sendErr?.message || 'Unknown SendGrid error' };
      throw new Error('SENDGRID_FAIL:' + JSON.stringify(errorPayload));
    }
  } catch (error: any) {
    // Re-throw SENDGRID_FAIL errors to propagate details
    if (error?.message?.startsWith('SENDGRID_FAIL:')) {
      console.error('SendGrid send failed with details:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
    
    console.error('SendGrid error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
