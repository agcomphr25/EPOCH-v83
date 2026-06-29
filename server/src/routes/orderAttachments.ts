import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
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
const localOrderAttachmentsDir = path.join(process.cwd(), 'uploads', 'order-attachments');

if (!fs.existsSync(localOrderAttachmentsDir)) {
  fs.mkdirSync(localOrderAttachmentsDir, { recursive: true });
}

const localOrderAttachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, localOrderAttachmentsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeBase = path
        .basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 90);
      cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}_${safeBase}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'text/plain',
    ]);

    if (allowedTypes.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error('Unsupported file type. Upload PDF, Word, Excel, image, or text files.'));
  },
});

function normalizeObjectPath(filePath: string | null | undefined) {
  return filePath?.startsWith('objects/') ? `/${filePath}` : filePath;
}

function contentDisposition(disposition: 'inline' | 'attachment', filename: string) {
  return `${disposition}; filename="${filename.replace(/["\r\n]/g, '_')}"`;
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

// POST /api/order-attachments/local-upload - Fallback for environments where object URL signing is unavailable.
router.post('/local-upload', localOrderAttachmentUpload.array('files', 10), async (req, res) => {
  const files = (req.files ?? []) as Express.Multer.File[];
  try {
    const { orderId, notes } = req.body;
    const user = (req as any).user;

    if (!orderId) {
      return res.status(400).json({ error: 'Missing required field: orderId' });
    }
    if (!files.length) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const attachments = [];
    for (const file of files) {
      const attachmentData = {
        orderId,
        fileName: file.filename,
        originalFileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype || 'application/octet-stream',
        filePath: file.path,
        uploadedBy: user?.username || null,
        notes: notes || null,
      };

      const validatedData = insertOrderAttachmentSchema.parse(attachmentData);
      const attachment = await storage.createOrderAttachment(validatedData);
      attachments.push(attachment);
    }

    console.warn('[order-attachments/local-upload] Used local upload fallback', {
      orderId,
      fileCount: attachments.length,
      reason: 'object_storage_signing_unavailable',
    });

    res.status(201).json({ attachments, fallback: 'local' });
  } catch (error) {
    for (const file of files) {
      const resolvedPath = path.resolve(file.path);
      if (resolvedPath.startsWith(path.resolve(localOrderAttachmentsDir)) && fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
      }
    }
    console.error('[order-attachments/local-upload] Failed:', error);
    res.status(500).json({ error: 'Failed to upload attachments through local fallback' });
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
        await getFileStorageProviderForObjectPath(normalizedDownloadPath!).downloadObject(normalizedDownloadPath!, res, {
          contentType: attachment.mimeType,
          contentDisposition: contentDisposition(forceDownload ? 'attachment' : 'inline', attachment.originalFileName),
        });
      } catch (cloudError) {
        console.error('[order-attachments/download] Error fetching from cloud storage:', cloudError);
        res.status(404).json({ error: 'File not found in cloud storage' });
      }
    } else if (attachment.filePath && fs.existsSync(attachment.filePath)) {
      if (forceDownload) {
        res.download(attachment.filePath, attachment.originalFileName);
      } else {
        res.setHeader('Content-Type', attachment.mimeType);
        res.setHeader('Content-Disposition', contentDisposition('inline', attachment.originalFileName));
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
