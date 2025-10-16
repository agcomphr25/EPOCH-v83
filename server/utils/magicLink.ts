import { nanoid } from 'nanoid';
import crypto from 'crypto';

export interface MagicLinkOptions {
  email: string;
  purpose: string;
  metadata?: Record<string, any>;
  expiresInMinutes?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface SendMagicLinkOptions extends MagicLinkOptions {
  subject?: string;
  message?: string;
  buttonText?: string;
  customTemplate?: (
    link: string,
    data: MagicLinkOptions
  ) => { subject: string; html: string; text: string };
}

export interface MagicLinkValidationResult {
  isValid: boolean;
  token?: any;
  error?: string;
}

/**
 * Generate a secure magic link token
 */
export function generateMagicLinkToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash a token for secure storage using SHA-256
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Get the base URL for magic links
 */
export function getMagicLinkBaseUrl(): string {
  if (process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    return `https://${domains[0]}`;
  }
  return process.env.NODE_ENV === 'production'
    ? process.env.APP_URL || 'https://your-app.com'
    : 'http://localhost:5000';
}

/**
 * Create a magic link URL
 */
export function createMagicLinkUrl(token: string, purpose: string): string {
  const baseUrl = getMagicLinkBaseUrl();
  return `${baseUrl}/api/magic-link/verify?token=${token}&purpose=${purpose}`;
}

/**
 * Generate and save a magic link token to the database
 * SECURITY: Token is hashed before storage using SHA-256
 */
export async function generateMagicLink(
  options: MagicLinkOptions
): Promise<{ token: string; link: string; expiresAt: Date }> {
  const { storage } = await import('../storage.js');

  const token = generateMagicLinkToken();
  const tokenHash = hashToken(token);
  const expiresInMinutes = options.expiresInMinutes || 30; // Default 30 minutes
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  await storage.createMagicLinkToken({
    token: tokenHash, // Store hashed token, not plaintext
    email: options.email,
    purpose: options.purpose,
    metadata: options.metadata || null,
    expiresAt,
    usedAt: null,
    ipAddress: options.ipAddress || null,
    userAgent: options.userAgent || null,
  });

  const link = createMagicLinkUrl(token, options.purpose);

  return { token, link, expiresAt };
}

/**
 * Validate and consume a magic link token
 * SECURITY: Compares hashed version of token
 */
export async function validateMagicLink(
  token: string,
  purpose?: string
): Promise<MagicLinkValidationResult> {
  const { storage } = await import('../storage.js');

  try {
    const tokenHash = hashToken(token);
    const magicToken = await storage.getMagicLinkToken(tokenHash);

    if (!magicToken) {
      return { isValid: false, error: 'Invalid or expired token' };
    }

    // Check if already used
    if (magicToken.usedAt) {
      return { isValid: false, error: 'This link has already been used' };
    }

    // Check if expired
    if (new Date() > new Date(magicToken.expiresAt)) {
      return { isValid: false, error: 'This link has expired' };
    }

    // Check purpose if provided
    if (purpose && magicToken.purpose !== purpose) {
      return { isValid: false, error: 'Invalid token purpose' };
    }

    // Mark as used (using the hash)
    await storage.markMagicLinkTokenAsUsed(tokenHash);

    return { isValid: true, token: magicToken };
  } catch (error) {
    console.error('Magic link validation error:', error);
    return { isValid: false, error: 'Validation failed' };
  }
}

/**
 * Clean up expired magic link tokens
 */
export async function cleanupExpiredMagicLinks(): Promise<number> {
  const { storage } = await import('../storage.js');
  return await storage.deleteExpiredMagicLinkTokens();
}

/**
 * Generate a default email template for magic links
 */
export function generateMagicLinkEmailTemplate(
  link: string,
  options: SendMagicLinkOptions
): { subject: string; html: string; text: string } {
  const { purpose, metadata } = options;

  let subject = options.subject || `Your secure link - AG Composites`;
  let buttonText = options.buttonText || 'Click Here to Continue';
  let heading = 'Secure Access Link';
  let description =
    'Click the button below to continue. This link will expire in 30 minutes for your security.';

  // Customize based on purpose
  switch (purpose) {
    case 'login':
      subject = 'Your Login Link - AG Composites';
      heading = 'Sign In to Your Account';
      description =
        'Click the button below to securely sign in. This link will expire in 30 minutes.';
      buttonText = 'Sign In Now';
      break;
    case 'order_confirmation':
      subject = `Confirm Your Order ${metadata?.orderId || ''} - AG Composites`;
      heading = 'Confirm Your Order';
      description = `Please confirm your order ${metadata?.orderId || ''}. This link will expire in 30 minutes.`;
      buttonText = 'Confirm Order';
      break;
    case 'password_reset':
      subject = 'Reset Your Password - AG Composites';
      heading = 'Reset Your Password';
      description =
        'Click the button below to reset your password. This link will expire in 30 minutes.';
      buttonText = 'Reset Password';
      break;
    case 'customer_action':
      subject = options.subject || 'Action Required - AG Composites';
      heading = options.subject || 'Action Required';
      description =
        options.message ||
        'Click the button below to complete your action. This link will expire in 30 minutes.';
      buttonText = options.buttonText || 'Take Action';
      break;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #1a1a1a;
      font-size: 24px;
      margin: 0;
    }
    .content {
      margin-bottom: 30px;
    }
    .button {
      display: inline-block;
      background-color: #0066cc;
      color: #ffffff;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 6px;
      font-weight: 600;
      text-align: center;
      margin: 20px 0;
    }
    .button:hover {
      background-color: #0052a3;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 14px;
      color: #666;
    }
    .warning {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 12px;
      margin: 20px 0;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${heading}</h1>
    </div>
    
    <div class="content">
      <p>Hello,</p>
      <p>${description}</p>
      
      <div style="text-align: center;">
        <a href="${link}" class="button">${buttonText}</a>
      </div>
      
      <div class="warning">
        <strong>Security Notice:</strong> This link is single-use and will expire in 30 minutes. If you didn't request this, please ignore this email.
      </div>
      
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #0066cc;">${link}</p>
    </div>
    
    <div class="footer">
      <p>
        <strong>AG Composites</strong><br>
        230 Hamer Road<br>
        Owens Cross Roads, AL 35763<br>
        Phone: 256-723-8381
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
${heading}

${description}

Click here to continue: ${link}

This link will expire in 30 minutes for your security.

If you didn't request this, please ignore this email.

---
AG Composites
230 Hamer Road
Owens Cross Roads, AL 35763
Phone: 256-723-8381
  `.trim();

  return { subject, html, text };
}

/**
 * Send a magic link via email
 */
export async function sendMagicLink(options: SendMagicLinkOptions): Promise<{
  success: boolean;
  link?: string;
  expiresAt?: Date;
  error?: string;
}> {
  try {
    // Generate the magic link
    const { link, expiresAt } = await generateMagicLink(options);

    // Generate email template
    const emailContent = options.customTemplate
      ? options.customTemplate(link, options)
      : generateMagicLinkEmailTemplate(link, options);

    // Send email via communications API
    const baseUrl =
      process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';
    const response = await fetch(`${baseUrl}/api/communications/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: options.email,
        subject: emailContent.subject,
        message: emailContent.text, // Plain text version
        html: emailContent.html, // HTML version
        customerId: options.metadata?.customerId,
        orderId: options.metadata?.orderId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to send email');
    }

    return {
      success: true,
      link,
      expiresAt,
    };
  } catch (error) {
    console.error('Failed to send magic link:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
