/**
 * Centralized Notification Configuration
 * 
 * Single source of truth for all notification-related environment variables.
 * All notification code should import from this module instead of reading
 * process.env directly.
 */

// ============== TWILIO (SMS) ==============
export const getTwilioConfig = () => ({
  accountSid: process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_NUMBER || process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || '',
});

export const isTwilioConfigured = (): boolean => {
  const config = getTwilioConfig();
  return Boolean(config.accountSid && config.authToken && config.fromNumber);
};

// ============== SENDGRID (EMAIL) ==============
export const getSendGridConfig = () => ({
  apiKey: process.env.SENDGRID_API_KEY || '',
  fromEmail: process.env.SENDGRID_FROM_EMAIL || 'stacisales@agcomposites.com',
});

export const isSendGridConfigured = (): boolean => {
  const config = getSendGridConfig();
  return Boolean(config.apiKey && config.fromEmail);
};

// ============== COMBINED STATUS ==============
export const getNotificationStatus = () => ({
  sms: {
    enabled: isTwilioConfigured(),
    fromNumber: getTwilioConfig().fromNumber || 'NOT SET',
  },
  email: {
    enabled: isSendGridConfigured(),
    fromEmail: getSendGridConfig().fromEmail,
  },
});

// ============== LOGGING HELPER ==============
export const logNotificationConfig = (prefix: string = '📡') => {
  const status = getNotificationStatus();
  console.log(`${prefix} Notification Config:`, {
    sms: {
      enabled: status.sms.enabled ? '✔' : '❌',
      from: status.sms.fromNumber,
    },
    email: {
      enabled: status.email.enabled ? '✔' : '❌', 
      from: status.email.fromEmail,
    },
  });
};
