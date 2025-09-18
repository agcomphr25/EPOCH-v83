import { Router } from 'express';
import { z } from 'zod';
import { createAcceptBlueClient } from '../lib/acceptBlueClient';
import { db } from '../../db';
import { creditCardTransactions, payments, orderDrafts, allOrders } from '../../schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

// Request validation schemas
const paymentRequestSchema = z.object({
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
  description: z.string().optional(),
  customerReference: z.string().optional()
});

const refundRequestSchema = z.object({
  transactionId: z.string().min(1),
  amount: z.number().positive().optional(),
  reason: z.string().optional()
});

const voidRequestSchema = z.object({
  transactionId: z.string().min(1)
});

/**
 * Process a payment using Accept.blue
 * POST /api/accept-blue/process-payment
 */
router.post('/process-payment', async (req, res) => {
  try {
    console.log('🔄 Accept.blue payment processing request received');
    
    // Validate request
    const validationResult = paymentRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      console.error('❌ Accept.blue payment validation failed:', validationResult.error.errors);
      return res.status(400).json({ 
        error: 'Invalid payment data', 
        details: validationResult.error.errors 
      });
    }

    const paymentData = validationResult.data;
    console.log(`💳 Processing Accept.blue payment for order ${paymentData.orderId}: $${paymentData.amount.toFixed(2)}`);

    // Check if order exists
    const [order] = await db
      .select()
      .from(orderDrafts)
      .where(eq(orderDrafts.orderId, paymentData.orderId))
      .limit(1);

    if (!order) {
      // Try finalized orders table
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

    // Initialize Accept.blue client
    const isTestMode = process.env.NODE_ENV !== 'production';
    const acceptBlueClient = createAcceptBlueClient(isTestMode);

    // Convert amount to cents for Accept.blue API
    const amountInCents = Math.round(paymentData.amount * 100);

    // Process payment with Accept.blue
    const paymentResult = await acceptBlueClient.processPayment({
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
      orderId: paymentData.orderId,
      customerReference: paymentData.customerReference
    });

    if (paymentResult.success && paymentResult.transactionId) {
      console.log(`✅ Accept.blue payment successful: ${paymentResult.transactionId}`);

      // Create payment record
      const [paymentRecord] = await db
        .insert(payments)
        .values({
          orderId: paymentData.orderId,
          paymentType: 'credit_card',
          paymentAmount: paymentData.amount,
          paymentDate: new Date(),
          notes: `Accept.blue payment - Transaction ID: ${paymentResult.transactionId}`
        })
        .returning();

      // Create credit card transaction record
      await db.insert(creditCardTransactions).values({
        paymentId: paymentRecord.id,
        orderId: paymentData.orderId,
        transactionId: paymentResult.transactionId,
        gateway: 'accept_blue',
        authCode: paymentResult.authCode || '',
        responseCode: '1', // Success
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
        isTest: isTestMode,
        rawResponse: paymentResult.rawResponse,
        status: 'completed',
        processedAt: new Date()
      });

      res.json({
        success: true,
        transactionId: paymentResult.transactionId,
        authCode: paymentResult.authCode,
        message: paymentResult.message || 'Payment processed successfully',
        paymentId: paymentRecord.id
      });

    } else {
      console.error(`❌ Accept.blue payment failed:`, paymentResult.error);
      
      // Still create payment record for tracking
      const [paymentRecord] = await db
        .insert(payments)
        .values({
          orderId: paymentData.orderId,
          paymentType: 'credit_card',
          paymentAmount: 0, // Failed payment
          paymentDate: new Date(),
          notes: `Accept.blue payment failed: ${paymentResult.error}`
        })
        .returning();

      // Create failed transaction record
      await db.insert(creditCardTransactions).values({
        paymentId: paymentRecord.id,
        orderId: paymentData.orderId,
        transactionId: 'FAILED_' + Date.now(),
        gateway: 'accept_blue',
        responseCode: '2', // Declined
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
        isTest: isTestMode,
        rawResponse: paymentResult.rawResponse,
        status: 'failed',
        processedAt: new Date()
      });

      res.status(400).json({
        success: false,
        error: paymentResult.error,
        paymentId: paymentRecord.id
      });
    }

  } catch (error: any) {
    console.error('❌ Accept.blue payment processing error:', error);
    res.status(500).json({ 
      error: 'Payment processing failed', 
      details: error.message 
    });
  }
});

/**
 * Process a refund using Accept.blue
 * POST /api/accept-blue/refund
 */
router.post('/refund', async (req, res) => {
  try {
    console.log('🔄 Accept.blue refund processing request received');
    
    // Validate request
    const validationResult = refundRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      console.error('❌ Accept.blue refund validation failed:', validationResult.error.errors);
      return res.status(400).json({ 
        error: 'Invalid refund data', 
        details: validationResult.error.errors 
      });
    }

    const refundData = validationResult.data;
    console.log(`💰 Processing Accept.blue refund for transaction ${refundData.transactionId}`);

    // Get original transaction
    const [originalTransaction] = await db
      .select()
      .from(creditCardTransactions)
      .where(and(
        eq(creditCardTransactions.transactionId, refundData.transactionId),
        eq(creditCardTransactions.gateway, 'accept_blue')
      ))
      .limit(1);

    if (!originalTransaction) {
      console.error(`❌ Original Accept.blue transaction not found: ${refundData.transactionId}`);
      return res.status(404).json({ error: 'Original transaction not found' });
    }

    // Initialize Accept.blue client
    const isTestMode = process.env.NODE_ENV !== 'production';
    const acceptBlueClient = createAcceptBlueClient(isTestMode);

    // Process refund with Accept.blue
    const refundResult = await acceptBlueClient.processRefund({
      transactionId: refundData.transactionId,
      amount: refundData.amount ? Math.round(refundData.amount * 100) : undefined, // Convert to cents
      reason: refundData.reason
    });

    if (refundResult.success && refundResult.transactionId) {
      console.log(`✅ Accept.blue refund successful: ${refundResult.transactionId}`);

      // Update original transaction
      await db
        .update(creditCardTransactions)
        .set({
          status: 'refunded',
          refundedAmount: refundData.amount || originalTransaction.amount,
          refundedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(creditCardTransactions.id, originalTransaction.id));

      res.json({
        success: true,
        refundTransactionId: refundResult.transactionId,
        message: refundResult.message || 'Refund processed successfully',
        refundAmount: refundData.amount || originalTransaction.amount
      });

    } else {
      console.error(`❌ Accept.blue refund failed:`, refundResult.error);
      res.status(400).json({
        success: false,
        error: refundResult.error
      });
    }

  } catch (error: any) {
    console.error('❌ Accept.blue refund processing error:', error);
    res.status(500).json({ 
      error: 'Refund processing failed', 
      details: error.message 
    });
  }
});

/**
 * Void a transaction using Accept.blue
 * POST /api/accept-blue/void
 */
router.post('/void', async (req, res) => {
  try {
    console.log('🔄 Accept.blue void processing request received');
    
    // Validate request
    const validationResult = voidRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      console.error('❌ Accept.blue void validation failed:', validationResult.error.errors);
      return res.status(400).json({ 
        error: 'Invalid void data', 
        details: validationResult.error.errors 
      });
    }

    const voidData = validationResult.data;
    console.log(`🚫 Processing Accept.blue void for transaction ${voidData.transactionId}`);

    // Get original transaction
    const [originalTransaction] = await db
      .select()
      .from(creditCardTransactions)
      .where(and(
        eq(creditCardTransactions.transactionId, voidData.transactionId),
        eq(creditCardTransactions.gateway, 'accept_blue')
      ))
      .limit(1);

    if (!originalTransaction) {
      console.error(`❌ Original Accept.blue transaction not found: ${voidData.transactionId}`);
      return res.status(404).json({ error: 'Original transaction not found' });
    }

    // Initialize Accept.blue client
    const isTestMode = process.env.NODE_ENV !== 'production';
    const acceptBlueClient = createAcceptBlueClient(isTestMode);

    // Process void with Accept.blue
    const voidResult = await acceptBlueClient.voidTransaction(voidData.transactionId);

    if (voidResult.success) {
      console.log(`✅ Accept.blue void successful: ${voidData.transactionId}`);

      // Update original transaction
      await db
        .update(creditCardTransactions)
        .set({
          status: 'voided',
          voidedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(creditCardTransactions.id, originalTransaction.id));

      res.json({
        success: true,
        transactionId: voidData.transactionId,
        message: voidResult.message || 'Transaction voided successfully'
      });

    } else {
      console.error(`❌ Accept.blue void failed:`, voidResult.error);
      res.status(400).json({
        success: false,
        error: voidResult.error
      });
    }

  } catch (error: any) {
    console.error('❌ Accept.blue void processing error:', error);
    res.status(500).json({ 
      error: 'Void processing failed', 
      details: error.message 
    });
  }
});

/**
 * Get transaction details from Accept.blue
 * GET /api/accept-blue/transaction/:transactionId
 */
router.get('/transaction/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    console.log(`🔍 Retrieving Accept.blue transaction: ${transactionId}`);

    // Get transaction from database first
    const [dbTransaction] = await db
      .select()
      .from(creditCardTransactions)
      .where(and(
        eq(creditCardTransactions.transactionId, transactionId),
        eq(creditCardTransactions.gateway, 'accept_blue')
      ))
      .limit(1);

    if (!dbTransaction) {
      console.error(`❌ Accept.blue transaction not found in database: ${transactionId}`);
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Initialize Accept.blue client
    const isTestMode = process.env.NODE_ENV !== 'production';
    const acceptBlueClient = createAcceptBlueClient(isTestMode);

    // Get latest transaction details from Accept.blue
    const transactionResult = await acceptBlueClient.getTransaction(transactionId);

    if (transactionResult.success) {
      res.json({
        success: true,
        transaction: {
          ...dbTransaction,
          gatewayDetails: transactionResult.transaction
        }
      });
    } else {
      // Return database info even if gateway lookup fails
      res.json({
        success: true,
        transaction: dbTransaction,
        note: 'Gateway details unavailable'
      });
    }

  } catch (error: any) {
    console.error('❌ Accept.blue transaction retrieval error:', error);
    res.status(500).json({ 
      error: 'Transaction retrieval failed', 
      details: error.message 
    });
  }
});

/**
 * Health check endpoint
 * GET /api/accept-blue/health
 */
router.get('/health', async (req, res) => {
  try {
    // Basic health check
    const isTestMode = process.env.NODE_ENV !== 'production';
    const hasCredentials = !!(process.env.ACCEPT_BLUE_API_KEY && process.env.ACCEPT_BLUE_PIN);
    
    res.json({
      success: true,
      gateway: 'accept_blue',
      testMode: isTestMode,
      credentialsConfigured: hasCredentials,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Accept.blue health check error:', error);
    res.status(500).json({ 
      error: 'Health check failed', 
      details: error.message 
    });
  }
});

// Helper function to detect card type from number
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