import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { creditCardTransactions, payments, orderDrafts, allOrders } from '../../schema';
import { eq, and } from 'drizzle-orm';
import { getPaymentGatewayConfig, getGatewayForOperation } from '../config/paymentGatewayConfig';
import { createAcceptBlueClient } from '../lib/acceptBlueClient';
// @ts-ignore - AuthorizeNet doesn't have proper TypeScript definitions
import AuthorizeNet from 'authorizenet';

const router = Router();

// Unified payment request schema
const unifiedPaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
  card: z.object({
    number: z.string().min(13).max(19),
    expiryMonth: z.string().length(2),
    expiryYear: z.string().length(4),
    cvv: z.string().min(3).max(4),
    cardholderName: z.string().min(1)
  }),
  billing: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    company: z.string().optional(),
    address1: z.string().min(1),
    address2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(2),
    postalCode: z.string().min(5),
    country: z.string().default('US'),
    phone: z.string().optional(),
    email: z.string().email().optional()
  }),
  preferredGateway: z.enum(['authorize_net', 'accept_blue']).optional(),
  description: z.string().optional()
});

/**
 * Unified payment processing endpoint
 * POST /api/unified-payments/process
 */
router.post('/process', async (req, res) => {
  try {
    console.log('🔄 Unified payment processing request received');
    
    // Validate request
    const validationResult = unifiedPaymentSchema.safeParse(req.body);
    if (!validationResult.success) {
      console.error('❌ Payment validation failed:', validationResult.error.errors);
      return res.status(400).json({ 
        error: 'Invalid payment data', 
        details: validationResult.error.errors 
      });
    }

    const paymentData = validationResult.data;
    console.log(`💳 Processing payment for order ${paymentData.orderId}: $${paymentData.amount.toFixed(2)}`);

    // Check if order exists
    const [order] = await db
      .select()
      .from(orderDrafts)
      .where(eq(orderDrafts.orderId, paymentData.orderId))
      .limit(1);

    if (!order) {
      const [finalizedOrder] = await db
        .select()
        .from(allOrders)
        .where(eq(allOrders.orderId, paymentData.orderId))
        .limit(1);
      
      if (!finalizedOrder) {
        console.error(`❌ Order not found: ${paymentData.orderId}`);
        return res.status(404).json({ error: 'Order not found' });
      }
    }

    // Determine which gateway to use
    const gateway = getGatewayForOperation('payment', paymentData.preferredGateway);
    
    if (!gateway) {
      console.error('❌ No payment gateway available');
      return res.status(500).json({ 
        error: 'Payment processing not configured. Please contact support.' 
      });
    }

    console.log(`🏛️ Using payment gateway: ${gateway.toUpperCase()}`);

    let paymentResult;
    
    if (gateway === 'accept_blue') {
      paymentResult = await processAcceptBluePayment(paymentData);
    } else {
      paymentResult = await processAuthorizeNetPayment(paymentData);
    }

    if (paymentResult.success) {
      console.log(`✅ Payment successful via ${gateway}: ${paymentResult.transactionId}`);

      // Create payment record
      const [paymentRecord] = await db
        .insert(payments)
        .values({
          orderId: paymentData.orderId,
          paymentType: 'credit_card',
          paymentAmount: paymentData.amount,
          paymentDate: new Date(),
          notes: `${gateway.toUpperCase()} payment - Transaction ID: ${paymentResult.transactionId}`
        })
        .returning();

      // Create credit card transaction record
      await db.insert(creditCardTransactions).values({
        paymentId: paymentRecord.id,
        orderId: paymentData.orderId,
        transactionId: paymentResult.transactionId,
        gateway: gateway,
        authCode: paymentResult.authCode || '',
        responseCode: paymentResult.responseCode || '1',
        responseReasonCode: 'APPROVED',
        responseReasonText: paymentResult.message || 'Payment approved',
        avsResult: paymentResult.avsResult || '',
        cvvResult: paymentResult.cvvResult || '',
        cardType: detectCardType(paymentData.card.number),
        lastFourDigits: paymentData.card.number.slice(-4),
        amount: paymentData.amount,
        customerEmail: paymentData.billing.email || '',
        billingFirstName: paymentData.billing.firstName,
        billingLastName: paymentData.billing.lastName,
        billingAddress: paymentData.billing.address1,
        billingCity: paymentData.billing.city,
        billingState: paymentData.billing.state,
        billingZip: paymentData.billing.postalCode,
        billingCountry: paymentData.billing.country,
        isTest: process.env.NODE_ENV !== 'production',
        rawResponse: paymentResult.rawResponse,
        status: 'completed',
        processedAt: new Date()
      });

      res.json({
        success: true,
        gateway: gateway,
        transactionId: paymentResult.transactionId,
        authCode: paymentResult.authCode,
        message: paymentResult.message || 'Payment processed successfully',
        paymentId: paymentRecord.id
      });

    } else {
      console.error(`❌ Payment failed via ${gateway}:`, paymentResult.error);
      
      // Create failed payment record
      const [paymentRecord] = await db
        .insert(payments)
        .values({
          orderId: paymentData.orderId,
          paymentType: 'credit_card',
          paymentAmount: 0,
          paymentDate: new Date(),
          notes: `${gateway.toUpperCase()} payment failed: ${paymentResult.error}`
        })
        .returning();

      // Create failed transaction record
      await db.insert(creditCardTransactions).values({
        paymentId: paymentRecord.id,
        orderId: paymentData.orderId,
        transactionId: paymentResult.transactionId || 'FAILED_' + Date.now(),
        gateway: gateway,
        responseCode: '2',
        responseReasonText: paymentResult.error || 'Payment declined',
        cardType: detectCardType(paymentData.card.number),
        lastFourDigits: paymentData.card.number.slice(-4),
        amount: paymentData.amount,
        customerEmail: paymentData.billing.email || '',
        billingFirstName: paymentData.billing.firstName,
        billingLastName: paymentData.billing.lastName,
        billingAddress: paymentData.billing.address1,
        billingCity: paymentData.billing.city,
        billingState: paymentData.billing.state,
        billingZip: paymentData.billing.postalCode,
        billingCountry: paymentData.billing.country,
        isTest: process.env.NODE_ENV !== 'production',
        rawResponse: paymentResult.rawResponse,
        status: 'failed',
        processedAt: new Date()
      });

      res.status(400).json({
        success: false,
        gateway: gateway,
        error: paymentResult.error,
        paymentId: paymentRecord.id
      });
    }

  } catch (error: any) {
    console.error('❌ Unified payment processing error:', error);
    res.status(500).json({ 
      error: 'Payment processing failed', 
      details: error.message 
    });
  }
});

/**
 * Get payment gateway configuration
 * GET /api/unified-payments/config
 */
router.get('/config', async (req, res) => {
  try {
    const config = getPaymentGatewayConfig();
    
    res.json({
      success: true,
      config: {
        primaryGateway: config.primaryGateway,
        fallbackGateway: config.fallbackGateway,
        testMode: config.testMode,
        availableGateways: {
          authorize_net: config.authorizeNet.enabled,
          accept_blue: config.acceptBlue.enabled
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Gateway config error:', error);
    res.status(500).json({ 
      error: 'Failed to get gateway configuration', 
      details: error.message 
    });
  }
});

/**
 * Process payment using Accept.blue
 */
async function processAcceptBluePayment(paymentData: any) {
  try {
    const isTestMode = process.env.NODE_ENV !== 'production';
    const acceptBlueClient = createAcceptBlueClient(isTestMode);

    const amountInCents = Math.round(paymentData.amount * 100);

    const result = await acceptBlueClient.processPayment({
      amount: amountInCents,
      currency: 'USD',
      card: {
        number: paymentData.card.number,
        expiryMonth: paymentData.card.expiryMonth,
        expiryYear: paymentData.card.expiryYear,
        cvv: paymentData.card.cvv,
        cardholderName: paymentData.card.cardholderName
      },
      billing: paymentData.billing,
      description: paymentData.description || `Payment for order ${paymentData.orderId}`,
      orderId: paymentData.orderId
    });

    return result;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Accept.blue payment failed',
      rawResponse: error
    };
  }
}

/**
 * Process payment using Authorize.Net
 */
async function processAuthorizeNetPayment(paymentData: any) {
  try {
    const apiLoginId = process.env.AUTHORIZE_NET_API_LOGIN_ID;
    const transactionKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY;
    
    if (!apiLoginId || !transactionKey) {
      throw new Error('Authorize.Net credentials not configured');
    }

    const isTestMode = process.env.NODE_ENV !== 'production';
    const apiContracts = AuthorizeNet.APIContracts;
    const apiControllers = AuthorizeNet.APIControllers;

    // Create payment object
    const creditCard = new apiContracts.CreditCardType();
    creditCard.setCardNumber(paymentData.card.number);
    creditCard.setExpirationDate(paymentData.card.expiryMonth + paymentData.card.expiryYear);
    creditCard.setCardCode(paymentData.card.cvv);

    const paymentType = new apiContracts.PaymentType();
    paymentType.setCreditCard(creditCard);

    // Create billing address
    const billTo = new apiContracts.CustomerAddressType();
    billTo.setFirstName(paymentData.billing.firstName);
    billTo.setLastName(paymentData.billing.lastName);
    billTo.setAddress(paymentData.billing.address1);
    billTo.setCity(paymentData.billing.city);
    billTo.setState(paymentData.billing.state);
    billTo.setZip(paymentData.billing.postalCode);
    billTo.setCountry(paymentData.billing.country);

    // Create transaction
    const transactionRequest = new apiContracts.TransactionRequestType();
    transactionRequest.setTransactionType(apiContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
    transactionRequest.setPayment(paymentType);
    transactionRequest.setAmount(paymentData.amount);
    transactionRequest.setBillTo(billTo);

    const createRequest = new apiContracts.CreateTransactionRequest();
    createRequest.setMerchantAuthentication(createMerchantAuth(apiLoginId, transactionKey));
    createRequest.setTransactionRequest(transactionRequest);

    console.log('🌐 Setting up Authorize.Net controller, test mode:', isTestMode);
    const ctrl = new apiControllers.CreateTransactionController(createRequest.getJSON());
    
    if (isTestMode) {
      ctrl.setEnvironment('https://apitest.authorize.net/xml/v1/request.api');
    }

    return new Promise((resolve) => {
      ctrl.execute(() => {
        const apiResponse = ctrl.getResponse();
        const response = new apiContracts.CreateTransactionResponse(apiResponse);
        
        if (response.getMessages().getResultCode() === apiContracts.MessageTypeEnum.OK) {
          const transactionResponse = response.getTransactionResponse();
          
          resolve({
            success: true,
            transactionId: transactionResponse.getTransId(),
            authCode: transactionResponse.getAuthCode(),
            responseCode: transactionResponse.getResponseCode(),
            message: 'Payment processed successfully',
            avsResult: transactionResponse.getAvsResultCode(),
            cvvResult: transactionResponse.getCvvResultCode(),
            rawResponse: apiResponse
          });
        } else {
          const errorMessages = response.getMessages().getMessage();
          const errorMessage = errorMessages.length > 0 ? errorMessages[0].getText() : 'Payment failed';
          
          resolve({
            success: false,
            error: errorMessage,
            rawResponse: apiResponse
          });
        }
      });
    });

  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Authorize.Net payment failed',
      rawResponse: error
    };
  }
}

/**
 * Create Authorize.Net merchant authentication
 */
function createMerchantAuth(apiLoginId: string, transactionKey: string) {
  const apiContracts = AuthorizeNet.APIContracts;
  const merchantAuthenticationType = new apiContracts.MerchantAuthenticationType();
  merchantAuthenticationType.setName(apiLoginId);
  merchantAuthenticationType.setTransactionKey(transactionKey);
  return merchantAuthenticationType;
}

/**
 * Detect card type from number
 */
function detectCardType(cardNumber: string): string {
  const number = cardNumber.replace(/\s/g, '');
  
  if (/^4/.test(number)) return 'Visa';
  if (/^5[1-5]/.test(number)) return 'MasterCard';
  if (/^3[47]/.test(number)) return 'American Express';
  if (/^6(?:011|5)/.test(number)) return 'Discover';
  if (/^(?:2131|1800|35\d{3})\d{11}$/.test(number)) return 'JCB';
  
  return 'Unknown';
}

export default router;