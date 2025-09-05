import axios, { AxiosInstance, AxiosResponse } from 'axios';

export interface AcceptBlueConfig {
  apiKey: string;
  pin: string;
  sandbox?: boolean;
}

export interface CardData {
  number: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  cardholderName?: string;
}

export interface BillingAddress {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface PaymentRequest {
  amount: number; // Amount in cents
  currency?: string;
  card?: CardData;
  token?: string; // For tokenized payments
  billing?: BillingAddress;
  description?: string;
  orderId?: string;
  customerReference?: string;
}

export interface RefundRequest {
  transactionId: string;
  amount?: number; // If not provided, full refund
  reason?: string;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  avsResult?: string;
  cvvResult?: string;
  message?: string;
  error?: string;
  rawResponse?: any;
}

export class AcceptBlueClient {
  private client: AxiosInstance;
  private config: AcceptBlueConfig;

  constructor(config: AcceptBlueConfig) {
    this.config = config;
    
    // Accept.blue API base URL (adjust if different)
    const baseURL = config.sandbox 
      ? 'https://sandbox-api.accept.blue/v1' 
      : 'https://api.accept.blue/v1';

    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'AG-Composites/1.0'
      }
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use((config) => {
      // Accept.blue uses Basic Auth with API Key and PIN
      const credentials = Buffer.from(`${this.config.apiKey}:${this.config.pin}`).toString('base64');
      config.headers.Authorization = `Basic ${credentials}`;
      return config;
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        console.log(`✅ Accept.blue API Success: ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status}`);
        return response;
      },
      (error) => {
        console.error(`❌ Accept.blue API Error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Process a payment transaction
   */
  async processPayment(paymentData: PaymentRequest): Promise<PaymentResponse> {
    try {
      console.log(`🔄 Processing Accept.blue payment for amount: $${(paymentData.amount / 100).toFixed(2)}`);
      
      const requestData = {
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        source: paymentData.token ? { token: paymentData.token } : {
          card: {
            number: paymentData.card?.number,
            exp_month: paymentData.card?.expiryMonth,
            exp_year: paymentData.card?.expiryYear,
            cvc: paymentData.card?.cvv,
            name: paymentData.card?.cardholderName
          }
        },
        billing: paymentData.billing,
        description: paymentData.description,
        metadata: {
          order_id: paymentData.orderId,
          customer_reference: paymentData.customerReference
        }
      };

      const response: AxiosResponse = await this.client.post('/charges', requestData);
      
      if (response.data.success || response.data.status === 'succeeded') {
        console.log(`✅ Accept.blue payment successful: ${response.data.id || response.data.transaction_id}`);
        return {
          success: true,
          transactionId: response.data.id || response.data.transaction_id,
          authCode: response.data.auth_code,
          avsResult: response.data.avs_result,
          cvvResult: response.data.cvv_result,
          message: response.data.message || 'Payment processed successfully',
          rawResponse: response.data
        };
      } else {
        console.error(`❌ Accept.blue payment failed:`, response.data);
        return {
          success: false,
          error: response.data.message || response.data.error || 'Payment failed',
          rawResponse: response.data
        };
      }
    } catch (error: any) {
      console.error(`❌ Accept.blue payment error:`, error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Payment processing failed',
        rawResponse: error.response?.data
      };
    }
  }

  /**
   * Process a refund
   */
  async processRefund(refundData: RefundRequest): Promise<PaymentResponse> {
    try {
      console.log(`🔄 Processing Accept.blue refund for transaction: ${refundData.transactionId}`);
      
      const requestData = {
        charge: refundData.transactionId,
        amount: refundData.amount, // If undefined, it will be a full refund
        reason: refundData.reason || 'requested_by_customer',
        metadata: {
          refund_reason: refundData.reason
        }
      };

      const response: AxiosResponse = await this.client.post('/refunds', requestData);
      
      if (response.data.success || response.data.status === 'succeeded') {
        console.log(`✅ Accept.blue refund successful: ${response.data.id}`);
        return {
          success: true,
          transactionId: response.data.id,
          message: response.data.message || 'Refund processed successfully',
          rawResponse: response.data
        };
      } else {
        console.error(`❌ Accept.blue refund failed:`, response.data);
        return {
          success: false,
          error: response.data.message || response.data.error || 'Refund failed',
          rawResponse: response.data
        };
      }
    } catch (error: any) {
      console.error(`❌ Accept.blue refund error:`, error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Refund processing failed',
        rawResponse: error.response?.data
      };
    }
  }

  /**
   * Tokenize a credit card for future use
   */
  async tokenizeCard(cardData: CardData, billing?: BillingAddress): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      console.log(`🔄 Tokenizing card ending in: ****${cardData.number.slice(-4)}`);
      
      const requestData = {
        card: {
          number: cardData.number,
          exp_month: cardData.expiryMonth,
          exp_year: cardData.expiryYear,
          cvc: cardData.cvv,
          name: cardData.cardholderName
        },
        billing: billing
      };

      const response: AxiosResponse = await this.client.post('/tokens', requestData);
      
      if (response.data.success || response.data.id) {
        console.log(`✅ Accept.blue tokenization successful: ${response.data.id}`);
        return {
          success: true,
          token: response.data.id
        };
      } else {
        console.error(`❌ Accept.blue tokenization failed:`, response.data);
        return {
          success: false,
          error: response.data.message || response.data.error || 'Tokenization failed'
        };
      }
    } catch (error: any) {
      console.error(`❌ Accept.blue tokenization error:`, error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Tokenization failed'
      };
    }
  }

  /**
   * Void a transaction
   */
  async voidTransaction(transactionId: string): Promise<PaymentResponse> {
    try {
      console.log(`🔄 Voiding Accept.blue transaction: ${transactionId}`);
      
      const response: AxiosResponse = await this.client.post(`/charges/${transactionId}/void`);
      
      if (response.data.success || response.data.status === 'voided') {
        console.log(`✅ Accept.blue void successful: ${transactionId}`);
        return {
          success: true,
          transactionId: transactionId,
          message: response.data.message || 'Transaction voided successfully',
          rawResponse: response.data
        };
      } else {
        console.error(`❌ Accept.blue void failed:`, response.data);
        return {
          success: false,
          error: response.data.message || response.data.error || 'Void failed',
          rawResponse: response.data
        };
      }
    } catch (error: any) {
      console.error(`❌ Accept.blue void error:`, error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Void processing failed',
        rawResponse: error.response?.data
      };
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(transactionId: string): Promise<{ success: boolean; transaction?: any; error?: string }> {
    try {
      console.log(`🔍 Retrieving Accept.blue transaction: ${transactionId}`);
      
      const response: AxiosResponse = await this.client.get(`/charges/${transactionId}`);
      
      if (response.data) {
        console.log(`✅ Accept.blue transaction retrieved: ${transactionId}`);
        return {
          success: true,
          transaction: response.data
        };
      } else {
        return {
          success: false,
          error: 'Transaction not found'
        };
      }
    } catch (error: any) {
      console.error(`❌ Accept.blue transaction retrieval error:`, error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to retrieve transaction'
      };
    }
  }
}

// Export a factory function to create the client
export function createAcceptBlueClient(sandbox: boolean = false): AcceptBlueClient {
  const apiKey = process.env.ACCEPT_BLUE_API_KEY;
  const pin = process.env.ACCEPT_BLUE_PIN;

  if (!apiKey || !pin) {
    throw new Error('Accept.blue credentials not configured. Please set ACCEPT_BLUE_API_KEY and ACCEPT_BLUE_PIN environment variables.');
  }

  return new AcceptBlueClient({
    apiKey,
    pin,
    sandbox
  });
}