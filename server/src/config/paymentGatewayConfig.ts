/**
 * Payment Gateway Configuration
 * Centralizes payment gateway selection and settings
 */

export interface PaymentGatewayConfig {
  primaryGateway: 'authorize_net' | 'accept_blue';
  fallbackGateway?: 'authorize_net' | 'accept_blue';
  testMode: boolean;
  authorizeNet: {
    enabled: boolean;
    hasCredentials: boolean;
  };
  acceptBlue: {
    enabled: boolean;
    hasCredentials: boolean;
  };
}

/**
 * Get current payment gateway configuration
 */
export function getPaymentGatewayConfig(): PaymentGatewayConfig {
  const isTestMode = process.env.NODE_ENV !== 'production';
  
  // Check for credentials
  const hasAuthorizeNetCredentials = !!(
    process.env.AUTHORIZE_NET_API_LOGIN_ID && 
    process.env.AUTHORIZE_NET_TRANSACTION_KEY
  );
  
  const hasAcceptBlueCredentials = !!(
    process.env.ACCEPT_BLUE_API_KEY && 
    process.env.ACCEPT_BLUE_PIN
  );

  // Default configuration - prioritize Accept.blue if available
  let primaryGateway: 'authorize_net' | 'accept_blue' = 'authorize_net';
  let fallbackGateway: 'authorize_net' | 'accept_blue' | undefined = undefined;

  // Set primary gateway based on available credentials
  if (hasAcceptBlueCredentials) {
    primaryGateway = 'accept_blue';
    if (hasAuthorizeNetCredentials) {
      fallbackGateway = 'authorize_net';
    }
  } else if (hasAuthorizeNetCredentials) {
    primaryGateway = 'authorize_net';
  }

  // Check for explicit gateway override via environment variable
  const gatewayOverride = process.env.PAYMENT_GATEWAY_PRIMARY;
  if (gatewayOverride === 'accept_blue' && hasAcceptBlueCredentials) {
    primaryGateway = 'accept_blue';
    fallbackGateway = hasAuthorizeNetCredentials ? 'authorize_net' : undefined;
  } else if (gatewayOverride === 'authorize_net' && hasAuthorizeNetCredentials) {
    primaryGateway = 'authorize_net';
    fallbackGateway = hasAcceptBlueCredentials ? 'accept_blue' : undefined;
  }

  return {
    primaryGateway,
    fallbackGateway,
    testMode: isTestMode,
    authorizeNet: {
      enabled: hasAuthorizeNetCredentials,
      hasCredentials: hasAuthorizeNetCredentials
    },
    acceptBlue: {
      enabled: hasAcceptBlueCredentials,
      hasCredentials: hasAcceptBlueCredentials
    }
  };
}

/**
 * Log current gateway configuration
 */
export function logPaymentGatewayConfig(): void {
  const config = getPaymentGatewayConfig();
  
  console.log('💳 Payment Gateway Configuration:');
  console.log(`   Primary Gateway: ${config.primaryGateway.toUpperCase()}`);
  if (config.fallbackGateway) {
    console.log(`   Fallback Gateway: ${config.fallbackGateway.toUpperCase()}`);
  }
  console.log(`   Test Mode: ${config.testMode}`);
  console.log(`   Authorize.Net: ${config.authorizeNet.enabled ? 'Enabled' : 'Disabled'}`);
  console.log(`   Accept.blue: ${config.acceptBlue.enabled ? 'Enabled' : 'Disabled'}`);
  
  if (!config.authorizeNet.enabled && !config.acceptBlue.enabled) {
    console.warn('⚠️  No payment gateways are configured! Please set up API credentials.');
  }
}

/**
 * Get the appropriate gateway for a specific operation
 */
export function getGatewayForOperation(
  operation: 'payment' | 'refund' | 'void',
  preferredGateway?: 'authorize_net' | 'accept_blue'
): 'authorize_net' | 'accept_blue' | null {
  const config = getPaymentGatewayConfig();
  
  // If a specific gateway is requested and available, use it
  if (preferredGateway) {
    if (preferredGateway === 'accept_blue' && config.acceptBlue.enabled) {
      return 'accept_blue';
    }
    if (preferredGateway === 'authorize_net' && config.authorizeNet.enabled) {
      return 'authorize_net';
    }
  }
  
  // Use primary gateway if available
  if (config.primaryGateway === 'accept_blue' && config.acceptBlue.enabled) {
    return 'accept_blue';
  }
  if (config.primaryGateway === 'authorize_net' && config.authorizeNet.enabled) {
    return 'authorize_net';
  }
  
  // Use fallback gateway if primary is not available
  if (config.fallbackGateway === 'accept_blue' && config.acceptBlue.enabled) {
    return 'accept_blue';
  }
  if (config.fallbackGateway === 'authorize_net' && config.authorizeNet.enabled) {
    return 'authorize_net';
  }
  
  // No gateway available
  return null;
}