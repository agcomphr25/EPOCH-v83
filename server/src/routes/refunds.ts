import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { refundRequests, allOrders, customers, payments, creditCardTransactions } from '../../schema';
import { insertRefundRequestSchema } from '../../schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { authenticateToken } from '../../middleware/auth';
// @ts-ignore - AuthorizeNet doesn't have proper TypeScript definitions
import AuthorizeNet from 'authorizenet';

const router = Router();

// Configure Authorize.Net for refunds
const apiLoginId = process.env.AUTHORIZE_NET_API_LOGIN_ID;
const transactionKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY;
const isTestMode = process.env.NODE_ENV !== 'production';

// Function to process refund through Authorize.Net
async function processAuthorizeNetRefund(transactionId: string, refundAmount: number): Promise<{ success: boolean; message: string; refundTransactionId?: string }> {
  try {
    if (!apiLoginId || !transactionKey) {
      throw new Error('Authorize.Net credentials not configured');
    }

    console.log(`🔄 Processing Authorize.Net refund for transaction ${transactionId}, amount: $${refundAmount}`);

    const apiContracts = AuthorizeNet.APIContracts;
    const apiControllers = AuthorizeNet.APIControllers;

    // Set up merchant authentication
    const merchantAuthenticationType = new apiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(apiLoginId);
    merchantAuthenticationType.setTransactionKey(transactionKey);

    // Set up transaction request for refund
    const transactionRequestType = new apiContracts.TransactionRequestType();
    transactionRequestType.setTransactionType(apiContracts.TransactionTypeEnum.REFUNDTRANSACTION);
    transactionRequestType.setAmount(refundAmount);
    transactionRequestType.setRefTransId(transactionId);

    // Create the refund request
    const createRequest = new apiContracts.CreateTransactionRequest();
    createRequest.setMerchantAuthentication(merchantAuthenticationType);
    createRequest.setTransactionRequest(transactionRequestType);

    // Execute the refund
    const ctrl = new apiControllers.CreateTransactionController(createRequest.getJSON());

    return new Promise((resolve, reject) => {
      ctrl.execute(() => {
        const apiResponse = ctrl.getResponse();
        const response = new apiContracts.CreateTransactionResponse(apiResponse);

        console.log('✅ Authorize.Net refund response received');
        console.log('Response Code:', response.getMessages().getResultCode());

        if (response.getMessages().getResultCode() === apiContracts.MessageTypeEnum.OK) {
          const transactionResponse = response.getTransactionResponse();
          if (transactionResponse.getMessages() != null) {
            console.log('✅ Refund processed successfully');
            console.log('Transaction ID:', transactionResponse.getTransId());
            console.log('Response Code:', transactionResponse.getResponseCode());
            console.log('Message Code:', transactionResponse.getMessages().getMessage()[0].getCode());
            console.log('Description:', transactionResponse.getMessages().getMessage()[0].getDescription());

            resolve({
              success: true,
              message: 'Refund processed successfully',
              refundTransactionId: transactionResponse.getTransId()
            });
          } else {
            const errorMessage = transactionResponse.getErrors() != null ? 
              transactionResponse.getErrors().getError()[0].getErrorText() : 
              'Refund failed';
            console.error('❌ Refund transaction failed:', errorMessage);
            resolve({
              success: false,
              message: errorMessage
            });
          }
        } else {
          const errorMessage = response.getMessages().getMessage()[0].getText();
          console.error('❌ Refund request failed:', errorMessage);
          resolve({
            success: false,
            message: errorMessage
          });
        }
      });
    });

  } catch (error) {
    console.error('❌ Error processing Authorize.Net refund:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error processing refund'
    };
  }
}

// GET /api/refund-requests - Get all refund requests
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Getting all refund requests');
    
    const requests = await db
      .select({
        id: refundRequests.id,
        orderId: refundRequests.orderId,
        customerId: refundRequests.customerId,
        requestedBy: refundRequests.requestedBy,
        refundAmount: refundRequests.refundAmount,
        reason: refundRequests.reason,
        status: refundRequests.status,
        approvedBy: refundRequests.approvedBy,
        approvedAt: refundRequests.approvedAt,
        processedAt: refundRequests.processedAt,
        rejectionReason: refundRequests.rejectionReason,
        notes: refundRequests.notes,
        createdAt: refundRequests.createdAt,
        updatedAt: refundRequests.updatedAt,
        // Join customer data
        customerName: customers.name,
        // Join order data
        orderDate: allOrders.orderDate,
        paymentTotal: allOrders.paymentAmount,
      })
      .from(refundRequests)
      .leftJoin(customers, sql`${refundRequests.customerId}::text = ${customers.id}::text`)
      .leftJoin(allOrders, eq(refundRequests.orderId, allOrders.orderId))
      .orderBy(desc(refundRequests.createdAt));

    console.log(`✅ Found ${requests.length} refund requests`);
    res.json(requests);
  } catch (error) {
    console.error('❌ Error fetching refund requests:', error);
    res.status(500).json({ error: 'Failed to fetch refund requests' });
  }
});

// POST /api/refund-requests - Create a new refund request
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('📝 Creating new refund request:', req.body);
    
    // Validate request data
    const validatedData = insertRefundRequestSchema.parse(req.body);
    
    // For now, we'll use a hardcoded user. In production, this would come from auth
    const requestedBy = 'CSR'; // TODO: Get from authentication context
    
    const [newRequest] = await db
      .insert(refundRequests)
      .values({
        ...validatedData,
        requestedBy,
      })
      .returning();

    console.log('✅ Created refund request:', newRequest.id);
    res.status(201).json(newRequest);
  } catch (error) {
    console.error('❌ Error creating refund request:', error);
    res.status(500).json({ error: 'Failed to create refund request' });
  }
});

// POST /api/refund-requests/:id/approve - Approve a refund request
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log(`✅ Approving refund request ${id}`);
    
    // Get the refund request details
    const [refundRequest] = await db
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.id, parseInt(id)));

    if (!refundRequest) {
      return res.status(404).json({ error: 'Refund request not found' });
    }

    // Find the original payment transaction for this order
    const originalPayments = await db
      .select()
      .from(creditCardTransactions)
      .where(eq(creditCardTransactions.orderId, refundRequest.orderId))
      .orderBy(desc(creditCardTransactions.createdAt));

    if (originalPayments.length === 0) {
      console.error(`❌ No credit card transactions found for order ${refundRequest.orderId}`);
      return res.status(400).json({ 
        error: 'No original payment transaction found for this order. Refunds can only be processed for credit card payments.' 
      });
    }

    // Use the most recent successful payment transaction
    const originalPayment = originalPayments[0];
    
    // For now, we'll use a hardcoded manager. In production, this would come from auth
    const approvedBy = 'MANAGER'; // TODO: Get from authentication context
    
    // Update the refund request status to APPROVED first
    const [updatedRequest] = await db
      .update(refundRequests)
      .set({
        status: 'APPROVED',
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(refundRequests.id, parseInt(id)))
      .returning();

    console.log('✅ Approved refund request:', updatedRequest.id);

    // Process the actual refund through Authorize.Net
    if (apiLoginId && transactionKey && originalPayment.transactionId) {
      console.log(`🔄 Processing Authorize.Net refund for transaction ${originalPayment.transactionId}`);
      
      const refundResult = await processAuthorizeNetRefund(
        originalPayment.transactionId, 
        refundRequest.refundAmount
      );

      if (refundResult.success) {
        // Update the refund request with processing details
        await db
          .update(refundRequests)
          .set({
            status: 'PROCESSED',
            processedAt: new Date(),
            notes: `Refund processed successfully. Authorize.Net Transaction ID: ${refundResult.refundTransactionId}`,
            updatedAt: new Date(),
          })
          .where(eq(refundRequests.id, parseInt(id)));

        console.log('✅ Refund processed successfully through Authorize.Net');
        
        // Create a negative payment record to track the refund
        await db.insert(payments).values({
          orderId: refundRequest.orderId,
          paymentAmount: -refundRequest.refundAmount, // Negative amount for refund
          paymentMethod: 'CREDIT_CARD_REFUND',
          paymentDate: new Date(),
          notes: `Refund processed via Authorize.Net. Transaction ID: ${refundResult.refundTransactionId}`,
        });

        res.json({
          ...updatedRequest,
          status: 'PROCESSED',
          processedAt: new Date(),
          refundTransactionId: refundResult.refundTransactionId,
        });
      } else {
        // Update status to show processing failed
        await db
          .update(refundRequests)
          .set({
            status: 'APPROVED', // Keep as approved but add failure note
            notes: `Refund processing failed: ${refundResult.message}`,
            updatedAt: new Date(),
          })
          .where(eq(refundRequests.id, parseInt(id)));

        console.error('❌ Refund processing failed:', refundResult.message);
        res.status(500).json({ 
          error: 'Refund approval successful but processing failed',
          details: refundResult.message,
          refundRequest: updatedRequest
        });
      }
    } else {
      console.log('⚠️ Authorize.Net not configured or no transaction ID - refund approved but not processed');
      await db
        .update(refundRequests)
        .set({
          notes: 'Refund approved but automatic processing unavailable. Manual processing required.',
          updatedAt: new Date(),
        })
        .where(eq(refundRequests.id, parseInt(id)));
      
      res.json({
        ...updatedRequest,
        message: 'Refund approved successfully. Manual processing may be required.'
      });
    }
    
  } catch (error) {
    console.error('❌ Error approving refund request:', error);
    res.status(500).json({ error: 'Failed to approve refund request' });
  }
});

// POST /api/refund-requests/:id/reject - Reject a refund request
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    
    console.log(`❌ Rejecting refund request ${id}:`, rejectionReason);
    
    if (!rejectionReason?.trim()) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }
    
    // For now, we'll use a hardcoded manager. In production, this would come from auth
    const approvedBy = 'MANAGER'; // TODO: Get from authentication context
    
    const [updatedRequest] = await db
      .update(refundRequests)
      .set({
        status: 'REJECTED',
        approvedBy,
        approvedAt: new Date(),
        rejectionReason: rejectionReason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(refundRequests.id, parseInt(id)))
      .returning();

    if (!updatedRequest) {
      return res.status(404).json({ error: 'Refund request not found' });
    }

    console.log('❌ Rejected refund request:', updatedRequest.id);
    res.json(updatedRequest);
  } catch (error) {
    console.error('❌ Error rejecting refund request:', error);
    res.status(500).json({ error: 'Failed to reject refund request' });
  }
});

// GET /api/refund-requests/customer/:customerId - Get refund requests for a specific customer
router.get('/customer/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    console.log(`🔍 Getting refund requests for customer ${customerId}`);
    
    const requests = await db
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.customerId, customerId))
      .orderBy(desc(refundRequests.createdAt));

    console.log(`✅ Found ${requests.length} refund requests for customer ${customerId}`);
    res.json(requests);
  } catch (error) {
    console.error('❌ Error fetching customer refund requests:', error);
    res.status(500).json({ error: 'Failed to fetch customer refund requests' });
  }
});

export default router;