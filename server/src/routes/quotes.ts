import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { quotes, quoteLineItems, insertQuoteSchema, insertQuoteLineItemSchema } from '../../schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { randomUUID } from 'crypto';
import { uploadMiddleware } from '../../utils/fileUpload';
import path from 'path';
import fs from 'fs';

const router = Router();

// Generate unique quote number
async function generateQuoteNumber(): Promise<string> {
  const prefix = 'QUO';
  const year = new Date().getFullYear().toString().slice(-2);
  
  // Get all quotes for this year and find the highest number
  const allQuotes = await db
    .select()
    .from(quotes)
    .orderBy(desc(quotes.createdAt));

  let nextNumber = 1;
  const yearPattern = `${prefix}${year}`;
  
  // Find quotes matching this year's pattern and extract the highest sequence number
  for (const quote of allQuotes) {
    if (quote.quoteNumber && quote.quoteNumber.startsWith(yearPattern)) {
      const sequenceStr = quote.quoteNumber.slice(yearPattern.length);
      const sequenceNum = parseInt(sequenceStr, 10);
      if (!isNaN(sequenceNum) && sequenceNum >= nextNumber) {
        nextNumber = sequenceNum + 1;
      }
    }
  }

  return `${prefix}${year}${nextNumber.toString().padStart(4, '0')}`;
}

// Get all quotes
router.get('/api/quotes', async (req: Request, res: Response) => {
  try {
    const allQuotes = await db
      .select()
      .from(quotes)
      .orderBy(desc(quotes.createdAt));

    res.json(allQuotes);
  } catch (error) {
    console.error('Get quotes error:', error);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

// Get single quote with line items
router.get('/api/quotes/:id', async (req: Request, res: Response) => {
  try {
    const quoteId = req.params.id;

    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId));

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const lineItems = await db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, quoteId))
      .orderBy(quoteLineItems.lineNumber);

    res.json({ ...quote, lineItems });
  } catch (error) {
    console.error('Get quote error:', error);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// Save quote (create or update as draft)
router.post('/api/quotes/save', async (req: Request, res: Response) => {
  try {
    // Validate request body structure
    const requestBody = req.body;
    if (!requestBody) {
      return res.status(400).json({ error: 'Request body is required' });
    }

    const {
      id,
      rfqNumber,
      customerId,
      customerName,
      customerCompany,
      fromName,
      fromEmail,
      fromPhone,
      paymentTerms,
      notes,
      validityDays,
      lineItems: items = [],
    } = requestBody;

    // Validate line items if present
    if (items.length > 0) {
      for (const item of items) {
        const validation = insertQuoteLineItemSchema.safeParse({
          quoteId: id || randomUUID(), // Temporary UUID for validation
          lineNumber: parseInt(String(item.lineNumber || 0)),
          quantity: parseFloat(String(item.quantity || 1)),
          description: String(item.description || ''),
          unitPrice: parseFloat(String(item.unitPrice || 0)),
          totalPrice: parseFloat(String(item.totalPrice || 0)),
          inventoryItemId: item.inventoryItemId ? parseInt(String(item.inventoryItemId)) : null,
          agPartNumber: item.agPartNumber || null,
        });
        if (!validation.success) {
          console.error('Line item validation error:', validation.error.format());
          return res.status(400).json({
            error: 'Invalid line item data',
            details: validation.error.format(),
          });
        }
      }
    }

    // Calculate total amount from line items
    const totalAmount = items.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0);

    // Calculate valid until date
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + parseInt(validityDays || '30'));

    let quoteId = id;
    let quoteNumber = rfqNumber;

    if (!quoteId) {
      // Create new quote
      if (!quoteNumber) {
        quoteNumber = await generateQuoteNumber();
      }

      const newQuote = await db
        .insert(quotes)
        .values({
          quoteNumber,
          customerId: customerId || '',
          customerName: customerCompany || customerName || '',
          description: `From: ${fromName} (${fromEmail})`,
          totalAmount,
          status: 'DRAFT',
          validUntil,
          quotedBy: fromName,
          notes,
        })
        .returning();

      quoteId = newQuote[0].id;
    } else {
      // Update existing quote
      await db
        .update(quotes)
        .set({
          customerName: customerCompany || customerName || '',
          description: `From: ${fromName} (${fromEmail})`,
          totalAmount,
          validUntil,
          quotedBy: fromName,
          notes,
          updatedAt: new Date(),
        })
        .where(eq(quotes.id, quoteId));

      // Delete existing line items
      await db
        .delete(quoteLineItems)
        .where(eq(quoteLineItems.quoteId, quoteId));
    }

    // Insert line items
    if (items.length > 0) {
      const lineItemsToInsert = items.map((item: any, index: number) => ({
        quoteId,
        lineNumber: index + 1,
        quantity: item.quantity || 1,
        description: item.description || '',
        unitPrice: item.unitPrice || 0,
        totalPrice: item.totalPrice || 0,
        inventoryItemId: item.inventoryItemId || null,
        agPartNumber: item.agPartNumber || null,
      }));

      await db.insert(quoteLineItems).values(lineItemsToInsert);
    }

    // Fetch the complete quote with line items
    const [savedQuote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId));

    const savedLineItems = await db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, quoteId))
      .orderBy(quoteLineItems.lineNumber);

    res.json({
      ...savedQuote,
      lineItems: savedLineItems,
    });
  } catch (error) {
    console.error('Save quote error:', error);
    res.status(500).json({ error: 'Failed to save quote' });
  }
});

// Submit quote (change status to SENT and send email)
router.post('/api/quotes/submit', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Quote ID is required' });
    }

    // Update quote status to SENT
    await db
      .update(quotes)
      .set({
        status: 'SENT',
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, id));

    // Fetch complete quote
    const [submittedQuote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, id));

    const submittedLineItems = await db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, id))
      .orderBy(quoteLineItems.lineNumber);

    // TODO: Send email notification to customer
    // This would integrate with SendGrid or your email service
    // For now, we'll just update the status

    res.json({
      ...submittedQuote,
      lineItems: submittedLineItems,
      message: 'Quote submitted successfully',
    });
  } catch (error) {
    console.error('Submit quote error:', error);
    res.status(500).json({ error: 'Failed to submit quote' });
  }
});

// Delete quote
router.delete('/api/quotes/:id', async (req: Request, res: Response) => {
  try {
    const quoteId = req.params.id;

    // Line items will be deleted automatically due to cascade
    await db.delete(quotes).where(eq(quotes.id, quoteId));

    res.json({ success: true, message: 'Quote deleted successfully' });
  } catch (error) {
    console.error('Delete quote error:', error);
    res.status(500).json({ error: 'Failed to delete quote' });
  }
});

// Quote PDF Attachments
const quoteAttachmentsDir = path.join(process.cwd(), 'uploads', 'quote-attachments');
if (!fs.existsSync(quoteAttachmentsDir)) {
  fs.mkdirSync(quoteAttachmentsDir, { recursive: true });
}

router.post('/api/quotes/:id/attachments', uploadMiddleware.array('files', 5), async (req: Request, res: Response) => {
  try {
    const quoteId = req.params.id;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Get the current quote
    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId));

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const uploadedFiles: string[] = [];

    for (const file of files) {
      // Only accept PDFs
      if (file.mimetype !== 'application/pdf') {
        fs.unlinkSync(file.path); // Delete non-PDF file
        continue;
      }

      // Move file to quote attachments directory
      const newFileName = `${Date.now()}_${file.filename}`;
      const newFilePath = path.join(quoteAttachmentsDir, newFileName);
      fs.renameSync(file.path, newFilePath);
      uploadedFiles.push(newFilePath);
    }

    // Update quote with new attachment paths
    const currentAttachments = quote.attachments || [];
    const updatedAttachments = [...currentAttachments, ...uploadedFiles];

    const [updatedQuote] = await db
      .update(quotes)
      .set({
        attachments: updatedAttachments,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quoteId))
      .returning();

    res.json({
      message: 'Files uploaded successfully',
      attachments: updatedAttachments,
      quote: updatedQuote,
    });
  } catch (error) {
    console.error('Upload quote attachment error:', error);
    res.status(500).json({ error: 'Failed to upload attachments' });
  }
});

router.delete('/api/quotes/:id/attachments/:fileName', async (req: Request, res: Response) => {
  try {
    const quoteId = req.params.id;
    const { fileName } = req.params;

    // Get the current quote
    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId));

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    // Remove the file from attachments array
    const currentAttachments = quote.attachments || [];
    const updatedAttachments = currentAttachments.filter(
      (filePath) => !filePath.includes(fileName)
    );

    // Delete the physical file
    const fileToDelete = currentAttachments.find((filePath) =>
      filePath.includes(fileName)
    );
    if (fileToDelete && fs.existsSync(fileToDelete)) {
      fs.unlinkSync(fileToDelete);
    }

    // Update quote
    const [updatedQuote] = await db
      .update(quotes)
      .set({
        attachments: updatedAttachments,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quoteId))
      .returning();

    res.json({
      message: 'Attachment deleted successfully',
      quote: updatedQuote,
    });
  } catch (error) {
    console.error('Delete quote attachment error:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

router.get('/api/quotes/:id/attachments/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;
    const filePath = path.join(quoteAttachmentsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Download quote attachment error:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

export default router;
