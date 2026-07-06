import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { 
  signatureRequests, 
  signatureSigners, 
  signatureActivityLog,
  mediaLibrary,
  employees,
  insertSignatureRequestSchema,
  insertSignatureSignerSchema
} from '../../schema';
import { eq, desc, and, or, sql, asc } from 'drizzle-orm';
import { z } from 'zod';
import { PDFDocument, rgb } from 'pdf-lib';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const router = Router();

// Create signature request validation schema
const createSignatureRequestSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  documentType: z.enum(['media', 'form_instance', 'generated_pdf']),
  mediaId: z.string().uuid().optional(),
  formInstanceId: z.string().optional(),
  originalDocumentPath: z.string().min(1, 'Document is required'),
  orderId: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  reminderEnabled: z.boolean().default(true),
  initiatedById: z.number().optional(),
  initiatedByName: z.string().min(1, 'Initiator name is required'),
  signers: z.array(z.object({
    employeeId: z.number().optional(),
    signerName: z.string().min(1, 'Signer name is required'),
    signerEmail: z.string().email().optional().or(z.literal('')),
    signOrder: z.number().min(1),
  })).min(1, 'At least one signer is required'),
});

// GET /api/signature-workflow - List all signature requests
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, initiatedById } = req.query;
    
    let conditions = [];
    
    if (status && status !== 'all') {
      conditions.push(eq(signatureRequests.status, status as string));
    }
    
    if (initiatedById) {
      conditions.push(eq(signatureRequests.initiatedById, parseInt(initiatedById as string)));
    }
    
    const requests = await db
      .select()
      .from(signatureRequests)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(signatureRequests.createdAt));
    
    // Get signers for each request
    const requestsWithSigners = await Promise.all(
      requests.map(async (request) => {
        const signers = await db
          .select()
          .from(signatureSigners)
          .where(eq(signatureSigners.signatureRequestId, request.id))
          .orderBy(asc(signatureSigners.signOrder));
        
        return { ...request, signers };
      })
    );
    
    res.json(requestsWithSigners);
  } catch (error: any) {
    console.error('Error fetching signature requests:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch signature requests' });
  }
});

// GET /api/signature-workflow/pending/:employeeId - Get current document signature tasks for an employee
router.get('/pending/:employeeId', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    
    // Find all signature signers where this employee is the current signer
    const currentSignatureTasks = await db
      .select({
        signer: signatureSigners,
        request: signatureRequests,
      })
      .from(signatureSigners)
      .innerJoin(signatureRequests, eq(signatureSigners.signatureRequestId, signatureRequests.id))
      .where(
        and(
          eq(signatureSigners.employeeId, parseInt(employeeId)),
          eq(signatureSigners.status, 'current'),
          or(
            eq(signatureRequests.status, 'pending'),
            eq(signatureRequests.status, 'in_progress')
          )
        )
      )
      .orderBy(desc(signatureRequests.createdAt));
    
    // Format for My Tasks display
    const tasks = currentSignatureTasks.map(({ signer, request }) => ({
      id: signer.id,
      type: 'signature_request',
      title: `Sign: ${request.title}`,
      description: request.description,
      dueDate: request.dueDate,
      priority: request.dueDate && new Date(request.dueDate) < new Date() ? 'overdue' : 'normal',
      requestId: request.id,
      signOrder: signer.signOrder,
      initiatedBy: request.initiatedByName,
      createdAt: request.createdAt,
      status: signer.status,
    }));
    
    res.json(tasks);
  } catch (error: any) {
    console.error('Error fetching document signature tasks:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch document signature tasks' });
  }
});

// GET /api/signature-workflow/:id - Get a specific signature request with signers
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [request] = await db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, id));
    
    if (!request) {
      return res.status(404).json({ error: 'Signature request not found' });
    }
    
    const signers = await db
      .select()
      .from(signatureSigners)
      .where(eq(signatureSigners.signatureRequestId, id))
      .orderBy(asc(signatureSigners.signOrder));
    
    const activityLog = await db
      .select()
      .from(signatureActivityLog)
      .where(eq(signatureActivityLog.signatureRequestId, id))
      .orderBy(desc(signatureActivityLog.createdAt));
    
    res.json({ ...request, signers, activityLog });
  } catch (error: any) {
    console.error('Error fetching signature request:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch signature request' });
  }
});

// POST /api/signature-workflow - Create a new signature request
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createSignatureRequestSchema.parse(req.body);
    
    // Create the signature request
    const [newRequest] = await db.insert(signatureRequests).values({
      title: data.title,
      description: data.description,
      documentType: data.documentType,
      mediaId: data.mediaId,
      formInstanceId: data.formInstanceId,
      originalDocumentPath: data.originalDocumentPath,
      currentDocumentPath: data.originalDocumentPath,
      orderId: data.orderId,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      reminderEnabled: data.reminderEnabled,
      initiatedById: data.initiatedById,
      initiatedByName: data.initiatedByName,
      status: 'in_progress',
      currentSignerOrder: 1,
    }).returning();
    
    // Create signers
    const signerPromises = data.signers.map((signer, index) => {
      return db.insert(signatureSigners).values({
        signatureRequestId: newRequest.id,
        employeeId: signer.employeeId,
        signerName: signer.signerName,
        signerEmail: signer.signerEmail || null,
        signOrder: signer.signOrder,
        status: signer.signOrder === 1 ? 'current' : 'pending',
        notifiedAt: signer.signOrder === 1 ? new Date() : null,
      }).returning();
    });
    
    const signers = await Promise.all(signerPromises);
    
    // Log the creation
    await db.insert(signatureActivityLog).values({
      signatureRequestId: newRequest.id,
      action: 'created',
      performedById: data.initiatedById,
      performedByName: data.initiatedByName,
      details: { signerCount: data.signers.length },
    });
    
    res.status(201).json({
      ...newRequest,
      signers: signers.map(s => s[0]),
    });
  } catch (error: any) {
    console.error('Error creating signature request:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to create signature request' });
  }
});

// POST /api/signature-workflow/:id/sign - Sign a document (for current signer)
router.post('/:id/sign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { signerId, signatureData, notes, employeeId, signerName } = req.body;
    
    if (!signatureData) {
      return res.status(400).json({ error: 'Signature data is required' });
    }
    
    // Get the request
    const [request] = await db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, id));
    
    if (!request) {
      return res.status(404).json({ error: 'Signature request not found' });
    }
    
    if (request.status === 'completed' || request.status === 'cancelled') {
      return res.status(400).json({ error: 'This signature request is already completed or cancelled' });
    }
    
    // Get the signer
    const [signer] = await db
      .select()
      .from(signatureSigners)
      .where(
        and(
          eq(signatureSigners.signatureRequestId, id),
          signerId 
            ? eq(signatureSigners.id, signerId)
            : eq(signatureSigners.employeeId, employeeId)
        )
      );
    
    if (!signer) {
      return res.status(404).json({ error: 'Signer not found for this request' });
    }
    
    if (signer.status !== 'current') {
      return res.status(400).json({ error: 'It is not your turn to sign yet' });
    }
    
    // Update the signer record
    await db
      .update(signatureSigners)
      .set({
        status: 'completed',
        signatureData,
        signedAt: new Date(),
        signatureNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(signatureSigners.id, signer.id));
    
    // Log the signature
    await db.insert(signatureActivityLog).values({
      signatureRequestId: id,
      signerId: signer.id,
      action: 'signed',
      performedById: employeeId,
      performedByName: signerName || signer.signerName,
      details: { notes },
    });
    
    // Get all signers to check if there's a next one
    const allSigners = await db
      .select()
      .from(signatureSigners)
      .where(eq(signatureSigners.signatureRequestId, id))
      .orderBy(asc(signatureSigners.signOrder));
    
    const nextSigner = allSigners.find(s => s.signOrder > signer.signOrder && s.status === 'pending');
    
    if (nextSigner) {
      // Move to next signer
      await db
        .update(signatureSigners)
        .set({
          status: 'current',
          notifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(signatureSigners.id, nextSigner.id));
      
      await db
        .update(signatureRequests)
        .set({
          currentSignerOrder: nextSigner.signOrder,
          updatedAt: new Date(),
        })
        .where(eq(signatureRequests.id, id));
      
      // Log the routing
      await db.insert(signatureActivityLog).values({
        signatureRequestId: id,
        signerId: nextSigner.id,
        action: 'sent',
        performedByName: 'System',
        details: { nextSignerName: nextSigner.signerName, signOrder: nextSigner.signOrder },
      });
    } else {
      // All signatures complete - apply signatures to document and mark complete
      const updatedDocPath = await applyAllSignaturesToDocument(request, allSigners);
      
      await db
        .update(signatureRequests)
        .set({
          status: 'completed',
          completedAt: new Date(),
          currentDocumentPath: updatedDocPath,
          updatedAt: new Date(),
        })
        .where(eq(signatureRequests.id, id));
      
      // Log completion
      await db.insert(signatureActivityLog).values({
        signatureRequestId: id,
        action: 'completed',
        performedByName: 'System',
        details: { totalSigners: allSigners.length },
      });
    }
    
    res.json({ success: true, message: 'Signature recorded successfully' });
  } catch (error: any) {
    console.error('Error recording signature:', error);
    res.status(500).json({ error: error.message || 'Failed to record signature' });
  }
});

// POST /api/signature-workflow/:id/reject - Reject a signature request
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { signerId, reason, employeeId, signerName } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }
    
    // Get the signer
    const [signer] = await db
      .select()
      .from(signatureSigners)
      .where(
        and(
          eq(signatureSigners.signatureRequestId, id),
          signerId 
            ? eq(signatureSigners.id, signerId)
            : eq(signatureSigners.employeeId, employeeId)
        )
      );
    
    if (!signer) {
      return res.status(404).json({ error: 'Signer not found for this request' });
    }
    
    if (signer.status !== 'current') {
      return res.status(400).json({ error: 'It is not your turn to sign' });
    }
    
    // Update the signer record
    await db
      .update(signatureSigners)
      .set({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(signatureSigners.id, signer.id));
    
    // Update the request status
    await db
      .update(signatureRequests)
      .set({
        status: 'rejected',
        cancelledAt: new Date(),
        cancelReason: `Rejected by ${signerName || signer.signerName}: ${reason}`,
        updatedAt: new Date(),
      })
      .where(eq(signatureRequests.id, id));
    
    // Log the rejection
    await db.insert(signatureActivityLog).values({
      signatureRequestId: id,
      signerId: signer.id,
      action: 'rejected',
      performedById: employeeId,
      performedByName: signerName || signer.signerName,
      details: { reason },
    });
    
    res.json({ success: true, message: 'Signature request rejected' });
  } catch (error: any) {
    console.error('Error rejecting signature request:', error);
    res.status(500).json({ error: error.message || 'Failed to reject signature request' });
  }
});

// POST /api/signature-workflow/:id/cancel - Cancel a signature request (by initiator)
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, employeeId, employeeName } = req.body;
    
    const [request] = await db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, id));
    
    if (!request) {
      return res.status(404).json({ error: 'Signature request not found' });
    }
    
    if (request.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel a completed request' });
    }
    
    await db
      .update(signatureRequests)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: reason || 'Cancelled by initiator',
        updatedAt: new Date(),
      })
      .where(eq(signatureRequests.id, id));
    
    // Log the cancellation
    await db.insert(signatureActivityLog).values({
      signatureRequestId: id,
      action: 'cancelled',
      performedById: employeeId,
      performedByName: employeeName || request.initiatedByName,
      details: { reason },
    });
    
    res.json({ success: true, message: 'Signature request cancelled' });
  } catch (error: any) {
    console.error('Error cancelling signature request:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel signature request' });
  }
});

// GET /api/signature-workflow/:id/activity - Get activity log for a signature request
router.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const activity = await db
      .select()
      .from(signatureActivityLog)
      .where(eq(signatureActivityLog.signatureRequestId, id))
      .orderBy(desc(signatureActivityLog.createdAt));
    
    res.json(activity);
  } catch (error: any) {
    console.error('Error fetching activity log:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch activity log' });
  }
});

// GET /api/signature-workflow/stats/:employeeId - Get signature stats for an employee
router.get('/stats/:employeeId', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const empId = parseInt(employeeId);
    
    // Pending signatures where this employee is current signer
    const pendingCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(signatureSigners)
      .innerJoin(signatureRequests, eq(signatureSigners.signatureRequestId, signatureRequests.id))
      .where(
        and(
          eq(signatureSigners.employeeId, empId),
          eq(signatureSigners.status, 'current'),
          or(
            eq(signatureRequests.status, 'pending'),
            eq(signatureRequests.status, 'in_progress')
          )
        )
      );
    
    // Completed signatures by this employee
    const completedCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(signatureSigners)
      .where(
        and(
          eq(signatureSigners.employeeId, empId),
          eq(signatureSigners.status, 'completed')
        )
      );
    
    // Requests initiated by this employee
    const initiatedCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(signatureRequests)
      .where(eq(signatureRequests.initiatedById, empId));
    
    res.json({
      pending: Number(pendingCount[0]?.count || 0),
      completed: Number(completedCount[0]?.count || 0),
      initiated: Number(initiatedCount[0]?.count || 0),
    });
  } catch (error: any) {
    console.error('Error fetching signature stats:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch signature stats' });
  }
});

// Helper function to apply all signatures to a document
async function applyAllSignaturesToDocument(
  request: typeof signatureRequests.$inferSelect,
  signers: (typeof signatureSigners.$inferSelect)[]
): Promise<string | null> {
  try {
    if (!request.currentDocumentPath) {
      return null;
    }
    
    const docPath = path.join(process.cwd(), request.currentDocumentPath);
    if (!fs.existsSync(docPath)) {
      console.error('Document not found:', docPath);
      return request.currentDocumentPath;
    }
    
    const fileBuffer = fs.readFileSync(docPath);
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    
    const completedSigners = signers.filter(s => s.status === 'completed' && s.signatureData);
    
    let yOffset = 50;
    const sigWidth = 120;
    const sigHeight = 40;
    const margin = 50;
    
    for (const signer of completedSigners) {
      if (!signer.signatureData) continue;
      
      const base64Match = signer.signatureData.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
      if (!base64Match) continue;
      
      const signatureBytes = Buffer.from(base64Match[2], 'base64');
      
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const isPng = signatureBytes.slice(0, 8).equals(pngMagic);
      
      let signatureImage;
      if (isPng) {
        signatureImage = await pdfDoc.embedPng(signatureBytes);
      } else {
        signatureImage = await pdfDoc.embedJpg(signatureBytes);
      }
      
      lastPage.drawImage(signatureImage, {
        x: margin,
        y: yOffset,
        width: sigWidth,
        height: sigHeight,
      });
      
      const signedDate = signer.signedAt 
        ? new Date(signer.signedAt).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'N/A';
      
      lastPage.drawText(`${signer.signerName} - ${signedDate}`, {
        x: margin + sigWidth + 10,
        y: yOffset + sigHeight / 2,
        size: 8,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      yOffset += sigHeight + 20;
    }
    
    const signedPdfBytes = await pdfDoc.save();
    
    const uploadDir = path.join(process.cwd(), 'uploads', 'signed-workflows');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const filename = `workflow-${request.id}-signed-${Date.now()}.pdf`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, signedPdfBytes);
    
    return `uploads/signed-workflows/${filename}`;
  } catch (error) {
    console.error('Error applying signatures to document:', error);
    return request.currentDocumentPath;
  }
}

export default router;
