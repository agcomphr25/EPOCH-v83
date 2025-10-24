import sgMail from '@sendgrid/mail';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  console.log('🔍 SendGrid credentials check:', {
    hostname: hostname ? 'set' : 'missing',
    hasToken: !!xReplitToken,
  });

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const url = 'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid';
  console.log('📡 Fetching SendGrid connection from:', url);

  connectionSettings = await fetch(url, {
    headers: {
      Accept: 'application/json',
      X_REPLIT_TOKEN: xReplitToken,
    },
  })
    .then((res) => res.json())
    .then((data) => {
      console.log('📥 SendGrid connection response:', data);
      return data.items?.[0];
    });

  console.log('🔐 Connection settings:', {
    exists: !!connectionSettings,
    hasApiKey: !!connectionSettings?.settings?.api_key,
    hasFromEmail: !!connectionSettings?.settings?.from_email,
  });

  if (
    !connectionSettings ||
    !connectionSettings.settings.api_key ||
    !connectionSettings.settings.from_email
  ) {
    console.error('❌ SendGrid connection incomplete:', connectionSettings);
    throw new Error('SendGrid not connected');
  }
  return {
    apiKey: connectionSettings.settings.api_key,
    email: connectionSettings.settings.from_email,
  };
}

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
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();

    const msg = {
      to: options.to,
      from: fromEmail,
      subject: options.subject,
      text: options.text,
      html: options.html || options.text,
    };

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
