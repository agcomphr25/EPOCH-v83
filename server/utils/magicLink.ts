import crypto from 'crypto';

import { nanoid } from 'nanoid';

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
 * SIGNATURE LINK CONTRACT: Hard-coded base URLs per environment
 * NO environment inference, NO APP_URL, NO PRODUCTION_DOMAIN
 * These are the ONLY valid base URLs for signature links
 */
const SIGNATURE_BASE_URLS: Record<'dev' | 'prod', string> = {
  dev: 'https://epoch-v8-glennj.replit.app',
  prod: 'https://agcompepoch.xyz',
};

/**
 * @deprecated Use SIGNATURE_BASE_URLS directly for signature links
 * This function is kept for non-signature magic link URLs only
 */
export function getAppBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.PRODUCTION_DOMAIN) return `https://${process.env.PRODUCTION_DOMAIN}`;
  if (process.env.REPLIT_DOMAINS) {
    const domain = process.env.REPLIT_DOMAINS.split(',')[0];
    return `https://${domain}`;
  }
  if (process.env.NODE_ENV === 'production') {
    const msg = '[FATAL] getAppBaseUrl: running in production but neither APP_URL nor PRODUCTION_DOMAIN is set. ' +
      'Vendor PO confirmation links would silently point to localhost. ' +
      'Set APP_URL or PRODUCTION_DOMAIN before deploying.';
    console.error(msg);
    throw new Error(msg);
  }
  return 'http://localhost:5000';
}

/**
 * Create a frontend vendor-confirm URL for a given token.
 * The frontend page loads PO details via a safe GET and only consumes the token on explicit POST.
 */
export function createVendorConfirmFrontendUrl(token: string): string {
  return `${getAppBaseUrl()}/vendor-confirm?token=${token}&purpose=vendor_po_confirmation`;
}

/**
 * @deprecated Use getAppBaseUrl() instead
 */
export function getMagicLinkBaseUrl(): string {
  return getAppBaseUrl();
}

/**
 * Generate a public signature ID for URL-safe identification
 * Format: sig_XXXXXXXX (8 uppercase alphanumeric characters)
 * This ID is safe to expose in URLs - contains no secrets
 */
export function generatePublicSignatureId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes confusing chars: I, O, 0, 1
  let id = 'sig_';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * SIGNATURE LINK CONTRACT: Single canonical function for generating signature URLs
 * This is the ONLY way signature URLs should be generated across the codebase.
 * 
 * FORMAT: {BASE_URL}/sign-order/{public_signature_id}
 * - NO query params
 * - NO secrets in URL
 * - Email-client safe (no URL mangling)
 * - REQUIRES explicit environment - THROWS if missing or invalid
 * 
 * @param publicSignatureId - The public_signature_id from followup_orders (NOT the secret token)
 * @param env - The environment ('dev' or 'prod') - REQUIRED, no defaults
 * @returns Full signature URL using path-based routing
 * @throws Error if env is missing or invalid
 */
export function createSignatureLink(publicSignatureId: string, env: 'dev' | 'prod'): string {
  if (!env || (env !== 'dev' && env !== 'prod')) {
    const errorMsg = `[SIGNATURE LINK INVARIANT VIOLATION] createSignatureLink called with invalid env: ${env}. Must be 'dev' or 'prod'.`;
    console.error(`🚨 ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  const baseUrl = SIGNATURE_BASE_URLS[env];
  if (!baseUrl) {
    const errorMsg = `[SIGNATURE LINK INVARIANT VIOLATION] No base URL configured for env: ${env}`;
    console.error(`🚨 ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  console.log(`🔗 [SIGNATURE LINK] Generated link for env=${env}: ${baseUrl}/sign-order/${publicSignatureId}`);
  return `${baseUrl}/sign-order/${publicSignatureId}`;
}

/**
 * @deprecated Legacy token-based links - use createSignatureLink with publicSignatureId and env instead
 */
export function createLegacySignatureLink(token: string, env: 'dev' | 'prod'): string {
  const baseUrl = SIGNATURE_BASE_URLS[env];
  if (!baseUrl) {
    throw new Error(`Invalid env for legacy signature link: ${env}`);
  }
  return `${baseUrl}/sign-order?token=${token}`;
}

/**
 * SIGNATURE LINK INVARIANT: Validate that the env used for link generation matches the followup order's stored environment
 * THROWS if there's a mismatch - silent mismatches are forbidden
 * 
 * @param followupOrderEnv - The environment stored on the followup order record
 * @param linkEnv - The environment being used to generate the signature link
 * @param orderId - Order ID for error logging
 * @throws Error if environments don't match
 */
export function validateSignatureLinkEnvironment(
  followupOrderEnv: string | null | undefined,
  linkEnv: 'dev' | 'prod',
  orderId: string
): void {
  const normalizedFollowupEnv = (followupOrderEnv || 'dev') as 'dev' | 'prod';
  
  if (normalizedFollowupEnv !== linkEnv) {
    const errorMsg = `[SIGNATURE LINK INVARIANT VIOLATION] Environment mismatch for order ${orderId}: ` +
      `followup order was created in '${normalizedFollowupEnv}' but attempting to generate link for '${linkEnv}'. ` +
      `This would result in a broken signature link. Operation blocked.`;
    console.error(`🚨 ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  console.log(`✅ [SIGNATURE LINK INVARIANT] Environment validated for ${orderId}: followupOrder=${normalizedFollowupEnv}, link=${linkEnv}`);
}

/**
 * SIGNATURE LINK CONTRACT: Get and validate APP_ENV
 * FAILS HARD if APP_ENV is not set - this is required for environment safety
 */
export function getRequiredAppEnv(): 'prod' | 'dev' {
  const appEnv = process.env.APP_ENV;
  if (!appEnv) {
    console.error('🚨 [FATAL] APP_ENV environment variable is not set. This is required for signature link safety.');
    throw new Error('APP_ENV environment variable is required but not set');
  }
  if (appEnv !== 'prod' && appEnv !== 'dev') {
    console.error(`🚨 [FATAL] APP_ENV must be 'prod' or 'dev', got: ${appEnv}`);
    throw new Error(`APP_ENV must be 'prod' or 'dev', got: ${appEnv}`);
  }
  return appEnv;
}

/**
 * Get current environment (prod or dev) for cross-environment safety
 * Uses APP_ENV strictly, falls back to NODE_ENV only if APP_ENV not set
 */
export function getCurrentEnvironment(): 'prod' | 'dev' {
  // Try APP_ENV first (strict mode)
  const appEnv = process.env.APP_ENV;
  if (appEnv === 'prod' || appEnv === 'dev') {
    return appEnv;
  }
  // Fallback to NODE_ENV for backwards compatibility
  return process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
}

/**
 * SIGNATURE LINK CONTRACT: Environment guard for signature emails
 * BLOCKS email send if order environment doesn't match current APP_ENV
 * Returns null if safe to send, or error object if blocked
 */
export interface EnvironmentGuardResult {
  blocked: true;
  orderId: string;
  signatureToken: string;
  orderEnvironment: string;
  currentEnvironment: string;
  recipient: string;
  reason: string;
}

export function checkEnvironmentGuard(params: {
  orderId: string;
  signatureToken: string;
  orderEnvironment: string | null | undefined;
  recipient: string;
}): EnvironmentGuardResult | null {
  const currentEnv = getCurrentEnvironment();
  const orderEnv = params.orderEnvironment || 'dev'; // Default to dev for legacy records
  
  if (orderEnv !== currentEnv) {
    const result: EnvironmentGuardResult = {
      blocked: true,
      orderId: params.orderId,
      signatureToken: params.signatureToken,
      orderEnvironment: orderEnv,
      currentEnvironment: currentEnv,
      recipient: params.recipient,
      reason: `Order was created in ${orderEnv} but server is running in ${currentEnv}. Blocking to prevent broken links.`,
    };
    console.error(`🚨 [CROSS-ENV BLOCK] ${result.reason} Order: ${result.orderId}, Token: ${result.signatureToken.substring(0, 8)}..., Recipient: ${result.recipient}`);
    return result;
  }
  return null; // Safe to send
}

/**
 * SIGNATURE LINK CONTRACT: Forensic logging for signature email sends
 * Must be called every time a signature email is sent
 */
export interface SignatureLinkForensicLog {
  orderId: string;
  signatureToken: string;
  environment: 'prod' | 'dev';
  fullUrl: string;
  context: 'initial' | 'resend' | 'reminder' | 'updated_order';
  recipient: string;
  timestamp: Date;
}

export function logSignatureEmailSend(data: Omit<SignatureLinkForensicLog, 'timestamp' | 'fullUrl'> & { publicSignatureId?: string }): SignatureLinkForensicLog {
  const fullUrl = createSignatureLink(data.publicSignatureId || data.signatureToken, data.environment);
  const log: SignatureLinkForensicLog = {
    ...data,
    fullUrl,
    timestamp: new Date(),
  };
  console.log(`📧 [SIGNATURE LINK FORENSICS] Order: ${log.orderId} | Token: ${log.signatureToken.substring(0, 8)}... | Env: ${log.environment} | Context: ${log.context} | Recipient: ${log.recipient} | URL: ${log.fullUrl}`);
  return log;
}

/**
 * Create a magic link URL with purpose parameter (legacy API routes)
 */
export function createMagicLinkUrl(token: string, purpose: string): string {
  return `${getAppBaseUrl()}/api/magic-link/verify?token=${token}&purpose=${purpose}`;
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
 * Peek at a magic link token — validates existence, expiry, and purpose WITHOUT consuming it.
 * Safe to call on every GET request even if email scanners pre-fetch the URL.
 * Returns a specific errorCode field so callers can render distinct error states.
 */
export async function peekMagicLink(
  token: string,
  purpose?: string
): Promise<MagicLinkValidationResult & { errorCode?: string }> {
  const { storage } = await import('../storage.js');
  const tokenPrefix = token.substring(0, 8);

  try {
    const tokenHash = hashToken(token);
    const magicToken = await storage.getMagicLinkToken(tokenHash);

    if (!magicToken) {
      console.log(`[peekMagicLink] TOKEN_NOT_FOUND token=${tokenPrefix}...`);
      return { isValid: false, error: 'Invalid or expired token', errorCode: 'TOKEN_NOT_FOUND' };
    }

    if (magicToken.usedAt) {
      console.log(`[peekMagicLink] TOKEN_ALREADY_USED token=${tokenPrefix}... usedAt=${magicToken.usedAt}`);
      return { isValid: false, error: 'This link has already been used', errorCode: 'TOKEN_ALREADY_USED' };
    }

    if (new Date() > new Date(magicToken.expiresAt)) {
      console.log(`[peekMagicLink] TOKEN_EXPIRED token=${tokenPrefix}... expiresAt=${magicToken.expiresAt}`);
      return { isValid: false, error: 'This link has expired', errorCode: 'TOKEN_EXPIRED' };
    }

    if (purpose && magicToken.purpose !== purpose) {
      console.log(`[peekMagicLink] TOKEN_NOT_FOUND (purpose mismatch) token=${tokenPrefix}... expected=${purpose} got=${magicToken.purpose}`);
      return { isValid: false, error: 'Invalid token purpose', errorCode: 'TOKEN_NOT_FOUND' };
    }

    console.log(`[peekMagicLink] valid token=${tokenPrefix}... purpose=${magicToken.purpose}`);
    return { isValid: true, token: magicToken };
  } catch (error) {
    console.error('[peekMagicLink] error:', error);
    return { isValid: false, error: 'Validation failed', errorCode: 'TOKEN_NOT_FOUND' };
  }
}

/**
 * Validate and consume a magic link token
 * SECURITY: Compares hashed version of token
 */
export async function validateMagicLink(
  token: string,
  purpose?: string
): Promise<MagicLinkValidationResult & { errorCode?: string }> {
  const { storage } = await import('../storage.js');
  const tokenPrefix = token.substring(0, 8);

  try {
    const tokenHash = hashToken(token);
    const magicToken = await storage.getMagicLinkToken(tokenHash);

    if (!magicToken) {
      console.log(`[validateMagicLink] TOKEN_NOT_FOUND token=${tokenPrefix}...`);
      return { isValid: false, error: 'Invalid or expired token', errorCode: 'TOKEN_NOT_FOUND' };
    }

    // Check if already used
    if (magicToken.usedAt) {
      console.log(`[validateMagicLink] TOKEN_ALREADY_USED token=${tokenPrefix}... usedAt=${magicToken.usedAt}`);
      return { isValid: false, error: 'This link has already been used', errorCode: 'TOKEN_ALREADY_USED' };
    }

    // Check if expired
    if (new Date() > new Date(magicToken.expiresAt)) {
      console.log(`[validateMagicLink] TOKEN_EXPIRED token=${tokenPrefix}... expiresAt=${magicToken.expiresAt}`);
      return { isValid: false, error: 'This link has expired', errorCode: 'TOKEN_EXPIRED' };
    }

    // Check purpose if provided
    if (purpose && magicToken.purpose !== purpose) {
      console.log(`[validateMagicLink] TOKEN_NOT_FOUND (purpose mismatch) token=${tokenPrefix}... expected=${purpose} got=${magicToken.purpose}`);
      return { isValid: false, error: 'Invalid token purpose', errorCode: 'TOKEN_NOT_FOUND' };
    }

    // Mark as used (using the hash)
    await storage.markMagicLinkTokenAsUsed(tokenHash);
    console.log(`[validateMagicLink] consumed token=${tokenPrefix}... purpose=${magicToken.purpose}`);

    return { isValid: true, token: magicToken };
  } catch (error) {
    console.error('[validateMagicLink] error:', error);
    return { isValid: false, error: 'Validation failed', errorCode: 'TOKEN_NOT_FOUND' };
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
      const errorData = await response.json() as { error?: string };
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
