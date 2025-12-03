import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  refundRequests,
  allOrders,
  customers,
  payments,
  creditCardTransactions,
} from '../../schema';
import { insertRefundRequestSchema } from '../../schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { refundTransaction, isConfigured as isAcceptBlueConfigured } from '../../utils/acceptBlue';

const router = Router();

// Function to process refund through Accept.Blue
async function processAcceptBlueRefund(
  transactionId: string,
  refundAmount?: number
): Promise<{
  success: boolean;
  message: string;
  refundTransactionId?: string;
}> {
  try {
    if (!isAcceptBlueConfigured()) {
      throw new Error('Accept.Blue credentials not configured');
    }

    console.log(
      `🔄 Processing Accept.Blue refund for transaction ${transactionId}${refundAmount ? `, amount: $${refundAmount}` : ' (full refund)'}`
    );

    const result = await refundTransaction(transactionId, refundAmount);

    if (result.success) {
      console.log('✅ Refund processed successfully');
      console.log('New Transaction ID:', result.transactionId);
      return {
        success: true,
        message: 'Refund processed successfully',
        refundTransactionId: result.transactionId,
      };
    } else {
      console.error('❌ Refund failed:', result.message);
      return {
        success: false,
        message: result.message,
      };
    }
  } catch (error) {
    console.error('❌ Error processing Accept.Blue refund:', error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Unknown error processing refund',
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
        refundType: refundRequests.refundType,
        amount: refundRequests.amount,
        reason: refundRequests.reason,
        notes: refundRequests.notes,
        status: refundRequests.status,
        requestedBy: refundRequests.requestedBy,
        requestedAt: refundRequests.requestedAt,
        approvedBy: refundRequests.approvedBy,
        approvedAt: refundRequests.approvedAt,
        processedBy: refundRequests.processedBy,
        processedAt: refundRequests.processedAt,
        transactionId: refundRequests.transactionId,
        createdAt: refundRequests.createdAt,
        updatedAt: refundRequests.updatedAt,
        customerId: refundRequests.customerId,
        refundAmount: refundRequests.refundAmount,
        rejectionReason: refundRequests.rejectionReason,
        authNetTransactionId: refundRequests.authNetTransactionId,
        authNetRefundId: refundRequests.authNetRefundId,
        originalTransactionId: refundRequests.originalTransactionId,
        customerName: customers.name,
      })
      .from(refundRequests)
      .leftJoin(
        customers,
        sql`CAST(${refundRequests.customerId} AS INTEGER) = ${customers.id}`
      )
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

    // REMOVED: Credit card transaction check since manual processing handles all payment types

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

    // REMOVED: Automatic Authorize.Net processing
    // Refunds are now approved for manual processing outside of Epoch
    console.log('📝 Refund approved for manual processing outside of Epoch');
    await db
      .update(refundRequests)
      .set({
        notes:
          'Refund approved and recorded for manual processing outside of Epoch system.',
        updatedAt: new Date(),
      })
      .where(eq(refundRequests.id, parseInt(id)));

    res.json({
      ...updatedRequest,
      message:
        'Refund approved successfully and recorded for manual processing.',
    });
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

    console.log(
      `✅ Found ${requests.length} refund requests for customer ${customerId}`
    );
    res.json(requests);
  } catch (error) {
    console.error('❌ Error fetching customer refund requests:', error);
    res.status(500).json({ error: 'Failed to fetch customer refund requests' });
  }
});

export default router;
