import express from 'express';
import { storage } from '../../storage';
import { uploadMiddleware } from '../../utils/fileUpload';
import {
  insertVendorPoAttachmentSchema,
  type VendorPoAttachment,
} from '@shared/schema';
import path from 'path';
import fs from 'fs';

const router = express.Router();

const vendorPoAttachmentsDir = path.join(
  process.cwd(),
  'uploads',
  'vendor-po-attachments'
);
if (!fs.existsSync(vendorPoAttachmentsDir)) {
  fs.mkdirSync(vendorPoAttachmentsDir, { recursive: true });
}

router.get('/download/:attachmentId', async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);
    if (isNaN(attachmentId)) {
      return res.status(400).json({ error: 'Invalid attachment ID' });
    }
    
    const attachment = await storage.getVendorPoAttachment(attachmentId);
    const forceDownload = req.query.download === 'true';

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (!fs.existsSync(attachment.filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    if (forceDownload) {
      res.download(attachment.filePath, attachment.originalFileName);
    } else {
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${attachment.originalFileName}"`
      );
      res.sendFile(path.resolve(attachment.filePath));
    }
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

router.get('/list/:vendorPoId', async (req, res) => {
  try {
    const vendorPoId = parseInt(req.params.vendorPoId);
    if (isNaN(vendorPoId)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }
    const attachments = await storage.getVendorPoAttachments(vendorPoId);
    const safeAttachments = attachments.map(att => ({
      id: att.id,
      vendorPoId: att.vendorPoId,
      fileName: att.fileName,
      originalFileName: att.originalFileName,
      fileSize: att.fileSize,
      mimeType: att.mimeType,
      uploadedBy: att.uploadedBy,
      notes: att.notes,
      createdAt: att.createdAt,
    }));
    res.json(safeAttachments);
  } catch (error) {
    console.error('Error fetching vendor PO attachments:', error);
    res.status(500).json({ error: 'Failed to fetch vendor PO attachments' });
  }
});

router.post(
  '/upload/:vendorPoId',
  uploadMiddleware.array('files', 10),
  async (req, res) => {
    try {
      const vendorPoId = parseInt(req.params.vendorPoId);
      if (isNaN(vendorPoId)) {
        return res.status(400).json({ error: 'Invalid vendor PO ID' });
      }
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const attachments: VendorPoAttachment[] = [];

      for (const file of files) {
        if (!fs.existsSync(vendorPoAttachmentsDir)) {
          fs.mkdirSync(vendorPoAttachmentsDir, { recursive: true });
        }

        const newFileName = `${Date.now()}_${file.filename}`;
        const newFilePath = path.join(vendorPoAttachmentsDir, newFileName);

        fs.renameSync(file.path, newFilePath);

        const attachmentData = {
          vendorPoId,
          fileName: newFileName,
          originalFileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          filePath: newFilePath,
          uploadedBy: null,
          notes: req.body.notes || null,
        };

        const validatedData = insertVendorPoAttachmentSchema.parse(attachmentData);
        const attachment = await storage.createVendorPoAttachment(validatedData);
        attachments.push(attachment);
      }

      const safeAttachments = attachments.map(att => ({
        id: att.id,
        vendorPoId: att.vendorPoId,
        fileName: att.fileName,
        originalFileName: att.originalFileName,
        fileSize: att.fileSize,
        mimeType: att.mimeType,
        uploadedBy: att.uploadedBy,
        notes: att.notes,
        createdAt: att.createdAt,
      }));
      res.json(safeAttachments);
    } catch (error) {
      console.error('Error uploading vendor PO attachments:', error);
      res.status(500).json({ error: 'Failed to upload attachments' });
    }
  }
);

router.delete('/delete/:attachmentId', async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);
    if (isNaN(attachmentId)) {
      return res.status(400).json({ error: 'Invalid attachment ID' });
    }
    
    const attachment = await storage.getVendorPoAttachment(attachmentId);
    
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (fs.existsSync(attachment.filePath)) {
      fs.unlinkSync(attachment.filePath);
    }

    await storage.deleteVendorPoAttachment(attachmentId);
    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting vendor PO attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

export default router;
