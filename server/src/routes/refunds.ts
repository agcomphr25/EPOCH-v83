import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  refundRequests,
  allOrders,
  customers,
  payments,
  creditCardTransactions,
  creditMemos,
  creditMemoApplications,
  internalMessages,
  messageRecipients,
} from '../../schema';
import { insertRefundRequestSchema } from '../../schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { refundTransaction, isConfigured as isAcceptBlueConfigured } from '../../utils/acceptBlue';
import { auditService } from '../services/auditService';

const GLENNJ_USER_ID = 13;
const SYSTEM_SENDER_ID = 0;
const SYSTEM_SENDER_NAME = 'System';

type RefundProcessingMethod = 'ACCEPT_BLUE' | 'EXTERNAL' | 'MANUAL';

async function getRefundPaymentContext(orderId: string): Promise<{
  paymentSource: string | null;
  processingMethod: RefundProcessingMethod;
  originalPaymentId: number | null;
}> {
  const positivePayments = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, orderId), sql`${payments.paymentAmount} > 0`))
    .orderBy(desc(payments.paymentDate));
  const originalPayment = positivePayments[0];
  if (!originalPayment) {
    return { paymentSource: null, processingMethod: 'MANUAL', originalPaymentId: null };
  }

  const [acceptBlueTransaction] = await db
    .select({ id: creditCardTransactions.id })
    .from(creditCardTransactions)
    .where(and(
      eq(creditCardTransactions.paymentId, originalPayment.id),
      eq(creditCardTransactions.responseCode, '1')
    ))
    .limit(1);
  const source = originalPayment.paymentType.trim().toLowerCase();
  return {
    paymentSource: originalPayment.paymentType,
    processingMethod: acceptBlueTransaction
      ? 'ACCEPT_BLUE'
      : source === 'agr' ? 'EXTERNAL' : 'MANUAL',
    originalPaymentId: originalPayment.id,
  };
}

export async function sendRefundInboxNotification(opts: {
  customerName: string;
  refundAmount: number;
  refundRequestId: number;
  isReminder?: boolean;
}) {
  const { customerName, refundAmount, refundRequestId, isReminder = false } = opts;
  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(refundAmount);
  const subject = isReminder
    ? 'Reminder: Refund Request Still Awaiting Approval'
    : 'New Refund Request Pending Approval';
  const messageBody = isReminder
    ? `This is a reminder that refund request #${refundRequestId} for ${customerName} (${formattedAmount}) is still awaiting your action.\n\nPlease review the request at /refund-queue.`
    : `A new refund request (#${refundRequestId}) has been submitted and requires your approval.\n\nCustomer: ${customerName}\nRefund Amount: ${formattedAmount}\n\nPlease review and take action at /refund-queue.`;

  const [msg] = await db
    .insert(internalMessages)
    .values({
      senderId: SYSTEM_SENDER_ID,
      senderName: SYSTEM_SENDER_NAME,
      recipientType: 'user',
      recipientUserId: GLENNJ_USER_ID,
      recipientName: 'glennj',
      subject,
      message: messageBody,
      isUrgent: false,
    })
    .returning();

  await db.insert(messageRecipients).values({
    messageId: msg.id,
    userId: GLENNJ_USER_ID,
    isRead: false,
    isAccomplished: false,
  });

  return msg;
}

const router = Router();

// ---------------------------------------------
// Refund Approval Authorization Guard
// ---------------------------------------------
function requireRefundApprovalRole(req: any, res: any): boolean {
  const user = req.user;
  const role = user?.role;

  if (!role || !['ADMIN', 'OWNER'].includes(role)) {
    res.status(403).json({
      error: 'Insufficient permissions to perform this action',
    });
    return false;
  }

  return true;
}

// Function to process refund through Accept.Blue
async function processAcceptBlueRefund(
  transactionId: string,
  refundAmount?: number
): Promise<{
  success: boolean;
  message: string;
  refundTransactionId?: string;
  refundReferenceNumber?: number;
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
      console.log('New Reference Number:', result.referenceNumber);
      return {
        success: true,
        message: 'Refund processed successfully',
        refundTransactionId: result.transactionId,
        refundReferenceNumber: result.referenceNumber,
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
        processingMethod: refundRequests.processingMethod,
        paymentSource: refundRequests.paymentSource,
        externalProcessor: refundRequests.externalProcessor,
        externalRefundReference: refundRequests.externalRefundReference,
        externalRefundDate: refundRequests.externalRefundDate,
        refundPaymentId: refundRequests.refundPaymentId,
        creditMemoId: refundRequests.creditMemoId,
        lastRemindedAt: refundRequests.lastRemindedAt,
        customerName: customers.name,
      })
      .from(refundRequests)
      .leftJoin(
        customers,
        sql`CAST(${refundRequests.customerId} AS INTEGER) = ${customers.id}`
      )
      .orderBy(desc(refundRequests.createdAt));

    console.log(`✅ Found ${requests.length} refund requests`);
    const enrichedRequests = await Promise.all(
      requests.map(async (request) => {
        if (request.status === 'PROCESSED' && request.processingMethod) return request;
        const context = await getRefundPaymentContext(request.orderId);
        return {
          ...request,
          processingMethod: request.processingMethod || context.processingMethod,
          paymentSource: request.paymentSource || context.paymentSource,
        };
      })
    );
    res.json(enrichedRequests);
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

    // Check that the order has actually been paid before allowing a refund request
    const orderPayments = await db
      .select({
        totalPaid: sql<number>`COALESCE(SUM(${payments.paymentAmount}), 0)`,
      })
      .from(payments)
      .where(eq(payments.orderId, validatedData.orderId));

    const totalPaid = orderPayments[0]?.totalPaid || 0;
    
    if (totalPaid <= 0) {
      console.log(`❌ Refund request blocked: Order ${validatedData.orderId} has no payments (Total paid: $${totalPaid})`);
      return res.status(400).json({ 
        error: 'Cannot create refund request for an order with no payments. The order must have at least one payment before a refund can be requested.' 
      });
    }

    // Validate that refund amount doesn't exceed total paid
    const refundAmount = validatedData.refundAmount || 0;
    if (refundAmount > totalPaid) {
      console.log(`❌ Refund request blocked: Requested $${refundAmount} exceeds total paid $${totalPaid}`);
      return res.status(400).json({ 
        error: `Refund amount ($${refundAmount.toFixed(2)}) cannot exceed total paid ($${totalPaid.toFixed(2)}).` 
      });
    }

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

    try {
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: validatedData.orderId,
        action: 'REFUND_REQUESTED',
        actor: { username: requestedBy },
        meta: {
          refundRequestId: newRequest.id,
          refundType: validatedData.refundType,
          amount: validatedData.refundAmount || validatedData.amount,
          reason: validatedData.reason,
        },
      });
    } catch (auditError) {
      console.error('[Audit] Failed to log refund request:', auditError);
    }

    // Notify @glennj (user ID 13) in the internal inbox
    try {
      let customerName = 'Unknown Customer';
      if (validatedData.customerId) {
        const [customer] = await db
          .select({ name: customers.name })
          .from(customers)
          .where(eq(customers.id, parseInt(validatedData.customerId)));
        if (customer?.name) customerName = customer.name;
      }
      await sendRefundInboxNotification({
        customerName,
        refundAmount: validatedData.refundAmount || validatedData.amount || 0,
        refundRequestId: newRequest.id,
        isReminder: false,
      });
      console.log(`📬 Inbox notification sent to glennj for refund request ${newRequest.id}`);
    } catch (notifyError) {
      console.error('[Refund Notify] Failed to send inbox notification:', notifyError);
    }

    res.status(201).json(newRequest);
  } catch (error) {
    console.error('❌ Error creating refund request:', error);
    res.status(500).json({ error: 'Failed to create refund request' });
  }
});

// POST /api/refund-requests/:id/approve - Approve a refund request
router.post('/:id/approve', async (req: Request, res: Response) => {
  if (!requireRefundApprovalRole(req, res)) return;
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

    const approvedBy = (req as any).user?.username || 'unknown';

    // Update the refund request status to APPROVED first
    const [updatedRequest] = await db
      .update(refundRequests)
      .set({
        status: 'APPROVED',
        approvedBy,
        approvedAt: new Date(),
        lastRemindedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(refundRequests.id, parseInt(id)))
      .returning();

    console.log('✅ Approved refund request:', updatedRequest.id);

    try {
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: refundRequest.orderId,
        action: 'REFUND_APPROVED',
        actor: { username: approvedBy },
        meta: {
          refundRequestId: parseInt(id),
          amount: refundRequest.refundAmount || refundRequest.amount,
          reason: refundRequest.reason,
        },
      });
    } catch (auditError) {
      console.error('[Audit] Failed to log refund approval:', auditError);
    }

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
  if (!requireRefundApprovalRole(req, res)) return;
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    console.log(`❌ Rejecting refund request ${id}:`, rejectionReason);

    if (!rejectionReason?.trim()) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const approvedBy = (req as any).user?.username || 'unknown';

    const [updatedRequest] = await db
      .update(refundRequests)
      .set({
        status: 'REJECTED',
        approvedBy,
        approvedAt: new Date(),
        rejectionReason: rejectionReason.trim(),
        lastRemindedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(refundRequests.id, parseInt(id)))
      .returning();

    if (!updatedRequest) {
      return res.status(404).json({ error: 'Refund request not found' });
    }

    console.log('❌ Rejected refund request:', updatedRequest.id);

    try {
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: updatedRequest.orderId,
        action: 'REFUND_REJECTED',
        actor: { username: approvedBy },
        meta: {
          refundRequestId: parseInt(id),
          rejectionReason: rejectionReason.trim(),
          amount: updatedRequest.refundAmount || updatedRequest.amount,
        },
      });
    } catch (auditError) {
      console.error('[Audit] Failed to log refund rejection:', auditError);
    }

    res.json(updatedRequest);
  } catch (error) {
    console.error('❌ Error rejecting refund request:', error);
    res.status(500).json({ error: 'Failed to reject refund request' });
  }
});

// POST /api/refund-requests/:id/complete - Record an externally or manually completed refund.
// Accept.Blue refunds must use /process so EPOCH cannot accidentally refund an AGR payment there.
router.post('/:id/complete', async (req: Request, res: Response) => {
  if (!requireRefundApprovalRole(req, res)) return;
  try {
    const refundRequestId = parseInt(req.params.id);
    const {
      refundReference,
      refundDate,
      processor,
      completionNotes,
      externalRefundConfirmed,
    } = req.body;

    if (!refundReference?.trim()) {
      return res.status(400).json({ error: 'Refund or bank reference is required' });
    }
    if (!refundDate || Number.isNaN(new Date(refundDate).getTime())) {
      return res.status(400).json({ error: 'A valid refund date is required' });
    }

    const [refundRequest] = await db
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.id, refundRequestId));
    if (!refundRequest) return res.status(404).json({ error: 'Refund request not found' });
    if (refundRequest.status !== 'APPROVED') {
      return res.status(409).json({ error: `Refund request is ${refundRequest.status}, not APPROVED` });
    }

    const paymentContext = await getRefundPaymentContext(refundRequest.orderId);
    if (paymentContext.processingMethod === 'ACCEPT_BLUE') {
      return res.status(400).json({
        error: 'This payment was processed by Accept.Blue. Use Process via Accept.Blue instead.',
      });
    }
    if (paymentContext.processingMethod === 'EXTERNAL' && externalRefundConfirmed !== true) {
      return res.status(400).json({
        error: 'Confirm that the refund was completed in the external processor before recording it.',
      });
    }
    if (paymentContext.processingMethod === 'EXTERNAL' && !processor?.trim()) {
      return res.status(400).json({ error: 'External processor name is required' });
    }

    const refundAmount = refundRequest.refundAmount || refundRequest.amount || 0;
    if (refundAmount <= 0) return res.status(400).json({ error: 'Refund amount must be greater than zero' });
    const [order] = await db.select().from(allOrders).where(eq(allOrders.orderId, refundRequest.orderId));
    const customerId = refundRequest.customerId || order?.customerId;
    if (!customerId) return res.status(400).json({ error: 'Order customer could not be determined' });

    const processedBy = (req as any).user?.username || 'unknown';
    const effectiveDate = new Date(refundDate);
    const method = paymentContext.processingMethod;
    const result = await db.transaction(async (tx) => {
      const [refundPayment] = await tx.insert(payments).values({
        orderId: refundRequest.orderId,
        paymentType: method === 'EXTERNAL' ? 'external_refund' : 'manual_refund',
        paymentAmount: -refundAmount,
        paymentDate: effectiveDate,
        referenceNumber: refundReference.trim(),
        notes: `${method === 'EXTERNAL' ? `External refund via ${processor.trim()}` : 'Manual refund'}; request #${refundRequestId}${completionNotes?.trim() ? `; ${completionNotes.trim()}` : ''}`,
      }).returning();

      const [memo] = await tx.insert(creditMemos).values({
        memoNumber: `REFUND-${refundRequestId}`,
        customerId: String(customerId),
        amount: refundAmount,
        appliedAmount: refundAmount,
        unappliedAmount: 0,
        reason: refundRequest.reason,
        notes: `Applied to ${refundRequest.orderId}; refund reference ${refundReference.trim()}`,
        status: 'fully_applied',
        sourceType: 'return',
        sourceReference: String(refundRequestId),
        issuedDate: effectiveDate,
        createdBy: processedBy,
      }).returning();

      await tx.insert(creditMemoApplications).values({
        creditMemoId: memo.id,
        orderId: refundRequest.orderId,
        amountApplied: refundAmount,
        appliedDate: effectiveDate,
        appliedBy: processedBy,
        notes: `Refund request #${refundRequestId}`,
      });

      // Applying the credit offsets the negative refund payment, preserving the original receipt
      // while reducing the order total by the same amount.
      await tx.insert(payments).values({
        orderId: refundRequest.orderId,
        paymentType: 'credit_memo',
        paymentAmount: refundAmount,
        paymentDate: effectiveDate,
        referenceNumber: memo.memoNumber,
        notes: `Credit Memo ${memo.memoNumber} applied for refund request #${refundRequestId}`,
      });

      const [updatedRequest] = await tx.update(refundRequests).set({
        status: 'PROCESSED',
        processedBy,
        processedAt: new Date(),
        processingMethod: method,
        paymentSource: paymentContext.paymentSource,
        externalProcessor: method === 'EXTERNAL' ? processor.trim() : null,
        externalRefundReference: refundReference.trim(),
        externalRefundDate: effectiveDate,
        refundPaymentId: refundPayment.id,
        creditMemoId: memo.id,
        notes: completionNotes?.trim() || refundRequest.notes,
        updatedAt: new Date(),
      }).where(eq(refundRequests.id, refundRequestId)).returning();
      return { updatedRequest, refundPayment, memo };
    });

    await auditService.logEvent({
      entityType: 'p1_order',
      entityId: refundRequest.orderId,
      action: method === 'EXTERNAL' ? 'EXTERNAL_REFUND_RECORDED' : 'MANUAL_REFUND_RECORDED',
      actor: { username: processedBy },
      meta: {
        refundRequestId,
        refundAmount,
        paymentSource: paymentContext.paymentSource,
        processor: method === 'EXTERNAL' ? processor.trim() : null,
        refundReference: refundReference.trim(),
        refundDate: effectiveDate.toISOString(),
        refundPaymentId: result.refundPayment.id,
        creditMemoId: result.memo.id,
      },
    });

    res.json({
      ...result.updatedRequest,
      message: 'Refund completion recorded and customer balance reconciled',
      creditMemoNumber: result.memo.memoNumber,
    });
  } catch (error) {
    console.error('Error completing recorded refund:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to complete refund' });
  }
});

// POST /api/refund-requests/:id/process - Process an approved refund through Accept.Blue
router.post('/:id/process', async (req: Request, res: Response) => {
  if (!requireRefundApprovalRole(req, res)) return;
  try {
    const { id } = req.params;
    console.log(`💳 Processing refund request ${id} through Accept.Blue`);

    // Get the refund request details
    const [refundRequest] = await db
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.id, parseInt(id)));

    if (!refundRequest) {
      return res.status(404).json({ error: 'Refund request not found' });
    }

    if (refundRequest.status !== 'APPROVED') {
      return res.status(400).json({ 
        error: `Cannot process refund - status is ${refundRequest.status}. Refund must be APPROVED first.` 
      });
    }

    const paymentContext = await getRefundPaymentContext(refundRequest.orderId);
    if (paymentContext.processingMethod !== 'ACCEPT_BLUE') {
      return res.status(400).json({
        error: `Accept.Blue cannot process this ${paymentContext.paymentSource || 'unknown'} payment. Record the completed refund instead.`,
      });
    }

    // Check if Accept.Blue is configured
    if (!isAcceptBlueConfigured()) {
      return res.status(500).json({ 
        error: 'Accept.Blue payment gateway is not configured. Please contact support.' 
      });
    }

    // Find the original credit card transaction for this order
    const ccTransactions = await db
      .select()
      .from(creditCardTransactions)
      .where(eq(creditCardTransactions.orderId, refundRequest.orderId))
      .orderBy(desc(creditCardTransactions.createdAt));

    if (ccTransactions.length === 0) {
      return res.status(400).json({ 
        error: 'No credit card transaction found for this order. This order may have been paid by a different method.' 
      });
    }

    // Use the most recent successful transaction
    const originalTransaction = ccTransactions.find(t => t.responseCode === '1') || ccTransactions[0];
    
    // Extract the reference number from the transaction ID
    // Accept.Blue uses reference_number for refunds, not transaction_id
    // The transactionId field may contain the reference number or a formatted ID
    let referenceNumber = originalTransaction.transactionId;
    
    // If it's a bulk payment format like "12345678-ORD001", extract just the reference number
    if (referenceNumber.includes('-')) {
      referenceNumber = referenceNumber.split('-')[0];
    }

    console.log(`📝 Found original transaction: ${referenceNumber} for order ${refundRequest.orderId}`);

    // Determine refund amount (use refundAmount or amount field)
    const refundAmount = refundRequest.refundAmount || refundRequest.amount || originalTransaction.amount;

    // Process the refund through Accept.Blue
    const result = await processAcceptBlueRefund(referenceNumber, refundAmount);

    if (!result.success) {
      console.error(`❌ Accept.Blue refund failed: ${result.message}`);
      return res.status(400).json({ 
        error: `Refund processing failed: ${result.message}` 
      });
    }

    // Record the refund in the payments table (negative amount) so order balance updates
    // This is MANDATORY - the order's "total due" is calculated from the payments table
    let refundPaymentId: number;
    try {
      const [refundPayment] = await db
        .insert(payments)
        .values({
          orderId: refundRequest.orderId,
          paymentType: 'refund',
          paymentAmount: -refundAmount, // Negative amount reduces the total paid
          paymentDate: new Date(),
          notes: `Refund via Accept.Blue. Original ref# ${referenceNumber}. Refund ref# ${result.refundReferenceNumber || 'N/A'}`,
        })
        .returning();
      refundPaymentId = refundPayment.id;
      console.log(`📝 Recorded refund payment (ID: ${refundPaymentId}) for order ${refundRequest.orderId}`);
    } catch (paymentInsertError) {
      // This is critical - if we can't record the payment, the order balance won't update
      // The Accept.Blue refund succeeded, so we need to alert the user to manually reconcile
      console.error('❌ CRITICAL: Failed to record refund payment:', paymentInsertError);
      return res.status(500).json({ 
        error: `Refund was processed by Accept.Blue (Ref# ${result.refundReferenceNumber || 'N/A'}), but failed to update order balance. Please manually add a refund payment of -$${refundAmount} to order ${refundRequest.orderId}.`,
        refundProcessed: true,
        refundReferenceNumber: result.refundReferenceNumber,
        requiresManualReconciliation: true,
      });
    }

    // Record the refund transaction in creditCardTransactions for audit/ledger purposes
    // Use the actual Accept.Blue reference number as the transactionId for proper reconciliation
    const refundTransactionIdForDb = result.refundReferenceNumber 
      ? String(result.refundReferenceNumber)
      : (result.refundTransactionId || `REFUND-${Date.now()}`);
    
    try {
      await db
        .insert(creditCardTransactions)
        .values({
          paymentId: refundPaymentId, // Link to refund payment (now mandatory)
          orderId: refundRequest.orderId,
          transactionId: refundTransactionIdForDb, // Actual Accept.Blue reference number
          authCode: result.refundTransactionId || 'REFUND', // Store transaction ID in authCode
          responseCode: 'R', // Use 'R' to indicate refund (not '1' which is for charges)
          responseReasonCode: 'REFUND',
          responseReasonText: `Refund for original ref# ${referenceNumber}. Amount: $${refundAmount}`,
          cardType: originalTransaction.cardType,
          lastFourDigits: originalTransaction.lastFourDigits,
          amount: -refundAmount, // Negative amount to indicate refund
          customerEmail: originalTransaction.customerEmail,
          billingFirstName: originalTransaction.billingFirstName,
          billingLastName: originalTransaction.billingLastName,
          billingAddress: originalTransaction.billingAddress,
          billingCity: originalTransaction.billingCity,
          billingState: originalTransaction.billingState,
          billingZip: originalTransaction.billingZip,
        });
      console.log(`📝 Recorded refund transaction: ${refundTransactionIdForDb} (Accept.Blue ref#)`);
    } catch (insertError) {
      console.error('⚠️ Failed to record refund transaction (continuing):', insertError);
      // Continue even if insert fails - the refund was already processed
    }

    // Match the cash refund with a fully-applied credit memo so the original
    // receipt and refund both remain visible while the order balance stays closed.
    const [order] = await db.select().from(allOrders).where(eq(allOrders.orderId, refundRequest.orderId));
    const customerId = refundRequest.customerId || order?.customerId;
    if (!customerId) {
      return res.status(500).json({
        error: `Refund was processed by Accept.Blue, but customer accounting could not be determined for ${refundRequest.orderId}. Manual reconciliation is required.`,
        refundProcessed: true,
        requiresManualReconciliation: true,
      });
    }
    let refundCreditMemoId: number;
    try {
      refundCreditMemoId = await db.transaction(async (tx) => {
        const [memo] = await tx.insert(creditMemos).values({
          memoNumber: `REFUND-${id}`,
          customerId: String(customerId),
          amount: refundAmount,
          appliedAmount: refundAmount,
          unappliedAmount: 0,
          reason: refundRequest.reason,
          notes: `Applied to ${refundRequest.orderId}; Accept.Blue refund ${refundTransactionIdForDb}`,
          status: 'fully_applied',
          sourceType: 'return',
          sourceReference: String(id),
          issuedDate: new Date(),
          createdBy: (req as any).user?.username || 'PROCESSOR',
        }).returning();
        await tx.insert(creditMemoApplications).values({
          creditMemoId: memo.id,
          orderId: refundRequest.orderId,
          amountApplied: refundAmount,
          appliedBy: (req as any).user?.username || 'PROCESSOR',
          notes: `Accept.Blue refund request #${id}`,
        });
        await tx.insert(payments).values({
          orderId: refundRequest.orderId,
          paymentType: 'credit_memo',
          paymentAmount: refundAmount,
          paymentDate: new Date(),
          referenceNumber: memo.memoNumber,
          notes: `Credit Memo ${memo.memoNumber} applied for refund request #${id}`,
        });
        return memo.id;
      });
    } catch (accountingError) {
      console.error('CRITICAL: Accept.Blue refund completed but credit memo failed:', accountingError);
      return res.status(500).json({
        error: `Refund was processed by Accept.Blue (Ref# ${refundTransactionIdForDb}), but the credit memo failed. Manual reconciliation is required.`,
        refundProcessed: true,
        requiresManualReconciliation: true,
      });
    }

    // Update the refund request with processing details
    const processedBy = (req as any).user?.username || 'PROCESSOR';
    
    const [updatedRequest] = await db
      .update(refundRequests)
      .set({
        status: 'PROCESSED',
        processedBy,
        processedAt: new Date(),
        authNetTransactionId: result.refundTransactionId, // Store the Accept.Blue transaction ID
        authNetRefundId: result.refundReferenceNumber ? String(result.refundReferenceNumber) : undefined, // Store the Accept.Blue reference number
        originalTransactionId: referenceNumber,
        processingMethod: 'ACCEPT_BLUE',
        paymentSource: paymentContext.paymentSource,
        refundPaymentId,
        creditMemoId: refundCreditMemoId,
        notes: `Refund processed via Accept.Blue. Refund Ref#: ${result.refundReferenceNumber || 'N/A'}. Trans ID: ${result.refundTransactionId || 'N/A'}. Amount: $${refundAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(refundRequests.id, parseInt(id)))
      .returning();

    console.log(`✅ Refund request ${id} processed successfully`);

    try {
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: refundRequest.orderId,
        action: 'REFUND_PROCESSED',
        actor: { username: processedBy },
        meta: {
          refundRequestId: parseInt(id),
          refundAmount,
          originalTransactionId: referenceNumber,
          refundTransactionId: result.refundTransactionId,
          refundReferenceNumber: result.refundReferenceNumber,
        },
      });
    } catch (auditError) {
      console.error('[Audit] Failed to log refund processing:', auditError);
    }

    res.json({
      ...updatedRequest,
      message: 'Refund processed successfully through Accept.Blue',
      refundTransactionId: result.refundTransactionId,
      refundReferenceNumber: result.refundReferenceNumber,
      refundAmount,
    });

  } catch (error) {
    console.error('❌ Error processing refund:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to process refund' 
    });
  }
});

// GET /api/refund-requests/eligible/:orderId - Get eligible transactions for refund
router.get('/eligible/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    console.log(`🔍 Getting eligible transactions for refund on order ${orderId}`);

    // Get all credit card transactions for this order (only charges, not refunds)
    // responseCode '1' = approved charge, 'R' = refund (exclude refunds from eligible list)
    const transactions = await db
      .select({
        id: creditCardTransactions.id,
        transactionId: creditCardTransactions.transactionId,
        amount: creditCardTransactions.amount,
        cardType: creditCardTransactions.cardType,
        lastFourDigits: creditCardTransactions.lastFourDigits,
        responseCode: creditCardTransactions.responseCode,
        createdAt: creditCardTransactions.createdAt,
      })
      .from(creditCardTransactions)
      .where(
        and(
          eq(creditCardTransactions.orderId, orderId),
          eq(creditCardTransactions.responseCode, '1') // Only approved charges (not 'R' refunds)
        )
      )
      .orderBy(desc(creditCardTransactions.createdAt));

    // Get payment details for each transaction
    const eligibleTransactions = transactions.map(t => ({
      ...t,
      referenceNumber: t.transactionId.includes('-') ? t.transactionId.split('-')[0] : t.transactionId,
      displayInfo: `${t.cardType || 'Card'} ending in ${t.lastFourDigits || '****'} - $${t.amount}`,
    }));

    console.log(`✅ Found ${eligibleTransactions.length} eligible transactions for order ${orderId}`);
    res.json(eligibleTransactions);

  } catch (error) {
    console.error('❌ Error fetching eligible transactions:', error);
    res.status(500).json({ error: 'Failed to fetch eligible transactions' });
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

// GET /api/refund-requests/order/:orderId - Get refund requests for a specific order
router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    console.log(`🔍 Getting refund requests for order ${orderId}`);

    const requests = await db
      .select({
        id: refundRequests.id,
        orderId: refundRequests.orderId,
        refundType: refundRequests.refundType,
        amount: refundRequests.amount,
        refundAmount: refundRequests.refundAmount,
        reason: refundRequests.reason,
        notes: refundRequests.notes,
        status: refundRequests.status,
        requestedBy: refundRequests.requestedBy,
        requestedAt: refundRequests.requestedAt,
        approvedBy: refundRequests.approvedBy,
        approvedAt: refundRequests.approvedAt,
        processedBy: refundRequests.processedBy,
        processedAt: refundRequests.processedAt,
        createdAt: refundRequests.createdAt,
      })
      .from(refundRequests)
      .where(eq(refundRequests.orderId, orderId))
      .orderBy(desc(refundRequests.createdAt));

    console.log(`✅ Found ${requests.length} refund requests for order ${orderId}`);
    res.json(requests);
  } catch (error) {
    console.error('❌ Error fetching order refund requests:', error);
    res.status(500).json({ error: 'Failed to fetch order refund requests' });
  }
});

export default router;
