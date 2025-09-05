import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { refundRequests, allOrders, customers } from '../../schema';
import { insertRefundRequestSchema } from '../../schema';
import { eq, desc, and } from 'drizzle-orm';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

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
      .leftJoin(customers, eq(refundRequests.customerId, customers.id))
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
    
    // For now, we'll use a hardcoded manager. In production, this would come from auth
    const approvedBy = 'MANAGER'; // TODO: Get from authentication context
    
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

    if (!updatedRequest) {
      return res.status(404).json({ error: 'Refund request not found' });
    }

    console.log('✅ Approved refund request:', updatedRequest.id);
    
    // TODO: Process the actual refund through Authorize.Net here
    // This would call the Authorize.Net API to process the refund
    
    res.json(updatedRequest);
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