import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import {
  payments,
  creditCardTransactions,
  allOrders,
  insertPaymentSchema,
  insertCreditCardTransactionSchema,
} from '../../schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { chargeCard, voidTransaction, isConfigured as isAcceptBlueConfigured } from '../../utils/acceptBlue';

const router = Router();

// Determine if we're in test mode (sandbox)
const isTestMode = process.env.NODE_ENV !== 'production';

// Credit card payment schema for API validation
const creditCardPaymentSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  cardNumber: z
    .string()
    .min(13, 'Card number must be at least 13 digits')
    .max(19, 'Card number must be at most 19 digits'),
  expirationDate: z
    .string()
    .regex(/^\d{2}\/\d{2}$/, 'Expiration date must be in MM/YY format'),
  cvv: z
    .string()
    .min(3, 'CVV must be at least 3 digits')
    .max(4, 'CVV must be at most 4 digits'),
  billingAddress: z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    address: z.string().min(1, 'Address is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(2, 'State is required'),
    zip: z.string().min(5, 'ZIP code is required'),
    country: z.string().default('US'),
  }),
  customerEmail: z.string().email().optional().or(z.literal('')),
  taxAmount: z.number().min(0).default(0),
  shippingAmount: z.number().min(0).default(0),
});

// Process credit card payment via Accept.Blue
router.post('/credit-card', async (req, res) => {
  try {
    console.log(
      '🔄 Payment request received for body:',
      JSON.stringify(req.body, null, 2)
    );
    const paymentData = creditCardPaymentSchema.parse(req.body);
    console.log(
      '💰 Processing payment for order:',
      paymentData.orderId,
      'amount:',
      paymentData.amount
    );
    console.log('🔑 Accept.Blue credentials check:', {
      isConfigured: isAcceptBlueConfigured(),
      isTestMode,
    });

    if (!isAcceptBlueConfigured()) {
      return res.status(500).json({
        error: 'Payment processing not configured. Please contact support.',
      });
    }

    // Verify order exists (all orders including drafts are in allOrders table)
    const order = await db
      .select()
      .from(allOrders)
      .where(eq(allOrders.orderId, paymentData.orderId))
      .limit(1);

    if (order.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Process payment via Accept.Blue
    const result = await chargeCard({
      amount: paymentData.amount,
      cardNumber: paymentData.cardNumber,
      expirationDate: paymentData.expirationDate,
      cvv: paymentData.cvv,
      orderId: paymentData.orderId,
      customerEmail: paymentData.customerEmail,
      billingAddress: paymentData.billingAddress,
    });

    // If the charge failed without a reference number, return the error immediately
    // Don't try to save a failed transaction without proper identifiers
    if (!result.success && !result.referenceNumber && !result.transactionId) {
      console.log('❌ Payment failed without transaction reference:', result.message);
      return res.status(400).json({
        success: false,
        error: result.message || 'Payment processing failed',
        message: result.message,
      });
    }

    // Process the transaction result
    // Accept.Blue uses reference_number as the primary transaction identifier
    const transactionId = result.referenceNumber 
      ? String(result.referenceNumber) 
      : (result.transactionId || `TEMP-${Date.now()}`);
    
    const processedResult = await processTransactionResult({
      orderId: paymentData.orderId,
      amount: paymentData.amount,
      taxAmount: paymentData.taxAmount,
      shippingAmount: paymentData.shippingAmount,
      billingAddress: paymentData.billingAddress,
      customerEmail: paymentData.customerEmail,
      transactionId: transactionId,
      authCode: result.authCode,
      responseCode: result.responseCode || (result.success ? '1' : '2'),
      responseReasonCode: undefined,
      responseReasonText: result.message,
      avsResult: result.avsResult,
      cvvResult: result.cvvResult,
      rawResponse: result.rawResponse,
      isTest: isTestMode,
    });

    res.json(processedResult);
  } catch (error) {
    console.error('Credit card payment error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid payment data',
        details: error.errors,
      });
    }
    return res.status(500).json({ error: 'Payment processing failed' });
  }
});

// Process transaction result and save to database
async function processTransactionResult(data: {
  orderId: string;
  amount: number;
  taxAmount: number;
  shippingAmount: number;
  billingAddress: any;
  customerEmail?: string;
  transactionId: string;
  authCode?: string;
  responseCode: string;
  responseReasonCode?: string;
  responseReasonText: string;
  avsResult?: string;
  cvvResult?: string;
  rawResponse: any;
  isTest: boolean;
}) {
  const isApproved = data.responseCode === '1';
  const status = isApproved ? 'completed' : 'failed';

  // Create payment record
  const [payment] = await db
    .insert(payments)
    .values({
      orderId: data.orderId,
      paymentType: 'credit_card',
      paymentAmount: data.amount,
      paymentDate: new Date(),
      notes: isApproved
        ? `Credit card payment approved - Auth: ${data.authCode}`
        : `Credit card payment failed - ${data.responseReasonText}`,
    })
    .returning();

  // Create credit card transaction record
  // Extract card details from Accept.Blue response format
  const lastFourDigits = data.rawResponse?.last_4 || 
    data.rawResponse?.transaction?.card_details?.last4 ||
    data.rawResponse?.transactionResponse?.accountNumber?.slice(-4);
  const cardType = data.rawResponse?.card_type || 
    data.rawResponse?.transaction?.card_details?.card_type ||
    data.rawResponse?.transactionResponse?.accountType;

  const [transaction] = await db
    .insert(creditCardTransactions)
    .values({
      paymentId: payment.id,
      orderId: data.orderId,
      transactionId: data.transactionId,
      authCode: data.authCode,
      responseCode: data.responseCode,
      responseReasonCode: data.responseReasonCode,
      responseReasonText: data.responseReasonText,
      avsResult: data.avsResult,
      cvvResult: data.cvvResult,
      lastFourDigits: lastFourDigits,
      cardType: cardType,
      amount: data.amount,
      taxAmount: data.taxAmount,
      shippingAmount: data.shippingAmount,
      customerEmail: data.customerEmail,
      billingFirstName: data.billingAddress.firstName,
      billingLastName: data.billingAddress.lastName,
      billingAddress: data.billingAddress.address,
      billingCity: data.billingAddress.city,
      billingState: data.billingAddress.state,
      billingZip: data.billingAddress.zip,
      billingCountry: data.billingAddress.country,
      isTest: data.isTest,
      rawResponse: data.rawResponse,
      status: status,
    })
    .returning();

  // If payment was approved, update order status
  if (isApproved) {
    // Update order payment status (all orders including drafts are in allOrders table)
    await db
      .update(allOrders)
      .set({
        isPaid: true,
        paymentType: 'credit_card',
        paymentAmount: data.amount,
        paymentDate: new Date(),
        paymentTimestamp: new Date(),
      })
      .where(eq(allOrders.orderId, data.orderId));
  }

  return {
    success: isApproved,
    transactionId: data.transactionId,
    authCode: data.authCode,
    responseCode: data.responseCode,
    message: data.responseReasonText,
    avsResult: data.avsResult,
    cvvResult: data.cvvResult,
    payment,
    transaction,
  };
}

// Get payment history for an order
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const orderPayments = await db
      .select({
        payment: payments,
        transaction: creditCardTransactions,
      })
      .from(payments)
      .leftJoin(
        creditCardTransactions,
        eq(payments.id, creditCardTransactions.paymentId)
      )
      .where(eq(payments.orderId, orderId))
      .orderBy(desc(payments.createdAt));

    res.json({ payments: orderPayments });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// Get all payments (admin only)
router.get('/', async (req, res) => {
  try {
    const allPayments = await db
      .select({
        payment: payments,
        transaction: creditCardTransactions,
      })
      .from(payments)
      .leftJoin(
        creditCardTransactions,
        eq(payments.id, creditCardTransactions.paymentId)
      )
      .orderBy(desc(payments.createdAt))
      .limit(100);

    res.json({ payments: allPayments });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Void a transaction (within 24 hours) via Accept.Blue
router.post('/void/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    if (!isAcceptBlueConfigured()) {
      return res.status(500).json({
        error: 'Payment processing not configured. Please contact support.',
      });
    }

    // Find the transaction
    const [transaction] = await db
      .select()
      .from(creditCardTransactions)
      .where(eq(creditCardTransactions.transactionId, transactionId))
      .limit(1);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'completed') {
      return res
        .status(400)
        .json({ error: 'Can only void completed transactions' });
    }

    // Process void via Accept.Blue
    const result = await voidTransaction(transactionId);

    if (result.success) {
      // Update transaction status
      await db.update(creditCardTransactions)
        .set({
          status: 'voided',
          voidedAt: new Date(),
        })
        .where(eq(creditCardTransactions.transactionId, transactionId));

      res.json({
        success: true,
        message: 'Transaction voided successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    console.error('Error voiding transaction:', error);
    res.status(500).json({ error: 'Failed to void transaction' });
  }
});

// Batch payment processing
const batchPaymentSchema = z.object({
  paymentMethod: z.enum(['cash', 'check', 'credit_card', 'agr', 'ach']),
  totalAmount: z.number().min(0.01),
  notes: z.string().optional(),
  orderAllocations: z
    .array(
      z.object({
        orderId: z.string(),
        amount: z.number().min(0),
      })
    )
    .min(1),
});

router.post('/batch', async (req, res) => {
  try {
    const batchData = batchPaymentSchema.parse(req.body);

    console.log('🔄 Processing batch payment:', {
      method: batchData.paymentMethod,
      total: batchData.totalAmount,
      orders: batchData.orderAllocations.length,
    });

    // Validate that allocations sum to total amount
    const totalAllocated = batchData.orderAllocations.reduce(
      (sum, allocation) => sum + allocation.amount,
      0
    );
    if (Math.abs(totalAllocated - batchData.totalAmount) > 0.01) {
      return res.status(400).json({
        error: 'Total allocation amount does not match payment amount',
      });
    }

    // Verify all orders exist
    const orderIds = batchData.orderAllocations.map((a) => a.orderId);
    const existingOrders = await db
      .select()
      .from(allOrders)
      .where(inArray(allOrders.orderId, orderIds));

    if (existingOrders.length !== orderIds.length) {
      console.log(`❌ Found ${existingOrders.length} orders out of ${orderIds.length} requested`);
      console.log('Requested order IDs:', orderIds);
      console.log('Found order IDs:', existingOrders.map(o => o.orderId));
      return res.status(400).json({
        error: 'One or more orders not found',
      });
    }

    const results = [];
    let ordersUpdated = 0;

    // Process each order payment
    for (const allocation of batchData.orderAllocations) {
      if (allocation.amount > 0) {
        // Create payment record
        const [paymentRecord] = await db
          .insert(payments)
          .values({
            orderId: allocation.orderId,
            paymentType: batchData.paymentMethod,
            paymentAmount: allocation.amount,
            paymentDate: new Date(),
            notes:
              batchData.notes ||
              `${batchData.paymentMethod.replace('_', ' ').toUpperCase()} payment via batch processing`,
          })
          .returning();

        // Update order payment status
        await db
          .update(allOrders)
          .set({
            isPaid: true, // This should be calculated based on total payments vs order total
            paymentType: batchData.paymentMethod,
            paymentAmount: allocation.amount, // This should be cumulative
            paymentDate: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(allOrders.orderId, allocation.orderId));

        results.push({
          orderId: allocation.orderId,
          paymentId: paymentRecord.id,
          amount: allocation.amount,
        });

        ordersUpdated++;
      }
    }

    console.log('✅ Batch payment completed:', {
      ordersUpdated,
      results: results.length,
    });

    res.json({
      success: true,
      message: `Batch payment processed successfully`,
      ordersUpdated,
      totalAmount: batchData.totalAmount,
      paymentMethod: batchData.paymentMethod,
      results,
    });
  } catch (error) {
    console.error('Batch payment error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid batch payment data',
        details: error.errors,
      });
    }
    return res.status(500).json({ error: 'Batch payment processing failed' });
  }
});

export default router;
