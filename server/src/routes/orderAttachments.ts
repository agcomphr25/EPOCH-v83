import express from 'express';
import fs from 'fs';
import path from 'path';
import { storage } from '../../storage';
import { insertOrderAttachmentSchema } from '@shared/schema';
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
  getStorageErrorResponse,
  isReplitObjectPath,
  isSupabaseObjectPath,
} from '../services/fileStorageProvider';

const router = express.Router();

function normalizeObjectPath(filePath: string | null | undefined) {
  return filePath?.startsWith('objects/') ? `/${filePath}` : filePath;
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

// POST /api/order-attachments/request-upload-url - Request an upload target from the configured storage provider.
router.post('/request-upload-url', async (req, res) => {
  try {
    const { name, size, contentType, orderId } = req.body;

    if (!name || !orderId) {
      return res.status(400).json({ error: 'Missing required fields: name, orderId' });
    }

    const storageProvider = getFileStorageProvider();
    console.log('[order-attachments/request-upload-url] Requesting upload target', {
      provider: storageProvider.name,
      orderId,
      name,
      size,
      contentType,
    });

    const uploadTarget = await storageProvider.createUploadTarget({
      fileName: name,
      contentType,
      scope: 'order-attachments',
      entityId: orderId,
    });

    console.log('[order-attachments/request-upload-url] Generated upload target', {
      provider: uploadTarget.provider,
      orderId,
      objectPath: uploadTarget.objectPath,
    });

    res.json({
      uploadURL: uploadTarget.uploadURL,
      objectPath: uploadTarget.objectPath,
      provider: uploadTarget.provider,
      metadata: { name, size, contentType, orderId },
    });
  } catch (error) {
    const { status, reason, message } = getStorageErrorResponse(error);
    console.error('[order-attachments/request-upload-url] Failed to generate upload URL:', {
      reason,
      message,
      status,
      provider: process.env.FILE_STORAGE_PROVIDER || 'replit',
    });
    res.status(status).json({
      error: 'Failed to generate upload URL',
      reason,
      details: message,
    });
  }
});

// POST /api/order-attachments/complete-upload - Complete upload and save to database
router.post('/complete-upload', async (req, res) => {
  try {
    const { objectPath, orderId, originalFileName, fileSize, mimeType, notes } = req.body;
    const user = (req as any).user;

    console.log('[order-attachments/complete-upload] Complete upload request received', {
      objectPath,
      orderId,
      originalFileName,
      hasUser: !!user,
    });

    if (!objectPath || !orderId || !originalFileName) {
      return res.status(400).json({
        error: 'Missing required fields: objectPath, orderId, originalFileName',
      });
    }

    try {
      await getFileStorageProviderForObjectPath(objectPath).setPublicReadPolicy(objectPath, user?.id?.toString() || 'system');
    } catch (aclError) {
      console.warn('[order-attachments/complete-upload] Failed to apply object ACL; continuing:', aclError);
    }

    const attachmentData = {
      orderId,
      fileName: objectPath.split('/').pop() || originalFileName,
      originalFileName,
      fileSize: fileSize || 0,
      mimeType: mimeType || 'application/octet-stream',
      filePath: objectPath,
      uploadedBy: user?.username || null,
      notes: notes || null,
    };

    try {
      const validatedData = insertOrderAttachmentSchema.parse(attachmentData);
      const attachment = await storage.createOrderAttachment(validatedData);
      res.json(attachment);
    } catch (dbError: any) {
      console.error('[order-attachments/complete-upload] Database error creating attachment:', dbError);
      res.status(500).json({
        error: `Database error: ${dbError.message || 'Failed to save attachment record'}`,
      });
    }
  } catch (error: any) {
    console.error('[order-attachments/complete-upload] Error completing upload:', error);
    res.status(500).json({
      error: error.message || 'Failed to complete upload',
    });
  }
});

// DELETE /api/order-attachments/:attachmentId - Delete an attachment
router.delete('/:attachmentId', async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);

    const attachment = await storage.getOrderAttachment(attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const normalizedPath = normalizeObjectPath(attachment.filePath);

    if (isSupabaseObjectPath(normalizedPath) || isReplitObjectPath(normalizedPath)) {
      try {
        await getFileStorageProviderForObjectPath(normalizedPath!).deleteObject(normalizedPath!);
        console.log('[order-attachments/delete] Deleted cloud file:', normalizedPath);
      } catch (deleteError) {
        console.warn('[order-attachments/delete] Failed to delete file from cloud storage:', deleteError);
      }
    } else if (attachment.filePath) {
      try {
        if (fs.existsSync(attachment.filePath)) {
          fs.unlinkSync(attachment.filePath);
          console.log('[order-attachments/delete] Deleted local file:', attachment.filePath);
        }
      } catch (localDeleteError) {
        console.warn('[order-attachments/delete] Failed to delete local file:', localDeleteError);
      }
    }

    await storage.deleteOrderAttachment(attachmentId);

    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting order attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// GET /api/order-attachments/download/:attachmentId - Download/view an attachment
router.get('/download/:attachmentId', async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);
    const attachment = await storage.getOrderAttachment(attachmentId);
    const forceDownload = req.query.download === 'true';

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const normalizedDownloadPath = normalizeObjectPath(attachment.filePath);

    if (isSupabaseObjectPath(normalizedDownloadPath) || isReplitObjectPath(normalizedDownloadPath)) {
      try {
        res.setHeader(
          'Content-Disposition',
          `${forceDownload ? 'attachment' : 'inline'}; filename="${attachment.originalFileName}"`
        );
        await getFileStorageProviderForObjectPath(normalizedDownloadPath!).downloadObject(normalizedDownloadPath!, res);
      } catch (cloudError) {
        console.error('[order-attachments/download] Error fetching from cloud storage:', cloudError);
        res.status(404).json({ error: 'File not found in cloud storage' });
      }
    } else if (attachment.filePath && fs.existsSync(attachment.filePath)) {
      if (forceDownload) {
        res.download(attachment.filePath, attachment.originalFileName);
      } else {
        res.setHeader('Content-Type', attachment.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${attachment.originalFileName}"`);
        res.sendFile(path.resolve(attachment.filePath));
      }
    } else {
      console.warn('[order-attachments/download] File not found:', attachment.filePath);
      res.status(404).json({
        error: 'File not available. It may have been stored locally and is not accessible in this environment.',
      });
    }
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

export default router;
