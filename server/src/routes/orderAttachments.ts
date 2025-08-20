import express from 'express';
import { storage } from '../../storage';
import { uploadMiddleware } from '../../utils/fileUpload';
import { insertOrderAttachmentSchema, type OrderAttachment } from '@shared/schema';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Create uploads directory for order attachments if it doesn't exist
const orderAttachmentsDir = path.join(process.cwd(), 'uploads', 'order-attachments');
if (!fs.existsSync(orderAttachmentsDir)) {
  fs.mkdirSync(orderAttachmentsDir, { recursive: true });
}

// GET /api/order-attachments/:orderId - Get all attachments for an order
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const attachments = await storage.getOrderAttachments(orderId);
    res.json(attachments);
  } catch (error) {
    console.error('Error fetching order attachments:', error);
    res.status(500).json({ error: 'Failed to fetch order attachments' });
  }
});

// POST /api/order-attachments/:orderId - Upload files for an order
router.post('/:orderId', uploadMiddleware.array('files', 10), async (req, res) => {
  try {
    const { orderId } = req.params;
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const attachments: OrderAttachment[] = [];

    for (const file of files) {
      // Move file to order attachments directory
      const newFileName = `${Date.now()}_${file.filename}`;
      const newFilePath = path.join(orderAttachmentsDir, newFileName);
      
      fs.renameSync(file.path, newFilePath);

      const attachmentData = {
        orderId,
        fileName: newFileName,
        originalFileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        filePath: newFilePath,
        uploadedBy: null, // Can be set when user authentication is implemented
        notes: req.body.notes || null,
      };

      const validatedData = insertOrderAttachmentSchema.parse(attachmentData);
      const attachment = await storage.createOrderAttachment(validatedData);
      attachments.push(attachment);
    }

    res.json(attachments);
  } catch (error) {
    console.error('Error uploading order attachments:', error);
    res.status(500).json({ error: 'Failed to upload attachments' });
  }
});

// DELETE /api/order-attachments/:attachmentId - Delete an attachment
router.delete('/:attachmentId', async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);
    
    // Get attachment info before deleting to remove file
    const attachment = await storage.getOrderAttachment(attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Delete file from filesystem
    if (fs.existsSync(attachment.filePath)) {
      fs.unlinkSync(attachment.filePath);
    }

    // Delete from database
    await storage.deleteOrderAttachment(attachmentId);
    
    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting order attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// GET /api/order-attachments/download/:attachmentId - Download an attachment
router.get('/download/:attachmentId', async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);
    const attachment = await storage.getOrderAttachment(attachmentId);
    const forceDownload = req.query.download === 'true';
    
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (!fs.existsSync(attachment.filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    if (forceDownload) {
      // Force download with attachment disposition
      res.download(attachment.filePath, attachment.originalFileName);
    } else {
      // Set headers for inline viewing (especially for PDFs)
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${attachment.originalFileName}"`);
      res.sendFile(path.resolve(attachment.filePath));
    }
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

export default router;