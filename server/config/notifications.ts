/**
 * Centralized Notification Configuration
 * 
 * Single source of truth for all notification-related environment variables.
 * All notification code should import from this module instead of reading
 * process.env directly.
 */

// ============== TWILIO (SMS) ==============
const firstPresentEnv = (entries) => {
  const found = entries.find(([, value]) => Boolean(value?.trim()));
  return {
    value: found?.[1]?.trim() || '',
    source: found?.[0] || null,
  };
};

export const getTwilioConfig = () => {
  const accountSid = firstPresentEnv([
    ['TWILIO_ACCOUNT_SID', process.env.TWILIO_ACCOUNT_SID],
    ['TWILIO_SID', process.env.TWILIO_SID],
  ]);
  const fromNumber = firstPresentEnv([
    ['TWILIO_FROM_NUMBER', process.env.TWILIO_FROM_NUMBER],
    ['TWILIO_NUMBER', process.env.TWILIO_NUMBER],
    ['TWILIO_PHONE_NUMBER', process.env.TWILIO_PHONE_NUMBER],
  ]);

  return {
    accountSid: accountSid.value,
    accountSidSource: accountSid.source,
    authToken: process.env.TWILIO_AUTH_TOKEN?.trim() || '',
    fromNumber: fromNumber.value,
    fromNumberSource: fromNumber.source,
  };
};

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
    accountSidSource: getTwilioConfig().accountSidSource || 'NOT SET',
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
      accountSidSource: status.sms.accountSidSource,
    },
    email: {
      enabled: status.email.enabled ? '✔' : '❌', 
      from: status.email.fromEmail,
    },
  });
};
