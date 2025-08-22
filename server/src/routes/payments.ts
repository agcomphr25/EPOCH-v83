import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { payments, creditCardTransactions, allOrders, orderDrafts, insertPaymentSchema, insertCreditCardTransactionSchema } from '../../schema';
import { eq, desc } from 'drizzle-orm';
// @ts-ignore - AuthorizeNet doesn't have proper TypeScript definitions
import AuthorizeNet from 'authorizenet';

const router = Router();

// Configure Authorize.Net
const apiLoginId = process.env.AUTHORIZE_NET_API_LOGIN_ID;
const transactionKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY;

if (!apiLoginId || !transactionKey) {
  console.error('Missing Authorize.Net credentials. Please set AUTHORIZE_NET_API_LOGIN_ID and AUTHORIZE_NET_TRANSACTION_KEY');
}

// Determine if we're in test mode (sandbox)
const isTestMode = process.env.NODE_ENV !== 'production';

// Credit card payment schema for API validation
const creditCardPaymentSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  cardNumber: z.string().min(13, "Card number must be at least 13 digits").max(19, "Card number must be at most 19 digits"),
  expirationDate: z.string().regex(/^\d{2}\/\d{2}$/, "Expiration date must be in MM/YY format"),
  cvv: z.string().min(3, "CVV must be at least 3 digits").max(4, "CVV must be at most 4 digits"),
  billingAddress: z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    address: z.string().min(1, "Address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(2, "State is required"),
    zip: z.string().min(5, "ZIP code is required"),
    country: z.string().default("US"),
  }),
  customerEmail: z.string().email().optional().or(z.literal("")),
  taxAmount: z.number().min(0).default(0),
  shippingAmount: z.number().min(0).default(0),
});

// Process credit card payment
router.post('/credit-card', async (req, res) => {
  try {
    console.log('🔄 Payment request received for body:', JSON.stringify(req.body, null, 2));
    const paymentData = creditCardPaymentSchema.parse(req.body);
    console.log('💰 Processing payment for order:', paymentData.orderId, 'amount:', paymentData.amount);
    console.log('🔑 Credentials check:', { hasApiLoginId: !!apiLoginId, hasTransactionKey: !!transactionKey, isTestMode });
    
    if (!apiLoginId || !transactionKey) {
      return res.status(500).json({ 
        error: 'Payment processing not configured. Please contact support.' 
      });
    }

    // Verify order exists
    const order = await db.select().from(allOrders).where(eq(allOrders.orderId, paymentData.orderId)).limit(1);
    const draftOrder = await db.select().from(orderDrafts).where(eq(orderDrafts.orderId, paymentData.orderId)).limit(1);
    
    if (order.length === 0 && draftOrder.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Create Authorize.Net API instance
    const apiContracts = AuthorizeNet.APIContracts;
    const apiControllers = AuthorizeNet.APIControllers;

    // Set up merchant authentication
    const merchantAuthenticationType = new apiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(apiLoginId);
    merchantAuthenticationType.setTransactionKey(transactionKey);

    // Set up credit card
    const creditCard = new apiContracts.CreditCardType();
    creditCard.setCardNumber(paymentData.cardNumber);
    creditCard.setExpirationDate(paymentData.expirationDate);
    creditCard.setCardCode(paymentData.cvv);

    // Set up payment type
    const paymentType = new apiContracts.PaymentType();
    paymentType.setCreditCard(creditCard);

    // Set up customer billing address
    const customerAddress = new apiContracts.CustomerAddressType();
    customerAddress.setFirstName(paymentData.billingAddress.firstName);
    customerAddress.setLastName(paymentData.billingAddress.lastName);
    customerAddress.setAddress(paymentData.billingAddress.address);
    customerAddress.setCity(paymentData.billingAddress.city);
    customerAddress.setState(paymentData.billingAddress.state);
    customerAddress.setZip(paymentData.billingAddress.zip);
    customerAddress.setCountry(paymentData.billingAddress.country);

    // Set up transaction request
    const transactionRequestType = new apiContracts.TransactionRequestType();
    transactionRequestType.setTransactionType(apiContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
    transactionRequestType.setPayment(paymentType);
    transactionRequestType.setAmount(paymentData.amount);
    transactionRequestType.setBillTo(customerAddress);
    
    // Add order information
    const orderInfo = new apiContracts.OrderType();
    orderInfo.setInvoiceNumber(paymentData.orderId);
    orderInfo.setDescription(`Payment for Order ${paymentData.orderId}`);
    transactionRequestType.setOrder(orderInfo);

    // Add line items if we have tax or shipping
    if (paymentData.taxAmount > 0 || paymentData.shippingAmount > 0) {
      const lineItems = [];
      
      if (paymentData.taxAmount > 0) {
        const taxItem = new apiContracts.LineItemType();
        taxItem.setItemId('TAX');
        taxItem.setName('Tax');
        taxItem.setDescription('Sales Tax');
        taxItem.setQuantity('1');
        taxItem.setUnitPrice(paymentData.taxAmount);
        lineItems.push(taxItem);
      }
      
      if (paymentData.shippingAmount > 0) {
        const shippingItem = new apiContracts.LineItemType();
        shippingItem.setItemId('SHIPPING');
        shippingItem.setName('Shipping');
        shippingItem.setDescription('Shipping Fee');
        shippingItem.setQuantity('1');
        shippingItem.setUnitPrice(paymentData.shippingAmount);
        lineItems.push(shippingItem);
      }
      
      transactionRequestType.setLineItems(lineItems);
    }

    // Set up customer email if provided
    if (paymentData.customerEmail) {
      const customerDataType = new apiContracts.CustomerDataType();
      customerDataType.setType(apiContracts.CustomerTypeEnum.INDIVIDUAL);
      customerDataType.setEmail(paymentData.customerEmail);
      transactionRequestType.setCustomer(customerDataType);
    }

    // Create transaction request
    const createRequest = new apiContracts.CreateTransactionRequest();
    createRequest.setMerchantAuthentication(merchantAuthenticationType);
    createRequest.setTransactionRequest(transactionRequestType);

    // Set up controller
    const ctrl = new apiControllers.CreateTransactionController(createRequest.getJSON());
    console.log('🌐 Setting up Authorize.Net controller, test mode:', isTestMode);
    
    // Use sandbox for testing
    if (isTestMode) {
      ctrl.setEnvironment('https://apitest.authorize.net/xml/v1/request.api');
      console.log('🧪 Using sandbox environment');
    }

    // Execute transaction with timeout
    return new Promise((resolve, reject) => {
      // Add timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        reject(new Error('Payment processing timeout - please try again'));
      }, 30000); // 30 second timeout

      ctrl.execute(() => {
        clearTimeout(timeoutId);
        try {
          const apiResponse = ctrl.getResponse();
          const response = new apiContracts.CreateTransactionResponse(apiResponse);
        
        // Parse response
        const resultCode = response.getMessages().getResultCode();
        const messageCode = response.getMessages().getMessage()[0].getCode();
        const messageText = response.getMessages().getMessage()[0].getText();
        
        let transactionResponse = null;
        let authCode = null;
        let transactionId = null;
        let avsResult = null;
        let cvvResult = null;
        let responseCode = '3'; // Default to error
        let responseReasonCode = null;
        let responseReasonText = messageText;

        if (response.getTransactionResponse() != null) {
          transactionResponse = response.getTransactionResponse();
          authCode = transactionResponse.getAuthCode();
          transactionId = transactionResponse.getTransId();
          responseCode = transactionResponse.getResponseCode();
          
          // Safely get messages if they exist
          if (transactionResponse.getMessages() && transactionResponse.getMessages().getMessage() && transactionResponse.getMessages().getMessage().length > 0) {
            responseReasonCode = transactionResponse.getMessages().getMessage()[0].getCode();
            responseReasonText = transactionResponse.getMessages().getMessage()[0].getDescription();
          } else {
            // Fallback for transactions without detailed messages
            responseReasonText = `Transaction ${responseCode === '1' ? 'approved' : 'declined'}`;
          }
          
          if (transactionResponse.getAvsResultCode()) {
            avsResult = transactionResponse.getAvsResultCode();
          }
          if (transactionResponse.getCvvResultCode()) {
            cvvResult = transactionResponse.getCvvResultCode();
          }
        }

        // Process the transaction result
        processTransactionResult({
          orderId: paymentData.orderId,
          amount: paymentData.amount,
          taxAmount: paymentData.taxAmount,
          shippingAmount: paymentData.shippingAmount,
          billingAddress: paymentData.billingAddress,
          customerEmail: paymentData.customerEmail,
          transactionId: transactionId || 'UNKNOWN',
          authCode,
          responseCode,
          responseReasonCode,
          responseReasonText,
          avsResult,
          cvvResult,
          rawResponse: apiResponse,
          isTest: isTestMode
        }).then(result => {
          res.json(result);
          resolve(undefined);
        }).catch(error => {
          console.error('Error processing transaction result:', error);
          res.status(500).json({ error: 'Failed to save transaction result' });
          reject(error);
        });
        } catch (error) {
          clearTimeout(timeoutId);
          console.error('Error parsing Authorize.Net response:', error);
          reject(error);
        }
      });
    });

  } catch (error) {
    console.error('Credit card payment error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid payment data', 
        details: error.errors 
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
  const [payment] = await db.insert(payments).values({
    orderId: data.orderId,
    paymentType: 'credit_card',
    paymentAmount: data.amount,
    paymentDate: new Date(),
    notes: isApproved ? `Credit card payment approved - Auth: ${data.authCode}` : `Credit card payment failed - ${data.responseReasonText}`,
  }).returning();

  // Create credit card transaction record
  const [transaction] = await db.insert(creditCardTransactions).values({
    paymentId: payment.id,
    orderId: data.orderId,
    transactionId: data.transactionId,
    authCode: data.authCode,
    responseCode: data.responseCode,
    responseReasonCode: data.responseReasonCode,
    responseReasonText: data.responseReasonText,
    avsResult: data.avsResult,
    cvvResult: data.cvvResult,
    lastFourDigits: data.rawResponse?.transactionResponse?.accountNumber?.slice(-4),
    cardType: data.rawResponse?.transactionResponse?.accountType,
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
  }).returning();

  // If payment was approved, update order status
  if (isApproved) {
    // Update order payment status
    await db.update(allOrders)
      .set({ 
        isPaid: true, 
        paymentType: 'credit_card',
        paymentAmount: data.amount,
        paymentDate: new Date(),
        paymentTimestamp: new Date(),
      })
      .where(eq(allOrders.orderId, data.orderId));

    // Also try to update draft order if it exists
    await db.update(orderDrafts)
      .set({ 
        isPaid: true, 
        paymentType: 'credit_card',
        paymentAmount: data.amount,
        paymentDate: new Date(),
        paymentTimestamp: new Date(),
      })
      .where(eq(orderDrafts.orderId, data.orderId));
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
      .leftJoin(creditCardTransactions, eq(payments.id, creditCardTransactions.paymentId))
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
      .leftJoin(creditCardTransactions, eq(payments.id, creditCardTransactions.paymentId))
      .orderBy(desc(payments.createdAt))
      .limit(100);

    res.json({ payments: allPayments });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Void a transaction (within 24 hours)
router.post('/void/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    if (!apiLoginId || !transactionKey) {
      return res.status(500).json({ 
        error: 'Payment processing not configured. Please contact support.' 
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
      return res.status(400).json({ error: 'Can only void completed transactions' });
    }

    // Set up Authorize.Net void request
    const apiContracts = AuthorizeNet.APIContracts;
    const apiControllers = AuthorizeNet.APIControllers;

    const merchantAuthenticationType = new apiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(apiLoginId);
    merchantAuthenticationType.setTransactionKey(transactionKey);

    const transactionRequestType = new apiContracts.TransactionRequestType();
    transactionRequestType.setTransactionType(apiContracts.TransactionTypeEnum.VOIDTRANSACTION);
    transactionRequestType.setRefTransId(transactionId);

    const createRequest = new apiContracts.CreateTransactionRequest();
    createRequest.setMerchantAuthentication(merchantAuthenticationType);
    createRequest.setTransactionRequest(transactionRequestType);

    const ctrl = new apiControllers.CreateTransactionController(createRequest.getJSON());
    
    if (isTestMode) {
      ctrl.setEnvironment('https://apitest.authorize.net/xml/v1/request.api');
    }

    return new Promise((resolve, reject) => {
      ctrl.execute(() => {
        const apiResponse = ctrl.getResponse();
        const response = new apiContracts.CreateTransactionResponse(apiResponse);
        
        const resultCode = response.getMessages().getResultCode();
        const isSuccess = resultCode === apiContracts.MessageTypeEnum.OK;

        if (isSuccess) {
          // Update transaction status
          db.update(creditCardTransactions)
            .set({ 
              status: 'voided',
              voidedAt: new Date(),
            })
            .where(eq(creditCardTransactions.transactionId, transactionId))
            .then(() => {
              res.json({ 
                success: true, 
                message: 'Transaction voided successfully' 
              });
              resolve(undefined);
            });
        } else {
          const errorMessage = response.getMessages().getMessage()[0].getText();
          res.status(400).json({ 
            success: false, 
            error: errorMessage 
          });
          resolve(undefined);
        }
      });
    });

  } catch (error) {
    console.error('Error voiding transaction:', error);
    res.status(500).json({ error: 'Failed to void transaction' });
  }
});

export default router;