import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { db } from '../../db';
import {
  payments,
  creditCardTransactions,
  allOrders,
  bulkPaymentBatches,
  insertPaymentSchema,
  insertCreditCardTransactionSchema,
} from '../../schema';
import { eq, desc, inArray, count, sql } from 'drizzle-orm';
import { chargeCard, voidTransaction, isConfigured as isAcceptBlueConfigured } from '../../utils/acceptBlue';
import { auditService } from '../services/auditService';
import * as accountingService from '../services/accountingService';

const router = Router();

// Rate limiting for payment endpoints to prevent card testing attacks
// Limits: 25 payment attempts per hour per IP
const paymentRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 25, // 25 attempts per hour
  message: { error: 'Too many payment attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all attempts, even successful ones
});

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
    companyName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
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
// Rate limited to prevent card testing attacks
router.post('/credit-card', paymentRateLimiter, async (req, res) => {
  try {
    // SECURITY: Never log payment request body - contains sensitive card data
    const paymentData = creditCardPaymentSchema.parse(req.body);
    // Only log non-sensitive information
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

    // Verify order exists (all orders including drafts and PENDING_PAYMENT are in allOrders table)
    // PENDING_PAYMENT orders are allowed for card-before-save flow
    const order = await db
      .select()
      .from(allOrders)
      .where(eq(allOrders.orderId, paymentData.orderId))
      .limit(1);

    if (order.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const orderStatus = order[0].status;
    const isPendingPayment = orderStatus === 'PENDING_PAYMENT';
    console.log(`💳 Order ${paymentData.orderId} status: ${orderStatus}, isPendingPayment: ${isPendingPayment}`);

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
      wasPendingPayment: isPendingPayment,
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
  wasPendingPayment?: boolean;
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
    // Build update object - always set payment fields
    const updateFields: Record<string, any> = {
      isPaid: true,
      paymentType: 'credit_card',
      paymentAmount: data.amount,
      paymentDate: new Date(),
      paymentTimestamp: new Date(),
    };

    // If order was PENDING_PAYMENT (card-before-save flow), finalize it
    if (data.wasPendingPayment) {
      updateFields.status = 'FINALIZED';
      console.log(`✅ Finalizing PENDING_PAYMENT order ${data.orderId} after successful payment`);
    }

    // Update order payment status (all orders including drafts are in allOrders table)
    await db
      .update(allOrders)
      .set(updateFields)
      .where(eq(allOrders.orderId, data.orderId));

    try {
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: data.orderId,
        action: 'PAYMENT_ADDED',
        meta: {
          paymentType: 'credit_card',
          amount: data.amount,
          lastFour: lastFourDigits,
          cardType: cardType,
          paymentId: payment.id,
        },
      });
    } catch (auditError) {
      console.error('[Audit] Failed to log payment event:', auditError);
    }
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
    orderFinalized: isApproved && data.wasPendingPayment,
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

      try {
        await auditService.logEvent({
          entityType: 'p1_order',
          entityId: transaction.orderId,
          action: 'PAYMENT_VOIDED',
          meta: {
            transactionId,
            amount: transaction.amount,
            lastFour: transaction.lastFourDigits,
            cardType: transaction.cardType,
          },
        });
      } catch (auditError) {
        console.error('[Audit] Failed to log void event:', auditError);
      }

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
  paymentMethod: z.enum(['cash', 'check', 'credit_card', 'agr', 'ach', 'wire']),
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

    // Determine the customer from the first order
    const firstOrder = existingOrders[0];
    const customerId = firstOrder?.customerId || 'unknown';

    // Create the batch record
    const [batch] = await db
      .insert(bulkPaymentBatches)
      .values({
        createdBy: (req as any).user?.username || (req as any).user?.role || 'system',
        customerId,
        totalAmount: batchData.totalAmount,
        paymentMethod: batchData.paymentMethod,
        notes: batchData.notes || null,
      })
      .returning();

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
            batchId: batch.id,
          })
          .returning();

        try {
          await accountingService.createOrUpdateFromPayment(paymentRecord, (req as any).user);
        } catch (accountingError) {
          console.error('[Accounting] Failed to create journal entry for batch payment:', accountingError);
        }

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

        try {
          await auditService.logEvent({
            entityType: 'p1_order',
            entityId: allocation.orderId,
            action: 'PAYMENT_ADDED',
            meta: {
              paymentType: batchData.paymentMethod,
              amount: allocation.amount,
              paymentId: paymentRecord.id,
              batchPayment: true,
              batchTotal: batchData.totalAmount,
              notes: batchData.notes,
            },
          });
        } catch (auditError) {
          console.error('[Audit] Failed to log batch payment event:', auditError);
        }

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

// Bulk live credit card payment - process a single charge and distribute to multiple orders
const bulkLivePaymentSchema = z.object({
  totalAmount: z.number().min(0.01, 'Amount must be greater than 0'),
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
    companyName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    address: z.string().min(1, 'Address is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(2, 'State is required'),
    zip: z.string().min(5, 'ZIP code is required'),
    country: z.string().default('US'),
  }),
  customerEmail: z.string().email().optional().or(z.literal('')),
  orderAllocations: z
    .array(
      z.object({
        orderId: z.string(),
        amount: z.number().min(0),
        orderTotal: z.number().min(0),
      })
    )
    .min(1, 'At least one order must be selected'),
});

router.post('/bulk-live', async (req, res) => {
  try {
    console.log('🔄 Bulk live payment request received');
    const paymentData = bulkLivePaymentSchema.parse(req.body);
    
    console.log('💳 Processing bulk live payment:', {
      totalAmount: paymentData.totalAmount,
      orderCount: paymentData.orderAllocations.length,
      orders: paymentData.orderAllocations.map(o => o.orderId).join(', '),
    });

    if (!isAcceptBlueConfigured()) {
      return res.status(500).json({
        success: false,
        error: 'Payment processing not configured. Please contact support.',
      });
    }

    // Validate that allocations sum to total amount
    const totalAllocated = paymentData.orderAllocations.reduce(
      (sum, allocation) => sum + allocation.amount,
      0
    );
    if (Math.abs(totalAllocated - paymentData.totalAmount) > 0.01) {
      return res.status(400).json({
        success: false,
        error: `Total allocation amount (${totalAllocated.toFixed(2)}) does not match payment amount (${paymentData.totalAmount.toFixed(2)})`,
      });
    }

    // Verify all orders exist
    const orderIds = paymentData.orderAllocations.map((a) => a.orderId);
    const existingOrders = await db
      .select()
      .from(allOrders)
      .where(inArray(allOrders.orderId, orderIds));

    if (existingOrders.length !== orderIds.length) {
      console.log(`❌ Found ${existingOrders.length} orders out of ${orderIds.length} requested`);
      return res.status(400).json({
        success: false,
        error: 'One or more orders not found',
      });
    }

    // Use first order ID as the reference for the transaction description
    const primaryOrderId = paymentData.orderAllocations[0].orderId;
    const orderDescription = paymentData.orderAllocations.length > 1
      ? `${primaryOrderId} (+${paymentData.orderAllocations.length - 1} more)`
      : primaryOrderId;

    // Process the single credit card charge via Accept.Blue
    const result = await chargeCard({
      amount: paymentData.totalAmount,
      cardNumber: paymentData.cardNumber,
      expirationDate: paymentData.expirationDate,
      cvv: paymentData.cvv,
      orderId: orderDescription,
      customerEmail: paymentData.customerEmail,
      billingAddress: paymentData.billingAddress,
    });

    // If the charge failed without a reference number, return the error immediately
    if (!result.success && !result.referenceNumber && !result.transactionId) {
      console.log('❌ Bulk live payment failed:', result.message);
      return res.status(400).json({
        success: false,
        error: result.message || 'Payment processing failed',
        message: result.message,
      });
    }

    const transactionId = result.referenceNumber 
      ? String(result.referenceNumber) 
      : (result.transactionId || `BULK-${Date.now()}`);

    const isApproved = result.success;

    if (!isApproved) {
      console.log('❌ Bulk live payment declined:', result.message);
      return res.status(400).json({
        success: false,
        transactionId,
        error: result.message || 'Transaction declined',
        message: result.message,
      });
    }

    console.log(`✅ Bulk live charge approved! Transaction ID: ${transactionId}`);

    // Extract card details from Accept.Blue response
    const lastFourDigits = result.rawResponse?.last_4 || 
      result.rawResponse?.transaction?.card_details?.last4;
    const cardType = result.rawResponse?.card_type || 
      result.rawResponse?.transaction?.card_details?.card_type;

    // Determine customer from the first existing order
    const firstExistingOrder = existingOrders[0];
    const liveCustomerId = firstExistingOrder?.customerId || 'unknown';

    // Create the batch record for this bulk live payment
    const [liveBatch] = await db
      .insert(bulkPaymentBatches)
      .values({
        createdBy: (req as any).user?.username || (req as any).user?.role || 'system',
        customerId: liveCustomerId,
        totalAmount: paymentData.totalAmount,
        paymentMethod: 'credit_card',
        notes: `Live CC bulk payment - Trans: ${transactionId}`,
      })
      .returning();

    // Now distribute the payment to each order
    const paymentResults = [];
    let ordersProcessed = 0;

    for (const allocation of paymentData.orderAllocations) {
      if (allocation.amount > 0) {
        try {
          // Create payment record for this order
          const [payment] = await db
            .insert(payments)
            .values({
              orderId: allocation.orderId,
              paymentType: 'credit_card',
              paymentAmount: allocation.amount,
              paymentDate: new Date(),
              notes: `Live credit card payment - Trans: ${transactionId}, Auth: ${result.authCode || 'N/A'}`,
              batchId: liveBatch.id,
            })
            .returning();

          try {
            await accountingService.createOrUpdateFromPayment(payment, (req as any).user);
          } catch (accountingError) {
            console.error('[Accounting] Failed to create journal entry for bulk-live payment:', accountingError);
          }

          // Create credit card transaction record for this order
          const [transaction] = await db
            .insert(creditCardTransactions)
            .values({
              paymentId: payment.id,
              orderId: allocation.orderId,
              transactionId: `${transactionId}-${allocation.orderId}`,
              authCode: result.authCode,
              responseCode: '1',
              responseReasonText: 'Transaction approved (bulk payment)',
              avsResult: result.avsResult,
              cvvResult: result.cvvResult,
              lastFourDigits: lastFourDigits,
              cardType: cardType,
              amount: allocation.amount,
              taxAmount: 0,
              shippingAmount: 0,
              customerEmail: paymentData.customerEmail,
              billingFirstName: paymentData.billingAddress.firstName,
              billingLastName: paymentData.billingAddress.lastName,
              billingAddress: paymentData.billingAddress.address,
              billingCity: paymentData.billingAddress.city,
              billingState: paymentData.billingAddress.state,
              billingZip: paymentData.billingAddress.zip,
              billingCountry: paymentData.billingAddress.country,
              isTest: isTestMode,
              rawResponse: { 
                ...result.rawResponse, 
                bulkPayment: true, 
                masterTransactionId: transactionId,
                allocatedAmount: allocation.amount,
              },
              status: 'completed',
            })
            .returning();

          // Calculate if order is fully paid
          const allPaymentsForOrder = await db
            .select()
            .from(payments)
            .where(eq(payments.orderId, allocation.orderId));
          
          const totalPaid = allPaymentsForOrder.reduce(
            (sum, p) => sum + (p.paymentAmount || 0),
            0
          );
          
          const roundedTotalPaid = Math.round(totalPaid * 100) / 100;
          const roundedOrderTotal = Math.round(allocation.orderTotal * 100) / 100;
          const isPaidInFull = roundedTotalPaid >= roundedOrderTotal;

          // Update order payment status
          await db
            .update(allOrders)
            .set({
              isPaid: isPaidInFull,
              paymentType: 'credit_card',
              paymentAmount: totalPaid,
              paymentDate: new Date(),
              paymentTimestamp: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(allOrders.orderId, allocation.orderId));

          try {
            await auditService.logEvent({
              entityType: 'p1_order',
              entityId: allocation.orderId,
              action: 'PAYMENT_ADDED',
              meta: {
                paymentType: 'credit_card',
                amount: allocation.amount,
                lastFour: lastFourDigits,
                cardType: cardType,
                paymentId: payment.id,
                bulkPayment: true,
                bulkTotal: paymentData.totalAmount,
              },
            });
          } catch (auditError) {
            console.error('[Audit] Failed to log bulk payment event:', auditError);
          }

          paymentResults.push({
            orderId: allocation.orderId,
            paymentId: payment.id,
            amount: allocation.amount,
            isPaidInFull,
          });

          ordersProcessed++;
        } catch (orderError) {
          console.error(`Error processing order ${allocation.orderId}:`, orderError);
          paymentResults.push({
            orderId: allocation.orderId,
            error: 'Failed to record payment for this order',
          });
        }
      }
    }

    console.log('✅ Bulk live payment completed:', {
      transactionId,
      ordersProcessed,
      totalAmount: paymentData.totalAmount,
    });

    res.json({
      success: true,
      transactionId,
      authCode: result.authCode,
      message: 'Bulk payment processed successfully',
      ordersProcessed,
      totalAmount: paymentData.totalAmount,
      avsResult: result.avsResult,
      cvvResult: result.cvvResult,
      results: paymentResults,
    });

  } catch (error) {
    console.error('Bulk live payment error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment data',
        details: error.errors,
      });
    }
    return res.status(500).json({ 
      success: false,
      error: 'Payment processing failed' 
    });
  }
});

// Get all bulk payment batches (most recent first) with order count
router.get('/batches', async (req, res) => {
  try {
    const batches = await db
      .select({
        id: bulkPaymentBatches.id,
        createdAt: bulkPaymentBatches.createdAt,
        createdBy: bulkPaymentBatches.createdBy,
        customerId: bulkPaymentBatches.customerId,
        totalAmount: bulkPaymentBatches.totalAmount,
        paymentMethod: bulkPaymentBatches.paymentMethod,
        notes: bulkPaymentBatches.notes,
        orderCount: count(payments.id),
      })
      .from(bulkPaymentBatches)
      .leftJoin(payments, eq(payments.batchId, bulkPaymentBatches.id))
      .groupBy(bulkPaymentBatches.id)
      .orderBy(desc(bulkPaymentBatches.createdAt));

    res.json({ batches });
  } catch (error) {
    console.error('Error fetching bulk payment batches:', error);
    res.status(500).json({ error: 'Failed to fetch bulk payment batches' });
  }
});

// Get a single bulk payment batch with its associated payments
router.get('/batches/:id', async (req, res) => {
  try {
    const batchId = parseInt(req.params.id, 10);
    if (isNaN(batchId)) {
      return res.status(400).json({ error: 'Invalid batch ID' });
    }

    const [batch] = await db
      .select()
      .from(bulkPaymentBatches)
      .where(eq(bulkPaymentBatches.id, batchId))
      .limit(1);

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const batchPayments = await db
      .select({
        paymentId: payments.id,
        orderId: payments.orderId,
        paymentAmount: payments.paymentAmount,
        paymentDate: payments.paymentDate,
        paymentType: payments.paymentType,
        notes: payments.notes,
        orderDate: allOrders.orderDate,
        customerPO: allOrders.customerPO,
      })
      .from(payments)
      .leftJoin(allOrders, eq(allOrders.orderId, payments.orderId))
      .where(eq(payments.batchId, batchId))
      .orderBy(payments.orderId);

    res.json({ batch, payments: batchPayments });
  } catch (error) {
    console.error('Error fetching bulk payment batch:', error);
    res.status(500).json({ error: 'Failed to fetch bulk payment batch' });
  }
});

export default router;
