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

    let orderSignedDocId: string | null = null;
    if (orderId) {
      const [orderSignedDoc] = await db.insert(orderSignedDocuments).values({
        orderId,
        mediaId: newMedia.id,
        approvalType: approvalType || 'customer_approval',
        signedBy: signerName,
        signedAt: new Date(),
        notes: notes || null,
        createdById: user?.id || null,
        createdByName: user?.username || signerName,
      }).returning();
      orderSignedDocId = orderSignedDoc.id;
    }

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
