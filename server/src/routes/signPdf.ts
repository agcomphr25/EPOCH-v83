import { Router } from 'express';
import { db } from '../../db';
import { mediaLibrary, orderSignedDocuments } from '../../schema';
import { eq, desc } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { PDFDocument, rgb } from 'pdf-lib';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

const tempPdfStorage = new Map<string, { buffer: Buffer; originalname: string; uploadedAt: Date }>();

setInterval(() => {
  const now = new Date();
  for (const [key, value] of tempPdfStorage.entries()) {
    if (now.getTime() - value.uploadedAt.getTime() > 30 * 60 * 1000) {
      tempPdfStorage.delete(key);
    }
  }
}, 5 * 60 * 1000);

router.post('/upload-for-signing', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const tempId = randomUUID();
    tempPdfStorage.set(tempId, {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      uploadedAt: new Date(),
    });

    res.json({
      success: true,
      tempId,
      originalFilename: req.file.originalname,
      fileSize: req.file.size,
      message: 'PDF uploaded and ready for signing',
    });
  } catch (error: any) {
    console.error('Error uploading PDF for signing:', error);
    res.status(500).json({ error: error.message || 'Failed to upload PDF' });
  }
});

router.post('/apply-signature', async (req, res) => {
  try {
    const { tempId, signatureData, signerName, title, notes, category, position, orderId, approvalType } = req.body;

    if (!tempId) {
      return res.status(400).json({ error: 'tempId is required (from upload-for-signing endpoint)' });
    }

    const tempPdf = tempPdfStorage.get(tempId);
    if (!tempPdf) {
      return res.status(404).json({ error: 'PDF not found. It may have expired. Please upload again.' });
    }

    if (!signatureData) {
      return res.status(400).json({ error: 'Signature data is required' });
    }

    if (!signerName) {
      return res.status(400).json({ error: 'Signer name is required' });
    }

    const base64Match = signatureData.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
    if (!base64Match) {
      return res.status(400).json({ error: 'Invalid signature data format. Expected data:image/png;base64,...' });
    }

    const signatureBytes = Buffer.from(base64Match[2], 'base64');

    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpegMagic = Buffer.from([0xff, 0xd8, 0xff]);

    const isPng = signatureBytes.slice(0, 8).equals(pngMagic);
    const isJpeg = signatureBytes.slice(0, 3).equals(jpegMagic);

    if (!isPng && !isJpeg) {
      return res.status(400).json({
        error: 'Invalid image format. The signature must be a valid PNG or JPEG image.',
        debug: { header: signatureBytes.slice(0, 8).toString('hex') }
      });
    }

    const pdfDoc = await PDFDocument.load(tempPdf.buffer);

    let signatureImage;
    if (isPng) {
      signatureImage = await pdfDoc.embedPng(signatureBytes);
    } else {
      signatureImage = await pdfDoc.embedJpg(signatureBytes);
    }

    const pages = pdfDoc.getPages();
    const pageIndex = position?.page ?? pages.length - 1;
    const targetPage = pages[Math.min(pageIndex, pages.length - 1)];

    const sigWidth = position?.width ?? 150;
    const sigHeight = position?.height ?? 50;
    const margin = 50;
    const textHeight = 30;

    const x = position?.x ?? margin;
    const y = position?.y ?? margin + textHeight;

    targetPage.drawImage(signatureImage, {
      x,
      y,
      width: sigWidth,
      height: sigHeight,
    });

    const signedDate = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    targetPage.drawText(`Signed by: ${signerName}`, {
      x,
      y: y + sigHeight + 5,
      size: 10,
      color: rgb(0, 0, 0),
    });

    targetPage.drawText(`Date: ${signedDate}`, {
      x,
      y: y - 15,
      size: 9,
      color: rgb(0.3, 0.3, 0.3),
    });

    const signedPdfBytes = await pdfDoc.save();

    const uploadDir = path.join(process.cwd(), 'uploads', 'media-library');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const uniqueSuffix = `${Date.now()}-${randomUUID()}`;
    const originalName = tempPdf.originalname.replace('.pdf', '');
    const filename = `${originalName}-signed-${uniqueSuffix}.pdf`;
    const filePath = path.join(uploadDir, filename);

    fs.writeFileSync(filePath, signedPdfBytes);

    tempPdfStorage.delete(tempId);

    const user = (req as any).user;

    const tags = ['signed', 'signature'];
    if (orderId) {
      tags.push(`order:${orderId}`);
    }

    const [newMedia] = await db.insert(mediaLibrary).values({
      filename: `${originalName}-signed.pdf`,
      storagePath: `uploads/media-library/${filename}`,
      mimeType: 'application/pdf',
      fileSize: signedPdfBytes.length,
      capturedById: user?.id || null,
      capturedByName: user?.username || signerName,
      title: title || `${originalName} (Signed)`,
      notes: notes || `Signed by ${signerName} on ${signedDate}`,
      tags,
      category: category || 'signed-documents',
    }).returning();

    const [orderSignedDoc] = await db.insert(orderSignedDocuments).values({
      orderId: orderId || null,
      mediaId: newMedia.id,
      approvalType: approvalType || null,
      signedBy: signerName,
      signedAt: new Date(),
      notes: notes || null,
      createdById: user?.id || null,
      createdByName: user?.username || signerName,
    }).returning();
    const orderSignedDocId = orderSignedDoc.id;

    res.json({
      success: true,
      id: newMedia.id,
      storagePath: newMedia.storagePath,
      filename: newMedia.filename,
      title: newMedia.title,
      signedBy: signerName,
      signedAt: signedDate,
      orderId: orderId || null,
      orderSignedDocId,
    });
  } catch (error: any) {
    console.error('Error applying signature to PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to sign PDF document' });
  }
});

router.get('/by-order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const signedDocs = await db
      .select({
        id: orderSignedDocuments.id,
        orderId: orderSignedDocuments.orderId,
        approvalType: orderSignedDocuments.approvalType,
        signedBy: orderSignedDocuments.signedBy,
        signedAt: orderSignedDocuments.signedAt,
        notes: orderSignedDocuments.notes,
        createdByName: orderSignedDocuments.createdByName,
        media: {
          id: mediaLibrary.id,
          filename: mediaLibrary.filename,
          storagePath: mediaLibrary.storagePath,
          title: mediaLibrary.title,
          fileSize: mediaLibrary.fileSize,
        }
      })
      .from(orderSignedDocuments)
      .innerJoin(mediaLibrary, eq(orderSignedDocuments.mediaId, mediaLibrary.id))
      .where(eq(orderSignedDocuments.orderId, orderId))
      .orderBy(desc(orderSignedDocuments.signedAt));

    res.json(signedDocs);
  } catch (error: any) {
    console.error('Error fetching signed documents for order:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch signed documents' });
  }
});

router.get('/all', async (req, res) => {
  try {
    const { search, approvalType, startDate, endDate } = req.query;
    
    let query = db
      .select({
        id: orderSignedDocuments.id,
        orderId: orderSignedDocuments.orderId,
        approvalType: orderSignedDocuments.approvalType,
        signedBy: orderSignedDocuments.signedBy,
        signedAt: orderSignedDocuments.signedAt,
        notes: orderSignedDocuments.notes,
        createdByName: orderSignedDocuments.createdByName,
        media: {
          id: mediaLibrary.id,
          filename: mediaLibrary.filename,
          storagePath: mediaLibrary.storagePath,
          title: mediaLibrary.title,
          fileSize: mediaLibrary.fileSize,
        }
      })
      .from(orderSignedDocuments)
      .innerJoin(mediaLibrary, eq(orderSignedDocuments.mediaId, mediaLibrary.id))
      .orderBy(desc(orderSignedDocuments.signedAt));

    const results = await query;

    let filteredResults = results;
    
    if (search) {
      const searchLower = (search as string).toLowerCase();
      filteredResults = filteredResults.filter(doc => 
        doc.orderId.toLowerCase().includes(searchLower) ||
        doc.signedBy.toLowerCase().includes(searchLower) ||
        (doc.media.title && doc.media.title.toLowerCase().includes(searchLower))
      );
    }
    
    if (approvalType && approvalType !== 'all') {
      filteredResults = filteredResults.filter(doc => doc.approvalType === approvalType);
    }

    res.json(filteredResults);
  } catch (error: any) {
    console.error('Error fetching all signed documents:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch signed documents' });
  }
});

// DELETE /api/documents/:id - Delete a signed document
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the document first to find the associated media
    const [doc] = await db
      .select({
        id: orderSignedDocuments.id,
        mediaId: orderSignedDocuments.mediaId,
      })
      .from(orderSignedDocuments)
      .where(eq(orderSignedDocuments.id, id));
    
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Delete the signed document record
    await db.delete(orderSignedDocuments).where(eq(orderSignedDocuments.id, id));
    
    // Only delete the media if no other signed documents reference it
    if (doc.mediaId) {
      const otherReferences = await db
        .select({ id: orderSignedDocuments.id })
        .from(orderSignedDocuments)
        .where(eq(orderSignedDocuments.mediaId, doc.mediaId));
      
      // Only delete media if no other documents reference it
      if (otherReferences.length === 0) {
        const [media] = await db
          .select({ storagePath: mediaLibrary.storagePath })
          .from(mediaLibrary)
          .where(eq(mediaLibrary.id, doc.mediaId));
        
        if (media?.storagePath) {
          const filePath = path.join(process.cwd(), media.storagePath);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
        
        await db.delete(mediaLibrary).where(eq(mediaLibrary.id, doc.mediaId));
      }
    }
    
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting signed document:', error);
    res.status(500).json({ error: error.message || 'Failed to delete document' });
  }
});

// PATCH /api/documents/:id - Update a signed document
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, signedBy, approvalType } = req.body;
    
    // Get the document first
    const [doc] = await db
      .select()
      .from(orderSignedDocuments)
      .where(eq(orderSignedDocuments.id, id));
    
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Update the document
    const updateData: Record<string, any> = {};
    if (notes !== undefined) updateData.notes = notes;
    if (signedBy !== undefined) updateData.signedBy = signedBy;
    if (approvalType !== undefined) updateData.approvalType = approvalType;
    
    if (Object.keys(updateData).length > 0) {
      await db
        .update(orderSignedDocuments)
        .set(updateData)
        .where(eq(orderSignedDocuments.id, id));
    }
    
    // Return updated document
    const [updated] = await db
      .select({
        id: orderSignedDocuments.id,
        orderId: orderSignedDocuments.orderId,
        approvalType: orderSignedDocuments.approvalType,
        signedBy: orderSignedDocuments.signedBy,
        signedAt: orderSignedDocuments.signedAt,
        notes: orderSignedDocuments.notes,
        createdByName: orderSignedDocuments.createdByName,
        media: {
          id: mediaLibrary.id,
          filename: mediaLibrary.filename,
          storagePath: mediaLibrary.storagePath,
          title: mediaLibrary.title,
          fileSize: mediaLibrary.fileSize,
        }
      })
      .from(orderSignedDocuments)
      .innerJoin(mediaLibrary, eq(orderSignedDocuments.mediaId, mediaLibrary.id))
      .where(eq(orderSignedDocuments.id, id));
    
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating signed document:', error);
    res.status(500).json({ error: error.message || 'Failed to update document' });
  }
});

// Route for signing a PDF and emailing it
router.post('/sign-and-email', async (req, res) => {
  try {
    const { 
      tempId, 
      signatureData, 
      typedSignature,
      signerName, 
      recipientEmail 
    } = req.body;

    if (!tempId) {
      return res.status(400).json({ error: 'tempId is required' });
    }

    const tempPdf = tempPdfStorage.get(tempId);
    if (!tempPdf) {
      return res.status(404).json({ error: 'PDF not found. It may have expired. Please upload again.' });
    }

    if (!signatureData && !typedSignature) {
      return res.status(400).json({ error: 'Signature (drawn or typed) is required' });
    }

    if (!signerName) {
      return res.status(400).json({ error: 'Printed name is required' });
    }

    if (!recipientEmail) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    const pdfDoc = await PDFDocument.load(tempPdf.buffer);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();

    const signedDate = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const margin = 50;
    const sigBlockHeight = 100;
    const yPosition = margin;

    // Draw signature block background line
    lastPage.drawLine({
      start: { x: margin, y: yPosition + sigBlockHeight },
      end: { x: width - margin, y: yPosition + sigBlockHeight },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });

    // If we have a drawn signature
    if (signatureData) {
      const base64Match = signatureData.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
      if (base64Match) {
        const signatureBytes = Buffer.from(base64Match[2], 'base64');
        const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const isPng = signatureBytes.slice(0, 8).equals(pngMagic);

        let signatureImage;
        if (isPng) {
          signatureImage = await pdfDoc.embedPng(signatureBytes);
        } else {
          signatureImage = await pdfDoc.embedJpg(signatureBytes);
        }

        // Draw signature image
        lastPage.drawImage(signatureImage, {
          x: margin,
          y: yPosition + 40,
          width: 150,
          height: 50,
        });
      }
    } else if (typedSignature) {
      // Draw typed signature in an italic style
      lastPage.drawText(typedSignature, {
        x: margin,
        y: yPosition + 55,
        size: 24,
        color: rgb(0, 0, 0.4),
      });
    }

    // Draw "Printed Name:" label and value
    lastPage.drawText('Printed Name:', {
      x: margin,
      y: yPosition + 25,
      size: 10,
      color: rgb(0.3, 0.3, 0.3),
    });

    lastPage.drawText(signerName, {
      x: margin + 80,
      y: yPosition + 25,
      size: 12,
      color: rgb(0, 0, 0),
    });

    // Draw "Date:" label and value
    lastPage.drawText('Date:', {
      x: margin,
      y: yPosition + 8,
      size: 10,
      color: rgb(0.3, 0.3, 0.3),
    });

    lastPage.drawText(signedDate, {
      x: margin + 35,
      y: yPosition + 8,
      size: 10,
      color: rgb(0, 0, 0),
    });

    const signedPdfBytes = await pdfDoc.save();

    // Clean up temp storage
    tempPdfStorage.delete(tempId);

    // Send email with attachment
    const { sendEmailViaSendGrid } = await import('../../utils/sendgrid');
    
    const emailResult = await sendEmailViaSendGrid({
      to: recipientEmail,
      subject: `Signed Document: ${tempPdf.originalname}`,
      text: `Please find attached the signed document "${tempPdf.originalname}".\n\nSigned by: ${signerName}\nDate: ${signedDate}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Signed Document</h2>
          <p>Please find attached the signed document "<strong>${tempPdf.originalname}</strong>".</p>
          <p><strong>Signed by:</strong> ${signerName}<br/>
          <strong>Date:</strong> ${signedDate}</p>
        </div>
      `,
      attachments: [{
        content: Buffer.from(signedPdfBytes).toString('base64'),
        filename: `${tempPdf.originalname.replace('.pdf', '')}-signed.pdf`,
        type: 'application/pdf',
        disposition: 'attachment',
      }],
    });

    if (!emailResult.success) {
      console.error('Failed to send email:', emailResult.error);
      return res.status(500).json({ error: 'Failed to send email. Please try again.' });
    }

    res.json({
      success: true,
      message: 'Document signed and emailed successfully',
      signedBy: signerName,
      signedAt: signedDate,
      emailSentTo: recipientEmail,
    });
  } catch (error: any) {
    console.error('Error signing and emailing PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to sign and email PDF' });
  }
});

router.post('/sign-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const { signatureData, signerName, title, notes, category } = req.body;

    if (!signatureData) {
      return res.status(400).json({ error: 'Signature data is required' });
    }

    if (!signerName) {
      return res.status(400).json({ error: 'Signer name is required' });
    }

    const base64Match = signatureData.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
    if (!base64Match) {
      return res.status(400).json({ 
        error: 'Invalid signature data format. Expected data:image/png;base64,...',
        received: signatureData.substring(0, 100)
      });
    }

    const signatureBytes = Buffer.from(base64Match[2], 'base64');

    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpegMagic = Buffer.from([0xff, 0xd8, 0xff]);

    const isPng = signatureBytes.slice(0, 8).equals(pngMagic);
    const isJpeg = signatureBytes.slice(0, 3).equals(jpegMagic);

    if (!isPng && !isJpeg) {
      return res.status(400).json({
        error: 'Invalid image format. The signature must be a valid PNG or JPEG image.',
        debug: { header: signatureBytes.slice(0, 8).toString('hex') }
      });
    }

    const pdfDoc = await PDFDocument.load(req.file.buffer);

    let signatureImage;
    if (isPng) {
      signatureImage = await pdfDoc.embedPng(signatureBytes);
    } else {
      signatureImage = await pdfDoc.embedJpg(signatureBytes);
    }

    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];

    const sigWidth = 150;
    const sigHeight = 50;
    const margin = 50;
    const textHeight = 30;

    lastPage.drawImage(signatureImage, {
      x: margin,
      y: margin + textHeight,
      width: sigWidth,
      height: sigHeight,
    });

    const signedDate = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    lastPage.drawText(`Signed by: ${signerName}`, {
      x: margin,
      y: margin + textHeight + sigHeight + 5,
      size: 10,
      color: rgb(0, 0, 0),
    });

    lastPage.drawText(`Date: ${signedDate}`, {
      x: margin,
      y: margin + 10,
      size: 9,
      color: rgb(0.3, 0.3, 0.3),
    });

    const signedPdfBytes = await pdfDoc.save();

    const uploadDir = path.join(process.cwd(), 'uploads', 'media-library');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const uniqueSuffix = `${Date.now()}-${randomUUID()}`;
    const originalName = req.file.originalname.replace('.pdf', '');
    const filename = `${originalName}-signed-${uniqueSuffix}.pdf`;
    const filePath = path.join(uploadDir, filename);

    fs.writeFileSync(filePath, signedPdfBytes);

    const user = (req as any).user;

    const [newMedia] = await db.insert(mediaLibrary).values({
      filename: `${originalName}-signed.pdf`,
      storagePath: `uploads/media-library/${filename}`,
      mimeType: 'application/pdf',
      fileSize: signedPdfBytes.length,
      capturedById: user?.id || null,
      capturedByName: user?.username || signerName,
      title: title || `${originalName} (Signed)`,
      notes: notes || `Signed by ${signerName} on ${signedDate}`,
      tags: ['signed', 'signature'],
      category: category || 'signed-documents',
    }).returning();

    res.json({
      success: true,
      id: newMedia.id,
      storagePath: newMedia.storagePath,
      filename: newMedia.filename,
      title: newMedia.title,
      signedBy: signerName,
      signedAt: signedDate,
    });
  } catch (error: any) {
    console.error('Error signing PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to sign PDF document' });
  }
});

export default router;
